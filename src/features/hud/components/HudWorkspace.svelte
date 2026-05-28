<script lang="ts">
import { onMount } from "svelte";
import { fromStore } from "svelte/store";

import "./hud.css";
import AttitudeBackground from "./AttitudeBackground.svelte";
import ArtificialHorizon from "./ArtificialHorizon.svelte";
import TapeGauge from "./TapeGauge.svelte";
import { createNumberSmoother } from "../../../lib/telemetry-smoothing";
import {
  getSessionViewStoreContext,
  getMissionPlannerStoreContext,
} from "../../../app/shell/runtime-context";
import { SVS_CAMERA_VERTICAL_FOV_DEG, type SvsCameraMode } from "../../../lib/map";

const sessionView = fromStore(getSessionViewStoreContext());
const missionPlanner = fromStore(getMissionPlannerStoreContext());

let telemetry = $derived(sessionView.current.telemetry);
let vehicleState = $derived(sessionView.current.vehicleState);
let vehiclePosition = $derived(sessionView.current.vehiclePosition);
let homePosition = $derived(sessionView.current.homePosition);
let missionState = $derived(missionPlanner.current.missionState);

let pitch = $derived(telemetry.pitch_deg);
let roll = $derived(telemetry.roll_deg);
let heading = $derived(telemetry.heading_deg);
let altitude = $derived(telemetry.altitude_m);
let speed = $derived(telemetry.speed_mps);
let climbRate = $derived(telemetry.climb_rate_mps);
let airspeed = $derived(telemetry.airspeed_mps);
let targetBearing = $derived(telemetry.target_bearing_deg);
let terrainHeight = $derived(telemetry.terrain_height_m);
let heightAboveTerrain = $derived(telemetry.height_above_terrain_m);
let throttle = $derived(telemetry.throttle_pct);
let relativeHomeAltitude = $derived(
  typeof altitude === "number" && homePosition?.altitude_m != null ? altitude - homePosition.altitude_m : null,
);

const hudSmoothers = {
  pitch: createNumberSmoother({ durationMs: 160, maxJump: 45 }),
  roll: createNumberSmoother({ durationMs: 160, circularRange: 360, maxJump: 90 }),
  heading: createNumberSmoother({ durationMs: 300, circularRange: 360 }),
  altitude: createNumberSmoother({ durationMs: 300, maxJump: 250 }),
  speed: createNumberSmoother({ durationMs: 240, maxJump: 25 }),
  climbRate: createNumberSmoother({ durationMs: 220, maxJump: 20 }),
  airspeed: createNumberSmoother({ durationMs: 240, maxJump: 25 }),
  targetBearing: createNumberSmoother({ durationMs: 300, circularRange: 360 }),
  terrainHeight: createNumberSmoother({ durationMs: 300, maxJump: 250 }),
};

let hudFrameHandle: number | null = null;

let smoothedHud = $state<{
  pitch?: number;
  roll?: number;
  heading?: number;
  altitude?: number;
  speed?: number;
  climbRate?: number;
  airspeed?: number;
  targetBearing?: number;
  terrainHeight?: number;
}>({});

let displayPitch = $derived(smoothedHud.pitch ?? pitch);
let displayRoll = $derived(smoothedHud.roll ?? roll);
let displayHeading = $derived(smoothedHud.heading ?? heading);
let displayAltitude = $derived(smoothedHud.altitude ?? altitude);
let displaySpeed = $derived(smoothedHud.speed ?? speed);
let displayClimbRate = $derived(smoothedHud.climbRate ?? climbRate);
let displayAirspeed = $derived(smoothedHud.airspeed ?? airspeed);
let displayTargetBearing = $derived(smoothedHud.targetBearing ?? targetBearing);
let displayTerrainHeight = $derived(smoothedHud.terrainHeight ?? terrainHeight);

let armed = $derived(vehicleState?.armed ?? false);
let modeName = $derived(vehicleState?.mode_name ?? "--");

