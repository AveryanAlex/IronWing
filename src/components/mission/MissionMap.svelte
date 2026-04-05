<script lang="ts">
import { onDestroy } from "svelte";

import {
  resolveMissionMapDrag,
  type MissionMapLineFeature,
  type MissionMapMarker,
  type MissionMapPoint,
  type MissionMapPolygonFeature,
  type MissionMapSurveyHandle,
  type MissionMapView,
} from "../../lib/mission-map-view";
import type { MissionPlannerMapMoveResult } from "../../lib/stores/mission-planner";
import {
  clearMissionMapDebugSnapshot,
  publishMissionMapDebugSnapshot,
} from "./mission-map-debug";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

type Props = {
  view: MissionMapView;
  onSelectHome: () => void;
  onSelectMissionItem: (uiId: number) => void;
  onSelectSurveyRegion: (regionId: string) => void;
  onMoveHome: (latitudeDeg: number, longitudeDeg: number) => MissionPlannerMapMoveResult;
  onMoveMissionItem: (uiId: number, latitudeDeg: number, longitudeDeg: number) => MissionPlannerMapMoveResult;
};

type ActiveDrag = {
  markerId: string;
  kind: "home" | "mission-item";
  uiId: number | null;
  startLatitude_deg: number;
  startLongitude_deg: number;
  updateCount: number;
};

const GRID_TICKS = [125, 250, 375, 500, 625, 750, 875];

let {
  view,
  onSelectHome,
  onSelectMissionItem,
  onSelectSurveyRegion,
  onMoveHome,
  onMoveMissionItem,
}: Props = $props();

let surfaceElement = $state<HTMLDivElement | null>(null);
let activeDrag = $state<ActiveDrag | null>(null);
let dragMessage = $state<string | null>(null);

