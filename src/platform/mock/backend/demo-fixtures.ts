import type { ConfigurationFactsDomain } from "../../../configuration-facts";
import type { MissionState } from "../../../mission";
import type { ParamStore } from "../../../params";
import type { SensorHealthDomain } from "../../../sensor-health";
import type { StatusMessage } from "../../../statustext";
import type { SupportDomain } from "../../../support";
import type { DemoVehiclePreset } from "../../../transport";
import type { FlightModeEntry, TelemetryDomain } from "../../../telemetry";
import type { MockLiveStatusTextState, MockLiveVehicleState } from "./types";

type DemoFixture = {
  vehicleState: MockLiveVehicleState;
  missionState: MissionState;
  paramStore: ParamStore;
  telemetryDomain: TelemetryDomain;
  availableModes: FlightModeEntry[];
  statusText: MockLiveStatusTextState;
  supportDomain: SupportDomain;
  sensorHealthDomain: SensorHealthDomain;
  configurationFactsDomain: ConfigurationFactsDomain;
};

function seededDomain<T>(value: T) {
  return {
    available: true,
    complete: true,
    provenance: "bootstrap" as const,
    value,
  };
}

function seededStatusText(entries: StatusMessage[]): MockLiveStatusTextState {
  return { entries };
}

function seededParams(entries: Array<[string, number, "uint8" | "int8" | "uint16" | "int16" | "uint32" | "int32" | "real32"]>): ParamStore {
  return {
    expected_count: entries.length,
    params: Object.fromEntries(entries.map(([name, value, param_type], index) => [name, { name, value, param_type, index }])),
  };
}

function seededMissionState(vehicleKind: "quadcopter" | "plane"): MissionState {
  if (vehicleKind === "plane") {
    return {
      plan: {
        items: [
          {
            command: {
              Nav: {
                Takeoff: {
                  position: { RelHome: { latitude_deg: 47.397742, longitude_deg: 8.545594, relative_alt_m: 60 } },
                  pitch_deg: 12,
                },
              },
            },
            current: true,
            autocontinue: true,
          },
          {
            command: {
              Nav: {
                Waypoint: {
                  position: { RelHome: { latitude_deg: 47.4012, longitude_deg: 8.5531, relative_alt_m: 120 } },
                  hold_time_s: 0,
                  acceptance_radius_m: 20,
                  pass_radius_m: 0,
                  yaw_deg: 0,
                },
              },
            },
            current: false,
            autocontinue: true,
          },
          {
            command: {
              Nav: {
                Waypoint: {
                  position: { RelHome: { latitude_deg: 47.406, longitude_deg: 8.548, relative_alt_m: 90 } },
                  hold_time_s: 8,
                  acceptance_radius_m: 25,
                  pass_radius_m: 0,
                  yaw_deg: 0,
                },
              },
            },
            current: false,
            autocontinue: true,
          },
        ],
      },
      current_index: 0,
      sync: "current",
      active_op: null,
    };
  }

  return {
    plan: {
      items: [
        {
          command: {
            Nav: {
              Takeoff: {
                position: { RelHome: { latitude_deg: 47.397742, longitude_deg: 8.545594, relative_alt_m: 20 } },
                pitch_deg: 0,
              },
            },
          },
          current: true,
          autocontinue: true,
        },
        {
          command: {
            Nav: {
              Waypoint: {
                position: { RelHome: { latitude_deg: 47.3989, longitude_deg: 8.5482, relative_alt_m: 30 } },
                hold_time_s: 5,
                acceptance_radius_m: 1,
                pass_radius_m: 0,
                yaw_deg: 45,
              },
            },
          },
          current: false,
          autocontinue: true,
        },
      ],
    },
    current_index: 0,
    sync: "current",
    active_op: null,
  };
}

