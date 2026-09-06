<script lang="ts">
  /**
   * 헤더의 제시어 — **누르고 있는 동안만** 보인다.
   *
   * 제시어 확인 화면은 "탭하여 확인"으로 옆 사람이 못 보게 가리는데, 그 뒤 헤더에
   * 상시 노출되면 처음 가린 의미가 없다. 같은 자리에서 노는 파티나 화면 공유를
   * 생각하면 라운드 내내 가려야 한다. 라이어 여부도 같은 이유로 같은 버튼 뒤에 둔다.
   * 키보드로는 Enter/Space로 토글한다.
   */
  import { me } from "../lib/connection.svelte.js";
  import Eye from "@lucide/svelte/icons/eye";
  import EyeOff from "@lucide/svelte/icons/eye-off";

  let peek = $state(false);
  const my = $derived(me());
  const hasSecret = $derived(!!my && (my.amILiar === true || !!my.myWord));

  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); peek = !peek; }
  }
</script>

{#if hasSecret}
  <button class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm select-none touch-none
                 {peek ? (my?.amILiar ? 'bg-danger/20 text-danger' : 'bg-primary/20 text-primary') : 'bg-gray-800 text-gray-300'}"
          onpointerdown={() => (peek = true)}
          onpointerup={() => (peek = false)}
          onpointercancel={() => (peek = false)}
          onpointerleave={() => (peek = false)}
          onkeydown={onKey}
          oncontextmenu={(e) => e.preventDefault()}
          aria-pressed={peek}
          title="누르고 있는 동안 제시어가 보입니다">
    {#if peek}
      <Eye class="w-4 h-4" />
      {#if my?.amILiar}
        <span class="font-semibold">당신은 라이어</span>
      {:else}
        <span>제시어: <span class="font-semibold">{my?.myWord}</span></span>
      {/if}
    {:else}
      <EyeOff class="w-4 h-4" />
      <span>제시어 보기</span>
    {/if}
  </button>
{/if}
