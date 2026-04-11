import { describe, it, expect } from 'vitest';
import { GameRoom } from './Room';
import { REDO_DESCRIPTION_ID } from './types';

/**
 * 통합 테스트: 전체 게임 플로우를 Room 메서드 조합으로 검증
 */

// 3명이 참가한 게임방 생성 및 시작
function setupGame(gameMode: 'normal' | 'fool' = 'normal') {
  const room = new GameRoom('room1', '테스트 방', 'p1', {
    category: '음식',
    gameMode,
    discussionTime: 120,
    defenseTime: 15,
  });
  room.addPlayer('p1', '앨리스', true);
  room.addPlayer('p2', '밥');
  room.addPlayer('p3', '찰리');
  room.startGame();
  return room;
}

// word-check → description 진행
function passWordCheck(room: GameRoom) {
  room.players.forEach(p => room.checkWord(p.id));
}

// description 단계 완료
function passDescriptions(room: GameRoom) {
  const order = room.game!.descriptionOrder;
  order.forEach(id => room.submitDescription(id, `${id}의 설명`));
}

// 특정 플레이어를 지목 (나머지 전원이 지목)
function nominatePlayer(room: GameRoom, targetId: string) {
  room.players.forEach(p => {
    if (p.id === targetId) {
      // 지목 대상은 다른 사람을 지목
      const other = room.players.find(pp => pp.id !== p.id && pp.id !== targetId)!;
      room.nominate(p.id, other.id);
    } else {
      room.nominate(p.id, targetId);
    }
  });
}

