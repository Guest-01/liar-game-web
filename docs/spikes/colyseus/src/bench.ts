import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client as ClientSDK } from "@colyseus/sdk";
import { createServer } from "http";
import { LiarRoom } from "./room";

const PORT = 2570;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main() {
  const httpServer = createServer();
  const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  gameServer.define("liar", LiarRoom);
  await gameServer.listen(PORT);
  const sdk = new ClientSDK(`ws://localhost:${PORT}`);

  const N = 10;
  const first = await sdk.create("liar", { nickname: "p0" });
  for (let i = 1; i < N; i++) await sdk.joinById(first.roomId, { nickname: `p${i}` });
  await sleep(300);
  first.send("start-round");
  await sleep(300);

  const room: any = matchMaker.getLocalRoomById(first.roomId);
  console.log(`\n  방 인원: ${room.clients.length}명, StateView 보유: ${room.clients.filter((c:any)=>c.view).length}명`);

  // 상태 변경 → 패치 인코딩 사이클을 직접 반복 측정
  const ITER = 300;
  const times: number[] = [];
  for (let i = 0; i < ITER; i++) {
    // 매 반복 공개 필드를 변경해 패치를 강제 발생시킴
    room.state.phase = `discussion-${i}`;
    const t0 = process.hrtime.bigint();
    room.broadcastPatch();
    const t1 = process.hrtime.bigint();
    times.push(Number(t1 - t0) / 1e6);
  }
  times.sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);
  console.log(`\n  ── 10인 방 · StateView 10개 · 패치 ${ITER}회 ──`);
  console.log(`  평균 ${(sum/ITER).toFixed(3)}ms | 중앙값 ${times[Math.floor(ITER*0.5)].toFixed(3)}ms | p95 ${times[Math.floor(ITER*0.95)].toFixed(3)}ms | 최대 ${times[ITER-1].toFixed(3)}ms`);

  // 비교군: StateView 전부 제거
  for (const c of room.clients) c.view = undefined;
  const times2: number[] = [];
  for (let i = 0; i < ITER; i++) {
    room.state.phase = `noview-${i}`;
    const t0 = process.hrtime.bigint();
    room.broadcastPatch();
    const t1 = process.hrtime.bigint();
    times2.push(Number(t1 - t0) / 1e6);
  }
  times2.sort((a, b) => a - b);
  const sum2 = times2.reduce((a, b) => a + b, 0);
  console.log(`  ── 동일 조건 · StateView 없음 (비교군) ──`);
  console.log(`  평균 ${(sum2/ITER).toFixed(3)}ms | 중앙값 ${times2[Math.floor(ITER*0.5)].toFixed(3)}ms | p95 ${times2[Math.floor(ITER*0.95)].toFixed(3)}ms`);
  console.log(`\n  → StateView 오버헤드: 패치당 약 ${((sum-sum2)/ITER).toFixed(3)}ms (${(sum/sum2).toFixed(1)}배)`);
  console.log(`  → 기본 patchRate 50ms(20fps) 기준 CPU 점유율: ${((sum/ITER)/50*100).toFixed(2)}%\n`);

  await gameServer.gracefullyShutdown(false);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
