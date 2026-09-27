import { ColyseusTestServer, boot } from "@colyseus/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "colyseus";
import { LiarRoom } from "./LiarRoom.js";

/** 연출 대기 없이 규칙만 검증하기 위한 테스트용 방 */
class NoFxRoom extends LiarRoom {
  protected override fxScale = 0;
}
import { REDO_TARGET } from "../../shared/constants.js";

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  colyseus = await boot({
    initializeGameServer: (gs: Server) => { gs.define("liar", NoFxRoom); },
  } as any);
});
afterAll(async () => { await colyseus.shutdown(); });
beforeEach(async () => { await colyseus.cleanup(); });

async function makeRoom(n = 4) {
  const room = await colyseus.createRoom("liar", {
    nickname: "p1", roomName: "방", isPublic: true,
  });
  const clients = [];
  for (let i = 1; i <= n; i++) {
    clients.push(await colyseus.connectTo(room, { nickname: `p${i}` }));
  }
  return { room, clients, s: () => (room as any).state };
}

const tick = async (room: any, times = 2) => {
  for (let i = 0; i < times; i++) await room.waitForNextPatch();
};

describe("대기실", () => {
  it("첫 입장자가 호스트가 된다", async () => {
    const { s, clients } = await makeRoom(4);
    expect(s().players.get(clients[0]!.sessionId).isHost).toBe(true);
    expect(s().players.get(clients[1]!.sessionId).isHost).toBe(false);
  });

  it("4명 미만이면 시작되지 않는다 (D7)", async () => {
    const { room, clients, s } = await makeRoom(3);
    clients[0]!.send("start-match", {});
    await tick(room);
    expect(s().phase).toBe("waiting");
  });

  it("4명이면 시작된다", async () => {
    const { room, clients, s } = await makeRoom(4);
    clients[0]!.send("start-match", {});
    await tick(room);
    expect(s().phase).toBe("word-check");
  });

  it("호스트가 아니면 시작할 수 없다", async () => {
    const { room, clients, s } = await makeRoom(4);
    clients[1]!.send("start-match", {});
    await tick(room);
    expect(s().phase).toBe("waiting");
  });

  it("닉네임이 중복되면 입장이 거부된다", async () => {
    const { room } = await makeRoom(4);
    await expect(colyseus.connectTo(room, { nickname: "p1" })).rejects.toThrow();
  });

  it("호스트가 나가면 다음 사람이 호스트가 된다", async () => {
    const { room, clients, s } = await makeRoom(4);
    await clients[0]!.leave();
    await tick(room);
    expect(s().players.get(clients[1]!.sessionId).isHost).toBe(true);
  });

  it("게임 중 입장은 관전자로 처리된다 (M3)", async () => {
    const { room, clients, s } = await makeRoom(4);
    s().maxPlayers = 6;                       // 관전 자리를 만든다
    clients[0]!.send("start-match", {});
    await tick(room);
    const late = await colyseus.connectTo(room, { nickname: "늦은사람" });
    await tick(room);
    expect(s().players.get(late.sessionId).isSpectator).toBe(true);
  });

  it("정원이 꽉 차면 게임 중 입장이 거부된다", async () => {
    const { room, clients, s } = await makeRoom(4);
    s().maxPlayers = 4;
    clients[0]!.send("start-match", {});
    await tick(room);
    await expect(colyseus.connectTo(room, { nickname: "늦은사람" })).rejects.toThrow();
  });
});

