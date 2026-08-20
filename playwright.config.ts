import { defineConfig, devices } from "@playwright/test";

/**
 * 실브라우저 스모크 — **수동 전용. CI와 배포 파이프라인에서 돌리지 않는다.**
 *
 * `npm test` 에 포함되지 않으며, 필요할 때만 손으로 돌린다:
 *
 *      npm run test:e2e:install     # 최초 1회 (브라우저 내려받기)
 *      npm run test:e2e
 *
 * 왜 자동화에서 뺐나: 브라우저 없이 도는 계층이 실제 위험을 이미 덮는다.
 *
 *   client/smoke.test.ts        화면 렌더 + 새면 안 될 정보          2.1초
 *   client/integration.test.ts  실 Colyseus 서버 + 실 WebSocket      3.6초
 *
 * Playwright가 유일하게 더 잡는 것은 CSS로 요소가 안 보이거나 클릭이 막히는
 * 부류다. 그 값어치보다 브라우저 설치 ~170MB와 실행 1~2분이 비싸다고 봤다.
 * UI를 크게 손봤을 때 손으로 한 번 돌리는 용도로 남긴다.
 *
 * 프로덕션 빌드를 그대로 띄운다 — 개발 프록시가 없는 상태를 검증하기 위해서다.
 *
 * ⚠️ WSL에서는 라이브러리 두 개가 더 필요하다 (나머지 14개는 이미 있다):
 *      sudo apt-get install -y libnss3 libnspr4
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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npm start",
    port: PORT,
    env: { NODE_ENV: "production", PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
