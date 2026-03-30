mod ipc {
    pub mod calibration {
        include!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/ipc/calibration.rs"
        ));
    }
    pub mod configuration_facts {
        include!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/ipc/configuration_facts.rs"
        ));
    }
    pub mod domain {
        include!(concat!(env!("CARGO_MANIFEST_DIR"), "/src/ipc/domain.rs"));
    }
    pub mod envelope {
        include!(concat!(env!("CARGO_MANIFEST_DIR"), "/src/ipc/envelope.rs"));
    }
    pub mod guided {
        include!(concat!(env!("CARGO_MANIFEST_DIR"), "/src/ipc/guided.rs"));
    }
    pub mod playback {
        include!(concat!(env!("CARGO_MANIFEST_DIR"), "/src/ipc/playback.rs"));
    }
    pub mod sensor_health {
        include!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/ipc/sensor_health.rs"
        ));
    }
    pub mod session {
        include!(concat!(env!("CARGO_MANIFEST_DIR"), "/src/ipc/session.rs"));
    }
    pub mod status_text {
        include!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/ipc/status_text.rs"
        ));
    }
    pub mod support {
        include!(concat!(env!("CARGO_MANIFEST_DIR"), "/src/ipc/support.rs"));
    }
    pub mod telemetry {
        include!(concat!(env!("CARGO_MANIFEST_DIR"), "/src/ipc/telemetry.rs"));
    }

    pub(crate) use domain::{DomainProvenance, DomainValue};
    pub(crate) use envelope::{OperationId, Reason, ReasonKind, SessionEnvelope, SourceKind};
    pub(crate) use guided::GuidedSnapshot;
    pub(crate) use session::{OpenSessionSnapshot, SessionDomain};
    pub(crate) use status_text::StatusTextSnapshot;
    pub(crate) use support::SupportSnapshot;
    pub(crate) use telemetry::TelemetrySnapshot;
}

use std::{fmt::Debug, fs, path::PathBuf};

use mavkit::ardupilot::{MagCalProgress, MagCalReport, MagCalStatus};
use mavkit::{Param, ParamStore, ParamType, SensorHealthState, SensorHealthSummary};
use serde::{Serialize, de::DeserializeOwned};
use serde_json::Value;

fn fixture_path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../tests/contracts")
        .join(name)
}

fn load_fixture(name: &str) -> Value {
    let path = fixture_path(name);
    let text = fs::read_to_string(&path)
        .unwrap_or_else(|error| panic!("failed to read fixture {}: {error}", path.display()));
    serde_json::from_str(&text)
        .unwrap_or_else(|error| panic!("failed to parse fixture {}: {error}", path.display()))
}

fn assert_round_trip<T>(name: &str)
where
    T: Debug + PartialEq + Serialize + DeserializeOwned,
{
    let expected = load_fixture(name);
    let parsed: T = serde_json::from_value(expected.clone())
        .unwrap_or_else(|error| panic!("failed to deserialize fixture {name}: {error}"));
    let actual = serde_json::to_value(&parsed)
        .unwrap_or_else(|error| panic!("failed to serialize fixture {name}: {error}"));
    assert_eq!(
        actual, expected,
        "fixture {name} drifted from Rust contract"
    );
}

#[test]
fn contract_fixtures_round_trip_through_rust_contract_types() {
    assert_round_trip::<ipc::configuration_facts::ConfigurationFactsSnapshot>(
        "configuration_facts.domain.json",
    );
    assert_round_trip::<ipc::sensor_health::SensorHealthSnapshot>("sensor_health.domain.json");
    assert_round_trip::<ipc::calibration::CalibrationSnapshot>("calibration.domain.json");
    assert_round_trip::<ipc::GuidedSnapshot>("guided.domain.json");
    assert_round_trip::<ipc::SessionDomain>("session.domain.json");
    assert_round_trip::<ipc::TelemetrySnapshot>("telemetry.domain.json");
    assert_round_trip::<ipc::SupportSnapshot>("support.domain.json");
    assert_round_trip::<ipc::StatusTextSnapshot>("status_text.domain.json");
    assert_round_trip::<ipc::OpenSessionSnapshot>("open_session.live.json");
    assert_round_trip::<ipc::OpenSessionSnapshot>("open_session.playback.json");
    assert_round_trip::<mavkit::mission::MissionPlan>("mission.plan.json");
    assert_round_trip::<mavkit::fence::FencePlan>("fence.plan.json");
    assert_round_trip::<mavkit::rally::RallyPlan>("rally.plan.json");
}

#[test]
fn constructor_outputs_match_canonical_grouped_domain_fixtures() {
    let mut params = std::collections::HashMap::new();
    params.insert(
        "FRAME_CLASS".to_string(),
        Param {
            name: "FRAME_CLASS".to_string(),
            value: 1.0,
            param_type: ParamType::Real32,
            index: 0,
        },
    );
    params.insert(
        "GPS1_TYPE".to_string(),
        Param {
            name: "GPS1_TYPE".to_string(),
            value: 2.0,
            param_type: ParamType::Real32,
            index: 1,
        },
    );
    params.insert(
        "BATT_MONITOR".to_string(),
        Param {
            name: "BATT_MONITOR".to_string(),
            value: 4.0,
            param_type: ParamType::Real32,
            index: 2,
        },
    );

    let configuration_facts =
        ipc::configuration_facts::configuration_facts_snapshot_from_param_store(
            &ParamStore {
                params,
                expected_count: 3,
            },
            ipc::DomainProvenance::Bootstrap,
        );
    let sensor_health = ipc::sensor_health::sensor_health_snapshot_from_summary(
        &SensorHealthSummary {
            gyro: SensorHealthState::Healthy,
            accel: SensorHealthState::NotPresent,
            mag: SensorHealthState::NotPresent,
            baro: SensorHealthState::NotPresent,
            gps: SensorHealthState::NotPresent,
            airspeed: SensorHealthState::NotPresent,
            rc_receiver: SensorHealthState::NotPresent,
            battery: SensorHealthState::NotPresent,
            terrain: SensorHealthState::NotPresent,
            geofence: SensorHealthState::NotPresent,
        },
        ipc::DomainProvenance::Stream,
    );
    let calibration = ipc::calibration::calibration_snapshot_from_sources(
        Some(&MagCalProgress {
            compass_id: 1,
            completion_pct: 42,
            status: MagCalStatus::RunningStepOne,
            attempt: 1,
        }),
        Some(&MagCalReport {
            compass_id: 1,
            status: MagCalStatus::Failed,
            fitness: 12.0,
            ofs_x: 1.0,
            ofs_y: 2.0,
            ofs_z: 3.0,
            autosaved: false,
        }),
        ipc::DomainProvenance::Stream,
    );

    assert_eq!(
        serde_json::to_value(configuration_facts).expect("serialize configuration facts"),
        load_fixture("configuration_facts.domain.json")
    );
    assert_eq!(
        serde_json::to_value(sensor_health).expect("serialize sensor health"),
        load_fixture("sensor_health.domain.json")
    );
    assert_eq!(
        serde_json::to_value(calibration).expect("serialize calibration"),
        load_fixture("calibration.domain.json")
    );
}
