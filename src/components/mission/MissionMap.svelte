<script lang="ts">
import { onDestroy } from "svelte";

import {
  buildMissionMapViewport,
  resolveMissionMapDrag,
  resolveMissionMapSurveyHandleDrag,
  unprojectMissionMapPoint,
  type MissionMapLineFeature,
  type MissionMapMarker,
  type MissionMapPoint,
  type MissionMapPolygonFeature,
  type MissionMapSurveyHandle,
  type MissionMapSurveyVertexHandle,
  type MissionMapView,
  type MissionMapViewport,
} from "../../lib/mission-map-view";
import {
  minimumSurveyPointCount,
  setSurveyGeometryPoints,
  surveyGeometryKind,
  surveyGeometryPoints,
} from "../../lib/mission-map-survey";
import type { GeoPoint2d } from "../../lib/mavkit-types";
import type { SurveyPatternType, SurveyRegion } from "../../lib/survey-region";
import type { MissionPlannerMapMoveResult } from "../../lib/stores/mission-planner";
import {
  clearMissionMapDebugSnapshot,
  publishMissionMapDebugSnapshot,
} from "./mission-map-debug";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

type Props = {
  view: MissionMapView;
  fallbackReference: GeoPoint2d;
  selectedSurveyRegion: SurveyRegion | null;
  onSelectHome: () => void;
  onSelectMissionItem: (uiId: number) => void;
  onSelectSurveyRegion: (regionId: string) => void;
  onCreateSurveyRegion: (patternType: SurveyPatternType) => string;
  onUpdateSurveyRegion: (regionId: string, updater: (region: SurveyRegion) => SurveyRegion) => void;
  onDeleteSurveyRegion: (regionId: string) => void;
  onMoveHome: (latitudeDeg: number, longitudeDeg: number) => MissionPlannerMapMoveResult;
  onMoveMissionItem: (uiId: number, latitudeDeg: number, longitudeDeg: number) => MissionPlannerMapMoveResult;
};

