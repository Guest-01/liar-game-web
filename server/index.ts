import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";

import { LiarRoom } from "./rooms/LiarRoom.js";
import { createShellRenderer } from "./shell.js";
import { logger } from "./logger.js";
import { categoryNames } from "../shared/rules.js";
import type { LobbyRoom } from "../shared/snapshot.js";

const PORT = Number(process.env.PORT ?? 2567);
const BASE_URL = process.env.BASE_URL ?? "https://liar-game.guest-01.dev";
const IS_PROD = process.env.NODE_ENV === "production";

const here = dirname(fileURLToPath(import.meta.url));
// dist/server/index.js 기준으로 dist/public을 가리킨다
const PUBLIC_DIR = join(here, "..", "public");

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "16kb" }));

// ── API ──────────────────────────────────────────────
app.get("/api/categories", (_req, res) => {
  res.json({ categories: categoryNames() });
});

/**
 * 로비 방 목록.
 *
 * 게임 중인 방도 노출한다 — 관전 진입 경로가 있어야 하기 때문이다 (D12).
 * 자리가 없는 방과 빈 방만 감춘다.
 */
app.get("/api/rooms", async (_req, res) => {
  const rooms = await matchMaker.query({ name: "liar" });
  const list: LobbyRoom[] = rooms
    .map((r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const maxPlayers = Number(meta.maxPlayers ?? r.maxClients);
      const occupancy = Number(meta.occupancy ?? r.clients);
      const inProgress = Boolean(meta.inProgress);
      const hasRoom = occupancy < maxPlayers;
      return {
        roomId: r.roomId,
        name: String(meta.name ?? "방"),
        isPublic: meta.isPublic !== false,
        playerCount: occupancy,
        maxPlayers,
        gameMode: (meta.gameMode as LobbyRoom["gameMode"]) ?? "normal",
        category: String(meta.category ?? "랜덤"),
        inProgress,
        // 관전 자리 = 최대 인원 − 현재 인원 (D11)
        canSpectate: inProgress && hasRoom,
      };
    })
    .filter((r) => r.playerCount > 0 && (r.canSpectate || (!r.inProgress && r.playerCount < r.maxPlayers)))
    // 참가 가능한 방을 위로
    .sort((a, b) => Number(a.inProgress) - Number(b.inProgress));
  res.json({ rooms: list });
});

// ── 정적 파일 + SPA 셸 ───────────────────────────────
if (IS_PROD) {
  const renderShell = createShellRenderer(join(PUBLIC_DIR, "index.html"), BASE_URL);
  app.use(express.static(PUBLIC_DIR, { index: false, maxAge: "1h" }));
  app.get(/^\/(?!api|matchmake).*/, (req, res) => {
    res.type("html").send(renderShell(req.path));
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
logger.info({ port: PORT, prod: IS_PROD }, `🎮 라이어 게임 v2 서버 http://localhost:${PORT}`);

const shutdown = async () => {
  logger.info("🛑 서버를 종료합니다");
  await gameServer.gracefullyShutdown();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
