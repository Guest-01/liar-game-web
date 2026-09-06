<script lang="ts">
  import { game } from "../lib/connection.svelte.js";
  import WifiOff from "@lucide/svelte/icons/wifi-off";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";

  let { onretry }: { onretry: () => void } = $props();
</script>

{#if game.connection === "reconnecting"}
  <div class="bg-warning/20 border-b border-warning px-4 py-2 flex items-center justify-center gap-2 text-sm"
       role="status">
    <RefreshCw class="w-4 h-4 text-warning animate-spin" />
    <span>연결이 끊겼습니다. 다시 연결하는 중…</span>
  </div>
{:else if game.connection === "lost"}
  <div class="bg-danger/20 border-b border-danger px-4 py-2 flex flex-wrap items-center justify-center gap-3 text-sm"
       role="alert">
    <WifiOff class="w-4 h-4 text-danger shrink-0" />
    <span>연결이 끊겼습니다. 아래 화면은 마지막으로 받은 상태입니다.</span>
    <button onclick={onretry} disabled={game.connecting}
            class="px-3 py-1.5 bg-danger hover:bg-danger/80 disabled:opacity-50 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5">
      <RefreshCw class="w-3.5 h-3.5 {game.connecting ? 'animate-spin' : ''}" />
      {game.connecting ? "연결 중…" : "다시 연결"}
    </button>
  </div>
{/if}
