/**
 * ★ 배포 게이트 ★
 *
 * docs/REQUIREMENTS.md §2의 정보 공개 3계층을, 디코딩된 상태가 아니라
 * **서버가 실제로 전송한 소켓 바이트**에서 검증한다.
 *
 * 디코딩 결과만 보면 인코더 변경이나 StateView 설정 실수를 놓칠 수 있다.
 * (체크리스트 C2 / G7 / G9)
 *
 * 이 테스트가 깨지면 배포하지 않는다.
 */
import { ColyseusTestServer, boot } from "@colyseus/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Server } from "colyseus";
import { LiarRoom } from "./LiarRoom.js";

/** 연출 대기 없이 규칙만 검증하기 위한 테스트용 방 */
class NoFxRoom extends LiarRoom {
  protected override fxScale = 0;
}

let colyseus: ColyseusTestServer;

/** 각 클라이언트에게 전송된 원시 바이트를 수집한다 */
function captureBytes(room: any): Map<string, Buffer[]> {
  const captured = new Map<string, Buffer[]>();
  for (const client of room.clients) {
    const ref: any = client.ref ?? client._ref;
    if (!ref || typeof ref.send !== "function" || ref.__captured) continue;
    ref.__captured = true;
    const orig = ref.send.bind(ref);
    ref.send = (data: any, ...rest: any[]) => {
      const buf = Buffer.isBuffer(data) ? Buffer.from(data)
        : data instanceof ArrayBuffer ? Buffer.from(new Uint8Array(data))
        : ArrayBuffer.isView(data) ? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
        : Buffer.from(String(data));
      const arr = captured.get(client.sessionId) ?? [];
      arr.push(buf);
      captured.set(client.sessionId, arr);
      return orig(data, ...rest);
    };
  }
  return captured;
}

const bytesFor = (m: Map<string, Buffer[]>, sid: string) => Buffer.concat(m.get(sid) ?? []);
const contains = (buf: Buffer, s: string) => buf.includes(Buffer.from(s, "utf8"));

beforeAll(async () => {
  colyseus = await boot({
    initializeGameServer: (gs: Server) => { gs.define("liar", NoFxRoom); },
  } as any);
});
afterAll(async () => { await colyseus.shutdown(); });
beforeEach(async () => { await colyseus.cleanup(); });

async function setupRound(gameMode: "normal" | "fool") {
  const room = await colyseus.createRoom("liar", {
    nickname: "p1", roomName: "테스트방", isPublic: true,
  });
  const c1 = await colyseus.connectTo(room, { nickname: "p1" });
  const c2 = await colyseus.connectTo(room, { nickname: "p2" });
  const c3 = await colyseus.connectTo(room, { nickname: "p3" });
  const c4 = await colyseus.connectTo(room, { nickname: "p4" });

  (room as any).state.gameMode = gameMode;
  const captured = captureBytes(room);

  c1.send("start-match", {});
  await room.waitForNextPatch();
  await room.waitForNextPatch();

  const secret = (room as any).secret as { liarId: string; citizenWord: string; liarWord: string };
  return { room, clients: [c1, c2, c3, c4], captured, secret };
}

describe("정보 은닉 — 바이트 수준 (배포 게이트)", () => {
  it("일반 모드: 시민 제시어는 시민에게만, 라이어에게는 전송되지 않는다", async () => {
    const { clients, captured, secret } = await setupRound("normal");

    for (const c of clients) {
      const bytes = bytesFor(captured, c.sessionId);
      const isLiar = c.sessionId === secret.liarId;
      expect(
        contains(bytes, secret.citizenWord),
        `${isLiar ? "라이어" : "시민"}(${c.sessionId})에게 시민 제시어 전송 여부`,
      ).toBe(!isLiar);
    }
  });

  it("바보 모드: 각자 자기 단어만 받고 상대 단어는 받지 않는다", async () => {
    const { clients, captured, secret } = await setupRound("fool");

    for (const c of clients) {
      const bytes = bytesFor(captured, c.sessionId);
      const isLiar = c.sessionId === secret.liarId;
      expect(contains(bytes, secret.citizenWord), `시민단어 → ${c.sessionId}`).toBe(!isLiar);
      expect(contains(bytes, secret.liarWord), `라이어단어 → ${c.sessionId}`).toBe(isLiar);
    }
  });

  it("라이어의 정체(sessionId)가 라운드 중 state에 존재하지 않는다", async () => {
    const { room } = await setupRound("normal");
    expect((room as any).state.revealedLiarId).toBe("");
  });

  it("바보 모드에서는 라이어 본인도 amILiar를 받지 못한다", async () => {
    const { room, secret } = await setupRound("fool");
    const liar = (room as any).state.players.get(secret.liarId);
    expect(liar.amILiar).toBe(false);
  });

  it("일반 모드에서 라이어 본인만 amILiar=true다", async () => {
    const { room, secret } = await setupRound("normal");
    for (const [sid, p] of (room as any).state.players.entries()) {
      expect(p.amILiar).toBe(sid === secret.liarId);
    }
  });

  it("클라이언트가 디코딩한 스냅샷에 타인의 myWord 키가 없다 (체크리스트 G9)", async () => {
    const { room, clients, secret } = await setupRound("fool");
    await room.waitForNextPatch();

    for (const c of clients) {
      const snap: any = (c.state as any).toJSON();
      for (const [sid, p] of Object.entries<any>(snap.players)) {
        if (sid === c.sessionId) {
          expect(p.myWord, `본인(${sid})은 자기 단어를 본다`).toBeTruthy();
        } else {
          expect(p.myWord ?? "", `${c.sessionId}가 보는 ${sid}의 myWord`).toBe("");
        }
      }
      void secret;
    }
  });

  it("결과 공개 후에는 전원이 라이어와 제시어를 본다", async () => {
    const { room, clients, secret } = await setupRound("normal");

    // 강제로 라운드를 종료시킨다
    (room as any).endRound("citizen", "liar-executed-wrong-guess");
    await room.waitForNextPatch();
    await room.waitForNextPatch();

    for (const c of clients) {
      const snap: any = (c.state as any).toJSON();
      expect(snap.revealedLiarId, `${c.sessionId}가 보는 라이어`).toBe(secret.liarId);
      expect(snap.revealedCitizenWord).toBe(secret.citizenWord);
    }
  });
});
