# 라이어 게임 (Word Wolf)

온라인 멀티플레이어 라이어 게임 웹 애플리케이션

## 게임 소개

라이어 게임은 한 명의 라이어를 찾아내는 추리 게임입니다. 시민들은 같은 제시어를 받고, 라이어는 다른 단어(또는 아무 단어도 받지 못함)를 받습니다. 플레이어들은 서로의 설명과 토론을 통해 라이어를 찾아내야 합니다.

## 게임 규칙

### 기본 규칙
1. 게임이 시작되면 한 명이 **라이어**로 지정됩니다
2. 시민들은 동일한 제시어를 받고, 라이어는 다른 단어를 받거나 받지 못합니다
3. 각자 제시어에 대한 **한 줄 설명**을 작성합니다
4. **토론 시간**에 서로의 설명을 바탕으로 라이어를 추리합니다
5. 가장 많은 지목을 받은 플레이어가 **최후 변론**을 합니다
6. **최종 투표**로 그 플레이어가 라이어인지 판단합니다
7. 최종 투표에서 과반 동의를 얻지 못하면 **토론 단계로 복귀**합니다

### 승리 조건
- **시민 승리**: 라이어를 정확히 찾아내면 승리
- **라이어 승리**: 투표에서 살아남으면 승리
- **라이어 역전승**: 잡히더라도 정답 단어를 맞추면 역전 승리!

## 게임 모드

| 모드 | 설명 |
|------|------|
| **일반 모드** | 라이어는 본인이 라이어임을 알고 있음 (제시어 없음) |
| **바보 모드** | 라이어도 본인이 라이어인지 모름 (다른 단어를 받음) |

## 카테고리

음식, 동물, 장소, 직업, 스포츠, 영화/드라마, 브랜드, 악기 등 다양한 카테고리를 지원합니다.

## 기술 스택

- **Backend**: Express.js + TypeScript
- **Template Engine**: EJS
- **Realtime**: Socket.IO
- **Frontend State**: Alpine.js
- **Styling**: Tailwind CSS, Lucide Icons

## 설치 및 실행

### 요구 사항
- Node.js 18+
- npm

### 설치

```bash
# 저장소 클론
git clone <repository-url>
cd liar-game-web

# 의존성 설치
npm install
```

### 실행

```bash
# 개발 모드 (핫 리로드)
npm run dev

# 프로덕션 빌드
npm run build

# 프로덕션 실행
npm start
```

서버는 기본적으로 `http://localhost:3000`에서 실행됩니다.

## 프로젝트 구조

```
src/
├── index.ts              # Express 서버 및 라우트
├── socket/
│   ├── index.ts          # Socket.IO 서버 설정
│   └── handlers.ts       # 소켓 이벤트 핸들러
├── game/
│   ├── types.ts          # 타입 정의
│   ├── Room.ts           # 방 클래스 (게임 로직)
│   └── RoomManager.ts    # 방 관리 싱글톤
├── data/
│   └── words.ts          # 단어 카테고리 데이터
└── utils/
    └── roomCode.ts       # 방 코드 생성

views/                    # EJS 템플릿
public/js/
├── game.js              # Alpine.js 게임 상태 관리
├── nickname.js          # 랜덤 닉네임 생성
└── utils.js             # 클라이언트 유틸리티
```

## 게임 진행 흐름

```
대기실 (waiting)
    ↓
단어 확인 (word-check)
    ↓
한 줄 설명 (description)
    ↓
토론 + 지목 (discussion)
    ↓
최후 변론 (defense)
    ↓
최종 투표 (final-vote) ──[과반 미달]──→ 토론 + 지목으로 복귀
    ↓ [과반 동의]
[라이어가 잡힌 경우]
라이어 정답 맞추기 (liar-guess)
    ↓
결과 (result)
```

## 라이선스

MIT License
