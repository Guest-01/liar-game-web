import { Server, Socket } from 'socket.io';
import { roomManager } from '../game/RoomManager';
import { GameMode } from '../game/types';

export function setupSocketHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // 공개 방 목록 요청
    socket.on('get-public-rooms', () => {
      const rooms = roomManager.getPublicRooms();
      socket.emit('public-rooms', { rooms });
    });

    // 방 생성
    socket.on('create-room', (data: {
      nickname: string;
      roomName: string;
      isPublic: boolean;
      maxPlayers: number;
      gameMode: GameMode;
      descriptionTime: number;
      discussionTime: number;
      defenseTime: number;
      category: string;
    }) => {
      const { nickname, roomName, isPublic, maxPlayers, gameMode, descriptionTime, discussionTime, defenseTime, category } = data;

      // 유효성 검사
      if (!nickname || nickname.length < 2 || nickname.length > 10) {
        socket.emit('error', { message: '닉네임은 2-10자 사이여야 합니다.' });
        return;
      }
      if (!roomName || roomName.length < 1 || roomName.length > 20) {
        socket.emit('error', { message: '방 이름은 1-20자 사이여야 합니다.' });
        return;
      }

      const room = roomManager.createRoom(socket.id, nickname, roomName, {
        isPublic: isPublic === true,
        maxPlayers: Math.min(8, Math.max(3, maxPlayers)),
        gameMode,
        descriptionTime: Math.min(60, Math.max(10, descriptionTime)),
        discussionTime: Math.min(300, Math.max(60, discussionTime)),
        defenseTime: Math.min(60, Math.max(10, defenseTime)),
        category
      });

      if (!room) {
        socket.emit('error', { message: '방을 생성할 수 없습니다.' });
        return;
      }

      socket.join(room.code);
      socket.emit('room-created', { roomCode: room.code });
      socket.emit('room-joined', {
        room: room.getInfoForClient(),
        playerId: socket.id
      });
    });

    // 방 참가
    socket.on('join-room', (data: { roomCode: string; nickname: string }) => {
      const { roomCode, nickname } = data;

      if (!nickname || nickname.length < 2 || nickname.length > 10) {
        socket.emit('error', { message: '닉네임은 2-10자 사이여야 합니다.' });
        return;
      }

      const room = roomManager.joinRoom(roomCode, socket.id, nickname);
      if (!room) {
        // 구체적인 에러 메시지를 위해 방을 먼저 조회
        const existingRoom = roomManager.getRoom(roomCode);
        if (!existingRoom) {
          socket.emit('error', { message: '방이 존재하지 않습니다.' });
        } else if (existingRoom.state !== 'waiting') {
          socket.emit('error', { message: '게임이 진행 중입니다.' });
        } else if (existingRoom.players.find(p => p.nickname === nickname)) {
          socket.emit('error', { message: '이미 같은 닉네임이 사용 중입니다.' });
        } else if (existingRoom.players.length >= existingRoom.maxPlayers) {
          socket.emit('error', { message: '방이 가득 찼습니다.' });
        } else {
          socket.emit('error', { message: '방에 참가할 수 없습니다.' });
        }
        return;
      }

      socket.join(room.code);
      socket.emit('room-joined', {
        room: room.getInfoForClient(),
        playerId: socket.id
      });

      // 다른 플레이어들에게 알림
      const player = room.players.find(p => p.id === socket.id);
      socket.to(room.code).emit('player-joined', { player });
    });

    // 방 나가기
    socket.on('leave-room', () => {
      handleLeaveRoom(socket, io);
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
          gameMode: room.gameMode
        });
      }
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
        io.to(room.code).emit('description-phase-start', {
          currentDescriberId,
          endTime,
          order: room.game?.descriptionOrder
        });
      } else {
        // 아직 전원 확인 안 됐을 때만 상태 업데이트
        io.to(room.code).emit('room-state-update', { state: room.state, players: room.players });
      }
    });

    // 한줄 설명 제출
    socket.on('submit-description', (data: { description: string }) => {
      const room = roomManager.getRoomByPlayerId(socket.id);
      if (!room || !room.game) return;

      const description = data.description?.slice(0, 100) || '...';
      const prevDescriber = room.getCurrentDescriberId();

      if (!room.submitDescription(socket.id, description)) {
        return;
      }

      // 설명 제출됨 브로드캐스트
      io.to(room.code).emit('description-submitted', {
        playerId: socket.id,
        description
      });

      // 모든 설명이 끝났는지 확인
      if (room.state === 'discussion') {
        // 토론 단계 시작
        io.to(room.code).emit('discussion-start', {
          descriptions: room.game.descriptions,
          endTime: room.game.discussionEndTime
        });
      } else {
        // 다음 설명자 차례
        const nextDescriberId = room.getCurrentDescriberId();
        const endTime = Date.now() + room.descriptionTime * 1000;
        io.to(room.code).emit('description-turn', {
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

      const message = data.message?.slice(0, 200) || '';
      if (!message) return;

      io.to(room.code).emit('chat-message', {
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
      io.to(room.code).emit('nomination-update', {
        nominations: room.game.nominations
      });

      // 모두 지목했는지 확인
      if (room.allNominated()) {
        // 5초 후 토론 종료
        const newEndTime = Math.min(room.game.discussionEndTime, Date.now() + 5000);
        room.game.discussionEndTime = newEndTime;
        io.to(room.code).emit('all-nominated', { endTime: newEndTime });
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
        io.to(room.code).emit('tie-detected', {
          tiedPlayerIds: result.tiedPlayerIds,
          endTime: room.game.discussionEndTime
        });
      } else if (result.winnerId) {
        // 최후 변론 시작
        room.startDefense(result.winnerId);
        io.to(room.code).emit('defense-start', {
          defenderId: result.winnerId,
          endTime: room.game.defenseEndTime
        });
      }
    });

    // 최후 변론 종료
    socket.on('defense-end', () => {
      const room = roomManager.getRoomByPlayerId(socket.id);
      if (!room || !room.game || room.state !== 'defense') return;

      if (room.hostId !== socket.id) return;

      room.startFinalVote();
      io.to(room.code).emit('final-vote-start', {
        defenderId: room.game.nominatedPlayerId
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
      io.to(room.code).emit('final-vote-update', {
        votedCount: Object.keys(room.game.finalVotes).length,
        totalVoters: room.players.length - 1
      });

      // 모두 투표했는지 확인
      if (room.allFinalVoted()) {
        const result = room.calculateFinalVoteResult();

        io.to(room.code).emit('final-vote-result', {
          agree: result.agree,
          disagree: result.disagree,
          confirmed: result.confirmed,
          nominatedPlayerId: room.game.nominatedPlayerId
        });

        if (result.confirmed) {
          // 지목된 사람이 라이어인지 확인
          const isLiar = room.game.nominatedPlayerId === room.game.liarId;

          if (isLiar) {
            // 라이어 정답 맞추기 단계
            room.startLiarGuess();
            io.to(room.code).emit('liar-guess-phase', {
              liarId: room.game.liarId
            });
          } else {
            // 틀림 - 라이어 승리
            room.goToResult();
            const gameResult = room.getGameResult();
            io.to(room.code).emit('game-end', gameResult);
          }
        } else {
          // 과반수 미달 - 토론 단계로 복귀
          room.restartDiscussion();
          io.to(room.code).emit('restart-discussion', {
            reason: 'vote-failed',
            discussionEndTime: room.game.discussionEndTime
          });
        }
      }
    });

    // 라이어 정답 맞추기
    socket.on('liar-guess', (data: { word: string }) => {
      const room = roomManager.getRoomByPlayerId(socket.id);
      if (!room || !room.game) return;

      // 라이어만 가능
      if (room.game.liarId !== socket.id) return;

      room.submitLiarGuess(data.word);
      const gameResult = room.getGameResult();
      io.to(room.code).emit('game-end', gameResult);
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
      io.to(room.code).emit('game-reset', {
        room: room.getInfoForClient()
      });
    });

    // 연결 해제
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      handleLeaveRoom(socket, io);
    });
  });
}

function handleLeaveRoom(socket: Socket, io: Server): void {
  const { room, deleted } = roomManager.leaveRoom(socket.id);

  if (room && !deleted) {
    socket.to(room.code).emit('player-left', {
      playerId: socket.id,
      newHostId: room.hostId
    });
  }

  socket.leave(room?.code || '');
}
