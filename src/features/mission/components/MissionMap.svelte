<script lang="ts">
import { onDestroy } from "svelte";
import { Home, MapPinPlus } from "lucide-svelte";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";

import {
  adaptMissionMapViewportToAspectRatio,
  buildMissionMapViewport,
  projectMissionMapCoordinate,
  reprojectMissionMapPoint,
  unprojectMissionMapPoint,
  type MissionMapFenceRadiusHandle,
  type MissionMapFenceRegionHandle,
  type MissionMapFenceVertexHandle,
  type MissionMapMarker,
  type MissionMapPoint,
  type MissionMapSurveyVertexHandle,
  type MissionMapView,
  type MissionMapViewport,
} from "../../../lib/mission-map-view";
import { haversineM } from "../../../lib/geo-utils";
import { localXYToLatLon } from "../../../lib/mission-coordinates";
import type { ReplayMapOverlayState } from "../../../lib/replay-map-overlay";
import {
  applyMapLayerMode,
  createDeviceMarkerElement,
  createHomeMarkerElement,
  ensureBuildingExtrusionLayer,
  ensureMapFoundation,
  getFirstNonFillLayerId,
  getMapLayerIds,
  OPENFREEMAP_BRIGHT_STYLE_URL,
  resolveMapFoundationIds,
  setMapTerrain,
  type MapLayerMode,
} from "../../../lib/map";
import { createLiveVehicleOverlay } from "../../../lib/map/live-vehicle-overlay";
import {
  minimumSurveyPointCount,
  setSurveyGeometryPoints,
  surveyGeometryKind,
  surveyGeometryPoints,
} from "../../../lib/mission-map-survey";
import { resolveSurveyGenerationBlockedReason } from "../../../lib/mission-survey-authoring";
import type { GeoPoint2d, GeoPoint3d } from "../../../lib/mavkit-types";
import type { FenceRegionType } from "../../../lib/mission-draft-typed";
import type { SurveyPatternType, SurveyRegion } from "../../../lib/survey-region";
import type {
  MissionPlannerFenceMutationResult,
  MissionPlannerMapMoveResult,
  MissionPlannerRallyMutationResult,
} from "../../../lib/stores/mission-planner";
import {
  clearMissionMapDebugSnapshot,
  publishMissionMapDebugSnapshot,
} from "../mission-map-debug";
import {
  cloneSurveyRegionSnapshot,
  positionStyle,
} from "../mission-map-render-helpers";
import {
  coordinateFromMapCenter as resolveCoordinateFromMapCenter,
  coordinateFromPointer as resolveCoordinateFromPointer,
  pointerOffset as resolvePointerOffset,
  readSurfaceDrawableBox as readElementDrawableBox,
} from "../mission-map-pointer";
import {
  remapFenceRadiusHandles,
  remapFenceRegionHandles,
  remapFenceReturnPoint,
  remapFenceVertexHandles,
  remapLabelFeatures,
  remapLineFeatures,
  remapMarkers,
  remapPolygonFeatures,
  remapSurveyHandles,
  remapSurveyVertexHandles,
} from "../mission-map-remap";
import MissionMapActionBar from "./MissionMapActionBar.svelte";
import MissionMapInteractiveLayer from "./MissionMapInteractiveLayer.svelte";
import MissionMapOverlaySvg from "./MissionMapOverlaySvg.svelte";
import MissionMapStateNotice from "./MissionMapStateNotice.svelte";
import MissionMapStatusPanel from "./MissionMapStatusPanel.svelte";
import BaseMap from "../../map/components/BaseMap.svelte";
import MapContextMenu from "../../map/components/MapContextMenu.svelte";
import MapSurfaceControls from "../../map/components/MapSurfaceControls.svelte";
import type { MapContextMenuAction } from "../../map/components/map-context-menu-types";
import { missionWorkspaceTestIds } from "../mission-workspace-test-ids";

type Props = {
  view: MissionMapView;
  fallbackReference: GeoPoint2d;
  selectedSurveyRegion: SurveyRegion | null;
  blockedReason?: string | null;
  readOnly?: boolean;
  readOnlyReason?: string | null;
  replayMapOverlay?: ReplayMapOverlayState | null;
  vehiclePosition?: MissionMapLivePosition | null;
  homePosition?: GeoPoint2d | null;
  vehicleHeadingDeg?: number | null;
  onSelectHome: () => void;
  onSelectMissionItem: (uiId: number) => void;
  onSelectRallyPoint?: (uiId: number) => MissionPlannerRallyMutationResult | unknown;
  onSelectSurveyRegion: (regionId: string) => void;
  onUpdateSurveyRegion: (regionId: string, updater: (region: SurveyRegion) => SurveyRegion) => void;
  onDeleteSurveyRegion: (regionId: string) => void;
  onMoveHome: (latitudeDeg: number, longitudeDeg: number) => MissionPlannerMapMoveResult;
  onMoveMissionItem: (uiId: number, latitudeDeg: number, longitudeDeg: number) => MissionPlannerMapMoveResult;
  onMoveRallyPoint?: (uiId: number, latitudeDeg: number, longitudeDeg: number) => MissionPlannerMapMoveResult;
  onSelectFenceRegion?: (uiId: number) => MissionPlannerFenceMutationResult | unknown;
  onSelectFenceReturnPoint?: () => MissionPlannerFenceMutationResult | unknown;
  onAddFenceRegion?: (type: FenceRegionType, latitudeDeg: number, longitudeDeg: number) => MissionPlannerFenceMutationResult | unknown;
  onSetFenceReturnPoint?: (latitudeDeg: number, longitudeDeg: number) => MissionPlannerFenceMutationResult | unknown;
  onClearFenceReturnPoint?: () => MissionPlannerFenceMutationResult | unknown;
  onMoveFenceVertex?: (uiId: number, index: number, latitudeDeg: number, longitudeDeg: number) => MissionPlannerFenceMutationResult | unknown;
  onMoveFenceCircleCenter?: (uiId: number, latitudeDeg: number, longitudeDeg: number) => MissionPlannerFenceMutationResult | unknown;
  onUpdateFenceCircleRadius?: (uiId: number, radiusM: number) => MissionPlannerFenceMutationResult | unknown;
  onAddWaypointAt?: (latitudeDeg: number, longitudeDeg: number) => void;
  onSetHomeAt?: (latitudeDeg: number, longitudeDeg: number) => void;
  fillContainer?: boolean;
};

type ActiveMarkerDrag = {
  markerId: string;
  kind: "home" | "mission-item" | "rally-point";
  uiId: number | null;
  startLatitude_deg: number;
  startLongitude_deg: number;
  updateCount: number;
};

type ActiveSurveyHandleDrag = {
  handleId: string;
  regionId: string;
  index: number;
  geometryKind: "polygon" | "polyline";
  updateCount: number;
};

type ActiveFenceDrag =
  | {
    kind: "vertex";
    handleId: string;
    regionUiId: number;
    index: number;
    startLatitude_deg: number;
    startLongitude_deg: number;
    updateCount: number;
  }
  | {
    kind: "region";
    handleId: string;
    regionUiId: number;
    startLatitude_deg: number;
    startLongitude_deg: number;
    updateCount: number;
  }
  | {
    kind: "radius";
    handleId: string;
    regionUiId: number;
    startRadius_m: number;
    updateCount: number;
  }
  | {
    kind: "return-point";
    startLatitude_deg: number;
    startLongitude_deg: number;
    updateCount: number;
  };

type SurveySession = {
  mode: "draw" | "edit";
  regionId: string;
  patternType: SurveyPatternType;
  pointCountMinimum: number;
  created: boolean;
  restoreRegion: SurveyRegion | null;
};

type LocalMapMessage = {
  tone: "warning" | "info";
  text: string;
};

type MissionMapLivePosition = GeoPoint2d & {
  heading_deg?: number | null;
};

type CameraTarget = "device" | "home" | "vehicle";
type DeviceLocation = {
  latitude_deg: number;
  longitude_deg: number;
  accuracy_m: number;
};
type PendingDeviceAction = {
  follow: boolean;
};

const DEFAULT_CENTER: [number, number] = [8.545594, 47.397742];
const MAP_FOUNDATION_OPTIONS = { namespace: "mission-editor" } as const;