describe('게임 플로우 통합 테스트', () => {
  // ============================================================
  // 시나리오 1: 시민 승리 (라이어 잡고, 라이어가 단어 못 맞춤)
  // ============================================================
  it('시민 승리: 라이어를 잡고 라이어가 단어를 못 맞춘다', () => {
    const room = setupGame();
    const liarId = room.game!.liarId;

    // 1. word-check
    expect(room.state).toBe('word-check');
    passWordCheck(room);
    expect(room.state).toBe('description');

    // 2. description
    passDescriptions(room);
    expect(room.state).toBe('discussion');

    // 3. discussion → 라이어 지목
    nominatePlayer(room, liarId);
    expect(room.allNominated()).toBe(true);
    const nomination = room.calculateNominationResult();
    expect(nomination.winnerId).toBe(liarId);

    // 4. defense
    room.startDefense(liarId);
    expect(room.state).toBe('defense');

    // 5. final-vote → 전원 찬성
    room.startFinalVote();
    expect(room.state).toBe('final-vote');
    room.players.forEach(p => {
      if (p.id !== liarId) room.finalVote(p.id, true);
    });
    const voteResult = room.calculateFinalVoteResult();
    expect(voteResult.confirmed).toBe(true);

    // 6. liar-guess → 틀린 단어
    room.startLiarGuess();
    expect(room.state).toBe('liar-guess');
    room.submitLiarGuess('완전히 틀린 단어');
    expect(room.state).toBe('result');

    // 7. 결과
    const result = room.getGameResult()!;
    expect(result.winner).toBe('citizen');
    expect(result.wasLiarCaught).toBe(true);
    expect(result.liarGuessedCorrectly).toBe(false);
  });

  // ============================================================
  // 시나리오 2: 라이어 역전 (잡혔지만 단어를 맞춤)
  // ============================================================
  it('라이어 역전: 라이어가 잡혔지만 시민 단어를 맞춘다', () => {
    const room = setupGame();
    const liarId = room.game!.liarId;
    const citizenWord = room.game!.citizenWord;

    passWordCheck(room);
    passDescriptions(room);

    nominatePlayer(room, liarId);
    room.startDefense(liarId);
    room.startFinalVote();
    room.players.forEach(p => {
      if (p.id !== liarId) room.finalVote(p.id, true);
    });

    // 라이어가 정답을 맞춤
    room.startLiarGuess();
    room.submitLiarGuess(citizenWord);

    const result = room.getGameResult()!;
    expect(result.winner).toBe('liar');
    expect(result.wasLiarCaught).toBe(true);
    expect(result.liarGuessedCorrectly).toBe(true);
  });

  // ============================================================
  // 시나리오 3: 라이어 도주 (시민이 엉뚱한 사람을 지목)
  // ============================================================
  it('라이어 도주: 시민이 아닌 사람이 지목되어 라이어가 승리', () => {
    const room = setupGame();
    const liarId = room.game!.liarId;
    const innocentId = room.players.find(p => p.id !== liarId)!.id;

    passWordCheck(room);
    passDescriptions(room);

    // 무고한 사람을 지목
    nominatePlayer(room, innocentId);
    room.startDefense(innocentId);
    room.startFinalVote();
    room.players.forEach(p => {
      if (p.id !== innocentId) room.finalVote(p.id, true);
    });

    // 라이어가 아닌 사람이 확정 → 라이어 추측 없이 결과로
    room.goToResult();

    const result = room.getGameResult()!;
    expect(result.winner).toBe('liar');
    expect(result.wasLiarCaught).toBe(false);
  });

  // ============================================================
  // 시나리오 4: 투표 부결 → 재토론
  // ============================================================
  it('최종 투표 부결 시 토론으로 복귀한다', () => {
    const room = setupGame();
    const liarId = room.game!.liarId;

    passWordCheck(room);
    passDescriptions(room);
    nominatePlayer(room, liarId);
    room.startDefense(liarId);
    room.startFinalVote();

    // 전원 반대
    room.players.forEach(p => {
      if (p.id !== liarId) room.finalVote(p.id, false);
    });
    const voteResult = room.calculateFinalVoteResult();
    expect(voteResult.confirmed).toBe(false);

    // 재토론
    room.restartDiscussion();
    expect(room.state).toBe('discussion');
    // 지목 초기화 확인
    expect(room.players.every(p => p.nominatedId === null)).toBe(true);
  });

  // ============================================================
  // 시나리오 5: 지목 동점 → 재토론
  // ============================================================
  it('지목 동점 시 재토론으로 돌아간다', () => {
    const room = setupGame();

    passWordCheck(room);
    passDescriptions(room);

    // 3명이 각각 다른 사람을 지목 → 전원 1표씩 동점
    room.nominate('p1', 'p2');
    room.nominate('p2', 'p3');
    room.nominate('p3', 'p1');

    const result = room.calculateNominationResult();
    expect(result.isTie).toBe(true);

    // 재토론
    room.restartDiscussion();
    expect(room.state).toBe('discussion');
    expect(room.players.every(p => p.nominatedId === null)).toBe(true);
  });

  // ============================================================
  // 시나리오 6: 한줄 설명 다시하기 (REDO)
  // ============================================================
  it('REDO 투표 시 한줄 설명 단계로 돌아간다', () => {
    const room = setupGame();

    passWordCheck(room);
    passDescriptions(room);
    expect(room.state).toBe('discussion');

    // 전원이 REDO에 투표
    room.players.forEach(p => room.nominate(p.id, REDO_DESCRIPTION_ID));
    const result = room.calculateNominationResult();
    expect(result.winnerId).toBe(REDO_DESCRIPTION_ID);

    // 한줄 설명 재시작
    room.restartDescriptionPhase();
    expect(room.state).toBe('description');
    // 설명이 초기화됨
    expect(room.players.every(p => p.description === null)).toBe(true);
    expect(room.game!.currentDescriberIndex).toBe(0);
  });

  // ============================================================
  // 시나리오 7: fool 모드 전체 플로우
  // ============================================================
  it('fool 모드: 라이어도 단어를 받고 본인이 라이어인지 모른다', () => {
    const room = setupGame('fool');
    const liarId = room.game!.liarId;

    // fool 모드에서 라이어는 다른 단어를 받음
    const liarWord = room.getWordForPlayer(liarId);
    expect(liarWord.isLiar).toBe(false); // 본인이 라이어인지 모름
    expect(liarWord.word).not.toBeNull();
    expect(liarWord.word).not.toBe(room.game!.citizenWord);
    expect(liarWord.word).toBe(room.game!.liarWord);

    // 시민은 시민 단어를 받음
    const citizenId = room.players.find(p => p.id !== liarId)!.id;
    const citizenWord = room.getWordForPlayer(citizenId);
    expect(citizenWord.word).toBe(room.game!.citizenWord);

    // 나머지 플로우는 동일하게 진행
    passWordCheck(room);
    passDescriptions(room);
    nominatePlayer(room, liarId);
    room.startDefense(liarId);
    room.startFinalVote();
    room.players.forEach(p => {
      if (p.id !== liarId) room.finalVote(p.id, true);
    });
    room.startLiarGuess();
    room.submitLiarGuess('틀린 답');

    const result = room.getGameResult()!;
    expect(result.winner).toBe('citizen');
    expect(result.liarWord).not.toBeNull();
  });

  // ============================================================
  // 시나리오 8: 게임 리셋 후 재시작
  // ============================================================
  it('게임 종료 후 리셋하면 새 게임을 시작할 수 있다', () => {
    const room = setupGame();
    const firstLiarId = room.game!.liarId;

    // 첫 번째 게임 완료
    passWordCheck(room);
    passDescriptions(room);
    nominatePlayer(room, firstLiarId);
    room.startDefense(firstLiarId);
    room.startFinalVote();
    room.players.forEach(p => {
      if (p.id !== firstLiarId) room.finalVote(p.id, true);
    });
    room.startLiarGuess();
    room.submitLiarGuess('틀린 답');
    expect(room.state).toBe('result');

    // 리셋
    room.resetGame();
    expect(room.state).toBe('waiting');
    expect(room.game).toBeNull();

    // 두 번째 게임 시작
    room.category = '음식';
    expect(room.startGame()).toBe(true);
    expect(room.state).toBe('word-check');
    expect(room.game).not.toBeNull();
    // 라이어가 새로 선정됨 (같을 수도 있지만 game 객체는 새것)
    expect(room.game!.citizenWord).toBeTruthy();
  });

  // ============================================================
  // 시나리오 9: 플레이어 이탈 시 상태
  // ============================================================
  it('게임 중 플레이어가 나가면 3명 미만이 되어 게임 속행 불가', () => {
    const room = setupGame();

    passWordCheck(room);
    passDescriptions(room);

    // p3 이탈
    room.removePlayer('p3');
    expect(room.players).toHaveLength(2);
    // 2명으로는 새 게임 시작 불가
    room.resetGame();
    expect(room.startGame()).toBe(false);
  });
});
