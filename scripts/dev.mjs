/**
 * 개발 서버 실행기.
 *
 * 포트를 **양쪽이 시작되기 전에** 확정해서 넘긴다.
 *
 * 서버가 스스로 다음 포트로 넘어가게 두면 Vite 프록시가 옛 포트를 계속
 * 가리켜서 "서버는 떴는데 화면이 아무것도 안 됨"이 된다. 프록시 대상은
 * 프로덕션에 존재하지 않는 개발 전용 배선이라 이런 어긋남이 특히 찾기 어렵다.
 * 그래서 오케스트레이터가 정하고 둘 다에게 같은 값을 준다.
 *
 * - PORT를 직접 지정하면 그 포트를 고수하고, 점유 중이면 실패한다 (예측 가능하게)
 * - 지정하지 않으면 기본 포트부터 비어 있는 포트를 찾는다
 */
import { createServer } from "node:net";
import { spawn } from "node:child_process";

const DEFAULT_PORT = 2567;       // Colyseus 기본값. 3000은 다른 도구와 너무 자주 겹친다
const DEFAULT_HMR_PORT = 24678;  // Vite HMR 전용. 프록시를 타지 않아야 한다 (아래 참조)
const MAX_TRIES = 20;

function isFree(port) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "0.0.0.0");
  });
}

async function resolvePort() {
  const explicit = process.env.PORT;
  if (explicit) {
    const port = Number(explicit);
    if (!(await isFree(port))) {
      console.error(`\n✖ 포트 ${port}이 이미 사용 중입니다.`);
      console.error(`  PORT를 직접 지정했으므로 다른 포트로 넘어가지 않습니다.`);
      console.error(`  PORT를 지우면 빈 포트를 자동으로 찾습니다.\n`);
      process.exit(1);
    }
    return port;
  }

  for (let i = 0; i < MAX_TRIES; i++) {
    const port = DEFAULT_PORT + i;
    if (await isFree(port)) {
      if (i > 0) console.log(`ℹ 포트 ${DEFAULT_PORT}~${port - 1}이 사용 중이라 ${port}을 씁니다.`);
      return port;
    }
  }
  console.error(`✖ ${DEFAULT_PORT}부터 ${MAX_TRIES}개 포트가 모두 사용 중입니다.`);
  process.exit(1);
}

async function findFree(from, label) {
  for (let i = 0; i < MAX_TRIES; i++) {
    if (await isFree(from + i)) return from + i;
  }
  console.error(`✖ ${label} 포트를 찾지 못했습니다 (${from}부터 ${MAX_TRIES}개 시도).`);
  process.exit(1);
}

const port = await resolvePort();

// Vite HMR을 **별도 포트**로 뺀다.
//
// Vite HMR은 `ws://<vite>/?token=...` 로 붙는데, 우리 프록시는 WebSocket 업그레이드를
// 전부 Colyseus로 넘긴다(Colyseus는 `/{processId}/{roomId}` 를 쓴다). 같은 포트를 쓰면
// HMR 소켓이 Colyseus로 흘러들어가 "Invalid WebSocket frame" 이 쏟아진다.
// HMR을 따로 빼면 프록시를 타는 WebSocket은 Colyseus 것뿐이다.
const hmrPort = await findFree(DEFAULT_HMR_PORT, "HMR");

console.log(`\n▶ 서버 :${port}  ·  HMR :${hmrPort}  ·  Vite가 알려주는 주소로 접속하세요\n`);

// shell:true와 배열 인자를 함께 쓰면 배열이 공백으로 이어 붙어 각 명령이
// 쪼개진다. 인자를 그대로 전달하기 위해 셸을 쓰지 않는다.
// PORT는 env로 내려가므로 명령 문자열에 넣지 않는다.
const child = spawn(
  "npx",
  ["concurrently", "-n", "server,client", "-c", "blue,magenta",
   "tsx watch --env-file-if-exists=.env server/index.ts",
   "vite"],
  { stdio: "inherit", env: { ...process.env, PORT: String(port), VITE_HMR_PORT: String(hmrPort) } },
);

const stop = () => child.kill("SIGINT");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(code ?? 0));
