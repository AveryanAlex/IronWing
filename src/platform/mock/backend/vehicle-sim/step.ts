import { advanceBattery } from "./battery";
import { headingToTargetDeg, horizontalDistanceM, translatePosition } from "./geo";
import { advanceMissionCurrent, currentMissionItem } from "./mission";
import type { SimStepResult, SimVehicleState } from "./types";

export const MAX_STEP_S = 1;
export const COPTER_CLIMB_MPS = 2.5;
export const COPTER_DESCEND_MPS = 1.5;
export const COPTER_HORIZONTAL_SPEED_MPS = 5;
export const PLANE_CRUISE_SPEED_MPS = 22;
export const PLANE_TURN_RATE_DEGPS = 25;
export const PLANE_CLIMB_MPS = 3;
export const PLANE_DESCEND_MPS = 2;
export const PLANE_TARGET_REACHED_EPSILON_M = 0.1;

function clampMagnitude(value: number, magnitude: number) {
  if (value > 0) {
    return Math.min(value, magnitude);
  }

  if (value < 0) {
    return Math.max(value, -magnitude);
  }

  return 0;
}

function activeThrottlePct(horizontalSpeedMps: number, climbRateMps: number) {
  if (climbRateMps > 0) {
    return 65;
  }

  if (horizontalSpeedMps > 0) {
    return 45;
  }

  if (climbRateMps < 0) {
    return 20;
  }

  return 15;
}

function planeThrottlePct(climbRateMps: number) {
  if (climbRateMps > 0) {
    return 65;
  }

  if (climbRateMps < 0) {
    return 45;
  }

  return 55;
}

function planeLoiterHeadingDeg(currentHeadingDeg: number, dtS: number) {
  return (currentHeadingDeg + (PLANE_TURN_RATE_DEGPS * dtS)) % 360;
}

function inferredTargetKind(state: SimVehicleState) {
  if (state.target?.kind) {
    return state.target.kind;
  }

  return state.target?.latitude_deg != null && state.target.longitude_deg != null ? "guided" : "takeoff";
}

function isCopterFamily(state: SimVehicleState) {
  return state.family === "quadcopter";
}

function isPlaneFamily(state: SimVehicleState) {
  return state.family === "airplane" || state.family === "quadplane";
}

function isQuadplaneHoverHoldMode(state: SimVehicleState) {
  if (state.family !== "quadplane") {
    return false;
  }

  const modeName = state.mode_name.trim().toUpperCase();
  return modeName === "QLOITER" || modeName === "QSTABILIZE";
}

function holdPosition(state: SimVehicleState) {
  return {
    ...state,
    system_status: "active",
    groundspeed_mps: 0,
    airspeed_mps: 0,
    climb_rate_mps: 0,
    throttle_pct: 15,
  } satisfies SimVehicleState;
}

function clampStepSeconds(dtS: number) {
  if (!Number.isFinite(dtS) || dtS <= 0) {
    return 0;
  }

  return Math.min(dtS, MAX_STEP_S);
}

function withBattery(state: SimVehicleState, dtS: number) {
  return {
    ...state,
    battery: advanceBattery(state, dtS),
  };
}

export function turnToward(currentDeg: number, targetDeg: number, maxDeltaDeg: number) {
  const normalizedCurrent = ((currentDeg % 360) + 360) % 360;
  const normalizedTarget = ((targetDeg % 360) + 360) % 360;
  const delta = ((normalizedTarget - normalizedCurrent + 540) % 360) - 180;
  const clampedDelta = clampMagnitude(delta, maxDeltaDeg);

  return (normalizedCurrent + clampedDelta + 360) % 360;
}

function isAutoMode(state: SimVehicleState) {
  return state.mode_name.trim().toUpperCase() === "AUTO";
}

