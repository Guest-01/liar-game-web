# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

라이어 게임 (Word Wolf) - 온라인 멀티플레이어 웹 애플리케이션. 한국어로 응답해주세요.

## Commands

```bash
npm run dev        # 개발 서버 실행 (tsx watch)
npm run build      # TypeScript 빌드
npm start          # 프로덕션 서버 실행
npm test           # 전체 테스트 실행 (vitest run)
npm run test:watch # 파일 변경 시 자동 재실행 (vitest)
npx vitest run src/game/Room.test.ts           # 단일 파일 실행
npx vitest run -t "calculateNominationResult"  # 특정 테스트명으로 필터
```

린트 설정 없음.

## Architecture

### Tech Stack
- **Server**: Express.js + TypeScript (CommonJS)
- **Template**: EJS (views/ + views/partials/)
- **Realtime**: Socket.IO
- **Client State**: Alpine.js (CDN) - `public/js/game.js`의 `gameRoom()` 컴포넌트
- **Styling**: Tailwind CSS (CDN), Lucide Icons (CDN)
- **Logging**: pino + pino-pretty

### Server-Side Core

**`src/game/Room.ts` (GameRoom 클래스)**: 모든 게임 로직 담당. 상태 전이, 투표 계산, 단어 배분 등을 메서드로 제공. Socket handler에서 이 메서드들을 호출하고 결과를 브로드캐스트.

**`src/game/RoomManager.ts` (싱글톤)**: 방 생명주기 관리. 내부 Map 구조:
- `rooms`: roomId -> GameRoom
- `playerToRoom`: playerId(socket.id) -> roomId
- `hostTokens`: roomId -> 일회용 호스트 토큰 (방 생성 시 발급, 첫 참가 시 소비)
- `pendingCallbacks`: roomId -> setTimeout[] (방 삭제 시 자동 취소)

**`src/socket/handlers.ts`**: 모든 Socket.IO 이벤트 핸들러. 패턴: 입력 검증 → Room 메서드 호출 → `io.to(roomId).emit()` 브로드캐스트. XSS 방지를 위해 `sanitizeInput()` 사용.

### Client-Side Core

**`public/js/game.js`의 `gameRoom()` 함수**: Alpine.js 컴포넌트로 전체 게임 UI 상태 관리. `init()` → Socket 연결 → `setupSocketHandlers()`로 이벤트 리스너 등록. `window.ROOM_ID`, `window.INITIAL_ROOM`, `window.CATEGORIES` 등 서버에서 EJS로 주입하는 전역 변수에 의존.

### Game State Machine
`RoomState` 흐름: `waiting` → `word-check` → `description` → `discussion` → `defense` → `final-vote` → (`liar-guess`) → `result`

- `final-vote`에서 과반 미달 시 `discussion`으로 복귀
- `discussion`에서 지목 동점 시 재토론, 무투표/`REDO_DESCRIPTION_ID` 당선 시 `description`으로 복귀

### Game Modes
- **normal**: 라이어가 본인이 라이어임을 앎 (제시어 없음)
- **fool**: 라이어도 본인이 라이어인지 모름 (다른 단어 받음)

### Key Patterns

1. **타이머 이중 구조**: 서버(`setTimeout`)와 클라이언트(`setInterval`) 각각 타이머 관리. `endTime`(절대 시간)을 서버에서 전송하고 클라이언트가 카운트다운. 호스트 클라이언트가 타임아웃 이벤트(`discussion-end`, `defense-timeout` 등)를 서버에 전송.
2. **애니메이션 딜레이**: 한줄 설명 제출 후 서버에서 3.5초 `setTimeout` 대기 (클라이언트 타이핑 애니메이션 보장). 최종 투표 결과 후 12초 대기 (카운트다운 5초 + 타이핑 4초 + 결과 3초).
3. **로비 실시간 업데이트**: 소켓 room `'lobby'`에 join한 클라이언트에 `broadcastLobbyUpdate()`로 방 목록 변경 푸시.
4. **호스트 토큰**: 방 생성 시 `nanoid`로 일회용 토큰 발급 → `sessionStorage`에 저장 → 첫 참가 시 전송하여 호스트 권한 획득.
5. **저장소**: 닉네임은 `localStorage`, 호스트 토큰은 `sessionStorage` 사용.

### Testing

- **Framework**: Vitest (설정: `vitest.config.ts`)
- **테스트 위치**: 소스 파일 옆에 배치 (`Room.test.ts`, `RoomManager.test.ts`, `gameFlow.test.ts`)
- **범위**: `src/game/` 내 게임 로직 유닛 테스트 + 전체 게임 플로우 통합 테스트. Socket 핸들러(`handlers.ts`)와 클라이언트(`game.js`)는 테스트 범위 밖.
- **타이머 테스트**: RoomManager 테스트에서 `vi.useFakeTimers()` 사용. 방 자동 삭제(5초), 비활성 정리(1시간) 등 타이머 의존 로직은 fake timer로 검증.

### Environment Variables
- `PORT` (기본: 3000)
- `BASE_URL` (기본: `https://liar-game.guest-01.dev`)
- `ALLOWED_ORIGINS` (쉼표 구분, 프로덕션 CORS용)
- `LOG_LEVEL` (기본: `info`)
- `NODE_ENV` (`production`일 때 CORS 제한)
