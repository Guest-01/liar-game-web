# 라이어 게임 v2 — 아키텍처

> **선행 문서**: `REQUIREMENTS.md` (무엇을) · `spikes/colyseus/FINDINGS.md` (왜 Colyseus)
> 이 문서는 **어떻게**를 정의한다.
>
> **상태**: 확정 (2026-08-18) · 스파이크로 검증된 사실만 기술한다.

---

## 0. 설계 원칙

1. **서버가 유일한 권위.** 클라이언트는 *의도*만 보내고, 모든 전이는 서버가 결정한다.
   어떤 클라이언트가 사라져도 게임은 진행된다. (v1 최대 결함의 정면 대응)
2. **정보 은닉은 단일 지점에서.** 뷰어별 상태 투영을 한 함수가 전담하고,
   바이트 수준 테스트가 이를 강제한다.
3. **연출은 페이즈다.** UI 애니메이션 길이가 서버 로직에 하드코딩되지 않는다.
   서버는 "지금 어떤 연출 페이즈이고 얼마 남았는지"만 말한다.
4. **게임 규칙은 프레임워크를 모른다.** 순수 함수로 분리해 Colyseus 없이 테스트한다.

---

## 1. 확정 스택

| 계층 | 선택 | 버전 | 근거 |
|---|---|---|---|
| 런타임 | Node.js | 22 | v1과 동일, Docker 이미지 유지 |
| 언어 | TypeScript (`strict`) | 5.x | v1은 strict가 아니어서 `!` 남발이 있었다 |
| 실시간 | **Colyseus** | **0.17.10** (정확 고정) | StateView·allowReconnection·clock 검증 완료 |
| 트랜스포트 | `@colyseus/ws-transport` | 0.17.x | |
| HTTP | Express | 5.2.x | 정적 파일 + 메타 셸 + REST(피드백). 0.17이 Express 5 지원 |
| 클라이언트 SDK | **`@colyseus/sdk`** | **0.17.43** (정확 고정) | ⚠️ 구 `colyseus.js`가 아니다 |
| UI | **Svelte 5** | 5.x | 런타임 ~10KB, `transition:`/`animate:`/`spring`이 F9를 선언적으로 해결 |
| 번들러 | **Vite** | 8.x | 빌드 도구 하나 |
| 스타일 | Tailwind | 4.x | v1 테마·키프레임 이식 |
| 테스트 | Vitest + `@colyseus/testing` | 4.x / 0.17.x | |
| 배포 | 단일 Docker 이미지 | — | DB 없음, 무상태 |

**버전은 캐럿/틸드 없이 정확 고정**한다 (`REGRESSION-CHECKLIST.md` G4).

### 페이지 구성
전 경로를 **단일 SPA**로 처리하고, 서버는 경로별 **OG 메타 태그를 주입한 HTML 셸**만 반환한다.

| 경로 | 색인 | OG 메타 | 비고 |
|---|:---:|:---:|---|
| `/` | ✅ | ✅ | 랜딩. 로비 |
| `/create` | ✅ | ✅ | |
| `/room/:id` | ❌ (`robots`로 제외) | ✅ | **카카오톡 링크 공유 미리보기용으로 OG는 필수** |

풀 SSR 메타프레임워크(SvelteKit/Nuxt)는 **쓰지 않는다** — 라우트 3개에 SSR이 필요한 건 메타 태그뿐이다.

---

## 2. 저장소 구조

### 2.0 프레이밍

**"서버 + SPA = 이중 구조"가 아니라 하나의 앱에 컴파일 타깃이 둘이다.**

- 배포 산출물이 **한 개** (Docker 이미지 하나)
- 서버가 클라이언트 번들을 **같은 오리진에서 직접 서빙**
- 독립 버저닝·독립 배포가 **없음**
- `shared/`가 양쪽에 컴파일되어 들어감

