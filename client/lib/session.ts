// 브라우저 저장소. 무엇을 어디에 두는지는 아키텍처 결정이다.
//
//   닉네임          localStorage    재방문 시 유지
//   재접속 토큰     sessionStorage  탭 단위. 새로고침 복귀의 핵심 (M2)
//   방 비밀번호     sessionStorage  ★ URL에 절대 싣지 않는다 (체크리스트 C1)

import { generateRandomNickname } from "../../shared/nicknames.js";
import { NICKNAME_MAX, NICKNAME_MIN } from "../../shared/constants.js";

const NICK = "nickname";

export function getNickname(): string {
  const saved = localStorage.getItem(NICK);
  if (saved && saved.length >= NICKNAME_MIN) return saved;
  const fresh = generateRandomNickname();
  localStorage.setItem(NICK, fresh);
  return fresh;
}

export function setNickname(v: string): void {
  localStorage.setItem(NICK, v.trim());
}

export function isValidNickname(v: string): boolean {
  const t = v.trim();
  return t.length >= NICKNAME_MIN && t.length <= NICKNAME_MAX;
}

const pwKey = (roomId: string) => `pw:${roomId}`;
export const stashPassword = (roomId: string, pw: string) =>
  sessionStorage.setItem(pwKey(roomId), pw);
export const takePassword = (roomId: string): string | undefined => {
  const v = sessionStorage.getItem(pwKey(roomId));
  return v ?? undefined;
};
export const clearPassword = (roomId: string) => sessionStorage.removeItem(pwKey(roomId));

// M2에서 사용
const tokenKey = (roomId: string) => `rt:${roomId}`;
export const saveReconnectToken = (roomId: string, token: string) =>
  sessionStorage.setItem(tokenKey(roomId), token);
export const loadReconnectToken = (roomId: string): string | null =>
  sessionStorage.getItem(tokenKey(roomId));
export const clearReconnectToken = (roomId: string) =>
  sessionStorage.removeItem(tokenKey(roomId));
