<script lang="ts">
  import { game } from "../lib/connection.svelte.js";
  import TimerIcon from "@lucide/svelte/icons/timer";

  const seconds = $derived(Math.ceil(game.remainingMs / 1000));
  const warning = $derived(seconds <= 5 && seconds > 0);
  const label = $derived(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`);
</script>

{#if game.snapshot && game.snapshot.phaseEndsAt > 0}
  <div class="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 rounded-full">
    <TimerIcon class="w-4 h-4 text-gray-400" />
    <span class="text-xl font-bold tabular-nums" class:timer-warning={warning}>{label}</span>
  </div>
{/if}
