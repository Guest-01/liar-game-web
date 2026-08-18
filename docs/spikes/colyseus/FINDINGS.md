# Colyseus 채택 스파이크 — 결과

> **목적**: `REQUIREMENTS.md` §2(정보 공개 3계층)를 Colyseus가 감당하는지 검증하고,
> 감당한다면 스택으로 채택할지 결정한다.
>
> **일자**: 2026-08-18 · **결론**: ✅ **채택 권장** (버전 고정 필수)

---

## 1. 한 줄 결론

**StateView가 3계층 정보 은닉을 바이트 수준에서 해결한다.**
우려했던 "공개 state는 Schema, 비밀은 개별 전송" 하이브리드는 **불필요**하다.
다만 생태계 QA가 거칠어(파손된 배포, 무언의 파괴적 변경, 패키지 개명)
**버전 고정과 회귀 테스트가 필수**다.

---

## 2. 검증 환경

| 조합 | 결과 |
|---|---|
| `colyseus@0.16.5` + `colyseus.js@0.16.22` (+ core 0.16.24 고정) | 24 / 24 통과 |
| **`colyseus@0.17.10` + `@colyseus/sdk@0.17.43`** ← 채택 대상 | 정보 은닉 13/13 · 재접속 5/5 · 유예 4/4 |

재현: `docs/spikes/colyseus/` 에서 `npm i && npm run hiding && npm run reconnect && npm run grace && npm run bench`

---

## 3. 핵심 검증 — 정보 은닉 (C2)

4인 플레이어 + 관전자 1명, 바보 모드. 각 클라이언트가 **디코딩한 state**와
**서버가 실제로 전송한 소켓 바이트** 양쪽을 확인했다.

```
[각 클라이언트가 디코딩한 myWord]
  alice(라이어): {"alice":"…LIAR_돌솥밥", "bob":"", "carol":"", "dave":"", "eve":""}
  bob   (시민): {"alice":"",  "bob":"…CITIZEN_김치찌개", "carol":"", "dave":"", "eve":""}
  carol (시민): {"alice":"",  "bob":"", "carol":"…CITIZEN_김치찌개", "dave":"", "eve":""}
  eve (관전자): {"alice":"",  "bob":"", "carol":"", "dave":"", "eve":""}
```

**바이트 수준 검증** — 센티널 문자열을 소켓 전송 바이트에서 직접 검색:

| 수신자 | 시민 단어 바이트 | 라이어 단어 바이트 | 판정 |
|---|:---:|:---:|:---:|
| alice (라이어) | 없음 | 있음 | ✅ |
| bob / carol / dave (시민) | 있음 | 없음 | ✅ |
| **eve (관전자)** | **없음** | **없음** | ✅ |

- 라이어 정체는 애초에 state에 넣지 않고 서버 전용 변수로 둔다 → 결과 공개 시에만 state에 기록.
- 바보 모드에서 라이어 본인의 `amILiar`조차 `false`로 유지 → 본인도 모른다. ✅
- 결과 공개 시 전원의 `view`에 모든 Player를 `add()` 하면 일괄 공개된다. ✅

### 구현 형태

```ts
class Player extends Schema {
  @type("string")  nickname = "";        // 전원 공개
  @type("boolean") isConnected = true;   // 전원 공개
  @view() @type("string")  myWord = "";  // ← view에 담긴 클라이언트만
  @view() @type("boolean") amILiar = false;
}

onJoin(client) {
  client.view = new StateView();
  client.view.add(myPlayer);   // 자기 자신만 담는다 → 관전자는 아무것도 안 담음
}
```

> ⚠️ `StateView`는 `colyseus`가 아니라 **`@colyseus/schema`** 에서 import 한다.
> `colyseus`에서 import 하면 `undefined`이고 런타임에야 터진다.

---

## 4. 재접속 (R1 / R5)

| 시나리오 | 결과 |
|---|---|
| **브라우저 새로고침** (새 Client + 저장된 토큰) | ✅ sessionId 동일, 제시어 복구, 타인 제시어 여전히 비공개, 라이어 정체 여전히 은닉 |
| 유예 중 상태 | ✅ 방에 남아있고 `isConnected=false`가 타인에게 보임 |
| **유예 만료** | ✅ 자동 제거 + 이후 토큰 재사용 거부 |
| 순수 네트워크 끊김 (자동 재시도) | ⚠️ **미검증** — 아래 참조 |

