<script lang="ts">
import { Navigation } from "lucide-svelte";
import { toast } from "svelte-sonner";
import * as maplibregl from "maplibre-gl";
import type {
  Map as MapLibreMap,
  MapMouseEvent,
  MapStyleImageMissingEvent,
  Marker,
} from "maplibre-gl";

import { startGuidedSession, updateGuidedSession, type GuidedDomain } from "../../../guided";
import type { HomePosition, MissionPlan } from "../../../mission";
import { trackAnalytics } from "../../../lib/analytics/client";
import { buildMissionRenderFeatures } from "../../../lib/mission-path-render";
import { resolveVehicleIconKind, type VehicleIconKind } from "../../../lib/overview/vehicle-icon";
import {
  type LngLatTuple,
} from "../../../lib/map-marker-motion";
import {
  applyMapLayerMode,
  createDeviceMarkerElement,
  createGuidedTargetMarkerElement,
  createHomeMarkerElement,
  ensureBuildingExtrusionLayer,
  ensureMapFoundation,
  ensureMissionPathLayers,
  getFirstNonFillLayerId,
  getMapLayerIds,
  OPENFREEMAP_BRIGHT_STYLE_URL,
  resolveMapFoundationIds,
  setMapTerrain,
  updateGuidedTargetMarkerElement,
  updateMissionPathSource,
  type MapLayerMode,
} from "../../../lib/map";
import { createLiveVehicleOverlay } from "../../../lib/map/live-vehicle-overlay";
import {
  createMissionMarkerOverlay,
  missionPlanToDraftItems,
  missionPlanToMarkerSpecs,
  type MissionMarkerSpec,
} from "../../../lib/map/mission-plan-overlay";
import { createUiStateStore } from "../../../lib/ui-state/ui-state";
import BaseMap from "../../map/components/BaseMap.svelte";
import MapContextMenu from "../../map/components/MapContextMenu.svelte";
import MapSurfaceControls from "../../map/components/MapSurfaceControls.svelte";
import type { MapContextMenuAction } from "../../map/components/map-context-menu-types";

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
type GuidedTargetSpec = {
  latitude_deg: number;
  longitude_deg: number;
  altitude_msl_m: number;
};

const DEFAULT_CENTER: [number, number] = [8.545594, 47.397742];
const MAP_FOUNDATION_OPTIONS = { namespace: "overview" } as const;
const MAP_CONTEXT_LONG_PRESS_MS = 650;
const MAP_CONTEXT_MOVE_CANCEL_PX = 12;

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
const missionRenderItems = $derived.by(() => missionPlanToDraftItems(missionPlan, missionPath));
const missionRenderFeatures = $derived.by(() =>
  buildMissionRenderFeatures(missionHome, missionRenderItems, { currentSeq: currentMissionIndex }),
);
const missionMarkerSpecs = $derived.by<MissionMarkerSpec[]>(() => missionPlanToMarkerSpecs(missionPlan));
const guidedTarget = $derived.by<GuidedTargetSpec | null>(() => guidedDomainToTarget(guided));
const contextMenuActions = $derived.by<MapContextMenuAction[]>(() => [
  {
    id: "fly-here",
    label: "Fly here",
    disabled: guidedCommandPending,
    icon: flyHereMenuIcon,
    testId: "overview-map-fly-here",
    onSelect: (point) => {
      void handleFlyHere(point.latitudeDeg, point.longitudeDeg);
    },
  },
]);

const overviewUiState = createUiStateStore({
  storage: typeof localStorage === "undefined" ? null : localStorage,
});

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
let mapSurfaceElement: HTMLElement | null = null;
let homeMarker: Marker | null = null;
let deviceMarker: Marker | null = null;
let guidedTargetMarker: Marker | null = null;
let baseLayerIds: string[] = [];
let programmaticMovePending = false;
let deviceWatchId: number | null = null;
let appliedTerrainMode: boolean | null = null;
let homeMarkerAttached = false;
let deviceMarkerAttached = false;
let guidedTargetMarkerAttached = false;
const vehicleOverlay = createLiveVehicleOverlay(
  (element: HTMLElement) => new maplibregl.Marker({ element, anchor: "center" }),
);
const missionMarkerOverlay = createMissionMarkerOverlay(
  (element: HTMLElement) => new maplibregl.Marker({ element, anchor: "center" }),
);
let mapContextPressTimer: ReturnType<typeof setTimeout> | null = null;
let mapContextPressStart: { pointerId: number; clientX: number; clientY: number } | null = null;

