import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client as ClientSDK } from "@colyseus/sdk";
import { createServer } from "http";
import { LiarRoom } from "./room";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = "") =>
  ok ? (pass++, console.log(`  ✅ ${n}`)) : (fail++, console.log(`  ❌ ${n}${d ? ` → ${d}` : ""}`));

async function main() {
  const httpServer = createServer();
  const gs = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  gs.define("liar", LiarRoom);
  await gs.listen(2573);
  const sdk = new ClientSDK("ws://localhost:2573");

  const alice = await sdk.create("liar", { nickname: "alice" });
  const bob = await sdk.joinById(alice.roomId, { nickname: "bob" });
  const carol = await sdk.joinById(alice.roomId, { nickname: "carol" });
  await sleep(200); alice.send("start-round"); await sleep(300); await sleep(5200);

  const bobSid = bob.sessionId;
  const token = (bob as any).reconnectionToken;
  const ws: any = (bob as any).connection?.transport?.ws ?? (bob as any).connection?.ws;
  console.log(`\n─── 유예 ${process.env.GRACE}초 · 만료 후 이탈 확정 ───`);
  ws.close(4001, "drop");
  await sleep(500);
  check("유예 중에는 방에 남아있다", (carol.state as any).players.has(bobSid));
  check("유예 중 isConnected=false", (carol.state as any).players.get(bobSid)?.isConnected === false);

  await sleep(3000);   // GRACE=2 이므로 만료
  check("유예 만료 후 방에서 제거된다", !(carol.state as any).players.has(bobSid),
    `keys=[${[...(carol.state as any).players.keys()].join(",")}]`);

  let late: any = null, err = "";
  try { late = await new ClientSDK("ws://localhost:2573").reconnect(token); }
  catch (e: any) { err = e?.message ?? String(e); }
  check("유예 만료 후 재접속은 거부된다", !late, late ? "재접속이 성공해버림" : `(거부됨: ${err.slice(0, 60)})`);

  console.log(`\n  통과 ${pass} / 실패 ${fail}\n`);
  await gs.gracefullyShutdown(false);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
