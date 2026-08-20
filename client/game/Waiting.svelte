<script lang="ts">
  import { game, isHost, playerList, send } from "../lib/connection.svelte.js";
  import {
    DEFENSE_TIME_OPTIONS, DESCRIPTION_TIME_OPTIONS, DISCUSSION_TIME_OPTIONS,
    MAX_PLAYERS, MIN_PLAYERS, ROUND_COUNT_OPTIONS,
  } from "../../shared/constants.js";

  const roundLabel = (v: number) => (v === 0 ? "무제한" : `${v}판`);
  import { RANDOM_CATEGORY } from "../../shared/rules.js";

  let categories = $state<string[]>([]);
  $effect(() => {
    fetch("/api/categories").then((r) => r.json()).then((d) => { categories = d.categories; });
  });

  const s = $derived(game.snapshot!);
  const enough = $derived(playerList().length >= MIN_PLAYERS);
  const set = (patch: Record<string, unknown>) => send("set-settings", patch);

  const timeRows = $derived([
    { key: "descriptionTime", label: "설명 시간", opts: DESCRIPTION_TIME_OPTIONS, fmt: (v: number) => `${v}초` },
    { key: "discussionTime", label: "토론 시간", opts: DISCUSSION_TIME_OPTIONS, fmt: (v: number) => `${v / 60}분` },
    { key: "defenseTime", label: "변론 시간", opts: DEFENSE_TIME_OPTIONS, fmt: (v: number) => `${v}초` },
  ]);
</script>

<div class="space-y-6">
  <div class="bg-gray-800 rounded-xl p-6">
    <h3 class="font-semibold mb-4">게임 설정</h3>

    {#if !isHost()}
      <div class="flex flex-wrap gap-4 text-sm text-gray-400">
        <span>모드: <span class="text-white">{s.gameMode === "normal" ? "일반" : "바보"}</span></span>
        <span>라운드: <span class="text-white">{roundLabel(s.totalRounds)}</span></span>
        <span>카테고리: <span class="text-white">{s.category}</span></span>
        <span>최대: <span class="text-white">{s.maxPlayers}명</span></span>
        <span>설명: <span class="text-white">{s.descriptionTime}초</span></span>
        <span>토론: <span class="text-white">{s.discussionTime / 60}분</span></span>
        <span>변론: <span class="text-white">{s.defenseTime}초</span></span>
      </div>
    {:else}
      <div class="flex flex-col gap-4">
        <div class="flex flex-wrap items-center gap-4">
          <span class="text-sm text-gray-400 w-20">게임 모드</span>
          <div class="flex gap-3">
            {#each [["normal", "일반"], ["fool", "바보"]] as [v, label] (v)}
              <button onclick={() => set({ gameMode: v })}
                      class="w-24 py-2 rounded-lg text-sm {s.gameMode === v ? 'bg-primary' : 'bg-gray-700 hover:bg-gray-600'}">{label}</button>
            {/each}
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-4">
          <span class="text-sm text-gray-400 w-20">라운드 수</span>
          <div class="flex gap-2">
            {#each ROUND_COUNT_OPTIONS as v (v)}
              <button onclick={() => set({ totalRounds: v })}
                      class="w-16 py-1.5 rounded text-xs {s.totalRounds === v ? 'bg-primary' : 'bg-gray-700 hover:bg-gray-600'}">
                {roundLabel(v)}
              </button>
            {/each}
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-4">
          <span class="text-sm text-gray-400 w-20">카테고리</span>
          <select value={s.category} onchange={(e) => set({ category: e.currentTarget.value })}
                  class="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-sm outline-hidden">
            <option value={RANDOM_CATEGORY}>랜덤</option>
            {#each categories as c (c)}<option value={c}>{c}</option>{/each}
          </select>
        </div>

        <div class="flex flex-wrap items-center gap-4">
          <span class="text-sm text-gray-400 w-20">최대 인원</span>
          <!-- 드래그 중 폭주를 막기 위해 input이 아니라 change를 쓴다 (체크리스트 D1) -->
          <input type="range" min={MIN_PLAYERS} max={MAX_PLAYERS} value={s.maxPlayers}
                 onchange={(e) => set({ maxPlayers: Number(e.currentTarget.value) })}
                 class="w-40 accent-primary" />
          <span class="font-medium">{s.maxPlayers}명</span>
        </div>

        {#each timeRows as row (row.key)}
          <div class="flex flex-wrap items-center gap-4">
            <span class="text-sm text-gray-400 w-20">{row.label}</span>
            <div class="flex gap-2">
              {#each row.opts as v (v)}
                <button onclick={() => set({ [row.key]: v })}
                        class="w-16 py-1.5 rounded text-xs {(s as never as Record<string, number>)[row.key] === v ? 'bg-primary' : 'bg-gray-700 hover:bg-gray-600'}">
                  {row.fmt(v)}
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <div class="text-center">
    {#if isHost()}
      <button onclick={() => send("start-match")} disabled={!enough}
              class="w-full lg:w-auto px-8 py-4 bg-gradient-to-r from-primary to-secondary rounded-xl font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed">
        {enough ? "게임 시작" : `최소 ${MIN_PLAYERS}명이 필요합니다`}
      </button>
    {:else}
      <p class="text-gray-400">호스트가 게임을 시작할 때까지 기다려주세요…</p>
    {/if}
  </div>
</div>
