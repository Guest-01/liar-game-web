/**
 * 이탈이 페이즈를 멈추거나 결과를 뒤집지 않는다.
 *
 * "전원 완료" 조건은 메시지가 올 때만 평가된다. 마지막 미완료자가 나가면
 * 남은 전원은 이미 완료했는데 아무 메시지도 오지 않는다. 타이머가 있는 페이즈는
 * 만료로 복구되지만 제시어 확인은 무기한이라 영원히 멈췄다 (2026-09-06 발견).
 */
import { ColyseusTestServer, boot } from "@colyseus/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "colyseus";
import { LiarRoom } from "./LiarRoom.js";
import { startMatch, until } from "../testing/wait.js";

class FastRoom extends LiarRoom {
  protected override graceSeconds = 1;
  protected override fxScale = 0;
}
/** 개표 연출을 남겨 둔 방. vote-reveal 도중 이탈을 시험하려면 그 페이즈에 머물러야 한다. */
class SlowRevealRoom extends LiarRoom {
  protected override graceSeconds = 1;
  protected override fxScale = 0.1;   // vote-reveal = 500ms (+ 라이어 공개 700ms)
}

let colyseus: ColyseusTestServer;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  colyseus = await boot({
    initializeGameServer: (gs: Server) => {
      gs.define("liar", FastRoom);
      gs.define("liar-slow", SlowRevealRoom);
    },
  } as any);
});
afterAll(async () => { await colyseus.shutdown(); });
beforeEach(async () => { await colyseus.cleanup(); });

async function roomN(n: number, name = "liar") {
  const room: any = await colyseus.createRoom(name, { nickname: "p1", roomName: "이탈", isPublic: true });
  const clients: any[] = [];
  for (let i = 1; i <= n; i++) clients.push(await colyseus.connectTo(room, { nickname: `p${i}` }));
  return { room, clients };
}
async function inRound(n = 5, name = "liar") {
  const r = await roomN(n, name);
  await startMatch(r.room, r.clients[0]!);
  return r;
}
const byId = (room: any, id: string) => room.state.players.get(id);

/**
 * 나갈 사람을 고른다 — **라이어가 아니어야 한다.** 라이어는 매 라운드 무작위라
 * 고정 인덱스(clients[4])를 내보내면 약 20%로 라이어가 나가고, 그러면 라이어 이탈
 * 규칙(D2: 제시어 확인 중이면 라운드 재시작, 피고 확정 뒤면 시민 승)이 먼저 적용돼
 * 여기서 보려는 "재평가"에 닿지 않는다 (2026-09-27 v2.0.0 태그 CI에서 번갈아 실패).
 * 라이어 이탈은 아래 "라이어 이탈" 테스트들이 따로 다룬다.
 */
const nonLiarLeaver = (room: any, clients: any[], exclude: any[] = []) =>
  [...clients].reverse().find((c) => c.sessionId !== room.secret.liarId && !exclude.includes(c))!;