let {
  view,
  fallbackReference,
  selectedSurveyRegion,
  blockedReason = null,
  readOnly = false,
  readOnlyReason = null,
  replayMapOverlay = null,
  vehiclePosition = null,
  homePosition = null,
  vehicleHeadingDeg = null,
  onSelectHome,
  onSelectMissionItem,
  onSelectRallyPoint,
  onSelectSurveyRegion,
  onUpdateSurveyRegion,
  onDeleteSurveyRegion,
  onMoveHome,
  onMoveMissionItem,
  onMoveRallyPoint,
  onSelectFenceRegion,
  onSelectFenceReturnPoint,
  onAddFenceRegion,
  onSetFenceReturnPoint,
  onClearFenceReturnPoint,
  onMoveFenceVertex,
  onMoveFenceCircleCenter,
  onUpdateFenceCircleRadius,
  onAddWaypointAt,
  onSetHomeAt,
  fillContainer = false,
}: Props = $props();

let surfaceElement = $state<HTMLDivElement | null>(null);
let activeMarkerDrag = $state<ActiveMarkerDrag | null>(null);
let activeSurveyHandleDrag = $state<ActiveSurveyHandleDrag | null>(null);
let activeFenceDrag = $state<ActiveFenceDrag | null>(null);
let surveySession = $state<SurveySession | null>(null);
let fencePlacementMode = $state<FenceRegionType | "return-point" | null>(null);
let localMessage = $state<LocalMapMessage | null>(null);
let mapLayerMode = $state<MapLayerMode>("normal");
let terrainModeEnabled = $state(false);
let followTarget = $state<CameraTarget | null>(null);
let deviceLocation = $state<DeviceLocation | null>(null);
let deviceLocationSupported = $state(browserGeolocationSupported());
let devicePermissionDenied = $state(false);
let pendingDeviceAction = $state<PendingDeviceAction | null>(null);
let lastUsableViewport = $state<MissionMapViewport | null>(null);
let contextMenu = $state<{ x: number; y: number; lngLat: { lng: number; lat: number } } | null>(null);
let surfaceSize = $state({ width: 0, height: 0 });
let basemapWarning = $state<string | null>(null);
let mapCameraRevision = $state(0);

let basemap: MapLibreMap | null = null;
let homeMarker: Marker | null = null;
let deviceMarker: Marker | null = null;
let baseLayerIds: string[] = [];
let basemapLoaded = $state(false);
let basemapStyleReady = $state(false);
let initialFitApplied = false;
let homeMarkerAttached = false;
let deviceMarkerAttached = false;
let deviceWatchId: number | null = null;
let appliedTerrainMode: boolean | null = null;
let programmaticCameraMovePending = false;
const vehicleOverlay = createLiveVehicleOverlay(
  (element: HTMLElement) => new maplibregl.Marker({ element, anchor: "center" }),
);

let fallbackViewport = $derived(buildMissionMapViewport(fallbackReference, [fallbackReference]));
let replayOverlayCoordinates = $derived.by(() => {
  const coordinates = replayMapOverlay?.path.map((point) => ({
    latitude_deg: point.lat,
    longitude_deg: point.lon,
  })) ?? [];

  if (replayMapOverlay?.marker) {
    coordinates.push({
      latitude_deg: replayMapOverlay.marker.lat,
      longitude_deg: replayMapOverlay.marker.lon,
    });
  }

  return coordinates;
});
let replayOverlayViewport = $derived.by(() => {
  const reference = replayOverlayCoordinates[0] ?? null;
  return reference ? buildMissionMapViewport(reference, replayOverlayCoordinates) : null;
});
let interactiveViewport = $derived(replayOverlayViewport ?? view.viewport ?? lastUsableViewport ?? fallbackViewport);
let renderViewport = $derived.by(() => {
  if (!interactiveViewport) {
    return null;
  }

  if (surfaceSize.width <= 0 || surfaceSize.height <= 0) {
    return interactiveViewport;
  }

  return adaptMissionMapViewportToAspectRatio(interactiveViewport, surfaceSize.width / surfaceSize.height);
});
let overlayUsesBasemapProjection = $derived.by(() => {
  mapCameraRevision;
  return canUseBasemapProjection();
});
let overlayViewBox = $derived.by(() => {
  if (overlayUsesBasemapProjection && surfaceSize.width > 0 && surfaceSize.height > 0) {
    return { width: surfaceSize.width, height: surfaceSize.height };
  }

  const size = renderViewport?.viewBoxSize ?? interactiveViewport?.viewBoxSize ?? 1000;
  return { width: size, height: size };
});
let plannerHomePosition = $derived.by<GeoPoint2d | null>(() => {
  const marker = view.markers.find((candidate) => candidate.kind === "home") ?? null;
  return marker
    ? { latitude_deg: marker.latitude_deg, longitude_deg: marker.longitude_deg }
    : null;
});
let homeCameraTarget = $derived(plannerHomePosition ?? homePosition);
let vehicleLngLat = $derived(asLngLat(vehiclePosition?.latitude_deg, vehiclePosition?.longitude_deg));
let homeCameraLngLat = $derived(asLngLat(homeCameraTarget?.latitude_deg, homeCameraTarget?.longitude_deg));
let homeMarkerLngLat = $derived(plannerHomePosition ? null : asLngLat(homePosition?.latitude_deg, homePosition?.longitude_deg));
let deviceLngLat = $derived(asLngLat(deviceLocation?.latitude_deg, deviceLocation?.longitude_deg));
let followCameraLngLat = $derived.by<[number, number] | null>(() => {
  switch (followTarget) {
    case "vehicle":
      return vehicleLngLat;
    case "home":
      return homeCameraLngLat;
    case "device":
      return deviceLngLat;
    default:
      return null;
  }
});
let activeCameraTarget = $derived.by<CameraTarget | null>(() => followCameraLngLat ? followTarget : null);
let liveVehicleHeadingDeg = $derived(vehiclePosition?.heading_deg ?? vehicleHeadingDeg ?? 0);
let renderMissionLines = $derived(remapLineFeatures(view.missionLines, remapPoint));
let renderMissionPolygons = $derived(remapPolygonFeatures(view.missionPolygons, remapPoint));
let renderMissionLabels = $derived(remapLabelFeatures(view.missionLabels, remapPoint));
let renderSurveyLines = $derived(remapLineFeatures(view.surveyLines, remapPoint));
let renderSurveyPolygons = $derived(remapPolygonFeatures(view.surveyPolygons, remapPoint));
let renderFenceLines = $derived(remapLineFeatures(view.fenceLines, remapPoint));
let renderFencePolygons = $derived(remapPolygonFeatures(view.fencePolygons, remapPoint));
let renderMarkers = $derived(remapMarkers(view.markers, remapPoint));
let renderSurveyHandles = $derived(remapSurveyHandles(view.surveyHandles, remapPoint));
let renderSurveyVertexHandles = $derived(remapSurveyVertexHandles(view.surveyVertexHandles, remapPoint));
let renderFenceRegionHandles = $derived(remapFenceRegionHandles(view.fenceRegionHandles, remapPoint));
let renderFenceVertexHandles = $derived(remapFenceVertexHandles(view.fenceVertexHandles, remapPoint));
let renderFenceRadiusHandles = $derived(remapFenceRadiusHandles(view.fenceRadiusHandles, remapPoint));
let renderFenceReturnPoint = $derived(remapFenceReturnPoint(view.fenceReturnPoint, remapPoint));
let renderReplayOverlayPath = $derived.by(() => {
  if (!renderViewport || !replayMapOverlay || replayMapOverlay.path.length === 0) {
    return [];
  }

  return replayMapOverlay.path.map((point) => projectGeoCoordinate({
    latitude_deg: point.lat,
    longitude_deg: point.lon,
  }));
});
let renderReplayOverlayMarker = $derived.by(() => {
  if (!renderViewport || !replayMapOverlay?.marker) {
    return null;
  }

  return projectGeoCoordinate({
    latitude_deg: replayMapOverlay.marker.lat,
    longitude_deg: replayMapOverlay.marker.lon,
  });
});
let selectedSurveyRegionId = $derived(view.selection.kind === "survey-block" ? view.selection.regionId : null);
let selectedSurveyGenerationBlockedReason = $derived.by(() => {
  if (!selectedSurveyRegion || selectedSurveyRegionId !== selectedSurveyRegion.id) {
    return null;
  }

  return resolveSurveyGenerationBlockedReason(selectedSurveyRegion);
});
let activeSurveyPointCount = $derived.by(() => {
  if (!surveySession || !selectedSurveyRegion || selectedSurveyRegion.id !== surveySession.regionId) {
    return 0;
  }

  return surveyGeometryPoints(selectedSurveyRegion).length;
});
let diagnostics = $derived.by(() => {
  const warnings = [...view.warnings];
  if (blockedReason && (view.mode === "fence" || view.mode === "rally")) {
    warnings.push(blockedReason);
  }
  if (basemapWarning) {
    warnings.push(basemapWarning);
  }
  if (localMessage?.tone === "warning") {
    warnings.push(localMessage.text);
  }
  return [...new Set(warnings)];
});
let mapControlsPassive = $derived(surveySession !== null || fencePlacementMode !== null);

