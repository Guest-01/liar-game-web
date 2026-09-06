<script lang="ts">
  /**
   * 토론 & 지목.
   *
   * 설명 목록과 지목 버튼을 **한 줄로 합친다** — 플레이어당 한 줄에 순번·닉네임·
   * 그 사람의 설명·득표 배지를 두고 줄 전체를 눌러 지목한다. 설명을 읽는 자리에서
   * 바로 지목하므로 위아래를 오가지 않고, 득표는 배지의 색과 위치로 닉네임과
   * 구분된다. 이전 2~3열 그리드는 닉네임과 "N표"가 한 버튼 안에 같은 무게로 있어
   * 구분되지 않았다.
   */
  import { amSpectator, game, me, playerList, send } from "../lib/connection.svelte.js";
  import { REDO_TARGET } from "../../shared/constants.js";
  import Timer from "./Timer.svelte";
  import Check from "@lucide/svelte/icons/check";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";

  const s = $derived(game.snapshot!);
  const my = $derived(me());
  const canRedo = $derived(s.descriptionAttempts < 2);
  const canNominate = $derived(!amSpectator());

  /** 발언 순서대로. 순서 배열에 없는 사람(있을 수 없지만)도 뒤에 붙인다. */
  const rows = $derived.by(() => {
    const players = playerList();
    const inOrder = s.descriptionOrder
      .map((id) => players.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => !!p);
    const rest = players.filter((p) => !s.descriptionOrder.includes(p.id));
    return [...inOrder, ...rest];
  });
  const voterCount = $derived(playerList().length);
  const countFor = (id: string) => playerList().filter((p) => p.nominatedId === id).length;

  // 득표가 늘어난 대상에 짧게 펄스를 준다 (REQUIREMENTS §F9)
  let pulsing = $state<Record<string, boolean>>({});
  let prev: Record<string, number> = {};

  $effect(() => {
    const now: Record<string, number> = {};
    for (const p of playerList()) {
      if (p.nominatedId) now[p.nominatedId] = (now[p.nominatedId] ?? 0) + 1;
    }
    for (const [id, n] of Object.entries(now)) {
      if (n > (prev[id] ?? 0)) {
        pulsing[id] = true;
        setTimeout(() => { pulsing[id] = false; }, 300);
      }
    }
    prev = now;
  });
</script>

<div class="space-y-5">
  <div class="flex items-center justify-between">
    <h2 class="text-xl font-bold">토론 &amp; 지목</h2>
    <Timer />
  </div>

  <div>
    <div class="flex items-baseline justify-between mb-2">
      <h3 class="font-semibold">
        {amSpectator() ? "지목 현황" : "누가 라이어일까요?"}
      </h3>
      {#if canNominate}
        <span class="text-xs text-gray-500">설명을 읽고 줄을 눌러 지목하세요</span>
      {/if}
    </div>

    <ul class="space-y-2">
      {#each rows as p, i (p.id)}
        {@const isMe = p.id === game.mySessionId}
        {@const selected = my?.nominatedId === p.id}
        {@const votes = countFor(p.id)}
        <li>
          <button onclick={() => send("nominate", { targetId: p.id })}
                  disabled={!canNominate || isMe}
                  aria-pressed={selected}
                  class="w-full text-left flex items-start gap-3 px-4 py-3 rounded-xl border transition-colors
                         disabled:cursor-default
                         {selected
                           ? 'border-danger bg-danger/15'
                           : 'border-transparent bg-gray-800 enabled:hover:bg-gray-700'}">
            <span class="w-6 shrink-0 pt-0.5 text-gray-500 tabular-nums">{i + 1}</span>
            <span class="flex-1 min-w-0">
              <span class="flex items-center gap-1.5 font-semibold">
                <span class="truncate">{p.nickname}</span>
                {#if isMe}<span class="text-xs text-primary font-normal shrink-0">(나)</span>{/if}
                {#if selected}<Check class="w-4 h-4 text-danger shrink-0" aria-label="내가 지목함" />{/if}
              </span>
              <span class="block text-sm text-gray-300 break-words mt-0.5">{p.description || "…"}</span>
              {#if votes > 0}
                <span class="block h-1 mt-2 rounded-full bg-gray-700 overflow-hidden">
                  <span class="block h-full bg-danger transition-all duration-300"
                        style="width: {Math.round((votes / voterCount) * 100)}%"></span>
                </span>
              {/if}
            </span>
            <span class="shrink-0 min-w-12 text-center px-2 py-1 rounded-lg text-sm font-bold tabular-nums
                         {votes > 0 ? 'bg-danger/20 text-danger' : 'bg-gray-700/60 text-gray-500'}"
                  class:nomination-pulse={pulsing[p.id]}>
              {votes}표
            </span>
          </button>
        </li>
      {/each}

      {#if canRedo}
        {@const selected = my?.nominatedId === REDO_TARGET}
        {@const votes = countFor(REDO_TARGET)}
        <li class="pt-1">
          <button onclick={() => send("nominate", { targetId: REDO_TARGET })}
                  disabled={!canNominate}
                  aria-pressed={selected}
                  class="w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed transition-colors
                         disabled:cursor-default
                         {selected
                           ? 'border-warning bg-warning/15'
                           : 'border-gray-700 bg-gray-800/50 enabled:hover:bg-gray-700'}">
            <RotateCcw class="w-4 h-4 shrink-0 {selected ? 'text-warning' : 'text-gray-400'}" />
            <span class="flex-1 min-w-0">
              <span class="font-semibold inline-flex items-center gap-1.5">
                설명 다시하기
                {#if selected}<Check class="w-4 h-4 text-warning" aria-label="내가 선택함" />{/if}
              </span>
              <span class="block text-xs text-gray-500">아직 확신이 없다면 한 번 더 듣습니다</span>
            </span>
            <span class="shrink-0 min-w-12 text-center px-2 py-1 rounded-lg text-sm font-bold tabular-nums
                         {votes > 0 ? 'bg-warning/20 text-warning' : 'bg-gray-700/60 text-gray-500'}"
                  class:nomination-pulse={pulsing[REDO_TARGET]}>
              {votes}표
            </span>
          </button>
        </li>
      {/if}
    </ul>

    {#if amSpectator()}
      <p class="text-xs text-gray-500 mt-2">관전 중에는 지목할 수 없습니다</p>
    {:else if !canRedo}
      <p class="text-xs text-gray-500 mt-2">설명 다시하기 기회를 모두 사용했습니다</p>
    {/if}
  </div>
</div>
