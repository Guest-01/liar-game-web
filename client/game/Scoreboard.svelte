<script lang="ts">
  import { game, isHost, playerList, send } from "../lib/connection.svelte.js";
  import { SCORE_RULES, explainRoundDelta, isMatchOver, rank } from "../../shared/rules.js";

  const s = $derived(game.snapshot!);
  const voided = $derived(s.roundEndReason === "voided");
  const ranked = $derived(rank(playerList()));
  // "왜 +N인가" — 라운드 결과에서 이미 공개된 라이어 정체와 승자로 역산한다
  const reasons = (p: { id: string; roundDelta: number }) =>
    voided ? [] : explainRoundDelta({
      delta: p.roundDelta,
      isLiar: p.id === s.revealedLiarId,
      winner: s.roundWinner,
    });
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
        <span class="flex-1 min-w-0">
          <span class="block truncate">
            {p.nickname}
            {#if p.id === game.mySessionId}<span class="text-xs text-primary">(나)</span>{/if}
          </span>
          {#if reasons(p).length > 0}
            <span class="block text-xs text-gray-400 truncate">
              {reasons(p).map((r) => `${r.label} +${r.points}`).join(" · ")}
            </span>
          {/if}
        </span>
        {#if p.roundDelta > 0}
          <span class="text-success text-sm font-semibold tabular-nums">+{p.roundDelta}</span>
        {/if}
        <span class="w-10 text-right text-xl font-bold tabular-nums">{p.score}</span>
      </li>
    {/each}
  </ol>

  <!-- 점수 기준. 결과만 보여주면 왜 누구는 +2이고 누구는 0인지 알 수 없다 -->
  <dl class="max-w-md mx-auto px-4 py-3 rounded-xl bg-gray-800/50 text-xs text-gray-400 space-y-1">
    <dt class="font-semibold text-gray-300 mb-1">점수 기준</dt>
    {#each SCORE_RULES as r (r.label)}
      <dd class="flex justify-between gap-3">
        <span>{r.label}</span><span class="tabular-nums text-gray-300">+{r.points}</span>
      </dd>
    {/each}
  </dl>

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
