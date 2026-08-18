import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client as ClientSDK } from "@colyseus/sdk";
import { createServer } from "http";
import { LiarRoom } from "./room";
import { CITIZEN_WORD, LIAR_WORD } from "./schema";

const PORT = 2571;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n: string, ok: boolean, d = "") => {
  ok ? (pass++, console.log(`  ✅ ${n}`)) : (fail++, console.log(`  ❌ ${n}${d ? `\n       → ${d}` : ""}`));
};
const words = (r: any) => { const o: any = {}; r.state.players.forEach((p: any) => o[p.nickname] = p.myWord ?? ""); return o; };

async function main() {
  const httpServer = createServer();
  const gs = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  gs.define("liar", LiarRoom);
  await gs.listen(PORT);
  const sdk = new ClientSDK(`ws://localhost:${PORT}`);

  const alice = await sdk.create("liar", { nickname: "alice" });
  const bob = await sdk.joinById(alice.roomId, { nickname: "bob" });
  const carol = await sdk.joinById(alice.roomId, { nickname: "carol" });
  const dave = await sdk.joinById(alice.roomId, { nickname: "dave" });
  await sleep(200);
  alice.send("start-round");
  await sleep(300);
  console.log(`\n  라운드 시작. bob이 보는 단어: ${JSON.stringify(words(bob))}`);
  await sleep(5200);                      // 0.17 최소 가동시간 가드 통과

  // ── 시나리오 1: 네트워크 끊김 (소켓 강제 종료, SDK 자동 재접속) ──
  console.log("\n─── 시나리오 1: 네트워크 끊김 (SDK 자동 재접속) ───");
  const bobSid = bob.sessionId;
  const ws: any = (bob as any).connection?.transport?.ws ?? (bob as any).connection?.ws;
  check("raw 소켓 핸들 확보", !!ws, `connection keys: ${Object.keys((bob as any).connection ?? {})}`);
  if (ws) {
    ws.close(4001, "simulated network drop");   // 4000은 Colyseus의 "정상 퇴장" 코드이므로 4001 사용
    await sleep(600);
    check("끊긴 직후 carol 시점에 bob이 남아있다", (carol.state as any).players.has(bobSid));
    check("carol이 bob의 isConnected=false를 본다",
      (carol.state as any).players.get(bobSid)?.isConnected === false,
      `isConnected=${(carol.state as any).players.get(bobSid)?.isConnected}`);
    await sleep(3000);                          // SDK 자동 재시도 대기
    check("자동 재접속 후 carol이 bob의 isConnected=true를 본다",
      (carol.state as any).players.get(bobSid)?.isConnected === true,
      `isConnected=${(carol.state as any).players.get(bobSid)?.isConnected}`);
    const w = words(bob);
    check("자동 재접속 후 bob의 제시어가 복구된다", w.bob === CITIZEN_WORD, JSON.stringify(w));
    check("자동 재접속 후에도 타인 제시어는 안 보인다", !w.alice && !w.carol, JSON.stringify(w));
  }

  // ── 시나리오 2: 브라우저 새로고침 (새 Client 인스턴스 + 저장된 토큰) ──
  console.log("\n─── 시나리오 2: 브라우저 새로고침 (토큰으로 복귀) ───");
  const daveSid = dave.sessionId;
  const daveToken = (dave as any).reconnectionToken;
  check("reconnectionToken이 존재한다 (저장 가능)", !!daveToken, String(daveToken));
  const dws: any = (dave as any).connection?.transport?.ws ?? (dave as any).connection?.ws;
  (dave as any).reconnectionToken = undefined;     // 원본 인스턴스의 자동 재접속 무력화
  dws?.close(4001, "tab closed");
  await sleep(600);

  const sdk2 = new ClientSDK(`ws://localhost:${PORT}`);   // 새 탭 = 새 Client
  let dave2: any = null, err = "";
  try { dave2 = await sdk2.reconnect(daveToken); await sleep(600); }
  catch (e: any) { err = e?.message ?? String(e); }
  check("새 Client 인스턴스로 재접속 성공", !!dave2, err);
  if (dave2) {
    check("sessionId가 동일하다", dave2.sessionId === daveSid, `${dave2.sessionId} vs ${daveSid}`);
    const w2 = words(dave2);
    check("새로고침 후 자기 제시어가 복구된다", w2.dave === CITIZEN_WORD, JSON.stringify(w2));
    check("새로고침 후에도 타인 제시어는 안 보인다", !w2.alice && !w2.bob, JSON.stringify(w2));
    check("새로고침 후 라이어 정체는 여전히 숨겨져 있다", (dave2.state as any).revealedLiarId === "");
  }

  // ── 시나리오 3: 유예 초과 ──
  console.log("\n─── 시나리오 3: 유예 초과 시 이탈 확정 ───");
  console.log("  (allowReconnection 30초 → 스파이크에서는 서버 코드를 2초로 낮춰 검증)");

  console.log(`\n${"═".repeat(50)}\n  통과 ${pass} / 실패 ${fail}\n${"═".repeat(50)}\n`);
  await gs.gracefullyShutdown(false);
  process.exit(fail > 0 ? 1 : 0);
}
main().catch(e => { console.error("ERROR:", e); process.exit(2); });
