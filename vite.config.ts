import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

// 개발 모드에만 프록시가 있다. 프로덕션은 서버가 dist/public을 같은 오리진에서
// 서빙하므로 프록시가 없다 — 이 차이를 잊으면 "로컬은 되는데 배포하면 안 됨"이 난다.
//
// 포트는 scripts/dev.mjs가 정해서 PORT로 넘겨준다. 서버와 프록시가 같은 값을
// 읽어야 하므로 여기서 하드코딩하지 않는다.
const SERVER = `http://localhost:${process.env.PORT ?? 2567}`;

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  publicDir: "public",
  build: {
    outDir: "dist/public",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      // Colyseus 매치메이킹 (HTTP)
      "/matchmake": SERVER,
      // 게임 REST API
      "/api": SERVER,
      // WebSocket 업그레이드
      "/": { target: SERVER, ws: true, bypass: (req) =>
        req.headers.upgrade === "websocket" ? undefined : req.url },
    },
  },
});
