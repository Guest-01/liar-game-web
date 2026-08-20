# CLAUDE.md

라이어 게임 (Word Wolf) — 온라인 멀티플레이어 웹 게임. **한국어로 응답할 것.**

---

## 현재 상태: M2 완료 · 다음은 M3

한 판을 끝까지 플레이할 수 있고, **끊겨도 30초 안에 돌아오면 자리가 복구된다.**
관전·점수·연출은 아직 없다 (M3~M5).

- **v1 코드는 `v1.4.1` 태그에 있다** — 참고가 필요하면 `git show v1.4.1:<경로>`
- 프로덕션은 여전히 v1이 서비스 중이다. 배포는 **`v*` 태그 푸시에만** 걸리므로
  이 브랜치 작업이나 main 병합으로는 프로덕션이 바뀌지 않는다.

```
npm install
npm run dev        # 서버 3000 + Vite 5173 → http://localhost:5173
npm test           # 95개 (정보 은닉 바이트 테스트 포함)
npm run typecheck  # tsc --noEmit + svelte-check
npm run build      # dist/{server,shared,public}
```

## 먼저 읽을 것

작업 전에 반드시 확인한다. 이 문서들이 정본이고, 아래 요약은 색인일 뿐이다.

| 문서 | 내용 |
|---|---|
| `docs/REQUIREMENTS.md` | **무엇을** 만드는가. 도메인 규칙, 정보 공개 3계층, 결정 기록(D1~D12) |
| `docs/ARCHITECTURE.md` | **어떻게** 만드는가. 스택, 저장소 구조, 상태 모델, 페이즈 머신 |
| `docs/REGRESSION-CHECKLIST.md` | **다시 만들면 안 되는 버그.** v1에서 이미 고친 것 + Colyseus 함정 |
| `docs/V1-TEST-CASES.md` | v1 테스트 130건. 이식/변경/폐기로 분류하며 진행 |
| `docs/spikes/colyseus/FINDINGS.md` | Colyseus 채택 근거와 실측치 |

## 스택 (확정)

```
서버      Node 22 · TypeScript strict · ESM
          Colyseus 0.17.10 (정확 고정) · @colyseus/ws-transport · Express 5
클라이언트 Svelte 5 · Vite 8 · @colyseus/sdk 0.17.43 (정확 고정)
스타일    Tailwind 4
테스트    Vitest · @colyseus/testing
배포      단일 Docker 이미지 · DB 없음 · 인메모리
```

**버전은 캐럿/틸드 없이 정확 고정한다.** Colyseus 생태계가 파괴적 변경과
파손된 배포를 낸 전례가 있다 (`REGRESSION-CHECKLIST.md` G절).

## 저장소 구조

**서버 + SPA의 "이중 구조"가 아니라, 하나의 앱에 컴파일 타깃이 둘이다.**
배포 산출물이 하나이고 서버가 클라이언트를 같은 오리진에서 서빙한다.
그래서 모노레포(npm workspaces)를 쓰지 않는다.

```
shared/   프레임워크 의존 0. 서버·클라 양쪽에 컴파일됨
server/   tsc → dist/server
client/   vite → dist/public
public/   Vite publicDir (favicon, robots, sitemap)
docs/     설계 문서
```

- **ESM 전면 통일** (`"type": "module"`, `module: NodeNext`)
- **alias 없이 상대 경로 + `.js` 확장자**: `import { x } from "../shared/rules.js"`
  tsc와 Vite 양쪽이 설정 없이 처리한다. `paths`/`tsc-alias`를 도입하지 말 것.
- `shared/`는 어떤 프레임워크도 import하지 않는다 (`zod`만 예외).

## 절대 어기면 안 되는 것

1. **정보 은닉**: 라운드 진행 중 라이어 정체와 타인의 제시어는
   해당 뷰어에게 전송되는 **바이트에 존재해서도 안 된다.**
   관전자는 제시어를 일절 보지 못한다. StateView를 만지는 코드는
   `server/rooms/projection.ts` 하나뿐이어야 한다.
   → 바이트 수준 테스트가 **배포 게이트**다.

2. **서버 권위**: 모든 페이즈 전이는 서버가 결정한다.
   클라이언트가 타임아웃을 알려주는 구조를 만들지 말 것 (v1 최대 결함).

3. **URL 불변**: `/`, `/create`, `/room/:id` — 이미 공유된 링크가 있다.

4. **입력 처리**: 검증은 저장 시, 이스케이프는 렌더 시.
   서버에서 HTML 엔티티 인코딩을 하지 말 것 (v1의 이중 이스케이프 버그).

5. **시간 전달**: 절대 시각이 아니라 **상대 시간(`remainingMs`)** 을 보낸다.

## 자주 밟는 함정 (전체는 체크리스트 G절)

- `onLeave(client, code)` — 0.17에서 두 번째 인자가 `boolean`이 아니라 **close code**다.
  `code === 4000`이 정상 퇴장. `if (consented)`로 쓰면 **컴파일은 되고 재접속이 영영 안 된다.**
- `Room<{ state: S }>` — 0.16의 `Room<S>`가 아니다.
- `StateView`는 `@colyseus/schema`에서 import (`colyseus` 아님).
- `Delayed.pause()`는 중첩 카운트를 하지 않는다 — 끊긴 인원 수를 직접 세야 한다.
- `tsx`/`vite`는 타입을 검사하지 않는다. **`tsc --noEmit`을 반드시 돌릴 것.**

## 마일스톤

| | 범위 |
|---|---|
| ~~M1~~ ✅ | 방 생성·참가·대기실·1라운드 완주 (관전·점수·연출 없이) |
| ~~M2~~ ✅ | 재접속(30초 유예) + 일시정지 + 라이어 이탈 차등 |
| **M3** ← 다음 | 관전 |
| M4 | 연속 라운드 + 점수판 |
| M5 | 연출 이식 |
| M6 | 피드백·SEO·배포 파이프라인 |
| M7 | v1 대체 (`v2.0.0` 태그) |

전부 만들고 통합하지 않는다. 각 마일스톤 끝에서 실제로 플레이 가능해야 한다.

## 이식된 자산

v1에서 가져온 것. 코드가 아니라 **콘텐츠**이므로 함부로 줄이거나 바꾸지 말 것.

- `shared/words.ts` — 6카테고리 × 30단어 = 180단어
- `shared/nicknames.ts` — 형용사 20 × 명사 20
- `client/app.css` — 테마 색상 + 연출 키프레임 14종
- `public/` — favicon, robots, sitemap

## M3에서 할 일 (관전)

- `onAuth`가 지금은 라운드 중 입장을 거부한다. 관전자로 받도록 바꾼다.
- **관전자 정원 = 최대 인원 − 현재 플레이어 수** (D11). 이 불변식 덕분에
  다음 라운드 자동 승격이 절대 정원을 넘지 않는다.
- `projection.ts`의 `syncViews`에 이미 관전자 분기가 있다 (view에 아무것도 담지 않음).
  **관전자는 제시어를 일절 보지 못한다.**
- 관전자는 채팅 읽기 전용 — 디스패처에 이미 걸려 있다.
- 로비에 게임 중인 방을 `관전 가능` 배지와 함께 노출한다 (D12).
  `/api/rooms`가 지금은 `inProgress` 방을 걸러낸다.
