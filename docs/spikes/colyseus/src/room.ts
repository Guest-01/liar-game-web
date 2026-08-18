import { Room, Client } from "colyseus";
import { StateView } from "@colyseus/schema";   // 0.16: colyseus가 아닌 schema에서 export
import { RoundState, Player, CITIZEN_WORD, LIAR_WORD } from "./schema";

// 클라이언트별로 실제 전송된 바이트를 캡처 (페이로드 수준 검증용)
export const sentBytes = new Map<string, Buffer[]>();

function captureSocket(client: Client) {
  const ref: any = (client as any).ref ?? (client as any)._ref;
  if (!ref || typeof ref.send !== "function") return false;
  const orig = ref.send.bind(ref);
  ref.send = (data: any, ...rest: any[]) => {
    const buf = Buffer.isBuffer(data) ? Buffer.from(data)
      : data instanceof ArrayBuffer ? Buffer.from(new Uint8Array(data))
      : ArrayBuffer.isView(data) ? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
      : Buffer.from(String(data));
    const arr = sentBytes.get(client.sessionId) ?? [];
    arr.push(buf);
    sentBytes.set(client.sessionId, arr);
    return orig(data, ...rest);
  };
  return true;
}

export class LiarRoom extends Room<RoundState> {
  maxClients = 16;
  private liarId = "";           // ← state가 아닌 서버 전용 변수
  private roundStarted = false;
  captureOk = false;

  onCreate() {
    this.state = new RoundState();

    this.onMessage("start-round", () => this.startRound());
    this.onMessage("reveal", () => {
      this.state.revealedLiarId = this.liarId;
      this.state.phase = "result";
      // 결과 공개: 전원의 view에 모든 플레이어를 추가해 제시어를 공개
      for (const c of this.clients) {
        for (const p of this.state.players.values()) c.view?.add(p);
      }
    });
  }

  onJoin(client: Client, options: { nickname: string }) {
    const p = new Player();
    p.sessionId = client.sessionId;
    p.nickname = options.nickname;
    p.isSpectator = this.roundStarted;      // 라운드 진행 중 입장 = 관전자
    this.state.players.set(client.sessionId, p);

    // 각 클라이언트는 자기 자신의 Player만 view에 담는다
    client.view = new StateView();
    client.view.add(p);

    this.captureOk = captureSocket(client) || this.captureOk;
  }

  startRound() {
    const players = [...this.state.players.values()].filter(p => !p.isSpectator);
    this.liarId = players[0].sessionId;      // 결정적으로 첫 번째를 라이어로
    for (const p of players) {
      const isLiar = p.sessionId === this.liarId;
      p.myWord = isLiar ? LIAR_WORD : CITIZEN_WORD;   // 바보 모드
      p.amILiar = false;                               // 바보 모드는 본인도 모름
    }
    this.state.category = "음식";
    this.state.phase = "description";
    this.roundStarted = true;
  }

  // 0.17: 두 번째 인자가 boolean(consented)이 아니라 number(close code)로 바뀌었다.
  // 4000 = 정상 퇴장. 그 외는 비정상 끊김으로 간주한다.
  async onLeave(client: Client, code: number) {
    const consented = code === 4000;
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    console.log(`    [server] onLeave ${p.nickname} code=${code} consented=${consented}`);
    if (consented) { this.state.players.delete(client.sessionId); return; }

    p.isConnected = false;
    try {
      await this.allowReconnection(client, Number(process.env.GRACE ?? 30));   // 유예
      p.isConnected = true;
      console.log(`    [server] ${p.nickname} 재접속 성공`);
    } catch {
      this.state.players.delete(client.sessionId);
    }
  }
}
