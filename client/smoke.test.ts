/**
 * 클라이언트 스모크 테스트 (1계층).
 *
 * 실제 브라우저를 띄우지 않고 happy-dom에 컴포넌트를 **진짜로 마운트**한다.
 * 잡는 것: 모듈 로드 오류, 마운트 오류, 템플릿·반응성 오류,
 *          그리고 **화면에 새면 안 될 정보가 렌더되는지**.
 * 못 잡는 것: CSS·레이아웃·실제 애니메이션 렌더링 (그것은 Playwright의 몫).
 *
 * 배경: rune_outside_svelte 는 tsc·svelte-check·vite build 를 전부 통과하고
 * 브라우저에서만 죽었다. 정적 검사만으로는 부족하다는 것이 실제로 증명됐다.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { renderWith, stubFetch } from "./testing/render.js";
import { player, snapshot } from "./testing/snapshot.js";

import Waiting from "./game/Waiting.svelte";
import WordCheck from "./game/WordCheck.svelte";
import Description from "./game/Description.svelte";
import Discussion from "./game/Discussion.svelte";
import Defense from "./game/Defense.svelte";
import FinalVote from "./game/FinalVote.svelte";
import VoteReveal from "./game/VoteReveal.svelte";
import LiarGuess from "./game/LiarGuess.svelte";
import RoundResult from "./game/RoundResult.svelte";
import Scoreboard from "./game/Scoreboard.svelte";
import MatchResult from "./game/MatchResult.svelte";
import PlayerList from "./game/PlayerList.svelte";
import Chat from "./game/Chat.svelte";
import Timer from "./game/Timer.svelte";
import PauseBanner from "./game/PauseBanner.svelte";
import SpectatorBanner from "./game/SpectatorBanner.svelte";
import OrderReveal from "./fx/OrderReveal.svelte";

beforeEach(() => {
  stubFetch({ "/api/categories": { categories: ["음식", "동물"] }, "/api/rooms": { rooms: [] } });
});

describe("모든 페이즈 화면이 마운트된다", () => {
  const cases: Array<[string, any, Parameters<typeof snapshot>[0]]> = [
    ["대기실", Waiting, { phase: "waiting" }],
    ["제시어 확인", WordCheck, { phase: "word-check" }],
    ["순서 추첨", OrderReveal, { phase: "order-reveal", round: 1, descriptionOrder: ["b", "a", "c", "d"] }],
    ["한줄 설명", Description, { phase: "description", descriptionOrder: ["a", "b", "c", "d"] }],
    ["토론", Discussion, { phase: "discussion", descriptionOrder: ["a", "b", "c", "d"] }],
    ["최후 변론", Defense, { phase: "defense", defendantId: "d" }],
    ["최종 투표", FinalVote, { phase: "final-vote", defendantId: "d" }],
    ["개표", VoteReveal, { phase: "vote-reveal", defendantId: "d", agreeCount: 2, disagreeCount: 1 }],
    ["정답 맞추기", LiarGuess, { phase: "liar-guess", defendantId: "d" }],
    ["라운드 결과", RoundResult, { phase: "round-result", roundWinner: "citizen",
      roundEndReason: "liar-executed-wrong-guess", revealedLiarId: "d", revealedCitizenWord: "김치찌개" }],
    ["점수판", Scoreboard, { phase: "scoreboard", round: 1 }],
    ["최종 순위", MatchResult, { phase: "match-result", round: 3 }],
  ];

  for (const [name, C, over] of cases) {
    it(name, () => {
      const html = renderWith(C, snapshot(over));
      expect(html.length, `${name} 화면이 비어 있다`).toBeGreaterThan(0);
    });
  }

  it("공용 컴포넌트", () => {
    const s = snapshot({ phase: "discussion", phaseEndsAt: 30_000 });
    expect(renderWith(PlayerList, s).length).toBeGreaterThan(0);
    expect(renderWith(Chat, s).length).toBeGreaterThan(0);
    expect(renderWith(Timer, s, { remainingMs: 12_000 })).toContain("0:12");
  });
});

describe("★ 화면에 새면 안 되는 정보", () => {
  it("개표 중 과반 미달이면 라이어 여부를 보여주지 않는다", () => {
    const html = renderWith(VoteReveal, snapshot({
      phase: "vote-reveal", defendantId: "d",
      agreeCount: 1, disagreeCount: 2, executionConfirmed: false, defendantWasLiar: false,
    }));
    expect(html).toContain("과반수 미달");
    expect(html).not.toContain("맞습니다");
    expect(html).not.toContain("아닙니다");
  });

  it("관전자 화면에는 제시어 자리 자체가 없다", () => {
    const s = snapshot({
      phase: "word-check",
      players: { ...snapshot().players, e: player("e", "관전자", { isSpectator: true }) },
    });
    const html = renderWith(WordCheck, s, { me: "e" });
    expect(html).toContain("참가자들이 제시어를 확인");
    expect(html).not.toContain("탭하여 확인");
  });

  it("라운드 진행 중에는 어떤 화면도 라이어를 지목하지 않는다", () => {
    const s = snapshot({ phase: "discussion", descriptionOrder: ["a", "b", "c", "d"] });
    const html = renderWith(Discussion, s);
    expect(s.revealedLiarId).toBe("");
    expect(html).not.toContain("라이어입니다");
  });

  it("일반 모드에서 라이어 본인에게만 라이어라고 알린다", () => {
    const liar = snapshot({
      phase: "word-check",
      players: { ...snapshot().players, a: player("a", "앨리스", { isHost: true, amILiar: true }) },
    });
    expect(renderWith(WordCheck, liar)).toContain("당신의 제시어");

    const citizen = snapshot({
      phase: "word-check",
      players: { ...snapshot().players, a: player("a", "앨리스", { isHost: true, myWord: "김치찌개" }) },
    });
    const html = renderWith(WordCheck, citizen);
    expect(html).not.toContain("보라매");   // 타인의 단어가 화면에 없다
  });
});

describe("역할별 UI 게이팅", () => {
  it("호스트가 아니면 시작 버튼이 없다", () => {
    const s = snapshot({ phase: "waiting" });
    expect(renderWith(Waiting, s, { me: "a" })).toContain("게임 시작");
    expect(renderWith(Waiting, s, { me: "b" })).toContain("호스트가 게임을 시작할 때까지");
  });

  it("피고는 최종 투표를 할 수 없다", () => {
    const s = snapshot({ phase: "final-vote", defendantId: "d" });
    expect(renderWith(FinalVote, s, { me: "d" })).toContain("피고는 투표할 수 없습니다");
    expect(renderWith(FinalVote, s, { me: "a" })).toContain("찬성");
  });

  it("관전자는 채팅 입력이 막혀 있고 사유가 보인다", () => {
    const s = snapshot({
      phase: "discussion",
      players: { ...snapshot().players, e: player("e", "관전자", { isSpectator: true }) },
    });
    expect(renderWith(Chat, s, { me: "e" })).toContain("관전 중에는 채팅할 수 없습니다");
  });

  it("일시정지 배너가 끊긴 사람을 보여준다", () => {
    const s = snapshot({
      phase: "discussion", isPaused: true, graceRemainingMs: 20_000,
      players: { ...snapshot().players, c: player("c", "캐럴", { isConnected: false }) },
    });
    expect(renderWith(PauseBanner, s)).toContain("캐럴");
  });

  it("관전 배너는 관전자에게만 보인다", () => {
    const s = snapshot({
      phase: "discussion",
      players: { ...snapshot().players, e: player("e", "관전자", { isSpectator: true }) },
    });
    expect(renderWith(SpectatorBanner, s, { me: "e" })).toContain("관전 중");
    expect(renderWith(SpectatorBanner, s, { me: "a" })).toBe("<!---->");
  });
});

describe("라우터와 진입 화면", () => {
  it("경로를 정확히 해석한다", async () => {
    const { parse } = await import("./router.svelte.js");
    expect(parse("/")).toEqual({ name: "lobby" });
    expect(parse("/create")).toEqual({ name: "create" });
    expect(parse("/room/AbC-123")).toEqual({ name: "room", roomId: "AbC-123" });
    expect(parse("/room/AbC-123/")).toEqual({ name: "room", roomId: "AbC-123" });
    expect(parse("/없는경로")).toEqual({ name: "lobby" });
  });
});
