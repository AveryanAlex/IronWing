<script lang="ts">
import { onDestroy } from "svelte";
import { Home, Layers, LocateFixed, Map as MapIcon, Navigation, Satellite } from "lucide-svelte";

import { Button } from "../../../components/ui";
import type { MapLayerMode } from "../../../lib/map";
import { cn } from "../../../lib/utils";

type CameraTarget = "device" | "home" | "vehicle";
type CameraActivation = {
  follow: boolean;
};
type MapSurfaceControlTestIds = {
  layerNormal?: string;
  layerHybrid?: string;
  layerSatellite?: string;
  terrain?: string;
  targetDevice?: string;
  targetHome?: string;
  targetVehicle?: string;
};

type Props = {
  mapLayerMode: MapLayerMode;
  terrainModeEnabled: boolean;
  deviceTargetVisible?: boolean;
  activeCameraTarget?: CameraTarget | null;
  passive?: boolean;
  testIds?: MapSurfaceControlTestIds;
  onSelectLayerMode: (mode: MapLayerMode) => void;
  onToggleTerrainMode: () => void;
  onActivateCameraTarget: (target: CameraTarget, activation: CameraActivation) => void;
};

const FOLLOW_HOLD_MS = 500;
const targetOrder = ["device", "home", "vehicle"] as const satisfies readonly CameraTarget[];
const pressTimers: Record<CameraTarget, ReturnType<typeof setTimeout> | null> = {
  device: null,
  home: null,
  vehicle: null,
};
const longPressFired: Record<CameraTarget, boolean> = {
  device: false,
  home: false,
  vehicle: false,
};
const suppressNextClick: Record<CameraTarget, boolean> = {
  device: false,
  home: false,
  vehicle: false,
};

let {
  mapLayerMode,
  terrainModeEnabled,
  deviceTargetVisible = true,
  activeCameraTarget = null,
  passive = false,
  testIds = {},
  onSelectLayerMode,
  onToggleTerrainMode,
  onActivateCameraTarget,
}: Props = $props();

let layerGroupClass = $derived(controlGroupClass("layers"));
let targetGroupClass = $derived(controlGroupClass("targets"));

onDestroy(() => {
  for (const target of targetOrder) {
    clearPressTimer(target);
  }
});

function controlGroupClass(kind: "layers" | "targets") {
  return cn(
    "map-locate-group map-surface-controls__group",
    `map-surface-controls__group--${kind}`,
    passive && "is-passive",
  );
}

function controlButtonClass(active: boolean) {
  return cn("map-locate-btn", active && "is-active");
}

function clearPressTimer(target: CameraTarget): boolean {
  const timer = pressTimers[target];
  if (timer === null) {
    return false;
  }

  clearTimeout(timer);
  pressTimers[target] = null;
  return true;
}

function suppressUpcomingClick(target: CameraTarget) {
  suppressNextClick[target] = true;
  setTimeout(() => {
    suppressNextClick[target] = false;
  }, 0);
}

function activateCameraTarget(target: CameraTarget, follow: boolean) {
  onActivateCameraTarget(target, { follow });
}

function handleTargetPointerDown(target: CameraTarget, event: PointerEvent) {
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }

  clearPressTimer(target);
  longPressFired[target] = false;
  pressTimers[target] = setTimeout(() => {
    pressTimers[target] = null;
    longPressFired[target] = true;
    suppressNextClick[target] = true;
    activateCameraTarget(target, true);
  }, FOLLOW_HOLD_MS);
}

function handleTargetPointerUp(target: CameraTarget) {
  if (clearPressTimer(target)) {
    suppressUpcomingClick(target);
    activateCameraTarget(target, false);
    return;
  }

  if (longPressFired[target]) {
    longPressFired[target] = false;
    suppressUpcomingClick(target);
  }
}

function handleTargetPointerLeave(target: CameraTarget) {
  clearPressTimer(target);
}

function handleTargetClick(target: CameraTarget, event: MouseEvent) {
  if (suppressNextClick[target]) {
    suppressNextClick[target] = false;
    event.preventDefault();
    return;
  }

  activateCameraTarget(target, false);
}

function preventContextMenu(event: MouseEvent) {
  event.preventDefault();
}
</script>

