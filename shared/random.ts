// 난수 유틸. RNG를 주입할 수 있어야 테스트가 결정적이 된다.

/** [0, 1) 을 반환하는 난수원 */
export type Rng = () => number;

export const defaultRng: Rng = Math.random;

/** 배열에서 하나를 균등 확률로 고른다. */
export function pick<T>(arr: readonly T[], rng: Rng = defaultRng): T {
  const v = arr[Math.floor(rng() * arr.length)];
  if (v === undefined) throw new Error("빈 배열에서 선택할 수 없다");
  return v;
}

/**
 * Fisher-Yates 셔플. 원본을 변경하지 않는다.
 *
 * `sort(() => Math.random() - 0.5)`를 쓰지 말 것 — 분포가 균등하지 않다.
 * 라이어 게임에서 순서·단어 편향은 곧 밸런스 붕괴다. (체크리스트 A4)
 */
export function shuffle<T>(arr: readonly T[], rng: Rng = defaultRng): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i]!, b = out[j]!;
    out[i] = b;
    out[j] = a;
  }
  return out;
}
