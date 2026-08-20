import { ArraySchema, MapSchema, Schema, type, view } from "@colyseus/schema";
import type { RoomSnapshot } from "../../shared/snapshot.js";

// ⚠️ StateView / @view()는 `@colyseus/schema`에서 온다. `colyseus`가 아니다.
//    colyseus에서 import하면 undefined이고 런타임에야 터진다. (체크리스트 G2)

export class PlayerSchema extends Schema {
  // ── 전원 공개 ──────────────────────────────────
  @type("string")  id = "";
  @type("string")  nickname = "";
  @type("boolean") isHost = false;
  @type("boolean") isConnected = true;
  @type("boolean") isSpectator = false;
  @type("uint16")  score = 0;
  @type("boolean") hasCheckedWord = false;
  @type("string")  description = "";
  @type("string")  nominatedId = "";
  @type("boolean") hasFinalVoted = false;

  // ── 본인에게만 (StateView) ─────────────────────
  // 이 필드들은 client.view에 이 Player 인스턴스가 담긴 클라이언트에게만
  // 직렬화된다. 남의 것은 빈 값이 아니라 키 자체가 전송되지 않는다.
  @view() @type("string")  myWord = "";
  @view() @type("boolean") amILiar = false;
  @view() @type("boolean") myFinalVote = false;
}

export class ChatSchema extends Schema {
  @type("string") id = "";
  @type("string") senderId = "";   // "" = 시스템 메시지
  @type("string") nickname = "";
  @type("string") text = "";
  @type("number") at = 0;
}

export class RoomSchema extends Schema {
  // 설정
  @type("string")  name = "";
  @type("boolean") isPublic = true;
  @type("uint8")   maxPlayers = 10;
  @type("string")  gameMode = "normal";
  @type("string")  category = "랜덤";
  @type("uint8")   totalRounds = 3;
  @type("uint16")  descriptionTime = 30;
  @type("uint16")  discussionTime = 120;
  @type("uint16")  defenseTime = 15;

  // 진행
  @type("string")  phase = "waiting";
  @type("uint32")  phaseRemainingMs = 0;
  @type("number")  phaseEndsAt = 0;
  @type("boolean") isPaused = false;
  // 유예가 끝나기까지 남은 시간. 누가 끊겼는지는 Player.isConnected로 파생한다
  // (중복 상태를 두지 않는다).
  @type("uint32")  graceRemainingMs = 0;
  @type("uint8")   round = 0;
  @type("uint8")   descriptionAttempts = 0;
  @type("uint8")   discussionAttempts = 0;
  @type(["string"]) descriptionOrder = new ArraySchema<string>();
  @type("uint8")   currentDescriberIndex = 0;
  @type("string")  defendantId = "";

  // 개표
  @type("uint8") agreeCount = 0;
  @type("uint8") disagreeCount = 0;
  @type("uint8") abstainCount = 0;

  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
  @type([ChatSchema])          chat = new ArraySchema<ChatSchema>();

  // 라운드 결과 — round-result 진입 시에만 채워진다.
  // 진행 중에는 빈 문자열이므로 라이어 정체가 state에 존재하지 않는다.
  @type("string") revealedLiarId = "";
  @type("string") revealedCitizenWord = "";
  @type("string") revealedLiarWord = "";
  @type("string") liarGuess = "";
  @type("string") roundWinner = "";
  @type("string") roundEndReason = "";
}

// ─────────────────────────────────────────────────────────────
// 계약 검사: Schema의 toJSON 모양이 shared/snapshot.ts와 어긋나면
// 여기서 컴파일 에러가 난다. 클라이언트가 쓰는 타입이 표류하지 않도록 붙잡는다.
// ─────────────────────────────────────────────────────────────
type SchemaJson = ReturnType<RoomSchema["toJSON"]>;
type _AssertKeysCovered = SchemaJson extends Record<keyof RoomSnapshot, unknown> ? true : never;
const _contractCheck: _AssertKeysCovered = true;
void _contractCheck;
