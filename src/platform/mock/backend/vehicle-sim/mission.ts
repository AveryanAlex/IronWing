import {
  commandDisplayName,
  geoPoint3dAltitude,
  geoPoint3dLatLon,
  type MissionPlan,
} from "../../../../lib/mavkit-types";
import type { SimMissionItem, SimMissionRuntime } from "./types";

function unsupportedMissionItem(note: string): SimMissionItem {
  return {
    kind: "unsupported",
    note,
  };
}

function normalizeMissionItem(plan: MissionPlan, index: number): SimMissionItem {
  const item = plan.items[index];
  const { command } = item;

  if ("Nav" in command) {
    if (command.Nav === "ReturnToLaunch") {
      return { kind: "rtl" };
    }

    if (typeof command.Nav === "object") {
      if ("Takeoff" in command.Nav) {
        const position = command.Nav.Takeoff.position;
        const latLon = geoPoint3dLatLon(position);
        const altitude = geoPoint3dAltitude(position);
        return {
          kind: "takeoff",
          ...latLon,
          relative_alt_m: altitude.value,
        };
      }

      if ("Waypoint" in command.Nav) {
        const position = command.Nav.Waypoint.position;
        const latLon = geoPoint3dLatLon(position);
        const altitude = geoPoint3dAltitude(position);
        return {
          kind: "waypoint",
          ...latLon,
          relative_alt_m: altitude.value,
        };
      }

      if ("Land" in command.Nav) {
        const position = command.Nav.Land.position;
        const latLon = geoPoint3dLatLon(position);
        return {
          kind: "land",
          ...latLon,
          relative_alt_m: 0,
        };
      }
    }
  }

  if ("Do" in command && typeof command.Do === "object" && "ChangeSpeed" in command.Do) {
    return {
      kind: "change_speed",
      speed_mps: command.Do.ChangeSpeed.speed_mps,
    };
  }

  return unsupportedMissionItem(`Unsupported AUTO mission command: ${commandDisplayName(command)}`);
}

function defaultCurrentIndex(plan: MissionPlan | null): number | null {
  if (!plan || plan.items.length === 0) {
    return null;
  }

  const currentIndex = plan.items.findIndex((item) => item.current);
  return currentIndex >= 0 ? currentIndex : null;
}

function normalizeCurrentIndex(currentIndex: number | null | undefined, itemsLength: number): number | null {
  if (typeof currentIndex !== "number" || !Number.isInteger(currentIndex)) {
    return null;
  }

  if (currentIndex < 0 || currentIndex >= itemsLength) {
    return null;
  }

  return currentIndex;
}

function restoredMissionSpeedOverride(items: SimMissionItem[], currentIndex: number | null, completed: boolean) {
  const appliedItemsCount = currentIndex == null ? (completed ? items.length : 0) : currentIndex;
  let speedMps: number | null = null;

  for (const item of items.slice(0, appliedItemsCount)) {
    if (item.kind === "change_speed") {
      speedMps = item.speed_mps;
    }
  }

  return speedMps;
}

export function normalizeMissionPlan(plan: MissionPlan | null | undefined): SimMissionRuntime {
  const missionPlan = plan ?? null;
  const items = missionPlan?.items.map((_, index) => normalizeMissionItem(missionPlan, index)) ?? [];
  const currentIndex = normalizeCurrentIndex(defaultCurrentIndex(missionPlan), items.length);
  const completed = items.length === 0;
  return {
    items,
    current_index: currentIndex,
    completed,
    speed_mps: restoredMissionSpeedOverride(items, currentIndex, completed),
    unsupported_notes: items.flatMap((item) => (item.kind === "unsupported" ? [item.note] : [])),
  };
}

export function currentMissionItem(mission: SimMissionRuntime): SimMissionItem | null {
  if (mission.completed || mission.current_index == null) {
    return null;
  }

  return mission.items[mission.current_index] ?? null;
}

export function advanceMissionCurrent(mission: SimMissionRuntime): SimMissionRuntime {
  if (mission.completed || mission.current_index == null) {
    return mission;
  }

  const nextIndex = mission.current_index + 1;
  if (nextIndex >= mission.items.length) {
    return {
      ...mission,
      current_index: null,
      completed: true,
    };
  }

  return {
    ...mission,
    current_index: nextIndex,
  };
}

export function setMissionCurrentIndex(mission: SimMissionRuntime, currentIndex: number | null): SimMissionRuntime {
  const normalizedCurrentIndex = normalizeCurrentIndex(currentIndex, mission.items.length);
  const completed = mission.items.length === 0 ? true : currentIndex == null ? mission.completed : false;

  return {
    ...mission,
    current_index: normalizedCurrentIndex,
    completed,
    speed_mps: restoredMissionSpeedOverride(mission.items, normalizedCurrentIndex, completed),
  };
}
