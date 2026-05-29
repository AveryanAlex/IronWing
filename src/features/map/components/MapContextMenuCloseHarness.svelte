<script lang="ts">
import MapContextMenu from "./MapContextMenu.svelte";
import type { MapContextMenuAction } from "./map-context-menu-types";

type MenuState = {
  x: number;
  y: number;
  lat: number;
  lon: number;
} | null;

let menu = $state<MenuState>({ x: 120, y: 80, lat: 47.4, lon: 8.55 });

const actions: MapContextMenuAction[] = [
  {
    id: "close-sync",
    label: "Close sync",
    testId: "test-map-context-menu-close-sync",
    onSelect: () => {
      menu = null;
    },
  },
];
</script>

{#if menu}
  <MapContextMenu
    x={menu.x}
    y={menu.y}
    lat={menu.lat}
    lon={menu.lon}
    {actions}
    testId="test-map-context-menu"
    onClose={() => {
      menu = null;
    }}
  />
{/if}
