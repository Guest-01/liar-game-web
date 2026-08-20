/**
 * 1.5계층 — happy-dom + **실제 Colyseus 서버**.
 *
 * 브라우저 없이 클라이언트 연결 계층(connection.svelte.ts)과 Svelte 반응성이
 * 진짜 WebSocket 위에서 동작하는지 본다. Node 22에 전역 WebSocket이 있어
 * SDK가 그대로 붙는다.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import { createServer } from "node:http";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { LiarRoom } from "../server/rooms/LiarRoom.js";
import { createRoom, game, joinRoom, leave, setEndpoint } from "./lib/connection.svelte.js";
import PlayerList from "./game/PlayerList.svelte";

const PORT = 2599;
let gameServer: Server;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  const httpServer = createServer();
  gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  gameServer.define("liar", LiarRoom);
  await gameServer.listen(PORT);
  setEndpoint(`ws://localhost:${PORT}`);
});
afterAll(async () => { await leave().catch(() => {}); await gameServer.gracefullyShutdown(false); });

function render(C: any) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const app = mount(C, { target: host });
  flushSync();
  return { host, app, html: () => { flushSync(); return host.innerHTML; }, stop: () => { unmount(app); host.remove(); } };
}

describe("실 서버 + Svelte 반응성", () => {
  it("방을 만들면 스냅샷이 채워지고 화면에 반영된다", async () => {
    const roomId = await createRoom({
      nickname: "앨리스", roomName: "통합", isPublic: true,
    });
    expect(roomId).toMatch(/^[A-Za-z0-9_-]+$/);
    await wait(400);

    expect(game.snapshot).not.toBeNull();
    expect(game.snapshot!.name).toBe("통합");
    expect(game.mySessionId).toBeTruthy();

    const view = render(PlayerList);
    expect(view.html()).toContain("앨리스");
    view.stop();
  });

  it("★ 다른 참가자가 들어오면 화면이 스스로 갱신된다", async () => {
    const view = render(PlayerList);
    expect(view.html()).not.toContain("보라매");

    // 두 번째 참가자를 서버에 직접 붙인다 (다른 탭을 흉내낸다)
    const { Client } = await import("@colyseus/sdk");
    const other = await new Client(`ws://localhost:${PORT}`)
      .joinById(game.room!.roomId, { nickname: "보라매" });
    await wait(500);

    // Colyseus 패치 → toJSON 스냅샷 → Svelte $state → DOM 까지 이어진다
    expect(view.html()).toContain("보라매");
    await other.leave();
    view.stop();
  });

  it("서버가 거부하면 오류가 상태에 담긴다", async () => {
    await expect(joinRoom("NOPE_NOT_A_ROOM", "누군가")).rejects.toThrow();
    expect(game.error).toBeTruthy();
  });
});
