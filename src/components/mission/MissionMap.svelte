<script lang="ts">
import { Home, Layers, LocateFixed, Map as MapIcon, Navigation, Satellite } from "lucide-svelte";
import { onDestroy, onMount } from "svelte";
import maplibregl, { type Map as MapLibreMap, type Marker } from "maplibre-gl";

import {
  adaptMissionMapViewportToAspectRatio,
  buildMissionMapViewport,
  projectMissionMapCoordinate,
  reprojectMissionMapPoint,
  unprojectMissionMapPoint,
  type MissionMapFenceRadiusHandle,
  type MissionMapFenceRegionHandle,
  type MissionMapFenceVertexHandle,
  type MissionMapLineFeature,
  type MissionMapMarker,
  type MissionMapPoint,
  type MissionMapPolygonFeature,
  type MissionMapSurveyHandle,
  type MissionMapSurveyVertexHandle,
  type MissionMapView,
  type MissionMapViewport,
} from "../../lib/mission-map-view";
import { haversineM } from "../../lib/geo-utils";
import { localXYToLatLon } from "../../lib/mission-coordinates";
import type { ReplayMapOverlayState } from "../../lib/replay-map-overlay";
import {
  applyMapLayerMode,
  createDeviceMarkerElement,
  createHomeMarkerElement,
  createVehicleMarkerElement,
  ensureMapFoundation,
  getFirstNonFillLayerId,
  getMapLayerIds,
  OPENFREEMAP_BRIGHT_STYLE_URL,
  resolveMapFoundationIds,
  setMapTerrain,
  setVehicleMarkerHeading,
  type MapLayerMode,
} from "../../lib/map";
import {
  minimumSurveyPointCount,
  setSurveyGeometryPoints,
  surveyGeometryKind,
  surveyGeometryPoints,
} from "../../lib/mission-map-survey";
import { resolveSurveyGenerationBlockedReason } from "../../lib/mission-survey-authoring";
import type { GeoPoint2d, GeoPoint3d } from "../../lib/mavkit-types";
import type { FenceRegionType } from "../../lib/mission-draft-typed";
import type { SurveyPatternType, SurveyRegion } from "../../lib/survey-region";
import type {
  MissionPlannerFenceMutationResult,
  MissionPlannerMapMoveResult,
  MissionPlannerRallyMutationResult,
} from "../../lib/stores/mission-planner";
import {
  clearMissionMapDebugSnapshot,
  publishMissionMapDebugSnapshot,
} from "./mission-map-debug";
import { ContextMenu, type ContextMenuItem } from "../ui";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

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
  onCreateSurveyRegion: (patternType: SurveyPatternType) => string;
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

type PointerMapCoordinate = {
  point: MissionMapPoint;
  latitude_deg: number;
  longitude_deg: number;
  projectedByBasemap: boolean;
};

