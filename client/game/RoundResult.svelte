<script lang="ts">
  import { game, isHost, nicknameOf, send } from "../lib/connection.svelte.js";

  const s = $derived(game.snapshot!);
  const voided = $derived(s.roundEndReason === "voided");

  const reasonText: Record<string, string> = {
    "liar-executed-wrong-guess": "라이어를 잡았고 정답도 막았습니다",
    "liar-executed-right-guess": "라이어가 제시어를 맞춰 역전했습니다",
    "citizen-executed": "시민을 처형했습니다",
    "chances-exhausted": "기회를 모두 소진했습니다",
    "voided": "라운드가 무효 처리되었습니다",
  };
</script>

<div class="text-center py-8 space-y-6">
  <h2 class="text-3xl font-bold">
    {#if voided}라운드 무효
    {:else if s.roundWinner === "citizen"}🎉 시민 승리!
    {:else}🎭 라이어 승리!{/if}
  </h2>
  <p class="text-gray-400">{reasonText[s.roundEndReason] ?? ""}</p>

  <div class="bg-gray-800 rounded-xl p-8 max-w-md mx-auto flex flex-col gap-4">
    <div>
      <p class="text-gray-400 text-sm">라이어</p>
      <p class="text-2xl font-bold text-danger">{nicknameOf(s.revealedLiarId)}</p>
    </div>
    <div class="border-t border-gray-700 pt-4">
      <p class="text-gray-400 text-sm">시민 제시어</p>
      <p class="text-2xl font-bold text-primary">{s.revealedCitizenWord}</p>
    </div>
    {#if s.revealedLiarWord}
      <div class="border-t border-gray-700 pt-4">
        <p class="text-gray-400 text-sm">라이어 제시어</p>
        <p class="text-2xl font-bold text-secondary">{s.revealedLiarWord}</p>
      </div>
    {/if}
    {#if s.liarGuess}
      <div class="border-t border-gray-700 pt-4">
        <p class="text-gray-400 text-sm">라이어가 추측한 답</p>
        <p class="text-xl">{s.liarGuess}</p>
      </div>
    {/if}
  </div>

  {#if isHost()}
    <button onclick={() => send("next-round")}
            class="px-8 py-4 bg-gradient-to-r from-primary to-secondary rounded-xl font-bold">점수판 보기</button>
  {:else}
    <p class="text-gray-400">호스트가 넘기기를 기다리는 중…</p>
  {/if}
</div>
