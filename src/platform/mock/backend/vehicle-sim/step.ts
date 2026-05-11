import { advanceBattery } from "./battery";
import type { SimStepResult, SimVehicleState } from "./types";

export const MAX_STEP_S = 1;
export const COPTER_CLIMB_MPS = 2.5;

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

  const targetRelativeAltM = state.target?.relative_alt_m ?? state.position.relative_alt_m;
  const remainingAltitudeM = Math.max(0, targetRelativeAltM - state.position.relative_alt_m);
  const canClimb = state.family === "quadcopter" || state.family === "quadplane";
  const climbedM = canClimb ? Math.min(remainingAltitudeM, COPTER_CLIMB_MPS * appliedDtS) : 0;
  const next = withBattery(
    {
      ...state,
      system_status: "active",
      position: {
        ...state.position,
        relative_alt_m: state.position.relative_alt_m + climbedM,
      },
      groundspeed_mps: 0,
      airspeed_mps: 0,
      climb_rate_mps: appliedDtS > 0 ? climbedM / appliedDtS : 0,
      throttle_pct: climbedM > 0 ? 65 : 15,
    },
    appliedDtS,
  );

  return { state: next, appliedDtS };
}
