<script lang="ts">
import { onMount } from "svelte";
import { toast } from "svelte-sonner";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type Marker } from "maplibre-gl";

import {
  resolveVehicleIconKind,
  VEHICLE_ICON_SVG,
  type VehicleIconKind,
} from "../../lib/overview/vehicle-icon";

type Props = {
  vehicleLat?: number;
  vehicleLon?: number;
  vehicleHeading?: number;
  mavType?: number;
  homeLat?: number;
  homeLon?: number;
  missionPath?: Array<{ lat: number; lon: number }>;
};

type MapLayerMode = "normal" | "hybrid" | "satellite";
type FollowTarget = "device" | "home" | "vehicle";
type DeviceLocation = {
  latitude_deg: number;
  longitude_deg: number;
  accuracy_m: number;
};
type PendingDeviceAction = {
  follow: boolean;
};

const DEFAULT_CENTER: [number, number] = [8.545594, 47.397742];
const BASE_STYLE_URL = "https://tiles.openfreemap.org/styles/bright";
const SATELLITE_TILE_URL =
  "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg";
const DEM_TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const SATELLITE_SOURCE_ID = "overview-satellite-source";
const TERRAIN_SOURCE_ID = "overview-terrain-source";
const HILLSHADE_SOURCE_ID = "overview-hillshade-source";
const SATELLITE_LAYER_ID = "overview-satellite";
const HILLSHADE_LAYER_ID = "overview-hills";
const MISSION_PATH_SOURCE_ID = "overview-mission-path";
const MISSION_PATH_LAYER_ID = "overview-mission-path-line";
const LONG_PRESS_MS = 500;

let {
  vehicleLat,
  vehicleLon,
  vehicleHeading = 0,
  mavType,
  homeLat,
  homeLon,
  missionPath = [],
}: Props = $props();

const iconKind = $derived<VehicleIconKind>(resolveVehicleIconKind(mavType));

let mapContainer = $state<HTMLDivElement | null>(null);
let mapLayer = $state<MapLayerMode>("normal");
let followTarget = $state<FollowTarget | null>(null);
let terrainModeEnabled = $state(false);
let styleLoaded = $state(false);
let deviceLocation = $state<DeviceLocation | null>(null);
let deviceLocationSupported = $state(browserGeolocationSupported());
let devicePermissionDenied = $state(false);
let pendingDeviceAction = $state<PendingDeviceAction | null>(null);

// Held as plain variables rather than $state to avoid reactive proxy wrapping
// of MapLibre's internal object graph, which would break its methods.
let map: MapLibreMap | null = null;
let vehicleMarker: Marker | null = null;
let homeMarker: Marker | null = null;
let deviceMarker: Marker | null = null;
let vehicleSvg: SVGSVGElement | null = null;
let baseLayerIds: string[] = [];
let programmaticMovePending = false;
let deviceWatchId: number | null = null;
let appliedTerrainMode: boolean | null = null;
let vehicleMarkerAttached = false;
let homeMarkerAttached = false;
let deviceMarkerAttached = false;

const pressTimers: Record<FollowTarget, ReturnType<typeof setTimeout> | null> = {
  device: null,
  home: null,
  vehicle: null,
};

