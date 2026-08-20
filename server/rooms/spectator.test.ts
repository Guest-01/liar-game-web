/**
 * M3 — 관전.
 *
 * 관전자에게 제시어가 새면 게임이 죽는다. 관전자는 대개 플레이어의 지인이고
 * 채팅 한 줄이나 옆자리 한 마디로 유출된다 (D3).
 */
import { ColyseusTestServer, boot } from "@colyseus/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "colyseus";
import { LiarRoom } from "./LiarRoom.js";

/** 연출 대기 없이 규칙만 검증하기 위한 테스트용 방 */
class NoFxRoom extends LiarRoom {
  protected override fxScale = 0;
}

let colyseus: ColyseusTestServer;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  colyseus = await boot({
    initializeGameServer: (gs: Server) => { gs.define("liar", NoFxRoom); },
  } as any);
});
afterAll(async () => { await colyseus.shutdown(); });
beforeEach(async () => { await colyseus.cleanup(); });

async function roomN(n = 4) {
  const room: any = await colyseus.createRoom("liar", {
    nickname: "p1", roomName: "관전", isPublic: true,
  });
  const clients = [];
  for (let i = 1; i <= n; i++) clients.push(await colyseus.connectTo(room, { nickname: `p${i}` }));
  return { room, clients };
}

async function inRound(n = 4, mode: "normal" | "fool" = "fool") {
  const r = await roomN(n);
  r.room.state.gameMode = mode;
  r.clients[0]!.send("start-match", {});
  await r.room.waitForNextPatch();
  await r.room.waitForNextPatch();
  return r;
}

describe("관전자 입장", () => {
  it("대기실에서 들어오면 플레이어다", async () => {
    const { room, clients } = await roomN(4);
    expect(room.state.players.get(clients[3]!.sessionId).isSpectator).toBe(false);
  });

  it("라운드 중에 들어오면 관전자가 된다", async () => {
    const { room } = await inRound(4);
    const spec = await colyseus.connectTo(room, { nickname: "관전자" });
    await room.waitForNextPatch();
    expect(room.state.players.get(spec.sessionId).isSpectator).toBe(true);
  });

  it("관전자는 호스트가 되지 않는다", async () => {
    const { room } = await inRound(4);
    const spec = await colyseus.connectTo(room, { nickname: "관전자" });
    await room.waitForNextPatch();
    expect(room.state.players.get(spec.sessionId).isHost).toBe(false);
  });
});

describe("★ 정원 불변식: 플레이어 + 관전자 ≤ 최대 인원 (D11)", () => {
  it("최대 인원까지만 관전할 수 있다", async () => {
    const { room } = await inRound(4);
    room.state.maxPlayers = 6;          // 플레이어 4 → 관전 자리 2
    await colyseus.connectTo(room, { nickname: "s1" });
    await colyseus.connectTo(room, { nickname: "s2" });
    await room.waitForNextPatch();
    expect(room.state.players.size).toBe(6);

    await expect(colyseus.connectTo(room, { nickname: "s3" })).rejects.toThrow();
  });

  it("정원이 꽉 찬 방은 관전도 불가능하다", async () => {
    const { room } = await inRound(4);
    room.state.maxPlayers = 4;
    await expect(colyseus.connectTo(room, { nickname: "관전자" })).rejects.toThrow();
  });

  it("승격해도 정원을 넘지 않는다", async () => {
    const { room, clients } = await inRound(4);
    room.state.maxPlayers = 6;
    await colyseus.connectTo(room, { nickname: "s1" });
    await colyseus.connectTo(room, { nickname: "s2" });
    await room.waitForNextPatch();

    room.endRound("citizen", "liar-executed-wrong-guess");
    await room.waitForNextPatch();
    clients[0]!.send("next-round", {});
    await wait(300);

    const players = [...room.state.players.values()].filter((p: any) => !p.isSpectator);
    expect(players.length).toBe(6);
    expect(players.length).toBeLessThanOrEqual(room.state.maxPlayers);
  });
});