<div aria-label="Map layer controls" class={layerGroupClass} role="toolbar">
  <Button
    ariaLabel="Normal map mode"
    aria-pressed={mapLayerMode === "normal"}
    class={controlButtonClass(mapLayerMode === "normal")}
    testId={testIds.layerNormal}
    onclick={() => onSelectLayerMode("normal")}
    size="icon-sm"
    title="Normal"
    variant="bare"
  >
    <MapIcon aria-hidden="true" size={16} />
  </Button>
  <Button
    ariaLabel="Hybrid map mode"
    aria-pressed={mapLayerMode === "hybrid"}
    class={controlButtonClass(mapLayerMode === "hybrid")}
    testId={testIds.layerHybrid}
    onclick={() => onSelectLayerMode("hybrid")}
    size="icon-sm"
    title="Hybrid"
    variant="bare"
  >
    <Layers aria-hidden="true" size={16} />
  </Button>
  <Button
    ariaLabel="Satellite map mode"
    aria-pressed={mapLayerMode === "satellite"}
    class={controlButtonClass(mapLayerMode === "satellite")}
    testId={testIds.layerSatellite}
    onclick={() => onSelectLayerMode("satellite")}
    size="icon-sm"
    title="Satellite"
    variant="bare"
  >
    <Satellite aria-hidden="true" size={16} />
  </Button>
  <Button
    ariaLabel="Toggle 3D terrain"
    aria-pressed={terrainModeEnabled}
    class={controlButtonClass(terrainModeEnabled)}
    testId={testIds.terrain}
    onclick={onToggleTerrainMode}
    size="icon-sm"
    title="3D terrain"
    variant="bare"
  >
    <span class="map-surface-controls__button-text">3D</span>
  </Button>
</div>

<div aria-label="Map target controls" class={targetGroupClass} role="toolbar">
  {#if deviceTargetVisible}
    <Button
      ariaLabel="My location"
      aria-pressed={activeCameraTarget === "device"}
      class={controlButtonClass(activeCameraTarget === "device")}
      testId={testIds.targetDevice}
      oncontextmenu={preventContextMenu}
      onclick={(event) => handleTargetClick("device", event)}
      onpointercancel={() => handleTargetPointerLeave("device")}
      onpointerdown={(event) => handleTargetPointerDown("device", event)}
      onpointerleave={() => handleTargetPointerLeave("device")}
      onpointerup={() => handleTargetPointerUp("device")}
      size="icon-sm"
      title="My location (hold to follow)"
      variant="bare"
    >
      <LocateFixed aria-hidden="true" size={16} />
    </Button>
  {/if}
  <Button
    ariaLabel="Home location"
    aria-pressed={activeCameraTarget === "home"}
    class={controlButtonClass(activeCameraTarget === "home")}
    testId={testIds.targetHome}
    oncontextmenu={preventContextMenu}
    onclick={(event) => handleTargetClick("home", event)}
    onpointercancel={() => handleTargetPointerLeave("home")}
    onpointerdown={(event) => handleTargetPointerDown("home", event)}
    onpointerleave={() => handleTargetPointerLeave("home")}
    onpointerup={() => handleTargetPointerUp("home")}
    size="icon-sm"
    title="Home location (hold to follow)"
    variant="bare"
  >
    <Home aria-hidden="true" size={16} />
  </Button>
  <Button
    ariaLabel="Vehicle location"
    aria-pressed={activeCameraTarget === "vehicle"}
    class={controlButtonClass(activeCameraTarget === "vehicle")}
    testId={testIds.targetVehicle}
    oncontextmenu={preventContextMenu}
    onclick={(event) => handleTargetClick("vehicle", event)}
    onpointercancel={() => handleTargetPointerLeave("vehicle")}
    onpointerdown={(event) => handleTargetPointerDown("vehicle", event)}
    onpointerleave={() => handleTargetPointerLeave("vehicle")}
    onpointerup={() => handleTargetPointerUp("vehicle")}
    size="icon-sm"
    title="Vehicle location (hold to follow)"
    variant="bare"
  >
    <Navigation aria-hidden="true" size={16} />
  </Button>
</div>

<style>
  :global(.map-surface-controls__group) {
    width: max-content;
    pointer-events: auto;
  }

  :global(.map-locate-group.map-surface-controls__group--layers) {
    top: 10px;
    left: 10px;
    right: auto;
    bottom: auto;
    height: max-content;
  }

  :global(.map-locate-group.map-surface-controls__group--targets) {
    top: auto;
    left: auto;
    right: 10px;
    bottom: 10px;
    height: max-content;
  }

  :global(.map-surface-controls__group.is-passive) {
    opacity: 0.55;
    pointer-events: none;
  }

  .map-surface-controls__button-text {
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.02em;
    line-height: 1;
  }
</style>
