import pino from "pino";

const isProd = process.env.NODE_ENV === "production";

/**
 * 운영 로그도 사람이 읽는 한 줄 형식이다 — v1과 같은 모양으로 `docker logs`에서 바로 읽는다.
 *
 *   [2026-09-27 18:20:00] INFO: 입장 {"roomId":"xxMr3aYws","nickname":"행복한기린"}
 *
 * v1과 다른 점 하나: 구조화 필드를 숨기지 않고(hideObject 없음) 같은 줄 끝에 붙인다.
 * v2는 roomId 같은 문맥을 메시지 문자열이 아니라 필드로 남기므로, 숨기면 "입장"만 남는다.
 * 그래서 pino-pretty는 운영 의존성이다 (package.json dependencies).
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),
  transport: {
    target: "pino-pretty",
    options: isProd
      ? {
          colorize: true,
          translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
          ignore: "pid,hostname",
          singleLine: true,
        }
      : { translateTime: "HH:MM:ss" },
  },
});
