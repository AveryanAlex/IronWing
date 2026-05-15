<script lang="ts">
import { Home, Layers, LocateFixed, Map as MapIcon, Navigation, Satellite } from "lucide-svelte";
import { onMount } from "svelte";
import { toast } from "svelte-sonner";
import maplibregl, {
  type Map as MapLibreMap,
  type MapMouseEvent,
  type MapStyleImageMissingEvent,
  type Marker,
} from "maplibre-gl";

import { startGuidedSession, updateGuidedSession, type GuidedDomain } from "../../guided";
import type { HomePosition, MissionItem, MissionPlan } from "../../mission";
import { commandPosition, geoPoint3dLatLon } from "../../lib/mavkit-types";
import type { TypedDraftItem, TypedDraftPreview } from "../../lib/mission-draft-typed";
import { buildMissionRenderFeatures } from "../../lib/mission-path-render";
import { resolveVehicleIconKind, type VehicleIconKind } from "../../lib/overview/vehicle-icon";
import {
  createMarkerMotion,
  unwrapAngleDeg,
  type LngLatTuple,
} from "../../lib/map-marker-motion";
import {
  applyMapLayerMode,
  createDeviceMarkerElement,
  createHomeMarkerElement,
  createVehicleMarkerElement,
  ensureMapFoundation,
  ensureMissionPathLayers,
  getFirstNonFillLayerId,
  getMapLayerIds,
  OPENFREEMAP_BRIGHT_STYLE_URL,
  resolveMapFoundationIds,
  setMapTerrain,
  setVehicleMarkerHeading,
  setVehicleMarkerIcon,
  updateMissionPathSource,
  type MapLayerMode,
} from "../../lib/map";
import { createUiStateStore } from "../../lib/ui-state/ui-state";
import MapContextMenu from "../map/MapContextMenu.svelte";

type Props = {
  vehicleLat?: number;
  vehicleLon?: number;
  vehicleHeading?: number;
  mavType?: number;
  homeLat?: number;
  homeLon?: number;
  homeAltitude?: number;
  missionPath?: Array<{ lat: number; lon: number }>;
  missionPlan?: MissionPlan | null;
  currentMissionIndex?: number | null;
  guided?: GuidedDomain | null;
  currentAltitudeM?: number;
};

type FollowTarget = "device" | "home" | "vehicle";
type DeviceLocation = {
  latitude_deg: number;
  longitude_deg: number;
  accuracy_m: number;
};
type PendingDeviceAction = {
  follow: boolean;
};
type ContextMenuState = {
  x: number;
  y: number;
  lat: number;
  lon: number;
} | null;
type MissionMarkerSpec = {
  index: number;
  latitude_deg: number;
  longitude_deg: number;
};

const DEFAULT_CENTER: [number, number] = [8.545594, 47.397742];
const MAP_FOUNDATION_OPTIONS = { namespace: "overview" } as const;
const LONG_PRESS_MS = 500;

let {
  vehicleLat,
  vehicleLon,
  vehicleHeading = 0,
  mavType,
  homeLat,
  homeLon,
  homeAltitude,
  missionPath = [],
  missionPlan = null,
  currentMissionIndex = null,
  guided = null,
  currentAltitudeM,
}: Props = $props();

const iconKind = $derived<VehicleIconKind>(resolveVehicleIconKind(mavType));
const missionHome = $derived.by<HomePosition | null>(() => toHomePosition(homeLat, homeLon, homeAltitude));
const missionRenderItems = $derived.by<TypedDraftItem[]>(() => missionPlanToDraftItems(missionPlan, missionPath));
const missionRenderFeatures = $derived.by(() =>
  buildMissionRenderFeatures(missionHome, missionRenderItems, { currentSeq: currentMissionIndex }),
);
const missionMarkerSpecs = $derived.by<MissionMarkerSpec[]>(() => missionPlanToMarkerSpecs(missionPlan));

const overviewUiState = createUiStateStore({
  storage: typeof localStorage === "undefined" ? null : localStorage,
});

let mapContainer = $state<HTMLDivElement | null>(null);
let mapLayer = $state<MapLayerMode>("normal");
let followTarget = $state<FollowTarget | null>(overviewUiState.getOverviewFollow());