- `allowReconnection(client, seconds)`가 요구사항 R1/R5를 그대로 충족한다.
- `reconnectionToken`을 `sessionStorage`에 저장하면 새로고침 복귀가 성립한다.
- **StateView가 재접속 후에도 정확히 복원**된다 — 이게 가장 중요한 확인이었다.

> **미검증 항목**: 진짜 네트워크 단절(TCP 유실) 시 SDK 내장 자동 재시도.
> 테스트 하네스에서 `ws.close()`는 SDK 입장에서 *정상 종료*라 재시도가 걸리지 않았다.
> 다만 별도 실행에서 SDK가 `Re-establishing sessionId… (attempt 1 of 15)` 로그와 함께
> 자동 재시도하는 것은 관찰했다. **실기기/실네트워크 테스트로 남긴다.**

---

## 5. 성능

10인 방 · StateView 10개 · 패치 300회 반복 측정:

| 조건 | 평균 | 중앙값 | p95 |
|---|---|---|---|
| StateView 10개 | **0.115ms** | 0.095ms | 0.233ms |
| StateView 없음 (비교군) | 0.042ms | 0.036ms | 0.095ms |

- 오버헤드 약 **2.8배**, 절대값은 패치당 **0.074ms**.
- 기본 `patchRate` 50ms(20fps) 기준 **CPU 점유율 0.23%**.
- 공식 문서가 "StateView는 대규모 데이터셋에 최적화되지 않았다"고 경고하지만,
  **10인 턴제 게임 규모에서는 완전히 비이슈**다.
- 턴제이므로 `patchRate`를 더 낮춰도 된다.

## 6. 클라이언트 번들 크기

| 패키지 | minified | gzip |
|---|---|---|
| `@colyseus/sdk` | 124.3 KB | **39.7 KB** |
| `socket.io-client` (v1이 쓰던 것) | 40.9 KB | 12.7 KB |

**+27 KB(gzip)**. 모바일 우선 제품에서 무시할 수치는 아니지만,
Schema 델타 동기화·재접속·매치메이킹을 직접 구현하지 않는 대가로는 수용 가능하다.

---

## 7. 발견된 함정 — 전부 실제로 겪은 것

### ⚠️ 7.1 `onLeave` 시그니처의 무언의 파괴적 변경 — 가장 위험

```ts
// 0.16
onLeave(client: Client, consented?: boolean)
// 0.17
onLeave(client: Client, code?: number)     // ← WebSocket close code
```

0.16 스타일 코드가 **컴파일도 통과하고 타입 에러도 없는데 동작이 정반대**가 된다.
숫자 코드는 항상 truthy이므로 `if (consented)`가 늘 참 → **모든 끊김을 정상 퇴장으로 처리
→ 재접속이 영원히 동작하지 않는다.** 스파이크에서 실제로 이 함정에 빠졌다.

```ts
// 0.17에서 올바른 형태
async onLeave(client: Client, code: number) {
  const consented = code === 4000;   // 4000 = Colyseus의 "정상 퇴장" 코드
  ...
}
```

→ **회귀 체크리스트에 등재했다.**

### ⚠️ 7.2 `@colyseus/core@0.16.25` 배포 파손

`@colyseus/greeting-banner`에 대한 `workspace:^` 참조가 해소되지 않은 채 배포되어
**npm으로 설치 자체가 불가능**하다 (`EUNSUPPORTEDPROTOCOL`).
0.16을 쓰려면 `overrides`로 `0.16.24`에 고정해야 한다. 0.17을 쓰면 회피된다.

### ⚠️ 7.3 클라이언트 SDK 패키지 개명

`colyseus.js` → **`@colyseus/sdk`** (0.17부터).
구 `colyseus.js@0.16.22`는 0.17 서버와 **wire 비호환**이다 —
seat reservation 응답이 `{room:{name,roomId}, sessionId}`에서
`{name, sessionId, roomId, processId}` 평면 구조로 바뀌어 `response.room.name`에서 터진다.

