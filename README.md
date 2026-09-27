# 라이어 게임 (Word Wolf)

로그인 없이 링크 하나로 모여, 한 명의 라이어를 찾아내는 실시간 추리 게임.

**https://liar-game.guest-01.dev**

---

## 특징

- **계정 없이 링크로 참가** — 닉네임만 정하면 된다. 비공개 방은 비밀번호로 잠근다.
- **끊겨도 돌아온다** — 새로고침·탭 전환·네트워크 끊김 후 30초 안에 돌아오면 같은
  자리로 복귀한다. 누가 끊기면 그동안 게임이 일시정지된다.
- **서버가 진행한다** — 타이머와 단계 전환은 전부 서버가 결정한다.
  호스트가 탭을 내려도 게임이 멈추지 않는다.
- **관전** — 게임 중에 들어오면 관전자가 되고, 다음 라운드에 자동으로 합류한다.
  관전자도 제시어는 보지 못한다.
- **연속 라운드와 누적 점수** — 3 / 5 / 무제한 라운드, 라운드마다 점수판, 끝나면 최종 순위.
- **정보 은닉** — 라이어 정체와 남의 제시어는 화면뿐 아니라 **전송되는 데이터에도**
  없다. 바이트 수준 테스트가 배포 조건이다.

## 게임 규칙

- 4~10명. 한 명이 **라이어**, 나머지는 같은 **제시어**를 받는다. 카테고리는 모두에게 공개된다.
- **일반 모드**: 라이어는 제시어 없이 유추해야 한다.
  **바보 모드**: 라이어도 자신이 라이어인지 모른다 (같은 카테고리의 다른 단어를 받는다).
- 무작위 순서로 돌아가며 제시어를 한 줄로 설명한다.
- 채팅으로 토론하며 라이어를 지목한다. 최다 득표자는 최후 변론 후 찬반 투표에 부쳐진다.
- 라이어를 처형하면 시민 승. 단, **라이어가 제시어를 맞히면 역전승**.
- 설명 다시하기·재토론 기회는 각각 2회까지. 다 쓰고도 못 잡으면 라이어 승.

| 결과 | 점수 |
|---|---|
| 라이어 승 | 라이어 +2 |
| 시민 승 | 시민 전원 +1 |
| 라이어를 지목한 시민 | +1 (승패 무관) |

자세한 규칙은 [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) §1.

## 스택

| | |
|---|---|
| 서버 | Node 22 · TypeScript · [Colyseus](https://colyseus.io) 0.17 · Express 5 |
| 클라이언트 | Svelte 5 · Vite · Tailwind 4 |
| 테스트 | Vitest · @colyseus/testing · Playwright(수동) |
| 배포 | 단일 Docker 이미지 · DB 없음 · 인메모리 |

서버가 클라이언트를 같은 오리진에서 서빙하는 하나의 앱이다.

```
shared/   서버·클라이언트 공용 (게임 규칙, 프로토콜, 단어)
server/   Colyseus 룸과 HTTP API
client/   Svelte SPA
docs/     설계 문서
```

## 개발

Node 22가 필요하다 (`.nvmrc`).

```bash
npm ci
npm run dev          # 서버 + Vite. 빈 포트를 찾아 띄운다 (기본 2567)
```

Vite가 알려주는 주소(보통 http://localhost:5173)로 접속한다.

혼자서 여러 명을 조작할 수는 없으므로 **봇**을 붙여 플레이한다.

```bash
npm run bots -- --room <방ID>             # 내가 만든 방에 봇 3명
npm run bots -- --create --auto-start     # 봇 4명이 알아서 한 판
```

봇은 매 상태마다 불변식(정보 은닉·정원·기회 상한)을 검사하고, 깨지면 그 자리에서 멈춘다.

### 테스트

```bash
npm test             # 전체 (약 2분)
npm run test:client  # 클라이언트만 (약 10초)
npm run typecheck    # tsc + svelte-check
npm run test:e2e     # Playwright. 수동 전용, 로컬 Edge 사용
```

### 주의

- **Windows에서 `npm install <패키지>`를 하면 lockfile이 깨져 CI가 실패한다.**
  설치는 `npm ci`로 하고, 의존성을 추가할 때는
  [`REGRESSION-CHECKLIST.md`](docs/REGRESSION-CHECKLIST.md) G4의 대처법을 따른다.
- Colyseus 관련 버전은 캐럿 없이 정확히 고정한다.

## 배포

`v*` 태그를 푸시하면 GitHub Actions가 타입 검사·테스트·빌드를 거쳐 Docker 이미지를
GHCR(`ghcr.io/guest-01/liar-game-web`)에 게시한다. main 병합만으로는 이미지가 나가지 않는다.

```bash
npm run build
NODE_ENV=production node dist/server/index.js
```

시작 로그 첫 줄에 버전이 찍힌다 (`🎮 라이어 게임 v2.0.0 서버 …`). 태그를 밀기 전에
`package.json`의 `version`을 태그와 맞춘다.

| 환경 변수 | 기본값 | |
|---|---|---|
| `PORT` | `2567` (Docker 이미지는 `3000`) | 이미지는 v1과 같은 포트라 기존 리버스 프록시 설정 그대로 붙는다 |
| `NODE_ENV` | — (Docker 이미지는 `production`) | `production`이면 빌드된 클라이언트를 서빙하고, 로그를 v1과 같은 한 줄 형식으로 남긴다 |
| `BASE_URL` | `https://liar-game.guest-01.dev` | OG 태그·sitemap의 절대 URL |
| `LOG_LEVEL` | `info` (개발 `debug`) | |
| `DISCORD_WEBHOOK_URL` | — | 설정하면 인앱 피드백이 켜진다. 클라이언트에 노출되지 않는다 |

## v1에서 다시 만든 이유

v1(Express + EJS + Alpine.js + Socket.IO)은 동작했지만 구조적 결함이 있었다.

- **호스트 브라우저가 게임 진행의 권위를 쥐고 있었다.** 호스트가 탭을 백그라운드로
  두면 타이머가 멈춰 게임 전체가 정지했다.
- **새로고침하면 게임에서 퇴출됐다.** `socket.id`를 플레이어 정체성으로 썼기 때문에
  재접속이 불가능했고, 라이어가 2초 끊기면 그 자리에서 게임이 끝났다.
- 상태 머신이 서버와 클라이언트에 이중으로 존재했고, 오케스트레이션의 절반이
  테스트 불가능한 소켓 핸들러에 있었다.

v2는 **서버 권위 + 세션 기반 재접속**을 전제로 다시 설계했다.

## 설계 문서

| | |
|---|---|
| [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) | 게임 규칙, 기능/비기능 요구사항, 결정 기록 |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 스택, 저장소 구조, 상태 모델, 페이즈 머신 |
| [`docs/REGRESSION-CHECKLIST.md`](docs/REGRESSION-CHECKLIST.md) | v1에서 고친 버그 — 다시 만들지 않기 위한 목록 |
| [`docs/spikes/colyseus/FINDINGS.md`](docs/spikes/colyseus/FINDINGS.md) | Colyseus 채택 검증 결과 |

## 라이선스

MIT