describe("라운드 흐름", () => {
  async function started(mode: "normal" | "fool" = "normal") {
    const r = await makeRoom(4);
    (r.room as any).state.gameMode = mode;
    r.clients[0]!.send("start-match", {});
    await tick(r.room);
    return r;
  }

  it("전원이 확인해야 설명 단계로 넘어간다", async () => {
    const { room, clients, s } = await started();
    for (const c of clients.slice(0, 3)) { c.send("check-word", {}); await tick(room, 1); }
    expect(s().phase).toBe("word-check");
    clients[3]!.send("check-word", {});
    await tick(room);
    expect(s().phase).toBe("description");
  });

  async function toDiscussion(r: Awaited<ReturnType<typeof started>>) {
    for (const c of r.clients) { c.send("check-word", {}); }
    await tick(r.room);
    // 순서대로 설명 제출
    for (let i = 0; i < 4; i++) {
      const id = r.s().descriptionOrder[r.s().currentDescriberIndex];
      const c = r.clients.find((x) => x.sessionId === id)!;
      c.send("submit-description", { text: `설명${i}` });
      await tick(r.room, 3);
    }
    return r;
  }

  it("전원 설명 후 토론으로 간다", async () => {
    const r = await toDiscussion(await started());
    expect(r.s().phase).toBe("discussion");
    expect(r.s().discussionAttempts).toBe(1);
    for (const c of r.clients) {
      expect(r.s().players.get(c.sessionId).description).not.toBe("");
    }
  });

  it("자기 차례가 아니면 설명이 무시된다", async () => {
    const r = await started();
    for (const c of r.clients) c.send("check-word", {});
    await tick(r.room);
    const currentId = r.s().descriptionOrder[r.s().currentDescriberIndex];
    const other = r.clients.find((c) => c.sessionId !== currentId)!;
    other.send("submit-description", { text: "끼어들기" });
    await tick(r.room);
    expect(r.s().players.get(other.sessionId).description).toBe("");
  });

  it("단독 최다 지목 → 변론 → 투표 → 결과까지 완주한다", async () => {
    const r = await toDiscussion(await started());
    const [c1, c2, c3, c4] = r.clients;
    // c4를 3명이 지목
    c1!.send("nominate", { targetId: c4!.sessionId });
    c2!.send("nominate", { targetId: c4!.sessionId });
    c3!.send("nominate", { targetId: c4!.sessionId });
    c4!.send("nominate", { targetId: c1!.sessionId });
    await tick(r.room, 3);

    (r.room as any).closeDiscussion();
    await tick(r.room);
    expect(r.s().phase).toBe("defense");
    expect(r.s().defendantId).toBe(c4!.sessionId);

    c4!.send("end-defense", {});
    await tick(r.room);
    expect(r.s().phase).toBe("final-vote");

    c1!.send("final-vote", { agree: true });
    c2!.send("final-vote", { agree: true });
    c3!.send("final-vote", { agree: true });
    await tick(r.room, 4);

    // 처형 확정 → 피고가 라이어면 liar-guess, 아니면 결과
    expect(["liar-guess", "round-result"]).toContain(r.s().phase);
  });

  it("피고는 최종 투표를 할 수 없다", async () => {
    const r = await toDiscussion(await started());
    const [c1, , , c4] = r.clients;
    (r.room as any).state.defendantId = c4!.sessionId;
    (r.room as any).enterPhase("final-vote");
    await tick(r.room);
    c4!.send("final-vote", { agree: false });
    await tick(r.room);
    expect(r.s().players.get(c4!.sessionId).hasFinalVoted).toBe(false);
    void c1;
  });

  it("자기 자신은 지목할 수 없다", async () => {
    const r = await toDiscussion(await started());
    const c1 = r.clients[0]!;
    c1.send("nominate", { targetId: c1.sessionId });
    await tick(r.room);
    expect(r.s().players.get(c1.sessionId).nominatedId).toBe("");
  });

  it("무투표로 토론이 끝나면 설명부터 다시 한다", async () => {
    const r = await toDiscussion(await started());
    const before = r.s().descriptionAttempts;
    (r.room as any).closeDiscussion();
    await tick(r.room);
    expect(r.s().phase).toBe("description");
    expect(r.s().descriptionAttempts).toBe(before + 1);
  });

  it("기회 소진 후 무투표면 라이어 승으로 끝난다 (D8)", async () => {
    const r = await toDiscussion(await started());
    (r.room as any).state.descriptionAttempts = 2;
    (r.room as any).state.discussionAttempts = 2;
    (r.room as any).closeDiscussion();
    await tick(r.room);
    expect(r.s().phase).toBe("round-result");
    expect(r.s().roundWinner).toBe("liar");
    expect(r.s().roundEndReason).toBe("chances-exhausted");
  });

  it("기회가 소진되면 다시하기 지목이 거부된다", async () => {
    const r = await toDiscussion(await started());
    (r.room as any).state.descriptionAttempts = 2;
    const c1 = r.clients[0]!;
    c1.send("nominate", { targetId: REDO_TARGET });
    await tick(r.room);
    expect(r.s().players.get(c1.sessionId).nominatedId).toBe("");
  });

  it("★ 마지막 토론에서는 설명 기회가 남아도 다시하기 지목이 거부된다", async () => {
    const r = await toDiscussion(await started());
    (r.room as any).state.descriptionAttempts = 1;
    (r.room as any).state.discussionAttempts = 2;      // 재토론 기회 소진
    const c1 = r.clients[0]!;
    c1.send("nominate", { targetId: REDO_TARGET });
    await tick(r.room);
    expect(r.s().players.get(c1.sessionId).nominatedId).toBe("");
  });

  it("★ 주제가 \"랜덤\"이면 매 라운드 새로 뽑고 설정값은 그대로 둔다", async () => {
    const r = await started();
    expect(r.s().category).toBe("랜덤");
    expect(r.s().roundCategory).not.toBe("");
    expect(r.s().roundCategory).not.toBe("랜덤");

    // 설정값을 덮어쓰면 2라운드부터 1라운드 주제에 고정됐다
    (r.room as any).endRound("citizen", "liar-executed-wrong-guess");
    await tick(r.room);
    for (let i = 0; i < 2; i++) { r.clients[0]!.send("next-round", {}); await tick(r.room, 3); }
    expect(r.s().round).toBe(2);
    expect(r.s().category).toBe("랜덤");
    expect(r.s().roundCategory).not.toBe("랜덤");
  });

  it("매치를 마치고 대기실로 돌아가면 비밀이 모두 지워진다", async () => {
    const r = await started();
    (r.room as any).state.totalRounds = 1;      // 1라운드 매치
    (r.room as any).endRound("citizen", "liar-executed-wrong-guess");
    await tick(r.room);

    // round-result → scoreboard → match-result → waiting (M4)
    for (let i = 0; i < 3; i++) { r.clients[0]!.send("next-round", {}); await tick(r.room, 3); }
    expect(r.s().phase).toBe("waiting");
    expect(r.s().revealedLiarId).toBe("");
    for (const c of r.clients) {
      expect(r.s().players.get(c.sessionId).myWord).toBe("");
      expect(r.s().players.get(c.sessionId).amILiar).toBe(false);
    }
  });
});

