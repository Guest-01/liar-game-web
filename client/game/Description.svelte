<script lang="ts">
  import { game, nicknameOf, playerList, send } from "../lib/connection.svelte.js";
  import { DESCRIPTION_MAX } from "../../shared/constants.js";
  import Timer from "./Timer.svelte";

  let text = $state("");
  const s = $derived(game.snapshot!);
  const currentId = $derived(s.descriptionOrder[s.currentDescriberIndex] ?? "");
  const myTurn = $derived(currentId === game.mySessionId);

  function submit(e: Event) {
    e.preventDefault();
    send("submit-description", { text: text.trim() });
    text = "";
  }
</script>

<div class="space-y-6">
  <div class="flex items-center justify-between">
    <h2 class="text-xl font-bold">한줄 설명</h2>
    <Timer />
  </div>

  <ol class="space-y-2">
    {#each s.descriptionOrder as id, i (id)}
      <li class="flex gap-3 items-start px-4 py-3 rounded-lg
                 {i === s.currentDescriberIndex ? 'bg-primary/20 pulse-border border' : 'bg-gray-800'}">
        <span class="text-gray-500 w-6 shrink-0">{i + 1}</span>
        <span class="font-semibold w-24 shrink-0 truncate">{nicknameOf(id)}</span>
        <span class="text-gray-300 flex-1 break-words">
          {playerList().find((p) => p.id === id)?.description || (i === s.currentDescriberIndex ? "말하는 중…" : "")}
        </span>
      </li>
    {/each}
  </ol>

  {#if myTurn}
    <form onsubmit={submit} class="flex gap-2">
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={text} maxlength={DESCRIPTION_MAX} autofocus
             placeholder="제시어를 한 줄로 설명하세요"
             class="flex-1 min-w-0 px-4 py-3 bg-gray-700 rounded-lg outline-hidden focus:ring-2 focus:ring-primary" />
      <button type="submit" class="px-6 py-3 bg-primary rounded-lg font-bold">제출</button>
    </form>
  {:else}
    <p class="text-center text-gray-400">{nicknameOf(currentId)}님의 차례입니다</p>
  {/if}
</div>
