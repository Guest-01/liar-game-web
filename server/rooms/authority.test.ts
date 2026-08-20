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

/** 유예를 1초로 줄인 테스트용 방 */
class FastGraceRoom extends LiarRoom {
  protected override graceSeconds = 1;
  protected override fxScale = 0;   // 연출 대기 없이 테스트한다
}

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  colyseus = await boot({
    initializeGameServer: (gs: Server) => { gs.define("liar", FastGraceRoom); },
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

  it("★ 아무도 아무 메시지를 보내지 않아도 서버가 라운드를 끝까지 끌고 간다", async () => {
    // F7의 본질은 "끊김을 무시한다"가 아니라 "전이 결정권이 서버에 있다"이다.
    // 전원 연결은 유지하되 어떤 클라이언트도 입력을 보내지 않는 상황을 만든다.
    const { room } = await startedRoom();
    room.state.descriptionTime = 1;
    room.state.discussionTime = 1;
    room.enterPhase("description");

    // 서버 혼자 다음을 전부 수행한다:
    //   설명 4명분 자동 제출 → 토론 → 무투표 → 설명 재시작(2회차)
    //   → 토론 2회차 → 무투표 → 기회 소진 → 라운드 종료
    await wait(14_000);
    expect(room.state.phase).toBe("round-result");
    expect(room.state.roundEndReason).toBe("chances-exhausted");
    expect(room.state.roundWinner).toBe("liar");
  }, 30_000);

  it("전원이 끊기면 일시정지하고, 유예가 지나면 서버가 스스로 정리한다 (M2)", async () => {
    // M2 도입으로 "전원 끊김"은 즉시 진행이 아니라 일시정지가 맞다.
    const { room, clients } = await startedRoom();
    room.state.descriptionTime = 1;
    room.enterPhase("description");

    for (const c of clients) await c.leave(false);   // 비정상 끊김
    await wait(300);
    expect(room.state.isPaused, "재접속을 기다리며 정지한다").toBe(true);
    expect(room.state.phase, "정지 중에는 전이하지 않는다").toBe("description");

    // 유예 만료 — 클라이언트 개입 없이 서버가 스스로 정리한다
    await wait(1800);
    expect(room.state.players.size).toBe(0);
  }, 15_000);

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

    // 아무도 지목하지 않는 상황을 반복해서 강제한다.
    // 연출 페이즈(order-reveal 등)는 fxScale=0이라도 다음 틱에 넘어가므로 기다린다.
    let guard = 0;
    while (room.state.phase !== "round-result" && guard++ < 20) {
      if (room.state.phase === "discussion") room.closeDiscussion();
      else if (room.state.phase === "description") room.startDiscussion();
      await wait(30);
    }
    expect(room.state.phase).toBe("round-result");
    expect(room.state.roundEndReason).toBe("chances-exhausted");
    expect(guard).toBeLessThan(15);
  });
});
