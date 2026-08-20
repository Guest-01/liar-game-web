<script lang="ts">
  import { toasts } from "./toast.svelte.js";
  import { fly } from "svelte/transition";

  const color = { info: "bg-gray-700", error: "bg-danger", success: "bg-success" };
</script>

<div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end">
  {#each toasts.items as t (t.id)}
    <div transition:fly={{ y: 20, duration: 200 }}
         class="px-5 py-3 rounded-lg text-white shadow-lg {color[t.kind]}">
      {t.text}
    </div>
  {/each}
</div>
