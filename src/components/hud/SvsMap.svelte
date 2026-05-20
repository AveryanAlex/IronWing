<script lang="ts">
import { onMount } from "svelte";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";

import type { HomePosition, MissionPlan } from "../../mission";
import {
  ensureMissionPathLayers,
  OPENFREEMAP_BRIGHT_STYLE_URL,
  updateMissionPathSource,
} from "../../lib/map";
import {
  createMissionMarkerOverlay,
  missionPlanToDraftItems,
  missionPlanToMarkerSpecs,
} from "../../lib/map/mission-plan-overlay";
import { buildMissionRenderFeatures } from "../../lib/mission-path-render";
import { createNumberSmoother } from "../../lib/telemetry-smoothing";

type Props = {
  latitude_deg: number;
  longitude_deg: number;
  heading_deg: number;
  pitch_deg: number;
  roll_deg: number;
  altitude_m: number;
  homeLatitude?: number | null;
  homeLongitude?: number | null;
  homeAltitude?: number | null;
  missionPlan?: MissionPlan | null;
  currentMissionIndex?: number | null;
};

let {
  latitude_deg,
  longitude_deg,
  heading_deg,
  pitch_deg,
  roll_deg,
  altitude_m,
  homeLatitude,
  homeLongitude,
  homeAltitude,
  missionPlan = null,
  currentMissionIndex = null,
}: Props = $props();

const missionHome = $derived.by<HomePosition | null>(() => toHomePosition(homeLatitude, homeLongitude, homeAltitude));
const missionRenderItems = $derived.by(() => missionPlanToDraftItems(missionPlan));
const missionRenderFeatures = $derived.by(() =>
  buildMissionRenderFeatures(missionHome, missionRenderItems, { currentSeq: currentMissionIndex }),
);
const missionMarkerSpecs = $derived.by(() => missionPlanToMarkerSpecs(missionPlan));

const SATELLITE_TILE_URL =
  "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg";
const DEM_TILE_URL =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

let mapContainer = $state<HTMLDivElement | null>(null);

// Plain variables to avoid reactive proxy wrapping of MapLibre internals
let map: MapLibreMap | null = null;
let styleLoaded = $state(false);
let cameraFrameHandle: number | null = null;
const missionMarkerOverlay = createMissionMarkerOverlay(
  (element: HTMLElement) => new maplibregl.Marker({ element, anchor: "center" }),
  { className: "is-hud", interactive: false, markerScale: 0.72 },
);

const cameraSmoothers = {
  latitude: createNumberSmoother({ durationMs: 420, maxJump: 0.01 }),
  longitude: createNumberSmoother({ durationMs: 420, maxJump: 0.01 }),
  heading: createNumberSmoother({ durationMs: 240, circularRange: 360 }),
  pitch: createNumberSmoother({ durationMs: 180, maxJump: 45 }),
  roll: createNumberSmoother({ durationMs: 180, circularRange: 360, maxJump: 90 }),
  altitude: createNumberSmoother({ durationMs: 320, maxJump: 250 }),
};

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

onMount(() => {
  if (!mapContainer) return;

  map = new maplibregl.Map({
    container: mapContainer,
    style: OPENFREEMAP_BRIGHT_STYLE_URL,
    center: [longitude_deg, latitude_deg],
    zoom: 14,
    pitch: 75,
    maxPitch: 85,
    interactive: false,
    attributionControl: false,
  });

  map.on("style.load", () => {
    if (!map) return;

    ensureSvsStyleExtensions(map);
    syncMissionOverlay();

    styleLoaded = true;
    renderCamera(nowMs());
    scheduleCameraFrame();
  });

  return () => {
    cancelCameraFrame();
    missionMarkerOverlay.clear();
    map?.remove();
    map = null;
    styleLoaded = false;
  };
});

$effect(() => {
  const timestampMs = nowMs();
  cameraSmoothers.latitude.setTarget(latitude_deg, timestampMs);
  cameraSmoothers.longitude.setTarget(longitude_deg, timestampMs);
  cameraSmoothers.heading.setTarget(heading_deg, timestampMs);
  cameraSmoothers.pitch.setTarget(pitch_deg, timestampMs);
  cameraSmoothers.roll.setTarget(roll_deg, timestampMs);
  cameraSmoothers.altitude.setTarget(altitude_m, timestampMs);
  scheduleCameraFrame();
});

