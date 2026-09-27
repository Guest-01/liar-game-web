/**
 * 초대 링크 — 방 요약 조회(입장 화면)와 링크 미리보기(OG).
 */
import { ColyseusTestServer, boot } from "@colyseus/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "colyseus";
import { LiarRoom } from "./rooms/LiarRoom.js";
import { findRoom, listLobbyRooms } from "./lobby.js";
import { OG_IMAGE, renderHead } from "./shell.js";

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  colyseus = await boot({
    initializeGameServer: (gs: Server) => { gs.define("liar", LiarRoom); },
  } as any);
});
afterAll(async () => { await colyseus.shutdown(); });
beforeEach(async () => { await colyseus.cleanup(); });

describe("방 요약 조회 (/api/rooms/:id)", () => {
  it("비공개 방인지 알려준다 — 비밀번호는 싣지 않는다", async () => {
    const room = await colyseus.createRoom("liar", {
      nickname: "방장", roomName: "비밀방", isPublic: false, password: "1234",
    });
    await colyseus.connectTo(room, { nickname: "방장", password: "1234" });

    const found = await findRoom(room.roomId);
    expect(found).toMatchObject({ roomId: room.roomId, name: "비밀방", isPublic: false, playerCount: 1 });
    expect(JSON.stringify(found)).not.toContain("1234");
  });

  it("없는 방이나 이상한 ID는 null", async () => {
    expect(await findRoom("NOPE_NOT_A_ROOM")).toBeNull();
    expect(await findRoom("../../etc/passwd")).toBeNull();
    expect(await findRoom("")).toBeNull();
  });

  it("로비 목록은 빈 방을 감춘다", async () => {
    const room = await colyseus.createRoom("liar", { nickname: "방장", roomName: "빈방", isPublic: true });
    expect((await listLobbyRooms()).some((r) => r.roomId === room.roomId)).toBe(false);
    await colyseus.connectTo(room, { nickname: "방장" });
    expect((await listLobbyRooms()).some((r) => r.roomId === room.roomId)).toBe(true);
  });
});

describe("링크 미리보기 (OG)", () => {
  const base = "https://liar-game.example";

  it("초대 링크에 방 이름을 싣는다", () => {
    const head = renderHead("/room/abc", base, { roomName: "금요일 모임" });
    expect(head).toContain('<meta property="og:title" content="금요일 모임 - 라이어 게임">');
    expect(head).toContain("&quot;금요일 모임&quot; 방에 초대합니다");
    expect(head).toContain(`content="${base}/room/abc"`);
  });

  it("방을 모르면 일반 방 문구로 둔다", () => {
    expect(renderHead("/room/abc", base)).toContain("게임 방 - 라이어 게임");
  });

  it("★ 방 이름(사용자 입력)을 이스케이프한다", () => {
    const head = renderHead("/room/abc", base, { roomName: '"><script>alert(1)</script>' });
    expect(head).not.toContain("<script>");
    expect(head).toContain("&quot;&gt;&lt;script&gt;");
  });

  it("큰 카드 이미지와 크기를 밝힌다", () => {
    const head = renderHead("/", base);
    expect(head).toContain(`content="${base}${OG_IMAGE.path}"`);
    expect(head).toContain('<meta property="og:image:width" content="1200">');
    expect(head).toContain('<meta name="twitter:card" content="summary_large_image">');
  });
});
