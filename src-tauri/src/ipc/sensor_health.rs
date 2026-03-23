use mavkit::SensorHealthSummary;
#[cfg(test)]
use mavkit::SensorHealthState;

use crate::ipc::{DomainProvenance, DomainValue};

pub(crate) type SensorHealthSnapshot = DomainValue<SensorHealthSummary>;

/// Build a sensor health snapshot from the new mavkit `SensorHealthSummary` type.
#[allow(dead_code)] // Used by bridges and bootstrap paths; some test targets don't include those.
pub(crate) fn sensor_health_snapshot_from_summary(
    summary: &SensorHealthSummary,
    provenance: DomainProvenance,
) -> SensorHealthSnapshot {
    DomainValue::present(summary.clone(), provenance)
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sensor_health_summary_serializes_with_expected_fields() {
        let summary = SensorHealthSummary {
            gyro: SensorHealthState::Healthy,
            accel: SensorHealthState::Unhealthy,
            mag: SensorHealthState::Disabled,
            baro: SensorHealthState::NotPresent,
            gps: SensorHealthState::Healthy,
            airspeed: SensorHealthState::Disabled,
            rc_receiver: SensorHealthState::Healthy,
            battery: SensorHealthState::Healthy,
            terrain: SensorHealthState::NotPresent,
            geofence: SensorHealthState::Unhealthy,
        };
        let snapshot =
            sensor_health_snapshot_from_summary(&summary, DomainProvenance::Stream);

        let value = serde_json::to_value(snapshot).expect("serialize");
        assert_eq!(value["value"]["gyro"], "healthy");
        assert_eq!(value["value"]["gps"], "healthy");
        assert_eq!(value["value"]["accel"], "unhealthy");
    }
}
