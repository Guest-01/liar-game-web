import { StateView } from "@colyseus/schema";
import type { Client } from "colyseus";
import { REVEAL_PHASES, type Phase } from "../../shared/types.js";
import type { PlayerSchema, RoomSchema } from "./state.js";

/**
 * ★ 정보 은닉의 단일 지점. StateView를 만지는 코드는 이 파일뿐이어야 한다. ★
 *
 * docs/REQUIREMENTS.md §2의 3계층 표를 코드로 옮긴 것이다.
 *
 *   플레이어(본인)  자기 제시어 + 자기가 라이어인지(일반 모드) + 자기 표
 *   플레이어(타인)  공개 정보만
 *   관전자          공개 정보만. **제시어도 보이지 않는다.**
 *
 * 결과 공개 페이즈에서는 전원의 Player를 모든 뷰에 담아 일괄 공개한다.
 *
 * 이 규칙이 지켜지는지는 projection.security.test.ts가 **바이트 수준으로** 검증하며,
 * 그 테스트는 배포 게이트다.
 */
export function syncViews(
  clients: readonly Client[],
  state: RoomSchema,
): void {
  const revealed = REVEAL_PHASES.has(state.phase as Phase);
  const everyone = revealed ? [...state.players.values()] : null;

  for (const client of clients) {
    const view = new StateView();

    if (everyone) {
      // 결과 공개: 관전자를 포함한 전원이 모든 제시어를 본다
      for (const p of everyone) view.add(p);
    } else {
      const me = state.players.get(client.sessionId);
      // 관전자는 아무것도 담지 않는다 → 어떤 제시어도 보지 못한다
      if (me && !me.isSpectator) view.add(me);
    }

    client.view = view;
  }
}

/**
 * 라운드 비밀을 각 플레이어의 @view 필드에 배분한다.
 * `wordFor`(shared/rules.ts)가 모드별 규칙을 결정하고, 여기서는 쓰기만 한다.
 */
export function assignSecrets(
  players: Iterable<PlayerSchema>,
  assign: (playerId: string) => { word: string; amILiar: boolean },
): void {
  for (const p of players) {
    if (p.isSpectator) continue;
    const { word, amILiar } = assign(p.id);
    p.myWord = word;
    p.amILiar = amILiar;
  }
}

/** 라운드 종료·중단 시 모든 비밀 필드를 지운다. */
export function clearSecrets(players: Iterable<PlayerSchema>): void {
  for (const p of players) {
    p.myWord = "";
    p.amILiar = false;
    p.myFinalVote = false;
  }
}
