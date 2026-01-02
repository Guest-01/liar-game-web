import { GameRoom } from './Room';
import { GameMode, LobbyRoomInfo } from './types';
import { generateRoomId } from '../utils/roomId';
import { nanoid } from 'nanoid';

export class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  private playerToRoom: Map<string, string> = new Map(); // playerId -> roomId
  private pendingDeletions: Map<string, NodeJS.Timeout> = new Map(); // roomId -> timeout
  private hostTokens: Map<string, string> = new Map(); // roomId -> hostToken
  private pendingCallbacks: Map<string, NodeJS.Timeout[]> = new Map(); // roomId -> timeouts

  // 방에 연결된 타이머 추가 (방 삭제 시 자동 취소)
  addPendingCallback(roomId: string, timeout: NodeJS.Timeout): void {
    const existing = this.pendingCallbacks.get(roomId) || [];
    existing.push(timeout);
    this.pendingCallbacks.set(roomId, existing);
  }

  // 방에 연결된 모든 타이머 취소
  private clearPendingCallbacks(roomId: string): void {
    const timeouts = this.pendingCallbacks.get(roomId) || [];
    timeouts.forEach(t => clearTimeout(t));
    this.pendingCallbacks.delete(roomId);
  }

  // 방 생성 (플레이어 추가 없이 방만 생성, hostToken 반환)
  createRoom(
    roomName: string,
    options: {
      isPublic?: boolean;
      password?: string | null;
      maxPlayers?: number;
      gameMode?: GameMode;
      descriptionTime?: number;
      discussionTime?: number;
      defenseTime?: number;
      category?: string;
    } = {}
  ): { room: GameRoom; hostToken: string } | null {
    // 고유한 방 ID 생성
    let id: string;
    do {
      id = generateRoomId();
    } while (this.rooms.has(id));

    // 임시 hostId (첫 번째로 hostToken과 함께 참가하는 사람이 호스트가 됨)
    const room = new GameRoom(id, roomName, '', options);

    // 일회용 호스트 토큰 생성
    const hostToken = nanoid(16);
    this.hostTokens.set(id, hostToken);

    this.rooms.set(id, room);

    return { room, hostToken };
  }

  // 방 참가
  joinRoom(
    roomId: string,
    playerId: string,
    nickname: string,
    options?: { password?: string; hostToken?: string }
  ): { room: GameRoom | null; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { room: null, error: 'room-not-found' };
    }

    // 이미 다른 방에 있으면 참가 불가
    const currentRoomId = this.playerToRoom.get(playerId);
    if (currentRoomId && currentRoomId !== roomId) {
      return { room: null, error: 'already-in-room' };
    }

    // 게임 중이면 참가 불가
    if (room.state !== 'waiting') {
      return { room: null, error: 'game-in-progress' };
    }

    // 비공개 방 비밀번호 검증
    if (!room.isPublic && room.password) {
      if (!options?.password || options.password !== room.password) {
        return { room: null, error: 'invalid-password' };
      }
    }

    // 예약된 삭제가 있으면 취소
    const pendingTimeout = this.pendingDeletions.get(roomId);
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
      this.pendingDeletions.delete(roomId);
    }

    // 재접속인지 확인 (플레이어가 이미 방에 있는 경우)
    const existingPlayer = room.players.find(p => p.id === playerId);
    if (existingPlayer) {
      this.playerToRoom.set(playerId, roomId);
      return { room };
    }

    // 닉네임 중복 검사
    const duplicatePlayer = room.players.find(p => p.nickname === nickname);
    if (duplicatePlayer) {
      return { room: null, error: 'nickname-duplicate' };
    }

    // 방이 가득 찼는지 확인
    if (room.players.length >= room.maxPlayers) {
      return { room: null, error: 'room-full' };
    }

    // hostToken 검증 - 유효하면 호스트로 입장
    const isHost = this.validateAndConsumeHostToken(roomId, options?.hostToken);

    // 새 플레이어 추가
    const player = room.addPlayer(playerId, nickname, isHost);
    if (!player) {
      return { room: null, error: 'join-failed' };
    }

    this.playerToRoom.set(playerId, roomId);
    return { room };
  }

  // 호스트 토큰 검증 및 소비 (일회용)
  private validateAndConsumeHostToken(roomId: string, token?: string): boolean {
    if (!token) return false;

    const storedToken = this.hostTokens.get(roomId);
    if (storedToken && storedToken === token) {
      this.hostTokens.delete(roomId); // 일회용이므로 삭제
      return true;
    }
    return false;
  }

  // 방 나가기
  leaveRoom(playerId: string): { room: GameRoom | null; deleted: boolean } {
    const roomId = this.playerToRoom.get(playerId);
    if (!roomId) return { room: null, deleted: false };

    const room = this.rooms.get(roomId);
    if (!room) {
      this.playerToRoom.delete(playerId);
      return { room: null, deleted: false };
    }

    room.removePlayer(playerId);
    this.playerToRoom.delete(playerId);

    // 방에 아무도 없으면 5초 후 삭제 (리다이렉트 대기)
    if (room.players.length === 0) {
      // 기존 삭제 타이머가 있으면 먼저 취소
      const existingTimeout = this.pendingDeletions.get(roomId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      const timeout = setTimeout(() => {
        if (room.players.length === 0) {
          this.clearPendingCallbacks(roomId);
          this.rooms.delete(roomId);
          this.hostTokens.delete(roomId);
          this.pendingDeletions.delete(roomId);
        }
      }, 5000);

      this.pendingDeletions.set(roomId, timeout);
      return { room, deleted: false };
    }

    return { room, deleted: false };
  }

  // 방 가져오기
  getRoom(roomId: string): GameRoom | null {
    return this.rooms.get(roomId) || null;
  }

  // 플레이어가 속한 방 가져오기
  getRoomByPlayerId(playerId: string): GameRoom | null {
    const roomId = this.playerToRoom.get(playerId);
    if (!roomId) return null;
    return this.rooms.get(roomId) || null;
  }

  // 로비 방 목록 (공개/비공개 모두)
  getLobbyRooms(): LobbyRoomInfo[] {
    const lobbyRooms: LobbyRoomInfo[] = [];

    for (const room of this.rooms.values()) {
      // 대기 중 + 최소 1명 이상 + 인원 미달인 방만 표시
      if (room.state === 'waiting' && room.players.length > 0 && room.players.length < room.maxPlayers) {
        lobbyRooms.push(room.getLobbyInfo());
      }
    }

    return lobbyRooms;
  }

  // 오래된 방 정리 (1시간 이상 활동 없음)
  cleanupInactiveRooms(maxInactiveMs: number = 60 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, room] of this.rooms.entries()) {
      if (now - room.lastActivity > maxInactiveMs) {
        // 방에 있는 플레이어들 매핑 제거
        for (const player of room.players) {
          this.playerToRoom.delete(player.id);
        }
        // 예약된 삭제 타이머 취소
        const pendingTimeout = this.pendingDeletions.get(id);
        if (pendingTimeout) {
          clearTimeout(pendingTimeout);
          this.pendingDeletions.delete(id);
        }
        // 방에 연결된 게임 콜백 취소
        this.clearPendingCallbacks(id);
        this.hostTokens.delete(id);
        this.rooms.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }
}

// 싱글톤 인스턴스
export const roomManager = new RoomManager();
