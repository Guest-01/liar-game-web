<script lang="ts">
  import { game, nicknameOf, send } from "../lib/connection.svelte.js";
  import Timer from "./Timer.svelte";

  const s = $derived(game.snapshot!);
  const amDefendant = $derived(s.defendantId === game.mySessionId);
</script>

<div class="text-center py-8 space-y-6">
  <div class="flex items-center justify-center gap-4">
    <h2 class="text-2xl font-bold">최후 변론</h2>
    <Timer />
  </div>

  <div class="bg-warning/20 border border-warning rounded-xl p-6">
    <p class="text-lg"><span class="font-bold">{nicknameOf(s.defendantId)}</span>님이 지목되었습니다</p>
    <p class="text-sm text-gray-300 mt-1">
      {amDefendant ? "채팅으로 변론하세요" : "변론을 들어보세요 (다른 사람은 발언할 수 없습니다)"}
    </p>
  </div>

  {#if amDefendant}
    <button onclick={() => send("end-defense")}
            class="px-8 py-3 bg-primary hover:bg-primary/80 rounded-lg font-bold">변론 마치기</button>
  {/if}
</div>
