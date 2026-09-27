<script lang="ts">
  import { game, isAttachedTo, joinRoom, leave } from "../lib/connection.svelte.js";
  import {
    clearPassword, getNickname, isFirstVisit, isValidNickname, loadReconnectToken, setNickname, takePassword,
  } from "../lib/session.js";
  import { generateRandomNickname } from "../../shared/nicknames.js";
  import type { LobbyRoom } from "../../shared/snapshot.js";
  import JoinGate from "../ui/JoinGate.svelte";
  import { navigate } from "../router.svelte.js";
  import { toast } from "../ui/toast.svelte.js";
  import { IN_ROUND_PHASES } from "../../shared/types.js";
  import { MediaQuery } from "svelte/reactivity";
  import LogOut from "@lucide/svelte/icons/log-out";

  // 채팅은 데스크톱 패널과 모바일 하단 바 중 **하나만** 렌더한다. CSS로만 숨기면
  // DOM에 입력창이 둘이라 접근성 트리와 테스트 셀렉터가 둘 다 헷갈린다.
  // 64rem은 Tailwind 4의 `lg` 분기점이다.
  const desktop = new MediaQuery("(min-width: 64rem)");

  import PlayerList from "../game/PlayerList.svelte";
  import Chat from "../game/Chat.svelte";
  import Waiting from "../game/Waiting.svelte";
  import WordCheck from "../game/WordCheck.svelte";
  import Description from "../game/Description.svelte";
  import Discussion from "../game/Discussion.svelte";
  import Defense from "../game/Defense.svelte";
  import FinalVote from "../game/FinalVote.svelte";
  import LiarGuess from "../game/LiarGuess.svelte";
  import RoundResult from "../game/RoundResult.svelte";
  import Scoreboard from "../game/Scoreboard.svelte";
  import MatchResult from "../game/MatchResult.svelte";
  import VoteReveal from "../game/VoteReveal.svelte";
  import OrderReveal from "../fx/OrderReveal.svelte";
  import PauseBanner from "../game/PauseBanner.svelte";
  import SpectatorBanner from "../game/SpectatorBanner.svelte";
  import ConnectionBanner from "../game/ConnectionBanner.svelte";
  import PhaseProgress from "../game/PhaseProgress.svelte";
  import PeekWord from "../game/PeekWord.svelte";
  import MobileChat from "../game/MobileChat.svelte";

  let { roomId }: { roomId: string } = $props();

  /**
   * 참가 전에 묻는 입장 화면(닉네임·비밀번호). null이면 곧장 참가한다.
   * 초대 링크는 로비를 거치지 않으므로, 로비가 하던 일(닉네임 정하기·비밀번호 묻기)을
   * 여기서 한다. 서버가 거절해도 로비로 튕기지 않고 이 화면에서 사유를 보인다.
   */
  let gate = $state<{ room: LobbyRoom; nickname: string; error: string; busy: boolean } | null>(null);

  async function fetchRoom(id: string): Promise<LobbyRoom | null> {
    try {
      const res = await fetch(`/api/rooms/${encodeURIComponent(id)}`);
      if (!res.ok) return null;
      return ((await res.json()) as { room?: LobbyRoom }).room ?? null;
    } catch {
      return null;
    }
  }

  // ⚠️ 이 effect는 동기 구간에서 $state를 읽지 않는다 (D7). isAttachedTo·세션 저장소는
  //    평범한 값이고, game.error는 await 뒤에서만 읽으므로 추적되지 않는다.
  $effect(() => {
    let cancelled = false;
    (async () => {
      // 방을 만든 직후(이미 연결됨)나 새로고침·복귀(재접속 토큰)는 묻지 않는다
      const returning = isAttachedTo(roomId) || loadReconnectToken(roomId) !== null;
      if (!returning) {
        const room = await fetchRoom(roomId);
        if (cancelled) return;
        if (!room) {
          toast("방을 찾을 수 없습니다", "error");
          navigate("/", true);
          return;
        }
        // isFirstVisit()는 getNickname()이 닉네임을 저장하기 **전에** 물어야 한다
        const firstVisit = isFirstVisit();
        const needPassword = !room.isPublic && takePassword(roomId) === undefined;
        if (firstVisit || needPassword) {
          gate = {
            room, error: "", busy: false,
            nickname: firstVisit ? generateRandomNickname() : getNickname(),
          };
          return;
        }
      }
      try {
        await joinRoom(roomId, getNickname(), takePassword(roomId));
        clearPassword(roomId);
      } catch {
        if (cancelled) return;
        clearPassword(roomId);
        // 방은 있는데 거절됐다(비밀번호·닉네임 중복·정원) → 입장 화면에서 다시 묻는다
        const room = await fetchRoom(roomId);
        if (cancelled) return;
        if (room) {
          gate = { room, nickname: getNickname(), busy: false, error: game.error || "방에 들어갈 수 없습니다" };
          return;
        }
        toast(game.error || "방에 들어갈 수 없습니다", "error");
        navigate("/", true);
      }
    })();
    return () => { cancelled = true; void leave(); };
  });

  async function enterFromGate(nickname: string, password: string | undefined) {
    if (!gate || gate.busy) return;
    if (!isValidNickname(nickname)) { gate.error = "닉네임은 2~10자여야 합니다"; return; }
    setNickname(nickname);
    gate.busy = true;
    gate.error = "";
    try {
      await joinRoom(roomId, nickname, password);
      gate = null;
    } catch {
      if (gate) {
        gate.busy = false;
        gate.error = game.error || "방에 들어갈 수 없습니다";
      }
    }
  }

  /**
   * SDK 자동 재접속이 소진된 뒤(`lost`)의 복귀 경로. 저장된 토큰으로 유예 안에
   * 돌아가고, 유예가 지났으면 일반 참가(게임 중이면 관전)로 이어진다.
   * 방 자체가 사라졌으면(서버 재시작 등) 로비로 보낸다.
   */
  async function retry() {
    if (game.connection !== "lost" || game.connecting) return;
    try {
      await joinRoom(roomId, getNickname());
      toast("다시 연결됐습니다", "success");
    } catch {
      toast(game.error || "방에 다시 들어갈 수 없습니다", "error");
      navigate("/", true);
    }
  }

  // 탭 복귀·네트워크 복구 시 자동으로 한 번 시도한다. 숨겨진 탭에서는 브라우저가
  // 타이머를 늦추므로 SDK 재시도가 유예 안에 끝나지 않을 수 있다 — 화면에 돌아온
  // 순간이 가장 확실한 재시도 시점이다.
  // ⚠️ 이 effect는 $state를 읽지 않는다. 핸들러 안에서 읽는 것은 추적되지 않는다 (D7).
  $effect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") void retry(); };
    const onOnline = () => { void retry(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  });

  const s = $derived(game.snapshot);
  const phase = $derived(s?.phase ?? "waiting");
  // description-reveal은 설명 화면 위에서 타이핑으로 이어지므로 화면을 유지한다.
  // order-reveal과 vote-reveal은 자체 화면을 가진다.
  const view = $derived(phase === "description-reveal" ? "description" : phase);

  // 라운드 중 "나가기"는 정상 퇴장이라 토큰까지 버린다. 폰에서 잘못 누르면 그 자리에서
  // 이탈 확정이고, 라이어였다면 라운드가 무효가 된다. 라운드 중에만 한 번 확인한다.
  let confirmLeave = $state(false);
  async function exit() {
    if (IN_ROUND_PHASES.has(phase) && !confirmLeave) { confirmLeave = true; return; }
    confirmLeave = false;
    await leave();
    navigate("/");
  }
