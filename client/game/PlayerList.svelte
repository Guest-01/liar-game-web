<script lang="ts">
  import { game, isHost, playerList, send, spectatorList } from "../lib/connection.svelte.js";
  import Users from "@lucide/svelte/icons/users";
  import Crown from "@lucide/svelte/icons/crown";
  import Eye from "@lucide/svelte/icons/eye";
  import WifiOff from "@lucide/svelte/icons/wifi-off";
  import Check from "@lucide/svelte/icons/check";
  import UserX from "@lucide/svelte/icons/user-x";
  import Hourglass from "@lucide/svelte/icons/hourglass";
  import type { PlayerSnapshot } from "../../shared/snapshot.js";

  const inRound = $derived(game.snapshot?.phase !== "waiting");
  // 라운드 중에는 관전자만 강퇴할 수 있다 (서버도 같은 규칙을 강제한다)
  const canKickPlayer = $derived(isHost() && !inRound);
  const canKickSpectator = $derived(isHost());

  /**
   * "전원 완료"를 기다리는 단계에서 누가 끝냈고 누구를 기다리는지.
   * 인원수만 보여주면 누가 멈춰 있는지 알 수 없다. 전부 이미 공개된 필드다
   * (확인 여부·지목 여부·투표 여부 — 지목 대상과 찬반은 여기서 드러나지 않는다).
   */
  type Status = { done: boolean; label: string } | null;
  function statusOf(p: PlayerSnapshot): Status {
    const s = game.snapshot;
    switch (s?.phase) {
      case "word-check":
        return p.hasCheckedWord ? { done: true, label: "확인" } : { done: false, label: "확인 중" };
      case "discussion":
        return p.nominatedId ? { done: true, label: "지목 완료" } : { done: false, label: "고민 중" };
      case "final-vote":
        if (p.id === s.defendantId) return null;             // 피고는 투표하지 않는다
        return p.hasFinalVoted ? { done: true, label: "투표 완료" } : { done: false, label: "투표 중" };
      default:
        return null;
    }
  }
</script>

<div class="bg-gray-800 rounded-xl p-4">
  <h3 class="font-semibold mb-3 flex items-center gap-2">
    <Users class="w-4 h-4 text-gray-400" />
    참가자 <span class="tabular-nums text-gray-400 font-normal">({playerList().length}/{game.snapshot?.maxPlayers ?? 0})</span>
  </h3>
  <ul class="space-y-2">
    {#each playerList() as p (p.id)}
      {@const status = statusOf(p)}
      <li class="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-700/50"
          class:opacity-50={!p.isConnected}>
        <span class="flex-1 truncate inline-flex items-center gap-1.5">
          {p.nickname}
          {#if p.isHost}<Crown class="w-4 h-4 text-accent shrink-0" aria-label="호스트" />{/if}
          {#if p.id === game.mySessionId}<span class="text-xs text-primary">(나)</span>{/if}
        </span>
        {#if !p.isConnected}
          <span class="text-xs text-warning inline-flex items-center gap-1"><WifiOff class="w-3.5 h-3.5" />접속 끊김</span>
        {:else if status?.done}
          <span class="text-xs text-success inline-flex items-center gap-1"><Check class="w-3.5 h-3.5" />{status.label}</span>
        {:else if status}
          <span class="text-xs text-gray-400 inline-flex items-center gap-1"><Hourglass class="w-3.5 h-3.5" />{status.label}</span>
        {/if}
        {#if canKickPlayer && p.id !== game.mySessionId}
          <button onclick={() => send("kick", { targetId: p.id })} title="강퇴"
                  class="text-xs text-danger hover:underline inline-flex items-center gap-1">
            <UserX class="w-3.5 h-3.5" />강퇴
          </button>
        {/if}
      </li>
    {/each}
  </ul>

  {#if spectatorList().length > 0}
    <div class="mt-4 pt-3 border-t border-gray-700">
      <h3 class="font-semibold text-sm text-gray-400 mb-2 flex items-center gap-2">
        <Eye class="w-4 h-4" />관전자 <span class="tabular-nums font-normal">({spectatorList().length})</span>
      </h3>
      <ul class="space-y-1.5">
        {#each spectatorList() as p (p.id)}
          <li class="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-700/30 text-sm">
            <span class="flex-1 truncate text-gray-300">
              {p.nickname}
              {#if p.id === game.mySessionId}<span class="text-xs text-secondary">(나)</span>{/if}
            </span>
            {#if canKickSpectator && p.id !== game.mySessionId}
              <button onclick={() => send("kick", { targetId: p.id })} title="강퇴"
                      class="text-xs text-danger hover:underline inline-flex items-center gap-1">
                <UserX class="w-3.5 h-3.5" />강퇴
              </button>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</div>
