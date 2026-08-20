<script lang="ts">
  import { amSpectator } from "../lib/connection.svelte.js";
</script>

{#if amSpectator()}
  <div class="bg-secondary/25 border-b border-secondary px-4 py-2.5 text-center text-sm">
    <span class="font-semibold">👁 관전 중</span>
    <span class="text-gray-300 ml-2">다음 라운드부터 참여합니다 · 제시어는 보이지 않습니다</span>
  </div>
{/if}
