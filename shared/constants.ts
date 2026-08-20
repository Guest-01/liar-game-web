// 튜닝 상수. v1에서 실제 플레이로 조정된 값이 다수 포함되어 있다.
// 근거 없이 바꾸지 말 것 — docs/REQUIREMENTS.md §5

// ── 인원 ─────────────────────────────────────────────
export const MIN_PLAYERS = 4;   // 3인은 최종 투표가 만장일치가 되어 밸런스가 깨진다 (D7)
export const MAX_PLAYERS = 10;

// ── 시간 (초) ────────────────────────────────────────
export const DESCRIPTION_TIME_OPTIONS = [15, 30, 60] as const;
export const DISCUSSION_TIME_OPTIONS = [60, 120, 180] as const;
export const DEFENSE_TIME_OPTIONS = [15, 30, 60] as const;

export const DEFAULT_DESCRIPTION_TIME = 30;
export const DEFAULT_DISCUSSION_TIME = 120;
export const DEFAULT_DEFENSE_TIME = 15;

// 설정 불가 (고정)
export const FINAL_VOTE_MS = 15_000;
export const LIAR_GUESS_MS = 15_000;

// 전원 지목 완료 후 조기 종료까지
export const ALL_NOMINATED_GRACE_MS = 5_000;

// ── 연출 (REQUIREMENTS §F9) ──────────────────────────
// 연출은 부가가 아니라 기능이다. 서버는 페이즈와 남은 시간만 주고
// 타임라인은 클라이언트가 소유한다.

/** 발언 순서 추첨: 하이라이트가 점점 느려지다 첫 설명자에서 멈춘다 */
export const ORDER_REVEAL_MS = 2_800;

/** 한줄 설명 타이핑: 글자당 100ms, 총 3초 안에서 남는 시간은 대기 */
export const DESCRIPTION_REVEAL_MS = 3_500;
export const TYPING_MS_PER_CHAR = 100;

/** 개표: 찬반을 공개하고 카운트다운 */
export const VOTE_REVEAL_MS = 5_000;

/** 라이어 공개: "○○님은 라이어가…" 타이핑(1s+0.5s+1s) → 결과 유지(1.5s+) */
export const LIAR_REVEAL_MS = 7_000;

// ── 기회 상한 (D8) ───────────────────────────────────
// "시민에게 주어진 기회는 유한하다. 소진하고도 라이어를 처형하지 못하면 라이어 승."
export const MAX_DESCRIPTION_ATTEMPTS = 2;
export const MAX_DISCUSSION_ATTEMPTS = 2;

// ── 라운드/매치 (M4) ─────────────────────────────────
export const ROUND_COUNT_OPTIONS = [3, 5, 0] as const;   // 0 = 무제한
export const DEFAULT_ROUND_COUNT = 3;

export const SCORE_LIAR_WIN = 2;
export const SCORE_CITIZEN_WIN = 1;
export const SCORE_CORRECT_NOMINATION = 1;

// ── 재접속 (M2) ──────────────────────────────────────
export const RECONNECT_GRACE_SEC = 30;

// ── 운영 ─────────────────────────────────────────────
export const CHAT_HISTORY = 50;
export const EMPTY_ROOM_DISPOSE_SEC = 5;

// ── 입력 길이 ────────────────────────────────────────
export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 10;
export const ROOM_NAME_MIN = 1;
export const ROOM_NAME_MAX = 20;
export const PASSWORD_MIN = 1;
export const PASSWORD_MAX = 20;
export const DESCRIPTION_MAX = 100;
export const CHAT_MAX = 200;
export const GUESS_MAX = 50;

// 지목 시 "한줄 설명 다시하기"를 선택하기 위한 특수 ID
export const REDO_TARGET = "__REDO__";