onMount(() => {
  if (!mapContainer) return;

  const initialCenter = asLngLat(vehicleLat, vehicleLon) ?? asLngLat(homeLat, homeLon) ?? DEFAULT_CENTER;

  map = new maplibregl.Map({
    container: mapContainer,
    style: BASE_STYLE_URL,
    center: initialCenter,
    zoom: 15,
    pitch: 0,
    maxPitch: 85,
    attributionControl: false,
  });

  map.addControl(
    new maplibregl.NavigationControl({ showZoom: true, showCompass: true, visualizePitch: true }),
    "top-right",
  );

  const vehicleElement = document.createElement("div");
  vehicleElement.className = "vehicle-marker";
  vehicleElement.dataset.iconKind = iconKind;
  vehicleElement.style.zIndex = "5";
  vehicleElement.innerHTML = VEHICLE_ICON_SVG[iconKind];
  vehicleSvg = vehicleElement.querySelector("svg");
  vehicleMarker = new maplibregl.Marker({ element: vehicleElement, anchor: "center" });

  const homeElement = document.createElement("button");
  homeElement.type = "button";
  homeElement.className = "mission-pin is-home";
  homeElement.textContent = "H";
  homeElement.setAttribute("aria-label", "Home position marker");
  homeElement.addEventListener("click", (event) => event.stopPropagation());
  homeMarker = new maplibregl.Marker({ element: homeElement, anchor: "center" });

  const deviceElement = document.createElement("div");
  deviceElement.className = "device-location-marker";
  deviceMarker = new maplibregl.Marker({ element: deviceElement, anchor: "center" });

  map.on("movestart", () => {
    if (programmaticMovePending) {
      programmaticMovePending = false;
      return;
    }

    followTarget = null;
    pendingDeviceAction = null;
  });

  map.on("style.load", () => {
    if (!map) return;

    ensureStyleExtensions(map);
    styleLoaded = true;
  });

  return () => {
    clearPressTimer("device");
    clearPressTimer("home");
    clearPressTimer("vehicle");
    stopDeviceLocationWatch();
    vehicleMarker?.remove();
    homeMarker?.remove();
    deviceMarker?.remove();
    map?.remove();
    map = null;
    vehicleMarker = null;
    homeMarker = null;
    deviceMarker = null;
    vehicleSvg = null;
    styleLoaded = false;
    baseLayerIds = [];
    vehicleMarkerAttached = false;
    homeMarkerAttached = false;
    deviceMarkerAttached = false;
  };
});

$effect(() => {
  if (!styleLoaded || !map) return;
  applyMapLayerMode(map, mapLayer);
});

$effect(() => {
  if (!styleLoaded || !map) return;
  applyTerrainMode(map, terrainModeEnabled);
});

$effect(() => {
  if (!styleLoaded || !map) return;
  const source = map.getSource(MISSION_PATH_SOURCE_ID) as GeoJSONSource | undefined;
  source?.setData(buildPathGeoJson(missionPath));
});

$effect(() => {
  if (!vehicleMarker) return;
  const el = vehicleMarker.getElement();
  if (!el) return;
  el.dataset.iconKind = iconKind;
  el.innerHTML = VEHICLE_ICON_SVG[iconKind];
  vehicleSvg = el.querySelector("svg");
  // Re-apply heading rotation since the SVG was replaced.
  if (vehicleSvg && typeof vehicleHeading === "number") {
    vehicleSvg.style.transform = `rotate(${vehicleHeading}deg)`;
  }
});

$effect(() => {
  const lngLat = asLngLat(vehicleLat, vehicleLon);
  if (!vehicleMarker || !lngLat) {
    if (vehicleMarker && vehicleMarkerAttached && !lngLat) {
      vehicleMarker.remove();
      vehicleMarkerAttached = false;
      if (followTarget === "vehicle") {
        followTarget = null;
      }
    }
    return;
  }

  vehicleMarker.setLngLat(lngLat);
  if (map && !vehicleMarkerAttached) {
    vehicleMarker.addTo(map);
    vehicleMarkerAttached = true;
  }
  if (vehicleSvg) {
    vehicleSvg.style.transform = `rotate(${vehicleHeading}deg)`;
  }
  if (followTarget === "vehicle") {
    easeToCoordinates(lngLat);
  }
});

$effect(() => {
  const lngLat = asLngLat(homeLat, homeLon);
  if (!homeMarker || !lngLat) {
    if (homeMarker && homeMarkerAttached && !lngLat) {
      homeMarker.remove();
      homeMarkerAttached = false;
      if (followTarget === "home") {
        followTarget = null;
      }
    }
    return;
  }

  homeMarker.setLngLat(lngLat);
  if (map && !homeMarkerAttached) {
    homeMarker.addTo(map);
    homeMarkerAttached = true;
  }
  if (followTarget === "home") {
    easeToCoordinates(lngLat);
  }
});

