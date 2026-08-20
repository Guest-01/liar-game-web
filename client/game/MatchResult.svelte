<script lang="ts">
  import { game, isHost, playerList, send } from "../lib/connection.svelte.js";
  import { rank } from "../../shared/rules.js";
  import Feedback from "../ui/Feedback.svelte";

  const s = $derived(game.snapshot!);
  const ranked = $derived(rank(playerList()));
  const winners = $derived(ranked.filter((p) => p.place === 1));
  const medal = ["🥇", "🥈", "🥉"];
</script>

<div class="py-8 space-y-6 text-center">
  <h2 class="text-3xl font-bold">🏆 최종 결과</h2>
  <p class="text-gray-400">
    {s.round}라운드 종료 —
    <span class="text-white font-semibold">{winners.map((w) => w.nickname).join(", ")}</span>
    님 우승!
  </p>

  <ol class="max-w-md mx-auto space-y-2">
    {#each ranked as p (p.id)}
      <li class="flex items-center gap-3 px-4 py-3 rounded-xl
                 {p.place === 1 ? 'bg-gradient-to-r from-primary/30 to-secondary/30 border border-primary/50' : 'bg-gray-800'}
                 {p.id === game.mySessionId ? 'ring-1 ring-primary/60' : ''}">
        <span class="w-8 text-center font-bold">{medal[p.place - 1] ?? p.place}</span>
        <span class="flex-1 truncate text-left">
          {p.nickname}
          {#if p.id === game.mySessionId}<span class="text-xs text-primary">(나)</span>{/if}
        </span>
        <span class="w-10 text-right text-xl font-bold font-mono">{p.score}</span>
      </li>
    {/each}
  </ol>

  {#if isHost()}
    <button onclick={() => send("next-round")}
            class="px-8 py-4 bg-gray-700 hover:bg-gray-600 rounded-xl font-bold">
      대기실로 돌아가기
    </button>
  {:else}
    <p class="text-gray-400">호스트가 대기실로 돌아가기를 기다리는 중…</p>
  {/if}

  <div class="pt-4"><Feedback roomId={game.room?.roomId ?? ""} /></div>
</div>
