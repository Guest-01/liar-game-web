/**
 * M5 — 연출 페이즈.
 *
 * 연출은 부가가 아니라 기능이지만(REQUIREMENTS §F9), **게임 규칙을 바꾸면 안 된다.**
 * 특히 개표 연출을 위해 추가한 필드가 정보 은닉을 깨지 않는지 확인한다.
 */
import { ColyseusTestServer, boot } from "@colyseus/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "colyseus";
import { LiarRoom } from "./LiarRoom.js";
import { LIAR_REVEAL_MS, ORDER_REVEAL_MS, VOTE_REVEAL_MS } from "../../shared/constants.js";

let colyseus: ColyseusTestServer;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  colyseus = await boot({
    initializeGameServer: (gs: Server) => { gs.define("liar", LiarRoom); },
  } as any);
});
afterAll(async () => { await colyseus.shutdown(); });
beforeEach(async () => { await colyseus.cleanup(); });

async function inRound(n = 4) {
  const room: any = await colyseus.createRoom("liar", {
    nickname: "p1", roomName: "연출", isPublic: true,
  });
  const clients = [];
  for (let i = 1; i <= n; i++) clients.push(await colyseus.connectTo(room, { nickname: `p${i}` }));
  clients[0]!.send("start-match", {});
  await room.waitForNextPatch(); await room.waitForNextPatch();
  return { room, clients };
}

describe("순서 추첨 페이즈", () => {
  it("제시어 확인 후 설명이 아니라 order-reveal로 간다", async () => {
    const { room, clients } = await inRound();
    for (const c of clients) c.send("check-word", {});
    await room.waitForNextPatch(); await room.waitForNextPatch();
    expect(room.state.phase).toBe("order-reveal");
  });

  it("★ 추첨 시간은 설명 제한시간에서 떼어내지 않는다", async () => {
    // 첫 설명자가 연출 때문에 손해를 보면 안 된다.
    const { room, clients } = await inRound();
    room.state.descriptionTime = 30;
    for (const c of clients) c.send("check-word", {});
    await room.waitForNextPatch(); await room.waitForNextPatch();

    await wait(ORDER_REVEAL_MS + 400);
    expect(room.state.phase).toBe("description");
    // 설명 타이머가 이제 막 시작했어야 한다
    expect(room.timer.remainingMs()).toBeGreaterThan(29_000);
  }, 15_000);
});

describe("개표 연출 길이", () => {
  async function toVoteReveal(confirmed: boolean) {
    const { room, clients } = await inRound();
    for (const c of clients) c.send("check-word", {});
    await wait(300);
    room.state.defendantId = clients[3]!.sessionId;
    room.enterPhase("final-vote");
    await room.waitForNextPatch();

    // 확정: 3명 중 2명 찬성 / 미확정: 1명만 찬성
    const voters = clients.filter((c) => c.sessionId !== clients[3]!.sessionId);
    voters[0]!.send("final-vote", { agree: true });
    voters[1]!.send("final-vote", { agree: confirmed });
    voters[2]!.send("final-vote", { agree: false });
    await wait(400);
    return { room, clients };
  }

  it("처형이 확정되면 라이어 공개만큼 더 길다", async () => {
    const { room } = await toVoteReveal(true);
    expect(room.state.phase).toBe("vote-reveal");
    expect(room.state.executionConfirmed).toBe(true);
    expect(room.timer.remainingMs()).toBeGreaterThan(VOTE_REVEAL_MS);
    expect(room.timer.remainingMs()).toBeLessThanOrEqual(VOTE_REVEAL_MS + LIAR_REVEAL_MS);
  });

  it("과반 미달이면 카운트다운만큼만이다", async () => {
    const { room } = await toVoteReveal(false);
    expect(room.state.phase).toBe("vote-reveal");
    expect(room.state.executionConfirmed).toBe(false);
    expect(room.timer.remainingMs()).toBeLessThanOrEqual(VOTE_REVEAL_MS);
  });

  it("★ 과반 미달이면 defendantWasLiar가 절대 채워지지 않는다", async () => {
    // 라운드가 계속되므로 여기서 라이어 여부가 새면 게임이 죽는다.
    const { room, clients } = await inRound();
    for (const c of clients) c.send("check-word", {});
    await wait(300);

    // 피고를 실제 라이어로 지정하고, 투표는 미달시킨다
    room.state.defendantId = room.secret.liarId;
    room.enterPhase("final-vote");
    await room.waitForNextPatch();
    const voters = clients.filter((c) => c.sessionId !== room.secret.liarId);
    voters[0]!.send("final-vote", { agree: true });
    voters[1]!.send("final-vote", { agree: false });
    voters[2]!.send("final-vote", { agree: false });
    await wait(400);

    expect(room.state.executionConfirmed).toBe(false);
    expect(room.state.defendantWasLiar, "피고가 라이어여도 미확정이면 감춘다").toBe(false);
    expect(room.state.revealedLiarId).toBe("");
  });

  it("처형이 확정되면 라이어 여부를 공개한다 (연출에 필요)", async () => {
    const { room, clients } = await inRound();
    for (const c of clients) c.send("check-word", {});
    await wait(300);
    room.state.defendantId = room.secret.liarId;
    room.enterPhase("final-vote");
    await room.waitForNextPatch();
    for (const c of clients.filter((x) => x.sessionId !== room.secret.liarId)) {
      c.send("final-vote", { agree: true });
    }
    await wait(400);
    expect(room.state.executionConfirmed).toBe(true);
    expect(room.state.defendantWasLiar).toBe(true);
  });
});

describe("연출은 규칙을 바꾸지 않는다", () => {
  it("설명 타이핑 뒤에도 다음 차례로 정확히 넘어간다", async () => {
    const { room, clients } = await inRound();
    for (const c of clients) c.send("check-word", {});
    await wait(ORDER_REVEAL_MS + 400);
    expect(room.state.phase).toBe("description");
    expect(room.state.currentDescriberIndex).toBe(0);

    const id = room.state.descriptionOrder[0];
    clients.find((c) => c.sessionId === id)!.send("submit-description", { text: "첫설명" });
    await wait(200);
    expect(room.state.phase, "타이핑 연출 중").toBe("description-reveal");
    expect(room.state.currentDescriberIndex, "연출 중에는 아직 넘어가지 않는다").toBe(0);

    await wait(3600);
    expect(room.state.phase).toBe("description");
    expect(room.state.currentDescriberIndex).toBe(1);
  }, 20_000);
});
