// 클라이언트가 `state.toJSON()`으로 받는 평범한 객체의 타입.
//
// **이것이 계약의 원본이다.** Colyseus 클라이언트는 리플렉션으로 디코딩하므로
// Schema 클래스를 공유할 필요가 없다. 대신 서버가 컴파일 타임에 자기 Schema가
// 이 모양과 맞는지 검사한다 (server/rooms/state.ts 말미).
//
// ⚠️ `@view()`로 표시된 필드는 **해당 뷰어의 스냅샷에만 존재한다.**
// 남의 것은 빈 값이 아니라 **키 자체가 없다.** 그래서 전부 optional이다.

import type { GameMode, Phase, RoundEndReason, RoundWinner } from "./types.js";

export type PlayerSnapshot = {
  // ── 전원 공개 ──
  id: string;
  nickname: string;
  isHost: boolean;
  isConnected: boolean;
  isSpectator: boolean;
  score: number;
  roundDelta: number;
  hasCheckedWord: boolean;
  description: string;      // 제출된 한줄 설명
  nominatedId: string;      // 지목 대상 ("" = 미지목)
  hasFinalVoted: boolean;   // 투표 "여부"만. 찬반은 개표 시점에 공개

  // ── 본인에게만 (StateView) ──
  myWord?: string;
  amILiar?: boolean;
  myFinalVote?: boolean;
};

export type ChatSnapshot = {
  id: string;
  senderId: string;   // "" = 시스템 메시지
  nickname: string;
  text: string;
  at: number;
};

export type RoomSnapshot = {
  // 설정
  name: string;
  isPublic: boolean;
  maxPlayers: number;
  gameMode: GameMode;
  category: string;
  totalRounds: number;      // 0 = 무제한
  descriptionTime: number;
  discussionTime: number;
  defenseTime: number;

  // 진행
  phase: Phase;
  phaseRemainingMs: number; // 상대 시간. 절대 시각을 보내지 않는다 (체크리스트 D6)
  phaseEndsAt: number;      // 0 = 무기한
  isPaused: boolean;
  graceRemainingMs: number;
  round: number;
  descriptionAttempts: number;
  discussionAttempts: number;
  descriptionOrder: string[];
  currentDescriberIndex: number;
  defendantId: string;

  // 개표 (vote-reveal 이후에만 채워진다)
  agreeCount: number;
  disagreeCount: number;
  abstainCount: number;

  players: Record<string, PlayerSnapshot>;
  chat: ChatSnapshot[];

  // 라운드 결과 (round-result 진입 시에만 채워진다)
  revealedLiarId: string;
  revealedCitizenWord: string;
  revealedLiarWord: string;
  liarGuess: string;
  roundWinner: RoundWinner | "";
  roundEndReason: RoundEndReason | "";
};

/** 로비 목록에 노출되는 방 요약 */
export type LobbyRoom = {
  roomId: string;
  name: string;
  isPublic: boolean;
  playerCount: number;
  maxPlayers: number;
  gameMode: GameMode;
  category: string;
  inProgress: boolean;
  /** 관전 가능 여부 (M3) */
  canSpectate: boolean;
};
