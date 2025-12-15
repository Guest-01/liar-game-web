import { Server, Socket } from 'socket.io';
import { roomManager } from '../game/RoomManager';
import { GameMode } from '../game/types';
import logger from '../logger';

// XSS 방지 - 위험한 문자 제거
function sanitizeInput(input: string, maxLength: number = 100): string {
  return input?.slice(0, maxLength).replace(/[<>]/g, '') || '';
}

export function setupSocketHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    logger.debug({ socketId: socket.id }, '클라이언트 연결');

    // 로비 방 목록 요청
    socket.on('get-lobby-rooms', () => {
      const rooms = roomManager.getLobbyRooms();
      socket.emit('lobby-rooms', { rooms });
    });

    // 방 입장 검증 (로비에서 미리 검증)
    socket.on('verify-join', (data: { roomId: string; nickname: string; password?: string }) => {
      const { roomId, password } = data;
      const nickname = data.nickname?.slice(0, 10).replace(/[<>]/g, '') || '';

      // 닉네임 유효성 검사
      if (!nickname || nickname.length < 2 || nickname.length > 10) {
        socket.emit('verify-join-result', { success: false, error: 'invalid-nickname', message: '닉네임은 2-10자 사이여야 합니다.' });
        return;
      }

      const room = roomManager.getRoom(roomId);
      if (!room) {
        socket.emit('verify-join-result', { success: false, error: 'room-not-found', message: '방이 존재하지 않습니다.' });
        return;
      }

      // 게임 중이면 참가 불가
      if (room.state !== 'waiting') {
        socket.emit('verify-join-result', { success: false, error: 'game-in-progress', message: '게임이 진행 중입니다.' });
        return;
      }

      // 비공개 방 비밀번호 검증
      if (!room.isPublic && room.password) {
        if (!password || password !== room.password) {
          socket.emit('verify-join-result', { success: false, error: 'invalid-password', message: '비밀번호가 틀렸습니다.' });
          return;
        }
      }

      // 닉네임 중복 검사 (같은 닉네임이 이미 있는지)
      if (room.players.find(p => p.nickname === nickname)) {
        socket.emit('verify-join-result', { success: false, error: 'duplicate-nickname', message: '이미 같은 닉네임이 사용 중입니다.' });
        return;
      }

      // 방이 가득 찼는지 확인
      if (room.players.length >= room.maxPlayers) {
        socket.emit('verify-join-result', { success: false, error: 'room-full', message: '방이 가득 찼습니다.' });
        return;
      }

      // 모든 검증 통과
      socket.emit('verify-join-result', { success: true });
    });

    // 방 생성
    socket.on('create-room', (data: {
      roomName: string;
      isPublic: boolean;
      password?: string;
    }) => {
      // XSS 방지
      const roomName = sanitizeInput(data.roomName, 20);
      const password = data.password ? sanitizeInput(data.password, 20) : null;
      const { isPublic } = data;

      // 유효성 검사
      if (!roomName || roomName.length < 1 || roomName.length > 20) {
        socket.emit('error', { message: '방 이름은 1-20자 사이여야 합니다.' });
        return;
      }
      // 비공개 방 비밀번호 필수
      if (!isPublic && !password) {
        socket.emit('error', { message: '비공개 방은 비밀번호가 필요합니다.' });
        return;
      }

      // 기본값으로 방 생성 (게임 설정은 대기실에서 변경)
      const result = roomManager.createRoom(roomName, {
        isPublic: isPublic === true,
        password
      });

      if (!result) {
        socket.emit('error', { message: '방을 생성할 수 없습니다.' });
        return;
      }

      const { room, hostToken } = result;

      // 방 생성만 하고, 호스트는 hostToken과 함께 리다이렉트 후 참가
      socket.emit('room-created', { roomId: room.id, hostToken });

      logger.info({ roomId: room.id, roomName }, `방 생성 | ${room.id} | ${roomName}`);
    });

    // 방 참가
    socket.on('join-room', (data: { roomId: string; nickname: string; password?: string; hostToken?: string }) => {
      const { roomId, password, hostToken } = data;
      // XSS 방지
      const nickname = sanitizeInput(data.nickname, 10);

      if (!nickname || nickname.length < 2 || nickname.length > 10) {
        socket.emit('error', { message: '닉네임은 2-10자 사이여야 합니다.' });
        return;
      }

      const result = roomManager.joinRoom(roomId, socket.id, nickname, { password, hostToken });
      if (!result.room) {
        const errorMessages: Record<string, string> = {
          'room-not-found': '방이 존재하지 않습니다.',
          'already-in-room': '이미 다른 방에 있습니다.',
          'game-in-progress': '게임이 진행 중입니다.',
          'invalid-password': '비밀번호가 틀렸습니다.',
          'nickname-duplicate': '이미 같은 닉네임이 사용 중입니다.',
          'room-full': '방이 가득 찼습니다.',
          'join-failed': '방에 참가할 수 없습니다.'
        };
        socket.emit('error', {
          message: errorMessages[result.error || ''] || '방에 참가할 수 없습니다.',
          errorCode: result.error
        });
        return;
      }

      const room = result.room;
      socket.join(room.id);
      socket.emit('room-joined', {
        room: room.getInfoForClient(),
        playerId: socket.id
      });

      // 다른 플레이어들에게 알림
      const player = room.players.find(p => p.id === socket.id);
      socket.to(room.id).emit('player-joined', { player });

      logger.info({ roomId, nickname }, `방 참가 | ${roomId} | ${nickname}`);
    });

    // 방 나가기
    socket.on('leave-room', () => {
      handleLeaveRoom(socket, io);
    });

    // 플레이어 강퇴
    socket.on('kick-player', (data: { targetId: string }) => {
      const room = roomManager.getRoomByPlayerId(socket.id);
      if (!room) return;

      // 호스트만 강퇴 가능
      if (room.hostId !== socket.id) {
        socket.emit('error', { message: '호스트만 강퇴할 수 있습니다.' });
        return;
      }

      // 대기실에서만 강퇴 가능
      if (room.state !== 'waiting') {
        socket.emit('error', { message: '대기실에서만 강퇴할 수 있습니다.' });
        return;
      }

      // 자기 자신 강퇴 방지
      if (data.targetId === socket.id) {
        socket.emit('error', { message: '자기 자신을 강퇴할 수 없습니다.' });
        return;
      }

      const targetPlayer = room.players.find(p => p.id === data.targetId);
      if (!targetPlayer) return;

      const nickname = targetPlayer.nickname;
      room.removePlayer(data.targetId);

      // 강퇴당한 플레이어에게 알림
      io.to(data.targetId).emit('kicked', { message: '방에서 강퇴되었습니다.' });

      // 다른 플레이어들에게 알림
      socket.to(room.id).emit('player-kicked', {
        playerId: data.targetId,
        nickname
      });
    });

    // 게임 설정 변경 (대기실에서 호스트만)
    socket.on('update-room-settings', (data: {
      gameMode?: GameMode;
      maxPlayers?: number;
      category?: string;
      descriptionTime?: number;
      discussionTime?: number;
      defenseTime?: number;
    }) => {
      const room = roomManager.getRoomByPlayerId(socket.id);
      if (!room) return;

      // 호스트만 설정 변경 가능
      if (room.hostId !== socket.id) {
        socket.emit('error', { message: '호스트만 설정을 변경할 수 있습니다.' });
        return;
      }

      // 대기실에서만 설정 변경 가능
      if (room.state !== 'waiting') {
        socket.emit('error', { message: '대기실에서만 설정을 변경할 수 있습니다.' });
        return;
      }

      if (!room.updateSettings(data)) {
        socket.emit('error', { message: '설정을 변경할 수 없습니다.' });
        return;
      }

      // 모든 플레이어에게 변경된 설정 브로드캐스트
      io.to(room.id).emit('room-settings-updated', {
        room: room.getInfoForClient()
      });

      logger.info({ roomId: room.id, settings: data }, `설정 변경 | ${room.id}`);
    });

    // 게임 시작
    socket.on('start-game', () => {
      const room = roomManager.getRoomByPlayerId(socket.id);
      if (!room) return;

      // 호스트만 시작 가능
      if (room.hostId !== socket.id) {
        socket.emit('error', { message: '호스트만 게임을 시작할 수 있습니다.' });
        return;
      }

      if (room.players.length < 3) {
        socket.emit('error', { message: '최소 3명이 필요합니다.' });
        return;
      }

      if (!room.startGame()) {
        socket.emit('error', { message: '게임을 시작할 수 없습니다.' });
        return;
      }

      // 각 플레이어에게 개별 단어 전송
      for (const player of room.players) {
        const wordInfo = room.getWordForPlayer(player.id);
        io.to(player.id).emit('game-started', {
          word: wordInfo.word,
          isLiar: wordInfo.isLiar,
          gameMode: room.gameMode,
          category: room.category // 랜덤인 경우 실제 선택된 카테고리
        });
      }

      logger.info({ roomId: room.id, playerCount: room.players.length }, `게임 시작 | ${room.id} | ${room.players.length}명`);
    });

    // 단어 확인 완료
    socket.on('word-checked', () => {
      const room = roomManager.getRoomByPlayerId(socket.id);
      if (!room) return;

      const allChecked = room.checkWord(socket.id);

      if (allChecked) {
        // 한줄 설명 단계 시작 (상태 변경은 클라이언트에서 처리)
        const currentDescriberId = room.getCurrentDescriberId();
        const endTime = Date.now() + room.descriptionTime * 1000;
        io.to(room.id).emit('description-phase-start', {
          currentDescriberId,
          endTime,
          order: room.game?.descriptionOrder
        });
      } else {
        // 아직 전원 확인 안 됐을 때만 상태 업데이트
        io.to(room.id).emit('room-state-update', { state: room.state, players: room.players });
      }
    });

    // 한줄 설명 제출
    socket.on('submit-description', (data: { description: string }) => {
      const room = roomManager.getRoomByPlayerId(socket.id);
      if (!room || !room.game) return;

      // XSS 방지
      const description = sanitizeInput(data.description, 100) || '...';
      const prevDescriber = room.getCurrentDescriberId();

      if (!room.submitDescription(socket.id, description)) {
        return;
      }

      // 설명 제출됨 브로드캐스트
      io.to(room.id).emit('description-submitted', {
        playerId: socket.id,
        description
      });

      // 모든 설명이 끝났는지 확인
      if (room.state === 'discussion') {
        // 토론 단계 시작
        io.to(room.id).emit('discussion-start', {
          descriptions: room.game.descriptions,
          endTime: room.game.discussionEndTime
        });
      } else {
        // 다음 설명자 차례
        const nextDescriberId = room.getCurrentDescriberId();
        const endTime = Date.now() + room.descriptionTime * 1000;
        io.to(room.id).emit('description-turn', {
          currentDescriberId: nextDescriberId,
          endTime
        });
      }
    });

    // 채팅 메시지
    socket.on('chat-message', (data: { message: string }) => {
      const room = roomManager.getRoomByPlayerId(socket.id);
      if (!room) return;

      const player = room.players.find(p => p.id === socket.id);
      if (!player) return;

      // 최후 변론 중에는 변론자만 채팅 가능
      if (room.state === 'defense' && room.game?.nominatedPlayerId !== socket.id) {
        return;
      }

      // XSS 방지
      const message = sanitizeInput(data.message, 200);
      if (!message) return;

      io.to(room.id).emit('chat-message', {
        playerId: socket.id,
        nickname: player.nickname,
        message,
        timestamp: Date.now()
      });
    });

    // 지목
    socket.on('nominate', (data: { targetId: string }) => {
      const room = roomManager.getRoomByPlayerId(socket.id);
      if (!room || !room.game) return;

      if (!room.nominate(socket.id, data.targetId)) {
        return;
      }

      // 지목 현황 브로드캐스트
      io.to(room.id).emit('nomination-update', {
        nominations: room.game.nominations
      });

      // 모두 지목했는지 확인
      if (room.allNominated()) {
        // 5초 후 토론 종료
        const newEndTime = Math.min(room.game.discussionEndTime, Date.now() + 5000);
        room.game.discussionEndTime = newEndTime;
        io.to(room.id).emit('all-nominated', { endTime: newEndTime });
      }
    });

    // 토론 종료 처리 (클라이언트 타이머 종료 시)
    socket.on('discussion-end', () => {
      const room = roomManager.getRoomByPlayerId(socket.id);
      if (!room || !room.game || room.state !== 'discussion') return;

      // 호스트만 처리
      if (room.hostId !== socket.id) return;

      const result = room.calculateNominationResult();

      if (result.isTie) {
        // 동점 - 재토론
        room.restartDiscussion();
        io.to(room.id).emit('tie-detected', {
          tiedPlayerIds: result.tiedPlayerIds,
          endTime: room.game.discussionEndTime
        });
      } else if (result.winnerId) {
        // 최후 변론 시작
        room.startDefense(result.winnerId);
        io.to(room.id).emit('defense-start', {
          defenderId: result.winnerId,
          endTime: room.game.defenseEndTime
        });
      }
    });

    // 최후 변론 종료 (변론자만 가능)
    socket.on('defense-end', () => {
      const room = roomManager.getRoomByPlayerId(socket.id);
      if (!room || !room.game || room.state !== 'defense') return;

      // 변론자 본인만 종료 가능
      if (room.game.nominatedPlayerId !== socket.id) return;

      room.startFinalVote();
      io.to(room.id).emit('final-vote-start', {
        defenderId: room.game.nominatedPlayerId,
        endTime: room.game.finalVoteEndTime
      });
    });

    // 최후 변론 타임아웃 (호스트가 타이머 종료 시 호출)
    socket.on('defense-timeout', () => {
      const room = roomManager.getRoomByPlayerId(socket.id);
      if (!room || !room.game || room.state !== 'defense') return;

      // 호스트만 타임아웃 처리 가능
      if (room.hostId !== socket.id) return;

      room.startFinalVote();
      io.to(room.id).emit('final-vote-start', {
        defenderId: room.game.nominatedPlayerId,
        endTime: room.game.finalVoteEndTime
      });
    });

    // 최종 투표
    socket.on('final-vote', (data: { agree: boolean }) => {
      const room = roomManager.getRoomByPlayerId(socket.id);
      if (!room || !room.game) return;

      if (!room.finalVote(socket.id, data.agree)) {
        return;
      }

      // 투표 현황 (개수만)
      const currentResult = room.calculateFinalVoteResult();
      io.to(room.id).emit('final-vote-update', {
        votedCount: Object.keys(room.game.finalVotes).length,
        totalVoters: room.players.length - 1
      });

      // 모두 투표했는지 확인
      if (room.allFinalVoted()) {
        const result = room.calculateFinalVoteResult();
        const roomId = room.id;
        const nominatedPlayerId = room.game.nominatedPlayerId;
        const liarId = room.game.liarId;

        // 결과 브로드캐스트 (찬성/반대/무효 표 수 공개)
        io.to(roomId).emit('final-vote-result', {
          agree: result.agree,
          disagree: result.disagree,
          abstain: result.abstain,
          confirmed: result.confirmed,
          nominatedPlayerId
        });

        // 5초 후 다음 단계로 진행
        setTimeout(() => {
          // 방이 아직 유효한지 확인
          const currentRoom = roomManager.getRoom(roomId);
          if (!currentRoom || !currentRoom.game) return;

          if (result.confirmed) {
            // 지목된 사람이 라이어인지 확인
            const isLiar = nominatedPlayerId === liarId;

            if (isLiar) {
              // 라이어 정답 맞추기 단계
              currentRoom.startLiarGuess();
              io.to(roomId).emit('liar-guess-phase', {
                liarId: currentRoom.game.liarId,
                endTime: currentRoom.game.liarGuessEndTime
              });
            } else {
              // 틀림 - 라이어 승리
              currentRoom.goToResult();
              const gameResult = currentRoom.getGameResult();
              if (gameResult) {
                io.to(roomId).emit('game-end', gameResult);
                logger.info({ roomId, winner: gameResult.winner }, `게임 종료 | ${roomId} | 승자: ${gameResult.winner}`);
              }
            }
          } else {
            // 과반수 미달 - 토론 단계로 복귀
            currentRoom.restartDiscussion();
            io.to(roomId).emit('restart-discussion', {
              reason: 'vote-failed',
              discussionEndTime: currentRoom.game.discussionEndTime
            });
          }
        }, 5000);
      }
    });

    // 최종 투표 타이머 종료 (호스트가 호출)
    socket.on('final-vote-timeout', () => {
      const room = roomManager.getRoomByPlayerId(socket.id);
      if (!room || !room.game || room.state !== 'final-vote') return;

      // 호스트만 처리
      if (room.hostId !== socket.id) return;

      const result = room.calculateFinalVoteResult();
      const roomId = room.id;
      const nominatedPlayerId = room.game.nominatedPlayerId;
      const liarId = room.game.liarId;

      // 결과 브로드캐스트 (찬성/반대/무효 표 수 공개)
      io.to(roomId).emit('final-vote-result', {
        agree: result.agree,
        disagree: result.disagree,
        abstain: result.abstain,
        confirmed: result.confirmed,
        nominatedPlayerId
      });

      // 5초 후 다음 단계로 진행
      setTimeout(() => {
        // 방이 아직 유효한지 확인
        const currentRoom = roomManager.getRoom(roomId);
        if (!currentRoom || !currentRoom.game) return;

        if (result.confirmed) {
          // 지목된 사람이 라이어인지 확인
          const isLiar = nominatedPlayerId === liarId;

          if (isLiar) {
            // 라이어 정답 맞추기 단계
            currentRoom.startLiarGuess();
            io.to(roomId).emit('liar-guess-phase', {
              liarId: currentRoom.game.liarId,
              endTime: currentRoom.game.liarGuessEndTime
            });
          } else {
            // 틀림 - 라이어 승리
            currentRoom.goToResult();
            const gameResult = currentRoom.getGameResult();
            if (gameResult) {
              io.to(roomId).emit('game-end', gameResult);
              logger.info({ roomId, winner: gameResult.winner }, `게임 종료 | ${roomId} | 승자: ${gameResult.winner}`);
            }
          }
        } else {
          // 과반수 미달 - 토론 단계로 복귀
          currentRoom.restartDiscussion();
          io.to(roomId).emit('restart-discussion', {
            reason: 'vote-failed',
            discussionEndTime: currentRoom.game.discussionEndTime
          });
        }
      }, 5000);
    });

    // 라이어 정답 맞추기
    socket.on('liar-guess', (data: { word: string }) => {
      const room = roomManager.getRoomByPlayerId(socket.id);
      if (!room || !room.game) return;

      // 라이어만 가능
      if (room.game.liarId !== socket.id) return;

      // XSS 방지
      const sanitizedWord = data.word?.slice(0, 50).replace(/[<>]/g, '') || '';
      room.submitLiarGuess(sanitizedWord);
      const gameResult = room.getGameResult();
      if (gameResult) {
        io.to(room.id).emit('game-end', gameResult);
        logger.info({ roomId: room.id, winner: gameResult.winner }, `게임 종료 | ${room.id} | 승자: ${gameResult.winner}`);
      }
    });

    // 라이어 정답 타이머 종료 (호스트가 호출)
    socket.on('liar-guess-timeout', () => {
      const room = roomManager.getRoomByPlayerId(socket.id);
      if (!room || !room.game || room.state !== 'liar-guess') return;

      // 호스트만 처리
      if (room.hostId !== socket.id) return;

      // 빈 답으로 제출 처리
      room.submitLiarGuess('');
      const gameResult = room.getGameResult();
      if (gameResult) {
        io.to(room.id).emit('game-end', gameResult);
        logger.info({ roomId: room.id, winner: gameResult.winner }, `게임 종료 | ${room.id} | 승자: ${gameResult.winner}`);
      }
    });

    // 게임 재시작
    socket.on('restart-game', () => {
      const room = roomManager.getRoomByPlayerId(socket.id);
      if (!room) return;

      if (room.hostId !== socket.id) {
        socket.emit('error', { message: '호스트만 게임을 재시작할 수 있습니다.' });
        return;
      }

      room.resetGame();
      io.to(room.id).emit('game-reset', {
        room: room.getInfoForClient()
      });
    });

    // 연결 해제
    socket.on('disconnect', () => {
      logger.debug({ socketId: socket.id }, '클라이언트 연결 해제');
      handleLeaveRoom(socket, io);
    });
  });
}

