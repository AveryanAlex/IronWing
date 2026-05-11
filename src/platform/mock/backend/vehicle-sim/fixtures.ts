import type { DemoVehiclePreset } from "../../../../transport";
import type { SimBattery, SimMissionRuntime, SimVehicleState } from "./types";

function createBattery(): SimBattery {
  return {
    remaining_pct: 100,
    voltage_v: 16.8,
    current_a: 0.6,
    energy_consumed_wh: 0,
    time_remaining_s: 100_000,
    cell_voltages_v: [4.2, 4.2, 4.2, 4.2],
    capacity_wh: 77,
    cell_count: 4,
  };
}

function createMission(position: SimVehicleState["position"]): SimMissionRuntime {
  return {
    current_index: 0,
    items: [
      {
        kind: "takeoff",
        latitude_deg: position.latitude_deg,
        longitude_deg: position.longitude_deg,
        relative_alt_m: 20,
      },
    ],
  };
}

export function createInitialSimVehicle(preset: DemoVehiclePreset): SimVehicleState {
  const site_altitude_m = preset === "airplane" || preset === "quadplane" ? 488 : 472;
  const home_position = {
    latitude_deg: 47.397742,
    longitude_deg: 8.545594,
    altitude_m: site_altitude_m,
  };
  const position = {
    latitude_deg: home_position.latitude_deg,
    longitude_deg: home_position.longitude_deg,
    relative_alt_m: 0,
  };

  const byPreset: Record<DemoVehiclePreset, Pick<SimVehicleState, "family" | "vehicle_type" | "custom_mode" | "mode_name">> = {
    quadcopter: {
      family: "quadcopter",
      vehicle_type: "quadrotor",
      custom_mode: 5,
      mode_name: "Loiter",
    },
    airplane: {
      family: "airplane",
      vehicle_type: "fixed_wing",
      custom_mode: 0,
      mode_name: "Manual",
    },
    quadplane: {
      family: "quadplane",
      vehicle_type: "vtol",
      custom_mode: 19,
      mode_name: "QLOITER",
    },
  };

  return {
    connected: true,
    ...byPreset[preset],
    armed: false,
    system_status: "standby",
    autopilot: "ardu_pilot_mega",
    system_id: 1,
    component_id: 1,
    heartbeat_received: true,
    site_altitude_m,
    home_position,
    position,
    heading_deg: 0,
    groundspeed_mps: 0,
    airspeed_mps: 0,
    climb_rate_mps: 0,
    throttle_pct: 0,
    roll_deg: 0,
    pitch_deg: 0,
    battery: createBattery(),
    gps_fix_type: "3d_fix",
    gps_satellites: 16,
    gps_hdop: 0.8,
    rc_channels: [1500, 1500, 1000, 1500],
    rc_rssi: 100,
    servo_outputs: [1000, 1000, 1000, 1000],
    target: null,
    mission: createMission(position),
  };
}
