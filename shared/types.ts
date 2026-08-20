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
