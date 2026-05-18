use mavkit::SensorHealthSummary;

use crate::ipc::{DomainProvenance, DomainValue};

pub type SensorHealthSnapshot = DomainValue<SensorHealthSummary>;

#[allow(dead_code)]
pub fn sensor_health_snapshot_from_summary(
    summary: &SensorHealthSummary,
    provenance: DomainProvenance,
) -> SensorHealthSnapshot {
    DomainValue::present(summary.clone(), provenance)
}
