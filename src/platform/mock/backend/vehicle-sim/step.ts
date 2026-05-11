import { advanceBattery } from "./battery";
import { headingToTargetDeg, horizontalDistanceM, translatePosition } from "./geo";
import type { SimStepResult, SimVehicleState } from "./types";

export const MAX_STEP_S = 1;
export const COPTER_CLIMB_MPS = 2.5;
export const COPTER_DESCEND_MPS = 1.5;
export const COPTER_HORIZONTAL_SPEED_MPS = 5;

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

function inferredTargetKind(state: SimVehicleState) {
  if (state.target?.kind) {
    return state.target.kind;
  }

  return state.target?.latitude_deg != null && state.target.longitude_deg != null ? "guided" : "takeoff";
}

function isCopterFamily(state: SimVehicleState) {
  return state.family === "quadcopter" || state.family === "quadplane";
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

    return { state: next, appliedDtS };
  }

  if (!isCopterFamily(state) || !state.target) {
    return {
      state: withBattery(holdPosition(state), appliedDtS),
      appliedDtS,
    };
  }

  const targetKind = inferredTargetKind(state);
  const altitudeDeltaM = state.target.relative_alt_m - state.position.relative_alt_m;
  const altitudeStepM = clampMagnitude(
    altitudeDeltaM,
    (altitudeDeltaM >= 0 ? COPTER_CLIMB_MPS : COPTER_DESCEND_MPS) * appliedDtS,
  );

  let nextPosition = {
    ...state.position,
    relative_alt_m: Math.max(0, state.position.relative_alt_m + altitudeStepM),
  };
  let groundspeedMps = 0;
  let headingDeg = state.heading_deg;

  if (state.target.latitude_deg != null && state.target.longitude_deg != null) {
    const targetPosition = {
      latitude_deg: state.target.latitude_deg,
      longitude_deg: state.target.longitude_deg,
    };
    const remainingDistanceM = horizontalDistanceM(state.position, targetPosition);
    const horizontalStepM = Math.min(remainingDistanceM, COPTER_HORIZONTAL_SPEED_MPS * appliedDtS);

    if (horizontalStepM > 0) {
      const headingToTarget = headingToTargetDeg(state.position, targetPosition);
      const headingRad = (headingToTarget * Math.PI) / 180;
      headingDeg = headingToTarget;
      groundspeedMps = horizontalStepM / appliedDtS;
      nextPosition = {
        ...translatePosition(nextPosition, Math.cos(headingRad) * horizontalStepM, Math.sin(headingRad) * horizontalStepM),
        relative_alt_m: nextPosition.relative_alt_m,
      };
    }
  }

  const reachedAltitude = Math.abs(state.target.relative_alt_m - nextPosition.relative_alt_m) < 0.01;
  const reachedHorizontal = state.target.latitude_deg == null
    || state.target.longitude_deg == null
    || horizontalDistanceM(nextPosition, {
      latitude_deg: state.target.latitude_deg,
      longitude_deg: state.target.longitude_deg,
    }) < 0.1;
  const reachedTarget = reachedAltitude && reachedHorizontal;

  const next = withBattery(
    reachedTarget && (targetKind === "guided" || targetKind === "takeoff" || targetKind === "rtl" || targetKind === "land")
      ? {
          ...holdPosition(state),
          position: nextPosition,
          heading_deg: headingDeg,
          target: null,
        }
      : {
          ...state,
          system_status: "active",
          position: nextPosition,
          heading_deg: headingDeg,
          groundspeed_mps: groundspeedMps,
          airspeed_mps: 0,
          climb_rate_mps: appliedDtS > 0 ? altitudeStepM / appliedDtS : 0,
          throttle_pct: activeThrottlePct(groundspeedMps, appliedDtS > 0 ? altitudeStepM / appliedDtS : 0),
        },
    appliedDtS,
  );

  return { state: next, appliedDtS };
}
