import { defineConfig, devices } from "@playwright/test";

/**
 * 실브라우저 스모크 — **수동 전용. CI와 배포 파이프라인에서 돌리지 않는다.**
 *
 * `npm test` 에 포함되지 않으며, 필요할 때만 손으로 돌린다:
 *
 *      npm run test:e2e:install     # 최초 1회 (브라우저 내려받기)
 *      npm run test:e2e
 *
 * 왜 CI에서 뺐나: 브라우저 없이 도는 계층이 위험의 대부분을 이미 덮는다.
 *
 *   client/smoke.test.ts        화면 렌더 + 새면 안 될 정보          2.1초
 *   client/integration.test.ts  실 Colyseus 서버 + 실 WebSocket      3.6초
 *
 * 그럼 이쪽만 잡는 것은 무엇인가. **라우팅 전환**이다. 화면이 갈릴 때 도는
 * $effect와 그 정리(cleanup)는 브라우저에서만 실행된다. 컴포넌트를 하나씩
 * 마운트하는 1계층은 그 경로를 통과하지 않고, 서버 테스트는 클라 라우팅을
 * 아예 모른다. 2026-08-20 첫 실행에서 D7(방 생성 직후 자기 재접속)과
 * 그 수정이 유발한 $effect 무한 루프를 여기서 잡았다.
 *
 * 프로덕션 빌드를 그대로 띄운다 — 개발 프록시가 없는 상태를 검증하기 위해서다.
 */
const PORT = 4173;

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  // **로컬에 이미 있는 Edge를 쓴다.** Playwright 전용 브라우저를 내려받지 않는다
  // (`channel`이 시스템에 설치된 실물을 가리킨다). Windows에는 Edge가 항상 있고,
  // Playwright MCP도 같은 것을 쓰므로 손으로 보는 화면과 테스트가 같은 엔진이다.
  //
  // Edge가 없는 환경(WSL 등)이라면:
  //     npx playwright install chromium
  // 을 한 뒤 아래 channel 줄을 지운다.
  projects: [{ name: "msedge", use: { ...devices["Desktop Edge"], channel: "msedge" } }],
  webServer: {
    command: "npm run build && npm start",
    port: PORT,
    // ⚠️ 이 환경에는 dotenvx가 node 프로세스에 .env를 자동 주입한다. 웹훅을 비워
    //    두지 않으면 E2E가 띄운 서버가 운영자의 실제 Discord를 바라본다.
    env: { NODE_ENV: "production", PORT: String(PORT), DISCORD_WEBHOOK_URL: "" },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
