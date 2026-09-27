/**
 * 서버 테스트 공용 대기 헬퍼. 운영 빌드에서 제외된다 (tsconfig.server.json exclude).
 *
 * ★ "패치 N번 기다리기"로 메시지 처리를 기다리지 말 것.
 * 클라이언트가 보낸 메시지가 서버에 도착해 처리되는 시점과 패치 주기는 무관하다.
 * 로컬에서는 우연히 맞지만 CI 러너가 붐비면 어긋난다 — 2026-09-27 v2.0.0 태그 CI에서
 * `start-match`가 패치 두 번 안에 처리되지 않아, 테스트가 강제로 들어간 페이즈를
 * 늦게 도착한 시작 메시지가 새 라운드로 덮어썼다 (departure.test.ts 두 건이 번갈아 실패).
 * 상태를 직접 보고 기다린다.
 */

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 조건이 참이 될 때까지 기다린다. 시간 안에 안 되면 무엇을 기다렸는지 알리며 실패한다. */
export async function until(cond: () => boolean, what: string, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`시간 초과: ${what}`);
    await wait(10);
  }
}

type Sender = { send(type: string, payload: unknown): void };
type RoomLike = { state: { phase: string }; waitForNextPatch(): Promise<unknown> };

/**
 * 호스트가 매치를 시작하고, 서버가 그 메시지를 **처리할 때까지** 기다린다.
 * 그 뒤 패치 한 번을 더 기다려 클라이언트 쪽 상태도 따라오게 한다.
 */
export async function startMatch(room: RoomLike, host: Sender): Promise<void> {
  host.send("start-match", {});
  await until(() => room.state.phase !== "waiting", "start-match 처리");
  await room.waitForNextPatch();
}