$effect(() => {
  if (!deviceMarker) return;

  if (!deviceLocation) {
    if (deviceMarkerAttached) {
      deviceMarker.remove();
      deviceMarkerAttached = false;
    }
    if (followTarget === "device") {
      followTarget = null;
    }
    return;
  }

  const lngLat: [number, number] = [deviceLocation.longitude_deg, deviceLocation.latitude_deg];
  deviceMarker.setLngLat(lngLat);
  if (map && !deviceMarkerAttached) {
    deviceMarker.addTo(map);
    deviceMarkerAttached = true;
  }
  if (followTarget === "device") {
    easeToCoordinates(lngLat);
  }
});

function browserGeolocationSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.geolocation !== "undefined";
}

function asLngLat(latitude?: number, longitude?: number): [number, number] | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return [Number(longitude), Number(latitude)];
}

function ensureStyleExtensions(currentMap: MapLibreMap) {
  const currentLayers = currentMap.getStyle().layers ?? [];
  baseLayerIds = currentLayers.map((layer) => layer.id);

  if (!currentMap.getSource(SATELLITE_SOURCE_ID)) {
    currentMap.addSource(SATELLITE_SOURCE_ID, {
      type: "raster",
      tiles: [SATELLITE_TILE_URL],
      tileSize: 256,
      maxzoom: 15,
    });
  }

  if (!currentMap.getSource(TERRAIN_SOURCE_ID)) {
    currentMap.addSource(TERRAIN_SOURCE_ID, {
      type: "raster-dem",
      tiles: [DEM_TILE_URL],
      tileSize: 256,
      maxzoom: 15,
      encoding: "terrarium",
    });
  }

  if (!currentMap.getSource(HILLSHADE_SOURCE_ID)) {
    currentMap.addSource(HILLSHADE_SOURCE_ID, {
      type: "raster-dem",
      tiles: [DEM_TILE_URL],
      tileSize: 256,
      maxzoom: 15,
      encoding: "terrarium",
    });
  }

  const firstNonFillLayerId = currentLayers.find((layer) => layer.type !== "fill" && layer.type !== "background")?.id;

  if (!currentMap.getLayer(SATELLITE_LAYER_ID)) {
    currentMap.addLayer(
      {
        id: SATELLITE_LAYER_ID,
        type: "raster",
        source: SATELLITE_SOURCE_ID,
        layout: { visibility: "none" },
        paint: { "raster-opacity": 1 },
      },
      firstNonFillLayerId,
    );
  }

  if (!currentMap.getLayer(HILLSHADE_LAYER_ID)) {
    currentMap.addLayer({
      id: HILLSHADE_LAYER_ID,
      type: "hillshade",
      source: HILLSHADE_SOURCE_ID,
      layout: { visibility: "none" },
      paint: {
        "hillshade-shadow-color": "#473B24",
        "hillshade-exaggeration": 0.5,
      },
    });
  }

  if (!currentMap.getSource(MISSION_PATH_SOURCE_ID)) {
    currentMap.addSource(MISSION_PATH_SOURCE_ID, {
      type: "geojson",
      data: buildPathGeoJson(missionPath),
    });
  }

  if (!currentMap.getLayer(MISSION_PATH_LAYER_ID)) {
    currentMap.addLayer({
      id: MISSION_PATH_LAYER_ID,
      type: "line",
      source: MISSION_PATH_SOURCE_ID,
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": "rgba(241, 245, 249, 0.82)",
        "line-width": 2,
      },
    });
  }
}

function applyMapLayerMode(currentMap: MapLibreMap, mode: MapLayerMode) {
  const showSatellite = mode !== "normal";
  const showVector = mode !== "satellite";

  safelySetLayerVisibility(currentMap, SATELLITE_LAYER_ID, showSatellite ? "visible" : "none");
  safelySetLayerVisibility(currentMap, HILLSHADE_LAYER_ID, showSatellite ? "visible" : "none");

  for (const layerId of baseLayerIds) {
    safelySetLayerVisibility(currentMap, layerId, showVector ? "visible" : "none");
  }
}

