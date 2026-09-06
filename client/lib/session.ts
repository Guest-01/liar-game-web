// 브라우저 저장소. 무엇을 어디에 두는지는 아키텍처 결정이다.
//
//   닉네임          localStorage    재방문 시 유지
//   재접속 토큰     localStorage    탭을 닫았다 다시 열어도 유예(30초) 안이면 같은 자리로
//                                   돌아간다. 모바일에서 링크를 다시 탭하는 흐름이 이것이다.
//                                   sessionStorage였을 때는 탭을 닫으면 토큰이 사라져
//                                   유예 중인 본인의 자리와 닉네임이 충돌했다 (2026-09-06).
//                                   부작용: 같은 브라우저에서 같은 방을 두 탭으로 열면
//                                   나중 탭이 세션을 가져간다 — 한 브라우저는 한 사람이다.
//   방 비밀번호     sessionStorage  ★ URL에 절대 싣지 않는다 (체크리스트 C1)
//   게임 방법 펼침  localStorage    첫 방문에는 펼치고, 그 뒤로는 사용자가 정한 대로

import { generateRandomNickname } from "../../shared/nicknames.js";
import { NICKNAME_MAX, NICKNAME_MIN } from "../../shared/constants.js";

const NICK = "nickname";

/** 닉네임이 저장된 적이 없으면 첫 방문이다. `getNickname()`이 저장하므로 그 전에 물어야 한다. */
export const isFirstVisit = (): boolean => localStorage.getItem(NICK) === null;

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

const RULES_OPEN = "rulesOpen";
export const getRulesOpen = (fallback: boolean): boolean => {
  const v = localStorage.getItem(RULES_OPEN);
  return v === null ? fallback : v === "1";
};
export const setRulesOpen = (open: boolean) => localStorage.setItem(RULES_OPEN, open ? "1" : "0");

const pwKey = (roomId: string) => `pw:${roomId}`;
export const stashPassword = (roomId: string, pw: string) =>
  sessionStorage.setItem(pwKey(roomId), pw);
export const takePassword = (roomId: string): string | undefined => {
  const v = sessionStorage.getItem(pwKey(roomId));
  return v ?? undefined;
};
export const clearPassword = (roomId: string) => sessionStorage.removeItem(pwKey(roomId));

// M2에서 사용
const TOKEN_PREFIX = "rt:";
const tokenKey = (roomId: string) => `${TOKEN_PREFIX}${roomId}`;
export const saveReconnectToken = (roomId: string, token: string) => {
  // 한 번에 한 방에만 있으므로 다른 방의 토큰은 전부 낡은 것이다. 쌓이지 않게 지운다.
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith(TOKEN_PREFIX) && k !== tokenKey(roomId)) localStorage.removeItem(k);
  }
  localStorage.setItem(tokenKey(roomId), token);
};
export const loadReconnectToken = (roomId: string): string | null =>
  localStorage.getItem(tokenKey(roomId));
export const clearReconnectToken = (roomId: string) =>
  localStorage.removeItem(tokenKey(roomId));
