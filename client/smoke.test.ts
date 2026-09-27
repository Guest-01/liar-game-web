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
import PeekWord from "./game/PeekWord.svelte";
import MobileChat from "./game/MobileChat.svelte";
import PhaseProgress from "./game/PhaseProgress.svelte";

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
    expect(renderWith(PhaseProgress, s, { remainingMs: 15_000 })).toContain('width: 50%');
    expect(renderWith(MobileChat, s)).toContain("아직 대화가 없습니다");
  });
});

describe("헤더의 제시어는 누르고 있는 동안만 보인다", () => {
  const citizen = snapshot({
    phase: "discussion",
    players: { ...snapshot().players, a: player("a", "앨리스", { isHost: true, myWord: "김치찌개" }) },
  });
  const liar = snapshot({
    phase: "discussion",
    players: { ...snapshot().players, a: player("a", "앨리스", { isHost: true, amILiar: true }) },
  });

  it("기본 상태에서는 제시어도 라이어 여부도 DOM에 없다", () => {
    expect(renderWith(PeekWord, citizen)).not.toContain("김치찌개");
    expect(renderWith(PeekWord, citizen)).toContain("제시어 보기");
    expect(renderWith(PeekWord, liar)).not.toContain("라이어");
  });

  it("관전자에게는 버튼 자체가 없다", () => {
    const s = snapshot({
      phase: "discussion",
      players: { ...snapshot().players, e: player("e", "관전자", { isSpectator: true }) },
    });
    expect(renderWith(PeekWord, s, { me: "e" })).toBe("<!---->");
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

describe("실플레이 피드백 (2026-09-27)", () => {
  it("연출 페이즈에는 타이머와 진행 바를 보이지 않는다", () => {
    const reveal = snapshot({
      phase: "description-reveal", phaseEndsAt: 3_500, descriptionOrder: ["a", "b", "c", "d"],
    });
    expect(renderWith(Timer, reveal, { remainingMs: 3_000 })).not.toContain("0:03");
    expect(renderWith(PhaseProgress, reveal, { remainingMs: 3_000 })).not.toContain("progressbar");
    expect(renderWith(Description, reveal, { remainingMs: 3_000 })).not.toContain("0:03");

    const typing = snapshot({ phase: "description", phaseEndsAt: 30_000, descriptionOrder: ["a", "b", "c", "d"] });
    expect(renderWith(Description, typing, { remainingMs: 20_000 })).toContain("0:20");
  });

  it("첫 토론에는 다시하기가 있고 마지막 경고가 없다", () => {
    const html = renderWith(Discussion, snapshot({
      phase: "discussion", descriptionOrder: ["a", "b", "c", "d"],
      descriptionAttempts: 1, discussionAttempts: 1,
    }));
    expect(html).toContain("설명 다시하기");
    expect(html).not.toContain("마지막 토론");
  });

  it("★ 마지막 토론에는 다시하기를 내놓지 않고 경고한다", () => {
    const html = renderWith(Discussion, snapshot({
      phase: "discussion", descriptionOrder: ["a", "b", "c", "d"],
      descriptionAttempts: 1, discussionAttempts: 2,
    }));
    expect(html).not.toContain("설명 다시하기");
    expect(html).toContain("마지막 토론");
  });

  it("참가자 목록이 단계별로 누구를 기다리는지 보여준다", () => {
    const base = snapshot();
    const with_ = (phase: any, patch: Record<string, object>, over = {}) => snapshot({
      phase, ...over,
      players: Object.fromEntries(Object.entries(base.players)
        .map(([id, p]) => [id, { ...p, ...(patch[id] ?? {}) }])),
    });

    const check = renderWith(PlayerList, with_("word-check", { a: { hasCheckedWord: true } }));
    expect(check).toContain("확인 중");
    expect(check.match(/확인 중/g)).toHaveLength(3);

    const nominate = renderWith(PlayerList, with_("discussion", { a: { nominatedId: "b" } }));
    expect(nominate).toContain("지목 완료");
    expect(nominate.match(/고민 중/g)).toHaveLength(3);

    // 피고(d)는 투표하지 않으므로 상태가 없다 → "투표 중"은 b·c 두 명
    const vote = renderWith(PlayerList, with_("final-vote", { a: { hasFinalVoted: true } }, { defendantId: "d" }));
    expect(vote).toContain("투표 완료");
    expect(vote.match(/투표 중/g)).toHaveLength(2);

    expect(renderWith(PlayerList, snapshot({ phase: "waiting" }))).not.toContain("중</");
  });

  it("제시어 확인·최종 투표 화면이 기다리는 사람의 이름을 보여준다", () => {
    const base = snapshot();
    const players = { ...base.players, a: { ...base.players.a!, hasCheckedWord: true, hasFinalVoted: true } };
    // 플레이어 본인의 대기 문구는 "탭하여 확인"을 누른 뒤에만 보이므로 관전자 시점으로 본다
    const spectating = renderWith(WordCheck, snapshot({
      phase: "word-check",
      players: { ...players, e: player("e", "관전자", { isSpectator: true }) },
    }), { me: "e" });
    expect(spectating).toContain("기다리는 중: 보라매, 캐럴, 데이브");

    const vote = renderWith(FinalVote, snapshot({ phase: "final-vote", defendantId: "d", players }));
    expect(vote).toContain("기다리는 중: 보라매, 캐럴");
  });

  it("점수판이 증가분의 이유와 점수 기준을 보여준다", () => {
    const base = snapshot();
    const html = renderWith(Scoreboard, snapshot({
      phase: "scoreboard", round: 1, roundWinner: "liar", roundEndReason: "citizen-executed",
      revealedLiarId: "d",
      players: {
        ...base.players,
        a: { ...base.players.a!, score: 1, roundDelta: 1 },     // 라이어를 지목했던 시민
        d: { ...base.players.d!, score: 2, roundDelta: 2 },     // 라이어
      },
    }));
    expect(html).toContain("라이어 승리 +2");
    expect(html).toContain("라이어 지목 +1");
    expect(html).toContain("점수 기준");
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
