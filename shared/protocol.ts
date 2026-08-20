// 클라이언트 → 서버 메시지의 런타임 검증 스키마.
// v1은 타입 선언만 있고 런타임 검증이 없어 필드 누락·타입 불일치가 그대로
// 로직에 들어갔다. (체크리스트 C5)

import { z } from "zod";
import {
  CHAT_MAX, DEFENSE_TIME_OPTIONS, DESCRIPTION_MAX, DESCRIPTION_TIME_OPTIONS,
  DISCUSSION_TIME_OPTIONS, GUESS_MAX, MAX_PLAYERS, MIN_PLAYERS,
  NICKNAME_MAX, NICKNAME_MIN, PASSWORD_MAX, PASSWORD_MIN,
  ROOM_NAME_MAX, ROOM_NAME_MIN, ROUND_COUNT_OPTIONS,
} from "./constants.js";

/** 닉네임: 앞뒤 공백을 제거한 뒤 길이를 본다. 이스케이프는 렌더 시에 한다. */
export const nickname = z.string().trim().min(NICKNAME_MIN).max(NICKNAME_MAX);
export const roomName = z.string().trim().min(ROOM_NAME_MIN).max(ROOM_NAME_MAX);
export const password = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);

/** 방 참가 옵션 (Colyseus onJoin으로 전달된다) */
export const JoinOptions = z.object({
  nickname,
  password: password.optional(),
});
export type JoinOptions = z.infer<typeof JoinOptions>;

/** 방 생성 옵션 */
export const CreateOptions = z.object({
  nickname,
  roomName,
  isPublic: z.boolean(),
  password: password.optional(),
}).refine((v) => v.isPublic || !!v.password, {
  message: "비공개 방은 비밀번호가 필요하다",
  path: ["password"],
});
export type CreateOptions = z.infer<typeof CreateOptions>;

// ── 클라이언트 → 서버 메시지 ─────────────────────────

export const SetSettings = z.object({
  gameMode: z.enum(["normal", "fool"]).optional(),
  category: z.string().max(20).optional(),
  maxPlayers: z.number().int().min(MIN_PLAYERS).max(MAX_PLAYERS).optional(),
  totalRounds: z.literal(ROUND_COUNT_OPTIONS).optional(),
  descriptionTime: z.literal(DESCRIPTION_TIME_OPTIONS).optional(),
  discussionTime: z.literal(DISCUSSION_TIME_OPTIONS).optional(),
  defenseTime: z.literal(DEFENSE_TIME_OPTIONS).optional(),
});
export type SetSettings = z.infer<typeof SetSettings>;

export const Kick = z.object({ targetId: z.string().min(1).max(64) });
export const SubmitDescription = z.object({ text: z.string().max(DESCRIPTION_MAX) });
export const Nominate = z.object({ targetId: z.string().min(1).max(64) });
export const Chat = z.object({ text: z.string().trim().min(1).max(CHAT_MAX) });
export const FinalVote = z.object({ agree: z.boolean() });
export const LiarGuess = z.object({ text: z.string().max(GUESS_MAX) });

/** 메시지 이름 → 스키마. 디스패처가 이 표 하나로 검증한다. */
export const MESSAGE_SCHEMAS = {
  "set-settings": SetSettings,
  "kick": Kick,
  "start-match": z.object({}).loose(),
  "check-word": z.object({}).loose(),
  "submit-description": SubmitDescription,
  "nominate": Nominate,
  "chat": Chat,
  "end-defense": z.object({}).loose(),
  "final-vote": FinalVote,
  "liar-guess": LiarGuess,
  "next-round": z.object({}).loose(),
} as const;

export type MessageType = keyof typeof MESSAGE_SCHEMAS;
export type MessagePayload<T extends MessageType> = z.infer<(typeof MESSAGE_SCHEMAS)[T]>;
