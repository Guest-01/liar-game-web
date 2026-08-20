import { describe, expect, it } from "vitest";
import {
  RANDOM_CATEGORY, categoryNames, decideAfterDiscussion, decideAfterFinalVote,
  decideAfterLiarGuess, isGuessCorrect, isValidCategory, makeDescriptionOrder,
  normalizeWord, pickLiar, pickWords, resolveCategory, tallyFinalVote,
  tallyNominations, wordFor, canStartMatch,
} from "./rules.js";
import { shuffle } from "./random.js";
import { REDO_TARGET } from "./constants.js";
import { categories } from "./words.js";

/** 결정적 RNG: 주어진 값을 순환한다 */
const seq = (...vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]!; };
const nom = (o: Record<string, string>) => new Map(Object.entries(o));

describe("단어 데이터", () => {
  it("6개 카테고리 × 30단어를 유지한다", () => {
    expect(categories).toHaveLength(6);
    for (const c of categories) expect(c.words).toHaveLength(30);
  });
  it("카테고리 안에 중복 단어가 없다", () => {
    for (const c of categories) expect(new Set(c.words).size).toBe(c.words.length);
  });
});

describe("카테고리", () => {
  it("랜덤은 실제 카테고리로 확정된다", () => {
    expect(categoryNames()).toContain(resolveCategory(RANDOM_CATEGORY, seq(0.5)));
  });
  it("지정 카테고리는 그대로 유지된다", () => {
    expect(resolveCategory("음식", seq(0.5))).toBe("음식");
  });
  it("유효성 검사", () => {
    expect(isValidCategory("음식")).toBe(true);
    expect(isValidCategory(RANDOM_CATEGORY)).toBe(true);
    expect(isValidCategory("없는카테고리")).toBe(false);
  });
});

describe("단어 선정", () => {
  it("시민 단어와 라이어 단어는 서로 다르다", () => {
    for (let i = 0; i < 200; i++) {
      const { citizen, liar } = pickWords("음식");
      expect(citizen).not.toBe(liar);
    }
  });
  it("둘 다 해당 카테고리 안에서 나온다", () => {
    const words = categories.find((c) => c.name === "동물")!.words;
    const { citizen, liar } = pickWords("동물");
    expect(words).toContain(citizen);
    expect(words).toContain(liar);
  });
  it("없는 카테고리는 예외", () => {
    expect(() => pickWords("없음")).toThrow();
  });
});

describe("셔플 균등성 (체크리스트 A4)", () => {
  it("각 원소가 각 위치에 고르게 분포한다", () => {
    const items = ["a", "b", "c", "d"];
    const pos: Record<string, number[]> = { a: [0,0,0,0], b: [0,0,0,0], c: [0,0,0,0], d: [0,0,0,0] };
    const N = 12000;
    for (let i = 0; i < N; i++) {
      shuffle(items).forEach((v, idx) => { pos[v]![idx]!; pos[v]![idx] = pos[v]![idx]! + 1; });
    }
    const expected = N / items.length;
    for (const v of items) for (const count of pos[v]!) {
      expect(Math.abs(count - expected) / expected).toBeLessThan(0.12);
    }
  });
  it("원본을 변경하지 않는다", () => {
    const orig = ["a", "b", "c"];
    shuffle(orig);
    expect(orig).toEqual(["a", "b", "c"]);
  });
});

describe("라이어 선정 (D10 / 체크리스트 A5)", () => {
  const ids = ["p1", "p2", "p3", "p4"];
  it("플레이어 중 한 명이 선정된다", () => {
    expect(ids).toContain(pickLiar(ids));
  });
  it("직전 라이어가 연속 선정되는 경우가 실제로 발생한다 — 완전 독립 시행", () => {
    let consecutive = 0, prev = pickLiar(ids);
    for (let i = 0; i < 500; i++) {
      const cur = pickLiar(ids);
      if (cur === prev) consecutive++;
      prev = cur;
    }
    // 독립 시행이면 약 1/4 확률로 연속된다. 0이면 로테이션이 섞인 것이다.
    expect(consecutive).toBeGreaterThan(50);
  });
  it("선정 분포가 균등하다", () => {
    const count = new Map(ids.map((id) => [id, 0]));
    for (let i = 0; i < 8000; i++) count.set(pickLiar(ids), count.get(pickLiar(ids))! + 0);
    for (let i = 0; i < 8000; i++) { const l = pickLiar(ids); count.set(l, count.get(l)! + 1); }
    for (const c of count.values()) expect(Math.abs(c - 2000) / 2000).toBeLessThan(0.15);
  });
});

