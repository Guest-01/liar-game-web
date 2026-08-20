/**
 * M4 — 연속 라운드와 누적 점수.
 */
import { ColyseusTestServer, boot } from "@colyseus/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "colyseus";
import { LiarRoom } from "./LiarRoom.js";

let colyseus: ColyseusTestServer;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  colyseus = await boot({
    initializeGameServer: (gs: Server) => { gs.define("liar", LiarRoom); },
  } as any);
});
afterAll(async () => { await colyseus.shutdown(); });
beforeEach(async () => { await colyseus.cleanup(); });

async function match(totalRounds = 3, n = 4) {
  const room: any = await colyseus.createRoom("liar", {
    nickname: "p1", roomName: "매치", isPublic: true,
  });
  const clients = [];
  for (let i = 1; i <= n; i++) clients.push(await colyseus.connectTo(room, { nickname: `p${i}` }));
  room.state.totalRounds = totalRounds;
  clients[0]!.send("start-match", {});
  await room.waitForNextPatch();
  await room.waitForNextPatch();
  return { room, clients, host: clients[0]! };
}

const next = async (room: any, host: any, times = 1) => {
  for (let i = 0; i < times; i++) { host.send("next-round", {}); await wait(250); }
};

describe("매치 흐름", () => {
  it("결과 → 점수판 → 다음 라운드 순으로 간다", async () => {
    const { room, host } = await match(3);
    expect(room.state.round).toBe(1);

    room.endRound("citizen", "liar-executed-wrong-guess");
    await room.waitForNextPatch();
    expect(room.state.phase).toBe("round-result");

    await next(room, host);
    expect(room.state.phase).toBe("scoreboard");

    await next(room, host);
    expect(room.state.phase).toBe("word-check");
    expect(room.state.round).toBe(2);
  });

  it("마지막 라운드 후에는 최종 순위로 간다", async () => {
    const { room, host } = await match(2);
    for (const r of [1, 2]) {
      expect(room.state.round).toBe(r);
      room.endRound("citizen", "liar-executed-wrong-guess");
      await room.waitForNextPatch();
      await next(room, host);           // → scoreboard
      if (r < 2) await next(room, host); // → 다음 라운드
    }
    await next(room, host);             // 마지막 점수판에서 →
    expect(room.state.phase).toBe("match-result");
  });

  it("최종 순위에서 다시 누르면 대기실로 돌아가고 점수가 초기화된다", async () => {
    const { room, host } = await match(1);
    room.endRound("liar", "citizen-executed");
    await room.waitForNextPatch();
    await next(room, host, 2);          // round-result → scoreboard → match-result
    expect(room.state.phase).toBe("match-result");
    expect([...room.state.players.values()].some((p: any) => p.score > 0)).toBe(true);

    await next(room, host);
    expect(room.state.phase).toBe("waiting");
    expect([...room.state.players.values()].every((p: any) => p.score === 0)).toBe(true);
  });

  it("무제한(0)이면 계속 다음 라운드로 간다", async () => {
    const { room, host } = await match(0);
    for (let i = 0; i < 3; i++) {
      room.endRound("citizen", "liar-executed-wrong-guess");
      await room.waitForNextPatch();
      await next(room, host, 2);
      expect(room.state.phase).toBe("word-check");
    }
    expect(room.state.round).toBe(4);
  });

  it("호스트가 아니면 다음으로 넘길 수 없다", async () => {
    const { room, clients } = await match(3);
    room.endRound("citizen", "liar-executed-wrong-guess");
    await room.waitForNextPatch();
    clients[1]!.send("next-round", {});
    await wait(250);
    expect(room.state.phase).toBe("round-result");
  });
});

describe("점수 누적", () => {
  it("라이어 승이면 라이어만 +2가 누적된다", async () => {
    const { room, host } = await match(3);
    const liarId = room.secret.liarId;
    room.endRound("liar", "citizen-executed");
    await room.waitForNextPatch();

    expect(room.state.players.get(liarId).score).toBe(2);
    for (const [id, p] of room.state.players.entries()) {
      if (id !== liarId) expect(p.score).toBe(0);
    }
    void host;
  });

  it("시민 승이면 시민 전원 +1", async () => {
    const { room } = await match(3);
    const liarId = room.secret.liarId;
    room.endRound("citizen", "liar-executed-wrong-guess");
    await room.waitForNextPatch();

    expect(room.state.players.get(liarId).score).toBe(0);
    for (const [id, p] of room.state.players.entries()) {
      if (id !== liarId) expect(p.score).toBe(1);
    }
  });

  it("정확 지목 보너스가 마지막 지목 기준으로 붙는다", async () => {
    const { room, clients } = await match(3);
    for (const c of clients) c.send("check-word", {});
    await room.waitForNextPatch(); await room.waitForNextPatch();

    const liarId = room.secret.liarId;
    const citizen = clients.find((c) => c.sessionId !== liarId)!;
    room.startDiscussion();
    await room.waitForNextPatch();

    citizen.send("nominate", { targetId: liarId });
    await wait(250);
    room.closeDiscussion();            // 여기서 마지막 지목이 확정된다
    await wait(250);

    room.endRound("citizen", "liar-executed-wrong-guess");
    await room.waitForNextPatch();
    // 시민 승 +1, 정확 지목 +1
    expect(room.state.players.get(citizen.sessionId).score).toBe(2);
  });

  it("라운드를 거치며 점수가 누적된다", async () => {
    const { room, host } = await match(0);
    const scores: number[] = [];
    for (let i = 0; i < 3; i++) {
      const liarId = room.secret.liarId;
      room.endRound("liar", "citizen-executed");
      await room.waitForNextPatch();
      scores.push(room.state.players.get(liarId).score);
      await next(room, host, 2);
    }
    // 매 라운드 라이어가 +2씩 받는다 (같은 사람일 수도, 아닐 수도 있다)
    const total = [...room.state.players.values()].reduce((a: number, p: any) => a + p.score, 0);
    expect(total).toBe(6);
    void scores;
  });

  it("roundDelta에 직전 라운드 변동만 담긴다", async () => {
    const { room, host } = await match(0);
    room.endRound("liar", "citizen-executed");
    await room.waitForNextPatch();
    const liarId = room.state.revealedLiarId;
    expect(room.state.players.get(liarId).roundDelta).toBe(2);

    await next(room, host, 2);
    room.endRound("citizen", "liar-executed-wrong-guess");
    await room.waitForNextPatch();
    // 새 라운드의 라이어는 0, 시민은 +1
    const newLiar = room.state.revealedLiarId;
    expect(room.state.players.get(newLiar).roundDelta).toBe(0);
  });
});

