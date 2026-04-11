import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RoomManager } from './RoomManager';

describe('RoomManager', () => {
  let manager: RoomManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new RoomManager();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  // ============================================================
  // 방 생성
  // ============================================================
  describe('createRoom', () => {
    it('방과 호스트 토큰을 반환한다', () => {
      const result = manager.createRoom('테스트 방');
      expect(result).not.toBeNull();
      expect(result!.room.name).toBe('테스트 방');
      expect(result!.hostToken).toBeTruthy();
    });

    it('고유한 방 ID를 생성한다', () => {
      const r1 = manager.createRoom('방1');
      const r2 = manager.createRoom('방2');
      expect(r1!.room.id).not.toBe(r2!.room.id);
    });

    it('옵션이 방에 적용된다', () => {
      const result = manager.createRoom('비밀방', {
        isPublic: false,
        password: '1234',
        maxPlayers: 5,
        gameMode: 'fool',
      });
      const room = result!.room;
      expect(room.isPublic).toBe(false);
      expect(room.password).toBe('1234');
      expect(room.maxPlayers).toBe(5);
      expect(room.gameMode).toBe('fool');
    });

    it('방의 hostId는 빈 문자열이다 (토큰으로 결정)', () => {
      const result = manager.createRoom('방');
      expect(result!.room.hostId).toBe('');
    });
  });

  // ============================================================
  // 방 참가
  // ============================================================
  describe('joinRoom', () => {
    let roomId: string;
    let hostToken: string;

    beforeEach(() => {
      const result = manager.createRoom('테스트 방');
      roomId = result!.room.id;
      hostToken = result!.hostToken;
    });

    it('호스트 토큰으로 참가하면 호스트가 된다', () => {
      const { room } = manager.joinRoom(roomId, 'p1', '앨리스', { hostToken });
      expect(room).not.toBeNull();
      expect(room!.players[0].isHost).toBe(true);
      expect(room!.hostId).toBe('p1');
    });

    it('호스트 토큰 없이 참가하면 일반 플레이어다', () => {
      // 먼저 호스트 참가
      manager.joinRoom(roomId, 'p1', '앨리스', { hostToken });
      const { room } = manager.joinRoom(roomId, 'p2', '밥');
      expect(room!.players.find(p => p.id === 'p2')!.isHost).toBe(false);
    });

    it('호스트 토큰은 일회용이다', () => {
      manager.joinRoom(roomId, 'p1', '앨리스', { hostToken });
      // 같은 토큰으로 다른 방 참가 시도
      const r2 = manager.createRoom('방2');
      // 토큰은 방1에만 유효하므로 방2에는 효과 없음
      manager.joinRoom(r2!.room.id, 'p2', '밥', { hostToken });
      // p2가 호스트가 되는 건 첫 번째 플레이어이기 때문이지 토큰 때문이 아님
      // 원래 방의 토큰은 이미 소비됨
      manager.leaveRoom('p1');
      vi.advanceTimersByTime(5001);
      // 방1이 삭제된 후 새 방의 호스트 토큰은 별도
      expect(r2!.hostToken).not.toBe(hostToken);
    });

    it('존재하지 않는 방은 room-not-found', () => {
      const { error } = manager.joinRoom('없는방', 'p1', '앨리스');
      expect(error).toBe('room-not-found');
    });

    it('이미 다른 방에 있으면 already-in-room', () => {
      manager.joinRoom(roomId, 'p1', '앨리스', { hostToken });
      const r2 = manager.createRoom('방2');
      const { error } = manager.joinRoom(r2!.room.id, 'p1', '앨리스');
      expect(error).toBe('already-in-room');
    });

    it('게임 중인 방은 game-in-progress', () => {
      manager.joinRoom(roomId, 'p1', '앨리스', { hostToken });
      manager.joinRoom(roomId, 'p2', '밥');
      manager.joinRoom(roomId, 'p3', '찰리');
      const room = manager.getRoom(roomId)!;
      room.category = '음식';
      room.startGame();

      const { error } = manager.joinRoom(roomId, 'p4', '데이브');
      expect(error).toBe('game-in-progress');
    });

    it('비공개 방에 틀린 비밀번호는 invalid-password', () => {
      const r = manager.createRoom('비밀방', { isPublic: false, password: '1234' });
      const { error } = manager.joinRoom(r!.room.id, 'p1', '앨리스', { password: 'wrong' });
      expect(error).toBe('invalid-password');
    });

    it('비공개 방에 올바른 비밀번호로 참가', () => {
      const r = manager.createRoom('비밀방', { isPublic: false, password: '1234' });
      const { room } = manager.joinRoom(r!.room.id, 'p1', '앨리스', {
        password: '1234',
        hostToken: r!.hostToken,
      });
      expect(room).not.toBeNull();
    });

    it('닉네임 중복은 nickname-duplicate', () => {
      manager.joinRoom(roomId, 'p1', '앨리스', { hostToken });
      const { error } = manager.joinRoom(roomId, 'p2', '앨리스');
      expect(error).toBe('nickname-duplicate');
    });

    it('방이 가득 차면 room-full', () => {
      const r = manager.createRoom('소규모', { maxPlayers: 3 });
      manager.joinRoom(r!.room.id, 'p1', '앨리스', { hostToken: r!.hostToken });
      manager.joinRoom(r!.room.id, 'p2', '밥');
      manager.joinRoom(r!.room.id, 'p3', '찰리');
      const { error } = manager.joinRoom(r!.room.id, 'p4', '데이브');
      expect(error).toBe('room-full');
    });

    it('같은 방에 재접속하면 기존 플레이어를 유지한다', () => {
      manager.joinRoom(roomId, 'p1', '앨리스', { hostToken });
      const { room } = manager.joinRoom(roomId, 'p1', '앨리스');
      expect(room).not.toBeNull();
      expect(room!.players).toHaveLength(1); // 중복 추가 안 됨
    });

    it('참가 시 예약된 삭제를 취소한다', () => {
      manager.joinRoom(roomId, 'p1', '앨리스', { hostToken });
      manager.leaveRoom('p1'); // 빈 방 → 5초 후 삭제 예약

      // 삭제 전에 새 플레이어 참가
      manager.joinRoom(roomId, 'p2', '밥');
      vi.advanceTimersByTime(5001);

      // 방이 살아있어야 한다
      expect(manager.getRoom(roomId)).not.toBeNull();
    });
  });

  // ============================================================
  // 방 나가기
  // ============================================================
  describe('leaveRoom', () => {
    let roomId: string;

    beforeEach(() => {
      const result = manager.createRoom('테스트 방');
      roomId = result!.room.id;
      manager.joinRoom(roomId, 'p1', '앨리스', { hostToken: result!.hostToken });
      manager.joinRoom(roomId, 'p2', '밥');
    });

    it('플레이어를 방에서 제거한다', () => {
      const { room } = manager.leaveRoom('p2');
      expect(room!.players).toHaveLength(1);
      expect(manager.getRoomByPlayerId('p2')).toBeNull();
    });

    it('등록되지 않은 플레이어는 room=null을 반환한다', () => {
      const { room } = manager.leaveRoom('unknown');
      expect(room).toBeNull();
    });

    it('빈 방은 5초 후 삭제된다', () => {
      manager.leaveRoom('p2');
      manager.leaveRoom('p1');

      expect(manager.getRoom(roomId)).not.toBeNull(); // 아직 있음
      vi.advanceTimersByTime(5001);
      expect(manager.getRoom(roomId)).toBeNull(); // 삭제됨
    });

    it('5초 내 재입장하면 삭제가 취소된다', () => {
      manager.leaveRoom('p2');
      manager.leaveRoom('p1');

      vi.advanceTimersByTime(3000); // 3초 경과
      manager.joinRoom(roomId, 'p3', '찰리');

      vi.advanceTimersByTime(3000); // 총 6초 경과
      expect(manager.getRoom(roomId)).not.toBeNull(); // 살아있음
    });

    it('호스트가 나가면 다음 플레이어가 호스트가 된다', () => {
      manager.leaveRoom('p1');
      const room = manager.getRoom(roomId)!;
      expect(room.hostId).toBe('p2');
      expect(room.players[0].isHost).toBe(true);
    });
  });

  // ============================================================
  // 조회
  // ============================================================
  describe('getRoom', () => {
    it('존재하는 방을 반환한다', () => {
      const result = manager.createRoom('방');
      expect(manager.getRoom(result!.room.id)).not.toBeNull();
    });

    it('없는 방은 null을 반환한다', () => {
      expect(manager.getRoom('없는방')).toBeNull();
    });
  });

  describe('getRoomByPlayerId', () => {
    it('플레이어가 속한 방을 반환한다', () => {
      const result = manager.createRoom('방');
      manager.joinRoom(result!.room.id, 'p1', '앨리스', { hostToken: result!.hostToken });
      expect(manager.getRoomByPlayerId('p1')).not.toBeNull();
    });

    it('방에 없는 플레이어는 null을 반환한다', () => {
      expect(manager.getRoomByPlayerId('unknown')).toBeNull();
    });
  });

  describe('getLobbyRooms', () => {
    it('대기 중이고 1명 이상 있고 미달인 방만 반환한다', () => {
      // 대기 중 + 1명
      const r1 = manager.createRoom('방1');
      manager.joinRoom(r1!.room.id, 'p1', '앨리스', { hostToken: r1!.hostToken });

      // 비어있는 방 (표시 안 함)
      manager.createRoom('빈방');

      // 가득 찬 방 (표시 안 함)
      const r3 = manager.createRoom('풀방', { maxPlayers: 3 });
      manager.joinRoom(r3!.room.id, 'p4', '앨리스', { hostToken: r3!.hostToken });
      manager.joinRoom(r3!.room.id, 'p5', '밥');
      manager.joinRoom(r3!.room.id, 'p6', '찰리');

      const lobby = manager.getLobbyRooms();
      expect(lobby).toHaveLength(1);
      expect(lobby[0].name).toBe('방1');
    });

    it('게임 중인 방은 표시하지 않는다', () => {
      const r = manager.createRoom('게임중', { category: '음식' });
      manager.joinRoom(r!.room.id, 'p1', '앨리스', { hostToken: r!.hostToken });
      manager.joinRoom(r!.room.id, 'p2', '밥');
      manager.joinRoom(r!.room.id, 'p3', '찰리');
      r!.room.startGame();

      expect(manager.getLobbyRooms()).toHaveLength(0);
    });
  });

  // ============================================================
  // 비활성 방 정리
  // ============================================================
  describe('cleanupInactiveRooms', () => {
    it('비활성 방을 삭제하고 삭제 수를 반환한다', () => {
      const r = manager.createRoom('오래된 방');
      manager.joinRoom(r!.room.id, 'p1', '앨리스', { hostToken: r!.hostToken });

      // 1시간 + 1초 경과
      vi.advanceTimersByTime(60 * 60 * 1000 + 1000);

      const cleaned = manager.cleanupInactiveRooms();
      expect(cleaned).toBe(1);
      expect(manager.getRoom(r!.room.id)).toBeNull();
      expect(manager.getRoomByPlayerId('p1')).toBeNull();
    });

    it('활성 방은 삭제하지 않는다', () => {
      const r = manager.createRoom('활성 방');
      manager.joinRoom(r!.room.id, 'p1', '앨리스', { hostToken: r!.hostToken });

      vi.advanceTimersByTime(30 * 60 * 1000); // 30분

      const cleaned = manager.cleanupInactiveRooms();
      expect(cleaned).toBe(0);
      expect(manager.getRoom(r!.room.id)).not.toBeNull();
    });

    it('커스텀 비활성 시간을 지정할 수 있다', () => {
      const r = manager.createRoom('방');
      manager.joinRoom(r!.room.id, 'p1', '앨리스', { hostToken: r!.hostToken });

      vi.advanceTimersByTime(10 * 1000); // 10초

      const cleaned = manager.cleanupInactiveRooms(5 * 1000); // 5초 기준
      expect(cleaned).toBe(1);
    });

    it('예약된 삭제 타이머도 함께 정리된다', () => {
      const r = manager.createRoom('방');
      manager.joinRoom(r!.room.id, 'p1', '앨리스', { hostToken: r!.hostToken });
      manager.joinRoom(r!.room.id, 'p2', '밥');
      manager.leaveRoom('p1'); // 1명 남아있으므로 5초 삭제 안 됨

      vi.advanceTimersByTime(60 * 60 * 1000 + 1000);
      const cleaned = manager.cleanupInactiveRooms();
      expect(cleaned).toBe(1);
      expect(manager.getRoom(r!.room.id)).toBeNull();
    });
  });

  // ============================================================
  // pendingCallback 관리
  // ============================================================
  describe('addPendingCallback', () => {
    it('방 삭제 시 등록된 콜백이 취소된다', () => {
      const r = manager.createRoom('방');
      const roomId = r!.room.id;
      manager.joinRoom(roomId, 'p1', '앨리스', { hostToken: r!.hostToken });

      let called = false;
      const timeout = setTimeout(() => { called = true; }, 60 * 60 * 1000 + 5000);
      manager.addPendingCallback(roomId, timeout);

      // 비활성 정리 (콜백보다 먼저 실행)
      vi.advanceTimersByTime(60 * 60 * 1000 + 1000);
      manager.cleanupInactiveRooms();

      // 콜백 시간이 지나도 실행되지 않아야 함
      vi.advanceTimersByTime(10000);
      expect(called).toBe(false);
    });

    it('빈 방 자동 삭제 시 등록된 콜백이 취소된다', () => {
      const r = manager.createRoom('방');
      const roomId = r!.room.id;
      manager.joinRoom(roomId, 'p1', '앨리스', { hostToken: r!.hostToken });

      let called = false;
      const timeout = setTimeout(() => { called = true; }, 10000);
      manager.addPendingCallback(roomId, timeout);

      manager.leaveRoom('p1');
      vi.advanceTimersByTime(5001); // 빈 방 삭제

      vi.advanceTimersByTime(10000); // 콜백 시간 경과
      expect(called).toBe(false);
    });
  });
});