$effect(() => {
  overviewUiState.setOverviewFollow(followTarget);
});
let terrainModeEnabled = $state(false);
let styleLoaded = $state(false);
let deviceLocation = $state<DeviceLocation | null>(null);
let deviceLocationSupported = $state(browserGeolocationSupported());
let devicePermissionDenied = $state(false);
let pendingDeviceAction = $state<PendingDeviceAction | null>(null);
let contextMenu = $state<ContextMenuState>(null);
let guidedCommandPending = $state(false);

// Held as plain variables rather than $state to avoid reactive proxy wrapping
// of MapLibre's internal object graph, which would break its methods.
let map: MapLibreMap | null = null;
let vehicleMarker: Marker | null = null;
let homeMarker: Marker | null = null;
let deviceMarker: Marker | null = null;
let missionMarkers = new Map<number, Marker>();
let baseLayerIds: string[] = [];
let programmaticMovePending = false;
let deviceWatchId: number | null = null;
let appliedTerrainMode: boolean | null = null;
let vehicleMarkerAttached = false;
let homeMarkerAttached = false;
let deviceMarkerAttached = false;
let renderedVehicleHeadingDeg: number | null = null;
const vehicleMotion = createMarkerMotion();

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
    style: OPENFREEMAP_BRIGHT_STYLE_URL,
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

  const vehicleElement = createVehicleMarkerElement({ iconKind });
  vehicleMarker = new maplibregl.Marker({ element: vehicleElement, anchor: "center" });

  const homeElement = createHomeMarkerElement();
  homeMarker = new maplibregl.Marker({ element: homeElement, anchor: "center" });

  const deviceElement = createDeviceMarkerElement();
  deviceMarker = new maplibregl.Marker({ element: deviceElement, anchor: "center" });

  map.on("movestart", () => {
    if (programmaticMovePending) {
      programmaticMovePending = false;
      return;
    }

    followTarget = null;
    pendingDeviceAction = null;
    contextMenu = null;
  });

  map.on("contextmenu", handleMapContextMenu);
  map.on("styleimagemissing", handleMapStyleImageMissing);

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
    clearMissionMarkers();
    map?.remove();
    vehicleMotion.reset();
    map = null;
    vehicleMarker = null;
    homeMarker = null;
    deviceMarker = null;
    renderedVehicleHeadingDeg = null;
    styleLoaded = false;
    baseLayerIds = [];
    vehicleMarkerAttached = false;
    homeMarkerAttached = false;
    deviceMarkerAttached = false;
  };
});

$effect(() => {
  if (!styleLoaded || !map) return;
  applyMapLayerMode(map, mapLayer, { ...MAP_FOUNDATION_OPTIONS, baseLayerIds });
});

$effect(() => {
  if (!styleLoaded || !map) return;
  applyTerrainMode(map, terrainModeEnabled);
});

$effect(() => {
  if (!styleLoaded || !map) return;
  updateMissionPathSource(map, missionRenderFeatures);
});

$effect(() => {
  syncMissionMarkers(missionMarkerSpecs, currentMissionIndex);
});

$effect(() => {
  if (!vehicleMarker) return;
  const el = vehicleMarker.getElement();
  if (!el) return;
  setVehicleMarkerIcon(el, { iconKind });
  if (renderedVehicleHeadingDeg != null) {
    setVehicleMarkerHeading(el, renderedVehicleHeadingDeg);
  }
});

$effect(() => {
  const lngLat = asLngLat(vehicleLat, vehicleLon);
  if (!vehicleMarker || !lngLat) {
    if (vehicleMarker && vehicleMarkerAttached && !lngLat) {
      vehicleMotion.reset();
      renderedVehicleHeadingDeg = null;
      vehicleMarker.remove();
      vehicleMarkerAttached = false;
      if (followTarget === "vehicle") {
        followTarget = null;
      }
    }
    return;
  }

  if (vehicleMarkerAttached) {
    vehicleMotion.animateTo(vehicleMarker, lngLat);
  } else {
    vehicleMotion.setInstant(vehicleMarker, lngLat);
  }
  if (map && !vehicleMarkerAttached) {
    vehicleMarker.addTo(map);
    vehicleMarkerAttached = true;
  }
  if (followTarget === "vehicle") {
    easeToCoordinates(lngLat);
  }
});

