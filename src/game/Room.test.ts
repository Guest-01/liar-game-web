import { describe, it, expect, beforeEach } from 'vitest';
import { GameRoom } from './Room';
import { REDO_DESCRIPTION_ID } from './types';

// 테스트용 헬퍼: 3명이 참가한 방을 생성
function createRoomWithPlayers(options?: Parameters<typeof GameRoom.prototype.constructor>[3]) {
  const room = new GameRoom('room1', '테스트 방', 'host1', options);
  room.addPlayer('p1', '앨리스', true);
  room.addPlayer('p2', '밥');
  room.addPlayer('p3', '찰리');
  return room;
}

// 테스트용 헬퍼: 게임을 시작하고 word-check까지 진행
function createStartedGame(gameMode: 'normal' | 'fool' = 'normal') {
  const room = createRoomWithPlayers({ category: '음식', gameMode });
  room.startGame();
  return room;
}

// 테스트용 헬퍼: description 단계까지 진행
function advanceToDescription(room: GameRoom) {
  room.players.forEach(p => room.checkWord(p.id));
  return room;
}

// 테스트용 헬퍼: discussion 단계까지 진행
function advanceToDiscussion(room: GameRoom) {
  advanceToDescription(room);
  const order = room.game!.descriptionOrder;
  order.forEach(id => room.submitDescription(id, `설명 by ${id}`));
  return room;
}