describe("★ 관전자는 제시어를 일절 보지 못한다 (D3)", () => {
  it("바이트 수준으로 어떤 제시어도 전송되지 않는다", async () => {
    const { room } = await inRound(4, "fool");
    room.state.maxPlayers = 6;

    // 관전자에게 전송되는 바이트를 수집한다
    const spec = await colyseus.connectTo(room, { nickname: "관전자" });
    const bufs: Buffer[] = [];
    const client = room.clients.find((c: any) => c.sessionId === spec.sessionId);
    const ref: any = client.ref ?? client._ref;
    const orig = ref.send.bind(ref);
    ref.send = (d: any, ...rest: any[]) => {
      bufs.push(Buffer.isBuffer(d) ? Buffer.from(d)
        : ArrayBuffer.isView(d) ? Buffer.from(d.buffer, d.byteOffset, d.byteLength)
        : Buffer.from(String(d)));
      return orig(d, ...rest);
    };

    // 상태가 여러 번 오가도록 흔든다
    for (const c of room.clients) if (c.sessionId !== spec.sessionId) c.send("check-word", {});
    await room.waitForNextPatch();
    await room.waitForNextPatch();
    await room.waitForNextPatch();

    const all = Buffer.concat(bufs);
    const { citizenWord, liarWord } = room.secret;
    expect(all.includes(Buffer.from(citizenWord, "utf8")), "시민 제시어").toBe(false);
    expect(all.includes(Buffer.from(liarWord, "utf8")), "라이어 제시어").toBe(false);

    // 라이어의 sessionId 자체는 모든 플레이어의 공개 식별자이므로 당연히 바이트에
    // 있다. 숨겨야 하는 것은 "누가 라이어인가"를 가리키는 **표시**이지 ID가 아니다.
    // 그 표시는 revealedLiarId 하나뿐이고, 라운드 중에는 비어 있다.
    expect(room.state.revealedLiarId).toBe("");
  });

  it("디코딩한 스냅샷에도 누구의 myWord도 없다", async () => {
    const { room } = await inRound(4, "fool");
    room.state.maxPlayers = 6;
    const spec: any = await colyseus.connectTo(room, { nickname: "관전자" });
    await room.waitForNextPatch();
    await room.waitForNextPatch();

    const snap = spec.state.toJSON();
    for (const p of Object.values<any>(snap.players)) {
      expect(p.myWord ?? "").toBe("");
    }
    expect(snap.revealedLiarId).toBe("");
  });

  it("라운드 결과에서는 관전자도 전원과 동일한 정보를 본다", async () => {
    const { room } = await inRound(4, "fool");
    room.state.maxPlayers = 6;
    const spec: any = await colyseus.connectTo(room, { nickname: "관전자" });
    await room.waitForNextPatch();

    const { liarId, citizenWord } = room.secret;
    room.endRound("citizen", "liar-executed-wrong-guess");
    await room.waitForNextPatch();
    await room.waitForNextPatch();

    const snap = spec.state.toJSON();
    expect(snap.revealedLiarId).toBe(liarId);
    expect(snap.revealedCitizenWord).toBe(citizenWord);
  });
});

describe("관전자는 읽기 전용이다", () => {
  it("채팅을 보낼 수 없다", async () => {
    const { room } = await inRound(4);
    room.state.maxPlayers = 6;
    const spec = await colyseus.connectTo(room, { nickname: "관전자" });
    await room.waitForNextPatch();

    const before = room.state.chat.length;
    spec.send("chat", { text: "저 사람이 라이어야" });
    await wait(300);
    expect(room.state.chat.length).toBe(before);
  });

  it("게임 행동(확인·지목)을 할 수 없다", async () => {
    const { room } = await inRound(4);
    room.state.maxPlayers = 6;
    const spec = await colyseus.connectTo(room, { nickname: "관전자" });
    await room.waitForNextPatch();

    spec.send("check-word", {});
    await wait(300);
    expect(room.state.players.get(spec.sessionId).hasCheckedWord).toBe(false);
  });
});

describe("관전자 승격", () => {
  it("다음 라운드 시작 시 플레이어가 되고 0점부터 시작한다", async () => {
    const { room, clients } = await inRound(4);
    room.state.maxPlayers = 6;
    const spec = await colyseus.connectTo(room, { nickname: "관전자" });
    await room.waitForNextPatch();
    expect(room.state.players.get(spec.sessionId).isSpectator).toBe(true);

    room.endRound("citizen", "liar-executed-wrong-guess");
    await room.waitForNextPatch();
    clients[0]!.send("next-round", {});
    await wait(300);

    const p = room.state.players.get(spec.sessionId);
    expect(p.isSpectator).toBe(false);
    expect(p.score).toBe(0);
  });
});

describe("관전자 이탈", () => {
  it("관전자가 끊겨도 게임이 멈추지 않는다", async () => {
    const { room } = await inRound(4);
    room.state.maxPlayers = 6;
    const spec = await colyseus.connectTo(room, { nickname: "관전자" });
    await room.waitForNextPatch();

    await spec.leave(false);          // 비정상 끊김
    await wait(400);
    expect(room.state.isPaused, "관전자 때문에 멈추면 안 된다").toBe(false);
    expect(room.state.players.has(spec.sessionId)).toBe(false);
  });
});

describe("호스트의 관전자 강퇴", () => {
  it("라운드 중에도 관전자는 강퇴할 수 있다", async () => {
    const { room, clients } = await inRound(4);
    room.state.maxPlayers = 6;
    const spec = await colyseus.connectTo(room, { nickname: "관전자" });
    await room.waitForNextPatch();

    clients[0]!.send("kick", { targetId: spec.sessionId });
    await wait(400);
    expect(room.state.players.has(spec.sessionId)).toBe(false);
  });

  it("라운드 중에 플레이어는 강퇴할 수 없다", async () => {
    const { room, clients } = await inRound(4);
    clients[0]!.send("kick", { targetId: clients[3]!.sessionId });
    await wait(400);
    expect(room.state.players.has(clients[3]!.sessionId)).toBe(true);
  });
});