$effect(() => {
  applyVehicleHeading(vehicleHeading);
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

function asLngLat(latitude?: number, longitude?: number): LngLatTuple | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return [Number(longitude), Number(latitude)];
}

function toHomePosition(latitude?: number, longitude?: number, altitude?: number): HomePosition | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    latitude_deg: Number(latitude),
    longitude_deg: Number(longitude),
    altitude_m: Number.isFinite(altitude) ? Number(altitude) : 0,
  };
}

function missionPlanToDraftItems(
  plan: MissionPlan | null,
  fallbackPath: Array<{ lat: number; lon: number }>,
): TypedDraftItem[] {
  const items = plan?.items ?? fallbackPath.map(createMissionPathFallbackItem);
  return items.map((item, index) => ({
    uiId: index + 1,
    index,
    document: item,
    readOnly: false,
    preview: missionItemPreview(item),
  }));
}

function missionPlanToMarkerSpecs(plan: MissionPlan | null): MissionMarkerSpec[] {
  if (!plan) {
    return [];
  }

  const specs: MissionMarkerSpec[] = [];
  plan.items.forEach((item, index) => {
    const coordinate = missionItemCoordinate(item);
    if (!coordinate) {
      return;
    }

    specs.push({ index, ...coordinate });
  });
  return specs;
}

function missionItemPreview(item: MissionItem): TypedDraftPreview {
  const coordinate = missionItemCoordinate(item);
  return {
    latitude_deg: coordinate?.latitude_deg ?? null,
    longitude_deg: coordinate?.longitude_deg ?? null,
    altitude_m: null,
  };
}

function missionItemCoordinate(item: MissionItem): Omit<MissionMarkerSpec, "index"> | null {
  const position = commandPosition(item.command);
  if (!position) {
    return null;
  }

  const coordinate = geoPoint3dLatLon(position);
  if (!Number.isFinite(coordinate.latitude_deg) || !Number.isFinite(coordinate.longitude_deg)) {
    return null;
  }

  return coordinate;
}

function createMissionPathFallbackItem(point: { lat: number; lon: number }): MissionItem {
  return {
    command: {
      Nav: {
        Waypoint: {
          position: {
            RelHome: {
              latitude_deg: point.lat,
              longitude_deg: point.lon,
              relative_alt_m: 25,
            },
          },
          hold_time_s: 0,
          acceptance_radius_m: 1,
          pass_radius_m: 0,
          yaw_deg: 0,
        },
      },
    },
    current: false,
    autocontinue: true,
  };
}

function handleMapContextMenu(event: MapMouseEvent & { originalEvent: MouseEvent }) {
  if (!mapContainer) {
    return;
  }

  event.preventDefault();
  event.originalEvent.preventDefault();
  const rect = mapContainer.getBoundingClientRect();
  contextMenu = {
    x: event.originalEvent.clientX - rect.left,
    y: event.originalEvent.clientY - rect.top,
    lat: event.lngLat.lat,
    lon: event.lngLat.lng,
  };
}

function handleMapStyleImageMissing(event: MapStyleImageMissingEvent) {
  if (!map || map.hasImage(event.id)) return;

  map.addImage(event.id, { width: 1, height: 1, data: new Uint8Array(4) });
}

async function handleFlyHere(latitude_deg: number, longitude_deg: number) {
  const altitude_m = Number.isFinite(currentAltitudeM) ? Number(currentAltitudeM) : 25;
  const session = { kind: "goto" as const, latitude_deg, longitude_deg, altitude_m };
  const command = guided?.value?.session?.kind === "goto" ? updateGuidedSession : startGuidedSession;

  guidedCommandPending = true;
  try {
    const result = await command({ session });
    if (result.result === "rejected") {
      toast.error(result.failure.reason.message);
      return;
    }

    contextMenu = null;
    toast.success("Guided target sent");
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error));
  } finally {
    guidedCommandPending = false;
  }
}

