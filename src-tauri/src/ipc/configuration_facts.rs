use mavkit::ParamStore;

use crate::ipc::{DomainProvenance, DomainValue};

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct ConfigurationFlag {
    pub configured: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct ConfigurationFactsState {
    pub frame: Option<ConfigurationFlag>,
    pub gps: Option<ConfigurationFlag>,
    pub battery_monitor: Option<ConfigurationFlag>,
    pub motors_esc: Option<ConfigurationFlag>,
}

pub(crate) type ConfigurationFactsSnapshot = DomainValue<ConfigurationFactsState>;

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

pub(crate) fn configuration_facts_state_from_param_store(
    store: &ParamStore,
) -> ConfigurationFactsState {
    ConfigurationFactsState {
        frame: known_flag(param_value(store, "FRAME_CLASS")),
        gps: gps_flag(store),
        battery_monitor: known_flag(param_value(store, "BATT_MONITOR")),
        // Placeholder until we expose explicit motor-output assignment facts.
        motors_esc: None,
    }
}

fn configuration_facts_complete(facts: &ConfigurationFactsState) -> bool {
    facts.frame.is_some()
        && facts.gps.is_some()
        && facts.battery_monitor.is_some()
        && facts.motors_esc.is_some()
}

pub(crate) fn configuration_facts_snapshot_from_param_store(
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

#[cfg(test)]
mod tests {
    use super::*;
    use mavkit::{Param, ParamType};

    fn param(name: &str, value: f32, index: u16) -> Param {
        Param {
            name: name.to_string(),
            value,
            param_type: ParamType::Real32,
            index,
        }
    }

    #[test]
    fn configuration_facts_group_setup_relevant_param_interpretation() {
        let snapshot = configuration_facts_snapshot_from_param_store(
            &ParamStore {
                params: [
                    ("FRAME_CLASS".to_string(), param("FRAME_CLASS", 1.0, 0)),
                    ("GPS1_TYPE".to_string(), param("GPS1_TYPE", 2.0, 1)),
                    ("BATT_MONITOR".to_string(), param("BATT_MONITOR", 4.0, 2)),
                ]
                .into_iter()
                .collect(),
                expected_count: 3,
            },
            DomainProvenance::Bootstrap,
        );
        let facts = snapshot.value.expect("facts");

        assert!(
            !snapshot.complete,
            "derived setup facts with unknown sections must remain partial"
        );
        assert_eq!(facts.frame, Some(ConfigurationFlag { configured: true }));
        assert_eq!(facts.gps, Some(ConfigurationFlag { configured: true }));
        assert_eq!(
            facts.battery_monitor,
            Some(ConfigurationFlag { configured: true })
        );
        assert_eq!(facts.motors_esc, None);
    }

    #[test]
    fn configuration_facts_leave_unknown_sections_null_when_params_are_missing() {
        let snapshot = configuration_facts_snapshot_from_param_store(
            &ParamStore::default(),
            DomainProvenance::Stream,
        );
        let facts = snapshot.value.expect("facts");

        assert!(
            !snapshot.complete,
            "missing params cannot produce complete facts"
        );
        assert_eq!(facts.frame, None);
        assert_eq!(facts.gps, None);
        assert_eq!(facts.battery_monitor, None);
        assert_eq!(facts.motors_esc, None);
    }

    #[test]
    fn configuration_facts_do_not_fabricate_complete_truth_for_unknown_sections() {
        let snapshot = configuration_facts_snapshot_from_param_store(
            &ParamStore {
                params: [
                    ("FRAME_CLASS".to_string(), param("FRAME_CLASS", 1.0, 0)),
                    ("GPS1_TYPE".to_string(), param("GPS1_TYPE", 2.0, 1)),
                    ("BATT_MONITOR".to_string(), param("BATT_MONITOR", 4.0, 2)),
                ]
                .into_iter()
                .collect(),
                expected_count: 3,
            },
            DomainProvenance::Bootstrap,
        );

        assert!(
            !snapshot.complete,
            "partial facts should not claim complete truth"
        );
        let facts = snapshot.value.expect("facts");
        assert_eq!(facts.frame, Some(ConfigurationFlag { configured: true }));
        assert_eq!(facts.gps, Some(ConfigurationFlag { configured: true }));
        assert_eq!(
            facts.battery_monitor,
            Some(ConfigurationFlag { configured: true })
        );
        assert_eq!(facts.motors_esc, None);
    }
}
