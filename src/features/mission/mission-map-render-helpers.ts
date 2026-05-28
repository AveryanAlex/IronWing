import type {
  MissionMapFenceRadiusHandle,
  MissionMapFenceRegionHandle,
  MissionMapFenceVertexHandle,
  MissionMapLineFeature,
  MissionMapMarker,
  MissionMapPoint,
  MissionMapPolygonFeature,
  MissionMapSurveyHandle,
  MissionMapSurveyVertexHandle,
} from "../../lib/mission-map-view";
import type { SurveyRegion } from "../../lib/survey-region";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

export function cloneSurveyRegionSnapshot(region: SurveyRegion): SurveyRegion {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(region);
    } catch {
      // Svelte can hand this helper proxied survey regions during component-side
      // edit sessions. Fall back to the explicit clone below so cancelling a map
      // edit never fails just because the browser clone algorithm rejects a proxy.
    }
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

export function markerTestId(marker: MissionMapMarker): string {
  return `${missionWorkspaceTestIds.mapMarkerPrefix}-${marker.kind === "home" ? "home" : marker.uiId}`;
}

export function surveyHandleTestId(handle: MissionMapSurveyHandle): string {
  return `${missionWorkspaceTestIds.mapSurveyPrefix}-${handle.regionId}`;
}

export function surveyVertexHandleTestId(handle: MissionMapSurveyVertexHandle): string {
  return `${missionWorkspaceTestIds.mapVertexPrefix}-${handle.regionId}-${handle.geometryKind}-${handle.index}`;
}

export function fenceRegionHandleTestId(handle: MissionMapFenceRegionHandle): string {
  return `${missionWorkspaceTestIds.mapFenceRegionPrefix}-${handle.regionUiId}`;
}

export function fenceVertexHandleTestId(handle: MissionMapFenceVertexHandle): string {
  return `${missionWorkspaceTestIds.mapFenceVertexPrefix}-${handle.regionUiId}-${handle.index}`;
}

export function fenceRadiusHandleTestId(handle: MissionMapFenceRadiusHandle): string {
  return `${missionWorkspaceTestIds.mapFenceRadiusPrefix}-${handle.regionUiId}`;
}

export function toPolylinePoints(points: MissionMapPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

export function toPolygonPoints(polygon: MissionMapPolygonFeature): string {
  return polygon.rings[0] ? toPolylinePoints(polygon.rings[0]) : "";
}

export function positionStyle(
  point: MissionMapPoint,
  overlayUsesBasemapProjection: boolean,
  viewBoxSize: number,
): string {
  if (overlayUsesBasemapProjection) {
    return `left:${point.x}px;top:${point.y}px;`;
  }

  return `left:${(point.x / viewBoxSize) * 100}%;top:${(point.y / viewBoxSize) * 100}%;`;
}

export function missionLineColor(feature: MissionMapLineFeature): string {
  switch (feature.kind) {
    case "arc":
      return "#fbbf24";
    case "spline":
      return "#78d6ff";
    default:
      return "rgba(241, 245, 249, 0.82)";
  }
}

export function surveyPolygonFill(feature: MissionMapPolygonFeature): string {
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

export function surveyPolygonStroke(feature: MissionMapPolygonFeature): string {
  switch (feature.kind) {
    case "survey_footprint":
      return feature.selected ? "rgba(186, 230, 253, 0.72)" : "rgba(120, 214, 255, 0.4)";
    case "survey_swath_band":
      return feature.selected ? "rgba(110, 231, 183, 0.8)" : "rgba(34, 197, 94, 0.48)";
    default:
      return feature.selected ? "#78d6ff" : "rgba(34, 197, 94, 0.72)";
  }
}

export function surveyPolygonStrokeWidth(feature: MissionMapPolygonFeature): number {
  return feature.kind === "survey_footprint" ? 1 : feature.selected ? 4 : 2;
}

export function surveyLineColor(feature: MissionMapLineFeature): string {
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

export function surveyLineDash(feature: MissionMapLineFeature): string | null {
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

export function surveyLineWidth(feature: MissionMapLineFeature): number {
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

export function fencePolygonFill(feature: MissionMapPolygonFeature): string {
  if (/exclusion/i.test(feature.kind)) {
    return feature.selected ? "rgba(248, 113, 113, 0.2)" : "rgba(248, 113, 113, 0.12)";
  }

  return feature.selected ? "rgba(96, 165, 250, 0.18)" : "rgba(96, 165, 250, 0.1)";
}

export function fencePolygonStroke(feature: MissionMapPolygonFeature): string {
  if (/exclusion/i.test(feature.kind)) {
    return feature.selected ? "rgba(254, 202, 202, 0.92)" : "rgba(248, 113, 113, 0.78)";
  }

  return feature.selected ? "rgba(191, 219, 254, 0.92)" : "rgba(96, 165, 250, 0.82)";
}

export function fenceLineColor(feature: MissionMapLineFeature): string {
  return /exclusion/i.test(feature.kind) ? "rgba(248, 113, 113, 0.88)" : "rgba(96, 165, 250, 0.88)";
}
