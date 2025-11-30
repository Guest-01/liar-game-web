import { GameRoom } from './Room';
import { GameMode, PublicRoomInfo } from './types';
import { generateRoomCode } from '../utils/roomCode';

export class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  private playerToRoom: Map<string, string> = new Map(); // playerId -> roomCode
  private pendingDeletions: Map<string, NodeJS.Timeout> = new Map(); // roomCode -> timeout

  // 방 생성
  createRoom(
    hostId: string,
    hostNickname: string,
    roomName: string,
    options: {
      isPublic?: boolean;
      maxPlayers?: number;
      gameMode?: GameMode;
      descriptionTime?: number;
      discussionTime?: number;
      defenseTime?: number;
      category?: string;
    } = {}
  ): GameRoom | null {
    // 이미 방에 있으면 생성 불가
    if (this.playerToRoom.has(hostId)) {
      return null;
    }

    // 고유한 방 코드 생성
    let code: string;
    do {
      code = generateRoomCode();
    } while (this.rooms.has(code));

    const room = new GameRoom(code, roomName, hostId, options);
    room.addPlayer(hostId, hostNickname, true);

    this.rooms.set(code, room);
    this.playerToRoom.set(hostId, code);

    return room;
  }

  // 방 참가
  joinRoom(roomCode: string, playerId: string, nickname: string): GameRoom | null {
    const upperCode = roomCode.toUpperCase();
    const room = this.rooms.get(upperCode);
    if (!room) return null;

    // 이미 다른 방에 있으면 참가 불가
    const currentRoom = this.playerToRoom.get(playerId);
    if (currentRoom && currentRoom !== upperCode) {
      return null;
    }

    // 게임 중이면 참가 불가
    if (room.state !== 'waiting') {
      return null;
    }

    // 예약된 삭제가 있으면 취소
    const pendingTimeout = this.pendingDeletions.get(upperCode);
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
      this.pendingDeletions.delete(upperCode);
    }

    // 재접속인지 확인
    const existingPlayer = room.players.find(p => p.id === playerId);
    if (existingPlayer) {
      room.setPlayerConnected(playerId, true);
      this.playerToRoom.set(playerId, upperCode);
      return room;
    }

    // 새 플레이어 추가
    const player = room.addPlayer(playerId, nickname);
    if (!player) return null;

    this.playerToRoom.set(playerId, upperCode);
    return room;
  }

  // 방 나가기
  leaveRoom(playerId: string): { room: GameRoom | null; deleted: boolean } {
    const roomCode = this.playerToRoom.get(playerId);
    if (!roomCode) return { room: null, deleted: false };

    const room = this.rooms.get(roomCode);
    if (!room) {
      this.playerToRoom.delete(playerId);
      return { room: null, deleted: false };
    }

    room.removePlayer(playerId);
    this.playerToRoom.delete(playerId);

    // 방에 아무도 없으면 30초 후 삭제 예약
    if (room.players.length === 0) {
      const timeout = setTimeout(() => {
        // 아직 비어있으면 삭제
        if (room.players.length === 0) {
          this.rooms.delete(roomCode);
          this.pendingDeletions.delete(roomCode);
        }
      }, 30000); // 30초 유예

      this.pendingDeletions.set(roomCode, timeout);
      return { room, deleted: false }; // 아직 삭제 안 됨
    }

    return { room, deleted: false };
  }

  // 방 가져오기
  getRoom(roomCode: string): GameRoom | null {
    return this.rooms.get(roomCode.toUpperCase()) || null;
  }

  // 플레이어가 속한 방 가져오기
  getRoomByPlayerId(playerId: string): GameRoom | null {
    const roomCode = this.playerToRoom.get(playerId);
    if (!roomCode) return null;
    return this.rooms.get(roomCode) || null;
  }

  // 공개 방 목록
  getPublicRooms(): PublicRoomInfo[] {
    const publicRooms: PublicRoomInfo[] = [];

    for (const room of this.rooms.values()) {
      if (room.isPublic && room.state === 'waiting' && room.players.length < room.maxPlayers) {
        publicRooms.push(room.getPublicInfo());
      }
    }

    return publicRooms;
  }

  // 오래된 방 정리 (1시간 이상 활동 없음)
  cleanupInactiveRooms(maxInactiveMs: number = 60 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [code, room] of this.rooms.entries()) {
      if (now - room.lastActivity > maxInactiveMs) {
        // 방에 있는 플레이어들 매핑 제거
        for (const player of room.players) {
          this.playerToRoom.delete(player.id);
        }
        this.rooms.delete(code);
        cleaned++;
      }
    }

    return cleaned;
  }

  // 통계
  getStats(): { roomCount: number; playerCount: number } {
    return {
      roomCount: this.rooms.size,
      playerCount: this.playerToRoom.size
    };
  }
}

// 싱글톤 인스턴스
export const roomManager = new RoomManager();