const quadcopterModes: FlightModeEntry[] = [
  { custom_mode: 0, name: "Stabilize" },
  { custom_mode: 2, name: "Alt Hold" },
  { custom_mode: 5, name: "Loiter" },
  { custom_mode: 4, name: "Guided" },
  { custom_mode: 3, name: "Auto" },
  { custom_mode: 6, name: "RTL" },
  { custom_mode: 9, name: "Land" },
  { custom_mode: 7, name: "Circle" },
];

const planeModes: FlightModeEntry[] = [
  { custom_mode: 0, name: "Manual" },
  { custom_mode: 1, name: "Circle" },
  { custom_mode: 2, name: "Stabilize" },
  { custom_mode: 3, name: "Training" },
  { custom_mode: 4, name: "Acro" },
  { custom_mode: 5, name: "FBWA" },
  { custom_mode: 6, name: "FBWB" },
  { custom_mode: 7, name: "Cruise" },
  { custom_mode: 10, name: "Auto" },
  { custom_mode: 11, name: "RTL" },
  { custom_mode: 12, name: "Loiter" },
  { custom_mode: 13, name: "Takeoff" },
];

const quadplaneOverlayModes: FlightModeEntry[] = [
  ...planeModes,
  { custom_mode: 19, name: "QLOITER" },
  { custom_mode: 20, name: "QRTL" },
  { custom_mode: 17, name: "QSTABILIZE" },
];

const quadcopterFixture: DemoFixture = {
  vehicleState: {
    armed: false,
    custom_mode: 5,
    mode_name: "Loiter",
    system_status: "standby",
    vehicle_type: "quadrotor",
    autopilot: "ardupilot",
    system_id: 1,
    component_id: 1,
    heartbeat_received: true,
  },
  missionState: seededMissionState("quadcopter"),
  paramStore: seededParams([
    ["FRAME_CLASS", 1, "uint8"],
    ["FRAME_TYPE", 0, "uint8"],
    ["FLTMODE1", 7, "uint8"],
    ["FLTMODE2", 9, "uint8"],
    ["FLTMODE3", 6, "uint8"],
    ["FLTMODE4", 3, "uint8"],
    ["FLTMODE5", 5, "uint8"],
    ["FLTMODE6", 0, "uint8"],
    ["BATT_MONITOR", 4, "uint8"],
    ["BATT_CAPACITY", 5000, "int32"],
    ["MOT_BAT_VOLT_MIN", 9.6, "real32"],
    ["MOT_BAT_VOLT_MAX", 12.8, "real32"],
    ["MOT_THST_EXPO", 0.65, "real32"],
    ["MOT_THST_HOVER", 0.39, "real32"],
    ["GPS_AUTO_CONFIG", 1, "uint8"],
    ["SERIAL1_PROTOCOL", 2, "uint8"],
    ["SERIAL1_BAUD", 57, "uint8"],
    ["FS_THR_ENABLE", 1, "uint8"],
    ["FS_GCS_ENABLE", 1, "uint8"],
  ]),
  telemetryDomain: seededDomain({
    flight: { altitude_m: 18, speed_mps: 0.6, climb_rate_mps: 0.1, throttle_pct: 38, airspeed_mps: 0 },
    navigation: { latitude_deg: 47.397742, longitude_deg: 8.545594, heading_deg: 182, wp_dist_m: 12, nav_bearing_deg: 180, target_bearing_deg: 183, xtrack_error_m: 0.2 },
    attitude: { roll_deg: 0.4, pitch_deg: -1.2, yaw_deg: 182 },
    power: { battery_pct: 84, battery_voltage_v: 15.4, battery_current_a: 9.8, battery_voltage_cells: [3.85, 3.86, 3.84, 3.85], energy_consumed_wh: 42, battery_time_remaining_s: 780 },
    gps: { fix_type: "3d_fix", satellites: 17, hdop: 0.8 },
    terrain: { terrain_height_m: 470, height_above_terrain_m: 18 },
    radio: { rc_channels: [1500, 1500, 1510, 1500], rc_rssi: 92, servo_outputs: [1510, 1490, 1460, 1505] },
  }),
  availableModes: quadcopterModes,
  statusText: seededStatusText([
    { sequence: 1, severity: "info", text: "EKF3 IMU0 is using GPS", timestamp_usec: 1_000_000 },
    { sequence: 2, severity: "notice", text: "Vehicle ready to arm", timestamp_usec: 2_000_000 },
  ]),
  supportDomain: seededDomain({
    can_request_prearm_checks: true,
    can_calibrate_accel: true,
    can_calibrate_compass: true,
    can_calibrate_radio: true,
  }),
  sensorHealthDomain: seededDomain({
    gyro: "healthy",
    accel: "healthy",
    mag: "healthy",
    baro: "healthy",
    gps: "healthy",
    airspeed: "disabled",
    rc_receiver: "healthy",
    battery: "healthy",
    terrain: "healthy",
    geofence: "healthy",
  }),
  configurationFactsDomain: seededDomain({
    frame: { configured: true },
    gps: { configured: true },
    battery_monitor: { configured: true },
    motors_esc: { configured: true },
  }),
};

