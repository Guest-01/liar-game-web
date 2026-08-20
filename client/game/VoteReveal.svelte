<script lang="ts">
  /**
   * 개표 → (처형 확정 시) 라이어 공개.
   *
   * 서버는 페이즈와 남은 시간만 준다. 아래 타임라인은 클라이언트가 소유한다.
   *   0s        찬반 공개 + 카운트다운 5초
   *   5s        "○○님은 라이어가…" 타이핑
   *   ~7.5s     "맞습니다!" / "아닙니다!"
   *
   * `defendantWasLiar`는 **처형이 확정됐을 때만** 서버가 채운다.
   * 미확정이면 라운드가 계속되므로 라이어 정체가 새면 안 된다.
   */
  import { game, nicknameOf } from "../lib/connection.svelte.js";
  import { VOTE_REVEAL_MS } from "../../shared/constants.js";
  import Typewriter from "../fx/Typewriter.svelte";

  const s = $derived(game.snapshot!);
  const confirmed = $derived(s.executionConfirmed);
  const defender = $derived(nicknameOf(s.defendantId));

  let countdown = $state(Math.ceil(VOTE_REVEAL_MS / 1000));
  let stage = $state<"tally" | "typing" | "verdict">("tally");

  $effect(() => {
    void s.defendantId;
    countdown = Math.ceil(VOTE_REVEAL_MS / 1000);
    stage = "tally";

    const tick = setInterval(() => {
      countdown = Math.max(0, countdown - 1);
      if (countdown === 0) clearInterval(tick);
    }, 1000);

    // 카운트다운이 끝나면 라이어 공개로 넘어간다 (확정된 경우에만)
    const toTyping = setTimeout(() => {
      if (confirmed) stage = "typing";
    }, VOTE_REVEAL_MS);

    return () => { clearInterval(tick); clearTimeout(toTyping); };
  });
</script>

<div class="text-center py-8 space-y-8">
  {#if stage === "tally"}
    <div class="space-y-6 fade-in">
      <h2 class="text-2xl font-bold">개표 결과</h2>
      <p class="text-lg"><span class="font-bold">{defender}</span>님에 대한 투표</p>

      <div class="flex justify-center items-baseline gap-6 text-3xl font-bold">
        <span class="text-danger">찬성 {s.agreeCount}</span>
        <span class="text-gray-400 text-xl">/</span>
        <span class="text-gray-300">반대 {s.disagreeCount}</span>
        {#if s.abstainCount > 0}
          <span class="text-gray-500 text-xl">무효 {s.abstainCount}</span>
        {/if}
      </div>

      <div class="border-t border-gray-700 pt-6 max-w-md mx-auto">
        {#if confirmed}
          <p class="text-xl text-success">과반수 찬성!</p>
        {:else}
          <p class="text-xl text-warning">과반수 미달</p>
        {/if}
        <p class="text-gray-400 mt-3">
          <span class="font-mono font-bold">{countdown}</span>초 후
          {confirmed ? "라이어를 공개합니다…" : "토론으로 돌아갑니다…"}
        </p>
      </div>
    </div>
  {:else}
    <!-- 라이어 공개 시퀀스 -->
    <div class="min-h-40 flex flex-col items-center justify-center gap-6">
      {#if stage === "typing"}
        <p class="text-xl md:text-2xl font-bold">
          <Typewriter text={`${defender}님은 라이어가…`} msPerChar={90}
                      onDone={() => setTimeout(() => (stage = "verdict"), 1200)} />
        </p>
      {:else}
        <p class="text-xl md:text-2xl font-bold text-gray-300">{defender}님은 라이어가…</p>
        {#if s.defendantWasLiar}
          <p class="text-4xl md:text-5xl font-bold text-danger liar-reveal-text">맞습니다!</p>
        {:else}
          <p class="text-4xl md:text-5xl font-bold text-primary liar-reveal-text">아닙니다!</p>
        {/if}
      {/if}
    </div>
  {/if}
</div>