function applyTerrainMode(currentMap: MapLibreMap, enabled: boolean) {
  const previouslyEnabled = appliedTerrainMode;
  if (appliedTerrainMode === enabled) {
    return;
  }

  appliedTerrainMode = enabled;
  currentMap.setTerrain(enabled ? { source: TERRAIN_SOURCE_ID, exaggeration: 1.5 } : null);

  if (!enabled) {
    if (previouslyEnabled) {
      programmaticMovePending = true;
      currentMap.easeTo({ pitch: 0, duration: 500 });
    }
    return;
  }

  programmaticMovePending = true;
  currentMap.easeTo({ pitch: 70, duration: 500 });
}

function safelySetLayerVisibility(
  currentMap: MapLibreMap,
  layerId: string,
  visibility: "visible" | "none",
) {
  try {
    currentMap.setLayoutProperty(layerId, "visibility", visibility);
  } catch {
    // Layers can disappear briefly while a style is reloading; skipping the
    // toggle here is safe because the next style-ready pass reapplies state.
  }
}

function flyToCoordinates(lngLat: [number, number]) {
  if (!map) return;

  const zoom = typeof map.getZoom === "function" ? Math.max(map.getZoom(), 15) : 15;
  programmaticMovePending = true;
  map.flyTo({ center: lngLat, zoom, duration: 800 });
}

function easeToCoordinates(lngLat: [number, number]) {
  if (!map) return;

  programmaticMovePending = true;
  map.easeTo({ center: lngLat, duration: 500 });
}

function stopDeviceLocationWatch() {
  if (deviceWatchId === null || !browserGeolocationSupported()) {
    deviceWatchId = null;
    return;
  }

  navigator.geolocation.clearWatch(deviceWatchId);
  deviceWatchId = null;
}

function ensureDeviceLocationWatch(): boolean {
  if (!browserGeolocationSupported()) {
    deviceLocationSupported = false;
    return false;
  }

  if (deviceWatchId !== null) {
    return true;
  }

  try {
    deviceWatchId = navigator.geolocation.watchPosition(
      (position) => {
        deviceLocation = {
          latitude_deg: position.coords.latitude,
          longitude_deg: position.coords.longitude,
          accuracy_m: position.coords.accuracy,
        };

        const pendingAction = pendingDeviceAction;
        if (!pendingAction) {
          return;
        }

        pendingDeviceAction = null;
        if (pendingAction.follow) {
          followTarget = "device";
          toast.success("Following my location");
          return;
        }

        flyToCoordinates([position.coords.longitude, position.coords.latitude]);
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          const wasDenied = devicePermissionDenied;
          devicePermissionDenied = true;
          deviceLocation = null;
          pendingDeviceAction = null;
          if (followTarget === "device") {
            followTarget = null;
          }
          stopDeviceLocationWatch();
          if (!wasDenied) {
            toast.error("Location permission denied — enable it in system settings");
          }
          return;
        }

        if (error.code === error.POSITION_UNAVAILABLE) {
          deviceLocation = null;
          pendingDeviceAction = null;
          if (followTarget === "device") {
            followTarget = null;
          }
          stopDeviceLocationWatch();
          toast.error("Current device location is unavailable");
        }
      },
      { enableHighAccuracy: true },
    );
  } catch {
    // Some shells expose the geolocation API surface but still reject watch
    // registration synchronously when the device cannot provide location.
    deviceLocationSupported = false;
    pendingDeviceAction = null;
    return false;
  }

  return true;
}

function clearPressTimer(target: FollowTarget): boolean {
  const timer = pressTimers[target];
  if (timer === null) {
    return false;
  }

  clearTimeout(timer);
  pressTimers[target] = null;
  return true;
}

function handleTargetPointerDown(target: FollowTarget) {
  clearPressTimer(target);
  pressTimers[target] = setTimeout(() => {
    pressTimers[target] = null;
    activateTarget(target, true);
  }, LONG_PRESS_MS);
}