function createOverviewMapOptions() {
  const initialCenter = asLngLat(vehicleLat, vehicleLon)
    ?? asLngLat(homeLat, homeLon)
    ?? guidedTargetLngLat(guidedTarget)
    ?? DEFAULT_CENTER;

  return {
    style: OPENFREEMAP_BRIGHT_STYLE_URL,
    center: initialCenter,
    zoom: 15,
    pitch: 0,
    maxPitch: 85,
    attributionControl: false,
  };
}

function handleMapReady(createdMap: MapLibreMap, container: HTMLElement) {
  map = createdMap;
  mapSurfaceElement = container;
  styleLoaded = false;

  map.addControl(
    new maplibregl.NavigationControl({ showZoom: true, showCompass: true, visualizePitch: true }),
    "top-right",
  );

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
    clearMapContextPressTimer();
    stopDeviceLocationWatch();
    vehicleOverlay.remove();
    homeMarker?.remove();
    deviceMarker?.remove();
    guidedTargetMarker?.remove();
    missionMarkerOverlay.clear();
    map = null;
    mapSurfaceElement = null;
    homeMarker = null;
    deviceMarker = null;
    guidedTargetMarker = null;
    styleLoaded = false;
    baseLayerIds = [];
    homeMarkerAttached = false;
    deviceMarkerAttached = false;
    guidedTargetMarkerAttached = false;
  };
}

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
  missionMarkerOverlay.sync(map, missionMarkerSpecs, currentMissionIndex);
});

$effect(() => {
  syncGuidedTargetMarker(guidedTarget);
});

$effect(() => {
  const lngLat = asLngLat(vehicleLat, vehicleLon);
  vehicleOverlay.sync({ map, lngLat, headingDeg: vehicleHeading, iconKind });
  if (!lngLat) {
    if (followTarget === "vehicle") {
      followTarget = null;
    }
    return;
  }

  if (followTarget === "vehicle") {
    easeToCoordinates(lngLat);
  }
});