let debugPayload = $derived({
  state: view.state,
  selection: view.selection,
  counts: view.counts,
  warnings: view.warnings,
  dragTargetId: activeDrag?.markerId ?? null,
  dragUpdateCount: activeDrag?.updateCount ?? 0,
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

let dragStateText = $derived.by(() => {
  if (activeDrag) {
    return `${activeDrag.kind}:${activeDrag.markerId}:${activeDrag.updateCount}`;
  }

  return dragMessage ?? "idle";
});

$effect(() => {
  publishMissionMapDebugSnapshot({
    state: view.state,
    selection: view.selection,
    counts: view.counts,
    warnings: view.warnings,
    dragTargetId: activeDrag?.markerId ?? null,
    dragUpdateCount: activeDrag?.updateCount ?? 0,
    missionGeoJson: view.missionGeoJson,
    surveyGeoJson: view.surveyGeoJson,
  });
});

onDestroy(() => {
  clearMissionMapDebugSnapshot();
});

function markerTestId(marker: MissionMapMarker): string {
  return `${missionWorkspaceTestIds.mapMarkerPrefix}-${marker.kind === "home" ? "home" : marker.uiId}`;
}

function surveyHandleTestId(handle: MissionMapSurveyHandle): string {
  return `${missionWorkspaceTestIds.mapSurveyPrefix}-${handle.regionId}`;
}

function toPolylinePoints(points: MissionMapPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function toPolygonPoints(polygon: MissionMapPolygonFeature): string {
  return polygon.rings[0] ? toPolylinePoints(polygon.rings[0]) : "";
}

function positionStyle(point: MissionMapPoint): string {
  return `left:${(point.x / 1000) * 100}%;top:${(point.y / 1000) * 100}%;`;
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
  return feature.selected ? "rgba(120, 214, 255, 0.18)" : "rgba(34, 197, 94, 0.12)";
}

function surveyPolygonStroke(feature: MissionMapPolygonFeature): string {
  return feature.selected ? "#78d6ff" : "rgba(34, 197, 94, 0.72)";
}

function surveyLineColor(feature: MissionMapLineFeature): string {
  return feature.selected ? "#78d6ff" : "rgba(34, 197, 94, 0.86)";
}

function handleMarkerSelection(marker: MissionMapMarker) {
  dragMessage = null;

  if (marker.kind === "home") {
    onSelectHome();
    return;
  }

  if (marker.uiId !== null) {
    onSelectMissionItem(marker.uiId);
  }
}

function handleSurveySelection(handle: MissionMapSurveyHandle) {
  dragMessage = null;
  onSelectSurveyRegion(handle.regionId);
}

function startMarkerDrag(event: PointerEvent, marker: MissionMapMarker) {
  handleMarkerSelection(marker);

  if (!marker.draggable) {
    dragMessage = marker.readOnly
      ? "Map drag rejected because this marker is read-only."
      : "Map drag rejected because this surface is not draggable.";
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  activeDrag = {
    markerId: marker.id,
    kind: marker.kind,
    uiId: marker.uiId,
    startLatitude_deg: marker.latitude_deg,
    startLongitude_deg: marker.longitude_deg,
    updateCount: 0,
  };
  dragMessage = null;
}

function cancelActiveDrag(message: string, restorePosition: boolean) {
  const currentDrag = activeDrag;
  if (!currentDrag) {
    dragMessage = message;
    return;
  }

  if (restorePosition) {
    if (currentDrag.kind === "home") {
      onMoveHome(currentDrag.startLatitude_deg, currentDrag.startLongitude_deg);
    } else if (currentDrag.uiId !== null) {
      onMoveMissionItem(currentDrag.uiId, currentDrag.startLatitude_deg, currentDrag.startLongitude_deg);
    }
  }

  activeDrag = null;
  dragMessage = message;
}

function applyMoveResult(result: MissionPlannerMapMoveResult): boolean {
  if (result.status === "rejected") {
    cancelActiveDrag(result.message, true);
    return false;
  }

  dragMessage = null;
  return true;
}

function projectedPointFromPointer(event: PointerEvent): MissionMapPoint | null {
  if (!surfaceElement) {
    return null;
  }

  const rect = surfaceElement.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) {
    return null;
  }

  return {
    x: ((event.clientX - rect.left) / rect.width) * 1000,
    y: ((event.clientY - rect.top) / rect.height) * 1000,
  };
}

function handlePointerMove(event: PointerEvent) {
  if (!activeDrag) {
    return;
  }

  const nextPoint = projectedPointFromPointer(event);
  if (!nextPoint) {
    return;
  }

  const resolution = resolveMissionMapDrag(view, activeDrag.markerId, nextPoint);
  if (resolution.status === "rejected") {
    cancelActiveDrag(resolution.message, true);
    return;
  }

  const moved = activeDrag.kind === "home"
    ? onMoveHome(resolution.latitude_deg, resolution.longitude_deg)
    : activeDrag.uiId !== null
      ? onMoveMissionItem(activeDrag.uiId, resolution.latitude_deg, resolution.longitude_deg)
      : {
        status: "rejected",
        reason: "item-not-found",
        message: "Ignored the drag because the mission item target disappeared.",
      } satisfies MissionPlannerMapMoveResult;

  if (!applyMoveResult(moved)) {
    return;
  }

  activeDrag = {
    ...activeDrag,
    updateCount: activeDrag.updateCount + 1,
  };
}

function handlePointerUp() {
  if (!activeDrag) {
    return;
  }

  activeDrag = null;
}

function handlePointerCancel() {
  if (!activeDrag) {
    return;
  }

  cancelActiveDrag("Map drag cancelled. Restored the previous marker position.", true);
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape" || !activeDrag) {
    return;
  }

  event.preventDefault();
  cancelActiveDrag("Map drag cancelled with Escape. Restored the previous marker position.", true);
}
</script>

<svelte:window onkeydown={handleKeydown} onpointercancel={handlePointerCancel} onpointermove={handlePointerMove} onpointerup={handlePointerUp} />

<section class="rounded-2xl border border-border bg-bg-primary p-4" data-testid={missionWorkspaceTestIds.map}>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Planner map</p>
      <h3 class="mt-1 text-sm font-semibold text-text-primary">Shared mission geometry</h3>
      <p class="mt-1 text-xs text-text-secondary">
        The map, list, and inspector all read from the same mission draft so drag edits and preserved survey blocks stay truthful.
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
      <span class="rounded-full border border-border bg-bg-secondary px-3 py-1" data-testid={missionWorkspaceTestIds.mapDragState}>
        {dragStateText}
      </span>
    </div>
  </div>

  <div class="mt-4 grid gap-2 sm:grid-cols-4">
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
      <p class="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Survey handles</p>
      <p class="mt-1 text-sm font-semibold text-text-primary">{view.counts.surveyHandles}</p>
    </div>
  </div>

  {#if view.viewport}
    <div class="mt-4 rounded-2xl border border-border bg-bg-secondary/40 p-3">
      <div
        bind:this={surfaceElement}
        class="mission-map-surface relative aspect-[5/4] overflow-hidden rounded-[20px] border border-border/70 bg-[radial-gradient(circle_at_top,_rgba(120,214,255,0.12),_transparent_55%),linear-gradient(180deg,_rgba(6,14,23,0.96),_rgba(8,20,32,0.88))]"
        data-testid={missionWorkspaceTestIds.mapSurface}
      >
        <svg aria-hidden="true" class="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 1000 1000">
          {#each GRID_TICKS as tick (tick)}
            <line stroke="rgba(120, 214, 255, 0.08)" stroke-width="1" x1={tick} x2={tick} y1="0" y2="1000" />
            <line stroke="rgba(120, 214, 255, 0.08)" stroke-width="1" x1="0" x2="1000" y1={tick} y2={tick} />
          {/each}

          {#each view.surveyPolygons as polygon (polygon.id)}
            <polygon
              fill={surveyPolygonFill(polygon)}
              points={toPolygonPoints(polygon)}
              stroke={surveyPolygonStroke(polygon)}
              stroke-width={polygon.selected ? 4 : 2}
            />
          {/each}

          {#each view.surveyLines as line (line.id)}
            <polyline
              fill="none"
              points={toPolylinePoints(line.points)}
              stroke={surveyLineColor(line)}
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width={line.selected ? 5 : 3}
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

        {#each view.surveyHandles as handle (handle.regionId)}
          <button
            class={`mission-map-survey-handle ${handle.selected ? "is-selected" : ""}`}
            data-testid={surveyHandleTestId(handle)}
            onclick={() => handleSurveySelection(handle)}
            style={positionStyle(handle.point)}
            type="button"
          >
            {handle.label}
          </button>
        {/each}

        {#each view.markers as marker (marker.id)}
          <button
            class={`mission-map-marker ${marker.kind === "home" ? "is-home" : ""} ${marker.selected ? "is-selected" : ""} ${marker.current ? "is-current" : ""} ${marker.readOnly ? "is-readonly" : ""}`}
            data-dragging={activeDrag?.markerId === marker.id ? "true" : "false"}
            data-selected={marker.selected ? "true" : "false"}
            data-testid={markerTestId(marker)}
            onclick={() => handleMarkerSelection(marker)}
            onpointerdown={(event) => startMarkerDrag(event, marker)}
            style={positionStyle(marker.point)}
            type="button"
          >
            {marker.label}
          </button>
        {/each}
      </div>
    </div>
  {:else}
    <div
      class="mt-4 rounded-2xl border border-dashed border-border bg-bg-secondary/60 px-4 py-6 text-sm text-text-secondary"
      data-testid={view.state === "degraded" ? missionWorkspaceTestIds.mapUnavailable : missionWorkspaceTestIds.mapEmpty}
    >
      {#if view.state === "degraded"}
        Map preview unavailable for the current geometry. The list and inspector stay interactive while IronWing keeps the last valid planner state inspectable through diagnostics.
      {:else}
        Add Home, a waypoint, or preserved survey geometry to project this mission on the active planner map.
      {/if}
    </div>
  {/if}

  {#if view.warnings.length > 0}
    <div class="mt-4 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
      <p class="font-semibold">Map diagnostics</p>
      <ul class="mt-2 list-inside list-disc space-y-1 text-xs">
        {#each view.warnings as warning (`${warning}`)}
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

  .mission-map-marker,
  .mission-map-survey-handle {
    position: absolute;
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
</style>
