use serde_json::Value;

use crate::ipc::{DomainProvenance, DomainValue};

#[derive(Debug, Clone, PartialEq, Default, serde::Serialize, serde::Deserialize)]
pub(crate) struct TelemetryFlight {
    pub altitude_m: Option<f64>,
    pub speed_mps: Option<f64>,
    pub climb_rate_mps: Option<f64>,
    pub throttle_pct: Option<f64>,
    pub airspeed_mps: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Default, serde::Serialize, serde::Deserialize)]
pub(crate) struct TelemetryNavigation {
    pub latitude_deg: Option<f64>,
    pub longitude_deg: Option<f64>,
    pub heading_deg: Option<f64>,
    pub wp_dist_m: Option<f64>,
    pub nav_bearing_deg: Option<f64>,
    pub target_bearing_deg: Option<f64>,
    pub xtrack_error_m: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Default, serde::Serialize, serde::Deserialize)]
pub(crate) struct TelemetryAttitude {
    pub roll_deg: Option<f64>,
    pub pitch_deg: Option<f64>,
    pub yaw_deg: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Default, serde::Serialize, serde::Deserialize)]
pub(crate) struct TelemetryPower {
    pub battery_pct: Option<f64>,
    pub battery_voltage_v: Option<f64>,
    pub battery_current_a: Option<f64>,
    pub battery_voltage_cells: Option<Vec<f64>>,
    pub energy_consumed_wh: Option<f64>,
    pub battery_time_remaining_s: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Default, serde::Serialize, serde::Deserialize)]
pub(crate) struct TelemetryGps {
    pub fix_type: Option<String>,
    pub satellites: Option<u64>,
    pub hdop: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Default, serde::Serialize, serde::Deserialize)]
pub(crate) struct TelemetryTerrain {
    pub terrain_height_m: Option<f64>,
    pub height_above_terrain_m: Option<f64>,
}

#[derive(Debug, Clone, PartialEq, Default, serde::Serialize, serde::Deserialize)]
pub(crate) struct TelemetryRadio {
    pub rc_channels: Option<Vec<f64>>,
    pub rc_rssi: Option<f64>,
    pub servo_outputs: Option<Vec<f64>>,
}

#[derive(Debug, Clone, PartialEq, Default, serde::Serialize, serde::Deserialize)]
pub(crate) struct TelemetryState {
    pub flight: TelemetryFlight,
    pub navigation: TelemetryNavigation,
    pub attitude: TelemetryAttitude,
    pub power: TelemetryPower,
    pub gps: TelemetryGps,
    pub terrain: TelemetryTerrain,
    pub radio: TelemetryRadio,
}

pub(crate) type TelemetrySnapshot = DomainValue<TelemetryState>;

fn number(value: &Value, key: &str) -> Option<f64> {
    value.get(key).and_then(Value::as_f64)
}

fn integer(value: &Value, key: &str) -> Option<u64> {
    value.get(key).and_then(Value::as_u64)
}

fn string(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
}

fn number_list(value: &Value, key: &str) -> Option<Vec<f64>> {
    value
        .get(key)
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(Value::as_f64).collect::<Vec<f64>>())
}

pub(crate) fn telemetry_state_from_value(value: &Value) -> TelemetryState {
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
            fix_type: string(value, "gps_fix_type"),
            satellites: integer(value, "gps_satellites"),
            hdop: number(value, "gps_hdop"),
        },
        terrain: TelemetryTerrain {
            terrain_height_m: number(value, "terrain_height_m"),
            height_above_terrain_m: number(value, "height_above_terrain_m"),
        },
        radio: TelemetryRadio {
            rc_channels: number_list(value, "rc_channels"),
            rc_rssi: number(value, "rc_rssi"),
            servo_outputs: number_list(value, "servo_outputs"),
        },
    }
}

pub(crate) fn telemetry_snapshot_from_value(
    value: &Value,
    provenance: DomainProvenance,
) -> TelemetrySnapshot {
    DomainValue::present(telemetry_state_from_value(value), provenance)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn telemetry_snapshot_groups_flat_fields_into_subdomains() {
        let value = serde_json::json!({
            "altitude_m": 12.5,
            "speed_mps": 7.0,
            "latitude_deg": 47.3,
            "longitude_deg": 8.5,
            "gps_fix_type": "fix_3d",
            "battery_pct": 88.0,
            "rc_channels": [1100.0, 1500.0]
        });

        let snapshot = telemetry_snapshot_from_value(&value, DomainProvenance::Bootstrap);

        assert_eq!(
            snapshot.value.as_ref().and_then(|it| it.flight.altitude_m),
            Some(12.5)
        );
        assert_eq!(
            snapshot
                .value
                .as_ref()
                .and_then(|it| it.navigation.latitude_deg),
            Some(47.3)
        );
        assert_eq!(
            snapshot
                .value
                .as_ref()
                .and_then(|it| it.gps.fix_type.as_deref()),
            Some("fix_3d")
        );
        assert_eq!(
            snapshot
                .value
                .as_ref()
                .and_then(|it| it.radio.rc_channels.clone()),
            Some(vec![1100.0, 1500.0])
        );
    }
}
