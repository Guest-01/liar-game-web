<script lang="ts">
  /**
   * 페이즈 진행 바 — 헤더 바로 아래에서 남은 시간을 채운다.
   * 오른쪽 위 타이머 알약은 작아서 15초짜리 페이즈에서는 눈에 잘 안 띈다.
   */
  import { game } from "../lib/connection.svelte.js";

  const total = $derived(game.snapshot?.phaseEndsAt ?? 0);
  const pct = $derived(total > 0 ? Math.max(0, Math.min(100, (game.remainingMs / total) * 100)) : 0);
  // 2.8초짜리 연출 페이즈까지 빨갛게 하면 늘 빨갛다. 10초 이상인 페이즈에서만 경고한다.
  const warning = $derived(total >= 10_000 && game.remainingMs > 0 && game.remainingMs <= 5000);
  const paused = $derived(game.snapshot?.isPaused ?? false);
</script>

{#if total > 0}
  <div class="h-1 bg-gray-800" role="progressbar" aria-valuemin={0} aria-valuemax={100}
       aria-valuenow={Math.round(pct)} aria-label="남은 시간">
    <div class="h-full transition-[width] duration-200 ease-linear
                {warning ? 'bg-danger' : paused ? 'bg-warning' : 'bg-primary'}"
         style="width: {pct}%"></div>
  </div>
{/if}
