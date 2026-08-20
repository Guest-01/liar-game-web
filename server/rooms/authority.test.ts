/**
 * 서버 권위 검증 (체크리스트 F7 / F4).
 *
 * v1 최대 결함의 정면 대응 테스트다. v1은 호스트 브라우저가 타임아웃을 서버에
 * 알려주는 구조여서, 호스트가 탭을 백그라운드로 두면 게임 전체가 멈췄다.
 */
import { ColyseusTestServer, boot } from "@colyseus/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "colyseus";
import { LiarRoom } from "./LiarRoom.js";

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  colyseus = await boot({
    initializeGameServer: (gs: Server) => { gs.define("liar", LiarRoom); },
  } as any);
});
afterAll(async () => { await colyseus.shutdown(); });
beforeEach(async () => { await colyseus.cleanup(); });

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function startedRoom() {
  const room: any = await colyseus.createRoom("liar", {
    nickname: "p1", roomName: "권위", isPublic: true,
  });
  const clients = [];
  for (let i = 1; i <= 4; i++) clients.push(await colyseus.connectTo(room, { nickname: `p${i}` }));
  clients[0]!.send("start-match", {});
  await room.waitForNextPatch();
  await room.waitForNextPatch();
  for (const c of clients) c.send("check-word", {});
  await room.waitForNextPatch();
  await room.waitForNextPatch();
  return { room, clients };
}

describe("서버 권위 (F7)", () => {
  it("설명 제한시간이 지나면 서버가 스스로 자동 제출하고 진행한다", async () => {
    const { room } = await startedRoom();
    room.state.descriptionTime = 1;                  // 1초로 줄인다
    room.enterPhase("description");                   // 새 시간으로 다시 건다
    expect(room.state.phase).toBe("description");

    await wait(1400);                                 // 아무 클라이언트도 아무것도 보내지 않는다
    // 서버가 자동 제출 → description-reveal → 다음 차례
    expect(room.state.currentDescriberIndex).toBeGreaterThan(0);
    const firstId = room.state.descriptionOrder[0];
    expect(room.state.players.get(firstId).description).toBe("...");
  });

  it("토론 제한시간이 지나면 서버가 스스로 집계하고 전이한다", async () => {
    const { room } = await startedRoom();
    room.state.discussionTime = 1;
    room.state.descriptionAttempts = 1;
    room.startDiscussion();
    expect(room.state.phase).toBe("discussion");

    await wait(1400);
    // 무투표 → 설명 재시작 (기회가 남아 있으므로)
    expect(room.state.phase).toBe("description");
    expect(room.state.descriptionAttempts).toBe(2);
  });

  it("★ 모든 클라이언트가 사라져도 서버는 페이즈를 계속 진행한다", async () => {
    const { room, clients } = await startedRoom();
    room.state.descriptionTime = 1;
    room.enterPhase("description");

    // 전원 강제 종료 — v1이라면 여기서 게임이 영원히 멈췄다
    for (const c of clients) await c.leave(false);
    await wait(1500);

    // 방은 아직 살아 있고, 타이머는 서버가 소유하므로 전이가 일어났다
    expect(room.state.phase).not.toBe("description");
  });

  it("호스트가 나가도 진행이 멈추지 않는다", async () => {
    const { room, clients } = await startedRoom();
    await clients[0]!.leave();                        // 호스트 이탈 → 3명 → 라운드 무효
    await room.waitForNextPatch();
    await room.waitForNextPatch();
    expect(room.state.phase).toBe("round-result");

    // 남은 사람 중 새 호스트가 있고, 그가 대기실로 되돌릴 수 있다
    const hosts = [...room.state.players.values()].filter((p: any) => p.isHost);
    expect(hosts).toHaveLength(1);
  });
});

describe("라운드 종료 보장 (F4)", () => {
  it("최악의 시퀀스에서도 라운드가 유한 단계 안에 끝난다", async () => {
    const { room } = await startedRoom();
    room.state.descriptionAttempts = 1;
    room.startDiscussion();

    // 아무도 지목하지 않는 상황을 반복해서 강제한다
    let guard = 0;
    while (room.state.phase !== "round-result" && guard++ < 20) {
      if (room.state.phase === "discussion") room.closeDiscussion();
      else if (room.state.phase === "description") room.startDiscussion();
      else break;
    }
    expect(room.state.phase).toBe("round-result");
    expect(room.state.roundEndReason).toBe("chances-exhausted");
    expect(guard).toBeLessThan(10);
  });
});
