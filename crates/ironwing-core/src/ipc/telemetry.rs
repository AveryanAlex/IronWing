use serde_json::Value;

use crate::ipc::{DomainProvenance, DomainValue};

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, Default, serde::Serialize, serde::Deserialize)]
pub struct TelemetryFlight {
    pub altitude_m: Option<f64>,
    pub speed_mps: Option<f64>,
    pub climb_rate_mps: Option<f64>,
    pub throttle_pct: Option<f64>,
    pub airspeed_mps: Option<f64>,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, Default, serde::Serialize, serde::Deserialize)]
pub struct TelemetryNavigation {
    pub latitude_deg: Option<f64>,
    pub longitude_deg: Option<f64>,
    pub heading_deg: Option<f64>,
    pub wp_dist_m: Option<f64>,
    pub nav_bearing_deg: Option<f64>,
    pub target_bearing_deg: Option<f64>,
    pub xtrack_error_m: Option<f64>,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, Default, serde::Serialize, serde::Deserialize)]
pub struct TelemetryAttitude {
    pub roll_deg: Option<f64>,
    pub pitch_deg: Option<f64>,
    pub yaw_deg: Option<f64>,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, Default, serde::Serialize, serde::Deserialize)]
pub struct TelemetryPower {
    pub battery_pct: Option<f64>,
    pub battery_voltage_v: Option<f64>,
    pub battery_current_a: Option<f64>,
    pub battery_voltage_cells: Option<Vec<f64>>,
    pub energy_consumed_wh: Option<f64>,
    pub battery_time_remaining_s: Option<f64>,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, Default, serde::Serialize, serde::Deserialize)]
pub struct TelemetryGps {
    pub fix_type: Option<mavkit::GpsFixType>,
    pub satellites: Option<u64>,
    pub hdop: Option<f64>,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, Default, serde::Serialize, serde::Deserialize)]
pub struct TelemetryTerrain {
    pub terrain_height_m: Option<f64>,
    pub height_above_terrain_m: Option<f64>,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, Default, serde::Serialize, serde::Deserialize)]
pub struct TelemetryRadio {
    pub rc_channels: Option<Vec<Option<f64>>>,
    pub rc_rssi: Option<f64>,
    pub servo_outputs: Option<Vec<Option<f64>>>,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, Default, serde::Serialize, serde::Deserialize)]
pub struct TelemetryState {
    pub flight: TelemetryFlight,
    pub navigation: TelemetryNavigation,
    pub attitude: TelemetryAttitude,
    pub power: TelemetryPower,
    pub gps: TelemetryGps,
    pub terrain: TelemetryTerrain,
    pub radio: TelemetryRadio,
}

pub type TelemetrySnapshot = DomainValue<TelemetryState>;

fn number(value: &Value, key: &str) -> Option<f64> {
    value.get(key).and_then(Value::as_f64)
}

fn integer(value: &Value, key: &str) -> Option<u64> {
    value.get(key).and_then(Value::as_u64)
}

fn number_list(value: &Value, key: &str) -> Option<Vec<f64>> {
    value
        .get(key)
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(Value::as_f64).collect::<Vec<f64>>())
}

fn channel_list(value: &Value, key: &str) -> Option<Vec<Option<f64>>> {
    value
        .get(key)?
        .as_array()
        .map(|items| items.iter().map(Value::as_f64).collect())
}

pub fn telemetry_state_from_value(value: &Value) -> TelemetryState {
    TelemetryState {
        flight: TelemetryFlight {
            altitude_m: number(value, "altitude_m"),
            speed_mps: number(value, "speed_mps"),
            climb_rate_mps: number(value, "climb_rate_mps"),
            throttle_pct: number(value, "throttle_pct"),
            airspeed_mps: number(value, "airspeed_mps"),
        },
        navigation: TelemetryNavigation {
            latitude_deg: number(value, "latitude_deg"),
            longitude_deg: number(value, "longitude_deg"),
            heading_deg: number(value, "heading_deg"),
            wp_dist_m: number(value, "wp_dist_m"),
            nav_bearing_deg: number(value, "nav_bearing_deg"),
            target_bearing_deg: number(value, "target_bearing_deg"),
            xtrack_error_m: number(value, "xtrack_error_m"),
        },
        attitude: TelemetryAttitude {
            roll_deg: number(value, "roll_deg"),
            pitch_deg: number(value, "pitch_deg"),
            yaw_deg: number(value, "yaw_deg"),
        },
        power: TelemetryPower {
            battery_pct: number(value, "battery_pct"),
            battery_voltage_v: number(value, "battery_voltage_v"),
            battery_current_a: number(value, "battery_current_a"),
            battery_voltage_cells: number_list(value, "battery_voltage_cells"),
            energy_consumed_wh: number(value, "energy_consumed_wh"),
            battery_time_remaining_s: number(value, "battery_time_remaining_s"),
        },
        gps: TelemetryGps {
            fix_type: value
                .get("gps_fix_type")
                .and_then(|raw| serde_json::from_value(raw.clone()).ok()),
            satellites: integer(value, "gps_satellites"),
            hdop: number(value, "gps_hdop"),
        },
        terrain: TelemetryTerrain {
            terrain_height_m: number(value, "terrain_height_m"),
            height_above_terrain_m: number(value, "height_above_terrain_m"),
        },
        radio: TelemetryRadio {
            rc_channels: channel_list(value, "rc_channels"),
            rc_rssi: number(value, "rc_rssi"),
            servo_outputs: channel_list(value, "servo_outputs"),
        },
    }
}

pub fn telemetry_snapshot_from_value(
    value: &Value,
    provenance: DomainProvenance,
) -> TelemetrySnapshot {
    DomainValue::present(telemetry_state_from_value(value), provenance)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gps_fix_round_trips_using_the_sdk_enum() {
        let state = telemetry_state_from_value(&serde_json::json!({"gps_fix_type": "fix3d"}));
        assert_eq!(state.gps.fix_type, Some(mavkit::GpsFixType::Fix3d));
        assert_eq!(
            serde_json::to_value(state.gps).unwrap()["fix_type"],
            "fix3d"
        );
        assert_eq!(
            telemetry_state_from_value(&serde_json::json!({"gps_fix_type": "future_fix"}))
                .gps
                .fix_type,
            None
        );
    }

    #[test]
    fn radio_parser_does_not_renumber_sparse_channels() {
        let state = telemetry_state_from_value(&serde_json::json!({
            "rc_channels": [1100, null, 1900], "servo_outputs": [null, 1500]
        }));
        assert_eq!(
            state.radio.rc_channels,
            Some(vec![Some(1100.0), None, Some(1900.0)])
        );
        assert_eq!(state.radio.servo_outputs, Some(vec![None, Some(1500.0)]));
    }
}
