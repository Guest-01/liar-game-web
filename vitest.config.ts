import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["{shared,server,client}/**/*.test.ts"],
    environment: "node",
    // @colyseus/testing의 boot()가 고정 포트를 잡으므로 테스트 파일을
    // 병렬로 돌리면 EADDRINUSE가 난다.
    fileParallelism: false,
    hookTimeout: 20_000,
  },
});