따라서 **npm workspaces(모노레포)를 쓰지 않는다.** 워크스페이스의 이점
(독립 버저닝, 개별 배포, 팀 간 의존성 격리)이 하나도 해당되지 않는 반면,
`shared/`를 먼저 빌드해야 하는 **빌드 순서 문제**만 새로 생긴다.

### 2.1 디렉터리

`src/`를 두지 않고 **최상위에 세 디렉터리**를 둔다 — 이중성이 최상위에서 바로 보이게.

```
liar-game-web/
├─ docs/                     명세·아키텍처·체크리스트
│
├─ shared/                   ★ 프레임워크 의존 0. 양쪽에 컴파일됨
│   ├─ constants.ts            튜닝 상수 (REQUIREMENTS §5)
│   ├─ words.ts                6카테고리 180단어 (카테고리당 30개)        ← v1 이식
│   ├─ nicknames.ts            랜덤 닉네임 생성기        ← v1 이식
│   ├─ protocol.ts             클라→서버 메시지 zod 스키마
│   ├─ snapshot.ts             RoomSnapshot 타입 — 계약의 원본
│   └─ rules.ts                순수 게임 규칙 (집계·판정·점수)
│
├─ server/                   ★ tsc가 컴파일 → dist/server
│   ├─ index.ts                Express + Colyseus 부팅
│   ├─ shell.ts                경로별 OG 메타 주입
│   ├─ feedback.ts             POST /api/feedback
│   └─ rooms/
│       ├─ LiarRoom.ts         Colyseus Room — 얇은 어댑터
│       ├─ state.ts            Schema 정의 (공개 / @view 분리)
│       ├─ phases.ts           상태 머신 전이 테이블
│       ├─ projection.ts       StateView 관리 — 정보 은닉 단일 지점
│       ├─ timer.ts            페이즈 타이머 + 일시정지
│       └─ LobbyRoom.ts        로비 실시간 방 목록
│
├─ client/                   ★ vite가 번들 → dist/public
│   ├─ main.ts  router.ts
│   ├─ app.css                 테마 색 + 키프레임      ← v1 이식
│   ├─ lib/     connection.svelte.ts  session.ts
│   ├─ routes/  Lobby.svelte  Create.svelte  Room.svelte
│   ├─ game/    페이즈별 화면 컴포넌트
│   ├─ fx/      연출 (타이핑·셔플·라이어공개·펄스)
│   └─ ui/      공용 (토스트·모달·채팅시트)
│
├─ public/                   Vite publicDir → 그대로 복사
│   └─ favicon.svg  favicon.png  robots.txt  sitemap.xml   ← v1 이식
├─ index.html                SPA 셸 (서버가 메타 주입해 반환)
│
├─ package.json              ★ 하나
├─ tsconfig.json             base
├─ tsconfig.server.json      tsc 빌드용
├─ tsconfig.client.json      Vite·에디터용
├─ vite.config.ts
├─ Dockerfile  .dockerignore  .env.example
└─ .github/workflows/
```

**빌드 산출물**

```
dist/
├─ shared/     tsc  ← 서버가 import
├─ server/     tsc  ← node dist/server/index.js
└─ public/     vite ← 서버가 정적 서빙
```

### 2.2 구조를 성립시키는 결정 (전부 실측 검증)

#### ① ESM 전면 통일

`"type": "module"` + `module: NodeNext`. v1의 CommonJS를 물려받지 않는다.
서버·클라이언트·shared가 같은 모듈 시스템이라 `shared/`가 별도 처리 없이 성립한다.
Colyseus 데코레이터와 StateView가 ESM에서 정상 동작함을 확인했다.

#### ② alias 없이 상대 경로 + `.js` 확장자

```ts
import { canStart } from "../shared/rules.js";   // 서버·클라이언트 완전히 동일
```

**tsc와 Vite 양쪽이 설정 없이 처리한다.** `paths` / `tsc-alias` / Vite alias가 전부 불필요.

> `.ts` 파일을 `.js`로 import하는 것이 처음엔 어색하다. 대안은 서버도 esbuild로
> 번들하는 것이지만(확장자 규칙이 사라짐) 도구가 하나 늘어난다. 미니멀 원칙상 ①을 택한다.

