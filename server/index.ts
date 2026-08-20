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

const PORT = Number(process.env.PORT ?? 3000);
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

app.get("/api/rooms", async (_req, res) => {
  const rooms = await matchMaker.query({ name: "liar" });
  const list: LobbyRoom[] = rooms
    .filter((r) => r.clients > 0)
    .map((r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      return {
        roomId: r.roomId,
        name: String(meta.name ?? "방"),
        isPublic: meta.isPublic !== false,
        playerCount: r.clients,
        maxPlayers: r.maxClients,
        gameMode: (meta.gameMode as LobbyRoom["gameMode"]) ?? "normal",
        category: String(meta.category ?? "랜덤"),
        inProgress: Boolean(meta.inProgress),
        canSpectate: false,   // M3
      };
    })
    .filter((r) => !r.inProgress && r.playerCount < r.maxPlayers);
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
await gameServer.listen(PORT);
logger.info({ port: PORT, prod: IS_PROD }, `🎮 라이어 게임 v2 서버 http://localhost:${PORT}`);

const shutdown = async () => {
  logger.info("🛑 서버를 종료합니다");
  await gameServer.gracefullyShutdown();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
