import type { MissionMapView } from "../../lib/mission-map-view";
import type { SurveyPatternType } from "../../lib/survey-region";

export type MissionMapDebugSnapshot = {
  mode: MissionMapView["mode"];
  state: MissionMapView["state"];
  selection: MissionMapView["selection"];
  fenceSelection: MissionMapView["fenceSelection"];
  counts: MissionMapView["counts"];
  warnings: string[];
  dragTargetId: string | null;
  dragUpdateCount: number;
  drawMode: "idle" | "draw" | "edit";
  drawPatternType: SurveyPatternType | null;
  drawRegionId: string | null;
  drawPointCount: number;
  fencePlacementMode: "inclusion_polygon" | "exclusion_polygon" | "inclusion_circle" | "exclusion_circle" | "return-point" | null;
  blockedFenceReason: string | null;
  readOnlyReason: string | null;
  selectedSurveyRegionId: string | null;
  selectedRallyPointUiId: number | null;
  selectedSurveyGenerationBlocked: boolean;
  selectedSurveyGenerationMessage: string | null;
  activeSurveyVertexCount: number;
  surveyPreviewFeatureCount: number;
  activeFenceVertexCount: number;
  activeFenceRadiusCount: number;
  rallyMarkerCount: number;
  missionGeoJson: MissionMapView["missionGeoJson"];
  surveyGeoJson: MissionMapView["surveyGeoJson"];
  fenceGeoJson: MissionMapView["fenceGeoJson"];
  rallyGeoJson: MissionMapView["rallyGeoJson"];
  updateCount: number;
};

declare global {
  interface Window {
    __IRONWING_MISSION_MAP_DEBUG__?: MissionMapDebugSnapshot;
  }
}

export function publishMissionMapDebugSnapshot(
  snapshot: Omit<MissionMapDebugSnapshot, "updateCount">,
): void {
  if (typeof window === "undefined") {
    return;
  }

  const maybeMockWindow = window as Window & { __IRONWING_MOCK_PLATFORM__?: unknown };
  if (!maybeMockWindow.__IRONWING_MOCK_PLATFORM__) {
    return;
  }

  const updateCount = (window.__IRONWING_MISSION_MAP_DEBUG__?.updateCount ?? 0) + 1;
  window.__IRONWING_MISSION_MAP_DEBUG__ = cloneDebugValue({
    ...snapshot,
    updateCount,
  });
}

export function clearMissionMapDebugSnapshot(): void {
  if (typeof window === "undefined") {
    return;
  }

  delete window.__IRONWING_MISSION_MAP_DEBUG__;
}

function cloneDebugValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}
