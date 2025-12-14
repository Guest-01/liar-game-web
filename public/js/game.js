// 게임 방 Alpine.js 컴포넌트
function gameRoom() {
  return {
    // 연결 상태
    socket: null,
    connecting: true,
    joined: false,
    error: '',

    // 플레이어 정보
    playerId: '',
    nickname: localStorage.getItem('nickname') || (typeof generateRandomNickname === 'function' ? generateRandomNickname() : ''),
    passwordInput: '',  // 비공개 방 비밀번호 입력

    // 방 정보
    room: window.INITIAL_ROOM || {},
    categories: window.CATEGORIES || [],

    // 게임 상태
    myWord: { word: null, isLiar: false },
    wordRevealed: false,
    wordChecked: false,
    checkedCount: 0,

    // 한줄 설명
    descriptions: {},
    descriptionOrder: [],
    currentDescriberIndex: 0,
    descriptionInput: '',
    myDescriptionSubmitted: false,

    // 토론
    chatMessages: [],
    chatInput: '',
    myNomination: null,
    nominations: {},

    // 최후 변론
    defenderId: null,

    // 최종 투표
    myFinalVote: null,
    finalVoteCount: 0,
    voteResult: null,  // { agree, disagree, confirmed, countdown }
    voteResultInterval: null,

    // 라이어 정답
    liarId: null,
    liarGuessInput: '',

    // 결과
    gameResult: null,

    // 타이머
    timer: 0,
    timerInterval: null,
    timerEndTime: 0,

    // 계산된 속성
    get isHost() {
      return this.room.hostId === this.playerId;
    },

    get currentDescriber() {
      if (!this.descriptionOrder.length) return null;
      const id = this.descriptionOrder[this.currentDescriberIndex];
      return this.room.players?.find(p => p.id === id) || null;
    },

    // 초기화
    init() {
      // URL에서 닉네임 파라미터 확인
      const urlParams = new URLSearchParams(window.location.search);
      const nicknameParam = urlParams.get('nickname');
      if (nicknameParam) {
        this.nickname = nicknameParam;
        localStorage.setItem('nickname', nicknameParam);
      }

      // 상태 변경 시 Lucide 아이콘 초기화
      this.$watch('room.state', () => {
        this.$nextTick(() => {
          if (typeof lucide !== 'undefined') lucide.createIcons();
        });
      });

      this.$watch('room.players', () => {
        this.$nextTick(() => {
          if (typeof lucide !== 'undefined') lucide.createIcons();
        });
      });

      // 소켓 연결
      this.socket = io();

      this.socket.on('connect', () => {
        this.playerId = this.socket.id;
        this.connecting = false;

        // 자동 참가 조건:
        // 1. 로비에서 온 경우 (nickname 파라미터 있음)
        // 2. 방금 방을 만든 경우 (hostToken 파라미터 있음)
        // 둘 다 localStorage에 유효한 닉네임이 있어야 함
        const shouldAutoJoin = (urlParams.has('nickname') || urlParams.has('hostToken'))
          && this.nickname
          && this.nickname.length >= 2;

        if (shouldAutoJoin) {
          this.joinRoom();
        }
      });

      this.socket.on('disconnect', () => {
        this.connecting = true;
      });

      // 방 참가 완료
      this.socket.on('room-joined', (data) => {
        this.room = data.room;
        this.playerId = data.playerId;
        this.joined = true;
        this.error = '';

        // URL 정리 (비밀번호 파라미터 제거)
        window.history.replaceState({}, '', '/room/' + this.room.id);
      });

      // 플레이어 참가
      this.socket.on('player-joined', (data) => {
        if (!this.room.players.find(p => p.id === data.player.id)) {
          this.room.players.push(data.player);
        }
        showToast(`${data.player.nickname}님이 참가했습니다.`);
      });

      // 플레이어 나감
      this.socket.on('player-left', (data) => {
        this.room.players = this.room.players.filter(p => p.id !== data.playerId);
        if (data.newHostId) {
          this.room.hostId = data.newHostId;
        }
      });

      // 강퇴당함
      this.socket.on('kicked', (data) => {
        showToast(data.message, 'error');
        window.location.href = '/';
      });

      // 다른 플레이어가 강퇴됨
      this.socket.on('player-kicked', (data) => {
        this.room.players = this.room.players.filter(p => p.id !== data.playerId);
        showToast(`${data.nickname}님이 강퇴되었습니다.`);
      });

      // 게임 시작
      this.socket.on('game-started', (data) => {
        this.myWord = { word: data.word, isLiar: data.isLiar };
        this.room.state = 'word-check';
        this.room.gameMode = data.gameMode;
        this.room.category = data.category; // 랜덤인 경우 실제 선택된 카테고리로 업데이트
        this.wordRevealed = false;
        this.wordChecked = false;
        this.checkedCount = 0;
        this.descriptions = {};
        this.chatMessages = [];
        this.myNomination = null;
        this.nominations = {};
        this.myFinalVote = null;
        this.gameResult = null;
      });

      // 상태 업데이트
      this.socket.on('room-state-update', (data) => {
        this.room.state = data.state;
        this.room.players = data.players;
        this.checkedCount = data.players.filter(p => p.hasCheckedWord).length;
      });

      // 한줄 설명 시작
      this.socket.on('description-phase-start', (data) => {
        this.room.state = 'description';  // 상태 변경을 여기서 처리
        this.descriptionOrder = data.order;
        this.currentDescriberIndex = 0;
        this.myDescriptionSubmitted = false;
        this.checkedCount = this.room.players.length;  // 전원 확인 완료 상태
        this.startTimer(data.endTime);
      });

      // 설명 차례
      this.socket.on('description-turn', (data) => {
        const idx = this.descriptionOrder.findIndex(id => id === data.currentDescriberId);
        this.currentDescriberIndex = idx >= 0 ? idx : this.currentDescriberIndex + 1;
        this.startTimer(data.endTime);
      });

      // 설명 제출됨
      this.socket.on('description-submitted', (data) => {
        this.descriptions[data.playerId] = data.description;
        if (data.playerId === this.playerId) {
          this.myDescriptionSubmitted = true;
        }
      });

      // 토론 시작
      this.socket.on('discussion-start', (data) => {
        this.room.state = 'discussion';
        this.descriptions = data.descriptions;
        this.startTimer(data.endTime);
      });

      // 채팅 메시지
      this.socket.on('chat-message', (data) => {
        this.chatMessages.push(data);
        // 메모리 제한: 최근 100개만 유지
        if (this.chatMessages.length > 100) {
          this.chatMessages = this.chatMessages.slice(-100);
        }
        this.$nextTick(() => {
          // 모바일 채팅과 사이드바 채팅 모두 스크롤
          const containers = [this.$refs.chatContainer, this.$refs.sidebarChatContainer];
          containers.forEach(container => {
            if (container) {
              container.scrollTop = container.scrollHeight;
            }
          });
        });
      });

      // 지목 현황
      this.socket.on('nomination-update', (data) => {
        this.nominations = data.nominations;
      });

      // 전원 지목 완료
      this.socket.on('all-nominated', (data) => {
        this.startTimer(data.endTime);
      });

      // 동점 감지
      this.socket.on('tie-detected', (data) => {
        showToast('동점입니다! 다시 토론합니다.');
        this.room.state = 'discussion';
        this.myNomination = null;
        this.nominations = {};
        this.startTimer(data.endTime);
      });

      // 최후 변론 시작
      this.socket.on('defense-start', (data) => {
        this.room.state = 'defense';
        this.defenderId = data.defenderId;
        this.startTimer(data.endTime);
      });

      // 최종 투표 시작
      this.socket.on('final-vote-start', (data) => {
        this.room.state = 'final-vote';
        this.defenderId = data.defenderId;
        this.myFinalVote = null;
        this.finalVoteCount = 0;
        this.stopTimer();
      });

      // 최종 투표 현황
      this.socket.on('final-vote-update', (data) => {
        this.finalVoteCount = data.votedCount;
      });

      // 최종 투표 결과
      this.socket.on('final-vote-result', (data) => {
        // 카운트다운 인터벌 정리
        if (this.voteResultInterval) {
          clearInterval(this.voteResultInterval);
        }

        this.voteResult = {
          agree: data.agree,
          disagree: data.disagree,
          confirmed: data.confirmed,
          nominatedPlayerId: data.nominatedPlayerId,
          countdown: 5
        };

        // 5초 카운트다운
        this.voteResultInterval = setInterval(() => {
          if (this.voteResult && this.voteResult.countdown > 0) {
            this.voteResult.countdown--;
          }
          if (this.voteResult && this.voteResult.countdown <= 0) {
            clearInterval(this.voteResultInterval);
            this.voteResultInterval = null;
          }
        }, 1000);
      });

      // 토론 재시작 (최종 투표 과반 미달)
      this.socket.on('restart-discussion', (data) => {
        this.room.state = 'discussion';
        // 지목 데이터 초기화
        this.myNomination = null;
        this.nominations = {};
        this.defenderId = null;
        // 투표 데이터 초기화
        this.myFinalVote = null;
        this.finalVoteCount = 0;
        this.voteResult = null;
        if (this.voteResultInterval) {
          clearInterval(this.voteResultInterval);
          this.voteResultInterval = null;
        }
        // 타이머 시작 (버그 수정: endTime 전달)
        this.startTimer(data.discussionEndTime);
        showToast('과반수 동의를 얻지 못해 토론을 재시작합니다.', 'info');
      });

      // 라이어 정답 맞추기
      this.socket.on('liar-guess-phase', (data) => {
        this.room.state = 'liar-guess';
        this.liarId = data.liarId;
        this.liarGuessInput = '';
        this.voteResult = null;
        if (this.voteResultInterval) {
          clearInterval(this.voteResultInterval);
          this.voteResultInterval = null;
        }
        // 타이머 시작 (30초)
        this.startTimer(data.endTime);
      });

      // 게임 종료
      this.socket.on('game-end', (data) => {
        this.room.state = 'result';
        this.gameResult = data;
        this.voteResult = null;
        if (this.voteResultInterval) {
          clearInterval(this.voteResultInterval);
          this.voteResultInterval = null;
        }
        this.stopTimer();
      });

      // 게임 설정 변경됨
      this.socket.on('room-settings-updated', (data) => {
        this.room = data.room;
      });

      // 게임 리셋
      this.socket.on('game-reset', (data) => {
        this.room = data.room;
        this.resetGameState();
      });

      // 게임 중단 (플레이어 이탈 등)
      this.socket.on('game-interrupted', (data) => {
        this.room = data.room;
        this.resetGameState();
        showToast(data.reason, 'error');
      });

      // 에러
      this.socket.on('error', (data) => {
        this.error = data.message;
        showToast(data.message, 'error');
      });
    },

    // 방 참가
    joinRoom() {
      if (this.nickname.length < 2 || this.nickname.length > 10) {
        this.error = '닉네임은 2-10자 사이여야 합니다.';
        return;
      }

      localStorage.setItem('nickname', this.nickname);

      // URL 파라미터에서 비밀번호, 호스트 토큰 확인
      const urlParams = new URLSearchParams(window.location.search);
      const password = this.passwordInput || urlParams.get('password') || undefined;
      const hostToken = urlParams.get('hostToken') || undefined;

      this.socket.emit('join-room', {
        roomId: window.ROOM_ID,
        nickname: this.nickname,
        password,
        hostToken
      });
    },

    // 방 나가기
    leaveRoom() {
      this.socket.emit('leave-room');
      window.location.href = '/';
    },

    // 플레이어 강퇴
    kickPlayer(targetId) {
      this.socket.emit('kick-player', { targetId });
    },

    // 게임 시작
    startGame() {
      this.socket.emit('start-game');
    },

    // 단어 확인
    confirmWord() {
      this.wordChecked = true;
      this.socket.emit('word-checked');
    },

    // 설명 제출
    submitDescription() {
      const desc = this.descriptionInput.trim() || '...';
      this.socket.emit('submit-description', { description: desc });
      this.descriptionInput = '';
    },

    // 채팅 전송
    sendChat() {
      const message = this.chatInput.trim();
      if (!message) return;
      this.socket.emit('chat-message', { message });
      this.chatInput = '';
    },

    // 지목
    nominate(targetId) {
      this.myNomination = targetId;
      this.socket.emit('nominate', { targetId });
    },

    // 최종 투표
    finalVote(agree) {
      this.myFinalVote = agree;
      this.socket.emit('final-vote', { agree });
    },

    // 라이어 정답 제출
    submitLiarGuess() {
      const word = this.liarGuessInput.trim();
      if (!word) return;
      this.socket.emit('liar-guess', { word });
    },

    // 게임 재시작
    restartGame() {
      this.socket.emit('restart-game');
    },

    // 변론 종료 (변론자 전용)
    endDefense() {
      if (this.defenderId !== this.playerId) return;
      this.socket.emit('defense-end');
    },

    // 게임 설정 변경 (호스트 전용)
    updateSetting(key, value) {
      if (!this.isHost) return;
      this.socket.emit('update-room-settings', { [key]: value });
    },

    // 게임 상태 초기화
    resetGameState() {
      this.myWord = { word: null, isLiar: false };
      this.wordRevealed = false;
      this.wordChecked = false;
      this.descriptions = {};
      this.chatMessages = [];
      this.myNomination = null;
      this.nominations = {};
      this.myFinalVote = null;
      this.gameResult = null;
      this.myDescriptionSubmitted = false;
      this.stopTimer();
    },

    // 타이머 시작
    startTimer(endTime) {
      this.stopTimer();
      this.timerEndTime = endTime;

      const updateTimer = () => {
        const remaining = Math.ceil((this.timerEndTime - Date.now()) / 1000);
        this.timer = Math.max(0, remaining);

        if (this.timer <= 0) {
          this.stopTimer();
          this.onTimerEnd();
        }
      };

      updateTimer();
      this.timerInterval = setInterval(updateTimer, 1000);
    },

    // 타이머 정지
    stopTimer() {
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
    },

    // 타이머 종료 시
    onTimerEnd() {
      if (this.room.state === 'description' && this.currentDescriber?.id === this.playerId && !this.myDescriptionSubmitted) {
        // 시간 초과 시 빈 설명 제출
        this.socket.emit('submit-description', { description: '...' });
      } else if (this.room.state === 'discussion' && this.isHost) {
        // 호스트가 토론 종료 알림
        this.socket.emit('discussion-end');
      } else if (this.room.state === 'defense' && this.isHost) {
        // 호스트가 변론 종료 알림
        this.socket.emit('defense-end');
      } else if (this.room.state === 'liar-guess' && this.isHost) {
        // 호스트가 라이어 정답 타이머 종료 알림
        this.socket.emit('liar-guess-timeout');
      }
    },

    // 시간 포맷
    formatTime(seconds) {
      return formatTime(seconds);
    },

    // 플레이어 닉네임 가져오기
    getPlayerNickname(playerId) {
      const player = this.room.players?.find(p => p.id === playerId);
      return player?.nickname || '알 수 없음';
    },

    // 지목 받은 수
    getNominationCount(playerId) {
      return Object.values(this.nominations).filter(id => id === playerId).length;
    }
  };
}
