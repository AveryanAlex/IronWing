<script lang="ts">
import type {
  MissionMapFenceRadiusHandle,
  MissionMapFenceRegionHandle,
  MissionMapFenceReturnPoint,
  MissionMapFenceVertexHandle,
  MissionMapMarker,
  MissionMapPoint,
  MissionMapSurveyHandle,
  MissionMapSurveyVertexHandle,
} from "../../../lib/mission-map-view";
import {
  fenceRadiusHandleTestId,
  fenceRegionHandleTestId,
  fenceVertexHandleTestId,
  markerTestId,
  surveyHandleTestId,
  surveyVertexHandleTestId,
} from "../mission-map-render-helpers";
import { missionWorkspaceTestIds } from "../mission-workspace-test-ids";

type Props = {
  surveySessionRegionId: string | null;
  renderSurveyHandles: MissionMapSurveyHandle[];
  renderSurveyVertexHandles: MissionMapSurveyVertexHandle[];
  renderFenceRegionHandles: MissionMapFenceRegionHandle[];
  renderFenceVertexHandles: MissionMapFenceVertexHandle[];
  renderFenceRadiusHandles: MissionMapFenceRadiusHandle[];
  renderFenceReturnPoint: MissionMapFenceReturnPoint | null;
  renderMarkers: MissionMapMarker[];
  renderReplayOverlayMarker: MissionMapPoint | null;
  pointStyle: (point: MissionMapPoint) => string;
  onSelectSurveyRegion: (regionId: string) => void;
  onStartSurveyHandleDrag: (event: PointerEvent, handle: MissionMapSurveyVertexHandle) => void;
  onSelectFenceRegion: (uiId: number) => void;
  onStartFenceRegionDrag: (event: PointerEvent, handle: MissionMapFenceRegionHandle) => void;
  onStartFenceVertexDrag: (event: PointerEvent, handle: MissionMapFenceVertexHandle) => void;
  onStartFenceRadiusDrag: (event: PointerEvent, handle: MissionMapFenceRadiusHandle) => void;
  onSelectFenceReturnPoint: () => void;
  onStartFenceReturnPointDrag: (event: PointerEvent) => void;
  onSelectMarker: (marker: MissionMapMarker) => void;
  onStartMarkerDrag: (event: PointerEvent, marker: MissionMapMarker) => void;
  activeMarkerId: string | null;
};

let {
  surveySessionRegionId,
  renderSurveyHandles,
  renderSurveyVertexHandles,
  renderFenceRegionHandles,
  renderFenceVertexHandles,
  renderFenceRadiusHandles,
  renderFenceReturnPoint,
  renderMarkers,
  renderReplayOverlayMarker,
  pointStyle,
  onSelectSurveyRegion,
  onStartSurveyHandleDrag,
  onSelectFenceRegion,
  onStartFenceRegionDrag,
  onStartFenceVertexDrag,
  onStartFenceRadiusDrag,
  onSelectFenceReturnPoint,
  onStartFenceReturnPointDrag,
  onSelectMarker,
  onStartMarkerDrag,
  activeMarkerId,
}: Props = $props();
</script>

{#each renderSurveyHandles as handle (handle.regionId)}
  <button
    class={`mission-map-survey-handle ${handle.selected ? "is-selected" : ""}`}
    data-testid={surveyHandleTestId(handle)}
    onclick={(event) => {
      event.stopPropagation();
      onSelectSurveyRegion(handle.regionId);
    }}
    style={pointStyle(handle.point)}
    type="button"
  >
    {handle.label}
  </button>
{/each}

{#each renderSurveyVertexHandles as handle (handle.id)}
  <button
    class={`mission-map-vertex-handle ${handle.selected ? "is-selected" : ""} ${surveySessionRegionId === handle.regionId ? "is-draggable" : ""}`}
    data-testid={surveyVertexHandleTestId(handle)}
    onclick={(event) => {
      event.stopPropagation();
      onSelectSurveyRegion(handle.regionId);
    }}
    onpointerdown={(event) => onStartSurveyHandleDrag(event, handle)}
    style={pointStyle(handle.point)}
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
      onSelectFenceRegion(handle.regionUiId);
    }}
    onpointerdown={(event) => onStartFenceRegionDrag(event, handle)}
    style={pointStyle(handle.point)}
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
      onSelectFenceRegion(handle.regionUiId);
    }}
    onpointerdown={(event) => onStartFenceVertexDrag(event, handle)}
    style={pointStyle(handle.point)}
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
      onSelectFenceRegion(handle.regionUiId);
    }}
    onpointerdown={(event) => onStartFenceRadiusDrag(event, handle)}
    style={pointStyle(handle.point)}
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
      onSelectFenceReturnPoint();
    }}
    onpointerdown={onStartFenceReturnPointDrag}
    style={pointStyle(renderFenceReturnPoint.point)}
    type="button"
  >
    R
  </button>
{/if}

{#each renderMarkers as marker (marker.id)}
  <button
    class={`mission-map-marker ${marker.kind === "home" ? "is-home" : ""} ${marker.kind === "rally-point" ? "is-rally" : ""} ${marker.selected ? "is-selected" : ""} ${marker.current ? "is-current" : ""} ${marker.readOnly ? "is-readonly" : ""}`}
    data-dragging={activeMarkerId === marker.id ? "true" : "false"}
    data-selected={marker.selected ? "true" : "false"}
    data-testid={markerTestId(marker)}
    onclick={(event) => {
      event.stopPropagation();
      onSelectMarker(marker);
    }}
    onpointerdown={(event) => onStartMarkerDrag(event, marker)}
    style={pointStyle(marker.point)}
    type="button"
  >
    {marker.label}
  </button>
{/each}

{#if renderReplayOverlayMarker}
  <div
    class="mission-map-replay-marker"
    data-testid={missionWorkspaceTestIds.mapReplayMarker}
    style={pointStyle(renderReplayOverlayMarker)}
  >
    ▶
  </div>
{/if}

<style>
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
