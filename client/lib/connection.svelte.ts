import { Client, type Room } from "@colyseus/sdk";
import type { RoomSnapshot } from "../../shared/snapshot.js";
import type { MessageType } from "../../shared/protocol.js";
import { clearReconnectToken, loadReconnectToken, saveReconnectToken } from "./session.js";

/**
 * Colyseus 상태를 Svelte 반응성에 연결한다.
 *
 * 어댑터가 한 줄인 이유: `state.toJSON()`이 StateView를 존중하는 평범한 객체를
 * 반환하고, 10인 기준 비용이 평균 0.0092ms(60fps 예산의 0.055%)로 무시 가능하다.
 * 세밀한 Schema 콜백을 쓰지 않는다. (docs/spikes/colyseus/FINDINGS.md §9-A)
 */
function defaultEndpoint(): string {
  return import.meta.env.DEV
    ? `ws://${location.hostname}:5173`
    : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
}

let _client: Client | null = null;
let _endpoint: string | null = null;

/** 테스트가 실제 서버를 가리키게 하기 위한 훅. 프로덕션에서는 호출되지 않는다. */
export function setEndpoint(url: string): void {
  _endpoint = url;
  _client = null;
}

function client(): Client {
  return (_client ??= new Client(_endpoint ?? defaultEndpoint()));
}

export const game = $state<{
  room: Room | null;
  snapshot: RoomSnapshot | null;
  mySessionId: string;
  error: string;
  connecting: boolean;
  /** 페이즈 남은 시간(ms). 서버가 준 상대 시간을 수신 시각 기준으로 센다. */
  remainingMs: number;
  /** 재접속 유예 남은 시간(ms). 같은 방식으로 센다. */
  graceMs: number;
}>({
  room: null, snapshot: null, mySessionId: "", error: "", connecting: false,
  remainingMs: 0, graceMs: 0,
});

let ticker: ReturnType<typeof setInterval> | null = null;
let graceTicker: ReturnType<typeof setInterval> | null = null;

/**
 * 지금 붙어 있는 방. **`game.room`으로 대신하면 안 된다.**
 *
 * `game`은 `$state`라서 `joinRoom`이 그것을 읽으면 호출자인 Room.svelte의
 * `$effect`가 의존성으로 등록한다. 그러면 `attach()`가 값을 쓰는 순간 effect가
 * 무효화되어 cleanup의 `leave()` → 재실행 → 다시 join 으로 무한히 돈다.
 * 화면 전체가 계속 재생성되어 입력이 먹지 않는다.
 */
let attachedRoomId: string | null = null;

function attach(room: Room): void {
  attachedRoomId = room.roomId;
  game.room = room;
  game.mySessionId = room.sessionId;
  game.error = "";
  game.connecting = false;
  saveReconnectToken(room.roomId, (room as unknown as { reconnectionToken: string }).reconnectionToken);

  room.onStateChange((state: unknown) => {
    game.snapshot = (state as { toJSON(): RoomSnapshot }).toJSON();
    startCountdown();
    startGraceCountdown();
  });

  room.onError((_code: number, message?: string) => { game.error = message ?? "오류가 발생했습니다"; });
  room.onLeave((code: number) => {
    stopCountdown();
    stopGraceCountdown();
    attachedRoomId = null;
    game.room = null;
    // 정상 퇴장(4000)이면 토큰을 버린다. 비정상이면 새로고침 복귀를 위해 남긴다.
    if (code === 4000) clearReconnectToken(room.roomId);
  });
}

/**
 * 서버는 절대 시각이 아니라 상대 시간(remainingMs)을 보낸다. 클라이언트는
 * 수신 시각을 기준으로 카운트다운하므로 시계 오차의 영향을 받지 않는다.
 * (체크리스트 D6)
 */
function startCountdown(): void {
  const snap = game.snapshot;
  stopCountdown();
  if (!snap || snap.phaseEndsAt <= 0) { game.remainingMs = 0; return; }

  const receivedAt = Date.now();
  const base = snap.phaseRemainingMs > 0 ? snap.phaseRemainingMs : snap.phaseEndsAt;
  game.remainingMs = base;

  ticker = setInterval(() => {
    if (game.snapshot?.isPaused) return;              // 일시정지 중에는 멈춘다 (M2)
    game.remainingMs = Math.max(0, base - (Date.now() - receivedAt));
    if (game.remainingMs === 0) stopCountdown();
  }, 200);
}

