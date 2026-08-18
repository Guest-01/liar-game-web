# v1 테스트 케이스 목록

> **목적**: v1(`v1.4.1`)의 테스트가 축적한 **엣지 케이스 이해**를 보존한다.
> 코드는 v2로 옮기지 않는다 — 스택도 구조도 다르다.
> 대신 "무엇을 테스트해야 하는가"의 출발점으로 쓴다.
>
> 원본: `git show v1.4.1:src/game/Room.test.ts` 등 · 총 130개 케이스
>
> ## 사용법
> v2 구현 중 각 케이스를 아래 셋 중 하나로 분류한다.
> - **이식**: 규칙이 그대로다 → v2 테스트로 다시 쓴다
> - **변경**: v2에서 규칙이 바뀌었다 → 새 규칙으로 다시 쓴다 (예: 최소 3인 → 4인)
> - **폐기**: v2 구조에 해당 개념이 없다 (예: hostToken, socket.id 기반 식별)


---

## `Room.test.ts`

- **GameRoom**
  - **constructor**
    - [ ] 기본값으로 방을 생성한다
    - [ ] 비공개 방은 비밀번호를 가진다
    - [ ] 공개 방은 비밀번호를 무시한다
  - **addPlayer**
    - [ ] 첫 번째 플레이어는 호스트가 된다
    - [ ] 두 번째 플레이어는 호스트가 아니다
    - [ ] isHost를 명시하면 호스트가 된다
    - [ ] 방이 가득 차면 null을 반환한다
    - [ ] 중복 ID는 거부된다
    - [ ] 중복 닉네임은 거부된다
  - **removePlayer**
    - [ ] 존재하는 플레이어를 제거한다
    - [ ] 존재하지 않는 플레이어는 false를 반환한다
    - [ ] 호스트가 나가면 다음 플레이어가 호스트가 된다
  - **startGame**
    - [ ] 3명 이상이면 게임을 시작할 수 있다
    - [ ] 3명 미만이면 게임을 시작할 수 없다
    - [ ] waiting 상태가 아니면 시작할 수 없다
    - [ ] 라이어가 플레이어 중 한 명으로 선정된다
    - [ ] 설명 순서가 모든 플레이어를 포함한다
    - [ ] normal 모드에서 liarWord는 null이다
    - [ ] fool 모드에서 liarWord는 citizenWord와 다른 단어다
    - [ ] 플레이어 상태가 초기화된다
  - **getWordForPlayer**
    - [ ] normal 모드: 시민은 citizenWord를 받는다
    - [ ] normal 모드: 라이어는 단어 없이 isLiar=true를 받는다
    - [ ] fool 모드: 라이어도 단어를 받고 isLiar=false이다
    - [ ] game이 없으면 null/false를 반환한다
  - **checkWord**
    - [ ] 모든 플레이어가 확인하면 description 단계로 전환된다
    - [ ] word-check 상태가 아니면 false를 반환한다
    - [ ] 존재하지 않는 플레이어는 false를 반환한다
  - **submitDescription**
    - [ ] 순서에 맞는 플레이어만 설명을 제출할 수 있다
    - [ ] 모든 설명이 끝나면 discussion 단계로 전환된다
    - [ ] 설명이 game.descriptions에 기록된다
  - **nominate**
    - [ ] 다른 플레이어를 지목할 수 있다
    - [ ] 자기 자신을 지목할 수 없다
    - [ ] REDO_DESCRIPTION_ID를 지목할 수 있다
    - [ ] 존재하지 않는 플레이어를 지목할 수 없다
    - [ ] discussion 상태가 아니면 false를 반환한다
  - **calculateNominationResult**
    - [ ] 최다 득표자를 반환한다
    - [ ] 동점이면 isTie=true, winnerId=null
    - [ ] 아무도 지목하지 않으면 winnerId=null, isTie=false
  - **allNominated**
    - [ ] 모든 플레이어가 지목하면 true
  - **calculateFinalVoteResult**
    - [ ] 과반 찬성이면 confirmed=true
    - [ ] 과반 반대면 confirmed=false
    - [ ] 찬반 동수면 confirmed=false (과반 미달)
    - [ ] 지목된 사람은 투표할 수 없다
    - [ ] 기권표는 과반 계산에서 제외된다
  - **allFinalVoted**
    - [ ] 지목된 사람 제외하고 모두 투표하면 true
  - **getGameResult**
    - [ ] 라이어를 잡고 라이어가 단어를 못 맞추면 시민 승리
    - [ ] 라이어를 잡았지만 라이어가 단어를 맞추면 라이어 승리
    - [ ] 라이어를 못 잡으면 라이어 승리
    - [ ] 단어 비교 시 공백과 대소문자를 무시한다
  - **updateSettings**
    - [ ] waiting 상태에서 설정을 변경할 수 있다
    - [ ] 게임 중에는 설정을 변경할 수 없다
    - [ ] maxPlayers는 3~10 범위로 클램핑된다
    - [ ] maxPlayers는 현재 인원보다 작게 설정할 수 없다
    - [ ] descriptionTime은 10~60 범위로 클램핑된다
    - [ ] discussionTime은 60~300 범위로 클램핑된다
    - [ ] defenseTime은 10~60 범위로 클램핑된다
  - **resetGame**
    - [ ] waiting 상태로 돌아가고 게임 데이터가 초기화된다
  - **getLobbyInfo**
    - [ ] 로비에 필요한 정보만 반환한다
  - **getInfoForClient**
    - [ ] 비밀번호를 포함하지 않는다
    - [ ] 플레이어 목록을 포함한다

