<script lang="ts">
  import { amSpectator, game, send } from "../lib/connection.svelte.js";
  import { CHAT_MAX } from "../../shared/constants.js";

  let text = $state("");
  let box = $state<HTMLDivElement | null>(null);

  const messages = $derived(game.snapshot?.chat ?? []);
  const isDefense = $derived(game.snapshot?.phase === "defense");
  const canSpeak = $derived(
    !amSpectator() && (!isDefense || game.snapshot?.defendantId === game.mySessionId),
  );
  const reason = $derived(
    amSpectator() ? "관전 중에는 채팅할 수 없습니다"
    : isDefense ? "최후 변론 중에는 피고만 발언할 수 있습니다"
    : "메시지 입력…",
  );

  $effect(() => {
    void messages.length;
    if (box) box.scrollTop = box.scrollHeight;
  });

  function submit(e: Event) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    send("chat", { text: t });
    text = "";
  }
</script>

<div class="bg-gray-800 rounded-xl flex flex-col h-full min-h-0">
  <div bind:this={box} class="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
    {#each messages as m (m.id)}
      {#if m.senderId === ""}
        <p class="text-xs text-gray-500 text-center italic">{m.text}</p>
      {:else}
        <p class="text-sm break-words">
          <span class="font-semibold" class:text-primary={m.senderId === game.mySessionId}>{m.nickname}</span>
          <span class="text-gray-300">{m.text}</span>
        </p>
      {/if}
    {/each}
  </div>

  <form onsubmit={submit} class="p-3 border-t border-gray-700 flex gap-2">
    <input bind:value={text} maxlength={CHAT_MAX} disabled={!canSpeak}
           placeholder={reason}
           class="flex-1 min-w-0 px-3 py-2 bg-gray-700 rounded-lg outline-hidden focus:ring-2 focus:ring-primary disabled:opacity-50" />
    <button type="submit" disabled={!canSpeak}
            class="px-4 py-2 bg-primary rounded-lg font-semibold disabled:opacity-50">전송</button>
  </form>
</div>