#### ③ `package.json` 하나 — 의존성 구분이 자연스럽게 맞는다

| | 내용 |
|---|---|
| `dependencies` | 런타임 서버가 실제로 로드 — `colyseus`, `@colyseus/ws-transport`, `express`, `zod`, `pino` |
| `devDependencies` | 빌드 도구 **+ 클라이언트 라이브러리 전부** — `svelte`, `vite`, `@colyseus/sdk`, `tailwindcss`, `typescript`, `vitest`, `@colyseus/testing` |

클라이언트 라이브러리가 `devDependencies`인 것이 **맞다** — 번들에 인라인되므로
런타임 이미지에 필요 없다. Dockerfile의 `npm ci --omit=dev`가 v1과 동일하게 동작한다.

#### ④ `shared/snapshot.ts`가 계약의 원본

Colyseus 클라이언트는 리플렉션으로 디코딩하므로 **Schema 클래스를 공유할 필요가 없다**
(스파이크에서 확인). Schema는 서버 전용으로 두되, 표류를 막기 위해
`shared/snapshot.ts`의 타입을 원본으로 삼고 서버에서 컴파일 타임에 검사한다.

```ts
// server/rooms/state.ts 말미
const _contract: RoomSnapshot = null as unknown as ReturnType<RoomSchema["toJSON"]>;
```

### 2.3 `shared/`의 규율

- **들어간다**: 상수, 단어 데이터, 닉네임 생성기, 프로토콜 zod 스키마, 순수 규칙 함수, 타입
- **안 들어간다**: Colyseus Schema 클래스(서버 전용), Svelte 컴포넌트, Node API를 쓰는 코드
- **규칙**: `shared/`는 어떤 프레임워크도 import 하지 않는다. `zod`만 예외로 허용한다.

### 2.4 빌드·개발 명령

```
build          vite build && tsc -p tsconfig.server.json
dev            scripts/dev.mjs — 빈 포트를 정한 뒤 vite + tsx watch를 함께 띄운다
typecheck      tsc -p tsconfig.server.json --noEmit && svelte-check
test           vitest run
```

> ### ⚠️ 개발 모드에만 프록시가 있다
> Vite dev와 Colyseus가 별도 포트이므로 `vite.config.ts`의 `server.proxy`가
> 매치메이킹 HTTP와 WebSocket 업그레이드를 중계한다.
> **프로덕션은 같은 오리진이라 프록시가 없다.**
> 이 차이를 잊으면 "로컬은 되는데 배포하면 안 됨"이 발생한다.

> ### 포트는 오케스트레이터가 정한다
> 기본 포트는 **2567**이다 (3000은 다른 개발 도구와 너무 자주 겹친다).
> `scripts/dev.mjs`가 **양쪽이 시작되기 전에** 빈 포트를 찾아 서버와 Vite에
> 같은 값을 넘긴다.
>
> **서버가 스스로 다음 포트로 넘어가게 두지 않는다.** 그러면 Vite 프록시가
> 옛 포트를 계속 가리켜 "서버는 떴는데 화면이 아무것도 안 되는" 상태가 되고,
> 프록시는 프로덕션에 없는 개발 전용 배선이라 원인을 찾기 어렵다.
> 프로덕션에서도 포트가 컨테이너 포트 매핑과 묶여 있으므로 임의로 바뀌면
> 외부에서 닿지 못한다 — 둘 다 점유 시 **즉시 실패**한다.

> ### ⚠️ Vite HMR은 반드시 별도 포트로 뺀다
> Colyseus의 방 소켓 경로는 `/{processId}/{roomId}` 라서 접두사로 가를 수 없다.
> 그래서 프록시가 **모든 WebSocket 업그레이드**를 Colyseus로 넘긴다.
>
> Vite HMR은 `ws://<vite>/?token=...` 으로 붙으므로 같은 포트를 쓰면 HMR 소켓이
> Colyseus로 흘러들어가고, 서버에 `Invalid WebSocket frame: invalid status code ...`
> 가 끝없이 쏟아진다. 증상이 게임 로직과 무관해 보여서 원인을 찾기 어렵다.
>
> `scripts/dev.mjs`가 HMR 포트(기본 24678)도 함께 확정해 `VITE_HMR_PORT`로 넘긴다.

