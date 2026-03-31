import type { TypedDraftItem } from "./mission-draft-typed";
import type { HomePosition, MissionItem } from "./mavkit-types";
import { commandPosition, geoPoint3dAltitude } from "./mavkit-types";
import { buildMissionRenderFeatures } from "./mission-path-render";

export type MissionPlanningProfile = {
  cruiseSpeedMps: number;
  hoverSpeedMps: number;
  enduranceBudgetMin: number | null;
};

export type MissionStatisticsIndeterminateReason =
  | "negative_nav_delay"
  | "loiter_unlimited"
  | "altitude_wait"
  | "pause_continue"
  | "invalid_cruise_speed"
  | "invalid_hover_speed";

export type MissionStatistics = {
  profile: MissionPlanningProfile;
  travelDistanceM: number;
  orbitDistanceM: number;
  totalDistanceM: number;
  holdTimeSec: number;
  delayTimeSec: number;
  timedLoiterSec: number;
  actionTimeSec: number;
  nonTravelTimeSec: number;
  cruiseTimeSec: number | null;
  hoverTimeSec: number | null;
  estimatedTimeSec: number | null;
  estimatedTimeMin: number | null;
  endurancePct: number | null;
  isTimeIndeterminate: boolean;
  indeterminateReasons: MissionStatisticsIndeterminateReason[];
  indeterminateItemIndexes: number[];
  maxAltitudeM: number | null;
  avgAltitudeM: number | null;
};

export const DEFAULT_MISSION_PLANNING_PROFILE: MissionPlanningProfile = {
  cruiseSpeedMps: 15,
  hoverSpeedMps: 5,
  enduranceBudgetMin: null,
};

export function computeMissionStatistics(
  homePosition: HomePosition | null,
  items: TypedDraftItem[],
  profile: Partial<MissionPlanningProfile> = {},
): MissionStatistics {
  const resolvedProfile = resolveMissionPlanningProfile(profile);
  const renderFeatures = buildMissionRenderFeatures(homePosition, items);
  const travelDistanceM = renderFeatures.labels.reduce((sum, label) => sum + label.distance_m, 0);

  let holdTimeSec = 0;
  let delayTimeSec = 0;
  let timedLoiterSec = 0;
  let actionTimeSec = 0;
  let orbitDistanceM = 0;

  const indeterminateReasons = new Set<MissionStatisticsIndeterminateReason>();
  const indeterminateItemIndexes = new Set<number>();

  for (const item of items) {
    const document = item.document as Partial<MissionItem>;
    const command = document.command;

    if (!command || typeof command !== "object") {
      continue;
    }

    if ("Nav" in command) {
      const nav = command.Nav;
      if (typeof nav === "object") {
        if ("Waypoint" in nav) {
          holdTimeSec += finiteNonNegative(nav.Waypoint.hold_time_s);
        } else if ("SplineWaypoint" in nav) {
          holdTimeSec += finiteNonNegative(nav.SplineWaypoint.hold_time_s);
        } else if ("LoiterTime" in nav) {
          timedLoiterSec += finiteNonNegative(nav.LoiterTime.time_s);
        } else if ("LoiterTurns" in nav) {
          orbitDistanceM += loiterTurnsDistance(nav.LoiterTurns.radius_m, nav.LoiterTurns.turns);
        } else if ("Delay" in nav) {
          if (Number.isFinite(nav.Delay.seconds) && nav.Delay.seconds >= 0) {
            delayTimeSec += nav.Delay.seconds;
          } else {
            markIndeterminate(
              indeterminateReasons,
              indeterminateItemIndexes,
              "negative_nav_delay",
              item.index,
            );
          }
        } else if ("AttitudeTime" in nav) {
          actionTimeSec += finiteNonNegative(nav.AttitudeTime.time_s);
        } else if ("ScriptTime" in nav) {
          actionTimeSec += finiteNonNegative(nav.ScriptTime.timeout_s);
        } else if ("LoiterUnlimited" in nav) {
          markIndeterminate(
            indeterminateReasons,
            indeterminateItemIndexes,
            "loiter_unlimited",
            item.index,
          );
        } else if ("AltitudeWait" in nav) {
          markIndeterminate(
            indeterminateReasons,
            indeterminateItemIndexes,
            "altitude_wait",
            item.index,
          );
        }
      }
    }

    if ("Do" in command) {
      const action = command.Do;
      if (
        typeof action === "object" &&
        "PauseContinue" in action &&
        action.PauseContinue.pause
      ) {
        markIndeterminate(
          indeterminateReasons,
          indeterminateItemIndexes,
          "pause_continue",
          item.index,
        );
      }
    }

    if ("Condition" in command && "Delay" in command.Condition) {
      delayTimeSec += finiteNonNegative(command.Condition.Delay.delay_s);
    }
  }

  // Gather altitude values from every item that carries a positional command.
  const altitudes: number[] = [];
  for (const item of items) {
    const document = item.document as Partial<MissionItem>;
    if (!document.command) continue;
    const position = commandPosition(document.command);
    if (position !== null) {
      altitudes.push(geoPoint3dAltitude(position).value);
    }
  }
  const maxAltitudeM = altitudes.length > 0 ? Math.max(...altitudes) : null;
  const avgAltitudeM =
    altitudes.length > 0 ? altitudes.reduce((sum, a) => sum + a, 0) / altitudes.length : null;

  const cruiseTimeSec =
    travelDistanceM === 0 ? 0 : divideDistanceBySpeed(travelDistanceM, resolvedProfile.cruiseSpeedMps);
  const hoverTimeSec =
    orbitDistanceM === 0 ? 0 : divideDistanceBySpeed(orbitDistanceM, resolvedProfile.hoverSpeedMps);

  if (travelDistanceM > 0 && cruiseTimeSec === null) {
    indeterminateReasons.add("invalid_cruise_speed");
  }
  if (orbitDistanceM > 0 && hoverTimeSec === null) {
    indeterminateReasons.add("invalid_hover_speed");
  }

  const nonTravelTimeSec = holdTimeSec + delayTimeSec + timedLoiterSec + actionTimeSec;
  const isTimeIndeterminate = indeterminateReasons.size > 0;
  const estimatedTimeSec =
    !isTimeIndeterminate && cruiseTimeSec !== null && hoverTimeSec !== null
      ? cruiseTimeSec + hoverTimeSec + nonTravelTimeSec
      : null;
  const estimatedTimeMin = estimatedTimeSec === null ? null : estimatedTimeSec / 60;

  return {
    profile: resolvedProfile,
    travelDistanceM,
    orbitDistanceM,
    totalDistanceM: travelDistanceM + orbitDistanceM,
    holdTimeSec,
    delayTimeSec,
    timedLoiterSec,
    actionTimeSec,
    nonTravelTimeSec,
    cruiseTimeSec,
    hoverTimeSec,
    estimatedTimeSec,
    estimatedTimeMin,
    endurancePct: computeEndurancePct(estimatedTimeMin, resolvedProfile.enduranceBudgetMin),
    isTimeIndeterminate,
    indeterminateReasons: [...indeterminateReasons],
    indeterminateItemIndexes: [...indeterminateItemIndexes].sort((left, right) => left - right),
    maxAltitudeM,
    avgAltitudeM,
  };
}

