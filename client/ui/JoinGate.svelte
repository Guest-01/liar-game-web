<script lang="ts">
  /**
   * 초대 링크로 들어온 사람의 입장 화면.
   *
   * 링크는 로비를 거치지 않으므로 로비가 하던 일을 여기서 한다.
   * - 처음 온 사람은 닉네임을 정할 기회가 없었다 (무작위 닉네임으로 곧장 입장했다)
   * - 비공개 방은 비밀번호를 묻지 않고 참가를 시도해, 입력한 적도 없는데
   *   "비밀번호가 틀렸습니다"와 함께 로비로 튕겼다
   * 서버가 거절하면(비밀번호 오류·닉네임 중복·정원) 이 화면에 머물며 사유를 보인다.
   */
  import type { LobbyRoom } from "../../shared/snapshot.js";
  import { NICKNAME_MAX } from "../../shared/constants.js";
  import { generateRandomNickname } from "../../shared/nicknames.js";
  import Lock from "@lucide/svelte/icons/lock";
  import Eye from "@lucide/svelte/icons/eye";
  import Shuffle from "@lucide/svelte/icons/shuffle";

  let {
    room, nickname: initialNickname, error = "", busy = false, onsubmit, oncancel,
  }: {
    room: LobbyRoom;
    nickname: string;
    error?: string;
    busy?: boolean;
    onsubmit: (nickname: string, password: string | undefined) => void;
    oncancel: () => void;
  } = $props();

  // 초깃값만 받는다 — 이후로는 사용자가 고친다
  // svelte-ignore state_referenced_locally
  let nickname = $state(initialNickname);
  let password = $state("");

  function submit(e: Event) {
    e.preventDefault();
    onsubmit(nickname.trim(), room.isPublic ? undefined : password);
  }
</script>

<div class="fixed inset-0 flex items-center justify-center p-4">
  <form onsubmit={submit} class="bg-gray-800 rounded-2xl p-6 max-w-sm w-full space-y-4">
    <div>
      <p class="text-sm text-gray-400">라이어 게임에 초대되었습니다</p>
      <h2 class="text-xl font-bold mt-1 flex items-center gap-2">
        {#if !room.isPublic}<Lock class="w-5 h-5 text-yellow-400 shrink-0" aria-label="비공개" />{/if}
        <span class="truncate">{room.name}</span>
      </h2>
      <p class="text-xs text-gray-500 mt-1 tabular-nums">
        {room.playerCount}/{room.maxPlayers}명
        {#if room.inProgress}
          · <span class="text-secondary inline-flex items-center gap-1"><Eye class="w-3 h-3" />게임 중 — 관전으로 들어가 다음 라운드부터 참여합니다</span>
        {/if}
      </p>
    </div>

    <label class="block">
      <span class="text-sm text-gray-400">닉네임</span>
      <span class="mt-1 flex gap-2">
        <!-- svelte-ignore a11y_autofocus -->
        <input bind:value={nickname} maxlength={NICKNAME_MAX} autofocus={room.isPublic}
               class="flex-1 min-w-0 px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg outline-hidden focus:ring-2 focus:ring-primary" />
        <button type="button" onclick={() => (nickname = generateRandomNickname())}
                title="랜덤 닉네임" aria-label="랜덤 닉네임"
                class="px-3 bg-gray-700 hover:bg-gray-600 rounded-lg"><Shuffle class="w-5 h-5" /></button>
      </span>
    </label>

    {#if !room.isPublic}
      <label class="block">
        <span class="text-sm text-gray-400">비밀번호</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input type="password" bind:value={password} autocomplete="new-password" autofocus
               placeholder="방장에게 받은 비밀번호"
               class="mt-1 w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg outline-hidden focus:ring-2 focus:ring-primary" />
      </label>
    {/if}

    {#if error}<p class="text-sm text-danger" role="alert">{error}</p>{/if}

    <div class="flex gap-2">
      <button type="button" onclick={oncancel} class="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold">로비로</button>
      <button type="submit" disabled={busy}
              class="flex-1 py-3 bg-primary hover:bg-primary/80 disabled:opacity-50 rounded-lg font-semibold">
        {busy ? "들어가는 중…" : room.inProgress ? "관전하기" : "참가"}
      </button>
    </div>
  </form>
</div>
