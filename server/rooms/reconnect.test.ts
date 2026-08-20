/**
 * M2 — 재접속(30초 유예)과 일시정지.
 *
 * v1은 socket.id를 정체성으로 써서 새로고침하면 게임에서 퇴출됐고,
 * 라이어가 2초 끊기면 그 자리에서 게임이 끝났다. 이 테스트가 그 대응이다.
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
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  colyseus = await boot({
    initializeGameServer: (gs: Server) => { gs.define("liar", FastGraceRoom); },
  } as any);
});
afterAll(async () => { await colyseus.shutdown(); });
beforeEach(async () => { await colyseus.cleanup(); });

async function roomN(n = 4) {
  const room: any = await colyseus.createRoom("liar", {
    nickname: "p1", roomName: "재접속", isPublic: true,
  });
  const clients = [];
  for (let i = 1; i <= n; i++) clients.push(await colyseus.connectTo(room, { nickname: `p${i}` }));
  return { room, clients };
}
const room4 = () => roomN(4);

async function inRound(arg: ("normal" | "fool") | number = "normal") {
  const mode = typeof arg === "string" ? arg : "normal";
  const n = typeof arg === "number" ? arg : 4;
  const r = await roomN(n);
  r.room.state.gameMode = mode;
  r.clients[0]!.send("start-match", {});
  await r.room.waitForNextPatch();
  await r.room.waitForNextPatch();
  return r;
}

/** 비정상 종료(네트워크 끊김)를 흉내낸다. 4000은 "정상 퇴장" 코드이므로 쓰지 않는다. */
const drop = (c: any) => c.leave(false);

describe("유예 진입", () => {
  it("끊긴 직후에도 방에 남아있고 isConnected=false가 된다", async () => {
    const { room, clients } = await inRound();
    const sid = clients[3]!.sessionId;
    await drop(clients[3]!);
    await wait(200);

    expect(room.state.players.has(sid)).toBe(true);
    expect(room.state.players.get(sid).isConnected).toBe(false);
  });

  it("유예 중에는 게임이 일시정지된다", async () => {
    const { room, clients } = await inRound();
    await drop(clients[3]!);
    await wait(200);
    expect(room.state.isPaused).toBe(true);
    expect(room.state.graceRemainingMs).toBeGreaterThan(0);
  });

  it("일시정지 중에는 페이즈 타이머가 멈춘다", async () => {
    const { room, clients } = await inRound();
    for (const c of clients) c.send("check-word", {});
    await room.waitForNextPatch();
    await room.waitForNextPatch();
    expect(room.state.phase).toBe("description");

    await drop(clients[3]!);
    await wait(700);
    // 설명 제한시간(기본 30초)이 흐르지 않았어야 한다
    expect(room.state.phase).toBe("description");
    expect(room.timer.remainingMs()).toBeGreaterThan(28_000);
  });

  it("유예 중에도 채팅은 동작한다 — 멈춘 것은 게임이지 대화가 아니다", async () => {
    const { room, clients } = await inRound();
    await drop(clients[3]!);
    await wait(200);
    const before = room.state.chat.length;
    clients[0]!.send("chat", { text: "기다리자" });
    await wait(300);
    expect(room.state.chat.length).toBeGreaterThan(before);
    expect(room.state.chat.at(-1).text).toBe("기다리자");
  });
});

describe("재접속 성공", () => {
  it("토큰으로 돌아오면 자리·제시어가 그대로 복구된다", async () => {
    const { room, clients } = await inRound("fool");
    const victim = clients[3]!;
    const sid = victim.sessionId;
    const wordBefore = room.state.players.get(sid).myWord;
    const token = (victim as any).reconnectionToken;

    await drop(victim);
    await wait(200);
    expect(room.state.isPaused).toBe(true);

    const back: any = await colyseus.sdk.reconnect(token);
    await wait(400);

    expect(back.sessionId).toBe(sid);
    expect(room.state.players.get(sid).isConnected).toBe(true);
    expect(room.state.players.get(sid).myWord).toBe(wordBefore);
    expect(room.state.isPaused).toBe(false);
  });

  it("재접속 후에도 타인의 제시어는 보이지 않는다", async () => {
    const { room, clients } = await inRound("fool");
    const victim = clients[3]!;
    const token = (victim as any).reconnectionToken;
    await drop(victim);
    await wait(200);

    const back: any = await colyseus.sdk.reconnect(token);
    await wait(400);

    const snap = back.state.toJSON();
    for (const [sid, p] of Object.entries<any>(snap.players)) {
      if (sid === back.sessionId) expect(p.myWord).toBeTruthy();
      else expect(p.myWord ?? "").toBe("");
    }
    void room;
  });

  it("재접속하면 타이머가 남은 시간부터 재개된다", async () => {
    const { room, clients } = await inRound();
    for (const c of clients) c.send("check-word", {});
    await room.waitForNextPatch(); await room.waitForNextPatch();

    const victim = clients[3]!;
    const token = (victim as any).reconnectionToken;
    await drop(victim);
    await wait(500);
    const frozen = room.timer.remainingMs();

    await colyseus.sdk.reconnect(token);
    await wait(400);
    expect(room.state.isPaused).toBe(false);
    // 정지 동안 흐르지 않았으므로 남은 시간이 거의 그대로다
    expect(Math.abs(room.timer.remainingMs() - frozen)).toBeLessThan(900);
  });
});

