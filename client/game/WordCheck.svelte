<script lang="ts">
  import { amSpectator, game, me, playerList, send } from "../lib/connection.svelte.js";

  let revealed = $state(false);
  const s = $derived(game.snapshot!);
  const my = $derived(me());
  const checkedCount = $derived(playerList().filter((p) => p.hasCheckedWord).length);
</script>

<div class="text-center py-12">
  {#if amSpectator()}
    <!-- 관전자에게는 제시어가 전송되지도 않는다. 화면에도 자리를 만들지 않는다. -->
    <h2 class="text-2xl font-bold mb-2">제시어 확인 중</h2>
    <p class="text-sm text-gray-400 mb-8">주제: <span class="text-white font-semibold">{s.category}</span></p>
    <p class="text-gray-400">참가자들이 제시어를 확인하고 있습니다 ({checkedCount}/{playerList().length})</p>
  {:else}
  <h2 class="text-2xl font-bold mb-2">당신의 제시어</h2>
  <p class="text-sm text-gray-400 mb-8">주제: <span class="text-white font-semibold">{s.category}</span></p>

  {#if !revealed}
    <!-- 탭해야 보인다: 어깨너머 방지 + 긴장감 (F9) -->
    <button onclick={() => (revealed = true)}
            class="px-12 py-8 bg-gray-800 rounded-2xl border-2 border-dashed border-gray-600 hover:bg-gray-750 transition-colors">
      <span class="text-gray-400">탭하여 확인</span>
    </button>
  {:else}
    <div class="fade-in space-y-6">
      {#if my?.amILiar}
        <div class="inline-block px-12 py-8 bg-danger/20 border border-danger rounded-2xl">
          <p class="text-4xl font-bold text-danger">당신은 라이어입니다</p>
          <p class="text-sm text-red-200 mt-2">제시어를 유추해서 설명하세요</p>
        </div>
      {:else}
        <div class="inline-block px-12 py-8 bg-gray-800 rounded-2xl">
          <p class="text-4xl font-bold text-primary">{my?.myWord}</p>
        </div>
      {/if}

      {#if !my?.hasCheckedWord}
        <div><button onclick={() => send("check-word")}
                     class="px-8 py-3 bg-primary hover:bg-primary/80 rounded-lg font-bold">확인 완료</button></div>
      {:else}
        <p class="text-gray-400">다른 참가자를 기다리는 중… ({checkedCount}/{playerList().length})</p>
      {/if}
    </div>
  {/if}
  {/if}
</div>
