import type { DomainProvenance } from "../../../../lib/domain-status";
import type { TelemetryDomain } from "../../../../telemetry";
import type { DemoVehiclePreset } from "../../../../transport";
import { createInitialSimVehicle } from "./fixtures";
import { setMissionCurrentIndex } from "./mission";
import { advanceSimVehicle } from "./step";
import { telemetryDomainFromSimVehicle } from "./telemetry";
import type { DemoSimulatorRuntime, SimMissionRuntime } from "./types";
import type { MockLiveVehicleState } from "../types";

const RTL_RETURN_ALT_M = 15;

function missionControlsTarget(modeName: string) {
  return modeName.trim().toUpperCase() === "AUTO";
}

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
): { simulator: DemoSimulatorRuntime; mission_current_changed: boolean; status_notes: string[] } {
  if (!Number.isFinite(nowMsec) || nowMsec <= simulator.last_tick_msec) {
    return { simulator, mission_current_changed: false, status_notes: [] };
  }

  if (!simulator.state.connected) {
    return {
      simulator: {
        ...simulator,
        last_tick_msec: nowMsec,
      },
      mission_current_changed: false,
      status_notes: [],
    };
  }

  const nextStep = advanceSimVehicle(simulator.state, (nowMsec - simulator.last_tick_msec) / 1_000);
  return {
    simulator: {
      state: nextStep.state,
      last_tick_msec: nowMsec,
    },
    mission_current_changed: nextStep.mission_current_changed,
    status_notes: nextStep.status_notes,
  };
}

export function setDemoSimulatorMission(
  simulator: DemoSimulatorRuntime,
  mission: SimMissionRuntime,
  currentIndex = mission.current_index,
  nowMsec = Date.now(),
): DemoSimulatorRuntime {
  return {
    ...simulator,
    last_tick_msec: nowMsec,
    state: {
      ...simulator.state,
      mission: setMissionCurrentIndex(mission, currentIndex),
      target: missionControlsTarget(simulator.state.mode_name) ? null : simulator.state.target,
    },
  };
}

export function setDemoSimulatorMissionCurrentIndex(
  simulator: DemoSimulatorRuntime,
  currentIndex: number | null,
  nowMsec = Date.now(),
): DemoSimulatorRuntime {
  return {
    ...simulator,
    last_tick_msec: nowMsec,
    state: {
      ...simulator.state,
      mission: setMissionCurrentIndex(simulator.state.mission, currentIndex),
      target: missionControlsTarget(simulator.state.mode_name) ? null : simulator.state.target,
    },
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
      position: armed
        ? simulator.state.position
        : {
            ...simulator.state.position,
            relative_alt_m: 0,
          },
      target: armed ? simulator.state.target : null,
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

export function setDemoSimulatorHoldTarget(simulator: DemoSimulatorRuntime, nowMsec = Date.now()): DemoSimulatorRuntime {
  return {
    ...simulator,
    last_tick_msec: nowMsec,
    state: {
      ...simulator.state,
      target: null,
      groundspeed_mps: 0,
      airspeed_mps: 0,
      climb_rate_mps: 0,
      throttle_pct: simulator.state.armed ? 15 : 0,
    },
  };
}

export function setDemoSimulatorTakeoffTarget(
  simulator: DemoSimulatorRuntime,
  relativeAltM: number,
  nowMsec = Date.now(),
): DemoSimulatorRuntime {
  return {
    ...simulator,
    last_tick_msec: nowMsec,
    state: {
      ...simulator.state,
      target: {
        kind: "takeoff",
        relative_alt_m: relativeAltM,
      },
    },
  };
}

export function setDemoSimulatorGuidedTarget(
  simulator: DemoSimulatorRuntime,
  target: { latitude_deg: number; longitude_deg: number; relative_alt_m: number },
  nowMsec = Date.now(),
): DemoSimulatorRuntime {
  return {
    ...simulator,
    last_tick_msec: nowMsec,
    state: {
      ...simulator.state,
      target: {
        kind: "guided",
        ...target,
      },
    },
  };
}

export function setDemoSimulatorLandTarget(simulator: DemoSimulatorRuntime, nowMsec = Date.now()): DemoSimulatorRuntime {
  return {
    ...simulator,
    last_tick_msec: nowMsec,
    state: {
      ...simulator.state,
      target: {
        kind: "land",
        latitude_deg: simulator.state.position.latitude_deg,
        longitude_deg: simulator.state.position.longitude_deg,
        relative_alt_m: 0,
      },
    },
  };
}

export function setDemoSimulatorRtlTarget(simulator: DemoSimulatorRuntime, nowMsec = Date.now()): DemoSimulatorRuntime {
  return {
    ...simulator,
    last_tick_msec: nowMsec,
    state: {
      ...simulator.state,
      target: {
        kind: "rtl",
        latitude_deg: simulator.state.home_position.latitude_deg,
        longitude_deg: simulator.state.home_position.longitude_deg,
        relative_alt_m: Math.max(simulator.state.position.relative_alt_m, RTL_RETURN_ALT_M),
      },
    },
  };
}