$effect(() => {
  if (!styleLoaded || !map) return;

  syncMissionOverlay();
});

function toHomePosition(latitude?: number | null, longitude?: number | null, altitude?: number | null): HomePosition | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    latitude_deg: Number(latitude),
    longitude_deg: Number(longitude),
    altitude_m: Number.isFinite(altitude) ? Number(altitude) : 0,
  };
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

function cancelCameraFrame() {
  if (cameraFrameHandle == null) return;
  cancelFrame(cameraFrameHandle);
  cameraFrameHandle = null;
}

function scheduleCameraFrame() {
  if (!map || !styleLoaded || cameraFrameHandle != null) return;
  cameraFrameHandle = requestFrame(renderCameraFrame);
}

function renderCameraFrame(timestampMs: number) {
  cameraFrameHandle = null;
  renderCamera(timestampMs);

  if (cameraIsAnimating(timestampMs)) {
    scheduleCameraFrame();
  }
}

function smoothedOrRaw(value: number | null, raw: number): number {
  return value == null || !Number.isFinite(value) ? raw : value;
}

function renderCamera(timestampMs: number) {
  if (!map || !styleLoaded) return;

  const latitude = smoothedOrRaw(cameraSmoothers.latitude.valueAt(timestampMs), latitude_deg);
  const longitude = smoothedOrRaw(cameraSmoothers.longitude.valueAt(timestampMs), longitude_deg);
  const heading = smoothedOrRaw(cameraSmoothers.heading.valueAt(timestampMs), heading_deg);
  const pitch = smoothedOrRaw(cameraSmoothers.pitch.valueAt(timestampMs), pitch_deg);
  const roll = smoothedOrRaw(cameraSmoothers.roll.valueAt(timestampMs), roll_deg);
  const altitude = smoothedOrRaw(cameraSmoothers.altitude.valueAt(timestampMs), altitude_m);

  map.jumpTo({
    center: [longitude, latitude],
    zoom: clamp(16.5 - Math.log2(Math.max(10, altitude) / 30), 11, 17),
    bearing: heading,
    pitch: clamp(75 - pitch, 20, 85),
    roll,
  });
}

function cameraIsAnimating(timestampMs: number): boolean {
  return Object.values(cameraSmoothers).some((smoother) => smoother.isAnimating(timestampMs));
}

function syncMissionOverlay() {
  if (!map) return;

  ensureMissionPathLayers(map, true);
  updateMissionPathSource(map, missionRenderFeatures);
  missionMarkerOverlay.sync(map, missionMarkerSpecs, currentMissionIndex);
}

function ensureSvsStyleExtensions(currentMap: MapLibreMap) {
  if (!currentMap.getSource("satelliteSource")) {
    currentMap.addSource("satelliteSource", {
      type: "raster",
      tiles: [SATELLITE_TILE_URL],
      tileSize: 256,
      maxzoom: 15,
    });
  }

  if (!currentMap.getSource("terrainSource")) {
    currentMap.addSource("terrainSource", {
      type: "raster-dem",
      tiles: [DEM_TILE_URL],
      tileSize: 256,
      maxzoom: 13,
      encoding: "terrarium",
    });
  }

  if (!currentMap.getSource("hillshadeSource")) {
    currentMap.addSource("hillshadeSource", {
      type: "raster-dem",
      tiles: [DEM_TILE_URL],
      tileSize: 256,
      maxzoom: 13,
      encoding: "terrarium",
    });
  }

  if (!currentMap.getLayer("satellite")) {
    currentMap.addLayer({
      id: "satellite",
      type: "raster",
      source: "satelliteSource",
      paint: { "raster-opacity": 1.0 },
    });
  }

  if (!currentMap.getLayer("hills")) {
    currentMap.addLayer({
      id: "hills",
      type: "hillshade",
      source: "hillshadeSource",
      paint: {
        "hillshade-exaggeration": 0.5,
        "hillshade-shadow-color": "#000",
      },
    });
  }

  currentMap.setTerrain({ source: "terrainSource", exaggeration: 1.5 });
  currentMap.setSky({
    "sky-color": "#199EF3",
    "sky-horizon-blend": 0.7,
    "horizon-color": "#f0f8ff",
    "fog-color": "#9ec7e8",
    "fog-ground-blend": 0.6,
    "atmosphere-blend": 0.8,
  });
}
</script>

<div bind:this={mapContainer} class="size-full"></div>
