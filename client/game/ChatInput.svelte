<script lang="ts">
  /**
   * 채팅 입력 폼. 데스크톱 패널(Chat)과 모바일 하단 바(MobileChat)가 같이 쓴다.
   * "누가 말할 수 있는가"의 판단이 한 곳에만 있어야 두 화면이 어긋나지 않는다.
   */
  import { amSpectator, game, send } from "../lib/connection.svelte.js";
  import { CHAT_MAX } from "../../shared/constants.js";
  import Send from "@lucide/svelte/icons/send";

  let { compact = false }: { compact?: boolean } = $props();

  let text = $state("");
  const isDefense = $derived(game.snapshot?.phase === "defense");
  const canSpeak = $derived(
    !amSpectator() && (!isDefense || game.snapshot?.defendantId === game.mySessionId),
  );
  const reason = $derived(
    amSpectator() ? "관전 중에는 채팅할 수 없습니다"
    : isDefense ? "최후 변론 중에는 피고만 발언할 수 있습니다"
    : "메시지 입력…",
  );

  function submit(e: Event) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    send("chat", { text: t });
    text = "";
  }
</script>

<form onsubmit={submit} class="flex gap-2 {compact ? '' : 'p-3 border-t border-gray-700'}">
  <input bind:value={text} maxlength={CHAT_MAX} disabled={!canSpeak}
         placeholder={reason} enterkeyhint="send"
         class="flex-1 min-w-0 px-3 py-2 bg-gray-700 rounded-lg outline-hidden focus:ring-2 focus:ring-primary disabled:opacity-50" />
  <button type="submit" disabled={!canSpeak} aria-label="전송" title="전송"
          class="px-4 py-2 bg-primary rounded-lg font-semibold disabled:opacity-50 inline-flex items-center gap-1.5">
    <Send class="w-4 h-4" /><span class="sr-only sm:not-sr-only">전송</span>
  </button>
</form>
