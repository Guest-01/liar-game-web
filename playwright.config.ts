import { defineConfig, devices } from "@playwright/test";

/**
 * 2계층 — 실브라우저 스모크.
 *
 * 1계층(happy-dom, `client/*.test.ts`)이 모듈 로드·마운트·렌더를 잡고,
 * 여기서는 **실제 브라우저에서만 드러나는 것**을 본다:
 * 여러 탭 사이의 실시간 동기화, 실제 WebSocket, 라우팅, 클릭 흐름.
 *
 * 프로덕션 빌드를 그대로 띄운다 — 개발 프록시가 없는 상태를 검증하기 위해서다.
 *
 * ⚠️ WSL 로컬에서는 `libnss3`, `libnspr4` 가 없으면 브라우저가 뜨지 않는다:
 *      sudo apt-get install -y libnss3 libnspr4
 *    CI(ubuntu-latest)에서는 `--with-deps` 로 자동 설치된다.
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
