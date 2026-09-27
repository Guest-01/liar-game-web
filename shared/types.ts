// 서버·클라이언트 공용 타입. 프레임워크 의존 없음.

export type GameMode = "normal" | "fool";

export type Phase =
  | "waiting"
  | "word-check"
  | "order-reveal"
  | "description"
  | "description-reveal"
  | "discussion"
  | "defense"
  | "final-vote"
  | "vote-reveal"
  | "liar-guess"
  | "round-result"
  | "scoreboard"      // M4
  | "match-result";   // M4

/** 라운드가 진행 중인가 (대기실·결과 화면이 아닌가) */
export const IN_ROUND_PHASES: ReadonlySet<Phase> = new Set<Phase>([
  "word-check", "order-reveal", "description", "description-reveal",
  "discussion", "defense", "final-vote", "vote-reveal", "liar-guess",
]);

/**
 * 연출 페이즈. 게임 규칙이 아니라 보여주기 위한 시간이다.
 *
 * 서버는 이 길이를 테스트에서 0으로 줄이고(LiarRoom.fxScale), 클라이언트는
 * 이 동안 페이즈 타이머를 보이지 않는다 — 남은 시간이 사람의 행동과 무관하므로
 * "설명이 끝났는데 타이머가 3초로 줄어드는" 식의 혼란만 준다. 연출은 자기
 * 타임라인(개표 카운트다운 등)을 스스로 보여준다.
 */
export const FX_PHASES: ReadonlySet<Phase> = new Set<Phase>([
  "order-reveal", "description-reveal", "vote-reveal",
]);

/** 제시어와 라이어 정체가 전원에게 공개되는 페이즈 */
export const REVEAL_PHASES: ReadonlySet<Phase> = new Set<Phase>([
  "round-result", "scoreboard", "match-result",
]);

export type RoundWinner = "citizen" | "liar";

/** 라운드가 끝난 이유. 결과 화면 문구와 점수 계산에 쓰인다. */
export type RoundEndReason =
  | "liar-executed-wrong-guess"   // 시민 승
  | "liar-executed-right-guess"   // 라이어 역전승
  | "citizen-executed"            // 라이어 승
  | "chances-exhausted"           // 라이어 승 (D8)
  | "voided";                     // 무효 (이탈 등) — 점수 변동 없음
