<script lang="ts">
  import { route } from "./router.js";
  import Lobby from "./routes/Lobby.svelte";
  import Create from "./routes/Create.svelte";
  import RoomView from "./routes/Room.svelte";
  import Toasts from "./ui/Toasts.svelte";
</script>

<Toasts />

{#if route.current.name === "lobby"}
  <Lobby />
{:else if route.current.name === "create"}
  <Create />
{:else if route.current.name === "room"}
  {#key route.current.roomId}
    <RoomView roomId={route.current.roomId} />
  {/key}
{/if}