$effect(() => {
  if (view.viewport) {
    lastUsableViewport = view.viewport;
  }
});

$effect(() => {
  publishMissionMapDebugSnapshot({
    mode: view.mode,
    state: view.state,
    selection: view.selection,
    fenceSelection: view.fenceSelection,
    counts: view.counts,
    warnings: diagnostics,
    dragTargetId: activeMarkerDrag?.markerId ?? activeSurveyHandleDrag?.handleId ?? activeFenceDrag?.kind ?? null,
    dragUpdateCount: activeMarkerDrag?.updateCount ?? activeSurveyHandleDrag?.updateCount ?? activeFenceDrag?.updateCount ?? 0,
    missionGeoJson: view.missionGeoJson,
    surveyGeoJson: view.surveyGeoJson,
    fenceGeoJson: view.fenceGeoJson,
    rallyGeoJson: view.rallyGeoJson,
    drawMode: surveySession?.mode ?? "idle",
    drawPatternType: surveySession?.patternType ?? null,
    drawRegionId: surveySession?.regionId ?? null,
    drawPointCount: activeSurveyPointCount,
    fencePlacementMode,
    blockedFenceReason: view.mode === "fence" ? blockedReason : null,
    readOnlyReason,
    selectedSurveyRegionId,
    selectedRallyPointUiId: view.selection.kind === "rally-point" ? view.selection.uiId : null,
    selectedSurveyGenerationBlocked: selectedSurveyGenerationBlockedReason !== null,
    selectedSurveyGenerationMessage: selectedSurveyGenerationBlockedReason?.message ?? null,
    activeSurveyVertexCount: view.counts.surveyVertexHandles,
    surveyPreviewFeatureCount: view.counts.surveyPreviewFeatures,
    activeFenceVertexCount: view.counts.fenceVertexHandles,
    activeFenceRadiusCount: view.counts.fenceRadiusHandles,
    rallyMarkerCount: view.counts.rallyMarkers,
  });
});

onDestroy(() => {
  clearMissionMapDebugSnapshot();
});

$effect(() => {
  if (!surfaceElement) {
    surfaceSize = { width: 0, height: 0 };
    return;
  }

  const syncSurfaceSize = () => {
    const rect = readElementDrawableBox(surfaceElement);
    surfaceSize = {
      width: rect?.width ?? 0,
      height: rect?.height ?? 0,
    };
  };

  syncSurfaceSize();

  if (typeof ResizeObserver === "undefined") {
    window.addEventListener("resize", syncSurfaceSize);
    return () => {
      window.removeEventListener("resize", syncSurfaceSize);
    };
  }

  const observer = new ResizeObserver(() => {
    syncSurfaceSize();
    resizeBasemap();
  });
  observer.observe(surfaceElement);

  return () => {
    observer.disconnect();
  };
});

function createBasemapOptions() {
  return {
    style: OPENFREEMAP_BRIGHT_STYLE_URL,
    center: DEFAULT_CENTER,
    zoom: 14,
    pitch: 0,
    maxPitch: 85,
    attributionControl: false,
  };
}

function handleBasemapReady(createdBasemap: MapLibreMap) {
  basemap = createdBasemap;
  basemapLoaded = false;
  basemapStyleReady = false;
  basemapWarning = null;
  initialFitApplied = false;

  if (typeof basemap.addControl === "function" && typeof maplibregl.NavigationControl === "function") {
    basemap.addControl(
      new maplibregl.NavigationControl({ showZoom: true, showCompass: true, visualizePitch: true }),
      "top-right",
    );
  }

  if (typeof maplibregl.Marker === "function") {
    homeMarker = new maplibregl.Marker({ element: createHomeMarkerElement(), anchor: "center" });
    deviceMarker = new maplibregl.Marker({ element: createDeviceMarkerElement(), anchor: "center" });
  }

  basemap.on("movestart", handleBasemapMoveStart);
  basemap.on("move", handleBasemapCameraChange);
  basemap.on("style.load", () => {
    basemapStyleReady = true;
    ensureBasemapStyleExtensions();
  });

  basemap.on("load", () => {
    basemapLoaded = true;
    basemapStyleReady = true;
    ensureBasemapStyleExtensions();
    fitInitialBasemapToViewport();
    handleBasemapCameraChange();
  });

  basemap.on("error", () => {
    if (!basemapWarning) {
      basemapWarning = "Basemap failed to load completely. Planner overlays remain available without the map background.";
    }
  });

  return () => {
    stopDeviceLocationWatch();
    vehicleOverlay.remove();
    homeMarker?.remove();
    deviceMarker?.remove();
    basemap = null;
    homeMarker = null;
    deviceMarker = null;
    basemapLoaded = false;
    basemapStyleReady = false;
    initialFitApplied = false;
    homeMarkerAttached = false;
    deviceMarkerAttached = false;
    baseLayerIds = [];
    appliedTerrainMode = null;
    programmaticCameraMovePending = false;
  };
}

function handleBasemapError() {
  basemap = null;
  basemapLoaded = false;
  basemapStyleReady = false;
  basemapWarning = "Basemap initialization failed. Planner overlays remain available without the map background.";
}

$effect(() => {
  if (!basemapLoaded) {
    return;
  }

  fitInitialBasemapToViewport();
});

function fitInitialBasemapToViewport() {
  if (initialFitApplied) {
    return;
  }

  if (!basemap || !renderViewport) {
    return;
  }

  resizeBasemap();

  const southWest = localXYToLatLon(renderViewport.reference, renderViewport.minX_m, renderViewport.minY_m);
  const northEast = localXYToLatLon(renderViewport.reference, renderViewport.maxX_m, renderViewport.maxY_m);

  basemap.fitBounds(
    [
      [southWest.lon, southWest.lat],
      [northEast.lon, northEast.lat],
    ],
    { duration: 0, padding: 0 },
  );
  initialFitApplied = true;
  handleBasemapCameraChange();
}

function browserGeolocationSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.geolocation !== "undefined";
}

function asLngLat(latitude?: number | null, longitude?: number | null): [number, number] | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return [Number(longitude), Number(latitude)];
}

function canUseBasemapProjection(): boolean {
  return Boolean(
    basemap
    && basemapLoaded
    && view.viewport
    && surfaceSize.width > 0
    && surfaceSize.height > 0
    && typeof basemap.project === "function"
    && typeof basemap.unproject === "function",
  );
}

function projectGeoCoordinate(coordinate: GeoPoint2d): MissionMapPoint {
  mapCameraRevision;

  if (basemap && overlayUsesBasemapProjection && typeof basemap.project === "function") {
    const point = basemap.project([coordinate.longitude_deg, coordinate.latitude_deg]);
    return { x: point.x, y: point.y };
  }

  const viewport = renderViewport;
  if (!viewport) {
    return { x: 0, y: 0 };
  }

  return projectMissionMapCoordinate(viewport, coordinate);
}

function resizeBasemap() {
  if (!basemap || typeof basemap.resize !== "function") {
    return;
  }

  basemap.resize();
  handleBasemapCameraChange();
}

function handleBasemapCameraChange() {
  mapCameraRevision += 1;
}