describe("제시어 배분 (정보 은닉의 최전선)", () => {
  const words = { citizen: "김치찌개", liar: "돌솥밥" };
  it("일반 모드: 라이어는 제시어가 없고 자신이 라이어임을 안다", () => {
    expect(wordFor("L", "L", "normal", words)).toEqual({ word: "", amILiar: true });
  });
  it("바보 모드: 라이어는 다른 단어를 받고 자신이 라이어인지 모른다", () => {
    expect(wordFor("L", "L", "fool", words)).toEqual({ word: "돌솥밥", amILiar: false });
  });
  it("시민은 두 모드 모두 정답 단어를 받는다", () => {
    for (const m of ["normal", "fool"] as const) {
      expect(wordFor("C", "L", m, words)).toEqual({ word: "김치찌개", amILiar: false });
    }
  });
});

describe("게임 시작 인원 (D7)", () => {
  it("4명부터 시작할 수 있다", () => {
    expect(canStartMatch(3)).toBe(false);
    expect(canStartMatch(4)).toBe(true);
  });
});

describe("지목 집계", () => {
  it("아무도 지목하지 않으면 none", () => {
    expect(tallyNominations(nom({}))).toEqual({ kind: "none" });
  });
  it("단독 최다는 single", () => {
    expect(tallyNominations(nom({ a: "x", b: "x", c: "y" })))
      .toEqual({ kind: "single", targetId: "x" });
  });
  it("동점은 tie", () => {
    const t = tallyNominations(nom({ a: "x", b: "y" }));
    expect(t).toEqual({ kind: "tie", tiedIds: ["x", "y"] });
  });
  it("다시하기가 단독 최다면 redo", () => {
    expect(tallyNominations(nom({ a: REDO_TARGET, b: REDO_TARGET, c: "x" })))
      .toEqual({ kind: "redo" });
  });
  it("다시하기가 동점에 섞이면 동점으로 처리한다", () => {
    const t = tallyNominations(nom({ a: REDO_TARGET, b: "x" }));
    expect(t.kind).toBe("tie");
  });
  it("1표만 있어도 단독 최다다", () => {
    expect(tallyNominations(nom({ a: "x" }))).toEqual({ kind: "single", targetId: "x" });
  });
});

describe("기회 상한과 다음 단계 (D8)", () => {
  const fresh = { description: 1, discussion: 1 };
  const spent = { description: 2, discussion: 2 };

  it("무투표 1회차 → 설명 재시작", () => {
    expect(decideAfterDiscussion({ kind: "none" }, fresh)).toEqual({ phase: "description" });
  });
  it("무투표 2회차(소진) → 라이어 승", () => {
    expect(decideAfterDiscussion({ kind: "none" }, spent))
      .toEqual({ phase: "round-result", winner: "liar", reason: "chances-exhausted" });
  });
  it("다시하기 1회차 → 설명 재시작, 소진 시 라이어 승", () => {
    expect(decideAfterDiscussion({ kind: "redo" }, fresh)).toEqual({ phase: "description" });
    expect(decideAfterDiscussion({ kind: "redo" }, spent).phase).toBe("round-result");
  });
  it("동점 1회차 → 재토론, 소진 시 라이어 승", () => {
    expect(decideAfterDiscussion({ kind: "tie", tiedIds: ["x","y"] }, fresh))
      .toEqual({ phase: "discussion" });
    expect(decideAfterDiscussion({ kind: "tie", tiedIds: ["x","y"] }, spent).phase)
      .toBe("round-result");
  });
  it("단독 최다는 기회와 무관하게 변론으로 간다", () => {
    for (const a of [fresh, spent]) {
      expect(decideAfterDiscussion({ kind: "single", targetId: "x" }, a))
        .toEqual({ phase: "defense", defendantId: "x" });
    }
  });
});

