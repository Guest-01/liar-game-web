import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";

import { LiarRoom } from "./rooms/LiarRoom.js";
import { initFeedback, isFeedbackEnabled, submitFeedback, sweepCooldowns } from "./feedback.js";
import { findRoom, listLobbyRooms } from "./lobby.js";
import { createShellRenderer } from "./shell.js";
import { logger } from "./logger.js";
import { categoryNames } from "../shared/rules.js";

const PORT = Number(process.env.PORT ?? 2567);
const BASE_URL = process.env.BASE_URL ?? "https://liar-game.guest-01.dev";
const IS_PROD = process.env.NODE_ENV === "production";

const here = dirname(fileURLToPath(import.meta.url));
// dist/server/index.js 기준으로 dist/public을 가리킨다
const PUBLIC_DIR = join(here, "..", "public");

/**
 * 시작 로그에 찍을 버전. 운영에서 "지금 무엇이 떠 있는가"를 로그 한 줄로 확인한다 (v1과 같다).
 * 개발(server/index.ts)과 빌드(dist/server/index.js)의 깊이가 달라 두 곳을 본다.
 * 이미지에는 package.json이 /app에 복사되어 있다 (Dockerfile).
 */
function readVersion(): string {
  for (const p of [join(here, "..", "package.json"), join(here, "..", "..", "package.json")]) {
    try {
      const pkg = JSON.parse(readFileSync(p, "utf-8")) as { name?: string; version?: string };
      if (pkg.name === "liar-game-web" && pkg.version) return pkg.version;
    } catch { /* 다음 후보 */ }
  }
  return "unknown";
}
const VERSION = readVersion();

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "16kb" }));

// ── API ──────────────────────────────────────────────
app.get("/api/config", (_req, res) => {
  res.json({ feedbackEnabled: isFeedbackEnabled() });
});

app.get("/api/categories", (_req, res) => {
  res.json({ categories: categoryNames() });
});

app.post("/api/feedback", async (req, res) => {
  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
  const result = await submitFeedback(req.body, ip);
  if (result.ok) res.json({ success: true });
  else res.status(result.status).json({ error: result.error });
});

app.get("/api/rooms", async (_req, res) => {
  res.json({ rooms: await listLobbyRooms() });
});

/**
 * 방 하나의 요약 — 초대 링크로 들어온 사람의 입장 화면이 쓴다.
 * 비공개 방인지 알아야 참가 **전에** 비밀번호를 물을 수 있다. 로비 목록과 같은
 * 정보만 준다 (비밀번호·참가자 정보 없음).
 */
app.get("/api/rooms/:id", async (req, res) => {
  const room = await findRoom(req.params.id);
  if (room) res.json({ room });
  else res.status(404).json({ error: "방을 찾을 수 없습니다" });
});

// ── 정적 파일 + SPA 셸 ───────────────────────────────
if (IS_PROD) {
  const renderShell = createShellRenderer(join(PUBLIC_DIR, "index.html"), BASE_URL);
  app.use(express.static(PUBLIC_DIR, { index: false, maxAge: "1h" }));
  app.get(/^\/(?!api|matchmake).*/, async (req, res) => {
    // 초대 링크 미리보기에 방 이름을 싣는다. 방이 없으면 일반 방 문구로 둔다.
    const roomId = /^\/room\/([^/]+)$/.exec(req.path)?.[1];
    const room = roomId ? await findRoom(roomId).catch(() => null) : null;
    res.type("html").send(renderShell(req.path, { roomName: room?.name }));
  });
}

// ── Colyseus ─────────────────────────────────────────
const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});
gameServer.define("liar", LiarRoom);

// ⚠️ setTransport()가 Server.listen() 안에서 실행된다. httpServer를 직접
//    listen하면 매치메이킹이 죽는다. (체크리스트 G3)
try {
  await initFeedback();
setInterval(sweepCooldowns, 10 * 60 * 1000).unref();

await gameServer.listen(PORT);
} catch (err) {
  if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
    // 여기서 다음 포트로 넘어가지 않는다. 개발에서는 scripts/dev.mjs가 미리
    // 빈 포트를 정해 Vite 프록시와 값을 맞추고, 프로덕션에서는 포트가 컨테이너
    // 포트 매핑과 묶여 있어 임의로 바뀌면 외부에서 닿지 못한다.
    logger.error(`포트 ${PORT}이 이미 사용 중입니다. PORT 환경변수로 바꾸세요.`);
    process.exit(1);
  }
  throw err;
}
logger.info({ port: PORT, prod: IS_PROD }, `🎮 라이어 게임 v${VERSION} 서버 http://localhost:${PORT}`);

const shutdown = async () => {
  logger.info("🛑 서버를 종료합니다");
  await gameServer.gracefullyShutdown();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