---

## 3. 상태 모델

### 3.1 공개 / 비밀 분리

```ts
class PlayerSchema extends Schema {
  // ── 전원 공개 ──
  @type("string")  id = "";
  @type("string")  nickname = "";
  @type("boolean") isHost = false;
  @type("boolean") isConnected = true;
  @type("boolean") isSpectator = false;
  @type("uint16")  score = 0;
  @type("boolean") hasCheckedWord = false;
  @type("string")  description = "";       // 제출된 한줄 설명
  @type("string")  nominatedId = "";       // 지목 대상 (실시간 공개)
  @type("boolean") hasFinalVoted = false;  // 투표 "여부"만. 찬반은 개표 시

  // ── 본인만 (StateView) ──
  @view() @type("string")  myWord = "";
  @view() @type("boolean") amILiar = false;      // 일반 모드에서만 true
  @view() @type("boolean") myFinalVote = false;
}
```

> ⚠️ `StateView`는 **`@colyseus/schema`** 에서 import 한다 (`colyseus` 아님).

### 3.2 라이어 정체는 state에 없다

라운드 진행 중 라이어 ID와 제시어는 **Schema 밖의 서버 전용 필드**에 둔다.

```ts
class LiarRoom extends Room<{ state: RoomSchema }> {   // ← 0.17 제네릭 형태
  private secret: { liarId: string; citizenWord: string; liarWord: string | null } | null = null;
}
```

라운드 결과 페이즈에 진입할 때만 `state.revealed*`에 복사한다.
→ 실수로 유출될 경로가 **구조적으로 존재하지 않는다.**

### 3.3 방 상태

```ts
class RoomSchema extends Schema {
  // 설정 (대기실에서 호스트가 변경)
  @type("string") name; @type("boolean") isPublic;
  @type("uint8")  maxPlayers; @type("string") gameMode; @type("string") category;
  @type("uint8")  totalRounds;              // 0 = 무제한
  @type("uint16") descriptionTime, discussionTime, defenseTime;

  // 진행
  @type("string")  phase;                   // §4
  @type("uint32")  phaseRemainingMs;        // ← 절대시각 금지 (체크리스트 D6)
  @type("boolean") isPaused;
  @type("uint32")  graceRemainingMs;        // 누가 끊겼는지는 Player.isConnected로 파생
  @type("uint8")   round;
  @type("uint8")   descriptionAttempts, discussionAttempts;   // 기회 상한 (최대 2)
  @type(["string"]) descriptionOrder;
  @type("uint8")   currentDescriberIndex;
  @type("string")  defendantId;
  @type("uint8")   agreeCount, disagreeCount, abstainCount;   // 개표 페이즈에만
  @type({ map: PlayerSchema }) players;
  @type([ChatMessage]) chat;                // 최근 50개

  // 라운드 결과 공개용 (result 페이즈 진입 시에만 채움)
  @type("string") revealedLiarId, revealedCitizenWord, revealedLiarWord;
  @type("string") liarGuess, roundWinner;
}
```

**채팅을 state에 두는 이유**: 재접속·관전 진입 시 자동 복구된다.
전원 공개 정보라 정보 은닉과 무관하고, 50개면 페이로드도 작다.

---

## 4. 상태 머신

### 4.1 페이즈

