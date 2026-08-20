import { Client, type Room } from "@colyseus/sdk";
import type { RoomSnapshot } from "../../shared/snapshot.js";
import type { MessageType } from "../../shared/protocol.js";
import { saveReconnectToken } from "./session.js";

/**
 * Colyseus 상태를 Svelte 반응성에 연결한다.
 *
 * 어댑터가 한 줄인 이유: `state.toJSON()`이 StateView를 존중하는 평범한 객체를
 * 반환하고, 10인 기준 비용이 평균 0.0092ms(60fps 예산의 0.055%)로 무시 가능하다.
 * 세밀한 Schema 콜백을 쓰지 않는다. (docs/spikes/colyseus/FINDINGS.md §9-A)
 */
const endpoint = import.meta.env.DEV
  ? `ws://${location.hostname}:5173`
  : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;

export const client = new Client(endpoint);

export const game = $state<{
  room: Room | null;
  snapshot: RoomSnapshot | null;
  mySessionId: string;
  error: string;
  connecting: boolean;
  /** 페이즈 남은 시간(ms). 서버가 준 상대 시간을 수신 시각 기준으로 센다. */
  remainingMs: number;
}>({
  room: null, snapshot: null, mySessionId: "", error: "", connecting: false, remainingMs: 0,
});

let ticker: ReturnType<typeof setInterval> | null = null;

function attach(room: Room): void {
  game.room = room;
  game.mySessionId = room.sessionId;
  game.error = "";
  game.connecting = false;
  saveReconnectToken(room.roomId, (room as unknown as { reconnectionToken: string }).reconnectionToken);

  room.onStateChange((state: unknown) => {
    game.snapshot = (state as { toJSON(): RoomSnapshot }).toJSON();
    startCountdown();
  });

  room.onError((_code: number, message?: string) => { game.error = message ?? "오류가 발생했습니다"; });
  room.onLeave(() => { stopCountdown(); game.room = null; });
}

/**
 * 서버는 절대 시각이 아니라 상대 시간(remainingMs)을 보낸다. 클라이언트는
 * 수신 시각을 기준으로 카운트다운하므로 시계 오차의 영향을 받지 않는다.
 * (체크리스트 D6)
 */
function startCountdown(): void {
  const snap = game.snapshot;
  stopCountdown();
  if (!snap || snap.phaseEndsAt <= 0) { game.remainingMs = 0; return; }

  const receivedAt = Date.now();
  const base = snap.phaseRemainingMs > 0 ? snap.phaseRemainingMs : snap.phaseEndsAt;
  game.remainingMs = base;

  ticker = setInterval(() => {
    if (game.snapshot?.isPaused) return;              // 일시정지 중에는 멈춘다 (M2)
    game.remainingMs = Math.max(0, base - (Date.now() - receivedAt));
    if (game.remainingMs === 0) stopCountdown();
  }, 200);
}

function stopCountdown(): void {
  if (ticker) { clearInterval(ticker); ticker = null; }
}

export async function createRoom(opts: {
  nickname: string; roomName: string; isPublic: boolean; password?: string;
}): Promise<string> {
  game.connecting = true;
  try {
    const room = await client.create("liar", opts);
    attach(room);
    return room.roomId;
  } catch (e) {
    game.connecting = false;
    game.error = (e as Error).message || "방을 만들 수 없습니다";
    throw e;
  }
}

export async function joinRoom(roomId: string, nickname: string, password?: string): Promise<void> {
  game.connecting = true;
  try {
    attach(await client.joinById(roomId, { nickname, password }));
  } catch (e) {
    game.connecting = false;
    game.error = (e as Error).message || "방에 들어갈 수 없습니다";
    throw e;
  }
}

export function send<T extends MessageType>(type: T, payload: unknown = {}): void {
  game.room?.send(type, payload);
}

export async function leave(): Promise<void> {
  stopCountdown();
  await game.room?.leave();
  game.room = null;
  game.snapshot = null;
}

// ── 파생 헬퍼 ────────────────────────────────────────
export const me = () => game.snapshot?.players[game.mySessionId] ?? null;
export const isHost = () => me()?.isHost ?? false;
export const playerList = () =>
  Object.values(game.snapshot?.players ?? {}).filter((p) => !p.isSpectator);
export const nicknameOf = (id: string) => game.snapshot?.players[id]?.nickname ?? "알 수 없음";