function resolveMissionPlanningProfile(
  profile: Partial<MissionPlanningProfile>,
): MissionPlanningProfile {
  return {
    cruiseSpeedMps: profile.cruiseSpeedMps ?? DEFAULT_MISSION_PLANNING_PROFILE.cruiseSpeedMps,
    hoverSpeedMps: profile.hoverSpeedMps ?? DEFAULT_MISSION_PLANNING_PROFILE.hoverSpeedMps,
    enduranceBudgetMin:
      profile.enduranceBudgetMin ?? DEFAULT_MISSION_PLANNING_PROFILE.enduranceBudgetMin,
  };
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function loiterTurnsDistance(radius_m: number, turns: number): number {
  const radius = finiteNonNegative(Math.abs(radius_m));
  const orbitTurns = finiteNonNegative(turns);
  return 2 * Math.PI * radius * orbitTurns;
}

function divideDistanceBySpeed(distance_m: number, speedMps: number): number | null {
  return Number.isFinite(speedMps) && speedMps > 0 ? distance_m / speedMps : null;
}

function computeEndurancePct(
  estimatedTimeMin: number | null,
  enduranceBudgetMin: number | null,
): number | null {
  if (estimatedTimeMin === null || enduranceBudgetMin === null) {
    return null;
  }

  return Number.isFinite(enduranceBudgetMin) && enduranceBudgetMin > 0
    ? (estimatedTimeMin / enduranceBudgetMin) * 100
    : null;
}

function markIndeterminate(
  reasons: Set<MissionStatisticsIndeterminateReason>,
  itemIndexes: Set<number>,
  reason: MissionStatisticsIndeterminateReason,
  itemIndex: number,
): void {
  reasons.add(reason);
  itemIndexes.add(itemIndex);
}