function handleBasemapMoveStart() {
  if (programmaticCameraMovePending) {
    programmaticCameraMovePending = false;
    return;
  }

  followTarget = null;
  pendingDeviceAction = null;
  contextMenu = null;
}

function mapSupportsStyleExtensions(currentMap: MapLibreMap): boolean {
  return typeof currentMap.getStyle === "function"
    && typeof currentMap.getSource === "function"
    && typeof currentMap.addSource === "function"
    && typeof currentMap.getLayer === "function"
    && typeof currentMap.addLayer === "function"
    && typeof currentMap.setLayoutProperty === "function";
}

function ensureBasemapStyleExtensions() {
  if (!basemap || !mapSupportsStyleExtensions(basemap)) {
    return;
  }

  try {
    ensureMapFoundation(basemap, {
      ...MAP_FOUNDATION_OPTIONS,
      satelliteBeforeLayerId: getFirstNonFillLayerId(basemap),
    });
    ensureBuildingExtrusionLayer(basemap);
    baseLayerIds = getMapLayerIds(basemap, { excludeLayerIds: Object.values(resolveMapFoundationIds(MAP_FOUNDATION_OPTIONS)) });
    applyMapLayerMode(basemap, mapLayerMode, { ...MAP_FOUNDATION_OPTIONS, baseLayerIds });
  } catch {
    if (!basemapWarning) {
      basemapWarning = "Basemap layer controls are unavailable because the map style extensions failed to initialize.";
    }
  }
}

$effect(() => {
  if (!basemapStyleReady || !basemap) {
    return;
  }

  ensureBasemapStyleExtensions();
  applyMapLayerMode(basemap, mapLayerMode, { ...MAP_FOUNDATION_OPTIONS, baseLayerIds });
});

$effect(() => {
  if (!basemapStyleReady || !basemap) {
    return;
  }

  applyTerrainMode(terrainModeEnabled);
});

$effect(() => {
  syncVehicleMarker();
});

$effect(() => {
  syncHomeMarker();
});

$effect(() => {
  syncDeviceMarker();
});

$effect(() => {
  if (followCameraLngLat) {
    easeToCoordinates(followCameraLngLat);
  }
});

$effect(() => {
  vehicleOverlay.applyHeading(liveVehicleHeadingDeg);
});

function applyTerrainMode(enabled: boolean) {
  if (!basemap || !mapSupportsStyleExtensions(basemap) || appliedTerrainMode === enabled) {
    return;
  }

  appliedTerrainMode = enabled;
  setMapTerrain(basemap, enabled, MAP_FOUNDATION_OPTIONS);

  if (typeof basemap.easeTo !== "function") {
    return;
  }

  programmaticCameraMovePending = true;
  basemap.easeTo({ pitch: enabled ? 70 : 0, duration: 500 });
}

function syncVehicleMarker() {
  vehicleOverlay.sync({ map: basemap, lngLat: vehicleLngLat, headingDeg: liveVehicleHeadingDeg });
}

function syncHomeMarker() {
  if (!basemap || !homeMarker || !homeMarkerLngLat) {
    if (homeMarker && homeMarkerAttached) {
      homeMarker.remove();
      homeMarkerAttached = false;
    }
    return;
  }

  homeMarker.setLngLat(homeMarkerLngLat);
  if (!homeMarkerAttached) {
    homeMarker.addTo(basemap);
    homeMarkerAttached = true;
  }
}

function syncDeviceMarker() {
  if (!basemap || !deviceMarker || !deviceLngLat) {
    if (deviceMarker && deviceMarkerAttached) {
      deviceMarker.remove();
      deviceMarkerAttached = false;
    }
    return;
  }

  deviceMarker.setLngLat(deviceLngLat);
  if (!deviceMarkerAttached) {
    deviceMarker.addTo(basemap);
    deviceMarkerAttached = true;
  }
}

function remapPoint(point: MissionMapPoint): MissionMapPoint {
  if (view.viewport && overlayUsesBasemapProjection) {
    return projectGeoCoordinate(unprojectMissionMapPoint(view.viewport, point));
  }

  if (!interactiveViewport || !renderViewport) {
    return point;
  }

  return reprojectMissionMapPoint(point, interactiveViewport, renderViewport);
}

function pointStyle(point: MissionMapPoint): string {
  return positionStyle(
    point,
    overlayUsesBasemapProjection,
    renderViewport?.viewBoxSize ?? interactiveViewport?.viewBoxSize ?? 1000,
  );
}

function handleMarkerSelection(marker: MissionMapMarker) {
  localMessage = null;
  contextMenu = null;

  if (marker.kind === "home") {
    onSelectHome();
    return;
  }

  if (marker.kind === "rally-point") {
    if (marker.uiId !== null) {
      applyRallyMutationResult(onSelectRallyPoint?.(marker.uiId));
    }
    return;
  }

  if (marker.uiId !== null) {
    onSelectMissionItem(marker.uiId);
  }
}

function handleSurveySelection(regionId: string) {
  localMessage = null;
  onSelectSurveyRegion(regionId);
}

function handleFenceRegionSelection(uiId: number) {
  localMessage = null;
  const result = onSelectFenceRegion?.(uiId);
  applyFenceMutationResult(result);
}

function handleFenceReturnPointSelection() {
  localMessage = null;
  const result = onSelectFenceReturnPoint?.();
  applyFenceMutationResult(result);
}

function applyRallyMutationResult(result: unknown): boolean {
  if (!result || typeof result !== "object" || !("status" in result)) {
    return true;
  }

  if ((result as MissionPlannerRallyMutationResult).status === "rejected") {
    const rejected = result as Extract<MissionPlannerRallyMutationResult, { status: "rejected" }>;
    localMessage = {
      tone: "warning",
      text: rejected.message,
    };
    return false;
  }

  localMessage = null;
  return true;
}

function startSurveyEdit() {
  if (readOnly) {
    localMessage = {
      tone: "warning",
      text: "Survey geometry editing is read-only in the current planner attachment state.",
    };
    return;
  }

  if (!selectedSurveyRegion) {
    localMessage = {
      tone: "warning",
      text: "Select a survey region before starting map-side geometry edits.",
    };
    return;
  }

  onSelectSurveyRegion(selectedSurveyRegion.id);
  surveySession = {
    mode: "edit",
    regionId: selectedSurveyRegion.id,
    patternType: selectedSurveyRegion.patternType,
    pointCountMinimum: minimumSurveyPointCount(selectedSurveyRegion.patternType),
    created: false,
    restoreRegion: cloneSurveyRegionSnapshot(selectedSurveyRegion),
  };
  localMessage = {
    tone: "info",
    text: `Editing ${selectedSurveyRegion.patternType} survey geometry. Drag vertices or click the map to append more points.`,
  };
}

function finishSurveySession() {
  if (!surveySession) {
    return;
  }

  const region = selectedSurveyRegion?.id === surveySession.regionId ? selectedSurveyRegion : null;
  if (!region) {
    localMessage = {
      tone: "warning",
      text: "The active survey region disappeared before the map edit could finish.",
    };
    surveySession = null;
    activeSurveyHandleDrag = null;
    return;
  }

  const pointCount = surveyGeometryPoints(region).length;
  if (pointCount < surveySession.pointCountMinimum) {
    localMessage = {
      tone: "warning",
      text: `${surveySession.patternType === "corridor" ? "Corridor" : surveySession.patternType === "structure" ? "Structure" : "Grid"} surveys need at least ${surveySession.pointCountMinimum} ${surveySession.patternType === "corridor" ? "centerline points" : "polygon vertices"} before you can finish drawing.`,
    };
    return;
  }

  surveySession = null;
  activeSurveyHandleDrag = null;
  localMessage = {
    tone: "info",
    text: `Finished ${region.patternType} survey ${region.patternType === "corridor" ? "centerline" : "polygon"} editing on the planner map.`,
  };
}