// SVS setting from localStorage
const SVS_STORAGE_KEY = "ironwing.hud.svs_enabled";
const SVS_CAMERA_MODE_STORAGE_KEY = "ironwing.hud.svs_camera_mode";
let svsEnabled = $state(loadSvsEnabled());
let svsCameraMode = $state<SvsCameraMode>(loadSvsCameraMode());
let svsCameraModeLabel = $derived(svsCameraMode === "ground_stabilized" ? "GND" : "NOSE");

function loadSvsEnabled(): boolean {
  try {
    const stored = localStorage.getItem(SVS_STORAGE_KEY);
    if (stored === null) return true;
    return stored === "true";
  } catch {
    return true;
  }
}

function loadSvsCameraMode(): SvsCameraMode {
  try {
    return localStorage.getItem(SVS_CAMERA_MODE_STORAGE_KEY) === "ground_stabilized" ? "ground_stabilized" : "nose";
  } catch {
    return "nose";
  }
}

function toggleSvsCameraMode() {
  svsCameraMode = svsCameraMode === "ground_stabilized" ? "nose" : "ground_stabilized";
  try {
    localStorage.setItem(SVS_CAMERA_MODE_STORAGE_KEY, svsCameraMode);
  } catch {
    // Ignore storage errors; the in-memory toggle still works for this session.
  }
}

let hasSvs = $derived(
  svsEnabled
    && vehiclePosition != null
    && vehiclePosition.latitude_deg !== 0
    && vehiclePosition.longitude_deg !== 0
    && pitch != null
    && roll != null,
);
let visualHorizonPitch = $derived(hasSvs && svsCameraMode === "ground_stabilized" ? 0 : displayPitch);
let visualHorizonRoll = $derived(hasSvs && svsCameraMode === "ground_stabilized" ? 0 : displayRoll);

// ResizeObserver for center cell
let panelRef = $state<HTMLDivElement | null>(null);
let horizonRef = $state<HTMLDivElement | null>(null);
let horizonSize = $state({ width: 400, height: 300 });
let horizonProjectionViewport = $state({
  width: 400,
  height: 300,
  offsetLeft: 0,
  offsetTop: 0,
});
let horizonPanelSize = $derived({
  width: Math.max(1, Math.floor(horizonProjectionViewport.width)),
  height: Math.max(1, Math.floor(horizonProjectionViewport.height)),
});

onMount(() => {
  if (!horizonRef) return;

  const obs = new ResizeObserver(() => {
    measureHorizonProjectionViewport();
  });
  obs.observe(horizonRef);

  if (panelRef) {
    obs.observe(panelRef);
  }

  measureHorizonProjectionViewport();
  return () => obs.disconnect();
});

onMount(() => () => cancelHudFrame());

