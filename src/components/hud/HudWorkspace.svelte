<script lang="ts">
import { onMount } from "svelte";
import { fromStore } from "svelte/store";

import "./hud.css";
import ArtificialHorizon from "./ArtificialHorizon.svelte";
import TapeGauge from "./TapeGauge.svelte";
import {
  getSessionViewStoreContext,
} from "../../app/shell/runtime-context";

const sessionView = fromStore(getSessionViewStoreContext());

let telemetry = $derived(sessionView.current.telemetry);
let vehicleState = $derived(sessionView.current.vehicleState);
let vehiclePosition = $derived(sessionView.current.vehiclePosition);

let pitch = $derived(telemetry.pitch_deg);
let roll = $derived(telemetry.roll_deg);
let heading = $derived(telemetry.heading_deg);
let altitude = $derived(telemetry.altitude_m);
let speed = $derived(telemetry.speed_mps);
let climbRate = $derived(telemetry.climb_rate_mps);
let groundSpeed = $derived(telemetry.speed_mps);
let airspeed = $derived(telemetry.airspeed_mps);
let targetBearing = $derived(telemetry.target_bearing_deg);
let terrainHeight = $derived(telemetry.terrain_height_m);
let heightAboveTerrain = $derived(telemetry.height_above_terrain_m);
let throttle = $derived(telemetry.throttle_pct);

let armed = $derived(vehicleState?.armed ?? false);
let modeName = $derived(vehicleState?.mode_name ?? "--");

// SVS setting from localStorage
const SVS_STORAGE_KEY = "ironwing.hud.svs_enabled";
let svsEnabled = $state(loadSvsEnabled());

function loadSvsEnabled(): boolean {
  try {
    const stored = localStorage.getItem(SVS_STORAGE_KEY);
    if (stored === null) return true;
    return stored === "true";
  } catch {
    return true;
  }
}

let hasSvs = $derived(
  svsEnabled
    && vehiclePosition != null
    && vehiclePosition.latitude_deg !== 0
    && vehiclePosition.longitude_deg !== 0
    && pitch != null
    && roll != null
    && altitude != null,
);

// ResizeObserver for center cell
let horizonRef = $state<HTMLDivElement | null>(null);
let horizonSize = $state({ width: 400, height: 300 });

onMount(() => {
  if (!horizonRef) return;
  const obs = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (entry) {
      horizonSize = {
        width: Math.floor(entry.contentRect.width),
        height: Math.floor(entry.contentRect.height),
      };
    }
  });
  obs.observe(horizonRef);
  return () => obs.disconnect();
});

// Formatting helpers
function fmt(value: number | undefined, decimals = 1): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  return value.toFixed(decimals);
}

function fmtInt(value: number | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  return Math.round(value).toString();
}

// Battery color
let batteryColor = $derived.by(() => {
  const pct = telemetry.battery_pct;
  if (pct == null) return "#12b9ff";
  if (pct > 30) return "#57e38b";
  if (pct > 15) return "#ffb020";
  return "#ff4444";
});

let batteryLevel = $derived(
  typeof telemetry.battery_pct === "number"
    ? Math.max(0, Math.min(100, telemetry.battery_pct))
    : 0,
);
</script>

