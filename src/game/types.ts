// 게임 모드
export type GameMode = 'normal' | 'fool';

// 방 상태
export type RoomState =
  | 'waiting'      // 대기실
  | 'word-check'   // 단어 확인
  | 'description'  // 한줄 설명
  | 'discussion'   // 토론 + 지목
  | 'defense'      // 최후 변론
  | 'final-vote'   // 최종 투표
  | 'liar-guess'   // 라이어 정답 맞추기
  | 'result';      // 결과

// 플레이어
export interface Player {
  id: string;
  nickname: string;
  isHost: boolean;
  isConnected: boolean;
  hasCheckedWord: boolean;
  description: string | null;
  nominatedId: string | null;
}

// 게임 상태
export interface Game {
  liarId: string;
  citizenWord: string;
  liarWord: string | null;
  descriptionOrder: string[];
  currentDescriberIndex: number;
  descriptions: Record<string, string>;
  nominations: Record<string, string>;
  nominatedPlayerId: string | null;
  finalVotes: Record<string, boolean>;
  discussionEndTime: number;
  defenseEndTime: number;
  liarGuessEndTime: number;
  liarGuess: string | null;
}

// 방
export interface Room {
  id: string;
  name: string;
  hostId: string;
  isPublic: boolean;
  password: string | null;
  maxPlayers: number;
  gameMode: GameMode;
  descriptionTime: number;
  discussionTime: number;
  defenseTime: number;
  category: string;
  players: Player[];
  state: RoomState;
  game: Game | null;
  createdAt: number;
  lastActivity: number;
}

// 단어 쌍
export interface WordPair {
  citizen: string;
  liar: string;
}

// 단어 카테고리
export interface WordCategory {
  name: string;
  pairs: WordPair[];
}

// 로비 방 정보
export interface LobbyRoomInfo {
  id: string;
  name: string;
  isPublic: boolean;
  playerCount: number;
  maxPlayers: number;
  gameMode: GameMode;
  category: string;
  state: RoomState;
}

// 게임 결과
export type GameResult = 'citizen-win' | 'liar-win' | 'liar-reverse-win';

// 클라이언트에 전송할 방 정보 (민감한 정보 제외)
export interface RoomInfoForClient {
  id: string;
  name: string;
  hostId: string;
  isPublic: boolean;
  maxPlayers: number;
  gameMode: GameMode;
  descriptionTime: number;
  discussionTime: number;
  defenseTime: number;
  category: string;
  players: Player[];
  state: RoomState;
}
