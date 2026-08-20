import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

/**
 * 서버와 클라이언트는 실행 환경이 다르므로 프로젝트를 나눈다.
 *
 * 클라이언트에 `resolve.conditions: ["browser"]` 를 주는데, 이것을 전역으로 걸면
 * 서버 테스트의 의존성 해석까지 브라우저 쪽으로 틀어진다.
 */
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
        },
      },
      {
        plugins: [svelte()],
        resolve: { conditions: ["browser"] },
        test: {
          name: "client",
          include: ["client/**/*.test.ts"],
          environment: "happy-dom",
        },
      },
    ],
  },
});
