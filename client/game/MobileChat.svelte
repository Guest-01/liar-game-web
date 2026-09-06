<script lang="ts">
  /**
   * 모바일 채팅 — 화면 하단 고정.
   *
   * 2단 레이아웃은 폰에서 채팅을 게임 영역 **아래**로 밀어낸다. 토론은 채팅으로 하는
   * 게임이라 지목 목록과 채팅이 동시에 보여야 한다. 접힌 상태에서는 최근 메시지
   * 두 줄과 입력창만 차지하고, 미리보기를 누르면 시트가 올라와 전체 대화를 보여준다.
   * (v1에도 하단 슬라이드 패널이 있었다. 이식에서 빠졌던 것을 다른 형태로 되살린다.)
   */
  import { game } from "../lib/connection.svelte.js";
  import Chat from "./Chat.svelte";
  import ChatInput from "./ChatInput.svelte";
  import ChevronUp from "@lucide/svelte/icons/chevron-up";
  import X from "@lucide/svelte/icons/x";

  let open = $state(false);
  const messages = $derived(game.snapshot?.chat ?? []);
  const preview = $derived(messages.slice(-2));
</script>

{#if open}
  <!-- 시트 뒤 배경. 누르면 닫힌다. -->
  <button class="fixed inset-0 z-30 bg-black/50 lg:hidden" aria-label="채팅 닫기"
          onclick={() => (open = false)}></button>
  <div class="fixed inset-x-0 bottom-0 z-40 lg:hidden h-[70vh] flex flex-col rounded-t-2xl bg-gray-800 shadow-2xl fade-in"
       role="dialog" aria-label="채팅">
    <div class="flex items-center justify-between px-4 py-2 border-b border-gray-700">
      <span class="font-semibold text-sm">채팅</span>
      <button onclick={() => (open = false)} aria-label="닫기" class="p-1 text-gray-400 hover:text-white">
        <X class="w-5 h-5" />
      </button>
    </div>
    <div class="flex-1 min-h-0"><Chat /></div>
  </div>
{:else}
  <div class="fixed inset-x-0 bottom-0 z-30 lg:hidden bg-gray-800/95 backdrop-blur border-t border-gray-700 px-3 pt-2 pb-3 space-y-2"
       style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom))">
    <button onclick={() => (open = true)} aria-label="채팅 열기"
            class="w-full text-left flex items-center gap-2">
      <div class="flex-1 min-w-0 space-y-0.5">
        {#if preview.length === 0}
          <p class="text-xs text-gray-500">아직 대화가 없습니다</p>
        {:else}
          {#each preview as m (m.id)}
            <p class="text-xs truncate {m.senderId === '' ? 'text-gray-500 italic' : 'text-gray-300'}">
              {#if m.senderId !== ""}<span class="font-semibold text-gray-200">{m.nickname}</span> {/if}{m.text}
            </p>
          {/each}
        {/if}
      </div>
      <ChevronUp class="w-5 h-5 text-gray-500 shrink-0" />
    </button>
    <ChatInput compact />
  </div>
{/if}