describe("최종 투표 (체크리스트 A6)", () => {
  const votes = (o: Record<string, boolean>) => new Map(Object.entries(o));

  it("미투표는 무효표이며 분모에서 제외된다", () => {
    // 자격자 5명 중 2명만 투표(찬2 반0) → 찬성 2 > 1 이므로 확정
    const r = tallyFinalVote(votes({ a: true, b: true }), 5);
    expect(r).toEqual({ agree: 2, disagree: 0, abstain: 3, confirmed: true });
  });
  it("과반 미달이면 미확정", () => {
    expect(tallyFinalVote(votes({ a: true, b: false }), 4).confirmed).toBe(false);
  });
  it("정확히 과반이면 미확정 (초과여야 한다)", () => {
    expect(tallyFinalVote(votes({ a: true, b: true, c: false, d: false }), 4).confirmed).toBe(false);
  });
  it("아무도 투표하지 않으면 미확정", () => {
    expect(tallyFinalVote(votes({}), 5))
      .toEqual({ agree: 0, disagree: 0, abstain: 5, confirmed: false });
  });
  it("4인 게임: 피고 제외 3명 중 2명 찬성이면 확정", () => {
    expect(tallyFinalVote(votes({ a: true, b: true, c: false }), 3).confirmed).toBe(true);
  });
});

describe("최종 투표 후 분기", () => {
  const fresh = { description: 1, discussion: 1 };
  const spent = { description: 2, discussion: 2 };
  it("미달 + 기회 있음 → 재토론", () => {
    expect(decideAfterFinalVote(false, false, fresh)).toEqual({ phase: "discussion" });
  });
  it("미달 + 기회 소진 → 라이어 승", () => {
    expect(decideAfterFinalVote(false, false, spent))
      .toMatchObject({ phase: "round-result", winner: "liar" });
  });
  it("확정 + 피고가 라이어 → 정답 맞추기", () => {
    expect(decideAfterFinalVote(true, true, fresh)).toEqual({ phase: "liar-guess" });
  });
  it("확정 + 피고가 시민 → 라이어 승", () => {
    expect(decideAfterFinalVote(true, false, fresh))
      .toEqual({ phase: "round-result", winner: "liar", reason: "citizen-executed" });
  });
});

describe("정답 판정 (체크리스트 A1)", () => {
  it("공백을 무시한다", () => {
    expect(isGuessCorrect(" 김치 찌개 ", "김치찌개")).toBe(true);
  });
  it("영문 대소문자를 무시한다", () => {
    expect(isGuessCorrect("PIZZA", "pizza")).toBe(true);
  });
  it("유니코드 NFD 입력을 NFC와 같게 본다", () => {
    const nfd = "김치찌개".normalize("NFD");
    expect(nfd).not.toBe("김치찌개");          // 전제: 코드포인트가 실제로 다르다
    expect(isGuessCorrect(nfd, "김치찌개")).toBe(true);
  });
  it("빈 입력은 항상 오답이다 (미제출 = 오답)", () => {
    expect(isGuessCorrect("", "김치찌개")).toBe(false);
    expect(isGuessCorrect("   ", "김치찌개")).toBe(false);
    expect(normalizeWord("")).toBe("");
  });
  it("다른 단어는 오답", () => {
    expect(isGuessCorrect("된장찌개", "김치찌개")).toBe(false);
  });
});

describe("정답 후 결말", () => {
  it("정답이면 라이어 역전승", () => {
    expect(decideAfterLiarGuess(true))
      .toEqual({ phase: "round-result", winner: "liar", reason: "liar-executed-right-guess" });
  });
  it("오답이면 시민 승", () => {
    expect(decideAfterLiarGuess(false))
      .toEqual({ phase: "round-result", winner: "citizen", reason: "liar-executed-wrong-guess" });
  });
});

describe("라운드 종료 보장 (체크리스트 F4) — 무한 루프 부재", () => {
  it("어떤 지목 결과 시퀀스로도 유한 단계 안에 끝난다", () => {
    const kinds: Array<import("./rules.js").NominationTally> = [
      { kind: "none" }, { kind: "redo" }, { kind: "tie", tiedIds: ["x", "y"] },
    ];
    // 최악의 경우: 매번 설명/토론으로 되돌리려 시도한다
    for (const k of kinds) {
      const attempts = { description: 1, discussion: 1 };
      let steps = 0, phase: string = "discussion";
      while (steps++ < 50) {
        const next = decideAfterDiscussion(k, attempts);
        if (next.phase === "round-result" || next.phase === "defense") { phase = next.phase; break; }
        if (next.phase === "description") attempts.description++;
        if (next.phase === "discussion") attempts.discussion++;
      }
      expect(steps).toBeLessThan(5);
      expect(phase).toBe("round-result");
    }
  });
});