const planeBaseFixture: DemoFixture = {
  vehicleState: {
    armed: false,
    custom_mode: 10,
    mode_name: "AUTO",
    system_status: "standby",
    vehicle_type: "fixed_wing",
    autopilot: "ardu_pilot_mega",
    system_id: 1,
    component_id: 1,
    heartbeat_received: true,
  },
  missionState: seededMissionState("plane"),
  paramStore: seededParams([
    ["BATT_MONITOR", 4, "uint8"],
    ["AIRSPEED_CRUISE", 22, "real32"],
    ["AIRSPEED_MAX", 30, "real32"],
    ["AIRSPEED_MIN", 10, "real32"],
    ["ARSPD_USE", 1, "uint8"],
    ["NAVL1_PERIOD", 15, "real32"],
    ["WP_LOITER_RAD", 80, "real32"],
    ["WP_RADIUS", 50, "real32"],
    ["FLTMODE1", 10, "uint8"],
    ["FLTMODE2", 11, "uint8"],
    ["FLTMODE3", 12, "uint8"],
    ["FLTMODE4", 5, "uint8"],
    ["FLTMODE5", 2, "uint8"],
    ["FLTMODE6", 0, "uint8"],
    ["FLTMODE_CH", 8, "uint8"],
    ["PTCH_RATE_P", 0.15, "real32"],
    ["PTCH_RATE_I", 0.11, "real32"],
    ["RLL_RATE_P", 0.3, "real32"],
    ["RLL_RATE_I", 0.25, "real32"],
    ["TRIM_THROTTLE", 50, "real32"],
    ["RC1_TRIM", 1500, "uint16"],
    ["RC2_TRIM", 1500, "uint16"],
    ["RC3_TRIM", 1000, "uint16"],
    ["SERVO1_FUNCTION", 4, "uint8"],
    ["SERVO2_FUNCTION", 19, "uint8"],
    ["SERVO3_MIN", 1000, "uint16"],
    ["SERVO3_MAX", 2000, "uint16"],
  ]),
  telemetryDomain: seededDomain({
    flight: { altitude_m: 118, speed_mps: 22, climb_rate_mps: 0.6, throttle_pct: 52, airspeed_mps: 24 },
    navigation: { latitude_deg: 47.4012, longitude_deg: 8.5531, heading_deg: 96, wp_dist_m: 180, nav_bearing_deg: 94, target_bearing_deg: 98, xtrack_error_m: 2.1 },
    attitude: { roll_deg: 5.2, pitch_deg: 2.1, yaw_deg: 96 },
    power: { battery_pct: 76, battery_voltage_v: 22.6, battery_current_a: 14.1, battery_voltage_cells: [3.77, 3.77, 3.76, 3.77, 3.76, 3.77], energy_consumed_wh: 112, battery_time_remaining_s: 1280 },
    gps: { fix_type: "3d_fix", satellites: 19, hdop: 0.7 },
    terrain: { terrain_height_m: 468, height_above_terrain_m: 118 },
    radio: { rc_channels: [1500, 1500, 1600, 1500], rc_rssi: 89, servo_outputs: [1540, 1490, 1600, 1505] },
  }),
  availableModes: planeModes,
  statusText: seededStatusText([
    { sequence: 1, severity: "info", text: "Airspeed sensor healthy", timestamp_usec: 1_000_000 },
    { sequence: 2, severity: "notice", text: "AUTO mission loaded", timestamp_usec: 2_000_000 },
  ]),
  supportDomain: seededDomain({
    can_request_prearm_checks: true,
    can_calibrate_accel: true,
    can_calibrate_compass: true,
    can_calibrate_radio: false,
  }),
  sensorHealthDomain: seededDomain({
    gyro: "healthy",
    accel: "healthy",
    mag: "healthy",
    baro: "healthy",
    gps: "healthy",
    airspeed: "healthy",
    rc_receiver: "healthy",
    battery: "healthy",
    terrain: "healthy",
    geofence: "healthy",
  }),
  configurationFactsDomain: seededDomain({
    frame: { configured: true },
    gps: { configured: true },
    battery_monitor: { configured: true },
    motors_esc: { configured: true },
  }),
};

