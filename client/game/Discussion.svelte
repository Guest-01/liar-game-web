<script lang="ts">
  import { amSpectator, game, me, nicknameOf, playerList, send } from "../lib/connection.svelte.js";
  import { REDO_TARGET } from "../../shared/constants.js";
  import Timer from "./Timer.svelte";

  const s = $derived(game.snapshot!);
  const my = $derived(me());
  const canRedo = $derived(s.descriptionAttempts < 2);

  const countFor = (id: string) => playerList().filter((p) => p.nominatedId === id).length;
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h2 class="text-xl font-bold">토론 &amp; 지목</h2>
    <Timer />
  </div>

  <div class="bg-gray-800/50 rounded-xl p-4 space-y-1.5">
    {#each s.descriptionOrder as id (id)}
      <p class="text-sm break-words">
        <span class="font-semibold w-24 inline-block">{nicknameOf(id)}</span>
        <span class="text-gray-300">{playerList().find((p) => p.id === id)?.description}</span>
      </p>
    {/each}
  </div>

  <div>
    <h3 class="font-semibold mb-2">
      {amSpectator() ? "지목 현황" : "누가 라이어일까요?"}
    </h3>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {#each playerList().filter((p) => p.id !== game.mySessionId) as p (p.id)}
        <button onclick={() => send("nominate", { targetId: p.id })} disabled={amSpectator()}
                class="px-3 py-3 rounded-lg text-sm transition-colors disabled:cursor-default
                       {my?.nominatedId === p.id ? 'bg-danger' : 'bg-gray-700 enabled:hover:bg-gray-600'}">
          <span class="block truncate">{p.nickname}</span>
          <span class="text-xs opacity-70">{countFor(p.id)}표</span>
        </button>
      {/each}

      {#if canRedo}
        <button onclick={() => send("nominate", { targetId: REDO_TARGET })} disabled={amSpectator()}
                class="px-3 py-3 rounded-lg text-sm transition-colors
                       {my?.nominatedId === REDO_TARGET ? 'bg-warning text-black' : 'bg-gray-700 hover:bg-gray-600'}">
          <span class="block">설명 다시하기</span>
          <span class="text-xs opacity-70">{countFor(REDO_TARGET)}표</span>
        </button>
      {/if}
    </div>
    {#if amSpectator()}
      <p class="text-xs text-gray-500 mt-2">관전 중에는 지목할 수 없습니다</p>
    {:else if !canRedo}
      <p class="text-xs text-gray-500 mt-2">설명 다시하기 기회를 모두 사용했습니다</p>
    {/if}
  </div>
</div>
