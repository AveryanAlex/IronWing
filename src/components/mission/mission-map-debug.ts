import type { MissionMapView } from "../../lib/mission-map-view";

export type MissionMapDebugSnapshot = {
  state: MissionMapView["state"];
  selection: MissionMapView["selection"];
  counts: MissionMapView["counts"];
  warnings: string[];
  dragTargetId: string | null;
  dragUpdateCount: number;
  missionGeoJson: MissionMapView["missionGeoJson"];
  surveyGeoJson: MissionMapView["surveyGeoJson"];
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
