import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

/**
 * 서버와 클라이언트는 실행 환경이 다르므로 프로젝트를 나눈다.
 *
 * 클라이언트에 `resolve.conditions: ["browser"]` 를 주는데, 이것을 전역으로 걸면
 * 서버 테스트의 의존성 해석까지 브라우저 쪽으로 틀어진다.
 */
/**
 * 테스트 중 서버 로그는 기본으로 끈다.
 *
 * 룸 테스트가 실제 방을 수백 개 만들기 때문에 pino 출력이 수만 자에 달해
 * 정작 실패한 단언이 스크롤 위로 밀려난다. 디버깅할 때는 되살린다:
 *
 *      LOG_LEVEL=debug npm test      (PowerShell: $env:LOG_LEVEL='debug')
 */
const LOG_LEVEL = process.env.LOG_LEVEL ?? "silent";

export default defineConfig({
  test: {
    // @colyseus/testing의 boot()가 고정 포트를 잡으므로 병렬 실행하지 않는다
    fileParallelism: false,
    projects: [
      {
        test: {
          name: "server",
          include: ["{shared,server}/**/*.test.ts"],
          environment: "node",
          hookTimeout: 20_000,
          env: { LOG_LEVEL },
        },
      },
      {
        plugins: [svelte()],
        resolve: { conditions: ["browser"] },
        test: {
          name: "client",
          include: ["client/**/*.test.ts"],
          environment: "happy-dom",
          // integration.test.ts가 실제 Colyseus 서버를 띄우므로 여기도 필요하다
          env: { LOG_LEVEL },
        },
      },
    ],
  },
});
