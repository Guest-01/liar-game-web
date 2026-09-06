<script lang="ts">
  import { navigate } from "../router.svelte.js";
  import {
    getNickname, getRulesOpen, isFirstVisit, isValidNickname, setNickname, setRulesOpen, stashPassword,
  } from "../lib/session.js";
  import { generateRandomNickname } from "../../shared/nicknames.js";
  import type { LobbyRoom } from "../../shared/snapshot.js";
  import { toast } from "../ui/toast.svelte.js";
  import Feedback from "../ui/Feedback.svelte";

  import Drama from "@lucide/svelte/icons/drama";
  import User from "@lucide/svelte/icons/user";
  import Shuffle from "@lucide/svelte/icons/shuffle";
  import Info from "@lucide/svelte/icons/info";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import List from "@lucide/svelte/icons/list";
  import Plus from "@lucide/svelte/icons/plus";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Lock from "@lucide/svelte/icons/lock";
  import Users from "@lucide/svelte/icons/users";
  import Target from "@lucide/svelte/icons/target";
  import Smile from "@lucide/svelte/icons/smile";
  import Folder from "@lucide/svelte/icons/folder";
  import Eye from "@lucide/svelte/icons/eye";
  import CircleHelp from "@lucide/svelte/icons/circle-help";

  // 게임 방법은 첫 방문에만 펼친다. getNickname()이 닉네임을 저장하므로 그 전에 판단한다.
  let rulesOpen = $state(getRulesOpen(isFirstVisit()));
  let nickname = $state(getNickname());
  let rooms = $state<LobbyRoom[]>([]);
  let loading = $state(false);
  let pwModal = $state<{ room: LobbyRoom; password: string } | null>(null);

  async function refresh() {
    loading = true;
    try {
      const res = await fetch("/api/rooms");
      rooms = (await res.json()).rooms;
    } catch { toast("방 목록을 가져오지 못했습니다", "error"); }
    loading = false;
  }

  $effect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  });

  function saveNick() {
    if (!isValidNickname(nickname)) { toast("닉네임은 2~10자여야 합니다", "error"); return false; }
    setNickname(nickname);
    return true;
  }

  function enter(room: LobbyRoom) {
    if (!saveNick()) return;
    if (!room.isPublic) { pwModal = { room, password: "" }; return; }
    navigate(`/room/${room.roomId}`);
  }

  function submitPassword() {
    if (!pwModal) return;
    stashPassword(pwModal.room.roomId, pwModal.password);
    const id = pwModal.room.roomId;
    pwModal = null;
    navigate(`/room/${id}`);
  }

  function onRulesToggle(e: Event) {
    rulesOpen = (e.currentTarget as HTMLDetailsElement).open;
    setRulesOpen(rulesOpen);
  }
</script>

