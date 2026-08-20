<script lang="ts">
  import { game, isHost, playerList, send } from "../lib/connection.svelte.js";

  const canKick = $derived(isHost() && game.snapshot?.phase === "waiting");
</script>

<div class="bg-gray-800 rounded-xl p-4">
  <h3 class="font-semibold mb-3">
    참가자 ({playerList().length}/{game.snapshot?.maxPlayers ?? 0})
  </h3>
  <ul class="space-y-2">
    {#each playerList() as p (p.id)}
      <li class="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-700/50"
          class:opacity-50={!p.isConnected}>
        <span class="flex-1 truncate">
          {p.nickname}
          {#if p.isHost}<span title="호스트">👑</span>{/if}
          {#if p.id === game.mySessionId}<span class="text-xs text-primary">(나)</span>{/if}
        </span>
        {#if game.snapshot?.phase === "word-check" && p.hasCheckedWord}
          <span class="text-xs text-success">확인</span>
        {/if}
        {#if canKick && p.id !== game.mySessionId}
          <button onclick={() => send("kick", { targetId: p.id })}
                  class="text-xs text-danger hover:underline">강퇴</button>
        {/if}
      </li>
    {/each}
  </ul>
</div>
