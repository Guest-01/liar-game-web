<script lang="ts">
  /**
   * 인앱 피드백. 서버가 웹훅을 검증한 뒤에만 노출된다(`/api/config`).
   * 사용자가 "일주일간 보지 않기"를 선택하면 그동안 감춘다.
   */
  import { toast } from "./toast.svelte.js";
  import MessageCircle from "@lucide/svelte/icons/message-circle";

  let { roomId = "" }: { roomId?: string } = $props();

  const HIDE_KEY = "feedbackHiddenUntil";
  const WEEK = 7 * 24 * 60 * 60 * 1000;

  let available = $state(false);
  let open = $state(false);
  let hidden = $state(Date.now() < Number(localStorage.getItem(HIDE_KEY) ?? 0));
  let sentiment = $state<"good" | "neutral" | "bad">("neutral");
  let message = $state("");
  let sending = $state(false);
  let sent = $state(false);

  $effect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => { available = !!d.feedbackEnabled; })
      .catch(() => { available = false; });
  });

  function hideForAWeek() {
    localStorage.setItem(HIDE_KEY, String(Date.now() + WEEK));
    hidden = true;
    open = false;
  }

  async function submit() {
    sending = true;
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sentiment,
          message: message.trim() || undefined,
          roomId: roomId || undefined,
          nickname: localStorage.getItem("nickname") ?? undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        sent = true;
        localStorage.setItem(HIDE_KEY, String(Date.now() + WEEK));
      } else {
        toast(data.error ?? "전송에 실패했습니다", "error");
      }
    } catch {
      toast("전송에 실패했습니다", "error");
    }
    sending = false;
  }
</script>

{#if available && !hidden}
  <button onclick={() => (open = true)}
          class="text-xs text-gray-500 hover:text-gray-300 transition-colors inline-flex items-center gap-1">
    <MessageCircle class="w-3.5 h-3.5" />피드백
  </button>
{/if}

{#if open}
  <div class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
    <div class="bg-gray-800 rounded-2xl p-8 max-w-md w-full">
      {#if sent}
        <div class="text-center py-4">
          <p class="text-3xl mb-2">🙏</p>
          <p class="text-lg font-semibold text-success">감사합니다!</p>
          <button onclick={() => { open = false; hidden = true; }}
                  class="mt-4 px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg">닫기</button>
        </div>
      {:else}
        <h2 class="text-xl font-bold mb-4 flex items-center gap-2">
          <MessageCircle class="w-5 h-5 text-primary" />피드백 보내기
        </h2>
        <p class="text-gray-400 text-sm mb-4">게임에 대한 의견을 들려주세요!</p>

        <div class="flex justify-center gap-4 mb-4">
          {#each [["bad", "😞", "ring-red-500"], ["neutral", "😐", "ring-yellow-500"], ["good", "😊", "ring-green-500"]] as [v, emoji, ring] (v)}
            <button onclick={() => (sentiment = v as typeof sentiment)}
                    class="text-3xl p-3 rounded-xl transition-all hover:bg-gray-700
                           {sentiment === v ? `ring-2 ${ring} bg-gray-700` : ''}">{emoji}</button>
          {/each}
        </div>

        <textarea bind:value={message} maxlength="500" rows="3"
                  placeholder="의견이 있으시면 적어주세요 (선택사항)"
                  class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg outline-hidden
                         focus:ring-2 focus:ring-primary resize-none mb-4"></textarea>

        <div class="flex gap-2">
          <button onclick={() => (open = false)}
                  class="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold">닫기</button>
          <button onclick={submit} disabled={sending}
                  class="flex-1 py-3 bg-primary hover:bg-primary/80 rounded-lg font-semibold disabled:opacity-50">
            {sending ? "전송 중…" : "보내기"}
          </button>
        </div>
        <button onclick={hideForAWeek}
                class="w-full mt-3 text-xs text-gray-500 hover:text-gray-400">일주일간 보지 않기</button>
      {/if}
    </div>
  </div>
{/if}
