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
import Room from "./routes/Room.svelte";

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

  /**
   * 회귀: 방을 만들면 Create.svelte가 이미 연결을 맺어둔 상태에서
   * `/room/:id` 로 이동하고, Room.svelte의 $effect가 joinRoom을 부른다.
   * 가드가 없으면 방금 저장한 토큰으로 **자기 자신에게 재접속**해 버려서
   * 서버가 기존 소켓을 끊고("접속이 끊겼습니다") 새로 붙인다("돌아왔습니다").
   *
   * Playwright 스모크가 실제로 잡아낸 결함이다. 컴포넌트를 개별 마운트하는
   * 테스트로는 화면 전환이 없어 재현되지 않는다.
   */
  it("★ 방을 만든 직후 같은 방으로 재진입해도 재접속이 일어나지 않는다", async () => {
    await leave();
    const roomId = await createRoom({
      nickname: "회귀", roomName: "회귀방", isPublic: true,
    });
    await wait(400);
    const sid = game.mySessionId;
    const chatBefore = game.snapshot!.chat.length;

    // Room.svelte의 $effect가 하는 일 그대로
    await joinRoom(roomId, "회귀");
    await wait(400);

    expect(game.mySessionId, "세션이 유지된다").toBe(sid);
    expect(
      game.snapshot!.chat.length,
      "끊김/복귀 시스템 메시지가 생기지 않는다",
    ).toBe(chatBefore);
  });

  /**
   * 회귀: 위 가드를 `game.room`(= $state)으로 읽으면 Room.svelte의 $effect가
   * 그것을 의존성으로 추적한다. attach()가 값을 쓰는 순간 effect가 무효화되고
   * cleanup의 leave()가 돌아 join → leave → join 이 무한히 반복된다.
   * 화면이 계속 재생성되어 입력이 먹지 않는다.
   *
   * 그래서 진짜 화면을 마운트해서 본다. 개별 컴포넌트만 렌더하면 $effect가
   * 없어서 재현되지 않는다.
   */
  it("★ 방 화면을 띄워도 join↔leave 루프에 빠지지 않는다", async () => {
    await leave();

    // **남이 만든 방에 들어가는** 경로여야 한다. 내가 만든 방이면 가드가 즉시
    // 참이라 game.room이 바뀌지 않아 루프가 재현되지 않는다.
    const { Client } = await import("@colyseus/sdk");
    const owner = await new Client(`ws://localhost:${PORT}`)
      .create("liar", { nickname: "주인", roomName: "루프방", isPublic: true });

    localStorage.setItem("nickname", "루프");
    const host = document.createElement("div");
    document.body.appendChild(host);
    const app = mount(Room, { target: host, props: { roomId: owner.roomId } });
    flushSync();
    await wait(1500);          // 루프가 있다면 이 사이에 몇 번이고 돈다

    expect(game.room, "연결이 유지된다").not.toBeNull();
    // 루프가 돌면 입장/퇴장 시스템 메시지가 계속 쌓인다 (정상은 주인 + 나 = 2줄)
    expect(
      game.snapshot!.chat.length,
      "재입장이 반복되지 않는다",
    ).toBeLessThanOrEqual(2);

    unmount(app);
    host.remove();
    await owner.leave();
  });
});
