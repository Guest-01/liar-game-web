<script lang="ts">
  import { amSpectator } from "../lib/connection.svelte.js";
  import Eye from "@lucide/svelte/icons/eye";
</script>

{#if amSpectator()}
  <div class="bg-secondary/25 border-b border-secondary px-4 py-2.5 text-center text-sm flex items-center justify-center gap-2">
    <Eye class="w-4 h-4 shrink-0" />
    <span class="font-semibold">관전 중</span>
    <span class="text-gray-300 ml-1">다음 라운드부터 참여합니다 · 제시어는 보이지 않습니다</span>
  </div>
{/if}
