import type { DemoVehiclePreset } from "../../../../transport";

export type SimVehicleFamily = DemoVehiclePreset;

export type SimGeoPoint = {
  latitude_deg: number;
  longitude_deg: number;
};

export type SimHomePosition = SimGeoPoint & {
  altitude_m: number;
};

export type SimFlightPosition = SimGeoPoint & {
  relative_alt_m: number;
};

export type SimBattery = {
  remaining_pct: number;
  voltage_v: number;
  current_a: number;
  energy_consumed_wh: number;
  time_remaining_s: number;
  cell_voltages_v: number[];
  capacity_wh: number;
  cell_count: number;
};

export type SimTarget = {
  kind?: "takeoff" | "guided" | "land" | "rtl";
  latitude_deg?: number;
  longitude_deg?: number;
  relative_alt_m: number;
};

export type SimMissionItem = {
  kind: "takeoff" | "waypoint" | "land";
  latitude_deg: number;
  longitude_deg: number;
  relative_alt_m: number;
} | {
  kind: "rtl";
} | {
  kind: "change_speed";
  speed_mps: number;
} | {
  kind: "unsupported";
  note: string;
};

export type SimMissionRuntime = {
  items: SimMissionItem[];
  current_index: number | null;
  completed: boolean;
  speed_mps: number | null;
  unsupported_notes: string[];
};

export type SimVehicleState = {
  connected: boolean;
  family: SimVehicleFamily;
  vehicle_type: string;
  armed: boolean;
  custom_mode: number;
  mode_name: string;
  system_status: string;
  autopilot: string;
  system_id: number;
  component_id: number;
  heartbeat_received: boolean;
  site_altitude_m: number;
  home_position: SimHomePosition;
  position: SimFlightPosition;
  heading_deg: number;
  groundspeed_mps: number;
  airspeed_mps: number;
  climb_rate_mps: number;
  throttle_pct: number;
  roll_deg: number;
  pitch_deg: number;
  battery: SimBattery;
  gps_fix_type: string;
  gps_satellites: number;
  gps_hdop: number;
  rc_channels: number[];
  rc_rssi: number;
  servo_outputs: number[];
  target: SimTarget | null;
  mission: SimMissionRuntime;
};

export type SimStepResult = {
  state: SimVehicleState;
  appliedDtS: number;
  mission_current_changed: boolean;
  status_notes: string[];
};

export type DemoSimulatorRuntime = {
  state: SimVehicleState;
  last_tick_msec: number;
};
