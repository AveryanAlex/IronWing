use crate::ipc::{DomainProvenance, DomainValue};

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct SupportState {
    pub can_request_prearm_checks: bool,
    pub can_calibrate_accel: bool,
    pub can_calibrate_compass: bool,
    pub can_calibrate_radio: bool,
}

pub type SupportSnapshot = DomainValue<SupportState>;

fn default_support_state() -> SupportState {
    SupportState {
        can_request_prearm_checks: true,
        can_calibrate_accel: true,
        can_calibrate_compass: true,
        can_calibrate_radio: false,
    }
}

pub fn support_snapshot(provenance: DomainProvenance) -> SupportSnapshot {
    DomainValue::present(default_support_state(), provenance)
}
