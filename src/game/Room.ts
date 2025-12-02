import { Room, Player, Game, RoomState, GameMode, PublicRoomInfo, RoomInfoForClient } from './types';
import { getRandomWordPair } from '../data/words';

export class GameRoom implements Room {
  code: string;
  name: string;
  hostId: string;
  isPublic: boolean;
  maxPlayers: number;
  gameMode: GameMode;
  descriptionTime: number;
  discussionTime: number;
  defenseTime: number;
  liarGuessTime: number;
  category: string;
  players: Player[];
  state: RoomState;
  game: Game | null;
  createdAt: number;
  lastActivity: number;

  constructor(
    code: string,
    name: string,
    hostId: string,
    options: {
      isPublic?: boolean;
      maxPlayers?: number;
      gameMode?: GameMode;
      descriptionTime?: number;
      discussionTime?: number;
      defenseTime?: number;
      category?: string;
    } = {}
  ) {
    this.code = code;
    this.name = name;
    this.hostId = hostId;
    this.isPublic = options.isPublic ?? true;
    this.maxPlayers = options.maxPlayers ?? 8;
    this.gameMode = options.gameMode ?? 'normal';
    this.descriptionTime = options.descriptionTime ?? 15;
    this.discussionTime = options.discussionTime ?? 120;
    this.defenseTime = options.defenseTime ?? 15;
    this.liarGuessTime = 15; // 라이어 정답 맞추기 시간 (15초 고정)
    this.category = options.category ?? '음식';
    this.players = [];
    this.state = 'waiting';
    this.game = null;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
  }

  // 플레이어 추가
  addPlayer(id: string, nickname: string, isHost: boolean = false): Player | null {
    if (this.players.length >= this.maxPlayers) {
      return null;
    }
    if (this.players.find(p => p.id === id)) {
      return null;
    }
    // 닉네임 중복 검사
    if (this.players.find(p => p.nickname === nickname)) {
      return null;
    }

    // 방이 비어있으면 첫 번째 플레이어가 호스트가 됨
    const shouldBeHost = isHost || this.players.length === 0;

    const player: Player = {
      id,
      nickname,
      isHost: shouldBeHost,
      isConnected: true,
      hasCheckedWord: false,
      description: null,
      nominatedId: null
    };

    if (shouldBeHost) {
      this.hostId = id;
    }

    this.players.push(player);
    this.updateActivity();
    return player;
  }

  // 플레이어 제거
  removePlayer(id: string): boolean {
    const index = this.players.findIndex(p => p.id === id);
    if (index === -1) return false;

    const wasHost = this.players[index].isHost;
    this.players.splice(index, 1);

    // 호스트가 나갔고 다른 플레이어가 있으면 호스트 이전
    if (wasHost && this.players.length > 0) {
      this.players[0].isHost = true;
      this.hostId = this.players[0].id;
    }

    this.updateActivity();
    return true;
  }

  // 플레이어 연결 상태 업데이트
  setPlayerConnected(id: string, connected: boolean): void {
    const player = this.players.find(p => p.id === id);
    if (player) {
      player.isConnected = connected;
      this.updateActivity();
    }
  }

  // 게임 시작
  startGame(): boolean {
    if (this.state !== 'waiting') return false;
    if (this.players.length < 3) return false;

    // 랜덤 라이어 선정
    const liarIndex = Math.floor(Math.random() * this.players.length);
    const liarId = this.players[liarIndex].id;

    // 단어 쌍 가져오기
    const wordPair = getRandomWordPair(this.category);
    if (!wordPair) return false;

    // 설명 순서 랜덤 셔플
    const descriptionOrder = this.players.map(p => p.id);
    for (let i = descriptionOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [descriptionOrder[i], descriptionOrder[j]] = [descriptionOrder[j], descriptionOrder[i]];
    }

    this.game = {
      liarId,
      citizenWord: wordPair.citizen,
      liarWord: this.gameMode === 'fool' ? wordPair.liar : null,
      descriptionOrder,
      currentDescriberIndex: 0,
      descriptions: {},
      nominations: {},
      nominatedPlayerId: null,
      finalVotes: {},
      discussionEndTime: 0,
      defenseEndTime: 0,
      liarGuessEndTime: 0,
      liarGuess: null
    };

    // 플레이어 상태 초기화
    this.players.forEach(p => {
      p.hasCheckedWord = false;
      p.description = null;
      p.nominatedId = null;
    });

    this.state = 'word-check';
    this.updateActivity();
    return true;
  }