function handleTargetPointerUp(target: FollowTarget) {
  if (!clearPressTimer(target)) {
    return;
  }

  activateTarget(target, false);
}

function handleTargetPointerLeave(target: FollowTarget) {
  clearPressTimer(target);
}

function activateTarget(target: FollowTarget, follow: boolean) {
  if (target === "vehicle") {
    pendingDeviceAction = null;
    const lngLat = asLngLat(vehicleLat, vehicleLon);
    if (!lngLat) {
      toast.error("No vehicle position");
      return;
    }

    followTarget = follow ? "vehicle" : null;
    if (follow) {
      toast.success("Following vehicle");
      return;
    }

    flyToCoordinates(lngLat);
    return;
  }

  if (target === "home") {
    pendingDeviceAction = null;
    const lngLat = asLngLat(homeLat, homeLon);
    if (!lngLat) {
      toast.error("No home position");
      return;
    }

    followTarget = follow ? "home" : null;
    if (follow) {
      toast.success("Following home location");
      return;
    }

    flyToCoordinates(lngLat);
    return;
  }

  devicePermissionDenied = false;

  if (!deviceLocationSupported || !browserGeolocationSupported()) {
    deviceLocationSupported = false;
    return;
  }

  if (!ensureDeviceLocationWatch()) {
    if (!deviceLocationSupported) {
      return;
    }

    toast.error("Location permission was denied — enable it in system settings");
    return;
  }

  if (deviceLocation) {
    followTarget = follow ? "device" : null;
    const lngLat: [number, number] = [deviceLocation.longitude_deg, deviceLocation.latitude_deg];
    if (follow) {
      toast.success("Following my location");
      return;
    }

    flyToCoordinates(lngLat);
    return;
  }

  followTarget = null;
  pendingDeviceAction = { follow };
}

function preventContextMenu(event: MouseEvent) {
  event.preventDefault();
}

function buildPathGeoJson(
  path: Array<{ lat: number; lon: number }>,
): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: path.map((point) => [point.lon, point.lat]),
    },
  };
}
</script>