$effect(() => {
  vehicleOverlay.applyHeading(vehicleHeading);
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

function guidedDomainToTarget(domain: GuidedDomain | null): GuidedTargetSpec | null {
  const state = domain?.value;
  const session = state?.session;
  if (state?.status !== "active" || session?.kind !== "goto") {
    return null;
  }

  if (!Number.isFinite(session.latitude_deg) || !Number.isFinite(session.longitude_deg)) {
    return null;
  }

  return {
    latitude_deg: Number(session.latitude_deg),
    longitude_deg: Number(session.longitude_deg),
    altitude_msl_m: Number.isFinite(session.altitude_msl_m) ? Number(session.altitude_msl_m) : 0,
  };
}

function guidedTargetLngLat(target: GuidedTargetSpec | null): LngLatTuple | null {
  return target ? asLngLat(target.latitude_deg, target.longitude_deg) : null;
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

function handleMapContextMenu(event: MapMouseEvent & { originalEvent: MouseEvent }) {
  if (!map) {
    return;
  }

  event.preventDefault();
  event.originalEvent.preventDefault();
  clearMapContextPressTimer();
  openMapContextMenu(event.originalEvent.clientX, event.originalEvent.clientY, event.lngLat.lat, event.lngLat.lng);
}

function openMapContextMenu(clientX: number, clientY: number, lat: number, lon: number) {
  const container = mapSurfaceElement;
  if (!container) return;

  followTarget = null;
  pendingDeviceAction = null;
  contextMenu = {
    x: clientX,
    y: clientY,
    lat,
    lon,
  };
}

function handleMapSurfacePointerDown(event: PointerEvent) {
  if (event.pointerType === "mouse" || event.button !== 0 || !map) {
    return;
  }

  // Some touch browsers synthesize a native contextmenu after long-press, but
  // WebViews and MapLibre gesture handling are inconsistent. Keep the native
  // contextmenu path above, and provide this deterministic touch fallback.
  clearMapContextPressTimer();
  mapContextPressStart = {
    pointerId: event.pointerId,
    clientX: event.clientX,
    clientY: event.clientY,
  };
  mapContextPressTimer = setTimeout(() => {
    if (!map || !mapContextPressStart) return;

    const lngLat = map.unproject(clientPointToMapPoint(mapContextPressStart.clientX, mapContextPressStart.clientY));
    openMapContextMenu(mapContextPressStart.clientX, mapContextPressStart.clientY, lngLat.lat, lngLat.lng);
    mapContextPressTimer = null;
    mapContextPressStart = null;
  }, MAP_CONTEXT_LONG_PRESS_MS);
}

function handleMapSurfacePointerMove(event: PointerEvent) {
  if (!mapContextPressStart || event.pointerId !== mapContextPressStart.pointerId) {
    return;
  }

  const dx = event.clientX - mapContextPressStart.clientX;
  const dy = event.clientY - mapContextPressStart.clientY;
  if (Math.hypot(dx, dy) > MAP_CONTEXT_MOVE_CANCEL_PX) {
    clearMapContextPressTimer();
  }
}

function handleMapSurfacePointerEnd(event: PointerEvent) {
  if (!mapContextPressStart || event.pointerId !== mapContextPressStart.pointerId) {
    return;
  }

  clearMapContextPressTimer();
}

function clearMapContextPressTimer() {
  if (mapContextPressTimer !== null) {
    clearTimeout(mapContextPressTimer);
    mapContextPressTimer = null;
  }
  mapContextPressStart = null;
}

function clientPointToMapPoint(clientX: number, clientY: number): [number, number] {
  const container = mapSurfaceElement;
  if (!container) {
    return [clientX, clientY];
  }

  const rect = container.getBoundingClientRect();
  return [clientX - rect.left, clientY - rect.top];
}

function handleMapStyleImageMissing(event: MapStyleImageMissingEvent) {
  if (!map || map.hasImage(event.id)) return;

  map.addImage(event.id, { width: 1, height: 1, data: new Uint8Array(4) });
}

async function handleFlyHere(latitude_deg: number, longitude_deg: number) {
  const altitude_msl_m = resolveGuidedTargetAltitudeMsl();
  if (altitude_msl_m === null) {
    toast.error("Guided target altitude is unavailable");
    return;
  }

  const session = { kind: "goto" as const, latitude_deg, longitude_deg, altitude_msl_m };
  const command = guided?.value?.session?.kind === "goto" ? updateGuidedSession : startGuidedSession;

  guidedCommandPending = true;
  trackAnalytics("guided_command_requested", { command: "goto", source: "overview_map" });
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

function resolveGuidedTargetAltitudeMsl(): number | null {
  if (Number.isFinite(currentAltitudeM)) {
    return Number(currentAltitudeM);
  }

  if (Number.isFinite(homeAltitude)) {
    return Number(homeAltitude) + 25;
  }

  return null;
}

function syncGuidedTargetMarker(target: GuidedTargetSpec | null) {
  const lngLat = guidedTargetLngLat(target);
  if (!map || !target || !lngLat) {
    if (guidedTargetMarkerAttached) {
      guidedTargetMarker?.remove();
      guidedTargetMarkerAttached = false;
    }
    return;
  }

  if (!guidedTargetMarker) {
    guidedTargetMarker = new maplibregl.Marker({
      element: createGuidedTargetMarkerElement({ altitudeM: target.altitude_msl_m }),
      anchor: "bottom",
    });
  } else {
    updateGuidedTargetMarkerElement(guidedTargetMarker.getElement(), { altitudeM: target.altitude_msl_m });
  }

  if (guidedTargetMarkerAttached) {
    guidedTargetMarker.setLngLat(lngLat);
    return;
  }

  guidedTargetMarker.setLngLat(lngLat).addTo(map);
  guidedTargetMarkerAttached = true;
}

function ensureStyleExtensions(currentMap: MapLibreMap) {
  const foundationIds = resolveMapFoundationIds(MAP_FOUNDATION_OPTIONS);

  ensureMapFoundation(currentMap, {
    ...MAP_FOUNDATION_OPTIONS,
    satelliteBeforeLayerId: getFirstNonFillLayerId(currentMap),
  });
  ensureBuildingExtrusionLayer(currentMap);
  baseLayerIds = getMapLayerIds(currentMap, { excludeLayerIds: Object.values(foundationIds) });
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

function activateTarget(target: FollowTarget, follow: boolean) {
  if (target === "vehicle") {
    pendingDeviceAction = null;
    const lngLat = asLngLat(vehicleLat, vehicleLon);
    if (!lngLat) {
      toast.error("No vehicle position");
      return;
    }

    followTarget = follow ? "vehicle" : null;
    trackAnalytics("map_follow_changed", { target: follow ? "vehicle" : "none" });
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
    trackAnalytics("map_follow_changed", { target: follow ? "home" : "none" });
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
    trackAnalytics("map_follow_changed", { target: follow ? "device" : "none" });
    const lngLat: [number, number] = [deviceLocation.longitude_deg, deviceLocation.latitude_deg];
    if (follow) {
      toast.success("Following my location");
      return;
    }

    flyToCoordinates(lngLat);
    return;
  }

  followTarget = null;
  trackAnalytics("map_follow_changed", { target: follow ? "device_pending" : "none" });
  pendingDeviceAction = { follow };
}

</script>

{#snippet flyHereMenuIcon()}
  <Navigation aria-hidden="true" size={14} />
{/snippet}

<div class="overview-map" data-testid="overview-map-root">
  <BaseMap
    aria-label="Interactive map"
    data-testid="overview-map-surface"
    options={createOverviewMapOptions()}
    onMapReady={handleMapReady}
    onpointercancel={handleMapSurfacePointerEnd}
    onpointerdown={handleMapSurfacePointerDown}
    onpointerleave={handleMapSurfacePointerEnd}
    onpointermove={handleMapSurfacePointerMove}
    onpointerup={handleMapSurfacePointerEnd}
    role="application"
  />

  {#if contextMenu}
    <MapContextMenu
      x={contextMenu.x}
      y={contextMenu.y}
      lat={contextMenu.lat}
      lon={contextMenu.lon}
      actions={contextMenuActions}
      testId="overview-map-context-menu"
      coordinatesTestId="overview-map-context-menu-coordinates"
      onClose={() => {
        contextMenu = null;
      }}
    />
  {/if}

  <MapSurfaceControls
    mapLayerMode={mapLayer}
    {terrainModeEnabled}
    deviceTargetVisible={deviceLocationSupported}
    activeCameraTarget={followTarget}
    testIds={{
      layerNormal: "overview-map-layer-normal",
      layerHybrid: "overview-map-layer-hybrid",
      layerSatellite: "overview-map-layer-satellite",
      terrain: "overview-map-toggle-3d",
      targetDevice: "overview-map-target-device",
      targetHome: "overview-map-target-home",
      targetVehicle: "overview-map-target-vehicle",
    }}
    onSelectLayerMode={(mode) => {
      mapLayer = mode;
    }}
    onToggleTerrainMode={() => {
      terrainModeEnabled = !terrainModeEnabled;
    }}
    onActivateCameraTarget={(target, activation) => activateTarget(target, activation.follow)}
  />
</div>

<style>
  .overview-map {
    position: relative;
    width: 100%;
    height: 100%;
  }

  :global(.overview-map .mission-pin.is-next) {
    border-color: var(--color-warning);
    box-shadow:
      0 0 0 2px rgba(255, 176, 32, 0.35),
      0 2px 12px rgba(0, 0, 0, 0.35);
    transform: scale(1.04);
  }
</style>