type CameraTarget = "device" | "home" | "vehicle";
type DeviceLocation = {
  latitude_deg: number;
  longitude_deg: number;
  accuracy_m: number;
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
  onCreateSurveyRegion,
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
let basemapElement = $state<HTMLDivElement | null>(null);
let activeMarkerDrag = $state<ActiveMarkerDrag | null>(null);
let activeSurveyHandleDrag = $state<ActiveSurveyHandleDrag | null>(null);
let activeFenceDrag = $state<ActiveFenceDrag | null>(null);
let surveySession = $state<SurveySession | null>(null);
let fencePlacementMode = $state<FenceRegionType | "return-point" | null>(null);
let localMessage = $state<LocalMapMessage | null>(null);
let mapLayerMode = $state<MapLayerMode>("normal");
let terrainModeEnabled = $state(false);
let deviceLocation = $state<DeviceLocation | null>(null);
let deviceLocationSupported = $state(browserGeolocationSupported());
let devicePermissionDenied = $state(false);
let lastUsableViewport = $state<MissionMapViewport | null>(null);
let contextMenu = $state<{ x: number; y: number; lngLat: { lng: number; lat: number } } | null>(null);
let surfaceSize = $state({ width: 0, height: 0 });
let basemapWarning = $state<string | null>(null);
let mapCameraRevision = $state(0);

let basemap: MapLibreMap | null = null;
let vehicleMarker: Marker | null = null;
let homeMarker: Marker | null = null;
let deviceMarker: Marker | null = null;
let baseLayerIds: string[] = [];
let basemapLoaded = $state(false);
let basemapStyleReady = $state(false);
let basemapInitAttempted = false;
let initialFitApplied = false;
let vehicleMarkerAttached = false;
let homeMarkerAttached = false;
let deviceMarkerAttached = false;
let deviceWatchId: number | null = null;
let appliedTerrainMode: boolean | null = null;

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
let homeMarkerLngLat = $derived(plannerHomePosition ? null : asLngLat(homePosition?.latitude_deg, homePosition?.longitude_deg));
let deviceLngLat = $derived(asLngLat(deviceLocation?.latitude_deg, deviceLocation?.longitude_deg));
let liveVehicleHeadingDeg = $derived(vehiclePosition?.heading_deg ?? vehicleHeadingDeg ?? 0);
let renderMissionLines = $derived(remapLineFeatures(view.missionLines));
let renderMissionPolygons = $derived(remapPolygonFeatures(view.missionPolygons));
let renderMissionLabels = $derived(remapLabelFeatures(view.missionLabels));
let renderSurveyLines = $derived(remapLineFeatures(view.surveyLines));
let renderSurveyPolygons = $derived(remapPolygonFeatures(view.surveyPolygons));
let renderFenceLines = $derived(remapLineFeatures(view.fenceLines));
let renderFencePolygons = $derived(remapPolygonFeatures(view.fencePolygons));
let renderMarkers = $derived(remapMarkers(view.markers));
let renderSurveyHandles = $derived(remapSurveyHandles(view.surveyHandles));
let renderSurveyVertexHandles = $derived(remapSurveyVertexHandles(view.surveyVertexHandles));
let renderFenceRegionHandles = $derived(remapFenceRegionHandles(view.fenceRegionHandles));
let renderFenceVertexHandles = $derived(remapFenceVertexHandles(view.fenceVertexHandles));
let renderFenceRadiusHandles = $derived(remapFenceRadiusHandles(view.fenceRadiusHandles));
let renderFenceReturnPoint = $derived(remapFenceReturnPoint(view.fenceReturnPoint));
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
let drawModeText = $derived.by(() => {
  if (view.mode === "fence") {
    return fencePlacementMode ? `place:${fencePlacementMode}` : "idle";
  }

  if (view.mode === "rally") {
    return view.counts.rallyMarkers > 0 ? `rally:${view.counts.rallyMarkers}` : "idle";
  }

  if (!surveySession) {
    return "idle";
  }

  return `${surveySession.mode}:${surveySession.patternType}:${activeSurveyPointCount}`;
});
let mapControlsPassive = $derived(surveySession !== null || fencePlacementMode !== null);
let dragStateText = $derived.by(() => {
  if (activeMarkerDrag) {
    return `${activeMarkerDrag.kind}:${activeMarkerDrag.markerId}:${activeMarkerDrag.updateCount}`;
  }

  if (activeSurveyHandleDrag) {
    return `survey-handle:${activeSurveyHandleDrag.handleId}:${activeSurveyHandleDrag.updateCount}`;
  }

  if (activeFenceDrag) {
    return `fence-${activeFenceDrag.kind}:${activeFenceDrag.updateCount}`;
  }

  return localMessage?.text ?? "idle";
});
let selectionText = $derived.by(() => {
  if (view.mode === "fence") {
    const fenceSelection = view.fenceSelection;

    if (fenceSelection.kind === "return-point") {
      return "fence return point";
    }

    if (fenceSelection.kind === "region") {
      const handle = view.fenceRegionHandles.find((candidate) => candidate.regionUiId === fenceSelection.regionUiId);
      return handle ? `fence ${handle.label}` : `fence ${fenceSelection.regionUiId}`;
    }

    return "fence none";
  }

  if (view.selection.kind === "home") {
    return "home";
  }

  if (view.selection.kind === "mission-item") {
    return view.selection.uiId === null ? "mission item" : `mission item ${view.selection.uiId}`;
  }

  if (view.selection.kind === "rally-point") {
    return view.selection.uiId === null ? "rally point" : `rally point ${view.selection.uiId}`;
  }

  return view.selection.regionId ? `survey ${view.selection.regionId}` : "survey block";
});
let debugPayload = $derived({
  mode: view.mode,
  state: view.state,
  selection: view.selection,
  fenceSelection: view.fenceSelection,
  counts: view.counts,
  warnings: diagnostics,
  dragTargetId: activeMarkerDrag?.markerId ?? activeSurveyHandleDrag?.handleId ?? activeFenceDrag?.kind ?? null,
  dragUpdateCount: activeMarkerDrag?.updateCount ?? activeSurveyHandleDrag?.updateCount ?? activeFenceDrag?.updateCount ?? 0,
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
  rallyMarkerCount: view.counts.rallyMarkers,
});

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

function readSurfaceDrawableBox() {
  if (!surfaceElement) {
    return null;
  }

  const rect = surfaceElement.getBoundingClientRect();
  const width = surfaceElement.clientWidth > 0 ? surfaceElement.clientWidth : rect.width;
  const height = surfaceElement.clientHeight > 0 ? surfaceElement.clientHeight : rect.height;

  if (width <= 0 || height <= 0) {
    return null;
  }

  return {
    left: rect.left + surfaceElement.clientLeft,
    top: rect.top + surfaceElement.clientTop,
    width,
    height,
  };
}

$effect(() => {
  if (!surfaceElement) {
    surfaceSize = { width: 0, height: 0 };
    return;
  }

  const syncSurfaceSize = () => {
    const rect = readSurfaceDrawableBox();
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

onMount(() => {
  if (!basemapElement || basemapInitAttempted) {
    return;
  }

  basemapInitAttempted = true;
  basemapLoaded = false;
  basemapWarning = null;

  try {
    basemap = new maplibregl.Map({
      container: basemapElement,
      style: OPENFREEMAP_BRIGHT_STYLE_URL,
      center: DEFAULT_CENTER,
      zoom: 14,
      pitch: 0,
      maxPitch: 85,
      attributionControl: false,
    });
  } catch {
    basemap = null;
    basemapWarning = "Basemap initialization failed. Planner overlays remain available without the map background.";
    return;
  }

  if (typeof basemap.addControl === "function" && typeof maplibregl.NavigationControl === "function") {
    basemap.addControl(
      new maplibregl.NavigationControl({ showZoom: true, showCompass: true, visualizePitch: true }),
      "top-right",
    );
  }

  if (typeof maplibregl.Marker === "function") {
    vehicleMarker = new maplibregl.Marker({ element: createVehicleMarkerElement(), anchor: "center" });
    homeMarker = new maplibregl.Marker({ element: createHomeMarkerElement(), anchor: "center" });
    deviceMarker = new maplibregl.Marker({ element: createDeviceMarkerElement(), anchor: "center" });
  }

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
    vehicleMarker?.remove();
    homeMarker?.remove();
    deviceMarker?.remove();
    basemap?.remove();
    basemap = null;
    vehicleMarker = null;
    homeMarker = null;
    deviceMarker = null;
    basemapLoaded = false;
    basemapStyleReady = false;
    basemapInitAttempted = false;
    initialFitApplied = false;
    vehicleMarkerAttached = false;
    homeMarkerAttached = false;
    deviceMarkerAttached = false;
    baseLayerIds = [];
    appliedTerrainMode = null;
  };
});

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
  if (vehicleMarker) {
    setVehicleMarkerHeading(vehicleMarker.getElement(), liveVehicleHeadingDeg);
  }
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

  basemap.easeTo({ pitch: enabled ? 70 : 0, duration: 500 });
}

function syncVehicleMarker() {
  if (!basemap || !vehicleMarker || !vehicleLngLat) {
    if (vehicleMarker && vehicleMarkerAttached && !vehicleLngLat) {
      vehicleMarker.remove();
      vehicleMarkerAttached = false;
    }
    return;
  }

  vehicleMarker.setLngLat(vehicleLngLat);
  setVehicleMarkerHeading(vehicleMarker.getElement(), liveVehicleHeadingDeg);
  if (!vehicleMarkerAttached) {
    vehicleMarker.addTo(basemap);
    vehicleMarkerAttached = true;
  }
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

function remapLineFeatures(features: MissionMapLineFeature[]): MissionMapLineFeature[] {
  return features.map((feature) => ({
    ...feature,
    points: feature.points.map((point) => remapPoint(point)),
  }));
}

function remapPolygonFeatures(features: MissionMapPolygonFeature[]): MissionMapPolygonFeature[] {
  return features.map((feature) => ({
    ...feature,
    rings: feature.rings.map((ring) => ring.map((point) => remapPoint(point))),
  }));
}

function remapLabelFeatures(features: typeof view.missionLabels): typeof view.missionLabels {
  return features.map((feature) => ({
    ...feature,
    point: remapPoint(feature.point),
  }));
}

function remapMarkers(markers: MissionMapMarker[]): MissionMapMarker[] {
  return markers.map((marker) => ({
    ...marker,
    point: remapPoint(marker.point),
  }));
}

function remapSurveyHandles(handles: MissionMapSurveyHandle[]): MissionMapSurveyHandle[] {
  return handles.map((handle) => ({
    ...handle,
    point: remapPoint(handle.point),
  }));
}

function remapSurveyVertexHandles(handles: MissionMapSurveyVertexHandle[]): MissionMapSurveyVertexHandle[] {
  return handles.map((handle) => ({
    ...handle,
    point: remapPoint(handle.point),
  }));
}

function remapFenceRegionHandles(handles: MissionMapFenceRegionHandle[]): MissionMapFenceRegionHandle[] {
  return handles.map((handle) => ({
    ...handle,
    point: remapPoint(handle.point),
  }));
}

function remapFenceVertexHandles(handles: MissionMapFenceVertexHandle[]): MissionMapFenceVertexHandle[] {
  return handles.map((handle) => ({
    ...handle,
    point: remapPoint(handle.point),
  }));
}

function remapFenceRadiusHandles(handles: MissionMapFenceRadiusHandle[]): MissionMapFenceRadiusHandle[] {
  return handles.map((handle) => ({
    ...handle,
    point: remapPoint(handle.point),
  }));
}

function remapFenceReturnPoint(
  fenceReturnPoint: typeof view.fenceReturnPoint,
): typeof view.fenceReturnPoint {
  if (!fenceReturnPoint) {
    return null;
  }

  return {
    ...fenceReturnPoint,
    point: remapPoint(fenceReturnPoint.point),
  };
}

function cloneSurveyRegionSnapshot(region: SurveyRegion): SurveyRegion {
  if (typeof structuredClone === "function") {
    return structuredClone(region);
  }

  return {
    ...region,
    polygon: region.polygon.map((point) => ({ ...point })),
    polyline: region.polyline.map((point) => ({ ...point })),
    corridorPolygon: region.corridorPolygon.map((point) => ({ ...point })),
    params: { ...region.params },
    generatedItems: region.generatedItems.map((item) => ({ ...item })),
    generatedTransects: region.generatedTransects.map((transect) => transect.map((point) => ({ ...point }))),
    generatedCrosshatch: region.generatedCrosshatch.map((transect) => transect.map((point) => ({ ...point }))),
    generatedLayers: region.generatedLayers.map((layer) => ({
      ...layer,
      orbitPoints: layer.orbitPoints.map((point) => ({ ...point })),
    })),
    generatedStats: region.generatedStats ? { ...region.generatedStats } : null,
    errors: region.errors.map((error) => ({ ...error })),
    manualEdits: new Map(region.manualEdits),
    camera: region.camera ? { ...region.camera } : null,
    qgcPassthrough: region.qgcPassthrough ? JSON.parse(JSON.stringify(region.qgcPassthrough)) as Record<string, unknown> : undefined,
    importWarnings: region.importWarnings ? [...region.importWarnings] : undefined,
  };
}

function markerTestId(marker: MissionMapMarker): string {
  return `${missionWorkspaceTestIds.mapMarkerPrefix}-${marker.kind === "home" ? "home" : marker.uiId}`;
}

function surveyHandleTestId(handle: MissionMapSurveyHandle): string {
  return `${missionWorkspaceTestIds.mapSurveyPrefix}-${handle.regionId}`;
}

function surveyVertexHandleTestId(handle: MissionMapSurveyVertexHandle): string {
  return `${missionWorkspaceTestIds.mapVertexPrefix}-${handle.regionId}-${handle.geometryKind}-${handle.index}`;
}

function fenceRegionHandleTestId(handle: MissionMapFenceRegionHandle): string {
  return `${missionWorkspaceTestIds.mapFenceRegionPrefix}-${handle.regionUiId}`;
}

function fenceVertexHandleTestId(handle: MissionMapFenceVertexHandle): string {
  return `${missionWorkspaceTestIds.mapFenceVertexPrefix}-${handle.regionUiId}-${handle.index}`;
}

function fenceRadiusHandleTestId(handle: MissionMapFenceRadiusHandle): string {
  return `${missionWorkspaceTestIds.mapFenceRadiusPrefix}-${handle.regionUiId}`;
}

function toPolylinePoints(points: MissionMapPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function toPolygonPoints(polygon: MissionMapPolygonFeature): string {
  return polygon.rings[0] ? toPolylinePoints(polygon.rings[0]) : "";
}

function positionStyle(point: MissionMapPoint): string {
  if (overlayUsesBasemapProjection) {
    return `left:${point.x}px;top:${point.y}px;`;
  }

  const viewBoxSize = renderViewport?.viewBoxSize ?? interactiveViewport?.viewBoxSize ?? 1000;
  return `left:${(point.x / viewBoxSize) * 100}%;top:${(point.y / viewBoxSize) * 100}%;`;
}

function missionLineColor(feature: MissionMapLineFeature): string {
  switch (feature.kind) {
    case "arc":
      return "#fbbf24";
    case "spline":
      return "#78d6ff";
    default:
      return "rgba(241, 245, 249, 0.82)";
  }
}

function surveyPolygonFill(feature: MissionMapPolygonFeature): string {
  switch (feature.kind) {
    case "survey_footprint":
      return feature.selected ? "rgba(120, 214, 255, 0.14)" : "rgba(120, 214, 255, 0.08)";
    case "survey_swath_band":
      return feature.selected ? "rgba(34, 197, 94, 0.16)" : "rgba(34, 197, 94, 0.1)";
    case "survey_corridor":
      return feature.selected ? "rgba(120, 214, 255, 0.16)" : "rgba(16, 185, 129, 0.1)";
    default:
      return feature.selected ? "rgba(120, 214, 255, 0.18)" : "rgba(34, 197, 94, 0.12)";
  }
}

function surveyPolygonStroke(feature: MissionMapPolygonFeature): string {
  switch (feature.kind) {
    case "survey_footprint":
      return feature.selected ? "rgba(186, 230, 253, 0.72)" : "rgba(120, 214, 255, 0.4)";
    case "survey_swath_band":
      return feature.selected ? "rgba(110, 231, 183, 0.8)" : "rgba(34, 197, 94, 0.48)";
    default:
      return feature.selected ? "#78d6ff" : "rgba(34, 197, 94, 0.72)";
  }
}

function surveyPolygonStrokeWidth(feature: MissionMapPolygonFeature): number {
  return feature.kind === "survey_footprint" ? 1 : feature.selected ? 4 : 2;
}

function surveyLineColor(feature: MissionMapLineFeature): string {
  switch (feature.kind) {
    case "survey_crosshatch":
      return "rgba(251, 191, 36, 0.9)";
    case "survey_orbit":
      return "rgba(216, 180, 254, 0.92)";
    case "survey_polygon_draft":
      return "rgba(120, 214, 255, 0.78)";
    case "survey_transect":
      return "rgba(74, 222, 128, 0.92)";
    default:
      return feature.selected ? "#78d6ff" : "rgba(34, 197, 94, 0.86)";
  }
}

function surveyLineDash(feature: MissionMapLineFeature): string | null {
  switch (feature.kind) {
    case "survey_crosshatch":
      return "10 6";
    case "survey_orbit":
      return "12 8";
    case "survey_polygon_draft":
      return "12 6";
    default:
      return null;
  }
}

function surveyLineWidth(feature: MissionMapLineFeature): number {
  switch (feature.kind) {
    case "survey_transect":
    case "survey_crosshatch":
      return feature.selected ? 4 : 2.5;
    case "survey_orbit":
      return feature.selected ? 4 : 3;
    default:
      return feature.selected ? 5 : 3;
  }
}

function fencePolygonFill(feature: MissionMapPolygonFeature): string {
  if (/exclusion/i.test(feature.kind)) {
    return feature.selected ? "rgba(248, 113, 113, 0.2)" : "rgba(248, 113, 113, 0.12)";
  }

  return feature.selected ? "rgba(96, 165, 250, 0.18)" : "rgba(96, 165, 250, 0.1)";
}

function fencePolygonStroke(feature: MissionMapPolygonFeature): string {
  if (/exclusion/i.test(feature.kind)) {
    return feature.selected ? "rgba(254, 202, 202, 0.92)" : "rgba(248, 113, 113, 0.78)";
  }

  return feature.selected ? "rgba(191, 219, 254, 0.92)" : "rgba(96, 165, 250, 0.82)";
}

function fenceLineColor(feature: MissionMapLineFeature): string {
  return /exclusion/i.test(feature.kind) ? "rgba(248, 113, 113, 0.88)" : "rgba(96, 165, 250, 0.88)";
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

function startSurveyDraw(patternType: SurveyPatternType) {
  const regionId = onCreateSurveyRegion(patternType);
  surveySession = {
    mode: "draw",
    regionId,
    patternType,
    pointCountMinimum: minimumSurveyPointCount(patternType),
    created: true,
    restoreRegion: null,
  };
  localMessage = {
    tone: "info",
    text: `Drawing ${patternType} survey geometry. Click the planner map to add ${patternType === "corridor" ? "centerline points" : "polygon vertices"}.`,
  };
}

function startSurveyEdit() {
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
  if (!surfaceElement) {
    return null;
  }

  const rect = readSurfaceDrawableBox();
  if (!rect) {
    return null;
  }

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function projectedPointFromPointer(event: Pick<MouseEvent, "clientX" | "clientY">): MissionMapPoint | null {
  const viewport = renderViewport;
  if (!surfaceElement || !viewport) {
    return null;
  }

  const rect = readSurfaceDrawableBox();
  if (!rect) {
    return null;
  }

  return {
    x: ((event.clientX - rect.left) / rect.width) * viewport.viewBoxSize,
    y: ((event.clientY - rect.top) / rect.height) * viewport.viewBoxSize,
  };
}

function coordinateFromPointer(event: Pick<MouseEvent, "clientX" | "clientY">): PointerMapCoordinate | null {
  const offset = pointerOffset(event);
  if (offset && basemap && overlayUsesBasemapProjection && typeof basemap.unproject === "function") {
    const lngLat = basemap.unproject([offset.x, offset.y]);
    return {
      point: offset,
      latitude_deg: lngLat.lat,
      longitude_deg: lngLat.lng,
      projectedByBasemap: true,
    };
  }

  const point = projectedPointFromPointer(event);
  const viewport = renderViewport;
  if (!point || !viewport) {
    return null;
  }

  const coordinate = unprojectMissionMapPoint(viewport, point);
  return {
    point,
    ...coordinate,
    projectedByBasemap: false,
  };
}

function coordinateFromMapCenter(): PointerMapCoordinate | null {
  if (basemap && overlayUsesBasemapProjection && typeof basemap.getCenter === "function") {
    const center = basemap.getCenter();
    return {
      point: {
        x: overlayViewBox.width / 2,
        y: overlayViewBox.height / 2,
      },
      latitude_deg: center.lat,
      longitude_deg: center.lng,
      projectedByBasemap: true,
    };
  }

  const viewport = renderViewport;
  if (!viewport) {
    return null;
  }

  const point = {
    x: viewport.viewBoxSize / 2,
    y: viewport.viewBoxSize / 2,
  };
  return {
    point,
    ...unprojectMissionMapPoint(viewport, point),
    projectedByBasemap: false,
  };
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

  if (!surfaceElement || readOnly) {
    return;
  }

  const offset = pointerOffset(event);
  const coordinate = coordinateFromPointer(event);
  if (!offset || !coordinate) {
    return;
  }

  contextMenu = {
    x: offset.x,
    y: offset.y,
    lngLat: { lng: coordinate.longitude_deg, lat: coordinate.latitude_deg },
  };
}

function buildContextMenuItems(): ContextMenuItem[] {
  if (!contextMenu) {
    return [];
  }

  const { lat, lng } = contextMenu.lngLat;
  const items: ContextMenuItem[] = [];

  if (view.mode === "mission" && onAddWaypointAt) {
    items.push({
      id: "add-waypoint",
      label: "Add waypoint here",
      onSelect: () => {
        onAddWaypointAt!(lat, lng);
        contextMenu = null;
      },
    });
  }

  if (onSetHomeAt) {
    items.push({
      id: "set-home",
      label: "Set Home here",
      onSelect: () => {
        onSetHomeAt!(lat, lng);
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
  basemap.flyTo({ center: lngLat, zoom, duration: 800 });
}

function activateCameraTarget(target: CameraTarget) {
  contextMenu = null;

  if (target === "vehicle") {
    if (!vehicleLngLat) {
      localMessage = { tone: "warning", text: "No vehicle position is available for the mission map yet." };
      return;
    }

    flyToCoordinates(vehicleLngLat);
    localMessage = null;
    return;
  }

  if (target === "home") {
    const lngLat = asLngLat(homeCameraTarget?.latitude_deg, homeCameraTarget?.longitude_deg);
    if (!lngLat) {
      localMessage = { tone: "warning", text: "No home position is available for the mission map yet." };
      return;
    }

    flyToCoordinates(lngLat);
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
    flyToCoordinates([deviceLocation.longitude_deg, deviceLocation.latitude_deg]);
    localMessage = null;
    return;
  }

  ensureDeviceLocationWatch(true);
}

function ensureDeviceLocationWatch(flyWhenReady: boolean): boolean {
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

        if (flyWhenReady) {
          flyToCoordinates([position.coords.longitude, position.coords.latitude]);
          localMessage = null;
        }
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          devicePermissionDenied = true;
          deviceLocation = null;
          stopDeviceLocationWatch();
          localMessage = { tone: "warning", text: "Location permission denied. Enable it in system settings to use my location." };
          return;
        }

        if (error.code === error.POSITION_UNAVAILABLE) {
          deviceLocation = null;
          stopDeviceLocationWatch();
          localMessage = { tone: "warning", text: "Current device location is unavailable." };
        }
      },
      { enableHighAccuracy: true },
    );
  } catch {
    deviceLocationSupported = false;
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

function preventContextMenu(event: MouseEvent) {
  event.preventDefault();
}
</script>

<svelte:window onkeydown={handleKeydown} onpointercancel={handlePointerCancel} onpointermove={handlePointerMove} onpointerup={handlePointerUp} />

<section class={["rounded-lg border border-border bg-bg-primary p-3", fillContainer && "mission-map--fill"]} data-testid={missionWorkspaceTestIds.map}>
  <div class="flex flex-wrap items-start justify-end gap-3">
    <div class="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary">
      <span
        class={`rounded-full border px-3 py-1 ${view.state === "degraded"
          ? "border-warning/40 bg-warning/10 text-warning"
          : view.state === "ready"
            ? "border-success/30 bg-success/10 text-success"
            : "border-border bg-bg-secondary text-text-secondary"}`}
        data-testid={missionWorkspaceTestIds.mapStatus}
      >
        {view.state}
      </span>
      <span class="rounded-full border border-border bg-bg-secondary px-3 py-1" data-testid={missionWorkspaceTestIds.mapSelection}>
        {selectionText}
      </span>
      <span class="rounded-full border border-border bg-bg-secondary px-3 py-1" data-testid={missionWorkspaceTestIds.mapDrawMode}>
        {drawModeText}
      </span>
      <span class="rounded-full border border-border bg-bg-secondary px-3 py-1" data-testid={missionWorkspaceTestIds.mapDragState}>
        {dragStateText}
      </span>
    </div>
  </div>

  {#if view.mode === "mission"}
    <div class="mt-4 flex flex-wrap gap-2">
      <button
        class="rounded-md border border-success/30 bg-success/10 px-4 py-2 text-sm font-semibold text-success transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        data-testid={missionWorkspaceTestIds.mapDrawStartGrid}
        disabled={surveySession !== null}
        onclick={() => startSurveyDraw("grid")}
        type="button"
      >
        Draw grid
      </button>
      <button
        class="rounded-md border border-success/30 bg-success/10 px-4 py-2 text-sm font-semibold text-success transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        data-testid={missionWorkspaceTestIds.mapDrawStartCorridor}
        disabled={surveySession !== null}
        onclick={() => startSurveyDraw("corridor")}
        type="button"
      >
        Draw corridor
      </button>
      <button
        class="rounded-md border border-success/30 bg-success/10 px-4 py-2 text-sm font-semibold text-success transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        data-testid={missionWorkspaceTestIds.mapDrawStartStructure}
        disabled={surveySession !== null}
        onclick={() => startSurveyDraw("structure")}
        type="button"
      >
        Draw structure
      </button>
      <button
        class="rounded-md border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        data-testid={missionWorkspaceTestIds.mapDrawEdit}
        disabled={surveySession !== null || !selectedSurveyRegion}
        onclick={startSurveyEdit}
        type="button"
      >
        Edit selected region
      </button>
      <button
        class="rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
        data-testid={missionWorkspaceTestIds.mapDrawFinish}
        disabled={surveySession === null}
        onclick={finishSurveySession}
        type="button"
      >
        Finish
      </button>
      <button
        class="rounded-md border border-warning/40 bg-warning/10 px-4 py-2 text-sm font-semibold text-warning transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        data-testid={missionWorkspaceTestIds.mapDrawCancel}
        disabled={surveySession === null}
        onclick={cancelSurveySession}
        type="button"
      >
        Cancel
      </button>
    </div>
  {:else if view.mode === "fence"}
    <div class="mt-4 flex flex-wrap gap-2">
      <button
        class="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg-primary transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        data-testid={missionWorkspaceTestIds.mapFencePlaceInclusionPolygon}
        disabled={readOnly}
        onclick={() => startFencePlacement("inclusion_polygon")}
        type="button"
      >
        Place inclusion polygon
      </button>
      <button
        class="rounded-md border border-accent/30 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        data-testid={missionWorkspaceTestIds.mapFencePlaceExclusionPolygon}
        disabled={readOnly}
        onclick={() => startFencePlacement("exclusion_polygon")}
        type="button"
      >
        Place exclusion polygon
      </button>
      <button
        class="rounded-md border border-success/30 bg-success/10 px-4 py-2 text-sm font-semibold text-success transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        data-testid={missionWorkspaceTestIds.mapFencePlaceInclusionCircle}
        disabled={readOnly}
        onclick={() => startFencePlacement("inclusion_circle")}
        type="button"
      >
        Place inclusion circle
      </button>
      <button
        class="rounded-md border border-warning/40 bg-warning/10 px-4 py-2 text-sm font-semibold text-warning transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        data-testid={missionWorkspaceTestIds.mapFencePlaceExclusionCircle}
        disabled={readOnly}
        onclick={() => startFencePlacement("exclusion_circle")}
        type="button"
      >
        Place exclusion circle
      </button>
      <button
        class="rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
        data-testid={missionWorkspaceTestIds.mapFencePlaceReturnPoint}
        disabled={readOnly}
        onclick={() => startFencePlacement("return-point")}
        type="button"
      >
        Place return point
      </button>
      <button
        class="rounded-md border border-danger/40 bg-danger/10 px-4 py-2 text-sm font-semibold text-danger transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
        data-testid={missionWorkspaceTestIds.mapFenceClearReturnPoint}
        disabled={readOnly || view.fenceReturnPoint === null}
        onclick={() => applyFenceMutationResult(onClearFenceReturnPoint?.())}
        type="button"
      >
        Clear return point
      </button>
      <button
        class="rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
        data-testid={missionWorkspaceTestIds.mapFencePlacementCancel}
        disabled={fencePlacementMode === null}
        onclick={cancelFencePlacement}
        type="button"
      >
        Cancel placement
      </button>
    </div>
  {/if}

  {#if localMessage && localMessage.tone === "info"}
    <div class="mt-3 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-text-primary">
      {localMessage.text}
    </div>
  {/if}

  <div class="mission-map__stats-grid mt-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
    <div class="rounded-xl border border-border bg-bg-secondary/60 px-3 py-2 text-xs text-text-secondary">
      <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Markers</p>
      <p class="mt-1 text-sm font-semibold text-text-primary" data-testid={missionWorkspaceTestIds.mapMarkerCount}>{view.counts.markers}</p>
    </div>
    <div class="rounded-xl border border-border bg-bg-secondary/60 px-3 py-2 text-xs text-text-secondary">
      <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Path features</p>
      <p class="mt-1 text-sm font-semibold text-text-primary" data-testid={missionWorkspaceTestIds.mapPathCount}>{view.counts.missionFeatures}</p>
    </div>
    <div class="rounded-xl border border-border bg-bg-secondary/60 px-3 py-2 text-xs text-text-secondary">
      <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Survey features</p>
      <p class="mt-1 text-sm font-semibold text-text-primary" data-testid={missionWorkspaceTestIds.mapSurveyCount}>{view.counts.surveyFeatures}</p>
    </div>
    {#if view.mode === "fence"}
      <div class="rounded-xl border border-border bg-bg-secondary/60 px-3 py-2 text-xs text-text-secondary">
        <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Fence features</p>
        <p class="mt-1 text-sm font-semibold text-text-primary" data-testid={missionWorkspaceTestIds.mapFenceCount}>{view.counts.fenceFeatures}</p>
      </div>
      <div class="rounded-xl border border-border bg-bg-secondary/60 px-3 py-2 text-xs text-text-secondary">
        <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Fence vertices</p>
        <p class="mt-1 text-sm font-semibold text-text-primary" data-testid={missionWorkspaceTestIds.mapFenceVertexCount}>{view.counts.fenceVertexHandles}</p>
      </div>
      <div class="rounded-xl border border-border bg-bg-secondary/60 px-3 py-2 text-xs text-text-secondary">
        <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Return point</p>
        <p class="mt-1 text-sm font-semibold text-text-primary" data-testid={missionWorkspaceTestIds.mapFenceReturnPointState}>{view.counts.fenceHasReturnPoint ? "set" : "none"}</p>
      </div>
    {:else if view.mode === "rally"}
      <div class="rounded-xl border border-border bg-bg-secondary/60 px-3 py-2 text-xs text-text-secondary">
        <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Rally markers</p>
        <p class="mt-1 text-sm font-semibold text-text-primary" data-testid={missionWorkspaceTestIds.mapRallyCount}>{view.counts.rallyMarkers}</p>
      </div>
      <div class="rounded-xl border border-border bg-bg-secondary/60 px-3 py-2 text-xs text-text-secondary">
        <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Rally features</p>
        <p class="mt-1 text-sm font-semibold text-text-primary">{view.counts.rallyFeatures}</p>
      </div>
      <div class="rounded-xl border border-border bg-bg-secondary/60 px-3 py-2 text-xs text-text-secondary">
        <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Read-only truth</p>
        <p class="mt-1 text-sm font-semibold text-text-primary">{readOnly ? "blocked" : "editable"}</p>
      </div>
    {:else}
      <div class="rounded-xl border border-border bg-bg-secondary/60 px-3 py-2 text-xs text-text-secondary">
        <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Preview features</p>
        <p class="mt-1 text-sm font-semibold text-text-primary" data-testid={missionWorkspaceTestIds.mapPreviewCount}>{view.counts.surveyPreviewFeatures}</p>
      </div>
      <div class="rounded-xl border border-border bg-bg-secondary/60 px-3 py-2 text-xs text-text-secondary">
        <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Survey handles</p>
        <p class="mt-1 text-sm font-semibold text-text-primary">{view.counts.surveyHandles}</p>
      </div>
      <div class="rounded-xl border border-border bg-bg-secondary/60 px-3 py-2 text-xs text-text-secondary">
        <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Editable vertices</p>
        <p class="mt-1 text-sm font-semibold text-text-primary">{view.counts.surveyVertexHandles}</p>
      </div>
    {/if}
  </div>

  {#if renderViewport}
    <div class={["rounded-lg border border-border bg-bg-secondary/40 p-3", fillContainer ? "mission-map__surface-wrap--fill" : "mt-4"]}>
      <div
        bind:this={surfaceElement}
        aria-label="Mission planner map"
        class={["mission-map-surface relative overflow-hidden rounded-[20px] border border-border/70 bg-bg-primary", fillContainer ? "h-full" : "aspect-[5/4]"]}
        data-testid={missionWorkspaceTestIds.mapSurface}
        oncontextmenu={handleContextMenu}
        role="application"
      >
        <div bind:this={basemapElement} class="mission-map-basemap" data-testid={missionWorkspaceTestIds.mapBasemap}></div>
        <div class="mission-map-basemap-scrim"></div>
        <svg aria-hidden="true" class="mission-map-overlay absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox={`0 0 ${overlayViewBox.width} ${overlayViewBox.height}`}>

          {#each renderSurveyPolygons as polygon (polygon.id)}
            <polygon
              fill={surveyPolygonFill(polygon)}
              points={toPolygonPoints(polygon)}
              stroke={surveyPolygonStroke(polygon)}
              stroke-width={surveyPolygonStrokeWidth(polygon)}
            />
          {/each}

          {#each renderSurveyLines as line (line.id)}
            <polyline
              fill="none"
              points={toPolylinePoints(line.points)}
              stroke={surveyLineColor(line)}
              stroke-dasharray={surveyLineDash(line) ?? undefined}
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width={surveyLineWidth(line)}
            />
          {/each}

          {#each renderFencePolygons as polygon (polygon.id)}
            <polygon
              fill={fencePolygonFill(polygon)}
              points={toPolygonPoints(polygon)}
              stroke={fencePolygonStroke(polygon)}
              stroke-dasharray={/inclusion/i.test(polygon.kind) ? "8 6" : undefined}
              stroke-width={polygon.selected ? 4 : 2}
            />
          {/each}

          {#each renderFenceLines as line (line.id)}
            <polyline
              fill="none"
              points={toPolylinePoints(line.points)}
              stroke={fenceLineColor(line)}
              stroke-dasharray={/inclusion/i.test(line.kind) ? "8 6" : undefined}
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width={line.selected ? 4 : 2.5}
            />
          {/each}

          {#each renderMissionPolygons as polygon (polygon.id)}
            <polygon
              fill="rgba(120, 214, 255, 0.1)"
              points={toPolygonPoints(polygon)}
              stroke="rgba(120, 214, 255, 0.8)"
              stroke-dasharray="8 6"
              stroke-width="2"
            />
          {/each}

          {#each renderMissionLines as line (line.id)}
            <polyline
              fill="none"
              points={toPolylinePoints(line.points)}
              stroke={missionLineColor(line)}
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width={line.kind === "arc" ? 4 : line.kind === "spline" ? 4 : 3}
            />
          {/each}

          {#if renderReplayOverlayPath.length > 1}
            <polyline
              data-testid={missionWorkspaceTestIds.mapReplayPath}
              fill="none"
              points={toPolylinePoints(renderReplayOverlayPath)}
              stroke="rgba(245, 158, 11, 0.92)"
              stroke-dasharray="10 8"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="4"
            />
          {/if}

          {#each renderMissionLabels as label (label.id)}
            <text
              fill="rgba(241, 245, 249, 0.88)"
              font-size="22"
              font-weight="600"
              text-anchor="middle"
              x={label.point.x}
              y={label.point.y - 12}
            >
              {label.text}
            </text>
          {/each}
        </svg>

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

        <div class={["map-locate-group mission-map__control-group mission-map__control-group--layers", mapControlsPassive && "is-passive"]}>
          <button aria-label="Normal map mode" aria-pressed={mapLayerMode === "normal"} class={["map-locate-btn", mapLayerMode === "normal" && "is-active"]} onclick={() => { mapLayerMode = "normal"; }} title="Normal" type="button">
            <MapIcon aria-hidden="true" size={16} />
          </button>
          <button aria-label="Hybrid map mode" aria-pressed={mapLayerMode === "hybrid"} class={["map-locate-btn", mapLayerMode === "hybrid" && "is-active"]} onclick={() => { mapLayerMode = "hybrid"; }} title="Hybrid" type="button">
            <Layers aria-hidden="true" size={16} />
          </button>
          <button aria-label="Satellite map mode" aria-pressed={mapLayerMode === "satellite"} class={["map-locate-btn", mapLayerMode === "satellite" && "is-active"]} onclick={() => { mapLayerMode = "satellite"; }} title="Satellite" type="button">
            <Satellite aria-hidden="true" size={16} />
          </button>
          <button aria-label="Toggle 3D terrain" aria-pressed={terrainModeEnabled} class={["map-locate-btn", terrainModeEnabled && "is-active"]} onclick={() => { terrainModeEnabled = !terrainModeEnabled; }} title="3D terrain" type="button">
            <span class="mission-map__button-text">3D</span>
          </button>
        </div>

        <div class={["map-locate-group mission-map__control-group mission-map__control-group--targets", mapControlsPassive && "is-passive"]}>
          {#if deviceLocationSupported || devicePermissionDenied}
            <button aria-label="My location" class="map-locate-btn" oncontextmenu={preventContextMenu} onclick={() => activateCameraTarget("device")} title="My location" type="button">
              <LocateFixed aria-hidden="true" size={16} />
            </button>
          {/if}
          <button aria-label="Home location" class="map-locate-btn" oncontextmenu={preventContextMenu} onclick={() => activateCameraTarget("home")} title="Home location" type="button">
            <Home aria-hidden="true" size={16} />
          </button>
          <button aria-label="Vehicle location" class="map-locate-btn" oncontextmenu={preventContextMenu} onclick={() => activateCameraTarget("vehicle")} title="Vehicle location" type="button">
            <Navigation aria-hidden="true" size={16} />
          </button>
        </div>

        {#if view.state === "empty"}
          <div
            class="pointer-events-none absolute inset-x-6 bottom-6 rounded-lg border border-border/80 bg-bg-primary/88 px-4 py-3 text-sm text-text-secondary"
            data-testid={missionWorkspaceTestIds.mapEmpty}
          >
            {view.mode === "fence"
              ? "Blank fence surface ready. Place an inclusion or exclusion shape, then refine vertices, circle radius, and the return point directly on the planner map."
              : view.mode === "rally"
                ? "Blank rally surface ready. Add a rally point from the list, then drag it on the map or refine its coordinates and altitude frame from the inspector."
                : "Blank planner surface ready. Draw a grid, corridor, or structure survey here, or add Home and manual mission items to project existing geometry."}
          </div>
        {:else if view.state === "degraded"}
          <div
            class="pointer-events-none absolute inset-x-6 bottom-6 rounded-lg border border-warning/40 bg-bg-primary/88 px-4 py-3 text-sm text-warning"
            data-testid={missionWorkspaceTestIds.mapUnavailable}
          >
            {view.mode === "fence"
              ? "Some fence geometry degraded, but the planner surface stayed interactive so you can recover selection, fix malformed regions, or keep editing the return point safely."
              : view.mode === "rally"
                ? "Some rally geometry degraded, but the planner surface stayed interactive so you can keep the last valid rally markers, recover selection, and avoid moving the wrong point."
                : "Some survey geometry degraded, but the planner surface stayed interactive so you can finish drawing, recover selection, or edit the region safely."}
          </div>
        {/if}

        {#each renderSurveyHandles as handle (handle.regionId)}
          <button
            class={`mission-map-survey-handle ${handle.selected ? "is-selected" : ""}`}
            data-testid={surveyHandleTestId(handle)}
            onclick={(event) => {
              event.stopPropagation();
              handleSurveySelection(handle.regionId);
            }}
            style={positionStyle(handle.point)}
            type="button"
          >
            {handle.label}
          </button>
        {/each}

        {#each renderSurveyVertexHandles as handle (handle.id)}
          <button
            class={`mission-map-vertex-handle ${handle.selected ? "is-selected" : ""} ${surveySession?.regionId === handle.regionId ? "is-draggable" : ""}`}
            data-testid={surveyVertexHandleTestId(handle)}
            onclick={(event) => {
              event.stopPropagation();
              handleSurveySelection(handle.regionId);
            }}
            onpointerdown={(event) => startSurveyHandleDrag(event, handle)}
            style={positionStyle(handle.point)}
            type="button"
          >
            {handle.index + 1}
          </button>
        {/each}

        {#each renderFenceRegionHandles as handle (handle.id)}
          <button
            class={`mission-map-fence-handle ${handle.selected ? "is-selected" : ""} ${handle.draggable ? "is-draggable" : ""} ${handle.inclusion ? "is-inclusion" : "is-exclusion"}`}
            data-testid={fenceRegionHandleTestId(handle)}
            onclick={(event) => {
              event.stopPropagation();
              handleFenceRegionSelection(handle.regionUiId);
            }}
            onpointerdown={(event) => startFenceRegionDrag(event, handle)}
            style={positionStyle(handle.point)}
            type="button"
          >
            {handle.label}
          </button>
        {/each}

        {#each renderFenceVertexHandles as handle (handle.id)}
          <button
            class={`mission-map-fence-vertex ${handle.selected ? "is-selected" : ""}`}
            data-testid={fenceVertexHandleTestId(handle)}
            onclick={(event) => {
              event.stopPropagation();
              handleFenceRegionSelection(handle.regionUiId);
            }}
            onpointerdown={(event) => startFenceVertexDrag(event, handle)}
            style={positionStyle(handle.point)}
            type="button"
          >
            {handle.index + 1}
          </button>
        {/each}

        {#each renderFenceRadiusHandles as handle (handle.id)}
          <button
            class={`mission-map-fence-radius ${handle.selected ? "is-selected" : ""}`}
            data-testid={fenceRadiusHandleTestId(handle)}
            onclick={(event) => {
              event.stopPropagation();
              handleFenceRegionSelection(handle.regionUiId);
            }}
            onpointerdown={(event) => startFenceRadiusDrag(event, handle)}
            style={positionStyle(handle.point)}
            type="button"
          >
            R
          </button>
        {/each}

        {#if renderFenceReturnPoint}
          <button
            class={`mission-map-fence-return ${renderFenceReturnPoint.selected ? "is-selected" : ""}`}
            data-testid={missionWorkspaceTestIds.mapFenceReturnPointHandle}
            onclick={(event) => {
              event.stopPropagation();
              handleFenceReturnPointSelection();
            }}
            onpointerdown={startFenceReturnPointDrag}
            style={positionStyle(renderFenceReturnPoint.point)}
            type="button"
          >
            R
          </button>
        {/if}

        {#each renderMarkers as marker (marker.id)}
          <button
            class={`mission-map-marker ${marker.kind === "home" ? "is-home" : ""} ${marker.kind === "rally-point" ? "is-rally" : ""} ${marker.selected ? "is-selected" : ""} ${marker.current ? "is-current" : ""} ${marker.readOnly ? "is-readonly" : ""}`}
            data-dragging={activeMarkerDrag?.markerId === marker.id ? "true" : "false"}
            data-selected={marker.selected ? "true" : "false"}
            data-testid={markerTestId(marker)}
            onclick={(event) => {
              event.stopPropagation();
              handleMarkerSelection(marker);
            }}
            onpointerdown={(event) => startMarkerDrag(event, marker)}
            style={positionStyle(marker.point)}
            type="button"
          >
            {marker.label}
          </button>
        {/each}

        {#if renderReplayOverlayMarker}
          <div
            class="mission-map-replay-marker"
            data-testid={missionWorkspaceTestIds.mapReplayMarker}
            style={positionStyle(renderReplayOverlayMarker)}
          >
            ▶
          </div>
        {/if}

        {#if contextMenu}
          {@const menuItems = buildContextMenuItems()}
          {#if menuItems.length > 0}
            <ContextMenu
              items={menuItems}
              controlled={{
                open: true,
                x: contextMenu.x,
                y: contextMenu.y,
                onOpenChange: (value) => { if (!value) contextMenu = null; },
              }}
            />
          {/if}
        {/if}
      </div>
    </div>
  {/if}

  {#if diagnostics.length > 0}
    <div class="mt-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
      <p class="font-semibold">Map diagnostics</p>
      <ul class="mt-2 list-inside list-disc space-y-1 text-xs">
        {#each diagnostics as warning (`${warning}`)}
          <li>{warning}</li>
        {/each}
      </ul>
    </div>
  {/if}

  <pre class="sr-only" data-testid={missionWorkspaceTestIds.mapDebug}>{JSON.stringify(debugPayload)}</pre>
</section>

<style>
  .mission-map--fill {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .mission-map__surface-wrap--fill {
    flex: 1 0 220px;
    min-height: 220px;
    margin-top: 1rem;
  }

  /* Inside .mission-map--fill (flex column with overflow:hidden), default
     flex-shrink lets non-flex children get squashed by the flex:1 surface
     wrap. Keep header rows, draw buttons, and stats grids fully visible. */
  .mission-map--fill > :not(.mission-map__surface-wrap--fill) {
    flex-shrink: 0;
  }

  .mission-map-surface {
    touch-action: none;
  }

  .mission-map-replay-marker {
    position: absolute;
    width: 1.8rem;
    height: 1.8rem;
    margin-left: -0.9rem;
    margin-top: -0.9rem;
    border-radius: 9999px;
    border: 1px solid color-mix(in srgb, var(--color-warning) 55%, white);
    background: color-mix(in srgb, var(--color-warning) 28%, var(--color-bg-primary));
    color: var(--color-warning);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
    font-weight: 700;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-bg-primary) 82%, transparent);
    pointer-events: none;
  }

  .mission-map-basemap,
  .mission-map-basemap-scrim,
  .mission-map-overlay {
    position: absolute;
    inset: 0;
  }

  .mission-map-basemap {
    z-index: 0;
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

  .mission-map-overlay {
    z-index: 0;
    pointer-events: none;
  }

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

  .mission-map-draw-surface {
    position: absolute;
    inset: 0;
    z-index: 1;
    border: 0;
    background: transparent;
    cursor: crosshair;
  }

  .mission-map-marker,
  .mission-map-survey-handle,
  .mission-map-vertex-handle,
  .mission-map-fence-handle,
  .mission-map-fence-vertex,
  .mission-map-fence-radius,
  .mission-map-fence-return {
    position: absolute;
    z-index: 2;
    transform: translate(-50%, -50%);
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 700;
    line-height: 1;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.32);
  }

  .mission-map-marker {
    width: 2rem;
    height: 2rem;
    border: 2px solid rgba(7, 32, 53, 0.94);
    background: var(--color-accent);
    color: #03101a;
    cursor: grab;
  }

  .mission-map-marker[data-dragging="true"] {
    cursor: grabbing;
  }

  .mission-map-marker.is-selected {
    background: var(--color-warning);
    transform: translate(-50%, -50%) scale(1.08);
  }

  .mission-map-marker.is-home {
    background: var(--color-success);
  }

  .mission-map-marker.is-rally {
    background: rgb(251, 191, 36);
    color: #1f2937;
  }

  .mission-map-marker.is-current {
    background: var(--color-danger);
    color: white;
  }

  .mission-map-marker.is-readonly {
    cursor: default;
    opacity: 0.72;
  }

  .mission-map-survey-handle {
    min-width: 1.9rem;
    height: 1.9rem;
    border: 1px solid rgba(34, 197, 94, 0.45);
    background: rgba(34, 197, 94, 0.2);
    color: rgb(134, 239, 172);
    padding: 0 0.5rem;
  }

  .mission-map-survey-handle.is-selected {
    border-color: rgba(120, 214, 255, 0.72);
    background: rgba(120, 214, 255, 0.18);
    color: rgb(186, 230, 253);
  }

  .mission-map-vertex-handle {
    min-width: 1.4rem;
    height: 1.4rem;
    border: 1px solid rgba(120, 214, 255, 0.6);
    background: rgba(12, 74, 110, 0.92);
    color: rgb(186, 230, 253);
    cursor: default;
  }

  .mission-map-vertex-handle.is-selected {
    border-color: rgba(191, 219, 254, 0.92);
    background: rgba(30, 64, 175, 0.92);
  }

  .mission-map-vertex-handle.is-draggable {
    cursor: grab;
  }

  .mission-map-fence-handle {
    min-width: 2rem;
    height: 2rem;
    border: 1px solid rgba(96, 165, 250, 0.6);
    background: rgba(30, 41, 59, 0.92);
    color: rgb(219, 234, 254);
    padding: 0 0.45rem;
    cursor: pointer;
  }

  .mission-map-fence-handle.is-inclusion {
    border-color: rgba(96, 165, 250, 0.72);
    color: rgb(191, 219, 254);
  }

  .mission-map-fence-handle.is-exclusion {
    border-color: rgba(248, 113, 113, 0.72);
    color: rgb(254, 202, 202);
  }

  .mission-map-fence-handle.is-selected {
    transform: translate(-50%, -50%) scale(1.08);
  }

  .mission-map-fence-handle.is-draggable {
    cursor: grab;
  }

  .mission-map-fence-vertex,
  .mission-map-fence-radius,
  .mission-map-fence-return {
    width: 1.55rem;
    height: 1.55rem;
    border: 1px solid rgba(191, 219, 254, 0.82);
    background: rgba(15, 23, 42, 0.94);
    color: rgb(219, 234, 254);
    cursor: grab;
  }

  .mission-map-fence-vertex.is-selected,
  .mission-map-fence-radius.is-selected,
  .mission-map-fence-return.is-selected {
    border-color: rgba(250, 204, 21, 0.92);
    color: rgb(254, 240, 138);
    transform: translate(-50%, -50%) scale(1.08);
  }

  .mission-map-fence-return {
    border-color: rgba(52, 211, 153, 0.82);
    color: rgb(167, 243, 208);
    background: rgba(6, 78, 59, 0.92);
  }

</style>
