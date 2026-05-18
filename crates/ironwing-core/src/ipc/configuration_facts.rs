use mavkit::ParamStore;

use crate::ipc::{DomainProvenance, DomainValue};

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ConfigurationFlag {
    pub configured: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ConfigurationFactsState {
    pub frame: Option<ConfigurationFlag>,
    pub gps: Option<ConfigurationFlag>,
    pub battery_monitor: Option<ConfigurationFlag>,
    pub motors_esc: Option<ConfigurationFlag>,
}

pub type ConfigurationFactsSnapshot = DomainValue<ConfigurationFactsState>;

fn param_value(store: &ParamStore, name: &str) -> Option<f32> {
    store.params.get(name).map(|param| param.value)
}

fn known_flag(value: Option<f32>) -> Option<ConfigurationFlag> {
    value.map(|value| ConfigurationFlag {
        configured: value > 0.0,
    })
}

fn gps_flag(store: &ParamStore) -> Option<ConfigurationFlag> {
    let gps1_type = param_value(store, "GPS1_TYPE");
    let gps_type = param_value(store, "GPS_TYPE");

    match (gps1_type, gps_type) {
        (Some(primary), _) if primary > 0.0 => Some(ConfigurationFlag { configured: true }),
        (_, Some(legacy)) if legacy > 0.0 => Some(ConfigurationFlag { configured: true }),
        (Some(_), Some(_)) | (Some(_), None) | (None, Some(_)) => {
            Some(ConfigurationFlag { configured: false })
        }
        (None, None) => None,
    }
}

pub fn configuration_facts_state_from_param_store(store: &ParamStore) -> ConfigurationFactsState {
    ConfigurationFactsState {
        frame: known_flag(param_value(store, "FRAME_CLASS")),
        gps: gps_flag(store),
        battery_monitor: known_flag(param_value(store, "BATT_MONITOR")),
        motors_esc: None,
    }
}

fn configuration_facts_complete(facts: &ConfigurationFactsState) -> bool {
    facts.frame.is_some()
        && facts.gps.is_some()
        && facts.battery_monitor.is_some()
        && facts.motors_esc.is_some()
}

pub fn configuration_facts_snapshot_from_param_store(
    store: &ParamStore,
    provenance: DomainProvenance,
) -> ConfigurationFactsSnapshot {
    let facts = configuration_facts_state_from_param_store(store);

    DomainValue {
        available: true,
        complete: configuration_facts_complete(&facts),
        provenance,
        value: Some(facts),
    }
}
