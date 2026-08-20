// 순수 게임 규칙. 프레임워크도 I/O도 모른다 → Colyseus 없이 전부 테스트된다.
// 규칙의 근거는 docs/REQUIREMENTS.md §1

import { categories } from "./words.js";
import { pick, shuffle, type Rng, defaultRng } from "./random.js";
import {
  MAX_DESCRIPTION_ATTEMPTS,
  MAX_DISCUSSION_ATTEMPTS,
  MIN_PLAYERS,
  REDO_TARGET,
} from "./constants.js";
import type { GameMode, Phase, RoundEndReason, RoundWinner } from "./types.js";

// ─────────────────────────────────────────────────────────────
// 카테고리 · 단어 · 역할
// ─────────────────────────────────────────────────────────────

export const RANDOM_CATEGORY = "랜덤";

export function categoryNames(): string[] {
  return categories.map((c) => c.name);
}

export function isValidCategory(name: string): boolean {
  return name === RANDOM_CATEGORY || categories.some((c) => c.name === name);
}

/** "랜덤"이면 실제 카테고리로 확정한다. 매 라운드 시작 시 호출된다. */
export function resolveCategory(name: string, rng: Rng = defaultRng): string {
  return name === RANDOM_CATEGORY ? pick(categoryNames(), rng) : name;
}

/**
 * 같은 카테고리에서 서로 다른 두 단어를 뽑는다.
 * 바보 모드의 두 단어는 의미적 근접성을 보장하지 않는다 — 완전 무작위 (D6).
 */
export function pickWords(
  categoryName: string,
  rng: Rng = defaultRng,
): { citizen: string; liar: string } {
  const category = categories.find((c) => c.name === categoryName);
  if (!category || category.words.length < 2) {
    throw new Error(`단어를 뽑을 수 없는 카테고리: ${categoryName}`);
  }
  const [citizen, liar] = shuffle(category.words, rng);
  return { citizen: citizen!, liar: liar! };
}

/**
 * 라이어를 고른다. **매 라운드 완전 독립 시행**이다.
 *
 * 직전 라이어를 제외하는 로테이션을 넣지 말 것 — 그 사람이 "확정 시민"이 되어
 * 정보가 샌다. (D10 / 체크리스트 A5)
 */
export function pickLiar(playerIds: readonly string[], rng: Rng = defaultRng): string {
  return pick(playerIds, rng);
}

/** 발언 순서를 무작위로 정한다. */
export function makeDescriptionOrder(playerIds: readonly string[], rng: Rng = defaultRng): string[] {
  return shuffle(playerIds, rng);
}

/** 해당 플레이어가 받을 제시어. 정보 은닉의 최전선이므로 여기 하나로 모은다. */
export function wordFor(
  playerId: string,
  liarId: string,
  mode: GameMode,
  words: { citizen: string; liar: string },
): { word: string; amILiar: boolean } {
  if (playerId !== liarId) return { word: words.citizen, amILiar: false };
  // 일반 모드: 제시어 없이 라이어임을 안다
  // 바보 모드: 다른 단어를 받고 자신이 라이어인지 모른다
  return mode === "normal"
    ? { word: "", amILiar: true }
    : { word: words.liar, amILiar: false };
}

export function canStartMatch(playerCount: number): boolean {
  return playerCount >= MIN_PLAYERS;
}

// ─────────────────────────────────────────────────────────────
// 지목 집계
// ─────────────────────────────────────────────────────────────

export type NominationTally =
  | { kind: "none" }                              // 아무도 지목하지 않음
  | { kind: "redo" }                              // "한줄 설명 다시하기" 최다
  | { kind: "tie"; tiedIds: string[] }            // 최다 득표 동점
  | { kind: "single"; targetId: string };         // 단독 최다

/**
 * 지목을 집계한다. `nominations`는 voterId → targetId.
 * targetId가 REDO_TARGET이면 "다시하기" 표다.
 */
export function tallyNominations(nominations: ReadonlyMap<string, string>): NominationTally {
  if (nominations.size === 0) return { kind: "none" };

  const counts = new Map<string, number>();
  for (const target of nominations.values()) {
    counts.set(target, (counts.get(target) ?? 0) + 1);
  }

  // 빈 배열에 Math.max를 쓰면 -Infinity가 되어 조용히 잘못된 분기를 탄다 (체크리스트 A2).
  // size === 0을 위에서 걸렀으므로 여기서는 안전하다.
  let max = 0;
  for (const c of counts.values()) if (c > max) max = c;

  const top = [...counts.entries()].filter(([, c]) => c === max).map(([id]) => id);

  if (top.length === 1) {
    const only = top[0]!;
    return only === REDO_TARGET ? { kind: "redo" } : { kind: "single", targetId: only };
  }
  // 동점에 REDO가 섞여 있어도 동점은 동점이다 (재토론).
  return { kind: "tie", tiedIds: top.sort() };
}