---

## `RoomManager.test.ts`

- **RoomManager**
  - **createRoom**
    - [ ] 방과 호스트 토큰을 반환한다
    - [ ] 고유한 방 ID를 생성한다
    - [ ] 옵션이 방에 적용된다
    - [ ] 방의 hostId는 빈 문자열이다 (토큰으로 결정)
  - **joinRoom**
    - [ ] 호스트 토큰으로 참가하면 호스트가 된다
    - [ ] 호스트 토큰 없이 참가하면 일반 플레이어다
    - [ ] 호스트 토큰은 일회용이다
    - [ ] 존재하지 않는 방은 room-not-found
    - [ ] 이미 다른 방에 있으면 already-in-room
    - [ ] 게임 중인 방은 game-in-progress
    - [ ] 비공개 방에 틀린 비밀번호는 invalid-password
    - [ ] 비공개 방에 올바른 비밀번호로 참가
    - [ ] 닉네임 중복은 nickname-duplicate
    - [ ] 방이 가득 차면 room-full
    - [ ] 같은 방에 재접속하면 기존 플레이어를 유지한다
    - [ ] 참가 시 예약된 삭제를 취소한다
  - **leaveRoom**
    - [ ] 플레이어를 방에서 제거한다
    - [ ] 등록되지 않은 플레이어는 room=null을 반환한다
    - [ ] 빈 방은 5초 후 삭제된다
    - [ ] 5초 내 재입장하면 삭제가 취소된다
    - [ ] 호스트가 나가면 다음 플레이어가 호스트가 된다
  - **getRoom**
    - [ ] 존재하는 방을 반환한다
    - [ ] 없는 방은 null을 반환한다
  - **getRoomByPlayerId**
    - [ ] 플레이어가 속한 방을 반환한다
    - [ ] 방에 없는 플레이어는 null을 반환한다
  - **getLobbyRooms**
    - [ ] 대기 중이고 1명 이상 있고 미달인 방만 반환한다
    - [ ] 게임 중인 방은 표시하지 않는다
  - **cleanupInactiveRooms**
    - [ ] 비활성 방을 삭제하고 삭제 수를 반환한다
    - [ ] 활성 방은 삭제하지 않는다
    - [ ] 커스텀 비활성 시간을 지정할 수 있다
    - [ ] 예약된 삭제 타이머도 함께 정리된다
  - **addPendingCallback**
    - [ ] 방 삭제 시 등록된 콜백이 취소된다
    - [ ] 빈 방 자동 삭제 시 등록된 콜백이 취소된다

---

## `gameFlow.test.ts`

- **게임 플로우 통합 테스트**
  - [ ] 시민 승리: 라이어를 잡고 라이어가 단어를 못 맞춘다
  - [ ] 라이어 역전: 라이어가 잡혔지만 시민 단어를 맞춘다
  - [ ] 라이어 도주: 시민이 아닌 사람이 지목되어 라이어가 승리
  - [ ] 최종 투표 부결 시 토론으로 복귀한다
  - [ ] 지목 동점 시 재토론으로 돌아간다
  - [ ] REDO 투표 시 한줄 설명 단계로 돌아간다
  - [ ] fool 모드: 라이어도 단어를 받고 본인이 라이어인지 모른다
  - [ ] 게임 종료 후 리셋하면 새 게임을 시작할 수 있다
  - [ ] 게임 중 플레이어가 나가면 3명 미만이 되어 게임 속행 불가