type ActiveMarkerDrag = {
  markerId: string;
  kind: "home" | "mission-item";
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

const GRID_TICKS = [125, 250, 375, 500, 625, 750, 875];

let {
  view,
  fallbackReference,
  selectedSurveyRegion,
  onSelectHome,
  onSelectMissionItem,
  onSelectSurveyRegion,
  onCreateSurveyRegion,
  onUpdateSurveyRegion,
  onDeleteSurveyRegion,
  onMoveHome,
  onMoveMissionItem,
}: Props = $props();

let surfaceElement = $state<HTMLDivElement | null>(null);
let activeMarkerDrag = $state<ActiveMarkerDrag | null>(null);
let activeSurveyHandleDrag = $state<ActiveSurveyHandleDrag | null>(null);
let surveySession = $state<SurveySession | null>(null);
let localMessage = $state<LocalMapMessage | null>(null);
let lastUsableViewport = $state<MissionMapViewport | null>(null);

let fallbackViewport = $derived(buildMissionMapViewport(fallbackReference, [fallbackReference]));
let interactiveViewport = $derived(view.viewport ?? lastUsableViewport ?? fallbackViewport);
let selectedSurveyRegionId = $derived(view.selection.kind === "survey-block" ? view.selection.regionId : null);
let activeSurveyPointCount = $derived.by(() => {
  if (!surveySession || !selectedSurveyRegion || selectedSurveyRegion.id !== surveySession.regionId) {
    return 0;
  }

  return surveyGeometryPoints(selectedSurveyRegion).length;
});
let diagnostics = $derived.by(() => {
  const warnings = [...view.warnings];
  if (localMessage?.tone === "warning") {
    warnings.push(localMessage.text);
  }
  return [...new Set(warnings)];
});
let drawModeText = $derived.by(() => {
  if (!surveySession) {
    return "idle";
  }

  return `${surveySession.mode}:${surveySession.patternType}:${activeSurveyPointCount}`;
});
let dragStateText = $derived.by(() => {
  if (activeMarkerDrag) {
    return `${activeMarkerDrag.kind}:${activeMarkerDrag.markerId}:${activeMarkerDrag.updateCount}`;
  }

  if (activeSurveyHandleDrag) {
    return `survey-handle:${activeSurveyHandleDrag.handleId}:${activeSurveyHandleDrag.updateCount}`;
  }

  return localMessage?.text ?? "idle";
});
let selectionText = $derived.by(() => {
  if (view.selection.kind === "home") {
    return "home";
  }

  if (view.selection.kind === "mission-item") {
    return view.selection.uiId === null ? "mission item" : `mission item ${view.selection.uiId}`;
  }

  return view.selection.regionId ? `survey ${view.selection.regionId}` : "survey block";
});
let debugPayload = $derived({
  state: view.state,
  selection: view.selection,
  counts: view.counts,
  warnings: diagnostics,
  dragTargetId: activeMarkerDrag?.markerId ?? activeSurveyHandleDrag?.handleId ?? null,
  dragUpdateCount: activeMarkerDrag?.updateCount ?? activeSurveyHandleDrag?.updateCount ?? 0,
  drawMode: surveySession?.mode ?? "idle",
  drawPatternType: surveySession?.patternType ?? null,
  drawRegionId: surveySession?.regionId ?? null,
  drawPointCount: activeSurveyPointCount,
  selectedSurveyRegionId,
});

$effect(() => {
  if (view.viewport) {
    lastUsableViewport = view.viewport;
  }
});

$effect(() => {
  publishMissionMapDebugSnapshot({
    state: view.state,
    selection: view.selection,
    counts: view.counts,
    warnings: diagnostics,
    dragTargetId: activeMarkerDrag?.markerId ?? activeSurveyHandleDrag?.handleId ?? null,
    dragUpdateCount: activeMarkerDrag?.updateCount ?? activeSurveyHandleDrag?.updateCount ?? 0,
    missionGeoJson: view.missionGeoJson,
    surveyGeoJson: view.surveyGeoJson,
    drawMode: surveySession?.mode ?? "idle",
    drawPatternType: surveySession?.patternType ?? null,
    drawRegionId: surveySession?.regionId ?? null,
    drawPointCount: activeSurveyPointCount,
    selectedSurveyRegionId,
    activeSurveyVertexCount: view.counts.surveyVertexHandles,
    surveyPreviewFeatureCount: view.counts.surveyPreviewFeatures,
  });
});

onDestroy(() => {
  clearMissionMapDebugSnapshot();
});

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

function toPolylinePoints(points: MissionMapPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function toPolygonPoints(polygon: MissionMapPolygonFeature): string {
  return polygon.rings[0] ? toPolylinePoints(polygon.rings[0]) : "";
}

function positionStyle(point: MissionMapPoint): string {
  const viewBoxSize = interactiveViewport?.viewBoxSize ?? 1000;
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

function handleMarkerSelection(marker: MissionMapMarker) {
  localMessage = null;

  if (marker.kind === "home") {
    onSelectHome();
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

function startMarkerDrag(event: PointerEvent, marker: MissionMapMarker) {
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

function applyMoveResult(result: MissionPlannerMapMoveResult): boolean {
  if (result.status === "rejected") {
    cancelActiveMarkerDrag(result.message, true);
    return false;
  }

  localMessage = null;
  return true;
}

function projectedPointFromPointer(event: Pick<MouseEvent, "clientX" | "clientY">): MissionMapPoint | null {
  const viewport = interactiveViewport;
  if (!surfaceElement || !viewport) {
    return null;
  }

  const rect = surfaceElement.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return null;
  }

  return {
    x: ((event.clientX - rect.left) / rect.width) * viewport.viewBoxSize,
    y: ((event.clientY - rect.top) / rect.height) * viewport.viewBoxSize,
  };
}

function appendSurveyPoint(point: MissionMapPoint) {
  const currentSession = surveySession;
  const viewport = interactiveViewport;
  if (!currentSession || !viewport || activeMarkerDrag || activeSurveyHandleDrag) {
    return;
  }

  const { latitude_deg, longitude_deg } = unprojectMissionMapPoint(viewport, point);
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
  const point = projectedPointFromPointer(event);
  if (!point) {
    localMessage = {
      tone: "warning",
      text: "Ignored the draw click because the planner map surface has no usable bounds yet.",
    };
    return;
  }

  appendSurveyPoint(point);
}

function handleSurfaceKeydown(event: KeyboardEvent) {
  if (!surveySession || !interactiveViewport) {
    return;
  }

  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  appendSurveyPoint({
    x: interactiveViewport.viewBoxSize / 2,
    y: interactiveViewport.viewBoxSize / 2,
  });
}

function handlePointerMove(event: PointerEvent) {
  if (activeMarkerDrag) {
    const nextPoint = projectedPointFromPointer(event);
    if (!nextPoint) {
      return;
    }

    const resolution = resolveMissionMapDrag(view, activeMarkerDrag.markerId, nextPoint);
    if (resolution.status === "rejected") {
      cancelActiveMarkerDrag(resolution.message, true);
      return;
    }

    const moved = activeMarkerDrag.kind === "home"
      ? onMoveHome(resolution.latitude_deg, resolution.longitude_deg)
      : activeMarkerDrag.uiId !== null
        ? onMoveMissionItem(activeMarkerDrag.uiId, resolution.latitude_deg, resolution.longitude_deg)
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

  if (!activeSurveyHandleDrag) {
    return;
  }

  const nextPoint = projectedPointFromPointer(event);
  if (!nextPoint) {
    return;
  }

  const resolution = resolveMissionMapSurveyHandleDrag(view, activeSurveyHandleDrag.handleId, nextPoint);
  if (resolution.status === "rejected") {
    cancelActiveSurveyHandleDrag(resolution.message);
    return;
  }

  let applied = false;
  onUpdateSurveyRegion(activeSurveyHandleDrag.regionId, (current) => {
    const currentGeometryKind = surveyGeometryKind(current);
    if (currentGeometryKind !== activeSurveyHandleDrag.geometryKind) {
      return current;
    }

    const points = [...surveyGeometryPoints(current)];
    const point = points[activeSurveyHandleDrag.index];
    if (!point) {
      return current;
    }

    points[activeSurveyHandleDrag.index] = {
      latitude_deg: resolution.latitude_deg,
      longitude_deg: resolution.longitude_deg,
    };
    applied = true;
    return setSurveyGeometryPoints(current, points);
  });

  if (!applied) {
    cancelActiveSurveyHandleDrag("Ignored a stale survey-handle drag because that vertex no longer exists.");
    return;
  }

  onSelectSurveyRegion(activeSurveyHandleDrag.regionId);
  activeSurveyHandleDrag = {
    ...activeSurveyHandleDrag,
    updateCount: activeSurveyHandleDrag.updateCount + 1,
  };
  localMessage = null;
}

function handlePointerUp() {
  if (activeMarkerDrag) {
    activeMarkerDrag = null;
  }

  if (activeSurveyHandleDrag) {
    activeSurveyHandleDrag = null;
  }
}

function handlePointerCancel() {
  if (activeMarkerDrag) {
    cancelActiveMarkerDrag("Map drag cancelled. Restored the previous marker position.", true);
    return;
  }

  if (activeSurveyHandleDrag) {
    cancelActiveSurveyHandleDrag("Survey handle drag cancelled. The current geometry stayed at the last valid point.");
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

  if (surveySession) {
    event.preventDefault();
    cancelSurveySession();
  }
}
</script>

<svelte:window onkeydown={handleKeydown} onpointercancel={handlePointerCancel} onpointermove={handlePointerMove} onpointerup={handlePointerUp} />

<section class="rounded-2xl border border-border bg-bg-primary p-4" data-testid={missionWorkspaceTestIds.map}>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Planner map</p>
      <h3 class="mt-1 text-sm font-semibold text-text-primary">Shared mission geometry</h3>
      <p class="mt-1 text-xs text-text-secondary">
        The map, list, and inspector all read from the same mission draft so survey drawing, vertex edits, and preview overlays stay truthful.
      </p>
    </div>

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

  <div class="mt-4 flex flex-wrap gap-2">
    <button
      class="rounded-full border border-success/30 bg-success/10 px-4 py-2 text-sm font-semibold text-success transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={missionWorkspaceTestIds.mapDrawStartGrid}
      disabled={surveySession !== null}
      onclick={() => startSurveyDraw("grid")}
      type="button"
    >
      Draw grid
    </button>
    <button
      class="rounded-full border border-success/30 bg-success/10 px-4 py-2 text-sm font-semibold text-success transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={missionWorkspaceTestIds.mapDrawStartCorridor}
      disabled={surveySession !== null}
      onclick={() => startSurveyDraw("corridor")}
      type="button"
    >
      Draw corridor
    </button>
    <button
      class="rounded-full border border-success/30 bg-success/10 px-4 py-2 text-sm font-semibold text-success transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={missionWorkspaceTestIds.mapDrawStartStructure}
      disabled={surveySession !== null}
      onclick={() => startSurveyDraw("structure")}
      type="button"
    >
      Draw structure
    </button>
    <button
      class="rounded-full border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={missionWorkspaceTestIds.mapDrawEdit}
      disabled={surveySession !== null || !selectedSurveyRegion}
      onclick={startSurveyEdit}
      type="button"
    >
      Edit selected region
    </button>
    <button
      class="rounded-full border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={missionWorkspaceTestIds.mapDrawFinish}
      disabled={surveySession === null}
      onclick={finishSurveySession}
      type="button"
    >
      Finish
    </button>
    <button
      class="rounded-full border border-warning/40 bg-warning/10 px-4 py-2 text-sm font-semibold text-warning transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={missionWorkspaceTestIds.mapDrawCancel}
      disabled={surveySession === null}
      onclick={cancelSurveySession}
      type="button"
    >
      Cancel
    </button>
  </div>

  {#if localMessage && localMessage.tone === "info"}
    <div class="mt-3 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-text-primary">
      {localMessage.text}
    </div>
  {/if}

  <div class="mt-4 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
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
  </div>

  {#if interactiveViewport}
    <div class="mt-4 rounded-2xl border border-border bg-bg-secondary/40 p-3">
      <div
        bind:this={surfaceElement}
        class="mission-map-surface relative aspect-[5/4] overflow-hidden rounded-[20px] border border-border/70 bg-[radial-gradient(circle_at_top,_rgba(120,214,255,0.12),_transparent_55%),linear-gradient(180deg,_rgba(6,14,23,0.96),_rgba(8,20,32,0.88))]"
        data-testid={missionWorkspaceTestIds.mapSurface}
      >
        <svg aria-hidden="true" class="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox={`0 0 ${interactiveViewport.viewBoxSize} ${interactiveViewport.viewBoxSize}`}>
          {#each GRID_TICKS as tick (tick)}
            <line stroke="rgba(120, 214, 255, 0.08)" stroke-width="1" x1={tick} x2={tick} y1="0" y2={interactiveViewport.viewBoxSize} />
            <line stroke="rgba(120, 214, 255, 0.08)" stroke-width="1" x1="0" x2={interactiveViewport.viewBoxSize} y1={tick} y2={tick} />
          {/each}

          {#each view.surveyPolygons as polygon (polygon.id)}
            <polygon
              fill={surveyPolygonFill(polygon)}
              points={toPolygonPoints(polygon)}
              stroke={surveyPolygonStroke(polygon)}
              stroke-width={surveyPolygonStrokeWidth(polygon)}
            />
          {/each}

          {#each view.surveyLines as line (line.id)}
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

          {#each view.missionPolygons as polygon (polygon.id)}
            <polygon
              fill="rgba(120, 214, 255, 0.1)"
              points={toPolygonPoints(polygon)}
              stroke="rgba(120, 214, 255, 0.8)"
              stroke-dasharray="8 6"
              stroke-width="2"
            />
          {/each}

          {#each view.missionLines as line (line.id)}
            <polyline
              fill="none"
              points={toPolylinePoints(line.points)}
              stroke={missionLineColor(line)}
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width={line.kind === "arc" ? 4 : line.kind === "spline" ? 4 : 3}
            />
          {/each}

          {#each view.missionLabels as label (label.id)}
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

        {#if surveySession}
          <button
            aria-label="Add survey point on planner map"
            class="mission-map-draw-surface"
            onclick={appendSurveyPointFromSurface}
            onkeydown={handleSurfaceKeydown}
            type="button"
          ></button>
        {/if}

        {#if view.state === "empty"}
          <div
            class="pointer-events-none absolute inset-x-6 bottom-6 rounded-2xl border border-border/80 bg-bg-primary/88 px-4 py-3 text-sm text-text-secondary"
            data-testid={missionWorkspaceTestIds.mapEmpty}
          >
            Blank planner surface ready. Draw a grid, corridor, or structure survey here, or add Home and manual mission items to project existing geometry.
          </div>
        {:else if view.state === "degraded"}
          <div
            class="pointer-events-none absolute inset-x-6 bottom-6 rounded-2xl border border-warning/40 bg-bg-primary/88 px-4 py-3 text-sm text-warning"
            data-testid={missionWorkspaceTestIds.mapUnavailable}
          >
            Some survey geometry degraded, but the planner surface stayed interactive so you can finish drawing, recover selection, or edit the region safely.
          </div>
        {/if}

        {#each view.surveyHandles as handle (handle.regionId)}
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

        {#each view.surveyVertexHandles as handle (handle.id)}
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

        {#each view.markers as marker (marker.id)}
          <button
            class={`mission-map-marker ${marker.kind === "home" ? "is-home" : ""} ${marker.selected ? "is-selected" : ""} ${marker.current ? "is-current" : ""} ${marker.readOnly ? "is-readonly" : ""}`}
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
      </div>
    </div>
  {/if}

  {#if diagnostics.length > 0}
    <div class="mt-4 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
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
  .mission-map-surface {
    touch-action: none;
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
  .mission-map-vertex-handle {
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
</style>
