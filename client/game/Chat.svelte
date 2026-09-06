<script lang="ts">
  import { game } from "../lib/connection.svelte.js";
  import ChatInput from "./ChatInput.svelte";

  let box = $state<HTMLDivElement | null>(null);
  const messages = $derived(game.snapshot?.chat ?? []);

  $effect(() => {
    void messages.length;
    if (box) box.scrollTop = box.scrollHeight;
  });
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
  <ChatInput />
</div>
