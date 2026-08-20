import {
  DESCRIPTION_REVEAL_MS, FINAL_VOTE_MS, LIAR_GUESS_MS, LIAR_REVEAL_MS,
  ORDER_REVEAL_MS, VOTE_REVEAL_MS,
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
 *   권한 검사(호스트·피고·라이어)는 LiarRoom.handle이 따로 한다.
 */
export type PhaseDef = {
  duration: ((s: RoomSchema) => number) | null;
  accepts: readonly MessageType[];
};

/**
 * 어느 페이즈에서나 허용되는 것.
 * `kick`이 여기 있는 이유: 라운드 중에도 호스트가 **관전자**를 강퇴할 수 있어야
 * 한다. 플레이어 강퇴는 LiarRoom.kick이 따로 막는다.
 */
const ALWAYS = ["chat", "kick"] as const;

const only = (...types: MessageType[]): readonly MessageType[] => [...types, ...ALWAYS];

export const PHASES: Record<Phase, PhaseDef> = {
  "waiting": {
    duration: null,
    accepts: only("set-settings", "start-match"),
  },
  "word-check": {
    // 무기한 — 전원이 확인하면 전이한다. 시간 제한 없음 (REQUIREMENTS §1.4 ①)
    duration: null,
    accepts: only("check-word"),
  },
  "order-reveal": {
    // ⟨연출⟩ 발언 순서 추첨. 이 시간을 설명 제한시간에서 떼어내지 않기 위해
    // 별도 페이즈로 둔다 — 첫 설명자가 손해를 보면 안 된다.
    duration: () => ORDER_REVEAL_MS,
    accepts: only(),
  },
  "description": {
    duration: (s) => s.descriptionTime * 1000,
    accepts: only("submit-description"),
  },
  "description-reveal": {
    duration: () => DESCRIPTION_REVEAL_MS,
    accepts: only(),
  },
  "discussion": {
    duration: (s) => s.discussionTime * 1000,
    accepts: only("nominate"),
  },
  "defense": {
    // 피고만 발언할 수 있다 — LiarRoom.chat이 별도로 검사한다
    duration: (s) => s.defenseTime * 1000,
    accepts: only("end-defense"),
  },
  "final-vote": {
    duration: () => FINAL_VOTE_MS,
    accepts: only("final-vote"),
  },
  "vote-reveal": {
    // ⟨연출⟩ 개표 카운트다운. 처형이 확정되면 라이어 공개까지 이어지므로 더 길다.
    duration: (s) => VOTE_REVEAL_MS + (s.executionConfirmed ? LIAR_REVEAL_MS : 0),
    accepts: only(),
  },
  "liar-guess": {
    duration: () => LIAR_GUESS_MS,
    accepts: only("liar-guess"),
  },
  "round-result": {
    duration: null,
    accepts: only("next-round"),
  },
  // M4
  "scoreboard":   { duration: null, accepts: only("next-round") },
  "match-result": { duration: null, accepts: only("next-round") },
};

/**
 * 연출 페이즈. 게임 규칙이 아니라 보여주기 위한 시간이므로
 * 테스트에서는 길이를 0으로 줄여 즉시 통과시킨다 (LiarRoom.fxScale).
 */
export const FX_PHASES: ReadonlySet<Phase> = new Set<Phase>([
  "order-reveal", "description-reveal", "vote-reveal",
]);

export function phaseAccepts(phase: string, type: MessageType): boolean {
  const def = PHASES[phase as Phase];
  return !!def && (def.accepts as readonly string[]).includes(type);
}

export function phaseDuration(phase: Phase, state: RoomSchema): number {
  const d = PHASES[phase].duration;
  return d ? d(state) : 0;
}