### 7.4 `Server.listen()`을 반드시 써야 한다

`setTransport()`가 `Server.listen()` 내부에서 실행된다.
외부 http 서버를 직접 `listen()` 하면 transport가 전역 등록되지 않아
매치메이킹이 `Cannot read properties of undefined (reading 'protocol')`로 죽는다.

### 7.5 0.17의 방 최소 가동시간 가드

방 생성 후 **5초**가 지나지 않으면 자동 재접속이 거부된다
(`Room has not been up for long enough… min uptime: 5000ms`).
실사용에서는 문제없지만 **테스트 작성 시 반드시 고려**해야 한다.

### 7.6 버전 이동이 빠르다

`@colyseus/sdk`의 `next` 태그가 이미 **0.18.1**이다.
정확한 버전 고정(`~` 아님, 정확 버전)과 업그레이드 시 회귀 테스트가 필요하다.

---

## 8. Colyseus가 해결해주는 것 / 여전히 우리 몫인 것

| 요구사항 | Colyseus | 비고 |
|---|:---:|---|
| **R1** 세션 기반 재접속 | ✅ | `allowReconnection` + `reconnectionToken` |
| **R3** 서버 권위 진행 | ✅ | `clock.setTimeout` (room 스코프, 자동 정리) |
| **R4** 상태 전체 재동기화 | ✅ | Schema가 참가/재접속 시 전체 상태 자동 전송 |
| **R10** 3계층 정보 투영 | ✅ | `StateView` + `@view()` |
| 로비 실시간 목록 / 매치메이킹 | ✅ | 내장 |
| 방 생명주기 · 타이머 정리 | ✅ | v1의 `pendingCallbacks` 수동 관리가 사라진다 |
| — | — | — |
| **R5** 기회 상한 · 라운드 종료 보장 | ❌ | 직접 설계 |
| **R7** 연속 라운드 · 점수 | ❌ | 직접 설계 |
| **R2** 일시정지 (타이머 정지/재개) | ❌ | `clock`을 직접 제어해야 함 |
| 연출 페이즈 모델링 | ❌ | 직접 설계 |
| **C5** 클라이언트 메시지 런타임 검증 | ❌ | 직접 (zod 등) |
| 관전자 정원 불변식 | ❌ | 직접 |

→ 프레임워크가 **인프라 절반**을 가져가고, **게임 설계 절반**은 그대로 우리 몫이다.
이게 정확히 기대했던 분업이다.

---

## 9. 결정

**채택한다.** 근거:

1. 채택을 막을 유일한 조건이었던 **C2(3계층 정보 은닉)가 바이트 수준에서 통과**했다.
2. R1/R3/R4/R10 네 개의 신규 요구사항을 프레임워크가 검증된 형태로 제공한다.
3. 성능·번들 비용이 이 제품 규모에서 수용 가능하다.

**고정할 버전**

```
colyseus       0.17.10
@colyseus/sdk  0.17.43
```

**채택 조건**

- 버전을 **정확히 고정**한다 (캐럿/틸드 금지). 업그레이드는 회귀 테스트를 통과해야 한다.
- **C2 바이트 수준 테스트를 프로덕션 테스트 스위트에 포함**한다
  (`docs/spikes/colyseus/src/run.ts`의 C2-5 방식). 이 테스트가 깨지면 배포를 막는다.
- `onLeave(client, code)` 함정을 회귀 체크리스트로 관리한다.

---

## 10. 다음 스파이크 — 클라이언트 계층

Colyseus 채택으로 서버는 정해졌지만 **클라이언트가 미결**이다.

Schema 인스턴스는 프록시 객체이고 `onChange`/`listen` 콜백 기반이라,
v1이 쓰던 Alpine.js의 반응성과 바로 맞물리지 않을 수 있다.
`@colyseus/sdk`의 상태를 Alpine이 추적 가능한 평범한 객체로 미러링하는
어댑터가 필요한지, 아니면 다른 클라이언트 계층이 나은지 확인이 필요하다.

**이 판단 전까지 `ARCHITECTURE.md`의 클라이언트 절은 쓰지 않는다.**