```
waiting                    대기실 (무기한)
  ↓ start-match
word-check                 제시어 확인 (무기한, 전원 확인 시 전이)
order-reveal               ⟨연출⟩ 순서 추첨 2.8s
description                한줄 설명 (설명시간/인)
description-reveal         ⟨연출⟩ 타이핑 3.5s
discussion                 토론+지목 (토론시간)
defense                    최후 변론 (변론시간)
final-vote                 최종 투표 (15s)
vote-reveal                ⟨연출⟩ 개표 5s, 처형 확정 시 라이어 공개 +7s
liar-guess                 정답 맞추기 (15s)
round-result               라운드 결과 (무기한, 호스트가 진행)
scoreboard                 점수판 (무기한, 호스트가 다음 라운드 시작)
match-result               최종 순위 (무기한) → waiting
```

**연출이 페이즈인 이유**: v1은 서버가 `setTimeout(3500)`으로 대기하는 동안
"상태는 이미 다음 단계인데 통지는 안 간" 유령 구간이 있었다. 그 사이 재접속하면 화면이 깨졌다.
연출을 페이즈로 올리면 그 구간에도 상태가 일관되고, 애니메이션 길이 변경이 상수 하나가 된다.

**`order-reveal`이 따로 있는 이유**: 순서 추첨 연출을 설명 페이즈 안에서 하면
첫 설명자가 그만큼 시간을 손해본다. 별도 페이즈로 두면 설명 제한시간은 연출이
끝난 뒤에 시작한다.

**`vote-reveal`의 길이가 가변인 이유**: 처형이 확정되면 라이어 공개까지 이어지고,
미달이면 카운트다운만 하고 토론으로 돌아간다.

> ### ⚠️ 연출을 위해 상태를 공개할 때
> `defendantWasLiar`는 **처형이 확정됐을 때만** 채운다. 미확정이면 라운드가
> 계속되므로 채우는 순간 라이어 정체가 샌다. 연출 편의를 위해 상태를 여는 것이
> 정보 은닉을 깨지 않는지 매번 확인해야 한다 (`server/rooms/fx.test.ts`).

**테스트에서는 연출을 끈다**: `LiarRoom.fxScale = 0`으로 두면 연출 페이즈가
즉시 통과한다. 규칙 검증에 연출 대기가 끼어들지 않게 하기 위한 것이고,
게임 규칙에는 영향이 없다.

### 4.2 전이 테이블

```ts
type PhaseDef = {
  duration?: (r: LiarRoom) => number;    // ms. 없으면 무기한
  onEnter?:  (r: LiarRoom) => void;
  onTimeout?: (r: LiarRoom) => Phase;    // 타이머 만료 시 다음 페이즈
  accepts: MessageType[];                // 이 페이즈에서 허용되는 클라 메시지
};
```

**모든 전이는 `enterPhase(next)` 한 곳을 통과한다.** 여기서:
1. 이전 페이즈 타이머 취소
2. `onEnter` 실행
3. 새 타이머 설치 + `phaseRemainingMs` 갱신
4. **`syncViews()` 호출** (§5)

### 4.3 지목 집계 분기 (REQUIREMENTS §1.4~1.5)

```
discussion 종료
├─ 지목 0건 ──────────── attempts.description < 2 ? → description : 라이어 승
├─ REDO 최다 ─────────── attempts.description < 2 ? → description : (선택지 미제공)
├─ 동점 ───────────────── attempts.discussion  < 2 ? → discussion  : 라이어 승
└─ 단독 최다 ──────────── → defense

final-vote 종료
├─ 과반 찬성 → vote-reveal → (피고==라이어 ? liar-guess : round-result[라이어 승])
└─ 과반 미달 → vote-reveal → attempts.discussion < 2 ? discussion : round-result[라이어 승]
```

단일 원칙: **기회를 소진하고도 라이어를 처형하지 못하면 라이어 승.**
→ 라운드 최대 소요 시간이 상한을 가진다.

---

## 5. 정보 투영 — 단일 지점

```ts
// server/rooms/projection.ts
export function syncViews(room: LiarRoom): void {
  const revealed = REVEAL_PHASES.has(room.state.phase);
  for (const client of room.clients) {
    const me = room.state.players.get(client.sessionId);
    const view = new StateView();
    if (revealed) {
      for (const p of room.state.players.values()) view.add(p);   // 결과: 전원 공개
    } else if (me && !me.isSpectator) {
      view.add(me);                                                // 진행 중: 본인만
    }
    // 관전자는 아무것도 담지 않는다 → 어떤 제시어도 못 본다
    client.view = view;
  }
}
```

