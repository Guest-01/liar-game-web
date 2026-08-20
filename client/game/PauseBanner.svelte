<script lang="ts">
  import { disconnectedPlayers, game, isHost, send } from "../lib/connection.svelte.js";

  const waiting = $derived(disconnectedPlayers());
  const seconds = $derived(Math.ceil(game.graceMs / 1000));
  const names = $derived(waiting.map((p) => p.nickname).join(", "));
</script>

{#if game.snapshot?.isPaused && waiting.length > 0}
  <div class="bg-warning/20 border-b border-warning px-4 py-3 flex flex-wrap items-center justify-center gap-3 text-sm">
    <span>
      <span class="font-semibold">{names}</span>님의 재접속을 기다리는 중…
      {#if seconds > 0}<span class="font-mono ml-1">{seconds}초</span>{/if}
    </span>
    <span class="text-gray-400 text-xs">게임이 일시정지되었습니다 (채팅은 가능합니다)</span>
    {#if isHost()}
      <button onclick={() => send("skip-wait")}
              class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs font-semibold">
        기다리지 않고 계속
      </button>
    {/if}
  </div>
{/if}
