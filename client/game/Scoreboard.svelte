<script lang="ts">
  import { game, isHost, playerList, send } from "../lib/connection.svelte.js";
  import { isMatchOver, rank } from "../../shared/rules.js";

  const s = $derived(game.snapshot!);
  const voided = $derived(s.roundEndReason === "voided");
  const ranked = $derived(rank(playerList()));
  const matchOver = $derived(!voided && isMatchOver(s.round, s.totalRounds));

  const label = $derived(
    voided ? "라운드 다시 시작"
    : matchOver ? "최종 결과 보기"
    : `${s.round + 1}라운드 시작`,
  );
</script>

<div class="py-8 space-y-6">
  <div class="text-center">
    <h2 class="text-2xl font-bold">점수판</h2>
    <p class="text-sm text-gray-400 mt-1">
      {#if voided}
        무효 라운드 — 점수 변동 없음 (라운드 수를 소모하지 않습니다)
      {:else if s.totalRounds > 0}
        {s.round} / {s.totalRounds} 라운드
      {:else}
        {s.round}라운드 완료 · 무제한 매치
      {/if}
    </p>
  </div>

  <ol class="max-w-md mx-auto space-y-2">
    {#each ranked as p (p.id)}
      <li class="flex items-center gap-3 px-4 py-3 rounded-xl
                 {p.id === game.mySessionId ? 'bg-primary/20 border border-primary/40' : 'bg-gray-800'}">
        <span class="w-8 text-center font-bold text-gray-400">{p.place}</span>
        <span class="flex-1 truncate">
          {p.nickname}
          {#if p.id === game.mySessionId}<span class="text-xs text-primary">(나)</span>{/if}
        </span>
        {#if p.roundDelta > 0}
          <span class="text-success text-sm font-semibold">+{p.roundDelta}</span>
        {/if}
        <span class="w-10 text-right text-xl font-bold font-mono">{p.score}</span>
      </li>
    {/each}
  </ol>

  <div class="text-center">
    {#if isHost()}
      <button onclick={() => send("next-round")}
              class="px-8 py-4 bg-gradient-to-r from-primary to-secondary rounded-xl font-bold">
        {label}
      </button>
    {:else}
      <p class="text-gray-400">호스트가 다음으로 넘기기를 기다리는 중…</p>
    {/if}
  </div>
</div>
