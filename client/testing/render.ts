import { mount, unmount, flushSync } from "svelte";
import type { Component } from "svelte";
import { game } from "../lib/connection.svelte.js";
import type { RoomSnapshot } from "../../shared/snapshot.js";

/**
 * 컴포넌트를 happy-dom에 실제로 마운트하고 렌더된 HTML을 돌려준다.
 *
 * 브라우저를 띄우지 않지만 **모듈 로드·마운트·반응성 오류를 모두 잡는다.**
 * `rune_outside_svelte` 처럼 tsc·svelte-check·vite build 가 전부 통과하는데
 * 브라우저에서만 죽는 부류가 여기서 걸린다 (체크리스트 G12).
 */
export function renderWith(
  Target: Component<any>,
  snap: RoomSnapshot,
  opts: { me?: string; remainingMs?: number } = {},
): string {
  game.snapshot = snap;
  game.mySessionId = opts.me ?? "a";
  game.remainingMs = opts.remainingMs ?? 0;
  game.graceMs = 0;

  const host = document.createElement("div");
  document.body.appendChild(host);
  const app = mount(Target, { target: host });
  flushSync();
  const html = host.innerHTML;
  unmount(app);
  host.remove();
  return html;
}

/** 컴포넌트가 호출하는 fetch를 막는다 (테스트가 네트워크를 타지 않게) */
export function stubFetch(routes: Record<string, unknown> = {}): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const key = Object.keys(routes).find((k) => url.includes(k));
    return { ok: true, json: async () => (key ? routes[key] : {}) } as Response;
  }) as typeof fetch;
}
