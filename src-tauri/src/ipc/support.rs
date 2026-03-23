use crate::ipc::{DomainProvenance, DomainValue};

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct SupportState {
    pub can_request_prearm_checks: bool,
    pub can_calibrate_accel: bool,
    pub can_calibrate_compass: bool,
    pub can_calibrate_radio: bool,
}

pub(crate) type SupportSnapshot = DomainValue<SupportState>;

fn default_support_state() -> SupportState {
    SupportState {
        can_request_prearm_checks: true,
        can_calibrate_accel: true,
        can_calibrate_compass: true,
        can_calibrate_radio: false,
    }
}

/// Stub kept for call-sites that still reference the old signature.
/// The old `SensorHealth` type is no longer accessible from the public mavkit
/// API. Support capabilities are currently static.
pub(crate) fn support_snapshot_from_sensor_health(
    _sensor_health: &serde_json::Value,
    provenance: DomainProvenance,
) -> SupportSnapshot {
    DomainValue::present(default_support_state(), provenance)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn support_snapshot_exposes_static_capabilities() {
        let snapshot = support_snapshot_from_sensor_health(
            &serde_json::Value::Null,
            DomainProvenance::Stream,
        );
        let value = serde_json::to_value(snapshot).expect("serialize support snapshot");

        assert_eq!(value["value"]["can_request_prearm_checks"], true);
        assert_eq!(value["value"]["can_calibrate_accel"], true);
        assert_eq!(value["value"]["can_calibrate_compass"], true);
        assert_eq!(value["value"]["can_calibrate_radio"], false);
    }
}