  // 플레이어의 단어 가져오기
  getWordForPlayer(playerId: string): { word: string | null; isLiar: boolean } {
    if (!this.game) return { word: null, isLiar: false };

    const isLiar = this.game.liarId === playerId;

    if (isLiar) {
      if (this.gameMode === 'normal') {
        // 일반 모드: 라이어는 제시어 없이 "라이어입니다" 표시
        return { word: null, isLiar: true };
      } else {
        // 바보 모드: 라이어도 (다른) 단어를 받음
        return { word: this.game.liarWord, isLiar: false }; // isLiar: false로 숨김
      }
    }

    return { word: this.game.citizenWord, isLiar: false };
  }

  // 단어 확인 완료
  checkWord(playerId: string): boolean {
    const player = this.players.find(p => p.id === playerId);
    if (!player || this.state !== 'word-check') return false;

    player.hasCheckedWord = true;
    this.updateActivity();

    // 모든 플레이어가 확인했는지 체크
    if (this.players.every(p => p.hasCheckedWord)) {
      this.state = 'description';
      return true;
    }
    return false;
  }

  // 현재 설명 차례인 플레이어 ID
  getCurrentDescriberId(): string | null {
    if (!this.game || this.state !== 'description') return null;
    return this.game.descriptionOrder[this.game.currentDescriberIndex] || null;
  }

  // 설명 제출
  submitDescription(playerId: string, description: string): boolean {
    if (!this.game || this.state !== 'description') return false;
    if (this.getCurrentDescriberId() !== playerId) return false;

    const player = this.players.find(p => p.id === playerId);
    if (!player) return false;

    player.description = description;
    this.game.descriptions[playerId] = description;
    this.game.currentDescriberIndex++;
    this.updateActivity();

    // 모든 플레이어가 설명했는지 체크
    if (this.game.currentDescriberIndex >= this.players.length) {
      this.state = 'discussion';
      this.game.discussionEndTime = Date.now() + this.discussionTime * 1000;
    }

    return true;
  }

  // 지목
  nominate(voterId: string, targetId: string): boolean {
    if (!this.game || this.state !== 'discussion') return false;
    if (voterId === targetId) return false;
    if (!this.players.find(p => p.id === targetId)) return false;

    const voter = this.players.find(p => p.id === voterId);
    if (!voter) return false;

    voter.nominatedId = targetId;
    this.game.nominations[voterId] = targetId;
    this.updateActivity();

    return true;
  }

  // 모든 플레이어가 지목했는지 확인
  allNominated(): boolean {
    return this.players.every(p => p.nominatedId !== null);
  }

  // 지목 결과 계산 (최다 득표자 반환, 동점 시 null)
  calculateNominationResult(): { winnerId: string | null; isTie: boolean; tiedPlayerIds: string[] } {
    if (!this.game) return { winnerId: null, isTie: false, tiedPlayerIds: [] };

    const votes: Record<string, number> = {};

    for (const targetId of Object.values(this.game.nominations)) {
      votes[targetId] = (votes[targetId] || 0) + 1;
    }

    const maxVotes = Math.max(...Object.values(votes), 0);
    if (maxVotes === 0) return { winnerId: null, isTie: false, tiedPlayerIds: [] };

    const topVoted = Object.entries(votes)
      .filter(([_, count]) => count === maxVotes)
      .map(([id]) => id);

    if (topVoted.length === 1) {
      return { winnerId: topVoted[0], isTie: false, tiedPlayerIds: [] };
    }

    return { winnerId: null, isTie: true, tiedPlayerIds: topVoted };
  }

  // 최후 변론 시작
  startDefense(defenderId: string): void {
    if (!this.game) return;
    this.game.nominatedPlayerId = defenderId;
    this.state = 'defense';
    this.game.defenseEndTime = Date.now() + this.defenseTime * 1000;
    this.updateActivity();
  }

  // 재토론 (동점 시)
  restartDiscussion(): void {
    if (!this.game) return;

    // 지목 초기화
    this.players.forEach(p => p.nominatedId = null);
    this.game.nominations = {};
    this.state = 'discussion';
    this.game.discussionEndTime = Date.now() + this.discussionTime * 1000;
    this.updateActivity();
  }