<div class="hud-panel h-full w-full {hasSvs ? 'hud-svs-active' : ''}">
  <!-- Background layers -->
  {#if hasSvs}
    <div class="hud-svs-bg">
      {#await import("./SvsMap.svelte") then SvsMapModule}
        <SvsMapModule.default
          latitude_deg={vehiclePosition!.latitude_deg}
          longitude_deg={vehiclePosition!.longitude_deg}
          heading_deg={vehiclePosition!.heading_deg}
          pitch_deg={pitch!}
          roll_deg={roll!}
          altitude_m={altitude!}
        />
      {/await}
    </div>
  {:else}
    <div class="hud-grid-bg"></div>
  {/if}
  <div class="hud-scanlines"></div>

  <!-- Main grid -->
  <div class="hud-grid">
    <!-- Row 1, Col 1: Waypoint info -->
    <div class="hud-info-cell {hasSvs ? 'hud-svs-info-bg' : ''}">
      <div class="hud-font text-center">
        <div class="hud-info-label">WPT</div>
        {#if telemetry.wp_dist_m != null}
          <div class="hud-info-value">{fmtInt(telemetry.wp_dist_m)}m</div>
        {:else}
          <div class="hud-info-value">--</div>
        {/if}
      </div>
    </div>

    <!-- Row 1, Col 2: Heading tape -->
    <div class="flex items-end justify-center overflow-hidden">
      <TapeGauge
        value={heading}
        orientation="horizontal"
        visibleRange={90}
        majorTickInterval={10}
        minorTicksPerMajor={2}
        size={{ width: Math.min(horizonSize.width, 600), height: 48 }}
        circular
        circularRange={360}
        bugValue={targetBearing}
      />
    </div>

    <!-- Row 1, Col 3: GPS info -->
    <div class="hud-info-cell {hasSvs ? 'hud-svs-info-bg' : ''}">
      <div class="hud-font text-center">
        <div class="hud-info-label">GPS</div>
        <div class="hud-info-value">{telemetry.gps_fix_type ?? "--"}</div>
        <div class="hud-info-secondary">
          {telemetry.gps_satellites != null ? `${telemetry.gps_satellites} sat` : "-- sat"}
          {#if telemetry.gps_hdop != null}
            {" "}{fmt(telemetry.gps_hdop, 1)}
          {/if}
        </div>
      </div>
    </div>

    <!-- Row 2, Col 1: Speed tape -->
    <div class="flex items-center justify-center overflow-hidden">
      <TapeGauge
        value={speed}
        orientation="vertical"
        visibleRange={40}
        majorTickInterval={5}
        minorTicksPerMajor={5}
        size={{ width: 80, height: Math.min(horizonSize.height, 500) }}
        unit="m/s"
        label="GS"
        bugValue={airspeed}
      />
    </div>

    <!-- Row 2, Col 2: Artificial horizon -->
    <div bind:this={horizonRef} class="relative overflow-hidden">
      <ArtificialHorizon
        {pitch}
        {roll}
        size={horizonSize}
        {climbRate}
        {groundSpeed}
      />
    </div>

    <!-- Row 2, Col 3: Altitude tape -->
    <div class="flex items-center justify-center overflow-hidden">
      <TapeGauge
        value={altitude}
        orientation="vertical"
        visibleRange={200}
        majorTickInterval={20}
        minorTicksPerMajor={4}
        size={{ width: 80, height: Math.min(horizonSize.height, 500) }}
        unit="m"
        label="ALT"
        trendValue={climbRate}
        terrainValue={terrainHeight}
      />
    </div>

    <!-- Row 3, Col 1: Armed status -->
    <div class="hud-info-cell {hasSvs ? 'hud-svs-info-bg' : ''}">
      <div class="hud-font text-center">
        <div
          class="hud-armed-label {armed ? 'hud-glow-danger' : 'hud-glow-green'}"
          style:color={armed ? "#ff4444" : "#57e38b"}
        >
          {armed ? "ARMED" : "SAFE"}
        </div>
      </div>
    </div>

    <!-- Row 3, Col 2: Mode + data strip -->
    <div class="hud-status-strip {hasSvs ? 'hud-svs-status-bg' : ''}">
      <div class="hud-font flex items-center gap-4">
        <div>
          <span class="hud-strip-label">MODE </span>
          <span class="hud-strip-value font-bold">{modeName}</span>
        </div>
        <div>
          <span class="hud-strip-label">THR </span>
          <span class="hud-strip-value">{fmtInt(throttle)}%</span>
        </div>
      </div>
      <div class="hud-font flex items-center gap-4">
        <div>
          <span class="hud-strip-label">V/S </span>
          <span class="hud-strip-value">{fmt(climbRate)} m/s</span>
        </div>
        <div>
          <span class="hud-strip-label">HDG </span>
          <span class="hud-strip-value">{fmtInt(heading)}°</span>
        </div>
        {#if heightAboveTerrain != null}
          <div>
            <span class="hud-strip-label">AGL </span>
            <span class="hud-strip-value" style:color="#57e38b">{fmtInt(heightAboveTerrain)} m</span>
          </div>
        {/if}
      </div>
    </div>

    <!-- Row 3, Col 3: Battery -->
    <div class="hud-info-cell {hasSvs ? 'hud-svs-info-bg' : ''}">
      <div class="hud-font flex flex-col items-center gap-0.5">
        <!-- Battery icon -->
        <svg width="28" height="14" viewBox="0 0 28 14">
          <rect x="0" y="1" width="24" height="12" rx="2" fill="none" stroke={batteryColor} stroke-width="1" />
          <rect x="24" y="4" width="3" height="6" rx="1" fill={batteryColor} opacity="0.5" />
          {#if telemetry.battery_pct != null}
            <rect x="2" y="3" width={Math.round(batteryLevel * 0.2)} height="8" rx="1" fill={batteryColor} opacity="0.7" />
          {/if}
        </svg>
        <span class="hud-info-value">{fmtInt(telemetry.battery_pct)}%</span>
        <span class="hud-info-secondary">{fmt(telemetry.battery_voltage_v, 1)}V</span>
      </div>
    </div>
  </div>

  <!-- Mini-map overlay (hidden when SVS active) -->
  {#if !hasSvs && vehiclePosition != null}
    <div class="hud-minimap">
      {#await import("./HudMiniMap.svelte") then HudMiniMapModule}
        <HudMiniMapModule.default
          latitude={vehiclePosition.latitude_deg}
          longitude={vehiclePosition.longitude_deg}
          heading={vehiclePosition.heading_deg}
        />
      {/await}
    </div>
  {/if}
</div>
