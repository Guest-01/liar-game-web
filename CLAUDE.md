# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

라이어 게임 (Word Wolf) - 온라인 멀티플레이어 웹 애플리케이션. 한국어로 응답해주세요.

## Commands

```bash
npm run dev      # 개발 서버 실행 (tsx watch)
npm run build    # TypeScript 빌드
npm start        # 프로덕션 서버 실행
```

## Architecture

### Tech Stack
- **Server**: Express.js + TypeScript
- **Template**: EJS
- **Realtime**: Socket.IO
- **Client State**: Alpine.js (CDN)
- **Styling**: Tailwind CSS (CDN)

### Directory Structure
```
src/
├── index.ts              # Express 서버 + 라우트
├── socket/
│   ├── index.ts          # Socket.IO 서버 설정
│   └── handlers.ts       # 모든 소켓 이벤트 핸들러
├── game/
│   ├── types.ts          # 타입 정의 (Room, Player, Game, RoomState)
│   ├── Room.ts           # 방 클래스 (게임 로직 포함)
│   └── RoomManager.ts    # 방 관리 싱글톤
├── data/
│   └── words.ts          # 단어 카테고리 데이터
└── utils/
    └── roomCode.ts       # 방 코드 생성 유틸

views/                    # EJS 템플릿
public/js/
├── game.js              # Alpine.js 게임 상태 관리 (gameRoom 컴포넌트)
├── nickname.js          # 랜덤 한글 닉네임 생성
└── utils.js             # 클라이언트 유틸리티
```

### Game State Machine
`RoomState` 흐름: `waiting` → `word-check` → `description` → `discussion` → `defense` → `final-vote` → (`liar-guess`) → `result`

### Key Patterns

1. **Socket.IO 이벤트 흐름**: 클라이언트 → `handlers.ts` → `Room.ts` 메서드 호출 → 브로드캐스트
2. **Alpine.js 상태**: `public/js/game.js`의 `gameRoom()` 함수가 모든 클라이언트 게임 상태 관리
3. **EJS 템플릿**: Alpine.js `x-data`와 `x-show`로 동적 UI 렌더링

### Game Modes
- **normal**: 라이어가 본인이 라이어임을 앎 (제시어 없음)
- **fool**: 라이어도 본인이 라이어인지 모름 (다른 단어 받음)
