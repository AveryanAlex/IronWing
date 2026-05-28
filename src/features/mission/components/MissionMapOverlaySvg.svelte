<script lang="ts">
import type {
  MissionMapLabelFeature,
  MissionMapLineFeature,
  MissionMapPoint,
  MissionMapPolygonFeature,
} from "../../../lib/mission-map-view";
import {
  fenceLineColor,
  fencePolygonFill,
  fencePolygonStroke,
  missionLineColor,
  surveyLineColor,
  surveyLineDash,
  surveyLineWidth,
  surveyPolygonFill,
  surveyPolygonStroke,
  surveyPolygonStrokeWidth,
  toPolygonPoints,
  toPolylinePoints,
} from "../mission-map-render-helpers";
import { missionWorkspaceTestIds } from "../mission-workspace-test-ids";

type Props = {
  overlayViewBox: { width: number; height: number };
  renderSurveyPolygons: MissionMapPolygonFeature[];
  renderSurveyLines: MissionMapLineFeature[];
  renderFencePolygons: MissionMapPolygonFeature[];
  renderFenceLines: MissionMapLineFeature[];
  renderMissionPolygons: MissionMapPolygonFeature[];
  renderMissionLines: MissionMapLineFeature[];
  renderReplayOverlayPath: MissionMapPoint[];
  renderMissionLabels: MissionMapLabelFeature[];
};

let {
  overlayViewBox,
  renderSurveyPolygons,
  renderSurveyLines,
  renderFencePolygons,
  renderFenceLines,
  renderMissionPolygons,
  renderMissionLines,
  renderReplayOverlayPath,
  renderMissionLabels,
}: Props = $props();
</script>

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

<style>
  .mission-map-overlay {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
  }
</style>
