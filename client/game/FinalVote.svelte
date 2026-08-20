<script lang="ts">
  import { game, me, nicknameOf, playerList, send } from "../lib/connection.svelte.js";
  import Timer from "./Timer.svelte";

  const s = $derived(game.snapshot!);
  const my = $derived(me());
  const amDefendant = $derived(s.defendantId === game.mySessionId);
  const votedCount = $derived(playerList().filter((p) => p.hasFinalVoted).length);
  const eligible = $derived(playerList().length - 1);
</script>

<div class="text-center py-8 space-y-6">
  <div class="flex items-center justify-center gap-4">
    <h2 class="text-2xl font-bold">최종 투표</h2>
    <Timer />
  </div>

  <p class="text-lg"><span class="font-bold">{nicknameOf(s.defendantId)}</span>님을 라이어로 지목하시겠습니까?</p>

  {#if amDefendant}
    <p class="text-gray-400">피고는 투표할 수 없습니다</p>
  {:else if my?.hasFinalVoted}
    <p class="text-success">투표 완료 — {my.myFinalVote ? "찬성" : "반대"}</p>
  {:else}
    <div class="flex justify-center gap-4">
      <button onclick={() => send("final-vote", { agree: true })}
              class="px-10 py-4 bg-danger hover:bg-danger/80 rounded-xl font-bold text-lg">찬성</button>
      <button onclick={() => send("final-vote", { agree: false })}
              class="px-10 py-4 bg-gray-700 hover:bg-gray-600 rounded-xl font-bold text-lg">반대</button>
    </div>
  {/if}

  <p class="text-sm text-gray-500">{votedCount} / {eligible}명 투표함</p>
</div>