function missionTarget(state: SimVehicleState) {
  const item = currentMissionItem(state.mission);
  if (!item) {
    return { item: null, target: null };
  }

  switch (item.kind) {
    case "takeoff":
    case "waypoint":
    case "land":
      return {
        item,
        target: {
          kind: item.kind === "waypoint" ? "guided" : item.kind,
          latitude_deg: item.latitude_deg,
          longitude_deg: item.longitude_deg,
          relative_alt_m: item.relative_alt_m,
        } as const,
      };
    case "rtl":
      return {
        item,
        target: {
          kind: "rtl",
          latitude_deg: state.home_position.latitude_deg,
          longitude_deg: state.home_position.longitude_deg,
          relative_alt_m: Math.max(state.position.relative_alt_m, 15),
        } as const,
      };
    case "change_speed":
    case "unsupported":
      return {
        item,
        target: null,
      };
  }
}

function prepareAutoMission(state: SimVehicleState) {
  let nextState = state;
  let missionCurrentChanged = false;
  const statusNotes: string[] = [];

  while (true) {
    const item = currentMissionItem(nextState.mission);
    if (!item) {
      return {
        state: {
          ...nextState,
          target: null,
        },
        missionCurrentChanged,
        statusNotes,
      };
    }

    if (item.kind === "change_speed") {
      nextState = {
        ...nextState,
        mission: advanceMissionCurrent({
          ...nextState.mission,
          speed_mps: item.speed_mps,
        }),
      };
      missionCurrentChanged = true;
      continue;
    }

    if (item.kind === "unsupported") {
      statusNotes.push(item.note);
      nextState = {
        ...nextState,
        mission: advanceMissionCurrent(nextState.mission),
      };
      missionCurrentChanged = true;
      continue;
    }

    const nextMissionTarget = missionTarget(nextState).target;
    return {
      state: {
        ...nextState,
        target: nextMissionTarget,
      },
      missionCurrentChanged,
      statusNotes,
    };
  }
}