  // 최종 투표 시작
  startFinalVote(): void {
    if (!this.game) return;
    this.state = 'final-vote';
    this.game.finalVotes = {};
    this.updateActivity();
  }

  // 최종 투표
  finalVote(voterId: string, agree: boolean): boolean {
    if (!this.game || this.state !== 'final-vote') return false;
    // 지목된 사람은 투표 불가
    if (voterId === this.game.nominatedPlayerId) return false;

    this.game.finalVotes[voterId] = agree;
    this.updateActivity();
    return true;
  }

  // 최종 투표 결과 계산
  calculateFinalVoteResult(): { agree: number; disagree: number; confirmed: boolean } {
    if (!this.game) return { agree: 0, disagree: 0, confirmed: false };

    let agree = 0;
    let disagree = 0;

    for (const vote of Object.values(this.game.finalVotes)) {
      if (vote) agree++;
      else disagree++;
    }

    // 지목된 사람 제외한 인원 중 과반수
    const votersCount = this.players.length - 1;
    const confirmed = agree > votersCount / 2;

    return { agree, disagree, confirmed };
  }

  // 모든 플레이어가 최종 투표했는지
  allFinalVoted(): boolean {
    if (!this.game) return false;
    // 지목된 사람 제외
    const voters = this.players.filter(p => p.id !== this.game?.nominatedPlayerId);
    return voters.every(p => this.game?.finalVotes[p.id] !== undefined);
  }

  // 라이어 정답 맞추기 단계
  startLiarGuess(): void {
    if (!this.game) return;
    this.state = 'liar-guess';
    this.game.liarGuessEndTime = Date.now() + this.liarGuessTime * 1000;
    this.updateActivity();
  }

  // 라이어 정답 제출
  submitLiarGuess(guess: string): boolean {
    if (!this.game || this.state !== 'liar-guess') return false;
    this.game.liarGuess = guess;
    this.state = 'result';
    this.updateActivity();
    return true;
  }

  // 게임 결과 계산
  getGameResult(): {
    winner: 'citizen' | 'liar';
    liarId: string;
    citizenWord: string;
    liarWord: string | null;
    nominatedPlayerId: string | null;
    wasLiarCaught: boolean;
    liarGuessedCorrectly: boolean;
    liarGuess: string | null;
  } | null {
    if (!this.game) return null;

    const wasLiarCaught = this.game.nominatedPlayerId === this.game.liarId;
    const liarGuessedCorrectly =
      this.game.liarGuess?.toLowerCase().trim() === this.game.citizenWord.toLowerCase().trim();

    let winner: 'citizen' | 'liar';
    if (wasLiarCaught) {
      winner = liarGuessedCorrectly ? 'liar' : 'citizen';
    } else {
      winner = 'liar';
    }

    return {
      winner,
      liarId: this.game.liarId,
      citizenWord: this.game.citizenWord,
      liarWord: this.game.liarWord,
      nominatedPlayerId: this.game.nominatedPlayerId,
      wasLiarCaught,
      liarGuessedCorrectly,
      liarGuess: this.game.liarGuess
    };
  }

  // 결과 단계로 직접 이동 (과반수 미달 시)
  goToResult(): void {
    this.state = 'result';
    this.updateActivity();
  }

  // 게임 재시작 (대기실로)
  resetGame(): void {
    this.state = 'waiting';
    this.game = null;
    this.players.forEach(p => {
      p.hasCheckedWord = false;
      p.description = null;
      p.nominatedId = null;
    });
    this.updateActivity();
  }

  // 활동 시간 업데이트
  private updateActivity(): void {
    this.lastActivity = Date.now();
  }

  // 공개 방 정보 (로비용)
  getPublicInfo(): PublicRoomInfo {
    return {
      code: this.code,
      name: this.name,
      playerCount: this.players.length,
      maxPlayers: this.maxPlayers,
      gameMode: this.gameMode,
      category: this.category,
      state: this.state
    };
  }

  // 클라이언트용 방 정보 (민감 정보 제외)
  getInfoForClient(): RoomInfoForClient {
    return {
      code: this.code,
      name: this.name,
      hostId: this.hostId,
      isPublic: this.isPublic,
      maxPlayers: this.maxPlayers,
      gameMode: this.gameMode,
      descriptionTime: this.descriptionTime,
      discussionTime: this.discussionTime,
      defenseTime: this.defenseTime,
      category: this.category,
      players: this.players,
      state: this.state
    };
  }
}
