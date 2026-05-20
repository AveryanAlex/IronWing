<script lang="ts">
import { fetch as platformFetch } from "@platform/http";
import { onMount } from "svelte";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap } from "maplibre-gl";

import type { HomePosition, MissionPlan } from "../../mission";
import {
  configureMapLibreWorker,
  ensureMissionPathLayers,
  ensureSatelliteLayer,
  MAPTERHORN_DEM_TILEJSON_URL,
  OPENFREEMAP_BRIGHT_STYLE_URL,
  SVS_CAMERA_FALLBACK_AGL_M,
  SVS_CAMERA_MOUNT,
  SVS_CAMERA_VERTICAL_FOV_DEG,
  applySvsAircraftCamera,
  resolveSvsCameraAltitudeMsl,
  type SvsCameraMode,
  updateMissionPathSource,
} from "../../lib/map";
import {
  createMissionMarkerOverlay,
  missionPlanToDraftItems,
  missionPlanToMarkerSpecs,
} from "../../lib/map/mission-plan-overlay";
import { buildMissionRenderFeatures } from "../../lib/mission-path-render";
import { createNumberSmoother } from "../../lib/telemetry-smoothing";
import { createTileCache, sampleElevations, type TerrainPoint } from "../../lib/terrain-dem";

type Props = {
  latitude_deg: number;
  longitude_deg: number;
  heading_deg: number;
  pitch_deg: number;
  roll_deg: number;
  altitude_m?: number | null;
  terrain_height_m?: number | null;
  height_above_terrain_m?: number | null;
  relative_home_altitude_m?: number | null;
  homeLatitude?: number | null;
  homeLongitude?: number | null;
  homeAltitude?: number | null;
  missionPlan?: MissionPlan | null;
  currentMissionIndex?: number | null;
  cameraMode?: SvsCameraMode;
};

let {
  latitude_deg,
  longitude_deg,
  heading_deg,
  pitch_deg,
  roll_deg,
  altitude_m = null,
  terrain_height_m = null,
  height_above_terrain_m = null,
  relative_home_altitude_m = null,
  homeLatitude,
  homeLongitude,
  homeAltitude,
  missionPlan = null,
  currentMissionIndex = null,
  cameraMode = "nose",
}: Props = $props();

const missionHome = $derived.by<HomePosition | null>(() => toHomePosition(homeLatitude, homeLongitude, homeAltitude));
const missionRenderItems = $derived.by(() => missionPlanToDraftItems(missionPlan));
const missionRenderFeatures = $derived.by(() =>
  buildMissionRenderFeatures(missionHome, missionRenderItems, { currentSeq: currentMissionIndex }),
);
const missionMarkerSpecs = $derived.by(() => missionPlanToMarkerSpecs(missionPlan));

let mapContainer = $state<HTMLDivElement | null>(null);
let terrainSamples = $state<{ aircraftMsl: number | null; homeMsl: number | null }>({
  aircraftMsl: null,
  homeMsl: null,
});
const cameraAltitude = $derived.by(() =>
  resolveSvsCameraAltitudeMsl({
    altitudeMslM: altitude_m,
    heightAboveTerrainM: height_above_terrain_m,
    relativeHomeAltitudeM: relative_home_altitude_m,
    terrainMslM: terrainSamples.aircraftMsl ?? terrain_height_m,
    homeTerrainMslM: terrainSamples.homeMsl,
    homeAltitudeMslM: homeAltitude,
    fallbackAglM: SVS_CAMERA_FALLBACK_AGL_M,
  }),
);

// Plain variables to avoid reactive proxy wrapping of MapLibre internals
let map: MapLibreMap | null = null;
let styleLoaded = $state(false);
let cameraFrameHandle: number | null = null;
let terrainSampleKey: string | null = null;
let terrainSampleRequestId = 0;
const terrainCache = createTileCache(platformFetch);
const missionMarkerOverlay = createMissionMarkerOverlay(
  (element: HTMLElement) => new maplibregl.Marker({ element, anchor: "center" }),
  { className: "is-hud", interactive: false, markerScale: 0.72 },
);

const SVS_TERRAIN_EXAGGERATION = 1;
const TERRAIN_SAMPLE_COORD_PRECISION = 5;

type TerrainSampleRequest = {
  key: string;
  aircraftPoint: TerrainPoint;
  homePoint: TerrainPoint | null;
};

const cameraSmoothers = {
  latitude: createNumberSmoother({ durationMs: 420, maxJump: 0.01 }),
  longitude: createNumberSmoother({ durationMs: 420, maxJump: 0.01 }),
  heading: createNumberSmoother({ durationMs: 240, circularRange: 360 }),
  pitch: createNumberSmoother({ durationMs: 180, maxJump: 45 }),
  roll: createNumberSmoother({ durationMs: 180, circularRange: 360, maxJump: 90 }),
  altitude: createNumberSmoother({ durationMs: 320, maxJump: 250 }),
};

