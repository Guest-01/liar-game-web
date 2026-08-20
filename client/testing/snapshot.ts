import type { PlayerSnapshot, RoomSnapshot } from "../../shared/snapshot.js";

/** 테스트용 합성 스냅샷. 서버가 보내는 모양과 동일해야 한다. */
export function player(id: string, nickname: string, over: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    id, nickname, isHost: false, isConnected: true, isSpectator: false,
    score: 0, roundDelta: 0, hasCheckedWord: false, description: "",
    nominatedId: "", hasFinalVoted: false, ...over,
  };
}

export function snapshot(over: Partial<RoomSnapshot> = {}): RoomSnapshot {
  const players: Record<string, PlayerSnapshot> = {
    a: player("a", "앨리스", { isHost: true }),
    b: player("b", "보라매"),
    c: player("c", "캐럴"),
    d: player("d", "데이브"),
  };
  return {
    name: "테스트방", isPublic: true, maxPlayers: 10, gameMode: "normal",
    category: "음식", totalRounds: 3,
    descriptionTime: 30, discussionTime: 120, defenseTime: 15,
    phase: "waiting", phaseRemainingMs: 0, phaseEndsAt: 0,
    isPaused: false, graceRemainingMs: 0,
    round: 0, descriptionAttempts: 0, discussionAttempts: 0,
    descriptionOrder: [], currentDescriberIndex: 0, defendantId: "",
    agreeCount: 0, disagreeCount: 0, abstainCount: 0,
    executionConfirmed: false, defendantWasLiar: false,
    players, chat: [],
    revealedLiarId: "", revealedCitizenWord: "", revealedLiarWord: "",
    liarGuess: "", roundWinner: "", roundEndReason: "",
    ...over,
  };
}
