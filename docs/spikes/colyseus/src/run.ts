import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { Client as ClientSDK } from "@colyseus/sdk";
import { createServer } from "http";
import { LiarRoom, sentBytes } from "./room";
import { CITIZEN_WORD, LIAR_WORD } from "./schema";

const PORT = 2568;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? `\n       → ${detail}` : ""}`); }
}

// 클라이언트가 실제로 디코딩한 state에서 각 플레이어의 myWord를 읽는다
function wordsSeenBy(room: any): Record<string, string> {
  const out: Record<string, string> = {};
  room.state.players.forEach((p: any, key: string) => { out[p.nickname] = p.myWord ?? ""; });
  return out;
}

async function main() {
  const httpServer = createServer();   // 라우트는 gameServer.listen()이 붙인다
  const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
  gameServer.define("liar", LiarRoom);
  await gameServer.listen(PORT);   // setTransport()가 여기서 실행된다

  const sdk = new ClientSDK(`ws://localhost:${PORT}`);

  console.log("\n─── 셋업: 플레이어 4명 + 관전자 1명 (바보 모드) ───");
  const alice = await sdk.create("liar", { nickname: "alice" });   // ← 라이어
  const bob   = await sdk.joinById(alice.roomId, { nickname: "bob" });
  const carol = await sdk.joinById(alice.roomId, { nickname: "carol" });
  const dave  = await sdk.joinById(alice.roomId, { nickname: "dave" });
  await sleep(200);

  alice.send("start-round");
  await sleep(300);

  const eve = await sdk.joinById(alice.roomId, { nickname: "eve" }); // 라운드 중 입장 = 관전자
  await sleep(400);

  const views = {
    alice: wordsSeenBy(alice), bob: wordsSeenBy(bob),
    carol: wordsSeenBy(carol), dave: wordsSeenBy(dave), eve: wordsSeenBy(eve),
  };
  console.log("\n  [각 클라이언트가 디코딩한 myWord]");
  for (const [who, seen] of Object.entries(views)) console.log(`    ${who}:`, JSON.stringify(seen));

  console.log("\n─── C2-1. 본인 제시어는 보인다 ───");
  check("alice(라이어)가 자기 단어를 본다", views.alice.alice === LIAR_WORD, `실제: "${views.alice.alice}"`);
  check("bob(시민)이 자기 단어를 본다",     views.bob.bob === CITIZEN_WORD, `실제: "${views.bob.bob}"`);

  console.log("\n─── C2-2. 타인의 제시어는 보이지 않는다 ───");
  check("bob이 alice의 단어를 못 본다",   !views.bob.alice,   `실제: "${views.bob.alice}"`);
  check("bob이 carol의 단어를 못 본다",   !views.bob.carol,   `실제: "${views.bob.carol}"`);
  check("alice가 bob의 단어를 못 본다",   !views.alice.bob,   `실제: "${views.alice.bob}"`);
  check("carol이 dave의 단어를 못 본다",  !views.carol.dave,  `실제: "${views.carol.dave}"`);

  console.log("\n─── C2-3. 관전자는 어떤 제시어도 못 본다 ───");
  check("eve(관전자)가 전원의 단어를 못 본다",
    Object.values(views.eve).every(w => !w), JSON.stringify(views.eve));

  console.log("\n─── C2-4. 라이어 정체가 state에 없다 ───");
  check("진행 중 revealedLiarId가 비어있다 (bob 기준)", (bob.state as any).revealedLiarId === "");
  check("바보 모드에서 alice조차 amILiar를 모른다",
    (alice.state as any).players.get(alice.sessionId)?.amILiar === false);

  console.log("\n─── C2-5. 페이로드 바이트 검증 (디코딩 이전) ───");
  const room = (gameServer as any).presence ? null : null;
  const sids = { alice: alice.sessionId, bob: bob.sessionId, carol: carol.sessionId,
                 dave: dave.sessionId, eve: eve.sessionId };
  let captured = 0;
  for (const [who, sid] of Object.entries(sids)) {
    const bufs = sentBytes.get(sid) ?? [];
    captured += bufs.length;
    const all = Buffer.concat(bufs);
    const hasCitizen = all.includes(Buffer.from(CITIZEN_WORD, "utf8"));
    const hasLiar    = all.includes(Buffer.from(LIAR_WORD, "utf8"));
    const expectCitizen = ["bob", "carol", "dave"].includes(who);
    const expectLiar    = who === "alice";
    check(`${who}에게 전송된 바이트: 시민단어 ${hasCitizen ? "있음" : "없음"} / 라이어단어 ${hasLiar ? "있음" : "없음"}`,
      hasCitizen === expectCitizen && hasLiar === expectLiar,
      `기대: 시민단어=${expectCitizen}, 라이어단어=${expectLiar} | 캡처 ${bufs.length}개 메시지`);
  }
  check("소켓 바이트 캡처가 실제로 동작했다", captured > 0, `총 ${captured}개 메시지`);

  console.log("\n─── 재접속 (allowReconnection) ───");
  // 0.17은 방 생성 후 최소 가동시간(5초)을 넘겨야 자동 재접속을 허용한다
  await sleep(5200);
  const bobSid = bob.sessionId, bobToken = (bob as any).reconnectionToken;
  await bob.leave(false);                      // consented=false → 유예 진입
  await sleep(300);
  check("끊긴 직후 bob이 방에 남아있다 (carol 시점)",
    (carol.state as any).players.has(bobSid), `players=${[...(carol.state as any).players.keys()]}`);
  check("carol이 bob의 isConnected=false를 본다",
    (carol.state as any).players.get(bobSid)?.isConnected === false);

  let bob2: any = null, reconnectErr = "";
  try { bob2 = await sdk.reconnect(bobToken); await sleep(400); }
  catch (e: any) { reconnectErr = e?.message ?? String(e); }
  check("재접속 성공", !!bob2, reconnectErr);
  if (bob2) {
    check("재접속 후 sessionId가 동일하다", bob2.sessionId === bobSid, `${bob2.sessionId} vs ${bobSid}`);
    const w = wordsSeenBy(bob2);
    check("재접속 후 자기 제시어가 복구된다", w.bob === CITIZEN_WORD, JSON.stringify(w));
    check("재접속 후에도 타인 제시어는 안 보인다", !w.alice && !w.carol, JSON.stringify(w));
    check("carol이 bob의 isConnected=true 복구를 본다",
      (carol.state as any).players.get(bobSid)?.isConnected === true);
  }

  console.log("\n─── 결과 공개 시 전원에게 개방되는가 ───");
  alice.send("reveal");
  await sleep(500);
  const eveAfter = wordsSeenBy(eve);
  check("공개 후 관전자도 전원 제시어를 본다",
    eveAfter.alice === LIAR_WORD && eveAfter.carol === CITIZEN_WORD && eveAfter.dave === CITIZEN_WORD, JSON.stringify(eveAfter));
  check("공개 후 revealedLiarId가 채워진다", !!(eve.state as any).revealedLiarId);

  console.log(`\n${"═".repeat(50)}\n  통과 ${pass} / 실패 ${fail}\n${"═".repeat(50)}\n`);
  await gameServer.gracefullyShutdown(false);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error("SPIKE ERROR:", e); process.exit(2); });
