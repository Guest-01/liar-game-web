<script lang="ts">
  import { navigate } from "../router.js";
  import { getNickname, isValidNickname, setNickname, stashPassword } from "../lib/session.js";
  import { generateRandomNickname } from "../../shared/nicknames.js";
  import type { LobbyRoom } from "../../shared/snapshot.js";
  import { toast } from "../ui/toast.svelte.js";

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
</script>

<main class="container mx-auto px-4 py-8 max-w-6xl min-h-screen flex flex-col">
  <div class="lg:grid lg:grid-cols-5 lg:gap-8 flex-1">
    <div class="lg:col-span-2 mb-8 lg:mb-0">
      <header class="text-center lg:text-left mb-8">
        <h1 class="text-4xl font-bold mb-2">
          <span class="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent animate-glitch">라이어 게임</span>
        </h1>
        <p class="text-gray-400">누가 라이어인지 찾아내세요!</p>
      </header>

      <div class="bg-gray-800 rounded-xl p-4 border border-gray-700">
        <span class="text-gray-400 text-sm">내 닉네임</span>
        <div class="mt-3 flex items-center gap-2">
          <input bind:value={nickname} onblur={saveNick} maxlength="10"
                 class="flex-1 min-w-0 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg
                        focus:ring-2 focus:ring-primary outline-hidden text-lg font-semibold" />
          <button onclick={() => { nickname = generateRandomNickname(); saveNick(); }}
                  title="랜덤 닉네임"
                  class="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors">🎲</button>
        </div>
      </div>

      <div class="mt-6 bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
        <h2 class="font-semibold text-gray-300 mb-2">게임 방법</h2>
        <ul class="text-sm text-gray-400 space-y-1.5">
          <li>• 라이어를 제외한 모든 플레이어가 같은 제시어를 받습니다</li>
          <li>• 돌아가며 제시어를 설명하고, 토론으로 라이어를 찾으세요</li>
          <li>• 라이어가 들키면 시민 승리, 정답을 맞추면 라이어 역전!</li>
        </ul>
      </div>
    </div>

    <section class="lg:col-span-3">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-bold">방 목록</h2>
        <div class="flex items-center gap-2">
          <button onclick={() => saveNick() && navigate("/create")}
                  class="px-3 py-2 bg-primary hover:bg-primary/80 rounded-lg text-sm font-semibold">방 만들기</button>
          <button onclick={refresh}
                  class="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm">
            {loading ? "…" : "새로고침"}
          </button>
        </div>
      </div>

      {#if rooms.length === 0}
        <div class="bg-gray-800/50 rounded-xl border border-gray-700/50 py-16 text-center text-gray-500">
          <p class="font-medium">아직 열린 방이 없습니다</p>
          <p class="text-sm mt-1">첫 번째로 방을 만들어보세요!</p>
        </div>
      {:else}
        <div class="space-y-3">
          {#each rooms as room (room.roomId)}
            <div class="bg-gray-800 rounded-xl p-4 border border-gray-700 flex justify-between items-center gap-4">
              <div class="min-w-0 flex-1">
                <h3 class="font-semibold truncate">
                  {#if !room.isPublic}<span title="비공개">🔒</span>{/if}
                  {room.name}
                </h3>
                <div class="flex flex-wrap gap-x-3 mt-1.5 text-xs text-gray-400">
                  <span>{room.playerCount}/{room.maxPlayers}명</span>
                  <span>{room.gameMode === "normal" ? "일반" : "바보"}</span>
                  <span>{room.category}</span>
                </div>
              </div>
              <button onclick={() => enter(room)}
                      class="px-4 py-2 bg-primary hover:bg-primary/80 rounded-lg font-semibold text-sm shrink-0">참가</button>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>

  <footer class="mt-6 pt-3 border-t border-gray-800 text-xs text-gray-500 text-center">
    © 2026 Guest-01 · v2
  </footer>
</main>

{#if pwModal}
  <div class="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
    <div class="bg-gray-800 rounded-2xl p-6 max-w-sm w-full mx-4">
      <h3 class="text-xl font-bold mb-4">🔒 {pwModal.room.name}</h3>
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