function handleLeaveRoom(socket: Socket, io: Server): void {
  // 나가기 전에 방 정보 저장
  const roomBeforeLeave = roomManager.getRoomByPlayerId(socket.id);
  const wasInGame = roomBeforeLeave && roomBeforeLeave.state !== 'waiting';
  const wasLiar = roomBeforeLeave?.game?.liarId === socket.id;
  const wasDefender = roomBeforeLeave?.game?.nominatedPlayerId === socket.id;
  const roomIdBeforeLeave = roomBeforeLeave?.id;

  const { room, deleted } = roomManager.leaveRoom(socket.id);

  if (deleted && roomIdBeforeLeave) {
    logger.info({ roomId: roomIdBeforeLeave }, `방 삭제 | ${roomIdBeforeLeave}`);
  }

  if (room && !deleted) {
    socket.to(room.id).emit('player-left', {
      playerId: socket.id,
      newHostId: room.hostId
    });

    // 게임 중 플레이어 이탈 처리
    if (wasInGame && room.game) {
      // 3명 미만이면 게임 강제 종료
      if (room.players.length < 3) {
        room.resetGame();
        io.to(room.id).emit('game-interrupted', {
          reason: '플레이어가 나가서 게임을 계속할 수 없습니다.',
          room: room.getInfoForClient()
        });
      }
      // 라이어가 나간 경우 → 시민 승리
      else if (wasLiar) {
        room.goToResult();
        io.to(room.id).emit('game-end', {
          winner: 'citizen',
          liarId: socket.id,
          citizenWord: room.game.citizenWord,
          liarWord: room.game.liarWord,
          nominatedPlayerId: null,
          wasLiarCaught: false,
          liarGuessedCorrectly: false,
          liarGuess: null,
          reason: '라이어가 게임을 나갔습니다.'
        });
        logger.info({ roomId: room.id, winner: 'citizen', reason: 'liar-left' }, `게임 종료 | ${room.id} | 승자: citizen (라이어 이탈)`);
      }
      // 변론자/지목된 사람이 나간 경우 → 토론 재시작
      else if (wasDefender && (room.state === 'defense' || room.state === 'final-vote')) {
        room.restartDiscussion();
        io.to(room.id).emit('restart-discussion', {
          reason: 'defender-left',
          discussionEndTime: room.game.discussionEndTime
        });
      }
    }
  }

  socket.leave(room?.id || '');
}