export function advanceSimVehicle(state: SimVehicleState, dtS: number): SimStepResult {
  const appliedDtS = clampStepSeconds(dtS);

  if (!state.connected || !state.armed || appliedDtS === 0) {
    const next = withBattery(
      {
        ...state,
        system_status: state.connected && state.armed ? state.system_status : "standby",
        groundspeed_mps: 0,
        airspeed_mps: 0,
        climb_rate_mps: 0,
        throttle_pct: state.armed ? state.throttle_pct : 0,
        },
        appliedDtS,
    );

    return { state: next, appliedDtS, mission_current_changed: false, status_notes: [] };
  }

  const autoPrepared = isAutoMode(state)
    ? prepareAutoMission(state)
    : {
        state,
        missionCurrentChanged: false,
        statusNotes: [] as string[],
      };
  const activeState = autoPrepared.state;

  if (isQuadplaneHoverHoldMode(activeState) && !activeState.target) {
    return {
      state: withBattery(holdPosition(activeState), appliedDtS),
      appliedDtS,
      mission_current_changed: autoPrepared.missionCurrentChanged,
      status_notes: autoPrepared.statusNotes,
    };
  }

  if (isPlaneFamily(activeState)) {
    const targetKind = activeState.target ? inferredTargetKind(activeState) : null;
    const planeSpeedMps = isAutoMode(activeState) && activeState.mission.speed_mps > 0
      ? activeState.mission.speed_mps
      : PLANE_CRUISE_SPEED_MPS;
    const targetPosition = activeState.target?.latitude_deg != null && activeState.target.longitude_deg != null
      ? {
          latitude_deg: activeState.target.latitude_deg,
          longitude_deg: activeState.target.longitude_deg,
        }
      : null;
    const altitudeDeltaM = (activeState.target?.relative_alt_m ?? activeState.position.relative_alt_m) - activeState.position.relative_alt_m;
    const climbRateMps = appliedDtS > 0
      ? clampMagnitude(
          altitudeDeltaM,
          (altitudeDeltaM >= 0 ? PLANE_CLIMB_MPS : PLANE_DESCEND_MPS) * appliedDtS,
        ) / appliedDtS
      : 0;
    const nextHeadingDeg = targetPosition
      ? turnToward(
          activeState.heading_deg,
          headingToTargetDeg(activeState.position, targetPosition),
          PLANE_TURN_RATE_DEGPS * appliedDtS,
        )
      : planeLoiterHeadingDeg(activeState.heading_deg, appliedDtS);
    const headingRad = (nextHeadingDeg * Math.PI) / 180;
    const remainingDistanceM = targetPosition ? horizontalDistanceM(activeState.position, targetPosition) : 0;
    const horizontalStepM = targetPosition
      ? Math.min(remainingDistanceM, planeSpeedMps * appliedDtS)
      : planeSpeedMps * appliedDtS;
    const nextPosition = {
      ...translatePosition(
        activeState.position,
        Math.cos(headingRad) * horizontalStepM,
        Math.sin(headingRad) * horizontalStepM,
      ),
      relative_alt_m: Math.max(0, activeState.position.relative_alt_m + climbRateMps * appliedDtS),
    };
    const remainingHorizontalM = targetPosition
      ? horizontalDistanceM(nextPosition, targetPosition)
      : 0;
    const reachedAltitude = activeState.target
      ? Math.abs(activeState.target.relative_alt_m - nextPosition.relative_alt_m) < 0.01
      : false;
    const reachedHorizontal = activeState.target?.latitude_deg == null
      || activeState.target?.longitude_deg == null
      || remainingHorizontalM <= PLANE_TARGET_REACHED_EPSILON_M;
    const reachedTarget = Boolean(activeState.target) && reachedAltitude && reachedHorizontal;
    const completedPosition = reachedTarget && activeState.target
      ? {
          ...nextPosition,
          latitude_deg: targetPosition?.latitude_deg ?? nextPosition.latitude_deg,
          longitude_deg: targetPosition?.longitude_deg ?? nextPosition.longitude_deg,
          relative_alt_m: activeState.target.relative_alt_m,
        }
      : nextPosition;
    const missionItem = isAutoMode(activeState) ? currentMissionItem(activeState.mission) : null;
    const reachedAutoMissionTarget = Boolean(
      missionItem
        && ((missionItem.kind === "takeoff" && targetKind === "takeoff")
          || (missionItem.kind === "waypoint" && targetKind === "guided")
          || (missionItem.kind === "rtl" && targetKind === "rtl")
          || (missionItem.kind === "land" && targetKind === "land")),
    );

    let nextMission = activeState.mission;
    let missionCurrentChanged = autoPrepared.missionCurrentChanged;
    if (reachedTarget && reachedAutoMissionTarget) {
      nextMission = advanceMissionCurrent(activeState.mission);
      missionCurrentChanged = true;
    }

    const next = withBattery(
      reachedTarget && targetKind === "land"
        ? {
            ...holdPosition(activeState),
            armed: false,
            system_status: "standby",
            position: {
              ...completedPosition,
              relative_alt_m: 0,
            },
            heading_deg: nextHeadingDeg,
            target: null,
            groundspeed_mps: 0,
            airspeed_mps: 0,
            climb_rate_mps: 0,
            throttle_pct: 0,
            mission: reachedAutoMissionTarget
              ? {
                  ...nextMission,
                  completed: true,
                }
              : nextMission,
          }
        : {
            ...activeState,
            system_status: "active",
            position: completedPosition,
            heading_deg: nextHeadingDeg,
            target: reachedTarget ? null : activeState.target,
            groundspeed_mps: planeSpeedMps,
            airspeed_mps: planeSpeedMps,
            climb_rate_mps: climbRateMps,
            throttle_pct: planeThrottlePct(climbRateMps),
            mission: nextMission,
          },
      appliedDtS,
    );

    return {
      state: next,
      appliedDtS,
      mission_current_changed: missionCurrentChanged,
      status_notes: autoPrepared.statusNotes,
    };
  }

  if (!isCopterFamily(activeState) || !activeState.target) {
    return {
      state: withBattery(holdPosition(activeState), appliedDtS),
      appliedDtS,
      mission_current_changed: autoPrepared.missionCurrentChanged,
      status_notes: autoPrepared.statusNotes,
    };
  }

  const missionItem = isAutoMode(activeState) ? currentMissionItem(activeState.mission) : null;
  const targetKind = inferredTargetKind(activeState);
  const altitudeDeltaM = activeState.target.relative_alt_m - activeState.position.relative_alt_m;
  const altitudeStepM = clampMagnitude(
    altitudeDeltaM,
    (altitudeDeltaM >= 0 ? COPTER_CLIMB_MPS : COPTER_DESCEND_MPS) * appliedDtS,
  );

  let nextPosition = {
    ...activeState.position,
    relative_alt_m: Math.max(0, activeState.position.relative_alt_m + altitudeStepM),
  };
  let groundspeedMps = 0;
  let headingDeg = activeState.heading_deg;

  if (activeState.target.latitude_deg != null && activeState.target.longitude_deg != null) {
    const targetPosition = {
      latitude_deg: activeState.target.latitude_deg,
      longitude_deg: activeState.target.longitude_deg,
    };
    const remainingDistanceM = horizontalDistanceM(activeState.position, targetPosition);
    const horizontalSpeedMps = isAutoMode(activeState)
      ? activeState.mission.speed_mps
      : COPTER_HORIZONTAL_SPEED_MPS;
    const horizontalStepM = Math.min(remainingDistanceM, horizontalSpeedMps * appliedDtS);

    if (horizontalStepM > 0) {
      const headingToTarget = headingToTargetDeg(activeState.position, targetPosition);
      const headingRad = (headingToTarget * Math.PI) / 180;
      headingDeg = headingToTarget;
      groundspeedMps = horizontalStepM / appliedDtS;
      nextPosition = {
        ...translatePosition(nextPosition, Math.cos(headingRad) * horizontalStepM, Math.sin(headingRad) * horizontalStepM),
        relative_alt_m: nextPosition.relative_alt_m,
      };
    }
  }

  const reachedAltitude = Math.abs(activeState.target.relative_alt_m - nextPosition.relative_alt_m) < 0.01;
  const reachedHorizontal = activeState.target.latitude_deg == null
    || activeState.target.longitude_deg == null
    || horizontalDistanceM(nextPosition, {
      latitude_deg: activeState.target.latitude_deg,
      longitude_deg: activeState.target.longitude_deg,
    }) < 0.1;
  const reachedTarget = reachedAltitude && reachedHorizontal;

  const reachedAutoMissionTarget = Boolean(
    missionItem
      && ((missionItem.kind === "takeoff" && targetKind === "takeoff")
        || (missionItem.kind === "waypoint" && targetKind === "guided")
        || (missionItem.kind === "rtl" && targetKind === "rtl")
        || (missionItem.kind === "land" && targetKind === "land")),
  );

  let nextMission = activeState.mission;
  let missionCurrentChanged = autoPrepared.missionCurrentChanged;
  if (reachedTarget && reachedAutoMissionTarget) {
    nextMission = advanceMissionCurrent(activeState.mission);
    missionCurrentChanged = true;
  }

  const next = withBattery(
    reachedTarget && targetKind === "land" && reachedAutoMissionTarget
      ? {
          ...holdPosition(activeState),
          armed: false,
          system_status: "standby",
          position: {
            ...nextPosition,
            relative_alt_m: 0,
          },
          heading_deg: headingDeg,
          target: null,
          groundspeed_mps: 0,
          airspeed_mps: 0,
          climb_rate_mps: 0,
          throttle_pct: 0,
          mission: {
            ...nextMission,
            completed: true,
          },
        }
      : reachedTarget && (targetKind === "guided" || targetKind === "takeoff" || targetKind === "rtl" || targetKind === "land")
        ? {
            ...holdPosition(activeState),
            position: nextPosition,
            heading_deg: headingDeg,
            target: null,
            mission: nextMission,
          }
      : {
          ...activeState,
          system_status: "active",
          position: nextPosition,
          heading_deg: headingDeg,
          groundspeed_mps: groundspeedMps,
          airspeed_mps: 0,
          climb_rate_mps: appliedDtS > 0 ? altitudeStepM / appliedDtS : 0,
          throttle_pct: activeThrottlePct(groundspeedMps, appliedDtS > 0 ? altitudeStepM / appliedDtS : 0),
          mission: nextMission,
        },
    appliedDtS,
  );

  return {
    state: next,
    appliedDtS,
    mission_current_changed: missionCurrentChanged,
    status_notes: autoPrepared.statusNotes,
  };
}