function syncMissionMarkers(specs: MissionMarkerSpec[], currentIndex: number | null) {
  if (!map) {
    clearMissionMarkers();
    return;
  }

  const expected = new Set(specs.map((spec) => spec.index));
  for (const [index, marker] of missionMarkers) {
    if (!expected.has(index)) {
      marker.remove();
      missionMarkers.delete(index);
    }
  }

  for (const spec of specs) {
    const lngLat = asLngLat(spec.latitude_deg, spec.longitude_deg);
    if (!lngLat) {
      const marker = missionMarkers.get(spec.index);
      marker?.remove();
      missionMarkers.delete(spec.index);
      continue;
    }

    let marker = missionMarkers.get(spec.index);
    if (!marker) {
      const element = createMissionMarkerElement(spec.index);
      marker = new maplibregl.Marker({ element, anchor: "center" });
      missionMarkers.set(spec.index, marker);
      marker.setLngLat(lngLat).addTo(map);
    } else {
      marker.setLngLat(lngLat);
    }

    updateMissionMarkerElement(marker.getElement(), spec.index, currentIndex);
  }
}

function createMissionMarkerElement(index: number): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.addEventListener("click", (event) => event.stopPropagation());
  updateMissionMarkerElement(element, index, null);
  return element;
}

function updateMissionMarkerElement(element: HTMLElement, index: number, currentIndex: number | null) {
  const isCurrent = currentIndex !== null && index === currentIndex;
  const isNext = currentIndex !== null && index === currentIndex + 1;
  element.className = ["mission-pin", isCurrent && "is-current", isNext && "is-next"].filter(Boolean).join(" ");
  element.textContent = String(index + 1);
  element.setAttribute("aria-label", `Mission item ${index + 1}${isCurrent ? " current" : isNext ? " next" : ""}`);
}

function clearMissionMarkers() {
  for (const marker of missionMarkers.values()) {
    marker.remove();
  }
  missionMarkers.clear();
}

function applyVehicleHeading(headingDeg: number) {
  if (!vehicleMarker) return;

  renderedVehicleHeadingDeg = unwrapAngleDeg(renderedVehicleHeadingDeg, headingDeg);
  setVehicleMarkerHeading(vehicleMarker.getElement(), renderedVehicleHeadingDeg);
}

function ensureStyleExtensions(currentMap: MapLibreMap) {
  const foundationIds = resolveMapFoundationIds(MAP_FOUNDATION_OPTIONS);
  baseLayerIds = getMapLayerIds(currentMap, { excludeLayerIds: Object.values(foundationIds) });

  ensureMapFoundation(currentMap, {
    ...MAP_FOUNDATION_OPTIONS,
    satelliteBeforeLayerId: getFirstNonFillLayerId(currentMap),
  });
  ensureMissionPathLayers(currentMap);
  updateMissionPathSource(currentMap, missionRenderFeatures);
}

function applyTerrainMode(currentMap: MapLibreMap, enabled: boolean) {
  const previouslyEnabled = appliedTerrainMode;
  if (appliedTerrainMode === enabled) {
    return;
  }

  appliedTerrainMode = enabled;
  setMapTerrain(currentMap, enabled, MAP_FOUNDATION_OPTIONS);

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
</script>

<div class="overview-map" data-testid="overview-map-root">
  <div bind:this={mapContainer} class="overview-map-container" data-testid="overview-map-surface"></div>

  {#if contextMenu}
    <MapContextMenu
      x={contextMenu.x}
      y={contextMenu.y}
      lat={contextMenu.lat}
      lon={contextMenu.lon}
      flyHereDisabled={guidedCommandPending}
      onFlyHere={handleFlyHere}
      onClose={() => {
        contextMenu = null;
      }}
    />
  {/if}

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
      <MapIcon aria-hidden="true" size={16} />
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
      <Layers aria-hidden="true" size={16} />
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
      <Satellite aria-hidden="true" size={16} />
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
        <LocateFixed aria-hidden="true" size={16} />
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
      <Home aria-hidden="true" size={16} />
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
      <Navigation aria-hidden="true" size={16} />
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

  .overview-map__button-text {
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  :global(.overview-map .mission-pin.is-next) {
    border-color: var(--color-warning);
    box-shadow:
      0 0 0 2px rgba(255, 176, 32, 0.35),
      0 2px 12px rgba(0, 0, 0, 0.35);
    transform: scale(1.04);
  }
</style>
