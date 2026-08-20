import {
  DESCRIPTION_REVEAL_MS, FINAL_VOTE_MS, LIAR_GUESS_MS, VOTE_REVEAL_MS,
} from "../../shared/constants.js";
import type { MessageType } from "../../shared/protocol.js";
import type { Phase } from "../../shared/types.js";
import type { RoomSchema } from "./state.js";

/**
 * 페이즈 정의 테이블.
 *
 * - `duration`: 밀리초. `null`이면 무기한(외부 조건으로만 전이).
 *   연출 페이즈(`*-reveal`)는 M1에서 0이라 즉시 통과한다. M5에서 상수만 바꾸면
 *   되고 상태 머신을 다시 짜지 않아도 된다.
 * - `accepts`: 이 페이즈에서 허용되는 클라이언트 메시지. 디스패처가 이 표로 거른다.
 */
export type PhaseDef = {
  duration: ((s: RoomSchema) => number) | null;
  accepts: readonly MessageType[];
};

const LOBBY_MESSAGES = ["set-settings", "kick", "start-match", "chat"] as const;

export const PHASES: Record<Phase, PhaseDef> = {
  "waiting": {
    duration: null,
    accepts: LOBBY_MESSAGES,
  },
  "word-check": {
    // 무기한 — 전원이 확인하면 전이한다. 시간 제한 없음 (REQUIREMENTS §1.4 ①)
    duration: null,
    accepts: ["check-word", "chat"],
  },
  "description": {
    duration: (s) => s.descriptionTime * 1000,
    accepts: ["submit-description", "chat"],
  },
  "description-reveal": {
    duration: () => DESCRIPTION_REVEAL_MS,
    accepts: ["chat"],
  },
  "discussion": {
    duration: (s) => s.discussionTime * 1000,
    accepts: ["nominate", "chat"],
  },
  "defense": {
    // 피고만 발언할 수 있다 — 디스패처가 별도로 검사한다
    duration: (s) => s.defenseTime * 1000,
    accepts: ["end-defense", "chat"],
  },
  "final-vote": {
    duration: () => FINAL_VOTE_MS,
    accepts: ["final-vote", "chat"],
  },
  "vote-reveal": {
    duration: () => VOTE_REVEAL_MS,
    accepts: ["chat"],
  },
  "liar-guess": {
    duration: () => LIAR_GUESS_MS,
    accepts: ["liar-guess", "chat"],
  },
  "round-result": {
    duration: null,
    accepts: ["next-round", "chat"],
  },
  // M4
  "scoreboard":   { duration: null, accepts: ["next-round", "chat"] },
  "match-result": { duration: null, accepts: ["next-round", "chat"] },
};

export function phaseAccepts(phase: string, type: MessageType): boolean {
  const def = PHASES[phase as Phase];
  return !!def && (def.accepts as readonly string[]).includes(type);
}

export function phaseDuration(phase: Phase, state: RoomSchema): number {
  const d = PHASES[phase].duration;
  return d ? d(state) : 0;
}