const quadplaneFixture: DemoFixture = {
  ...planeBaseFixture,
  vehicleState: {
    ...planeBaseFixture.vehicleState,
    custom_mode: 19,
    mode_name: "QLOITER",
    vehicle_type: "vtol",
  },
  paramStore: seededParams([
    ...Object.values(planeBaseFixture.paramStore.params).map((param) => [param.name, param.value, param.param_type] as const),
    ["Q_ENABLE", 1, "uint8"],
    ["Q_FRAME_CLASS", 1, "uint8"],
    ["Q_ASSIST_SPEED", 18, "real32"],
    ["Q_M_THST_EXPO", 0.65, "real32"],
    ["Q_M_PWM_MIN", 1000, "uint16"],
    ["Q_M_PWM_MAX", 2000, "uint16"],
    ["Q_M_BAT_VOLT_MAX", 12.8, "real32"],
    ["Q_M_BAT_VOLT_MIN", 9.6, "real32"],
    ["Q_A_RAT_RLL_P", 0.108, "real32"],
    ["Q_A_RAT_RLL_I", 0.108, "real32"],
    ["Q_A_RAT_PIT_P", 0.103, "real32"],
    ["Q_A_RAT_PIT_I", 0.103, "real32"],
    ["Q_A_RAT_YAW_P", 0.2, "real32"],
    ["Q_A_RAT_YAW_I", 0.02, "real32"],
  ]),
  telemetryDomain: seededDomain({
    ...planeBaseFixture.telemetryDomain.value!,
    flight: { ...planeBaseFixture.telemetryDomain.value!.flight, altitude_m: 42, speed_mps: 3.5, climb_rate_mps: 0.2, throttle_pct: 41, airspeed_mps: 11 },
    navigation: { ...planeBaseFixture.telemetryDomain.value!.navigation, wp_dist_m: 35, xtrack_error_m: 0.4 },
  }),
  availableModes: quadplaneOverlayModes,
  statusText: seededStatusText([
    { sequence: 1, severity: "info", text: "QuadPlane assist ready", timestamp_usec: 1_000_000 },
    { sequence: 2, severity: "notice", text: "AUTO mission loaded", timestamp_usec: 2_000_000 },
    { sequence: 3, severity: "notice", text: "QLOITER holding transition point", timestamp_usec: 3_000_000 },
  ]),
};

const fixtures: Record<DemoVehiclePreset, DemoFixture> = {
  quadcopter: quadcopterFixture,
  airplane: planeBaseFixture,
  quadplane: quadplaneFixture,
};

export function demoFixtureForPreset(preset: DemoVehiclePreset): DemoFixture {
  return structuredClone(fixtures[preset]);
}
