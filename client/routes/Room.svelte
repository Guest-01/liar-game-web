<script lang="ts">
  import { game, joinRoom, leave, me } from "../lib/connection.svelte.js";
  import { getNickname, takePassword, clearPassword } from "../lib/session.js";
  import { navigate } from "../router.svelte.js";
  import { toast } from "../ui/toast.svelte.js";

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

  let { roomId }: { roomId: string } = $props();

  $effect(() => {
    let cancelled = false;
    (async () => {
      try {
        await joinRoom(roomId, getNickname(), takePassword(roomId));
        clearPassword(roomId);
      } catch {
        if (cancelled) return;
        toast(game.error || "방에 들어갈 수 없습니다", "error");
        navigate("/", true);
      }
    })();
    return () => { cancelled = true; void leave(); };
  });

  const s = $derived(game.snapshot);
  const phase = $derived(s?.phase ?? "waiting");
  // description-reveal은 설명 화면 위에서 타이핑으로 이어지므로 화면을 유지한다.
  // order-reveal과 vote-reveal은 자체 화면을 가진다.
  const view = $derived(phase === "description-reveal" ? "description" : phase);

  async function exit() { await leave(); navigate("/"); }
</script>

{#if !s}
  <div class="fixed inset-0 flex items-center justify-center">
    <p class="text-gray-400">{game.error || "연결 중…"}</p>
  </div>
{:else}
  <div class="min-h-screen flex flex-col">
    <header class="border-b border-gray-800 px-4 py-3 flex items-center gap-3">
      <h1 class="text-lg font-bold truncate flex-1">{s.name}</h1>
      {#if s.round > 0}
        <span class="text-sm text-gray-400 shrink-0">
          라운드 {s.round}{s.totalRounds > 0 ? ` / ${s.totalRounds}` : ""}
        </span>
      {/if}
      {#if me() && !me()!.amILiar && me()!.myWord}
        <span class="text-sm shrink-0">제시어: <span class="text-primary font-semibold">{me()!.myWord}</span></span>
      {:else if me()?.amILiar}
        <span class="text-sm text-danger font-semibold shrink-0">당신은 라이어</span>
      {/if}
      <button onclick={exit} class="text-sm text-gray-400 hover:text-white shrink-0">나가기</button>
    </header>

    <SpectatorBanner />
    <PauseBanner />

    <main class="flex-1 container mx-auto p-4 max-w-6xl lg:grid lg:grid-cols-5 lg:gap-6 min-h-0">
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
        <div class="flex-1 min-h-64"><Chat /></div>
      </aside>
    </main>
  </div>
{/if}