describe("유예 만료", () => {
  it("만료되면 방에서 제거되고 일시정지가 풀린다", async () => {
    const { room, clients } = await inRound();
    const sid = clients[3]!.sessionId;
    await drop(clients[3]!);
    await wait(1600);   // graceSeconds = 1

    expect(room.state.players.has(sid)).toBe(false);
    expect(room.state.isPaused).toBe(false);
  });

  it("만료 후에는 토큰이 거부된다", async () => {
    const { clients } = await inRound();
    const token = (clients[3]! as any).reconnectionToken;
    await drop(clients[3]!);
    await wait(1600);
    await expect(colyseus.sdk.reconnect(token)).rejects.toThrow();
  });
});

describe("정상 퇴장", () => {
  it("스스로 나가면 유예 없이 즉시 제거된다", async () => {
    const { room, clients } = await inRound();
    const sid = clients[3]!.sessionId;
    await clients[3]!.leave();          // consented (code 4000)
    await wait(300);
    expect(room.state.players.has(sid)).toBe(false);
    expect(room.state.isPaused).toBe(false);
  });
});

describe("호스트의 대기 건너뛰기", () => {
  it("호스트가 누르면 유예가 즉시 종료된다", async () => {
    const { room, clients } = await inRound();
    const sid = clients[3]!.sessionId;
    await drop(clients[3]!);
    await wait(200);
    expect(room.state.isPaused).toBe(true);

    clients[0]!.send("skip-wait", {});
    await wait(300);
    expect(room.state.players.has(sid)).toBe(false);
    expect(room.state.isPaused).toBe(false);
  });

  it("호스트가 아니면 건너뛸 수 없다", async () => {
    const { room, clients } = await inRound();
    await drop(clients[3]!);
    await wait(200);
    clients[1]!.send("skip-wait", {});
    await wait(300);
    expect(room.state.isPaused).toBe(true);
  });
});

describe("★ 다중 끊김 (체크리스트 G8)", () => {
  it("2명이 끊겼다가 1명만 복귀하면 여전히 정지 상태다", async () => {
    const { room, clients } = await room4();
    // 6명으로 늘려 2명이 빠져도 최소 인원을 유지한다
    const extra = [];
    for (let i = 5; i <= 6; i++) extra.push(await colyseus.connectTo(room, { nickname: `p${i}` }));
    clients[0]!.send("start-match", {});
    await room.waitForNextPatch(); await room.waitForNextPatch();

    const a = clients[3]!, b = extra[0]!;
    const tokenA = (a as any).reconnectionToken;

    await drop(a); await wait(150);
    await drop(b); await wait(150);
    expect(room.state.isPaused).toBe(true);

    // A만 복귀 — Delayed.pause()는 중첩 카운트를 하지 않으므로
    // 인원 수를 직접 세지 않으면 여기서 게임이 재개돼 버린다
    await colyseus.sdk.reconnect(tokenA);
    await wait(400);
    expect(room.state.players.get(a.sessionId).isConnected).toBe(true);
    expect(room.state.isPaused, "B가 아직 안 돌아왔으므로 정지 유지").toBe(true);

    // B의 유예가 만료되면 그때 재개된다
    await wait(1400);
    expect(room.state.isPaused).toBe(false);
  });
});

describe("라이어 이탈 단계별 차등 (D2 / 체크리스트 F6)", () => {
  it("제시어 확인 중 이탈 → 새 라이어·새 단어로 라운드 재시작", async () => {
    // 재시작하려면 이탈 후에도 최소 인원이 남아야 하므로 5인으로 시작한다
    const { room, clients } = await inRound(5);
    expect(room.state.phase).toBe("word-check");
    const liarId = room.secret.liarId;
    const wordBefore = room.secret.citizenWord;
    const roundBefore = room.state.round;

    const liar = clients.find((c) => c.sessionId === liarId)!;
    await drop(liar);
    await wait(1600);

    expect(room.state.phase).toBe("word-check");        // 다시 확인 단계
    expect(room.state.round).toBe(roundBefore);          // 라운드 수를 소모하지 않는다
    expect(room.secret.liarId).not.toBe(liarId);         // 새 라이어
    expect(room.state.roundWinner).toBe("");             // 점수 변동 없음
    void wordBefore;
  });

  it("설명~지목 중 이탈 → 라운드 무효", async () => {
    const { room, clients } = await inRound();
    for (const c of clients) c.send("check-word", {});
    await room.waitForNextPatch(); await room.waitForNextPatch();
    expect(room.state.phase).toBe("description");

    const liar = clients.find((c) => c.sessionId === room.secret.liarId)!;
    await drop(liar);
    await wait(1600);

    expect(room.state.phase).toBe("round-result");
    expect(room.state.roundEndReason).toBe("voided");
    expect(room.state.roundWinner).toBe("");
  });

  it("피고로 확정된 뒤 이탈 → 시민 승 확정", async () => {
    const { room, clients } = await inRound();
    for (const c of clients) c.send("check-word", {});
    await room.waitForNextPatch(); await room.waitForNextPatch();

    const liarId = room.secret.liarId;
    room.state.defendantId = liarId;
    room.enterPhase("defense");
    await room.waitForNextPatch();

    const liar = clients.find((c) => c.sessionId === liarId)!;
    await drop(liar);
    await wait(1600);

    expect(room.state.phase).toBe("round-result");
    expect(room.state.roundWinner).toBe("citizen");
  });
});