describe("이탈 뒤 페이즈 재평가", () => {
  it("★ 제시어 확인: 마지막 미확인자가 나가면 남은 전원 기준으로 진행한다", async () => {
    const { room, clients } = await inRound(5);
    const leaver = nonLiarLeaver(room, clients);
    const stay = clients.filter((c) => c !== leaver);
    for (const c of stay) c.send("check-word", {});
    await until(() => stay.every((c) => byId(room, c.sessionId).hasCheckedWord), "4명 확인");
    expect(room.state.phase).toBe("word-check");

    await leaver.leave();               // 정상 퇴장 → 즉시 이탈 확정
    await until(() => room.state.players.size === 4, "이탈 확정");
    expect(room.state.phase).not.toBe("word-check");
    expect(["order-reveal", "description"]).toContain(room.state.phase);
  });

  it("최종 투표: 마지막 미투표자가 나가면 개표한다", async () => {
    const { room, clients } = await inRound(5);
    const defendant = clients[1]!;
    room.state.defendantId = defendant.sessionId;
    room.enterPhase("final-vote");
    // 피고와 나갈 사람을 뺀 나머지 셋이 투표한다
    const leaver = nonLiarLeaver(room, clients, [defendant]);
    const voters = clients.filter((c) => c !== defendant && c !== leaver);
    for (const c of voters) c.send("final-vote", { agree: true });
    await until(() => voters.every((c) => byId(room, c.sessionId).hasFinalVoted), "3명 투표");
    expect(room.state.phase).toBe("final-vote");

    await leaver.leave();
    await until(() => room.state.phase !== "final-vote", "개표");
    expect(room.state.agreeCount).toBe(3);
  });

  it("토론: 마지막 미지목자가 나가면 조기 종료 예약이 걸린다", async () => {
    const { room, clients } = await inRound(5);
    room.state.descriptionAttempts = 1;
    room.startDiscussion();
    const leaver = nonLiarLeaver(room, clients);
    const stay = clients.filter((c) => c !== leaver);
    // 셋은 stay[1]을, stay[1]은 stay[0]을 지목한다 (자기 자신은 지목할 수 없다)
    for (const c of stay) c.send("nominate", { targetId: (c === stay[1] ? stay[0] : stay[1]).sessionId });
    await until(() => stay.every((c) => byId(room, c.sessionId).nominatedId !== ""), "4명 지목");
    const before = room.timer.remainingMs();
    expect(before).toBeGreaterThan(10_000);

    await leaver.leave();
    await until(() => room.state.players.size === 4, "이탈 확정");
    expect(room.state.phase).toBe("discussion");
    expect(room.timer.remainingMs()).toBeLessThanOrEqual(5_000);
  });
});

describe("호스트 이양", () => {
  it("★ 유예 중인 사람을 건너뛰고 접속 중인 사람에게 넘긴다", async () => {
    const { room, clients } = await inRound(5);
    await clients[1]!.leave(false);     // p2 비정상 끊김 → 유예
    await wait(200);
    expect(byId(room, clients[1]!.sessionId).isConnected).toBe(false);

    await clients[0]!.leave();          // 호스트 정상 퇴장
    await wait(200);
    const host = [...room.state.players.values()].find((p: any) => p.isHost);
    expect(host).toBeDefined();
    expect(host.isConnected).toBe(true);
    expect(host.id).not.toBe(clients[1]!.sessionId);
  });
});

describe("지목 대상", () => {
  it("★ 관전자는 지목할 수 없다", async () => {
    const { room, clients } = await inRound(4);
    const spec: any = await colyseus.connectTo(room, { nickname: "spec" });
    expect(byId(room, spec.sessionId).isSpectator).toBe(true);
    room.state.descriptionAttempts = 1;
    room.startDiscussion();

    clients[0]!.send("nominate", { targetId: spec.sessionId });
    await wait(200);
    expect(byId(room, clients[0]!.sessionId).nominatedId).toBe("");
  });
});

describe("확정된 결과는 이탈로 뒤집히지 않는다", () => {
  it("★ 처형이 확정된 시민 피고가 개표 중에 나가도 라이어 승이 유지된다", async () => {
    const { room, clients } = await inRound(5, "liar-slow");
    const liarId: string = room.secret.liarId;
    const citizen = clients.find((c) => c.sessionId !== liarId)!;
    room.state.defendantId = citizen.sessionId;
    room.enterPhase("final-vote");
    for (const c of clients) if (c.sessionId !== citizen.sessionId) c.send("final-vote", { agree: true });
    await wait(200);
    expect(room.state.phase).toBe("vote-reveal");
    expect(room.state.executionConfirmed).toBe(true);

    await citizen.leave();
    await wait(200);
    expect(room.state.phase).toBe("round-result");
    expect(room.state.roundWinner).toBe("liar");
    expect(room.state.roundEndReason).toBe("citizen-executed");
  });
});

describe("유예 중 강퇴", () => {
  it("대기실에서 끊긴 사람을 호스트가 강퇴하면 즉시 이탈 확정된다", async () => {
    const { room, clients } = await roomN(4);
    const sid = clients[3]!.sessionId;
    await clients[3]!.leave(false);
    await wait(200);
    expect(byId(room, sid).isConnected).toBe(false);

    clients[0]!.send("kick", { targetId: sid });
    await wait(200);
    expect(room.state.players.has(sid)).toBe(false);
    expect(room.state.isPaused).toBe(false);
  });
});