describe("이탈 처리", () => {
  it("인원이 4명 미만이 되면 라운드가 무효 처리된다", async () => {
    const { room, clients, s } = await makeRoom(4);
    clients[0]!.send("start-match", {});
    await tick(room);
    await clients[3]!.leave();
    await tick(room, 3);
    expect(s().phase).toBe("round-result");
    expect(s().roundEndReason).toBe("voided");
  });
});

describe("채팅", () => {
  it("최후 변론 중에는 피고만 발언할 수 있다", async () => {
    const { room, clients, s } = await makeRoom(4);
    (room as any).state.defendantId = clients[3]!.sessionId;
    (room as any).enterPhase("defense");
    await tick(room);
    const before = s().chat.length;
    clients[0]!.send("chat", { text: "끼어들기" });
    await tick(room);
    expect(s().chat.length).toBe(before);
    clients[3]!.send("chat", { text: "변론합니다" });
    await tick(room);
    expect(s().chat.at(-1).text).toBe("변론합니다");
  });

  it("★ 채팅이 와도 남은 시간이 페이즈 시작 값으로 되감기지 않는다", async () => {
    // 클라이언트는 패치마다 phaseRemainingMs를 수신 시각 기준으로 다시 센다.
    // 채팅이 이 값을 갱신하지 않으면 변론 타이머가 채팅마다 처음부터 다시 시작됐다.
    const { room, clients, s } = await makeRoom(4);
    (room as any).state.defendantId = clients[3]!.sessionId;
    (room as any).enterPhase("defense");
    await tick(room);
    const full = s().defenseTime * 1000;
    expect(s().phaseRemainingMs).toBe(full);

    await new Promise((r) => setTimeout(r, 400));
    clients[3]!.send("chat", { text: "변론합니다" });
    await tick(room);
    expect(s().phase).toBe("defense");
    expect(s().phaseRemainingMs).toBeLessThanOrEqual(full - 300);
  });

  it("빈 채팅은 거부된다 (zod 검증)", async () => {
    const { room, clients, s } = await makeRoom(4);
    const before = s().chat.length;
    clients[0]!.send("chat", { text: "   " });
    await tick(room);
    expect(s().chat.length).toBe(before);
  });

  it("입력을 HTML 인코딩하지 않는다 (체크리스트 C3)", async () => {
    const { room, clients, s } = await makeRoom(4);
    clients[0]!.send("chat", { text: "A&B <b>굵게</b>" });
    await tick(room);
    expect(s().chat.at(-1).text).toBe("A&B <b>굵게</b>");
  });
});
