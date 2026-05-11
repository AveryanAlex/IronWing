import type { DomainProvenance } from "../../../../lib/domain-status";
import type { TelemetryDomain } from "../../../../telemetry";
import { headingToTargetDeg, horizontalDistanceM } from "./geo";
import type { SimVehicleState } from "./types";

export function telemetryDomainFromSimVehicle(
  state: SimVehicleState,
  provenance: DomainProvenance = "stream",
): TelemetryDomain {
  const targetPosition = state.target?.latitude_deg != null && state.target.longitude_deg != null
    ? {
        latitude_deg: state.target.latitude_deg,
        longitude_deg: state.target.longitude_deg,
      }
    : null;
  const targetBearingDeg = targetPosition ? headingToTargetDeg(state.position, targetPosition) : state.heading_deg;
  const wpDistM = targetPosition ? horizontalDistanceM(state.position, targetPosition) : 0;

  return {
    available: true,
    complete: true,
    provenance,
    value: {
      flight: {
        altitude_m: state.position.relative_alt_m,
        speed_mps: state.groundspeed_mps,
        climb_rate_mps: state.climb_rate_mps,
        throttle_pct: state.throttle_pct,
        airspeed_mps: state.airspeed_mps,
      },
      navigation: {
        latitude_deg: state.position.latitude_deg,
        longitude_deg: state.position.longitude_deg,
        heading_deg: state.heading_deg,
        wp_dist_m: wpDistM,
        nav_bearing_deg: targetBearingDeg,
        target_bearing_deg: targetBearingDeg,
        xtrack_error_m: 0,
      },
      attitude: {
        roll_deg: state.roll_deg,
        pitch_deg: state.pitch_deg,
        yaw_deg: state.heading_deg,
      },
      power: {
        battery_pct: state.battery.remaining_pct,
        battery_voltage_v: state.battery.voltage_v,
        battery_current_a: state.battery.current_a,
        battery_voltage_cells: state.battery.cell_voltages_v,
        energy_consumed_wh: state.battery.energy_consumed_wh,
        battery_time_remaining_s: state.battery.time_remaining_s,
      },
      gps: {
        fix_type: state.gps_fix_type,
        satellites: state.gps_satellites,
        hdop: state.gps_hdop,
      },
      terrain: {
        terrain_height_m: state.site_altitude_m,
        height_above_terrain_m: state.position.relative_alt_m,
      },
      radio: {
        rc_channels: state.rc_channels,
        rc_rssi: state.rc_rssi,
        servo_outputs: state.servo_outputs,
      },
    },
  };
}
