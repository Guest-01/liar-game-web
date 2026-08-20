<script lang="ts">
  import { navigate } from "../router.js";
  import { getNickname, isValidNickname, setNickname } from "../lib/session.js";
  import { createRoom, game } from "../lib/connection.svelte.js";
  import { ROOM_NAME_MAX } from "../../shared/constants.js";
  import { toast } from "../ui/toast.svelte.js";

  let roomName = $state("");
  let isPublic = $state(true);
  let password = $state("");
  let busy = $state(false);

  async function submit(e: Event) {
    e.preventDefault();
    const nickname = getNickname();
    if (!isValidNickname(nickname)) { toast("닉네임을 먼저 정해주세요", "error"); navigate("/"); return; }
    if (!roomName.trim()) { toast("방 이름을 입력하세요", "error"); return; }
    if (!isPublic && !password) { toast("비공개 방은 비밀번호가 필요합니다", "error"); return; }

    busy = true;
    setNickname(nickname);
    try {
      const roomId = await createRoom({
        nickname, roomName: roomName.trim(), isPublic,
        password: isPublic ? undefined : password,
      });
      navigate(`/room/${roomId}`);
    } catch {
      toast(game.error || "방을 만들 수 없습니다", "error");
      busy = false;
    }
  }
</script>

<main class="container mx-auto px-4 py-8 max-w-lg">
  <button onclick={() => navigate("/")} class="text-gray-400 hover:text-white mb-8 transition-colors">← 로비로 돌아가기</button>

  <div class="bg-gray-800 rounded-2xl p-8 shadow-xl">
    <h1 class="text-3xl font-bold text-center mb-8">방 만들기</h1>
    <form onsubmit={submit} class="space-y-6">
      <div>
        <label for="rn" class="block text-sm font-medium text-gray-300 mb-2">방 이름</label>
        <input id="rn" bind:value={roomName} maxlength={ROOM_NAME_MAX} required
               placeholder="방 이름을 입력하세요"
               class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg outline-hidden focus:ring-2 focus:ring-primary" />
      </div>

      <div>
        <span class="block text-sm font-medium text-gray-300 mb-2">공개 설정</span>
        <div class="flex gap-4">
          <button type="button" onclick={() => (isPublic = true)}
                  class="flex-1 p-4 rounded-lg transition-all {isPublic ? 'bg-primary ring-2 ring-primary/50' : 'bg-gray-700'}">🌐 공개</button>
          <button type="button" onclick={() => (isPublic = false)}
                  class="flex-1 p-4 rounded-lg transition-all {!isPublic ? 'bg-primary ring-2 ring-primary/50' : 'bg-gray-700'}">🔒 비공개</button>
        </div>
      </div>

      {#if !isPublic}
        <div>
          <label for="pw" class="block text-sm font-medium text-gray-300 mb-2">비밀번호</label>
          <input id="pw" type="password" bind:value={password} maxlength="20" autocomplete="new-password"
                 class="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg outline-hidden focus:ring-2 focus:ring-primary" />
          <p class="text-xs text-gray-500 mt-1">참가자가 방에 들어올 때 입력해야 합니다</p>
        </div>
      {/if}

      <p class="text-sm text-gray-400 text-center">게임 설정은 대기실에서 변경할 수 있습니다</p>

      <button type="submit" disabled={busy}
              class="w-full py-4 bg-gradient-to-r from-primary to-secondary rounded-lg font-bold text-lg disabled:opacity-50">
        {busy ? "생성 중..." : "방 만들기"}
      </button>
    </form>
  </div>
</main>