describe('GameRoom', () => {
  // ============================================================
  // 생성자
  // ============================================================
  describe('constructor', () => {
    it('기본값으로 방을 생성한다', () => {
      const room = new GameRoom('id1', '방 이름', 'host1');
      expect(room.id).toBe('id1');
      expect(room.name).toBe('방 이름');
      expect(room.hostId).toBe('host1');
      expect(room.isPublic).toBe(true);
      expect(room.password).toBeNull();
      expect(room.maxPlayers).toBe(10);
      expect(room.gameMode).toBe('normal');
      expect(room.state).toBe('waiting');
      expect(room.players).toHaveLength(0);
      expect(room.game).toBeNull();
    });

    it('비공개 방은 비밀번호를 가진다', () => {
      const room = new GameRoom('id1', '비밀방', 'host1', {
        isPublic: false,
        password: '1234',
      });
      expect(room.isPublic).toBe(false);
      expect(room.password).toBe('1234');
    });

    it('공개 방은 비밀번호를 무시한다', () => {
      const room = new GameRoom('id1', '공개방', 'host1', {
        isPublic: true,
        password: '1234',
      });
      expect(room.password).toBeNull();
    });
  });

  // ============================================================
  // 플레이어 관리
  // ============================================================
  describe('addPlayer', () => {
    let room: GameRoom;

    beforeEach(() => {
      room = new GameRoom('id1', '테스트 방', 'host1');
    });

    it('첫 번째 플레이어는 호스트가 된다', () => {
      const player = room.addPlayer('p1', '앨리스');
      expect(player).not.toBeNull();
      expect(player!.isHost).toBe(true);
      expect(room.hostId).toBe('p1');
    });

    it('두 번째 플레이어는 호스트가 아니다', () => {
      room.addPlayer('p1', '앨리스');
      const p2 = room.addPlayer('p2', '밥');
      expect(p2!.isHost).toBe(false);
    });

    it('isHost를 명시하면 호스트가 된다', () => {
      room.addPlayer('p1', '앨리스');
      const p2 = room.addPlayer('p2', '밥', true);
      expect(p2!.isHost).toBe(true);
      expect(room.hostId).toBe('p2');
    });

    it('방이 가득 차면 null을 반환한다', () => {
      const smallRoom = new GameRoom('id1', '소규모 방', 'host1', { maxPlayers: 3 });
      smallRoom.addPlayer('p1', '앨리스');
      smallRoom.addPlayer('p2', '밥');
      smallRoom.addPlayer('p3', '찰리');
      expect(smallRoom.addPlayer('p4', '데이브')).toBeNull();
    });

    it('중복 ID는 거부된다', () => {
      room.addPlayer('p1', '앨리스');
      expect(room.addPlayer('p1', '다른닉네임')).toBeNull();
    });

    it('중복 닉네임은 거부된다', () => {
      room.addPlayer('p1', '앨리스');
      expect(room.addPlayer('p2', '앨리스')).toBeNull();
    });
  });

  describe('removePlayer', () => {
    let room: GameRoom;

    beforeEach(() => {
      room = createRoomWithPlayers();
    });

    it('존재하는 플레이어를 제거한다', () => {
      expect(room.removePlayer('p2')).toBe(true);
      expect(room.players).toHaveLength(2);
    });

    it('존재하지 않는 플레이어는 false를 반환한다', () => {
      expect(room.removePlayer('unknown')).toBe(false);
    });

    it('호스트가 나가면 다음 플레이어가 호스트가 된다', () => {
      room.removePlayer('p1');
      expect(room.players[0].isHost).toBe(true);
      expect(room.hostId).toBe('p2');
    });
  });

  // ============================================================
  // 게임 시작
  // ============================================================
  describe('startGame', () => {
    it('3명 이상이면 게임을 시작할 수 있다', () => {
      const room = createRoomWithPlayers({ category: '음식' });
      expect(room.startGame()).toBe(true);
      expect(room.state).toBe('word-check');
      expect(room.game).not.toBeNull();
    });

    it('3명 미만이면 게임을 시작할 수 없다', () => {
      const room = new GameRoom('id1', '방', 'host1');
      room.addPlayer('p1', '앨리스');
      room.addPlayer('p2', '밥');
      expect(room.startGame()).toBe(false);
      expect(room.state).toBe('waiting');
    });

    it('waiting 상태가 아니면 시작할 수 없다', () => {
      const room = createStartedGame();
      expect(room.startGame()).toBe(false);
    });

    it('라이어가 플레이어 중 한 명으로 선정된다', () => {
      const room = createStartedGame();
      const playerIds = room.players.map(p => p.id);
      expect(playerIds).toContain(room.game!.liarId);
    });

    it('설명 순서가 모든 플레이어를 포함한다', () => {
      const room = createStartedGame();
      const order = room.game!.descriptionOrder;
      const playerIds = room.players.map(p => p.id);
      expect(order).toHaveLength(playerIds.length);
      expect(order.sort()).toEqual(playerIds.sort());
    });

    it('normal 모드에서 liarWord는 null이다', () => {
      const room = createStartedGame('normal');
      expect(room.game!.liarWord).toBeNull();
    });

    it('fool 모드에서 liarWord는 citizenWord와 다른 단어다', () => {
      const room = createStartedGame('fool');
      expect(room.game!.liarWord).not.toBeNull();
      expect(room.game!.liarWord).not.toBe(room.game!.citizenWord);
    });

    it('플레이어 상태가 초기화된다', () => {
      const room = createStartedGame();
      room.players.forEach(p => {
        expect(p.hasCheckedWord).toBe(false);
        expect(p.description).toBeNull();
        expect(p.nominatedId).toBeNull();
      });
    });
  });

  // ============================================================
  // 단어 확인 (word-check)
  // ============================================================
  describe('getWordForPlayer', () => {
    it('normal 모드: 시민은 citizenWord를 받는다', () => {
      const room = createStartedGame('normal');
      const citizenId = room.players.find(p => p.id !== room.game!.liarId)!.id;
      const result = room.getWordForPlayer(citizenId);
      expect(result.word).toBe(room.game!.citizenWord);
      expect(result.isLiar).toBe(false);
    });

    it('normal 모드: 라이어는 단어 없이 isLiar=true를 받는다', () => {
      const room = createStartedGame('normal');
      const result = room.getWordForPlayer(room.game!.liarId);
      expect(result.word).toBeNull();
      expect(result.isLiar).toBe(true);
    });

    it('fool 모드: 라이어도 단어를 받고 isLiar=false이다', () => {
      const room = createStartedGame('fool');
      const result = room.getWordForPlayer(room.game!.liarId);
      expect(result.word).toBe(room.game!.liarWord);
      expect(result.isLiar).toBe(false);
    });

    it('game이 없으면 null/false를 반환한다', () => {
      const room = createRoomWithPlayers();
      expect(room.getWordForPlayer('p1')).toEqual({ word: null, isLiar: false });
    });
  });

  describe('checkWord', () => {
    it('모든 플레이어가 확인하면 description 단계로 전환된다', () => {
      const room = createStartedGame();
      expect(room.checkWord('p1')).toBe(false);
      expect(room.checkWord('p2')).toBe(false);
      expect(room.checkWord('p3')).toBe(true); // 마지막 → true 반환
      expect(room.state).toBe('description');
    });

    it('word-check 상태가 아니면 false를 반환한다', () => {
      const room = createRoomWithPlayers();
      expect(room.checkWord('p1')).toBe(false);
    });

    it('존재하지 않는 플레이어는 false를 반환한다', () => {
      const room = createStartedGame();
      expect(room.checkWord('unknown')).toBe(false);
    });
  });

  // ============================================================
  // 한줄 설명 (description)
  // ============================================================
  describe('submitDescription', () => {
    it('순서에 맞는 플레이어만 설명을 제출할 수 있다', () => {
      const room = createStartedGame();
      advanceToDescription(room);

      const firstDescriber = room.getCurrentDescriberId()!;
      const otherPlayer = room.players.find(p => p.id !== firstDescriber)!.id;

      expect(room.submitDescription(otherPlayer, '설명')).toBe(false);
      expect(room.submitDescription(firstDescriber, '설명')).toBe(true);
    });

    it('모든 설명이 끝나면 discussion 단계로 전환된다', () => {
      const room = createStartedGame();
      advanceToDescription(room);

      const order = room.game!.descriptionOrder;
      order.forEach(id => room.submitDescription(id, `설명 by ${id}`));

      expect(room.state).toBe('discussion');
    });

    it('설명이 game.descriptions에 기록된다', () => {
      const room = createStartedGame();
      advanceToDescription(room);

      const firstId = room.getCurrentDescriberId()!;
      room.submitDescription(firstId, '맛있는 것');
      expect(room.game!.descriptions[firstId]).toBe('맛있는 것');
    });
  });

  // ============================================================
  // 토론 + 지목 (discussion)
  // ============================================================
  describe('nominate', () => {
    let room: GameRoom;

    beforeEach(() => {
      room = createStartedGame();
      advanceToDiscussion(room);
    });

    it('다른 플레이어를 지목할 수 있다', () => {
      expect(room.nominate('p1', 'p2')).toBe(true);
    });

    it('자기 자신을 지목할 수 없다', () => {
      expect(room.nominate('p1', 'p1')).toBe(false);
    });

    it('REDO_DESCRIPTION_ID를 지목할 수 있다', () => {
      expect(room.nominate('p1', REDO_DESCRIPTION_ID)).toBe(true);
    });

    it('존재하지 않는 플레이어를 지목할 수 없다', () => {
      expect(room.nominate('p1', 'unknown')).toBe(false);
    });

    it('discussion 상태가 아니면 false를 반환한다', () => {
      room.state = 'waiting' as any;
      expect(room.nominate('p1', 'p2')).toBe(false);
    });
  });

  describe('calculateNominationResult', () => {
    let room: GameRoom;

    beforeEach(() => {
      room = createStartedGame();
      advanceToDiscussion(room);
    });

    it('최다 득표자를 반환한다', () => {
      room.nominate('p1', 'p3');
      room.nominate('p2', 'p3');
      room.nominate('p3', 'p1');

      const result = room.calculateNominationResult();
      expect(result.winnerId).toBe('p3');
      expect(result.isTie).toBe(false);
    });

    it('동점이면 isTie=true, winnerId=null', () => {
      room.nominate('p1', 'p2');
      room.nominate('p2', 'p3');
      room.nominate('p3', 'p1');

      const result = room.calculateNominationResult();
      expect(result.winnerId).toBeNull();
      expect(result.isTie).toBe(true);
      expect(result.tiedPlayerIds).toHaveLength(3);
    });

    it('아무도 지목하지 않으면 winnerId=null, isTie=false', () => {
      const result = room.calculateNominationResult();
      expect(result.winnerId).toBeNull();
      expect(result.isTie).toBe(false);
    });
  });

  describe('allNominated', () => {
    it('모든 플레이어가 지목하면 true', () => {
      const room = createStartedGame();
      advanceToDiscussion(room);

      room.nominate('p1', 'p2');
      room.nominate('p2', 'p3');
      expect(room.allNominated()).toBe(false);

      room.nominate('p3', 'p1');
      expect(room.allNominated()).toBe(true);
    });
  });

  // ============================================================
  // 최종 투표 (final-vote)
  // ============================================================
  describe('calculateFinalVoteResult', () => {
    let room: GameRoom;

    beforeEach(() => {
      room = createStartedGame();
      advanceToDiscussion(room);
      // p3를 지목 → 변론 → 최종투표
      room.nominate('p1', 'p3');
      room.nominate('p2', 'p3');
      room.nominate('p3', 'p1');
      room.startDefense('p3');
      room.startFinalVote();
    });

    it('과반 찬성이면 confirmed=true', () => {
      // p3 제외, p1/p2가 투표 가능
      room.finalVote('p1', true);
      room.finalVote('p2', true);
      const result = room.calculateFinalVoteResult();
      expect(result.confirmed).toBe(true);
      expect(result.agree).toBe(2);
    });

    it('과반 반대면 confirmed=false', () => {
      room.finalVote('p1', false);
      room.finalVote('p2', false);
      const result = room.calculateFinalVoteResult();
      expect(result.confirmed).toBe(false);
    });

    it('찬반 동수면 confirmed=false (과반 미달)', () => {
      room.finalVote('p1', true);
      room.finalVote('p2', false);
      const result = room.calculateFinalVoteResult();
      expect(result.confirmed).toBe(false);
    });

    it('지목된 사람은 투표할 수 없다', () => {
      expect(room.finalVote('p3', true)).toBe(false);
    });

    it('기권표는 과반 계산에서 제외된다', () => {
      // p1만 찬성, p2 기권 → 투표한 1명 중 1명 찬성 = 과반
      room.finalVote('p1', true);
      const result = room.calculateFinalVoteResult();
      expect(result.confirmed).toBe(true);
      expect(result.abstain).toBe(1);
    });
  });

  describe('allFinalVoted', () => {
    it('지목된 사람 제외하고 모두 투표하면 true', () => {
      const room = createStartedGame();
      advanceToDiscussion(room);
      room.nominate('p1', 'p3');
      room.nominate('p2', 'p3');
      room.nominate('p3', 'p1');
      room.startDefense('p3');
      room.startFinalVote();

      room.finalVote('p1', true);
      expect(room.allFinalVoted()).toBe(false);
      room.finalVote('p2', true);
      expect(room.allFinalVoted()).toBe(true);
    });
  });

  // ============================================================
  // 게임 결과
  // ============================================================
  describe('getGameResult', () => {
    function setupForResult(room: GameRoom, options: {
      catchLiar: boolean;
      liarGuess?: string;
    }) {
      advanceToDiscussion(room);
      const liarId = room.game!.liarId;
      const target = options.catchLiar ? liarId : room.players.find(p => p.id !== liarId)!.id;

      // 지목
      room.players.forEach(p => {
        if (p.id !== target) room.nominate(p.id, target);
        else room.nominate(p.id, room.players.find(pp => pp.id !== p.id && pp.id !== target)!.id);
      });

      room.startDefense(target);
      room.startFinalVote();
      room.players.forEach(p => {
        if (p.id !== target) room.finalVote(p.id, true);
      });

      if (options.catchLiar && options.liarGuess !== undefined) {
        room.startLiarGuess();
        room.submitLiarGuess(options.liarGuess);
      } else {
        room.goToResult();
      }
    }

    it('라이어를 잡고 라이어가 단어를 못 맞추면 시민 승리', () => {
      const room = createStartedGame();
      setupForResult(room, { catchLiar: true, liarGuess: '틀린 단어' });
      const result = room.getGameResult()!;
      expect(result.winner).toBe('citizen');
      expect(result.wasLiarCaught).toBe(true);
      expect(result.liarGuessedCorrectly).toBe(false);
    });

    it('라이어를 잡았지만 라이어가 단어를 맞추면 라이어 승리', () => {
      const room = createStartedGame();
      const citizenWord = room.game!.citizenWord;
      setupForResult(room, { catchLiar: true, liarGuess: citizenWord });
      const result = room.getGameResult()!;
      expect(result.winner).toBe('liar');
      expect(result.wasLiarCaught).toBe(true);
      expect(result.liarGuessedCorrectly).toBe(true);
    });

    it('라이어를 못 잡으면 라이어 승리', () => {
      const room = createStartedGame();
      setupForResult(room, { catchLiar: false });
      const result = room.getGameResult()!;
      expect(result.winner).toBe('liar');
      expect(result.wasLiarCaught).toBe(false);
    });

    it('단어 비교 시 공백과 대소문자를 무시한다', () => {
      const room = createStartedGame();
      const citizenWord = room.game!.citizenWord;
      setupForResult(room, { catchLiar: true, liarGuess: ` ${citizenWord} ` });
      const result = room.getGameResult()!;
      expect(result.liarGuessedCorrectly).toBe(true);
    });
  });

  // ============================================================
  // 설정 변경
  // ============================================================
  describe('updateSettings', () => {
    let room: GameRoom;

    beforeEach(() => {
      room = createRoomWithPlayers();
    });

    it('waiting 상태에서 설정을 변경할 수 있다', () => {
      expect(room.updateSettings({ gameMode: 'fool' })).toBe(true);
      expect(room.gameMode).toBe('fool');
    });

    it('게임 중에는 설정을 변경할 수 없다', () => {
      room.state = 'discussion' as any;
      expect(room.updateSettings({ gameMode: 'fool' })).toBe(false);
    });

    it('maxPlayers는 3~10 범위로 클램핑된다', () => {
      room.updateSettings({ maxPlayers: 100 });
      expect(room.maxPlayers).toBe(10);

      room.updateSettings({ maxPlayers: 1 });
      expect(room.maxPlayers).toBe(3);
    });

    it('maxPlayers는 현재 인원보다 작게 설정할 수 없다', () => {
      // 3명이 있는 상태
      room.updateSettings({ maxPlayers: 3 });
      expect(room.maxPlayers).toBe(3);

      room.updateSettings({ maxPlayers: 2 }); // 3명 있으니 거부
      expect(room.maxPlayers).toBe(3); // 변경 안 됨
    });

    it('descriptionTime은 10~60 범위로 클램핑된다', () => {
      room.updateSettings({ descriptionTime: 5 });
      expect(room.descriptionTime).toBe(10);

      room.updateSettings({ descriptionTime: 999 });
      expect(room.descriptionTime).toBe(60);
    });

    it('discussionTime은 60~300 범위로 클램핑된다', () => {
      room.updateSettings({ discussionTime: 10 });
      expect(room.discussionTime).toBe(60);

      room.updateSettings({ discussionTime: 999 });
      expect(room.discussionTime).toBe(300);
    });

    it('defenseTime은 10~60 범위로 클램핑된다', () => {
      room.updateSettings({ defenseTime: 1 });
      expect(room.defenseTime).toBe(10);

      room.updateSettings({ defenseTime: 100 });
      expect(room.defenseTime).toBe(60);
    });
  });

  // ============================================================
  // 게임 리셋
  // ============================================================
  describe('resetGame', () => {
    it('waiting 상태로 돌아가고 게임 데이터가 초기화된다', () => {
      const room = createStartedGame();
      room.resetGame();

      expect(room.state).toBe('waiting');
      expect(room.game).toBeNull();
      room.players.forEach(p => {
        expect(p.hasCheckedWord).toBe(false);
        expect(p.description).toBeNull();
        expect(p.nominatedId).toBeNull();
      });
    });
  });

  // ============================================================
  // 직렬화
  // ============================================================
  describe('getLobbyInfo', () => {
    it('로비에 필요한 정보만 반환한다', () => {
      const room = createRoomWithPlayers();
      const info = room.getLobbyInfo();

      expect(info.id).toBe('room1');
      expect(info.playerCount).toBe(3);
      expect(info).not.toHaveProperty('players');
      expect(info).not.toHaveProperty('password');
    });
  });

  describe('getInfoForClient', () => {
    it('비밀번호를 포함하지 않는다', () => {
      const room = new GameRoom('id1', '비밀방', 'host1', {
        isPublic: false,
        password: '1234',
      });
      const info = room.getInfoForClient();
      expect(info).not.toHaveProperty('password');
    });

    it('플레이어 목록을 포함한다', () => {
      const room = createRoomWithPlayers();
      const info = room.getInfoForClient();
      expect(info.players).toHaveLength(3);
    });
  });
});