`enterPhase`와 `onJoin`에서만 호출한다. **StateView를 만지는 코드는 이 파일뿐이다.**

**검증**: `REQUIREMENTS §2`의 3계층 표를 바이트 수준 테스트로 강제한다 (§8).

---

## 6. 타이머와 일시정지 (R2)

`Delayed`의 `pause()`/`resume()`/`elapsedTime`을 사용한다 — 스파이크에서 동작 검증됨.

```ts
// server/rooms/timer.ts
private phaseTimer?: Delayed;
private disconnectedCount = 0;      // ← 반드시 우리가 센다

onDisconnect() { if (++this.disconnectedCount === 1) this.pausePhase(); }
onReconnect()  { if (--this.disconnectedCount === 0) this.resumePhase(); }
```

> ### ⚠️ 함정: `pause()`는 중첩 카운트를 하지 않는다
> 2명이 끊겨서 `pause()`를 두 번 호출해도, **`resume()` 한 번이면 타이머가 재개된다.**
> 끊긴 인원 수를 직접 세지 않으면 한 명이 아직 안 돌아왔는데 게임이 진행된다.
> → `REGRESSION-CHECKLIST.md` G8에 등재.

### 남은 시간 전달 (체크리스트 D6)

`phaseRemainingMs`를 **상대 시간**으로 보낸다. 절대 시각을 보내지 않으므로
클라이언트 시계 오차가 표시에 영향을 주지 않는다.

**매초 패치하지 않는다.** 페이즈 진입 / 일시정지 / 재개 시점에만 갱신하고,
클라이언트가 수신 시각을 기준으로 자체 카운트다운한다.

---

## 7. 프로토콜

### 클라이언트 → 서버

Colyseus `onMessage`로 받되, 핸들러 진입 즉시 **zod로 런타임 검증**한다
(v1은 타입 선언만 있고 검증이 없었다 — 체크리스트 C5).

| 메시지 | 권한 | 허용 페이즈 |
|---|---|---|
| `set-settings` | 호스트 | waiting |
| `kick` | 호스트 | waiting |
| `start-match` | 호스트 | waiting |
| `next-round` | 호스트 | scoreboard |
| `skip-wait` | 호스트 | 일시정지 중 |
| `check-word` | 플레이어 | word-check |
| `submit-description` | 현재 차례 | description |
| `nominate` | 플레이어 | discussion |
| `end-defense` | 피고 | defense |
| `final-vote` | 피고 제외 플레이어 | final-vote |
| `liar-guess` | 라이어 | liar-guess |
| `chat` | 플레이어(관전자 ❌) | 전 페이즈 (defense는 피고만) |

`accepts` 테이블과 권한 검사를 **디스패처 한 곳**에서 처리한다. 핸들러는 규칙만 안다.

### 서버 → 클라이언트

- **상태**: Schema 자동 동기화 (재동기화 R4가 공짜)
- **이벤트**: `system`(입퇴장·단계 안내), `fx:*`(연출 트리거) — 상태가 아닌 일회성 신호만

---

## 8. 테스트 전략

| 층 | 대상 | 도구 |
|---|---|---|
| **순수 규칙** | `shared/rules.ts` — 집계·과반·정답 정규화·점수 | Vitest (프레임워크 없음) |
| **상태 머신** | 전이 테이블 · 기회 상한 · **무한 루프 부재** | Vitest |
| **룸 통합** | 재접속·일시정지·관전 승격·라운드 진행 | `@colyseus/testing` |
| **정보 은닉** | **바이트 수준 C2** | 스파이크 `run.ts` 방식 이식 |

**배포 게이트**: 정보 은닉 테스트가 깨지면 배포를 막는다.
`REGRESSION-CHECKLIST.md`의 항목을 구현하며 테스트로 전환한다.

