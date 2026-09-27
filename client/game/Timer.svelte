<script lang="ts">
  import { game } from "../lib/connection.svelte.js";
  import { FX_PHASES } from "../../shared/types.js";
  import TimerIcon from "@lucide/svelte/icons/timer";

  const seconds = $derived(Math.ceil(game.remainingMs / 1000));
  const warning = $derived(seconds <= 5 && seconds > 0);
  const label = $derived(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`);
  // 연출 페이즈(설명 타이핑 등)의 남은 시간은 누구의 행동과도 무관하다. 보이지 않는다.
  const visible = $derived(
    !!game.snapshot && game.snapshot.phaseEndsAt > 0 && !FX_PHASES.has(game.snapshot.phase),
  );
</script>

{#if visible}
  <div class="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 rounded-full">
    <TimerIcon class="w-4 h-4 text-gray-400" />
    <span class="text-xl font-bold tabular-nums" class:timer-warning={warning}>{label}</span>
  </div>
{/if}