$effect(() => {
  const timestampMs = nowMs();
  hudSmoothers.pitch.setTarget(pitch, timestampMs);
  hudSmoothers.roll.setTarget(roll, timestampMs);
  hudSmoothers.heading.setTarget(heading, timestampMs);
  hudSmoothers.altitude.setTarget(altitude, timestampMs);
  hudSmoothers.speed.setTarget(speed, timestampMs);
  hudSmoothers.climbRate.setTarget(climbRate, timestampMs);
  hudSmoothers.airspeed.setTarget(airspeed, timestampMs);
  hudSmoothers.targetBearing.setTarget(targetBearing, timestampMs);
  hudSmoothers.terrainHeight.setTarget(terrainHeight, timestampMs);
  updateSmoothedHud(timestampMs);
  scheduleHudFrame();
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

function measureHorizonProjectionViewport() {
  if (!horizonRef) return;

  const horizonRect = horizonRef.getBoundingClientRect();
  const panelRect = panelRef?.getBoundingClientRect();
  const horizonWidth = positiveDimension(horizonRect.width) ?? horizonSize.width;
  const horizonHeight = positiveDimension(horizonRect.height) ?? horizonSize.height;
  const panelWidth = positiveDimension(panelRect?.width) ?? horizonWidth;
  const panelHeight = positiveDimension(panelRect?.height) ?? horizonHeight;
  const panelLeft = finiteNumber(panelRect?.left) ?? horizonRect.left;
  const panelTop = finiteNumber(panelRect?.top) ?? horizonRect.top;

  horizonSize = {
    width: Math.max(1, Math.floor(horizonWidth)),
    height: Math.max(1, Math.floor(horizonHeight)),
  };
  horizonProjectionViewport = {
    width: panelWidth,
    height: panelHeight,
    offsetLeft: horizonRect.left - panelLeft,
    offsetTop: horizonRect.top - panelTop,
  };
}

function positiveDimension(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function finiteNumber(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nowMs(): number {
  return typeof performance?.now === "function" ? performance.now() : Date.now();
}

function requestFrame(callback: FrameRequestCallback): number {
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame(callback);
  }

  return setTimeout(() => callback(nowMs()), 16) as unknown as number;
}

function cancelFrame(handle: number) {
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(handle);
    return;
  }

  clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
}

function numberOrUndefined(value: number | null): number | undefined {
  return value == null || !Number.isFinite(value) ? undefined : value;
}

function updateSmoothedHud(timestampMs: number) {
  smoothedHud.pitch = numberOrUndefined(hudSmoothers.pitch.valueAt(timestampMs));
  smoothedHud.roll = numberOrUndefined(hudSmoothers.roll.valueAt(timestampMs));
  smoothedHud.heading = numberOrUndefined(hudSmoothers.heading.valueAt(timestampMs));
  smoothedHud.altitude = numberOrUndefined(hudSmoothers.altitude.valueAt(timestampMs));
  smoothedHud.speed = numberOrUndefined(hudSmoothers.speed.valueAt(timestampMs));
  smoothedHud.climbRate = numberOrUndefined(hudSmoothers.climbRate.valueAt(timestampMs));
  smoothedHud.airspeed = numberOrUndefined(hudSmoothers.airspeed.valueAt(timestampMs));
  smoothedHud.targetBearing = numberOrUndefined(hudSmoothers.targetBearing.valueAt(timestampMs));
  smoothedHud.terrainHeight = numberOrUndefined(hudSmoothers.terrainHeight.valueAt(timestampMs));
}

function cancelHudFrame() {
  if (hudFrameHandle == null) return;
  cancelFrame(hudFrameHandle);
  hudFrameHandle = null;
}

function scheduleHudFrame() {
  if (hudFrameHandle != null) return;
  hudFrameHandle = requestFrame(renderHudFrame);
}

function renderHudFrame(timestampMs: number) {
  hudFrameHandle = null;
  updateSmoothedHud(timestampMs);

  if (hudIsAnimating(timestampMs)) {
    scheduleHudFrame();
  }
}

function hudIsAnimating(timestampMs: number): boolean {
  return Object.values(hudSmoothers).some((smoother) => smoother.isAnimating(timestampMs));
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

<div bind:this={panelRef} class="hud-panel h-full w-full {hasSvs ? 'hud-svs-active' : ''}">
  <!-- Background layers -->
  {#if hasSvs}
    <div class="hud-svs-bg">
      {#await import("./SvsMap.svelte") then SvsMapModule}
        <SvsMapModule.default
          latitude_deg={vehiclePosition!.latitude_deg}
          longitude_deg={vehiclePosition!.longitude_deg}
          heading_deg={vehiclePosition!.heading_deg}
          pitch_deg={displayPitch!}
          roll_deg={displayRoll!}
          altitude_m={displayAltitude}
          terrain_height_m={displayTerrainHeight}
          height_above_terrain_m={heightAboveTerrain}
          relative_home_altitude_m={relativeHomeAltitude}
          homeLatitude={homePosition?.latitude_deg}
          homeLongitude={homePosition?.longitude_deg}
          homeAltitude={homePosition?.altitude_m}
          missionPlan={missionState?.plan}
          currentMissionIndex={missionState?.current_index}
          cameraMode={svsCameraMode}
        />
      {/await}
    </div>
  {:else}
    <div class="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
      <AttitudeBackground
        pitch={visualHorizonPitch}
        roll={visualHorizonRoll}
        size={horizonPanelSize}
        verticalFovDeg={SVS_CAMERA_VERTICAL_FOV_DEG}
      />
    </div>
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
        value={displayHeading}
        orientation="horizontal"
        visibleRange={90}
        majorTickInterval={10}
        minorTicksPerMajor={2}
        size={{ width: Math.min(horizonSize.width, 600), height: 48 }}
        circular
        circularRange={360}
        bugValue={displayTargetBearing}
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
            {` ${fmt(telemetry.gps_hdop, 1)}`}
          {/if}
        </div>
      </div>
    </div>

    <!-- Row 2, Col 1: Speed tape -->
    <div class="flex items-center justify-center overflow-hidden">
      <TapeGauge
        value={displaySpeed}
        orientation="vertical"
        visibleRange={40}
        majorTickInterval={5}
        minorTicksPerMajor={5}
        size={{ width: 80, height: Math.min(horizonSize.height, 500) }}
        unit="m/s"
        label="GS"
        bugValue={displayAirspeed}
      />
    </div>

    <!-- Row 2, Col 2: Artificial horizon -->
    <div bind:this={horizonRef} class="relative overflow-hidden">
      <ArtificialHorizon
        pitch={displayPitch}
        roll={displayRoll}
        visualPitch={visualHorizonPitch}
        visualRoll={visualHorizonRoll}
        size={horizonSize}
        climbRate={displayClimbRate}
        groundSpeed={displaySpeed}
        verticalFovDeg={SVS_CAMERA_VERTICAL_FOV_DEG}
        projectionViewport={horizonProjectionViewport}
      />
    </div>

    <!-- Row 2, Col 3: Altitude tape -->
    <div class="flex items-center justify-center overflow-hidden">
      <TapeGauge
        value={displayAltitude}
        orientation="vertical"
        visibleRange={200}
        majorTickInterval={20}
        minorTicksPerMajor={4}
        size={{ width: 80, height: Math.min(horizonSize.height, 500) }}
        unit="m"
        label="ALT"
        trendValue={displayClimbRate}
        terrainValue={displayTerrainHeight}
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
        {#if hasSvs}
          <button
            type="button"
            class="hud-camera-mode-toggle"
            title="Switch SVS camera mode"
            aria-label={`Switch SVS camera mode. Current mode: ${svsCameraMode === "ground_stabilized" ? "ground stabilized" : "nose camera"}`}
            onclick={toggleSvsCameraMode}
          >
            <span class="hud-strip-label">CAM </span>
            <span class="hud-strip-value font-bold">{svsCameraModeLabel}</span>
          </button>
        {/if}
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
      <div class="hud-font hud-battery-cell">
        <div class="hud-battery-cell__row">
          <!-- Battery icon -->
          <svg class="hud-battery-cell__icon" width="20" height="10" viewBox="0 0 28 14" aria-hidden="true">
            <rect x="0" y="1" width="24" height="12" rx="2" fill="none" stroke={batteryColor} stroke-width="1" />
            <rect x="24" y="4" width="3" height="6" rx="1" fill={batteryColor} opacity="0.5" />
            {#if telemetry.battery_pct != null}
              <rect x="2" y="3" width={Math.round(batteryLevel * 0.2)} height="8" rx="1" fill={batteryColor} opacity="0.7" />
            {/if}
          </svg>
          <span class="hud-info-value hud-battery-cell__pct">{fmtInt(telemetry.battery_pct)}%</span>
        </div>
        <span class="hud-info-secondary hud-battery-cell__volts">{fmt(telemetry.battery_voltage_v, 1)}V</span>
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
          heading={displayHeading ?? vehiclePosition.heading_deg}
          homeLatitude={homePosition?.latitude_deg}
          homeLongitude={homePosition?.longitude_deg}
          homeAltitude={homePosition?.altitude_m}
          missionPlan={missionState?.plan}
          currentMissionIndex={missionState?.current_index}
        />
      {/await}
    </div>
  {/if}
</div>