v1의 `Room.test.ts` / `gameFlow.test.ts`는 코드를 옮기지 않되 **케이스 목록으로 참조**한다.

---

## 9. 클라이언트 구조

### 상태 바인딩 — 어댑터는 한 줄

스파이크에서 `state.toJSON()`이 **StateView를 존중하는 평범한 JS 객체**를 만들고,
10인 기준 비용이 **평균 0.0092ms** (60fps 예산의 0.055%)임을 확인했다.

```ts
// client/lib/connection.svelte.ts
export const game = $state<{ snapshot: RoomSnapshot | null }>({ snapshot: null });
room.onStateChange((s) => { game.snapshot = s.toJSON() as RoomSnapshot });
```

> ### ⚠️ 룬을 쓰는 파일은 확장자가 `.svelte.ts` 여야 한다
> 평범한 `.ts` 에 `$state` 를 쓰면 `tsc`·`svelte-check`·`vite build` 가 **전부
> 통과하는데** 브라우저가 모듈을 로드하는 순간 `rune_outside_svelte` 로 죽는다.
> 정적 검사가 하나도 잡지 못하므로 `client/conventions.test.ts` 가 파일명 규약을
> 강제한다. 파일명을 바꾸면 import 경로도 `*.svelte.js` 로 바꿔야 한다.

세밀한 Schema 콜백을 쓰지 않는다. 매 패치마다 전체 스냅샷을 갈아끼우는 것이
이 규모에서 더 단순하고 충분히 빠르다.

### 연출

서버는 **페이즈와 남은 시간만** 알려준다. 타임라인은 클라이언트가 소유한다.
Svelte의 `transition:` / `animate:` / `spring`으로 선언적으로 표현하고,
v1에서 손으로 짠 `setInterval` 체인을 대체한다.

### 저장소

| 값 | 위치 | 이유 |
|---|---|---|
| 닉네임 | `localStorage` | 재방문 시 유지 |
| 피드백 숨김 만료 | `localStorage` | |
| **재접속 토큰** | `sessionStorage` | 탭 단위. 새로고침 복귀의 핵심 |
| 방 비밀번호 | `sessionStorage` | **URL에 절대 싣지 않는다** (체크리스트 C1) |

### 입력 안전성

**검증은 저장 시, 이스케이프는 렌더 시.** Svelte가 기본 이스케이프하므로
서버에서 HTML 엔티티 인코딩을 하지 않는다 — v1의 이중 이스케이프 버그(체크리스트 C3) 재발 방지.
`{@html}`은 쓰지 않는다.

---

## 10. 마일스톤 매핑

| | 범위 | 이 문서에서 |
|---|---|---|
| **M1** | 방 생성·참가·대기실·1라운드 완주 (관전·점수·연출 없이) | §2 골격, §3.1~3.3, §4.1~4.2, §5, §7 |
| **M2** | 재접속 + 일시정지 | §6 |
| **M3** | 관전 | §5 관전자 분기, 정원 불변식 |
| **M4** | 연속 라운드 + 점수판 | §4.1 scoreboard·match-result |
| **M5** | 연출 이식 | §4.1 `*-reveal`, §9 연출 |
| **M6** | 피드백·SEO·배포 | §1 페이지 구성, `server/shell.ts` |
| **M7** | v1 대체 (`v2.0.0` 태그) | — |

M1 완료 시점에 §4~§6 설계의 옳고 그름이 대부분 드러난다.

---

## 11. 미해결 / 실기기 검증 필요

- **SDK 자동 재접속**: 진짜 네트워크 단절(TCP 유실) 시 동작을 실기기·실네트워크에서 확인해야 한다.
  스파이크 하네스로는 재현하지 못했다 (`FINDINGS.md` §4).
- **모바일 백그라운드 복귀**: 탭 전환 후 복귀 시 SDK 재접속과 30초 유예의 상호작용.
- **`patchRate` 튜닝**: 턴제이므로 기본 50ms보다 낮춰도 된다. 실측 후 결정.