<main class="container mx-auto px-4 py-8 max-w-6xl min-h-screen flex flex-col">
  <div class="lg:grid lg:grid-cols-5 lg:gap-8 flex-1">
    <div class="lg:col-span-2 mb-8 lg:mb-0">
      <header class="text-center lg:text-left mb-8">
        <!-- 글리치 연출의 ::before/::after가 제목을 두 번 더 복제하므로 접근성 이름을 고정한다 -->
        <h1 aria-label="라이어 게임" class="text-4xl font-bold mb-2 flex items-center justify-center lg:justify-start gap-3">
          <Drama class="w-10 h-10 text-primary shrink-0" />
          <span class="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent animate-glitch">라이어 게임</span>
        </h1>
        <p class="text-gray-400">누가 라이어인지 찾아내세요!</p>
      </header>

      <div class="bg-gray-800 rounded-xl p-4 border border-gray-700">
        <span class="flex items-center gap-2 text-gray-400 text-sm">
          <User class="w-4 h-4 text-primary" />내 닉네임
        </span>
        <div class="mt-3 flex items-center gap-2">
          <input bind:value={nickname} onblur={saveNick} maxlength="10"
                 class="flex-1 min-w-0 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg
                        focus:ring-2 focus:ring-primary outline-hidden text-lg font-semibold" />
          <button onclick={() => { nickname = generateRandomNickname(); saveNick(); }}
                  title="랜덤 닉네임" aria-label="랜덤 닉네임"
                  class="px-3 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors">
            <Shuffle class="w-5 h-5" />
          </button>
        </div>
      </div>

      <details open={rulesOpen} ontoggle={onRulesToggle}
               class="group mt-6 bg-gray-800/50 rounded-xl border border-gray-700/50">
        <summary class="flex items-center gap-2 p-4 font-semibold text-gray-300 select-none">
          <Info class="w-4 h-4" />
          <span class="flex-1">게임 방법</span>
          <ChevronDown class="w-4 h-4 text-gray-500 transition-transform group-open:rotate-180" />
        </summary>
        <ul class="px-4 pb-4 text-sm text-gray-400 space-y-1.5">
          <li>• 라이어를 제외한 모든 플레이어가 같은 제시어를 받습니다</li>
          <li>• 돌아가며 제시어를 설명하고, 토론으로 라이어를 찾으세요</li>
          <li>• 라이어가 들키면 시민 승리, 정답을 맞추면 라이어 역전!</li>
          <li class="pt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span class="inline-flex items-center gap-1"><Target class="w-3.5 h-3.5" />일반: 라이어는 제시어를 모릅니다</span>
            <span class="inline-flex items-center gap-1"><Smile class="w-3.5 h-3.5" />바보: 라이어도 비슷한 제시어를 받습니다</span>
          </li>
        </ul>
      </details>
    </div>

    <section class="lg:col-span-3">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-bold flex items-center gap-2"><List class="w-5 h-5" />방 목록</h2>
        <div class="flex items-center gap-2">
          <button onclick={() => saveNick() && navigate("/create")}
                  class="px-3 py-2 bg-primary hover:bg-primary/80 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5">
            <Plus class="w-4 h-4" />방 만들기
          </button>
          <button onclick={refresh} aria-label="새로고침" title="새로고침"
                  class="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm inline-flex items-center gap-1.5">
            <RefreshCw class="w-4 h-4 {loading ? 'animate-spin' : ''}" />
            <span class="hidden sm:inline">새로고침</span>
          </button>
        </div>
      </div>

      {#if rooms.length === 0}
        <div class="bg-gray-800/50 rounded-xl border border-gray-700/50 py-16 text-center text-gray-500">
          <CircleHelp class="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p class="font-medium">아직 열린 방이 없습니다</p>
          <p class="text-sm mt-1">첫 번째로 방을 만들어보세요!</p>
        </div>
      {:else}
        <div class="space-y-3">
          {#each rooms as room (room.roomId)}
            <div class="bg-gray-800 rounded-xl p-4 border border-gray-700 flex justify-between items-center gap-4">
              <div class="min-w-0 flex-1">
                <h3 class="font-semibold truncate flex items-center gap-2">
                  {#if !room.isPublic}<Lock class="w-4 h-4 text-yellow-400 shrink-0" aria-label="비공개" />{/if}
                  <span class="truncate">{room.name}</span>
                  {#if room.canSpectate}
                    <span class="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary/30 text-secondary text-xs font-medium">
                      <Eye class="w-3 h-3" />관전 가능
                    </span>
                  {/if}
                </h3>
                <div class="flex flex-wrap gap-x-3 mt-1.5 text-xs text-gray-400">
                  <span class="inline-flex items-center gap-1"><Users class="w-3.5 h-3.5" />{room.playerCount}/{room.maxPlayers}명</span>
                  <span class="inline-flex items-center gap-1">
                    {#if room.gameMode === "normal"}<Target class="w-3.5 h-3.5" />일반{:else}<Smile class="w-3.5 h-3.5" />바보{/if}
                  </span>
                  <span class="inline-flex items-center gap-1"><Folder class="w-3.5 h-3.5" />{room.category}</span>
                </div>
              </div>
              <button onclick={() => enter(room)}
                      class="px-4 py-2 rounded-lg font-semibold text-sm shrink-0
                             {room.canSpectate ? 'bg-secondary hover:bg-secondary/80' : 'bg-primary hover:bg-primary/80'}">
                {room.canSpectate ? "관전하기" : "참가"}
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>

  <footer class="mt-6 pt-3 border-t border-gray-800 text-xs text-gray-500 flex items-center justify-center gap-3">
    <span>© 2026 Guest-01 · v2</span>
    <Feedback />
    <a href="https://github.com/Guest-01/liar-game-web" target="_blank" rel="noopener"
       class="hover:text-gray-300 transition-colors">GitHub</a>
  </footer>
</main>

{#if pwModal}
  <div class="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
    <div class="bg-gray-800 rounded-2xl p-6 max-w-sm w-full mx-4">
      <h3 class="text-xl font-bold mb-4 flex items-center gap-2">
        <Lock class="w-5 h-5 text-yellow-400" />{pwModal.room.name}
      </h3>
      <input type="password" bind:value={pwModal.password} autocomplete="new-password"
             placeholder="비밀번호"
             class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg mb-4 outline-hidden focus:ring-2 focus:ring-primary" />
      <div class="flex gap-2">
        <button onclick={() => (pwModal = null)} class="flex-1 py-3 bg-gray-700 rounded-lg font-semibold">취소</button>
        <button onclick={submitPassword} class="flex-1 py-3 bg-primary rounded-lg font-semibold">참가</button>
      </div>
    </div>
  </div>
{/if}