describe("무효 라운드 (REQUIREMENTS §1.7)", () => {
  it("점수 변동이 없다", async () => {
    const { room } = await match(3);
    room.voidRound("테스트 무효");
    await room.waitForNextPatch();
    for (const p of room.state.players.values()) expect(p.score).toBe(0);
  });

  it("라운드 수를 소모하지 않는다", async () => {
    const { room, host } = await match(3);
    expect(room.state.round).toBe(1);
    room.voidRound("테스트 무효");
    await room.waitForNextPatch();

    await next(room, host, 2);          // round-result → scoreboard → 재시작
    expect(room.state.phase).toBe("word-check");
    expect(room.state.round, "무효였으므로 여전히 1라운드").toBe(1);
  });

  it("마지막 라운드가 무효면 매치가 끝나지 않는다", async () => {
    const { room, host } = await match(1);
    room.voidRound("테스트 무효");
    await room.waitForNextPatch();
    await next(room, host, 2);
    expect(room.state.phase, "최종 순위가 아니라 라운드 재시작").toBe("word-check");
    expect(room.state.round).toBe(1);
  });
});

describe("도중 합류자", () => {
  it("라운드 사이(결과·점수판)에 들어오면 곧바로 플레이어다", async () => {
    const { room } = await match(0);
    room.state.maxPlayers = 6;
    room.endRound("citizen", "liar-executed-wrong-guess");
    await room.waitForNextPatch();

    // round-result는 라운드가 끝난 상태이므로 관전이 아니라 참가다
    const late = await colyseus.connectTo(room, { nickname: "늦은사람" });
    await room.waitForNextPatch();
    expect(room.state.players.get(late.sessionId).isSpectator).toBe(false);
    expect(room.state.players.get(late.sessionId).score).toBe(0);
  });

  it("라운드 진행 중에 들어오면 관전 후 다음 라운드에 0점으로 승격한다", async () => {
    const { room, host } = await match(0);
    room.state.maxPlayers = 6;

    // 1라운드를 끝내 기존 참가자에게 점수를 준다
    room.endRound("citizen", "liar-executed-wrong-guess");
    await room.waitForNextPatch();
    await next(room, host, 2);                 // → 2라운드 word-check (라운드 진행 중)
    expect(room.state.phase).toBe("word-check");

    const spec = await colyseus.connectTo(room, { nickname: "늦은사람" });
    await room.waitForNextPatch();
    expect(room.state.players.get(spec.sessionId).isSpectator).toBe(true);

    room.endRound("citizen", "liar-executed-wrong-guess");
    await room.waitForNextPatch();
    await next(room, host);                    // round-result → scoreboard (여기서 승격)

    const p = room.state.players.get(spec.sessionId);
    expect(p.isSpectator).toBe(false);
    expect(p.score, "도중 합류자는 0점부터").toBe(0);

    const others = [...room.state.players.values()].filter((x: any) => x.id !== spec.sessionId);
    expect(others.some((x: any) => x.score > 0), "기존 참가자는 점수를 유지한다").toBe(true);
  });
});

describe("설정 검증 (체크리스트 C5)", () => {
  /** 게임을 시작하지 않은 대기실 상태의 방 */
  async function lobby() {
    const room: any = await colyseus.createRoom("liar", {
      nickname: "p1", roomName: "설정", isPublic: true,
    });
    const clients = [];
    for (let i = 1; i <= 4; i++) clients.push(await colyseus.connectTo(room, { nickname: `p${i}` }));
    return { room, host: clients[0]!, clients };
  }

  it("허용되지 않은 라운드 수는 무시된다", async () => {
    const { room, host } = await lobby();
    host.send("set-settings", { totalRounds: 2 });   // 허용값은 3 / 5 / 0
    await wait(250);
    expect(room.state.totalRounds).toBe(3);          // 기본값 유지
  });

  it("한 필드라도 유효하지 않으면 메시지 전체가 버려진다", async () => {
    const { room, host } = await lobby();
    const before = room.state.descriptionTime;
    // descriptionTime은 유효하지만 totalRounds가 유효하지 않다
    host.send("set-settings", { totalRounds: 2, descriptionTime: 60 });
    await wait(250);
    expect(room.state.descriptionTime, "전부 아니면 전무로 검증한다").toBe(before);

    // 전부 유효하면 반영된다
    host.send("set-settings", { totalRounds: 5, descriptionTime: 60 });
    await wait(250);
    expect(room.state.totalRounds).toBe(5);
    expect(room.state.descriptionTime).toBe(60);
  });

  it("대기실이 아니면 설정을 바꿀 수 없다", async () => {
    const { room, host } = await match(3);            // 이미 라운드가 시작된 방
    expect(room.state.phase).toBe("word-check");
    host.send("set-settings", { totalRounds: 5 });
    await wait(250);
    expect(room.state.totalRounds).toBe(3);
  });
});