function cancelSurveySession() {
  const currentSession = surveySession;
  if (!currentSession) {
    return;
  }

  if (currentSession.created) {
    onDeleteSurveyRegion(currentSession.regionId);
    localMessage = {
      tone: "warning",
      text: `Cancelled ${currentSession.patternType} survey drawing and removed the unfinished region.`,
    };
  } else if (currentSession.restoreRegion) {
    const snapshot = cloneSurveyRegionSnapshot(currentSession.restoreRegion);
    onUpdateSurveyRegion(currentSession.regionId, () => snapshot);
    onSelectSurveyRegion(currentSession.regionId);
    localMessage = {
      tone: "warning",
      text: `Cancelled ${currentSession.patternType} survey editing and restored the previous geometry.`,
    };
  }

  surveySession = null;
  activeSurveyHandleDrag = null;
}

function startFencePlacement(mode: FenceRegionType | "return-point") {
  if (readOnly) {
    localMessage = {
      tone: "warning",
      text: "Fence editing is read-only in the current planner attachment state.",
    };
    return;
  }

  fencePlacementMode = mode;
  localMessage = {
    tone: "info",
    text: mode === "return-point"
      ? "Placing a fence return point. Click the planner map to set or move it."
      : `Placing a ${mode.replace(/_/g, " ")} at the clicked map position.`,
  };
}

function cancelFencePlacement() {
  if (!fencePlacementMode) {
    return;
  }

  fencePlacementMode = null;
  localMessage = {
    tone: "warning",
    text: "Cancelled fence placement and kept the current fence geometry unchanged.",
  };
}