<div class="overview-map" data-testid="overview-map-root">
  <div bind:this={mapContainer} class="overview-map-container" data-testid="overview-map-surface"></div>

  <div class="map-locate-group overview-map__control-group overview-map__control-group--layers">
    <button
      aria-label="Normal map mode"
      aria-pressed={mapLayer === "normal"}
      class={["map-locate-btn", mapLayer === "normal" && "is-active"]}
      data-testid="overview-map-layer-normal"
      onclick={() => {
        mapLayer = "normal";
      }}
      title="Normal"
      type="button"
    >
      <svg aria-hidden="true" class="overview-map__icon" fill="none" viewBox="0 0 24 24">
        <path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20Z" stroke="currentColor" stroke-linejoin="round" stroke-width="1.75"></path>
        <path d="M9 4v13.5M15 6.5V20" stroke="currentColor" stroke-width="1.75"></path>
      </svg>
    </button>
    <button
      aria-label="Hybrid map mode"
      aria-pressed={mapLayer === "hybrid"}
      class={["map-locate-btn", mapLayer === "hybrid" && "is-active"]}
      data-testid="overview-map-layer-hybrid"
      onclick={() => {
        mapLayer = "hybrid";
      }}
      title="Hybrid"
      type="button"
    >
      <svg aria-hidden="true" class="overview-map__icon" fill="none" viewBox="0 0 24 24">
        <rect height="14" rx="2" stroke="currentColor" stroke-width="1.75" width="18" x="3" y="5"></rect>
        <path d="M3 10h18" stroke="currentColor" stroke-width="1.75"></path>
        <path d="M8 5v14" stroke="currentColor" stroke-width="1.75"></path>
      </svg>
    </button>
    <button
      aria-label="Satellite map mode"
      aria-pressed={mapLayer === "satellite"}
      class={["map-locate-btn", mapLayer === "satellite" && "is-active"]}
      data-testid="overview-map-layer-satellite"
      onclick={() => {
        mapLayer = "satellite";
      }}
      title="Satellite"
      type="button"
    >
      <svg aria-hidden="true" class="overview-map__icon" fill="none" viewBox="0 0 24 24">
        <path d="m9.5 14.5 5-5" stroke="currentColor" stroke-linecap="round" stroke-width="1.75"></path>
        <path d="m7.5 11.5 5 5 4-4-5-5Z" stroke="currentColor" stroke-linejoin="round" stroke-width="1.75"></path>
        <path d="M5 19l3-3M16 8l3-3M13 19h6M5 11V5" stroke="currentColor" stroke-linecap="round" stroke-width="1.75"></path>
      </svg>
    </button>
    <button
      aria-label="Toggle 3D mode"
      aria-pressed={terrainModeEnabled}
      class={["map-locate-btn", terrainModeEnabled && "is-active"]}
      data-testid="overview-map-toggle-3d"
      onclick={() => {
        terrainModeEnabled = !terrainModeEnabled;
      }}
      title="3D"
      type="button"
    >
      <span class="overview-map__button-text">3D</span>
    </button>
  </div>

  <div class="map-locate-group overview-map__control-group overview-map__control-group--targets">
    {#if deviceLocationSupported}
      <button
        aria-label="My location"
        aria-pressed={followTarget === "device"}
        class={["map-locate-btn", followTarget === "device" && "is-active"]}
        data-testid="overview-map-target-device"
        oncontextmenu={preventContextMenu}
        onpointerdown={() => handleTargetPointerDown("device")}
        onpointerleave={() => handleTargetPointerLeave("device")}
        onpointerup={() => handleTargetPointerUp("device")}
        title="My Location (hold to follow)"
        type="button"
      >
        <svg aria-hidden="true" class="overview-map__icon" fill="none" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.75"></circle>
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" stroke="currentColor" stroke-linecap="round" stroke-width="1.75"></path>
        </svg>
      </button>
    {/if}
    <button
      aria-label="Home location"
      aria-pressed={followTarget === "home"}
      class={["map-locate-btn", followTarget === "home" && "is-active"]}
      data-testid="overview-map-target-home"
      oncontextmenu={preventContextMenu}
      onpointerdown={() => handleTargetPointerDown("home")}
      onpointerleave={() => handleTargetPointerLeave("home")}
      onpointerup={() => handleTargetPointerUp("home")}
      title="Home Location (hold to follow)"
      type="button"
    >
      <svg aria-hidden="true" class="overview-map__icon" fill="none" viewBox="0 0 24 24">
        <path d="M4 10.5 12 4l8 6.5" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75"></path>
        <path d="M6.5 9.5V20h11V9.5" stroke="currentColor" stroke-linejoin="round" stroke-width="1.75"></path>
      </svg>
    </button>
    <button
      aria-label="Vehicle location"
      aria-pressed={followTarget === "vehicle"}
      class={["map-locate-btn", followTarget === "vehicle" && "is-active"]}
      data-testid="overview-map-target-vehicle"
      oncontextmenu={preventContextMenu}
      onpointerdown={() => handleTargetPointerDown("vehicle")}
      onpointerleave={() => handleTargetPointerLeave("vehicle")}
      onpointerup={() => handleTargetPointerUp("vehicle")}
      title="Vehicle Location (hold to follow)"
      type="button"
    >
      <svg aria-hidden="true" class="overview-map__icon" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2 21 22l-9-4-9 4Z"></path>
      </svg>
    </button>
  </div>
</div>

<style>
  .overview-map {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .overview-map-container {
    width: 100%;
    height: 100%;
  }

  .overview-map__control-group--layers {
    top: 12px;
    left: 12px;
    right: auto;
    bottom: auto;
  }

  .overview-map__control-group--targets {
    right: 12px;
    bottom: 12px;
  }

  .overview-map__icon {
    width: 16px;
    height: 16px;
  }

  .overview-map__button-text {
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
</style>
