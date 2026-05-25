<script lang="ts">
import { Home, Layers, LocateFixed, Map as MapIcon, Navigation, Satellite } from "lucide-svelte";
import type { MapLayerMode } from "../../lib/map";

type CameraTarget = "device" | "home" | "vehicle";

type Props = {
  mapLayerMode: MapLayerMode;
  terrainModeEnabled: boolean;
  deviceLocationVisible: boolean;
  passive: boolean;
  onSelectLayerMode: (mode: MapLayerMode) => void;
  onToggleTerrainMode: () => void;
  onActivateCameraTarget: (target: CameraTarget) => void;
};

let {
  mapLayerMode,
  terrainModeEnabled,
  deviceLocationVisible,
  passive,
  onSelectLayerMode,
  onToggleTerrainMode,
  onActivateCameraTarget,
}: Props = $props();

function preventContextMenu(event: MouseEvent) {
  event.preventDefault();
}
</script>

<div class={["map-locate-group mission-map__control-group mission-map__control-group--layers", passive && "is-passive"]}>
  <button aria-label="Normal map mode" aria-pressed={mapLayerMode === "normal"} class={["map-locate-btn", mapLayerMode === "normal" && "is-active"]} onclick={() => onSelectLayerMode("normal")} title="Normal" type="button">
    <MapIcon aria-hidden="true" size={16} />
  </button>
  <button aria-label="Hybrid map mode" aria-pressed={mapLayerMode === "hybrid"} class={["map-locate-btn", mapLayerMode === "hybrid" && "is-active"]} onclick={() => onSelectLayerMode("hybrid")} title="Hybrid" type="button">
    <Layers aria-hidden="true" size={16} />
  </button>
  <button aria-label="Satellite map mode" aria-pressed={mapLayerMode === "satellite"} class={["map-locate-btn", mapLayerMode === "satellite" && "is-active"]} onclick={() => onSelectLayerMode("satellite")} title="Satellite" type="button">
    <Satellite aria-hidden="true" size={16} />
  </button>
  <button aria-label="Toggle 3D terrain" aria-pressed={terrainModeEnabled} class={["map-locate-btn", terrainModeEnabled && "is-active"]} onclick={onToggleTerrainMode} title="3D terrain" type="button">
    <span class="mission-map__button-text">3D</span>
  </button>
</div>

<div class={["map-locate-group mission-map__control-group mission-map__control-group--targets", passive && "is-passive"]}>
  {#if deviceLocationVisible}
    <button aria-label="My location" class="map-locate-btn" oncontextmenu={preventContextMenu} onclick={() => onActivateCameraTarget("device")} title="My location" type="button">
      <LocateFixed aria-hidden="true" size={16} />
    </button>
  {/if}
  <button aria-label="Home location" class="map-locate-btn" oncontextmenu={preventContextMenu} onclick={() => onActivateCameraTarget("home")} title="Home location" type="button">
    <Home aria-hidden="true" size={16} />
  </button>
  <button aria-label="Vehicle location" class="map-locate-btn" oncontextmenu={preventContextMenu} onclick={() => onActivateCameraTarget("vehicle")} title="Vehicle location" type="button">
    <Navigation aria-hidden="true" size={16} />
  </button>
</div>

<style>
  .mission-map__control-group--layers {
    top: 12px;
    left: 12px;
    right: auto;
    bottom: auto;
  }

  .mission-map__control-group--targets {
    right: 12px;
    bottom: 12px;
  }

  .mission-map__control-group.is-passive {
    opacity: 0.55;
    pointer-events: none;
  }

  .mission-map__button-text {
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
</style>
