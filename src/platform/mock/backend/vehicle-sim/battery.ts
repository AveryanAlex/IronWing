import type { SimBattery, SimVehicleState } from "./types";

const DISARMED_DRAIN_PCT_PER_S = 0.001;
const DISARMED_CURRENT_A = 0.6;
const ARMED_BASE_DRAIN_PCT_PER_S = 0.01;
const ARMED_SPEED_DRAIN_PCT_PER_S = 0.0003;
const ARMED_CLIMB_DRAIN_PCT_PER_S = 0.002;
const ARMED_THROTTLE_DRAIN_PCT_PER_S = 0.00005;
const ARMED_BASE_CURRENT_A = 10;
const ARMED_SPEED_CURRENT_A = 0.12;
const ARMED_CLIMB_CURRENT_A = 1.5;
const ARMED_THROTTLE_CURRENT_A = 0.03;
const MIN_CELL_VOLTAGE_V = 3.3;
const MAX_CELL_VOLTAGE_V = 4.2;

function clampBatteryPct(value: number) {
  return Math.min(100, Math.max(0, value));
}

function voltageForRemainingPct(remainingPct: number, cellCount: number) {
  const cellVoltage = MIN_CELL_VOLTAGE_V + ((MAX_CELL_VOLTAGE_V - MIN_CELL_VOLTAGE_V) * remainingPct) / 100;
  return {
    voltage_v: cellVoltage * cellCount,
    cell_voltages_v: Array.from({ length: cellCount }, () => cellVoltage),
  };
}

export function advanceBattery(state: SimVehicleState, dtS: number): SimBattery {
  if (dtS <= 0) {
    return state.battery;
  }

  const speedMps = Math.max(state.groundspeed_mps, state.airspeed_mps, 0);
  const positiveClimbMps = Math.max(state.climb_rate_mps, 0);
  const drainPctPerS = state.armed
    ? ARMED_BASE_DRAIN_PCT_PER_S
      + (speedMps * ARMED_SPEED_DRAIN_PCT_PER_S)
      + (positiveClimbMps * ARMED_CLIMB_DRAIN_PCT_PER_S)
      + (Math.max(state.throttle_pct, 0) * ARMED_THROTTLE_DRAIN_PCT_PER_S)
    : DISARMED_DRAIN_PCT_PER_S;
  const currentA = state.armed
    ? ARMED_BASE_CURRENT_A
      + (speedMps * ARMED_SPEED_CURRENT_A)
      + (positiveClimbMps * ARMED_CLIMB_CURRENT_A)
      + (Math.max(state.throttle_pct, 0) * ARMED_THROTTLE_CURRENT_A)
    : DISARMED_CURRENT_A;
  const remaining_pct = clampBatteryPct(state.battery.remaining_pct - drainPctPerS * dtS);
  const consumedDeltaWh = (state.battery.capacity_wh * drainPctPerS * dtS) / 100;
  const { voltage_v, cell_voltages_v } = voltageForRemainingPct(remaining_pct, state.battery.cell_count);

  return {
    ...state.battery,
    remaining_pct,
    voltage_v,
    current_a: currentA,
    energy_consumed_wh: state.battery.energy_consumed_wh + consumedDeltaWh,
    time_remaining_s: drainPctPerS > 0 ? (remaining_pct / drainPctPerS) : Number.POSITIVE_INFINITY,
    cell_voltages_v,
  };
}
