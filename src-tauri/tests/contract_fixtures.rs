use std::{fmt::Debug, fs, path::PathBuf};

use ironwing_core::ipc;
use mavkit::ardupilot::{MagCalProgress, MagCalReport, MagCalStatus};
use mavkit::{SensorHealthState, SensorHealthSummary};
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
    assert_round_trip::<ipc::sensor_health::SensorHealthSnapshot>("sensor_health.domain.json");
    assert_round_trip::<ipc::calibration::CalibrationSnapshot>("calibration.domain.json");
    assert_round_trip::<ipc::GuidedSnapshot>("guided.domain.json");
    assert_round_trip::<ipc::DomainValue<ipc::session::SessionSnapshot>>("session.domain.json");
    assert_round_trip::<ipc::TelemetrySnapshot>("telemetry.domain.json");
    assert_round_trip::<ipc::SupportSnapshot>("support.domain.json");
    assert_round_trip::<ipc::StatusTextSnapshot>("status_text.domain.json");
    assert_round_trip::<ipc::OpenSessionSnapshot>("open_session.live.json");
    assert_round_trip::<ipc::OpenSessionSnapshot>("open_session.playback.json");
    assert_round_trip::<mavkit::mission::MissionPlan>("mission.plan.json");
    assert_round_trip::<mavkit::fence::FencePlan>("fence.plan.json");
    assert_round_trip::<mavkit::rally::RallyPlan>("rally.plan.json");
    assert_round_trip::<Vec<ipc::logs::LogFormatAdapter>>("log_format_adapters.json");
    assert_round_trip::<ipc::logs::LogLibraryCatalog>("log_library.catalog.v1.json");
    assert_round_trip::<ipc::logs::LogCatalogMigrationError>("log_catalog.migration_error.json");
    assert_round_trip::<ipc::logs::LogOperationProgress>("log_library.progress.json");
    assert_round_trip::<ipc::logs::ReplayState>("replay.state.json");
    assert_round_trip::<ipc::logs::RawMessageQuery>("log_raw_messages.query.json");
    assert_round_trip::<ipc::logs::RawMessagePage>("log_raw_messages.page.json");
    assert_round_trip::<ipc::logs::ChartSeriesRequest>("log_chart_series.request.json");
    assert_round_trip::<ipc::logs::ChartSeriesPage>("log_chart_series.page.json");
    assert_round_trip::<ipc::logs::LogExportRequest>("log_export.request.json");
    assert_round_trip::<ipc::logs::LogExportResult>("log_export.result.json");
    assert_round_trip::<ipc::logs::RecordingStartRequest>("recording.start_request.json");
    assert_round_trip::<ipc::logs::RecordingSettings>("recording.settings.json");
    assert_round_trip::<ipc::logs::RecordingSettingsResult>("recording.settings_result.json");
    assert_round_trip::<ipc::logs::RecordingFailure>("recording.failure.json");
    assert_round_trip::<ipc::logs::RecordingStatus>("recording.status.json");
}

#[test]
fn contract_fixtures_unsupported_catalog_schema_version_returns_structured_error() {
    let mut value = load_fixture("log_library.catalog.v1.json");
    value["schema_version"] = Value::from(999);

    let error = ipc::logs::migrate_log_library_catalog(value)
        .expect_err("schema version 999 should be rejected");
    assert_eq!(
        error,
        ipc::logs::LogCatalogMigrationError::UnsupportedSchemaVersion {
            schema_version: 999,
            supported_schema_version: ipc::logs::LOG_LIBRARY_CATALOG_SCHEMA_VERSION,
        }
    );
}

#[test]
fn constructor_outputs_match_canonical_grouped_domain_fixtures() {
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
        serde_json::to_value(sensor_health).expect("serialize sensor health"),
        load_fixture("sensor_health.domain.json")
    );
    assert_eq!(
        serde_json::to_value(calibration).expect("serialize calibration"),
        load_fixture("calibration.domain.json")
    );
}
