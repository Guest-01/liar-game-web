<script lang="ts">
  /**
   * 발언 순서 추첨 — 하이라이트가 점점 느려지다 첫 설명자에서 멈추고, 멈춘 뒤에는
   * 목록이 실제 발언 순서로 재정렬되며 번호가 붙는다.
   *
   * 이 연출 때문에 첫 설명자가 시간을 손해보지 않도록 서버가 `order-reveal`
   * 페이즈를 따로 둔다 (설명 제한시간은 그 뒤에 시작한다).
   */
  import { flip } from "svelte/animate";
  import { game, playerList } from "../lib/connection.svelte.js";
  import { ORDER_REVEAL_MS } from "../../shared/constants.js";

  const s = $derived(game.snapshot!);
  const order = $derived(s.descriptionOrder);
  const players = $derived(playerList());

  let highlightIdx = $state(0);
  let settled = $state(false);

  /** 멈추기 전에는 입장 순서, 멈춘 뒤에는 발언 순서 */
  const rows = $derived(
    settled
      ? order.map((id) => players.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p)
      : players,
  );
  const highlightId = $derived(settled ? order[0] : players[highlightIdx]?.id);

  $effect(() => {
    void s.round;                       // 라운드가 바뀌면 다시 돈다
    highlightIdx = 0;
    settled = false;
    if (players.length === 0) return;

    // 총 ORDER_REVEAL_MS 안에서 점점 느려지도록 간격을 키운다
    let elapsed = 0, i = 0, timer: ReturnType<typeof setTimeout> | null = null;
    const budget = ORDER_REVEAL_MS - 600;   // 마지막 정지 여운

    const step = () => {
      highlightIdx = (highlightIdx + 1) % players.length;
      i += 1;
      const delay = 50 + i * 14;            // 50ms에서 점증
      elapsed += delay;
      if (elapsed >= budget) {
        settled = true;
        return;
      }
      timer = setTimeout(step, delay);
    };
    timer = setTimeout(step, 250);
    return () => { if (timer) clearTimeout(timer); };
  });
</script>

<div class="text-center py-8 space-y-6">
  <h2 class="text-2xl font-bold">{settled ? "발언 순서" : "발언 순서를 정하는 중…"}</h2>

  <ol class="max-w-sm mx-auto space-y-2">
    {#each rows as p, i (p.id)}
      <li animate:flip={{ duration: 400 }}
          class="flex items-center gap-3 px-4 py-3 rounded-xl text-lg transition-colors duration-100
                 {p.id === highlightId
                   ? (settled ? 'bg-primary pulse-border border' : 'bg-secondary')
                   : (settled ? 'bg-gray-800' : 'bg-gray-800 text-gray-400')}">
        <span class="w-6 shrink-0 font-bold tabular-nums {settled ? '' : 'text-gray-600'}">
          {settled ? i + 1 : "?"}
        </span>
        <span class="flex-1 text-left truncate">{p.nickname}</span>
      </li>
    {/each}
  </ol>

  {#if settled}
    <p class="text-lg fade-in">
      <span class="font-bold text-primary">{rows[0]?.nickname}</span>님부터 시작합니다
    </p>
  {/if}
</div>
