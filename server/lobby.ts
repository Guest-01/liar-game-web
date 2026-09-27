import { matchMaker } from "colyseus";
import type { LobbyRoom } from "../shared/snapshot.js";

type RoomListing = Awaited<ReturnType<typeof matchMaker.query>>[number];

/** 매치메이커 목록 항목 → 로비에 보일 방 요약. 비밀번호·참가자 정보는 싣지 않는다. */
export function toLobbyRoom(r: RoomListing): LobbyRoom {
  const meta = (r.metadata ?? {}) as Record<string, unknown>;
  const maxPlayers = Number(meta.maxPlayers ?? r.maxClients);
  const occupancy = Number(meta.occupancy ?? r.clients);
  const inProgress = Boolean(meta.inProgress);
  return {
    roomId: r.roomId,
    name: String(meta.name ?? "방"),
    isPublic: meta.isPublic !== false,
    playerCount: occupancy,
    maxPlayers,
    gameMode: (meta.gameMode as LobbyRoom["gameMode"]) ?? "normal",
    category: String(meta.category ?? "랜덤"),
    inProgress,
    // 관전 자리 = 최대 인원 − 현재 인원 (D11)
    canSpectate: inProgress && occupancy < maxPlayers,
  };
}

/**
 * 로비 목록. 게임 중인 방도 노출한다 — 관전 진입 경로가 있어야 하기 때문이다 (D12).
 * 자리가 없는 방과 빈 방만 감춘다.
 */
export async function listLobbyRooms(): Promise<LobbyRoom[]> {
  const rooms = await matchMaker.query({ name: "liar" });
  return rooms
    .map(toLobbyRoom)
    .filter((r) => r.playerCount > 0 && (r.canSpectate || (!r.inProgress && r.playerCount < r.maxPlayers)))
    // 참가 가능한 방을 위로
    .sort((a, b) => Number(a.inProgress) - Number(b.inProgress));
}

/**
 * 방 하나의 요약. 없으면 null. 초대 링크의 입장 화면과 링크 미리보기가 쓴다.
 * roomId 모양이 아니면 조회하지 않는다 (경로에서 그대로 들어오는 값이다).
 */
export async function findRoom(roomId: string): Promise<LobbyRoom | null> {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(roomId)) return null;
  const [r] = await matchMaker.query({ name: "liar", roomId });
  return r ? toLobbyRoom(r) : null;
}
