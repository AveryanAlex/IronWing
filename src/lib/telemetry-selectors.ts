import type { Telemetry, TelemetryState } from "../telemetry";
import { missingDomainValue, type DomainValue } from "./domain-status";

const EMPTY = missingDomainValue<TelemetryState>("bootstrap");

export function selectTelemetryView(domain: DomainValue<TelemetryState> | null | undefined): Telemetry {
  const state = domain?.value ?? EMPTY.value ?? {};

  return {
    altitude_m: state.flight?.altitude_m,
    speed_mps: state.flight?.speed_mps,
    climb_rate_mps: state.flight?.climb_rate_mps,
    throttle_pct: state.flight?.throttle_pct,
    airspeed_mps: state.flight?.airspeed_mps,
    heading_deg: state.navigation?.heading_deg,
    latitude_deg: state.navigation?.latitude_deg,
    longitude_deg: state.navigation?.longitude_deg,
    wp_dist_m: state.navigation?.wp_dist_m,
    nav_bearing_deg: state.navigation?.nav_bearing_deg,
    target_bearing_deg: state.navigation?.target_bearing_deg,
    xtrack_error_m: state.navigation?.xtrack_error_m,
    roll_deg: state.attitude?.roll_deg,
    pitch_deg: state.attitude?.pitch_deg,
    yaw_deg: state.attitude?.yaw_deg,
    battery_pct: state.power?.battery_pct,
    battery_voltage_v: state.power?.battery_voltage_v,
    battery_current_a: state.power?.battery_current_a,
    battery_voltage_cells: state.power?.battery_voltage_cells,
    battery_time_remaining_s: state.power?.battery_time_remaining_s,
    energy_consumed_wh: state.power?.energy_consumed_wh,
    gps_fix_type: state.gps?.fix_type,
    gps_satellites: state.gps?.satellites,
    gps_hdop: state.gps?.hdop,
    terrain_height_m: state.terrain?.terrain_height_m,
    height_above_terrain_m: state.terrain?.height_above_terrain_m,
    rc_channels: state.radio?.rc_channels,
    rc_rssi: state.radio?.rc_rssi,
    servo_outputs: state.radio?.servo_outputs,
  };
}
