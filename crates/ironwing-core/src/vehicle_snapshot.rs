use crate::ipc::{DomainProvenance, TelemetrySnapshot, VehicleState, telemetry_snapshot_from_value};

pub fn telemetry_snapshot_from_vehicle(
    vehicle: &mavkit::Vehicle,
    provenance: DomainProvenance,
) -> TelemetrySnapshot {
    let telemetry = vehicle.telemetry();
    let position_global = telemetry.position().global();
    let groundspeed = telemetry.position().groundspeed_mps();
    let airspeed = telemetry.position().airspeed_mps();
    let climb_rate = telemetry.position().climb_rate_mps();
    let heading = telemetry.position().heading_deg();
    let throttle = telemetry.position().throttle_pct();
    let attitude = telemetry.attitude().euler();
    let bat_remaining = telemetry.battery().remaining_pct();
    let bat_voltage = telemetry.battery().voltage_v();
    let bat_current = telemetry.battery().current_a();
    let bat_cells = telemetry.battery().cells();
    let bat_energy = telemetry.battery().energy_consumed_wh();
    let bat_time_remaining = telemetry.battery().time_remaining_s();
    let gps_quality = telemetry.gps().quality();
    let nav_wp = telemetry.navigation().waypoint();
    let nav_guidance = telemetry.navigation().guidance();
    let terrain_clearance = telemetry.terrain().clearance();
    let rc = telemetry.rc();
    let rc_channels: Vec<_> = (0..18)
        .filter_map(|index| rc.channel_pwm_us(index))
        .collect();
    let rc_rssi = rc.rssi_pct();
    let actuators = telemetry.actuators();
    let servo_outputs: Vec<_> = (0..16)
        .filter_map(|index| actuators.servo_pwm_us(index))
        .collect();

    let rc_channel_values: Vec<f64> = rc_channels
        .iter()
        .filter_map(|channel| channel.latest().map(|sample| f64::from(sample.value)))
        .collect();
    let servo_output_values: Vec<f64> = servo_outputs
        .iter()
        .filter_map(|servo| servo.latest().map(|sample| f64::from(sample.value)))
        .collect();

    let snapshot = serde_json::json!({
        "latitude_deg": position_global.latest().map(|sample| sample.value.latitude_deg),
        "longitude_deg": position_global.latest().map(|sample| sample.value.longitude_deg),
        "altitude_m": position_global.latest().map(|sample| sample.value.altitude_msl_m),
        "speed_mps": groundspeed.latest().map(|sample| sample.value),
        "airspeed_mps": airspeed.latest().map(|sample| sample.value),
        "climb_rate_mps": climb_rate.latest().map(|sample| sample.value),
        "heading_deg": heading.latest().map(|sample| sample.value),
        "throttle_pct": throttle.latest().map(|sample| sample.value),
        "roll_deg": attitude.latest().map(|sample| sample.value.roll_deg),
        "pitch_deg": attitude.latest().map(|sample| sample.value.pitch_deg),
        "yaw_deg": attitude.latest().map(|sample| sample.value.yaw_deg),
        "battery_pct": bat_remaining.latest().map(|sample| sample.value),
        "battery_voltage_v": bat_voltage.latest().map(|sample| sample.value),
        "battery_current_a": bat_current.latest().map(|sample| sample.value),
        "battery_voltage_cells": bat_cells.latest().map(|sample| sample.value.voltages_v.clone()),
        "energy_consumed_wh": bat_energy.latest().map(|sample| sample.value),
        "battery_time_remaining_s": bat_time_remaining.latest().map(|sample| f64::from(sample.value)),
        "gps_fix_type": gps_quality.latest().map(|sample| sample.value.fix_type),
        "gps_satellites": gps_quality.latest().and_then(|sample| sample.value.satellites.map(|value| value as u64)),
        "gps_hdop": gps_quality.latest().and_then(|sample| sample.value.hdop),
        "wp_dist_m": nav_wp.latest().map(|sample| sample.value.distance_m),
        "nav_bearing_deg": nav_wp.latest().map(|sample| sample.value.bearing_deg),
        "target_bearing_deg": nav_guidance.latest().map(|sample| sample.value.bearing_deg),
        "xtrack_error_m": nav_guidance.latest().map(|sample| sample.value.cross_track_error_m),
        "terrain_height_m": terrain_clearance.latest().map(|sample| sample.value.terrain_height_m),
        "height_above_terrain_m": terrain_clearance.latest().map(|sample| sample.value.height_above_terrain_m),
        "rc_channels": (!rc_channel_values.is_empty()).then_some(rc_channel_values),
        "rc_rssi": rc_rssi.latest().map(|sample| f64::from(sample.value)),
        "servo_outputs": (!servo_output_values.is_empty()).then_some(servo_output_values),
    });

    telemetry_snapshot_from_value(&snapshot, provenance)
}

pub fn seeded_vehicle_state(vehicle: &mavkit::Vehicle) -> VehicleState {
    let identity = vehicle.identity();
    VehicleState {
        armed: false,
        custom_mode: 0,
        mode_name: "unknown".into(),
        system_status: mavkit::SystemStatus::Active,
        vehicle_type: identity.vehicle_type,
        autopilot: identity.autopilot,
        system_id: identity.system_id,
        component_id: identity.component_id,
        heartbeat_received: true,
    }
}

pub fn mav_severity_name(severity: mavkit::dialect::MavSeverity) -> &'static str {
    use mavkit::dialect::MavSeverity::*;

    match severity {
        MAV_SEVERITY_EMERGENCY => "emergency",
        MAV_SEVERITY_ALERT => "alert",
        MAV_SEVERITY_CRITICAL => "critical",
        MAV_SEVERITY_ERROR => "error",
        MAV_SEVERITY_WARNING => "warning",
        MAV_SEVERITY_NOTICE => "notice",
        MAV_SEVERITY_INFO => "info",
        MAV_SEVERITY_DEBUG => "debug",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mav_severity_name_maps_all_variants_to_lowercase() {
        use mavkit::dialect::MavSeverity::*;

        assert_eq!(mav_severity_name(MAV_SEVERITY_EMERGENCY), "emergency");
        assert_eq!(mav_severity_name(MAV_SEVERITY_ALERT), "alert");
        assert_eq!(mav_severity_name(MAV_SEVERITY_CRITICAL), "critical");
        assert_eq!(mav_severity_name(MAV_SEVERITY_ERROR), "error");
        assert_eq!(mav_severity_name(MAV_SEVERITY_WARNING), "warning");
        assert_eq!(mav_severity_name(MAV_SEVERITY_NOTICE), "notice");
        assert_eq!(mav_severity_name(MAV_SEVERITY_INFO), "info");
        assert_eq!(mav_severity_name(MAV_SEVERITY_DEBUG), "debug");
    }
}