</script>

{#if !s && gate}
  <JoinGate room={gate.room} nickname={gate.nickname} error={gate.error} busy={gate.busy}
            onsubmit={enterFromGate} oncancel={() => navigate("/")} />
{:else if !s}
  <div class="fixed inset-0 flex items-center justify-center">
    <p class="text-gray-400">{game.error || "연결 중…"}</p>
  </div>
{:else}
  <div class="min-h-screen flex flex-col">
    <header class="border-b border-gray-800 px-4 py-3 flex items-center gap-3">
      <h1 class="text-lg font-bold truncate flex-1">{s.name}</h1>
      {#if s.round > 0}
        <span class="text-sm text-gray-400 shrink-0 tabular-nums">
          <span class="hidden sm:inline mr-1">라운드</span>{s.round}{s.totalRounds > 0 ? ` / ${s.totalRounds}` : ""}
        </span>
      {/if}
      <!-- 주제는 전원 공개다 (REQUIREMENTS §1.2). 제시어와 달리 가리지 않는다 —
           특히 라이어는 주제를 계속 보며 거짓말을 준비해야 한다. -->
      {#if s.roundCategory}
        <span class="shrink-0 px-2.5 py-1 rounded-lg bg-gray-800 text-sm" title="이번 라운드 주제">
          <span class="text-gray-400">주제</span> <span class="font-semibold">{s.roundCategory}</span>
        </span>
      {/if}
      <PeekWord />
      <button onclick={exit} title="나가기" aria-label="나가기"
              class="text-sm text-gray-400 hover:text-white shrink-0 inline-flex items-center gap-1">
        <LogOut class="w-4 h-4" /><span class="hidden sm:inline">나가기</span>
      </button>
    </header>
    <PhaseProgress />

    <ConnectionBanner onretry={retry} />
    <SpectatorBanner />
    <PauseBanner />

    <!-- 모바일은 하단 채팅 바(약 7rem)가 내용을 가리지 않도록 아래 여백을 둔다 -->
    <main class="flex-1 container mx-auto p-4 max-w-6xl lg:grid lg:grid-cols-5 lg:gap-6 min-h-0 {desktop.current ? '' : 'pb-32'}">
      <div class="lg:col-span-3 flex flex-col gap-6">
        {#if view === "waiting"}<Waiting />
        {:else if view === "word-check"}<WordCheck />
        {:else if view === "order-reveal"}<OrderReveal />
        {:else if view === "description"}<Description />
        {:else if view === "discussion"}<Discussion />
        {:else if view === "defense"}<Defense />
        {:else if view === "final-vote"}<FinalVote />
        {:else if view === "vote-reveal"}<VoteReveal />
        {:else if view === "liar-guess"}<LiarGuess />
        {:else if view === "round-result"}<RoundResult />
        {:else if view === "scoreboard"}<Scoreboard />
        {:else if view === "match-result"}<MatchResult />
        {/if}
      </div>

      <aside class="lg:col-span-2 flex flex-col gap-4 mt-6 lg:mt-0 min-h-0">
        <PlayerList />
        {#if desktop.current}
          <div class="flex-1 min-h-64"><Chat /></div>
        {/if}
      </aside>
    </main>

    {#if !desktop.current}
      <MobileChat />
    {/if}
  </div>

  {#if confirmLeave}
    <div class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div class="bg-gray-800 rounded-2xl p-6 max-w-sm w-full" role="alertdialog" aria-labelledby="leave-title">
        <h3 id="leave-title" class="text-lg font-bold mb-2">정말 나가시겠어요?</h3>
        <p class="text-sm text-gray-400 mb-5">
          라운드가 진행 중입니다. 지금 나가면 다시 들어올 수 없고, 남은 사람들의 라운드가 중단될 수 있습니다.
        </p>
        <div class="flex gap-2">
          <button onclick={() => (confirmLeave = false)} class="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold">계속 하기</button>
          <button onclick={exit} class="flex-1 py-3 bg-danger hover:bg-danger/80 rounded-lg font-semibold">나가기</button>
        </div>
      </div>
    </div>
  {/if}
{/if}
