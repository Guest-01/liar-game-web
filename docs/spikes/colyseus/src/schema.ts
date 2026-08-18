import { Schema, MapSchema, type, view } from "@colyseus/schema";

// 센티널: 페이로드 바이트에서 검색하기 위해 고유한 값 사용
export const CITIZEN_WORD = "SENTINEL_CITIZEN_김치찌개";
export const LIAR_WORD    = "SENTINEL_LIAR_돌솥밥";

export class Player extends Schema {
  @type("string") sessionId: string = "";
  @type("string") nickname: string = "";
  @type("boolean") isConnected: boolean = true;
  @type("number") score: number = 0;
  @type("boolean") isSpectator: boolean = false;

  // ── 비밀 필드: 본인에게만 ──────────────────────────
  @view() @type("string") myWord: string = "";
  @view() @type("boolean") amILiar: boolean = false;
}

export class RoundState extends Schema {
  @type("string") phase: string = "waiting";
  @type("string") category: string = "";
  @type({ map: Player }) players = new MapSchema<Player>();
  // 라이어 정체는 라운드 진행 중 state에 존재하지 않는다.
  // 결과 공개 시점에만 채워진다.
  @type("string") revealedLiarId: string = "";
}
