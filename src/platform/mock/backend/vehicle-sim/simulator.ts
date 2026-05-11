import type { DomainProvenance } from "../../../../lib/domain-status";
import type { TelemetryDomain } from "../../../../telemetry";
import type { DemoVehiclePreset } from "../../../../transport";
import { createInitialSimVehicle } from "./fixtures";
import { advanceSimVehicle } from "./step";
import { telemetryDomainFromSimVehicle } from "./telemetry";
import type { DemoSimulatorRuntime } from "./types";
import type { MockLiveVehicleState } from "../types";

export function createDemoSimulator(
  preset: DemoVehiclePreset,
  nowMsec = Date.now(),
): DemoSimulatorRuntime {
  return {
    state: createInitialSimVehicle(preset),
    last_tick_msec: nowMsec,
  };
}

export function vehicleStateFromSimulator(
  simulator: DemoSimulatorRuntime,
  seed?: Partial<MockLiveVehicleState> | null,
): MockLiveVehicleState {
  const { state } = simulator;
  return {
    armed: state.armed,
    custom_mode: state.custom_mode,
    mode_name: state.mode_name,
    system_status: state.system_status,
    vehicle_type: state.vehicle_type,
    autopilot: seed?.autopilot ?? state.autopilot,
    system_id: seed?.system_id ?? state.system_id,
    component_id: seed?.component_id ?? state.component_id,
    heartbeat_received: seed?.heartbeat_received ?? state.heartbeat_received,
  };
}

export function telemetryFromSimulator(
  simulator: DemoSimulatorRuntime,
  provenance: DomainProvenance = "stream",
): TelemetryDomain {
  return telemetryDomainFromSimVehicle(simulator.state, provenance);
}

export function advanceDemoSimulator(
  simulator: DemoSimulatorRuntime,
  nowMsec = Date.now(),
): DemoSimulatorRuntime {
  if (!Number.isFinite(nowMsec) || nowMsec <= simulator.last_tick_msec) {
    return simulator;
  }

  if (!simulator.state.connected || !simulator.state.armed) {
    return {
      ...simulator,
      last_tick_msec: nowMsec,
    };
  }

  const { state } = advanceSimVehicle(simulator.state, (nowMsec - simulator.last_tick_msec) / 1_000);
  return {
    state,
    last_tick_msec: nowMsec,
  };
}

export function setDemoSimulatorArmedState(
  simulator: DemoSimulatorRuntime,
  armed: boolean,
  nowMsec = Date.now(),
): DemoSimulatorRuntime {
  return {
    ...simulator,
    last_tick_msec: nowMsec,
    state: {
      ...simulator.state,
      armed,
      system_status: armed ? "active" : "standby",
      groundspeed_mps: armed ? simulator.state.groundspeed_mps : 0,
      airspeed_mps: armed ? simulator.state.airspeed_mps : 0,
      climb_rate_mps: armed ? simulator.state.climb_rate_mps : 0,
      throttle_pct: armed ? simulator.state.throttle_pct : 0,
    },
  };
}

export function setDemoSimulatorMode(
  simulator: DemoSimulatorRuntime,
  mode: { custom_mode: number; mode_name: string },
  nowMsec = Date.now(),
): DemoSimulatorRuntime {
  return {
    ...simulator,
    last_tick_msec: nowMsec,
    state: {
      ...simulator.state,
      custom_mode: mode.custom_mode,
      mode_name: mode.mode_name,
    },
  };
}