onMount(() => {
  if (!mapContainer) return;

  configureMapLibreWorker();
  map = new maplibregl.Map({
    container: mapContainer,
    style: OPENFREEMAP_BRIGHT_STYLE_URL,
    center: [longitude_deg, latitude_deg],
    zoom: 14,
    pitch: 90,
    maxPitch: 180,
    centerClampedToGround: false,
    rollEnabled: true,
    interactive: false,
    attributionControl: false,
  });
  map.setVerticalFieldOfView(SVS_CAMERA_VERTICAL_FOV_DEG);

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
  cameraSmoothers.altitude.setTarget(cameraAltitude.altitudeMslM, timestampMs);
  scheduleCameraFrame();
});

$effect(() => {
  const request = buildTerrainSampleRequest();
  if (!request) return;

  void refreshTerrainSamples(request);
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
  const altitude = smoothedOrRaw(cameraSmoothers.altitude.valueAt(timestampMs), cameraAltitude.altitudeMslM);
  const terrainMsl = terrainSamples.aircraftMsl ?? terrain_height_m;

  // TODO(svs-rendering): MapLibre still refreshes terrain/raster tile coverage when the nose crosses
  // the horizon because center elevation and high-pitch terrain LOD change abruptly. Tune source LOD
  // or move near-field SVS terrain to a dedicated renderer if dynamic look-ahead is insufficient.
  applySvsAircraftCamera(map, {
    latitudeDeg: latitude,
    longitudeDeg: longitude,
    headingDeg: heading,
    pitchDeg: pitch,
    rollDeg: roll,
    altitudeMslM: altitude,
    terrainMslM: terrainMsl,
    heightAboveTerrainM: height_above_terrain_m,
  }, SVS_CAMERA_MOUNT, cameraMode);
}

function buildTerrainSampleRequest(): TerrainSampleRequest | null {
  if (isFiniteNumber(altitude_m)) return null;

  const aircraftPoint = toTerrainPoint(latitude_deg, longitude_deg);
  if (!aircraftPoint) return null;

  const needsHomeTerrain = !isFiniteNumber(height_above_terrain_m) && isFiniteNumber(relative_home_altitude_m);
  const homePoint = needsHomeTerrain ? toTerrainPoint(homeLatitude, homeLongitude) : null;
  const key = [terrainPointKey(aircraftPoint), homePoint ? terrainPointKey(homePoint) : "no-home"].join("|");

  return { key, aircraftPoint, homePoint };
}

async function refreshTerrainSamples(request: TerrainSampleRequest) {
  if (terrainSampleKey === request.key) return;

  terrainSampleKey = request.key;
  terrainSampleRequestId += 1;
  const requestId = terrainSampleRequestId;
  const points = request.homePoint ? [request.aircraftPoint, request.homePoint] : [request.aircraftPoint];

  try {
    const elevations = await sampleElevations(points, terrainCache);
    if (requestId !== terrainSampleRequestId) return;

    terrainSamples = {
      aircraftMsl: elevations[0] ?? null,
      homeMsl: request.homePoint ? elevations[1] ?? null : terrainSamples.homeMsl,
    };
    scheduleCameraFrame();
  } catch {
    if (requestId !== terrainSampleRequestId) return;

    terrainSamples = {
      aircraftMsl: null,
      homeMsl: request.homePoint ? null : terrainSamples.homeMsl,
    };
    scheduleCameraFrame();
  }
}

function toTerrainPoint(latitude?: number | null, longitude?: number | null): TerrainPoint | null {
  if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) {
    return null;
  }

  return {
    latitude_deg: latitude,
    longitude_deg: longitude,
  };
}

function terrainPointKey(point: TerrainPoint): string {
  return `${point.latitude_deg.toFixed(TERRAIN_SAMPLE_COORD_PRECISION)},${point.longitude_deg.toFixed(TERRAIN_SAMPLE_COORD_PRECISION)}`;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
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
  ensureSatelliteLayer(currentMap, {
    ids: {
      satelliteSourceId: "satelliteSource",
      satelliteDetailSourceId: "satelliteDetailSource",
      satelliteLayerId: "satellite",
      satelliteDetailLayerId: "satelliteDetail",
    },
    satelliteBeforeLayerId: null,
    satelliteVisible: true,
  });

  if (!currentMap.getSource("terrainSource")) {
    currentMap.addSource("terrainSource", {
      type: "raster-dem",
      url: MAPTERHORN_DEM_TILEJSON_URL,
    });
  }

  if (!currentMap.getSource("hillshadeSource")) {
    currentMap.addSource("hillshadeSource", {
      type: "raster-dem",
      url: MAPTERHORN_DEM_TILEJSON_URL,
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

  currentMap.setTerrain({ source: "terrainSource", exaggeration: SVS_TERRAIN_EXAGGERATION });
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
