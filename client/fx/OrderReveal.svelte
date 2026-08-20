<script lang="ts">
  /**
   * 발언 순서 추첨 — 하이라이트가 점점 느려지다 첫 설명자에서 멈춘다.
   *
   * 이 연출 때문에 첫 설명자가 시간을 손해보지 않도록 서버가 `order-reveal`
   * 페이즈를 따로 둔다 (설명 제한시간은 그 뒤에 시작한다).
   */
  import { game, playerList } from "../lib/connection.svelte.js";
  import { ORDER_REVEAL_MS } from "../../shared/constants.js";

  const s = $derived(game.snapshot!);
  const order = $derived(s.descriptionOrder);
  const players = $derived(playerList());

  let highlight = $state(0);
  let settled = $state(false);

  $effect(() => {
    void s.round;                       // 라운드가 바뀌면 다시 돈다
    highlight = 0;
    settled = false;
    if (players.length === 0) return;

    // 총 ORDER_REVEAL_MS 안에서 점점 느려지도록 간격을 키운다
    let elapsed = 0, i = 0, timer: ReturnType<typeof setTimeout> | null = null;
    const budget = ORDER_REVEAL_MS - 600;   // 마지막 정지 여운

    const step = () => {
      highlight = (highlight + 1) % players.length;
      i += 1;
      const delay = 50 + i * 14;            // 50ms에서 점증
      elapsed += delay;
      if (elapsed >= budget) {
        const firstId = order[0];
        const idx = players.findIndex((p) => p.id === firstId);
        highlight = idx >= 0 ? idx : 0;
        settled = true;
        return;
      }
      timer = setTimeout(step, delay);
    };
    timer = setTimeout(step, 250);
    return () => { if (timer) clearTimeout(timer); };
  });
</script>

<div class="text-center py-12 space-y-8">
  <h2 class="text-2xl font-bold">발언 순서를 정하는 중…</h2>

  <div class="flex flex-wrap justify-center gap-3">
    {#each players as p, i (p.id)}
      <div class="px-5 py-3 rounded-xl text-lg transition-all duration-100
                  {i === highlight
                    ? (settled ? 'bg-primary scale-110 pulse-border border' : 'bg-secondary scale-105')
                    : 'bg-gray-800 text-gray-400'}">
        {p.nickname}
      </div>
    {/each}
  </div>

  {#if settled}
    <p class="text-lg fade-in">
      <span class="font-bold text-primary">{players[highlight]?.nickname}</span>님부터 시작합니다
    </p>
  {/if}
</div>
