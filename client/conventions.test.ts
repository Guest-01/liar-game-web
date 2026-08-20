/**
 * 클라이언트 파일 규약 검사.
 *
 * Svelte 5 룬(`$state` 등)은 `.svelte` 와 `.svelte.ts` 파일에서만 컴파일된다.
 * 평범한 `.ts` 에 쓰면 **타입 검사도 빌드도 통과하지만 브라우저에서 모듈을
 * 로드하는 순간 죽는다**:
 *
 *   Uncaught Svelte error: rune_outside_svelte
 *
 * svelte-check가 잡아주지 않으므로 여기서 막는다.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RUNE = /(?<![\w$])\$(state|derived|effect|props|bindable|inspect|host)\b/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe("Svelte 룬 파일 규약", () => {
  it("룬을 쓰는 파일은 .svelte 또는 .svelte.ts 여야 한다", () => {
    const offenders = walk("client")
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".svelte.ts") && !f.endsWith(".test.ts"))
      .filter((f) => RUNE.test(readFileSync(f, "utf-8")));

    expect(
      offenders,
      `룬을 쓰지만 .svelte.ts가 아닌 파일이 있습니다.\n` +
      `이런 파일은 빌드는 통과하지만 브라우저에서 rune_outside_svelte로 죽습니다.\n` +
      `→ 파일명을 *.svelte.ts로 바꾸고 import 경로도 *.svelte.js로 고치세요.`,
    ).toEqual([]);
  });
});
