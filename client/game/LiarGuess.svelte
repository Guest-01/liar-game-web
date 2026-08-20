<script lang="ts">
  import { game, me, nicknameOf, send } from "../lib/connection.svelte.js";
  import { GUESS_MAX } from "../../shared/constants.js";
  import Timer from "./Timer.svelte";

  let text = $state("");
  const s = $derived(game.snapshot!);
  // 이 시점에 처형된 피고가 라이어임이 확정되었다. 라이어 본인만 amILiar를 안다.
  const amLiar = $derived(me()?.amILiar === true || s.defendantId === game.mySessionId);

  function submit(e: Event) {
    e.preventDefault();
    if (!text.trim()) return;
    send("liar-guess", { text: text.trim() });
  }
</script>

<div class="text-center py-8 space-y-6">
  <div class="flex items-center justify-center gap-4">
    <h2 class="text-2xl font-bold">정답 맞추기</h2>
    <Timer />
  </div>

  <div class="bg-success/20 border border-success rounded-xl p-4">
    <p class="font-bold text-success">{nicknameOf(s.defendantId)}님은 라이어가 맞았습니다!</p>
  </div>

  {#if amLiar}
    <form onsubmit={submit} class="bg-gray-800 rounded-xl p-8 max-w-md mx-auto">
      <p class="text-gray-400 mb-4">시민들의 제시어를 맞추면 역전승입니다</p>
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={text} maxlength={GUESS_MAX} autofocus placeholder="제시어를 입력하세요"
             class="w-full px-4 py-3 bg-gray-700 rounded-lg mb-4 text-center text-xl outline-hidden focus:ring-2 focus:ring-primary" />
      <button type="submit" class="px-8 py-3 bg-primary rounded-lg font-bold">제출</button>
    </form>
  {:else}
    <p class="text-gray-400">라이어가 정답을 맞추는 중…</p>
  {/if}
</div>
