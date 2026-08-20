import { z } from "zod";
import { logger } from "./logger.js";

/**
 * 인앱 피드백 → Discord 웹훅.
 *
 * v1에서 잘 동작하던 패턴을 그대로 가져왔다:
 * **부팅 시 웹훅을 검증해서 기능 자체를 켜고 끈다.** 죽은 웹훅으로 사용자에게
 * "보냈습니다"라고 거짓말하지 않기 위해서다.
 */
export const FeedbackBody = z.object({
  sentiment: z.enum(["good", "neutral", "bad"]),
  message: z.string().max(500).optional(),
  roomId: z.string().max(64).optional(),
  nickname: z.string().max(20).optional(),
});

const COOLDOWN_MS = 60_000;
const cooldowns = new Map<string, number>();

let enabled = false;
export const isFeedbackEnabled = () => enabled;

/** 부팅 시 1회. 웹훅이 살아있을 때만 기능을 켠다. */
export async function initFeedback(): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) {
    logger.info("💤 피드백 비활성 (DISCORD_WEBHOOK_URL 미설정)");
    return;
  }
  try {
    const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(5_000) });
    if (res.status === 404 || res.status === 401) {
      logger.error(`❌ 웹훅이 유효하지 않습니다 (HTTP ${res.status}). 피드백을 비활성화합니다.`);
      return;
    }
    if (res.ok) {
      const info = (await res.json()) as { name?: string };
      logger.info(`✉️  피드백 활성 — "${info.name ?? "(이름 없음)"}"으로 전송`);
    } else {
      logger.warn(`⚠️ 웹훅 조회 실패 (HTTP ${res.status}). 기능은 켜두지만 전송이 실패할 수 있습니다.`);
    }
    enabled = true;
  } catch (err) {
    logger.warn({ err }, "⚠️ 웹훅 확인 실패. 기능은 켜두지만 전송이 실패할 수 있습니다.");
    enabled = true;
  }
}

const EMOJI = { good: "😊", neutral: "😐", bad: "😞" } as const;

export type FeedbackResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

export async function submitFeedback(body: unknown, ip: string): Promise<FeedbackResult> {
  if (!enabled) return { ok: false, status: 404, error: "피드백 기능이 꺼져 있습니다." };

  const parsed = FeedbackBody.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, error: "유효하지 않은 피드백입니다." };

  const last = cooldowns.get(ip);
  if (last && Date.now() - last < COOLDOWN_MS) {
    return { ok: false, status: 429, error: "잠시 후 다시 시도해주세요." };
  }
  cooldowns.set(ip, Date.now());

  const { sentiment, message, roomId, nickname } = parsed.data;
  // 검증은 저장 시, 이스케이프는 렌더 시. Discord는 마크다운을 해석하므로
  // 여기서는 백틱만 막아 코드블록 탈출을 방지한다.
  const safe = (s: string) => s.replace(/`/g, "'");
  let content = `[${EMOJI[sentiment]}][방: ${roomId ? safe(roomId) : "로비"}]`;
  if (nickname) content += `[닉네임: ${safe(nickname)}]`;
  if (message) content += ` ${safe(message)}`;

  try {
    await fetch(process.env.DISCORD_WEBHOOK_URL!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    logger.warn({ err }, "웹훅 전송 실패");
    return { ok: false, status: 502, error: "전송에 실패했습니다." };
  }

  logger.info({ sentiment, roomId }, "피드백 제출");
  return { ok: true };
}

/** 오래된 쿨다운 기록 정리 */
export function sweepCooldowns(): void {
  const now = Date.now();
  for (const [ip, at] of cooldowns) if (now - at > COOLDOWN_MS * 2) cooldowns.delete(ip);
}