function stopCountdown(): void {
  if (ticker) { clearInterval(ticker); ticker = null; }
}

/** 재접속 유예 카운트다운. 페이즈 타이머와 같은 방식(상대 시간 + 수신 시각). */
function startGraceCountdown(): void {
  const snap = game.snapshot;
  stopGraceCountdown();
  if (!snap?.isPaused || snap.graceRemainingMs <= 0) { game.graceMs = 0; return; }

  const receivedAt = Date.now();
  const base = snap.graceRemainingMs;
  game.graceMs = base;
  graceTicker = setInterval(() => {
    game.graceMs = Math.max(0, base - (Date.now() - receivedAt));
    if (game.graceMs === 0) stopGraceCountdown();
  }, 200);
}

function stopGraceCountdown(): void {
  if (graceTicker) { clearInterval(graceTicker); graceTicker = null; }
}

export async function createRoom(opts: {
  nickname: string; roomName: string; isPublic: boolean; password?: string;
}): Promise<string> {
  game.connecting = true;
  try {
    const room = await client().create("liar", opts);
    attach(room);
    return room.roomId;
  } catch (e) {
    game.connecting = false;
    game.error = (e as Error).message || "방을 만들 수 없습니다";
    throw e;
  }
}

/**
 * 방에 들어간다. **저장된 재접속 토큰이 있으면 먼저 복귀를 시도한다.**
 *
 * 새로고침·탭 복귀가 여기로 들어온다. 토큰이 만료됐거나 유예가 지났으면
 * 일반 참가로 넘어간다 (게임 중이면 서버가 거부한다).
 */
export async function joinRoom(roomId: string, nickname: string, password?: string): Promise<void> {
  // 이미 이 방에 붙어 있으면 그대로 쓴다.
  //
  // 방을 만든 직후가 이 경우다. Create.svelte가 createRoom()으로 연결을 맺고
  // `/room/:id` 로 이동하면 Room.svelte의 $effect가 여기를 부른다. 가드가 없으면
  // 아래에서 방금 저장한 토큰을 집어 **자기 자신에게 재접속**하고, 서버는 기존
  // 소켓을 끊었다가 새로 붙인다 — 채팅에 "접속이 끊겼습니다 / 돌아왔습니다"가
  // 남고 소켓 하나가 버려진다.
  if (attachedRoomId === roomId) return;

  game.connecting = true;

  const token = loadReconnectToken(roomId);
  if (token) {
    try {
      attach(await client().reconnect(token));
      return;
    } catch {
      clearReconnectToken(roomId);   // 만료됨 — 일반 참가로 진행한다
    }
  }

  try {
    attach(await client().joinById(roomId, { nickname, password }));
  } catch (e) {
    game.connecting = false;
    game.error = (e as Error).message || "방에 들어갈 수 없습니다";
    throw e;
  }
}

export function send<T extends MessageType>(type: T, payload: unknown = {}): void {
  game.room?.send(type, payload);
}

export async function leave(): Promise<void> {
  stopCountdown();
  stopGraceCountdown();
  attachedRoomId = null;
  const id = game.room?.roomId;
  if (id) clearReconnectToken(id);
  await game.room?.leave();
  game.room = null;
  game.snapshot = null;
}

// ── 파생 헬퍼 ────────────────────────────────────────
export const me = () => game.snapshot?.players[game.mySessionId] ?? null;
export const isHost = () => me()?.isHost ?? false;
export const playerList = () =>
  Object.values(game.snapshot?.players ?? {}).filter((p) => !p.isSpectator);
export const nicknameOf = (id: string) => game.snapshot?.players[id]?.nickname ?? "알 수 없음";
export const disconnectedPlayers = () =>
  Object.values(game.snapshot?.players ?? {}).filter((p) => !p.isConnected && !p.isSpectator);
export const spectatorList = () =>
  Object.values(game.snapshot?.players ?? {}).filter((p) => p.isSpectator);
export const amSpectator = () => me()?.isSpectator === true;