function startMarkerDrag(event: PointerEvent, marker: MissionMapMarker) {
  contextMenu = null;
  handleMarkerSelection(marker);

  if (surveySession) {
    localMessage = {
      tone: "warning",
      text: "Finish or cancel the active survey draw session before moving Home or mission markers.",
    };
    return;
  }

  if (!marker.draggable) {
    localMessage = {
      tone: "warning",
      text: marker.readOnly
        ? "Map drag rejected because this marker is read-only."
        : "Map drag rejected because this surface is not draggable.",
    };
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  activeMarkerDrag = {
    markerId: marker.id,
    kind: marker.kind,
    uiId: marker.uiId,
    startLatitude_deg: marker.latitude_deg,
    startLongitude_deg: marker.longitude_deg,
    updateCount: 0,
  };
  localMessage = null;
}

function startSurveyHandleDrag(event: PointerEvent, handle: MissionMapSurveyVertexHandle) {
  handleSurveySelection(handle.regionId);

  if (!surveySession || surveySession.regionId !== handle.regionId) {
    localMessage = {
      tone: "warning",
      text: "Start a survey edit session before moving geometry vertices on the planner map.",
    };
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  activeSurveyHandleDrag = {
    handleId: handle.id,
    regionId: handle.regionId,
    index: handle.index,
    geometryKind: handle.geometryKind,
    updateCount: 0,
  };
  localMessage = null;
}

function startFenceVertexDrag(event: PointerEvent, handle: MissionMapFenceVertexHandle) {
  handleFenceRegionSelection(handle.regionUiId);

  if (readOnly) {
    localMessage = {
      tone: "warning",
      text: "Fence editing is read-only in the current planner attachment state.",
    };
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  activeFenceDrag = {
    kind: "vertex",
    handleId: handle.id,
    regionUiId: handle.regionUiId,
    index: handle.index,
    startLatitude_deg: handle.latitude_deg,
    startLongitude_deg: handle.longitude_deg,
    updateCount: 0,
  };
  localMessage = null;
}

function startFenceRegionDrag(event: PointerEvent, handle: MissionMapFenceRegionHandle) {
  handleFenceRegionSelection(handle.regionUiId);

  if (readOnly) {
    localMessage = {
      tone: "warning",
      text: "Fence editing is read-only in the current planner attachment state.",
    };
    return;
  }

  if (!handle.draggable) {
    localMessage = {
      tone: "warning",
      text: "Select a circle fence region before dragging its center handle on the planner map.",
    };
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  activeFenceDrag = {
    kind: "region",
    handleId: handle.id,
    regionUiId: handle.regionUiId,
    startLatitude_deg: handle.latitude_deg,
    startLongitude_deg: handle.longitude_deg,
    updateCount: 0,
  };
  localMessage = null;
}

function startFenceRadiusDrag(event: PointerEvent, handle: MissionMapFenceRadiusHandle) {
  handleFenceRegionSelection(handle.regionUiId);

  if (readOnly) {
    localMessage = {
      tone: "warning",
      text: "Fence editing is read-only in the current planner attachment state.",
    };
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  activeFenceDrag = {
    kind: "radius",
    handleId: handle.id,
    regionUiId: handle.regionUiId,
    startRadius_m: handle.radius_m,
    updateCount: 0,
  };
  localMessage = null;
}

function startFenceReturnPointDrag(event: PointerEvent) {
  handleFenceReturnPointSelection();

  if (!view.fenceReturnPoint) {
    localMessage = {
      tone: "warning",
      text: "Fence return point is not available on the active planner map.",
    };
    return;
  }

  if (readOnly) {
    localMessage = {
      tone: "warning",
      text: "Fence editing is read-only in the current planner attachment state.",
    };
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  activeFenceDrag = {
    kind: "return-point",
    startLatitude_deg: view.fenceReturnPoint.latitude_deg,
    startLongitude_deg: view.fenceReturnPoint.longitude_deg,
    updateCount: 0,
  };
  localMessage = null;
}

function cancelActiveMarkerDrag(message: string, restorePosition: boolean) {
  const currentDrag = activeMarkerDrag;
  if (!currentDrag) {
    localMessage = {
      tone: "warning",
      text: message,
    };
    return;
  }

  if (restorePosition) {
    if (currentDrag.kind === "home") {
      onMoveHome(currentDrag.startLatitude_deg, currentDrag.startLongitude_deg);
    } else if (currentDrag.kind === "rally-point") {
      if (currentDrag.uiId !== null) {
        onMoveRallyPoint?.(currentDrag.uiId, currentDrag.startLatitude_deg, currentDrag.startLongitude_deg);
      }
    } else if (currentDrag.uiId !== null) {
      onMoveMissionItem(currentDrag.uiId, currentDrag.startLatitude_deg, currentDrag.startLongitude_deg);
    }
  }

  activeMarkerDrag = null;
  localMessage = {
    tone: "warning",
    text: message,
  };
}

function cancelActiveSurveyHandleDrag(message: string) {
  activeSurveyHandleDrag = null;
  localMessage = {
    tone: "warning",
    text: message,
  };
}

function cancelActiveFenceDrag(message: string, restorePosition: boolean) {
  const currentDrag = activeFenceDrag;
  if (!currentDrag) {
    localMessage = {
      tone: "warning",
      text: message,
    };
    return;
  }

  if (restorePosition) {
    switch (currentDrag.kind) {
      case "vertex":
        onMoveFenceVertex?.(
          currentDrag.regionUiId,
          currentDrag.index,
          currentDrag.startLatitude_deg,
          currentDrag.startLongitude_deg,
        );
        break;
      case "region":
        onMoveFenceCircleCenter?.(
          currentDrag.regionUiId,
          currentDrag.startLatitude_deg,
          currentDrag.startLongitude_deg,
        );
        break;
      case "radius":
        onUpdateFenceCircleRadius?.(currentDrag.regionUiId, currentDrag.startRadius_m);
        break;
      case "return-point":
        onSetFenceReturnPoint?.(currentDrag.startLatitude_deg, currentDrag.startLongitude_deg);
        break;
    }
  }

  activeFenceDrag = null;
  localMessage = {
    tone: "warning",
    text: message,
  };
}

function applyMoveResult(result: MissionPlannerMapMoveResult): boolean {
  if (result.status === "rejected") {
    cancelActiveMarkerDrag(result.message, true);
    return false;
  }

  localMessage = null;
  return true;
}

function applyFenceMutationResult(result: unknown): boolean {
  if (!result || typeof result !== "object" || !("status" in result)) {
    return true;
  }

  if ((result as MissionPlannerFenceMutationResult).status === "rejected") {
    const rejected = result as Extract<MissionPlannerFenceMutationResult, { status: "rejected" }>;
    localMessage = {
      tone: "warning",
      text: rejected.message,
    };
    return false;
  }

  localMessage = null;
  return true;
}

function pointerOffset(event: Pick<MouseEvent, "clientX" | "clientY">): MissionMapPoint | null {
  return resolvePointerOffset(event, surfaceElement);
}

function coordinateFromPointer(event: Pick<MouseEvent, "clientX" | "clientY">) {
  return resolveCoordinateFromPointer({
    event,
    surfaceElement,
    viewport: renderViewport,
    basemap,
    overlayUsesBasemapProjection,
  });
}

function coordinateFromMapCenter() {
  return resolveCoordinateFromMapCenter({
    basemap,
    overlayUsesBasemapProjection,
    overlayViewBox,
    viewport: renderViewport,
  });
}

function appendSurveyCoordinate(latitude_deg: number, longitude_deg: number) {
  const currentSession = surveySession;
  if (!currentSession || activeMarkerDrag || activeSurveyHandleDrag || activeFenceDrag) {
    return;
  }

  let applied = false;
  onUpdateSurveyRegion(currentSession.regionId, (current) => {
    const points = [...surveyGeometryPoints(current)];
    points.push({ latitude_deg, longitude_deg });
    applied = true;
    return setSurveyGeometryPoints(current, points);
  });

  if (!applied) {
    localMessage = {
      tone: "warning",
      text: "Ignored the draw click because the target survey region is no longer active.",
    };
    return;
  }

  onSelectSurveyRegion(currentSession.regionId);
  localMessage = null;
}

function appendSurveyPointFromSurface(event: MouseEvent) {
  const coordinate = coordinateFromPointer(event);
  if (!coordinate) {
    localMessage = {
      tone: "warning",
      text: "Ignored the draw click because the planner map surface has no usable bounds yet.",
    };
    return;
  }

  appendSurveyCoordinate(coordinate.latitude_deg, coordinate.longitude_deg);
}

function placeFenceFeatureAt(latitude_deg: number, longitude_deg: number) {
  const placementMode = fencePlacementMode;
  if (!placementMode || activeMarkerDrag || activeSurveyHandleDrag || activeFenceDrag) {
    return;
  }

  const result = placementMode === "return-point"
    ? onSetFenceReturnPoint?.(latitude_deg, longitude_deg)
    : onAddFenceRegion?.(placementMode, latitude_deg, longitude_deg);

  if (!applyFenceMutationResult(result)) {
    return;
  }

  fencePlacementMode = null;
  localMessage = {
    tone: "info",
    text: `Placed ${placementMode === "return-point" ? "the fence return point" : placementMode.replace(/_/g, " ")} on the planner map.`,
  };
}

function placeFenceFeatureFromSurface(event: MouseEvent) {
  const coordinate = coordinateFromPointer(event);
  if (!coordinate) {
    localMessage = {
      tone: "warning",
      text: "Ignored the fence placement click because the planner map surface has no usable bounds yet.",
    };
    return;
  }

  placeFenceFeatureAt(coordinate.latitude_deg, coordinate.longitude_deg);
}

function handleSurfaceKeydown(event: KeyboardEvent) {
  const center = coordinateFromMapCenter();

  if (view.mode === "fence") {
    if (!fencePlacementMode || !center) {
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    placeFenceFeatureAt(center.latitude_deg, center.longitude_deg);
    return;
  }

  if (!surveySession || !center) {
    return;
  }

  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  appendSurveyCoordinate(center.latitude_deg, center.longitude_deg);
}

function handlePointerMove(event: PointerEvent) {
  const nextCoordinate = coordinateFromPointer(event);
  if (!nextCoordinate) {
    return;
  }

  if (activeMarkerDrag) {
    const marker = view.markers.find((candidate) => candidate.id === activeMarkerDrag?.markerId) ?? null;
    if (!marker) {
      cancelActiveMarkerDrag("Ignored a stale drag because the marker is no longer present in the active map view.", true);
      return;
    }

    if (!marker.draggable) {
      cancelActiveMarkerDrag("Ignored the drag because this surface is read-only on the planner map.", true);
      return;
    }

    const moved = activeMarkerDrag.kind === "home"
      ? onMoveHome(nextCoordinate.latitude_deg, nextCoordinate.longitude_deg)
      : activeMarkerDrag.kind === "rally-point"
        ? activeMarkerDrag.uiId !== null
          ? onMoveRallyPoint?.(activeMarkerDrag.uiId, nextCoordinate.latitude_deg, nextCoordinate.longitude_deg) ?? {
            status: "rejected",
            reason: "item-not-found",
            message: "Ignored the drag because the rally point target disappeared.",
          } satisfies MissionPlannerMapMoveResult
          : {
            status: "rejected",
            reason: "item-not-found",
            message: "Ignored the drag because the rally point target disappeared.",
          } satisfies MissionPlannerMapMoveResult
        : activeMarkerDrag.uiId !== null
          ? onMoveMissionItem(activeMarkerDrag.uiId, nextCoordinate.latitude_deg, nextCoordinate.longitude_deg)
          : {
            status: "rejected",
            reason: "item-not-found",
            message: "Ignored the drag because the mission item target disappeared.",
          } satisfies MissionPlannerMapMoveResult;

    if (!applyMoveResult(moved)) {
      return;
    }

    activeMarkerDrag = {
      ...activeMarkerDrag,
      updateCount: activeMarkerDrag.updateCount + 1,
    };
    return;
  }

  if (activeSurveyHandleDrag) {
    const currentSurveyHandleDrag = activeSurveyHandleDrag;
    const handle = view.surveyVertexHandles.find((candidate) => candidate.id === currentSurveyHandleDrag.handleId) ?? null;
    if (!handle) {
      cancelActiveSurveyHandleDrag("Ignored a stale survey-handle drag because that vertex is no longer present in the active map view.");
      return;
    }

    let applied = false;
    onUpdateSurveyRegion(currentSurveyHandleDrag.regionId, (current) => {
      const currentGeometryKind = surveyGeometryKind(current);
      if (currentGeometryKind !== currentSurveyHandleDrag.geometryKind) {
        return current;
      }

      const points = [...surveyGeometryPoints(current)];
      const point = points[currentSurveyHandleDrag.index];
      if (!point) {
        return current;
      }

      points[currentSurveyHandleDrag.index] = {
        latitude_deg: nextCoordinate.latitude_deg,
        longitude_deg: nextCoordinate.longitude_deg,
      };
      applied = true;
      return setSurveyGeometryPoints(current, points);
    });

    if (!applied) {
      cancelActiveSurveyHandleDrag("Ignored a stale survey-handle drag because that vertex no longer exists.");
      return;
    }

    onSelectSurveyRegion(currentSurveyHandleDrag.regionId);
    activeSurveyHandleDrag = {
      ...currentSurveyHandleDrag,
      updateCount: currentSurveyHandleDrag.updateCount + 1,
    };
    localMessage = null;
    return;
  }

  if (!activeFenceDrag) {
    return;
  }

  if (activeFenceDrag.kind === "vertex") {
    const currentFenceDrag = activeFenceDrag;
    const handle = view.fenceVertexHandles.find((candidate) => candidate.id === currentFenceDrag.handleId) ?? null;
    if (!handle) {
      cancelActiveFenceDrag("Ignored a stale fence-vertex drag because that vertex is no longer present in the active map view.", true);
      return;
    }

    const moved = onMoveFenceVertex?.(
      activeFenceDrag.regionUiId,
      activeFenceDrag.index,
      nextCoordinate.latitude_deg,
      nextCoordinate.longitude_deg,
    );
    if (!applyFenceMutationResult(moved)) {
      cancelActiveFenceDrag((moved as Extract<MissionPlannerFenceMutationResult, { status: "rejected" }>)?.message ?? "Fence vertex drag failed.", true);
      return;
    }

    activeFenceDrag = {
      ...activeFenceDrag,
      updateCount: activeFenceDrag.updateCount + 1,
    };
    return;
  }

  if (activeFenceDrag.kind === "region") {
    const currentFenceDrag = activeFenceDrag;
    const handle = view.fenceRegionHandles.find((candidate) => candidate.id === currentFenceDrag.handleId) ?? null;
    if (!handle) {
      cancelActiveFenceDrag("Ignored a stale fence-region drag because that handle is no longer present in the active map view.", true);
      return;
    }

    if (!handle.draggable) {
      cancelActiveFenceDrag("Ignored the drag because this fence region is not movable from its current map handle.", true);
      return;
    }

    const moved = onMoveFenceCircleCenter?.(
      activeFenceDrag.regionUiId,
      nextCoordinate.latitude_deg,
      nextCoordinate.longitude_deg,
    );
    if (!applyFenceMutationResult(moved)) {
      cancelActiveFenceDrag((moved as Extract<MissionPlannerFenceMutationResult, { status: "rejected" }>)?.message ?? "Fence region drag failed.", true);
      return;
    }

    activeFenceDrag = {
      ...activeFenceDrag,
      updateCount: activeFenceDrag.updateCount + 1,
    };
    return;
  }

  if (activeFenceDrag.kind === "radius") {
    const currentFenceDrag = activeFenceDrag;
    const handle = view.fenceRadiusHandles.find((candidate) => candidate.id === currentFenceDrag.handleId) ?? null;
    if (!handle) {
      cancelActiveFenceDrag("Ignored a stale fence-radius drag because that handle is no longer present in the active map view.", true);
      return;
    }

    const radius_m = haversineM(
      handle.centerLatitude_deg,
      handle.centerLongitude_deg,
      nextCoordinate.latitude_deg,
      nextCoordinate.longitude_deg,
    );

    if (!Number.isFinite(radius_m) || radius_m <= 0) {
      cancelActiveFenceDrag("Ignored the fence-radius drag because the resulting radius was not valid.", true);
      return;
    }

    const moved = onUpdateFenceCircleRadius?.(activeFenceDrag.regionUiId, radius_m);
    if (!applyFenceMutationResult(moved)) {
      cancelActiveFenceDrag((moved as Extract<MissionPlannerFenceMutationResult, { status: "rejected" }>)?.message ?? "Fence radius drag failed.", true);
      return;
    }

    activeFenceDrag = {
      ...activeFenceDrag,
      updateCount: activeFenceDrag.updateCount + 1,
    };
    return;
  }

  if (!view.fenceReturnPoint) {
    cancelActiveFenceDrag("Ignored a stale fence return-point drag because the return point is no longer present in the active map view.", true);
    return;
  }

  const moved = onSetFenceReturnPoint?.(nextCoordinate.latitude_deg, nextCoordinate.longitude_deg);
  if (!applyFenceMutationResult(moved)) {
    cancelActiveFenceDrag((moved as Extract<MissionPlannerFenceMutationResult, { status: "rejected" }>)?.message ?? "Fence return-point drag failed.", true);
    return;
  }

  activeFenceDrag = {
    ...activeFenceDrag,
    updateCount: activeFenceDrag.updateCount + 1,
  };
}

function handlePointerUp() {
  if (activeMarkerDrag) {
    activeMarkerDrag = null;
  }

  if (activeSurveyHandleDrag) {
    activeSurveyHandleDrag = null;
  }

  if (activeFenceDrag) {
    activeFenceDrag = null;
  }
}

function handlePointerCancel() {
  if (activeMarkerDrag) {
    cancelActiveMarkerDrag("Map drag cancelled. Restored the previous marker position.", true);
    return;
  }

  if (activeSurveyHandleDrag) {
    cancelActiveSurveyHandleDrag("Survey handle drag cancelled. The current geometry stayed at the last valid point.");
    return;
  }

  if (activeFenceDrag) {
    cancelActiveFenceDrag("Fence drag cancelled. Restored the previous fence geometry.", true);
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape") {
    return;
  }

  if (activeMarkerDrag) {
    event.preventDefault();
    cancelActiveMarkerDrag("Map drag cancelled with Escape. Restored the previous marker position.", true);
    return;
  }

  if (activeFenceDrag) {
    event.preventDefault();
    cancelActiveFenceDrag("Fence drag cancelled with Escape. Restored the previous fence geometry.", true);
    return;
  }

  if (view.mode === "fence" && fencePlacementMode) {
    event.preventDefault();
    cancelFencePlacement();
    return;
  }

  if (surveySession) {
    event.preventDefault();
    cancelSurveySession();
  }
}

function handleContextMenu(event: MouseEvent) {
  event.preventDefault();
  contextMenu = null;
  followTarget = null;
  pendingDeviceAction = null;

  if (!surfaceElement || readOnly) {
    return;
  }

  const coordinate = coordinateFromPointer(event);
  if (!coordinate) {
    return;
  }

  contextMenu = {
    x: event.clientX,
    y: event.clientY,
    lngLat: { lng: coordinate.longitude_deg, lat: coordinate.latitude_deg },
  };
}

function buildContextMenuActions(): MapContextMenuAction[] {
  if (!contextMenu) {
    return [];
  }

  const items: MapContextMenuAction[] = [];

  if (view.mode === "mission" && onAddWaypointAt) {
    items.push({
      id: "add-waypoint",
      label: "Add waypoint here",
      icon: addWaypointMenuIcon,
      onSelect: (point) => {
        onAddWaypointAt!(point.latitudeDeg, point.longitudeDeg);
        contextMenu = null;
      },
    });
  }

  if (onSetHomeAt) {
    items.push({
      id: "set-home",
      label: "Set Home here",
      icon: setHomeMenuIcon,
      onSelect: (point) => {
        onSetHomeAt!(point.latitudeDeg, point.longitudeDeg);
        contextMenu = null;
      },
    });
  }

  return items;
}

function flyToCoordinates(lngLat: [number, number]) {
  if (!basemap || typeof basemap.flyTo !== "function") {
    return;
  }

  const zoom = typeof basemap.getZoom === "function" ? Math.max(basemap.getZoom(), 15) : 15;
  programmaticCameraMovePending = true;
  basemap.flyTo({ center: lngLat, zoom, duration: 800 });
}

function easeToCoordinates(lngLat: [number, number]) {
  if (!basemap || typeof basemap.easeTo !== "function") {
    return;
  }

  programmaticCameraMovePending = true;
  basemap.easeTo({ center: lngLat, duration: 500 });
}

function activateCameraTarget(target: CameraTarget, activation: { follow: boolean }) {
  contextMenu = null;

  if (target === "vehicle") {
    pendingDeviceAction = null;
    if (!vehicleLngLat) {
      localMessage = { tone: "warning", text: "No vehicle position is available for the mission map yet." };
      return;
    }

    followTarget = activation.follow ? "vehicle" : null;
    if (activation.follow) {
      easeToCoordinates(vehicleLngLat);
      localMessage = null;
      return;
    }

    flyToCoordinates(vehicleLngLat);
    localMessage = null;
    return;
  }

  if (target === "home") {
    pendingDeviceAction = null;
    if (!homeCameraLngLat) {
      localMessage = { tone: "warning", text: "No home position is available for the mission map yet." };
      return;
    }

    followTarget = activation.follow ? "home" : null;
    if (activation.follow) {
      easeToCoordinates(homeCameraLngLat);
      localMessage = null;
      return;
    }

    flyToCoordinates(homeCameraLngLat);
    localMessage = null;
    return;
  }

  devicePermissionDenied = false;
  if (!deviceLocationSupported || !browserGeolocationSupported()) {
    deviceLocationSupported = false;
    localMessage = { tone: "warning", text: "Device geolocation is not available in this runtime." };
    return;
  }

  if (deviceLocation) {
    const lngLat: [number, number] = [deviceLocation.longitude_deg, deviceLocation.latitude_deg];
    followTarget = activation.follow ? "device" : null;
    if (activation.follow) {
      easeToCoordinates(lngLat);
      localMessage = null;
      return;
    }

    flyToCoordinates(lngLat);
    localMessage = null;
    return;
  }

  followTarget = null;
  pendingDeviceAction = { follow: activation.follow };
  ensureDeviceLocationWatch();
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
        if (pendingAction) {
          pendingDeviceAction = null;
          const lngLat: [number, number] = [position.coords.longitude, position.coords.latitude];
          if (pendingAction.follow) {
            followTarget = "device";
            easeToCoordinates(lngLat);
            localMessage = null;
            return;
          }

          flyToCoordinates(lngLat);
          localMessage = null;
        }
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          devicePermissionDenied = true;
          deviceLocation = null;
          pendingDeviceAction = null;
          if (followTarget === "device") {
            followTarget = null;
          }
          stopDeviceLocationWatch();
          localMessage = { tone: "warning", text: "Location permission denied. Enable it in system settings to use my location." };
          return;
        }

        if (error.code === error.POSITION_UNAVAILABLE) {
          deviceLocation = null;
          pendingDeviceAction = null;
          if (followTarget === "device") {
            followTarget = null;
          }
          stopDeviceLocationWatch();
          localMessage = { tone: "warning", text: "Current device location is unavailable." };
        }
      },
      { enableHighAccuracy: true },
    );
  } catch {
    deviceLocationSupported = false;
    pendingDeviceAction = null;
    localMessage = { tone: "warning", text: "Device geolocation is not available in this runtime." };
    return false;
  }

  return true;
}

function stopDeviceLocationWatch() {
  if (deviceWatchId === null || !browserGeolocationSupported()) {
    deviceWatchId = null;
    return;
  }

  navigator.geolocation.clearWatch(deviceWatchId);
  deviceWatchId = null;
}

</script>

{#snippet addWaypointMenuIcon()}
  <MapPinPlus aria-hidden="true" size={14} />
{/snippet}

{#snippet setHomeMenuIcon()}
  <Home aria-hidden="true" size={14} />
{/snippet}

<svelte:window onkeydown={handleKeydown} onpointercancel={handlePointerCancel} onpointermove={handlePointerMove} onpointerup={handlePointerUp} />

<section class={["mission-map", fillContainer && "mission-map--fill"]} data-testid={missionWorkspaceTestIds.map}>
  <MissionMapActionBar
    mode={view.mode}
    surveySessionActive={surveySession !== null}
    {selectedSurveyRegion}
    {readOnly}
    fenceHasReturnPoint={view.fenceReturnPoint !== null}
    fencePlacementActive={fencePlacementMode !== null}
    onStartSurveyEdit={startSurveyEdit}
    onFinishSurveySession={finishSurveySession}
    onCancelSurveySession={cancelSurveySession}
    onStartFencePlacement={startFencePlacement}
    onClearFenceReturnPoint={() => applyFenceMutationResult(onClearFenceReturnPoint?.())}
    onCancelFencePlacement={cancelFencePlacement}
  />

  <MissionMapStatusPanel
    {localMessage}
    {diagnostics}
  />

  {#if renderViewport}
    <div
      bind:this={surfaceElement}
      aria-label="Mission planner map"
      class={["mission-map-surface relative overflow-hidden rounded-lg border border-border/70 bg-bg-primary", fillContainer ? "mission-map-surface--fill" : "aspect-[5/4]"]}
      data-testid={missionWorkspaceTestIds.mapSurface}
      oncontextmenu={handleContextMenu}
      role="application"
    >
      <div class="mission-map-basemap" data-testid={missionWorkspaceTestIds.mapBasemap}>
        <BaseMap
          options={createBasemapOptions()}
          onMapReady={handleBasemapReady}
          onMapError={handleBasemapError}
        />
      </div>
      <div class="mission-map-basemap-scrim"></div>
      <MissionMapOverlaySvg
        {overlayViewBox}
        {renderFenceLines}
        {renderFencePolygons}
        {renderMissionLabels}
        {renderMissionLines}
        {renderMissionPolygons}
        {renderReplayOverlayPath}
        {renderSurveyLines}
        {renderSurveyPolygons}
      />

      {#if surveySession || fencePlacementMode}
        <button
          aria-label={view.mode === "fence" ? "Place fence feature on planner map" : "Add survey point on planner map"}
          class="mission-map-draw-surface"
          data-testid={view.mode === "fence" ? missionWorkspaceTestIds.mapFencePlacementSurface : missionWorkspaceTestIds.mapDrawSurface}
          onclick={view.mode === "fence" ? placeFenceFeatureFromSurface : appendSurveyPointFromSurface}
          onkeydown={handleSurfaceKeydown}
          type="button"
        ></button>
      {/if}

      <MapSurfaceControls
        {mapLayerMode}
        {terrainModeEnabled}
        deviceTargetVisible={deviceLocationSupported || devicePermissionDenied}
        {activeCameraTarget}
        passive={mapControlsPassive}
        onSelectLayerMode={(mode) => { mapLayerMode = mode; }}
        onToggleTerrainMode={() => { terrainModeEnabled = !terrainModeEnabled; }}
        onActivateCameraTarget={activateCameraTarget}
      />

      <MissionMapStateNotice mode={view.mode} state={view.state} />

      <MissionMapInteractiveLayer
        activeMarkerId={activeMarkerDrag?.markerId ?? null}
        {pointStyle}
        {renderFenceRadiusHandles}
        {renderFenceRegionHandles}
        {renderFenceReturnPoint}
        {renderFenceVertexHandles}
        {renderMarkers}
        {renderReplayOverlayMarker}
        {renderSurveyHandles}
        {renderSurveyVertexHandles}
        surveySessionRegionId={surveySession?.regionId ?? null}
        onSelectFenceRegion={handleFenceRegionSelection}
        onSelectFenceReturnPoint={handleFenceReturnPointSelection}
        onSelectMarker={handleMarkerSelection}
        onSelectSurveyRegion={handleSurveySelection}
        onStartFenceRadiusDrag={startFenceRadiusDrag}
        onStartFenceRegionDrag={startFenceRegionDrag}
        onStartFenceReturnPointDrag={startFenceReturnPointDrag}
        onStartFenceVertexDrag={startFenceVertexDrag}
        onStartMarkerDrag={startMarkerDrag}
        onStartSurveyHandleDrag={startSurveyHandleDrag}
      />

      {#if contextMenu}
        {#key contextMenu}
          <MapContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            lat={contextMenu.lngLat.lat}
            lon={contextMenu.lngLat.lng}
            actions={buildContextMenuActions()}
            testId="mission-map-context-menu"
            coordinatesTestId="mission-map-context-menu-coordinates"
            onClose={() => { contextMenu = null; }}
          />
        {/key}
      {/if}
    </div>
  {/if}

</section>

<style>
  .mission-map {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-height: 0;
  }

  .mission-map--fill {
    height: 100%;
    overflow: hidden;
  }

  .mission-map-surface--fill {
    flex: 1 1 auto;
    min-height: 220px;
  }

  .mission-map--fill > :not(.mission-map-surface--fill) {
    flex-shrink: 0;
  }

  .mission-map-surface {
    touch-action: none;
  }

  .mission-map-basemap,
  .mission-map-basemap-scrim {
    position: absolute;
    inset: 0;
  }

  .mission-map-basemap {
    /* Keep the basemap itself below planner overlays, but do not create a
       stacking context that traps MapLibre's live vehicle marker underneath
       editable home/mission buttons. The vehicle marker has its own z-index
       and must be able to rise above planner markers when positions overlap. */
    z-index: auto;
  }

  .mission-map-basemap :global(.maplibregl-marker.vehicle-marker) {
    z-index: 30;
  }

  .mission-map-basemap :global(.maplibregl-control-container),
  .mission-map-basemap :global(.maplibregl-ctrl-top-left),
  .mission-map-basemap :global(.maplibregl-ctrl-top-right),
  .mission-map-basemap :global(.maplibregl-ctrl-bottom-left),
  .mission-map-basemap :global(.maplibregl-ctrl-bottom-right) {
    pointer-events: none;
  }

  .mission-map-basemap :global(.maplibregl-ctrl) {
    pointer-events: auto;
  }

  .mission-map-basemap :global(.maplibregl-canvas-container),
  .mission-map-basemap :global(.maplibregl-canvas),
  .mission-map-basemap :global(.maplibregl-map) {
    width: 100%;
    height: 100%;
  }

  .mission-map-basemap-scrim {
    z-index: 0;
    pointer-events: none;
    background:
      linear-gradient(180deg, rgba(8, 20, 32, 0.08), rgba(8, 20, 32, 0.16)),
      radial-gradient(circle at top, rgba(120, 214, 255, 0.06), transparent 55%);
  }

  .mission-map-draw-surface {
    position: absolute;
    inset: 0;
    z-index: 1;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: crosshair;
  }

</style>
