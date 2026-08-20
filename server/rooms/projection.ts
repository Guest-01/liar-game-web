import { StateView } from "@colyseus/schema";
import type { Client } from "colyseus";
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
 * **뷰는 어떤 페이즈에서도 넓어지지 않는다.** 라운드 결과 공개는 개인 `@view`
 * 필드가 아니라 방 수준 필드(`revealedLiarId`·`revealedCitizenWord`·
 * `revealedLiarWord`)로 한다. 그 필드들은 뷰와 무관하게 전원에게 전달되고,
 * 결과 화면(`client/game/RoundResult.svelte`)도 그것만 쓴다.
 *
 * ⚠️ 결과 공개 때 전원의 Player를 뷰에 담던 시절이 있었는데, 그렇게 하면
 * **다음 라운드까지 남의 제시어가 클라이언트에 남는다.** StateView에서 빠지는 것은
 * "값을 지워라"가 아니라 "더 이상 업데이트를 보내지 않는다"는 뜻이기 때문이다.
 * (체크리스트 G13 — 봇 하니스의 불변식 감시가 잡았다)
 *
 * 이 규칙이 지켜지는지는 projection.security.test.ts가 **바이트 수준으로** 검증하며,
 * 그 테스트는 배포 게이트다.
 */
export function syncViews(
  clients: readonly Client[],
  state: RoomSchema,
): void {
  for (const client of clients) {
    const view = new StateView();
    const me = state.players.get(client.sessionId);
    // 관전자는 아무것도 담지 않는다 → 어떤 제시어도 보지 못한다
    if (me && !me.isSpectator) view.add(me);
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