// ─────────────────────────────────────────────────────────────
// 기회 상한과 다음 페이즈 결정 (D8)
// ─────────────────────────────────────────────────────────────

export type Attempts = { description: number; discussion: number };

export type NextStep =
  | { phase: Extract<Phase, "description" | "discussion" | "defense"> ; defendantId?: string }
  | { phase: "round-result"; winner: RoundWinner; reason: RoundEndReason };

const LIAR_WINS_EXHAUSTED: NextStep = {
  phase: "round-result", winner: "liar", reason: "chances-exhausted",
};

/** 설명 단계로 되돌아갈 기회가 남았는가 */
export function canRedescribe(a: Attempts): boolean {
  return a.description < MAX_DESCRIPTION_ATTEMPTS;
}

/** 토론 단계로 되돌아갈 기회가 남았는가 */
export function canRediscuss(a: Attempts): boolean {
  return a.discussion < MAX_DISCUSSION_ATTEMPTS;
}

/**
 * 토론(지목) 종료 시 다음 단계를 결정한다.
 *
 * 단일 원칙: **시민에게 주어진 기회는 유한하다. 소진하고도 라이어를 처형하지 못하면 라이어 승.**
 * 이 원칙 덕분에 라운드가 반드시 유한 시간에 끝난다.
 */
export function decideAfterDiscussion(tally: NominationTally, attempts: Attempts): NextStep {
  switch (tally.kind) {
    case "none":
    case "redo":
      return canRedescribe(attempts) ? { phase: "description" } : LIAR_WINS_EXHAUSTED;
    case "tie":
      return canRediscuss(attempts) ? { phase: "discussion" } : LIAR_WINS_EXHAUSTED;
    case "single":
      return { phase: "defense", defendantId: tally.targetId };
  }
}

/** 최종 투표 종료 시 다음 단계를 결정한다. */
export function decideAfterFinalVote(
  confirmed: boolean,
  defendantIsLiar: boolean,
  attempts: Attempts,
): NextStep | { phase: "liar-guess" } {
  if (!confirmed) {
    return canRediscuss(attempts) ? { phase: "discussion" } : LIAR_WINS_EXHAUSTED;
  }
  // 처형 확정
  return defendantIsLiar
    ? { phase: "liar-guess" }
    : { phase: "round-result", winner: "liar", reason: "citizen-executed" };
}

// ─────────────────────────────────────────────────────────────
// 최종 투표
// ─────────────────────────────────────────────────────────────

export type FinalVoteResult = {
  agree: number;
  disagree: number;
  abstain: number;
  confirmed: boolean;
};

/**
 * 최종 투표를 집계한다.
 *
 * **미투표는 무효표이며 과반 계산의 분모에서 제외한다.** 전체 인원을 분모로 삼으면
 * 기권이 사실상 반대표가 된다. (체크리스트 A6)
 *
 * @param votes        voterId → 찬성 여부. 피고는 포함되지 않는다.
 * @param eligibleCount 피고를 제외한 투표 자격자 수
 */
export function tallyFinalVote(
  votes: ReadonlyMap<string, boolean>,
  eligibleCount: number,
): FinalVoteResult {
  let agree = 0, disagree = 0;
  for (const v of votes.values()) v ? agree++ : disagree++;

  const cast = agree + disagree;
  return {
    agree,
    disagree,
    abstain: Math.max(0, eligibleCount - cast),
    confirmed: cast > 0 && agree > cast / 2,
  };
}

// ─────────────────────────────────────────────────────────────
// 정답 판정
// ─────────────────────────────────────────────────────────────

/**
 * 비교용 정규화: 소문자화 + 모든 공백 제거 + 유니코드 NFC.
 *
 * 한글은 조합형/완성형 표현이 달라도 같은 글자로 보인다. IME에 따라 다른
 * 코드포인트가 입력되어 정답이 오답 처리되는 일이 있었다. (체크리스트 A1)
 */
export function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/\s+/g, "").normalize("NFC");
}

export function isGuessCorrect(guess: string, answer: string): boolean {
  const g = normalizeWord(guess);
  return g.length > 0 && g === normalizeWord(answer);
}

/** 정답 맞추기 결과로 라운드 결말을 정한다. */
export function decideAfterLiarGuess(correct: boolean): NextStep {
  return correct
    ? { phase: "round-result", winner: "liar", reason: "liar-executed-right-guess" }
    : { phase: "round-result", winner: "citizen", reason: "liar-executed-wrong-guess" };
}
