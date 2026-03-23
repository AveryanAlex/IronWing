use mavkit::{HomePosition, LinkState, ParamOperationProgress, ParamStore};
use mavkit::mission::MissionState;

use crate::ipc::calibration::CalibrationSnapshot;
use crate::ipc::configuration_facts::ConfigurationFactsSnapshot;
use crate::ipc::guided::GuidedSnapshot;
use crate::ipc::sensor_health::SensorHealthSnapshot;
use crate::ipc::{
    SessionEnvelope, domain::DomainValue, envelope::OperationFailure, playback::PlaybackSnapshot,
    status_text::StatusTextSnapshot, support::SupportSnapshot, telemetry::TelemetrySnapshot,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum SessionStatus {
    Pending,
    Active,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(crate) enum SessionConnection {
    Connecting,
    Connected,
    Disconnected,
    Error { error: String },
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct SessionSnapshot {
    pub status: SessionStatus,
    pub connection: SessionConnection,
    /// Vehicle state is no longer directly accessible in the new mavkit API.
    /// This field is kept for frontend contract compatibility but always None
    /// until the observation-based replacement is wired.
    pub vehicle_state: Option<serde_json::Value>,
    pub home_position: Option<HomePosition>,
}

pub(crate) type SessionDomain = DomainValue<SessionSnapshot>;

#[allow(dead_code)] // Used by the live command/bootstrap path; contract-fixture test target includes this module without commands.rs.
pub(crate) fn session_connection_from_link_state(link_state: &LinkState) -> SessionConnection {
    match link_state {
        LinkState::Connecting => SessionConnection::Connecting,
        LinkState::Connected => SessionConnection::Connected,
        LinkState::Disconnected => SessionConnection::Disconnected,
        LinkState::Error(error) => SessionConnection::Error {
            error: error.clone(),
        },
    }
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct OpenSessionSnapshot {
    pub envelope: SessionEnvelope,
    pub session: SessionDomain,
    pub telemetry: TelemetrySnapshot,
    pub mission_state: Option<MissionState>,
    pub param_store: Option<ParamStore>,
    pub param_progress: Option<ParamOperationProgress>,
    pub support: SupportSnapshot,
    pub sensor_health: SensorHealthSnapshot,
    pub configuration_facts: ConfigurationFactsSnapshot,
    pub calibration: CalibrationSnapshot,
    pub guided: GuidedSnapshot,
    pub status_text: StatusTextSnapshot,
    pub playback: PlaybackSnapshot,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "result", rename_all = "snake_case")]
pub(crate) enum AckSessionSnapshotResult {
    Accepted { envelope: SessionEnvelope },
    Rejected { failure: OperationFailure },
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ipc::{DomainProvenance, OperationId, Reason, ReasonKind};

    #[test]
    fn session_status_serializes_with_snake_case_values() {
        let value = serde_json::to_value(SessionStatus::Pending).expect("serialize status");
        assert_eq!(value, "pending");
    }

    #[test]
    fn ack_result_rejected_carries_typed_reason_payload() {
        let value = serde_json::to_value(AckSessionSnapshotResult::Rejected {
            failure: OperationFailure {
                operation_id: OperationId::AckSessionSnapshot,
                reason: Reason {
                    kind: ReasonKind::Conflict,
                    message: "session snapshot mismatch".to_string(),
                },
            },
        })
        .expect("serialize ack result");

        assert_eq!(value["result"], "rejected");
        assert_eq!(value["failure"]["operation_id"], "ack_session_snapshot");
        assert_eq!(value["failure"]["reason"]["kind"], "conflict");
    }

    #[test]
    fn open_session_snapshot_serializes_hydrated_contract_fields() {
        let value = serde_json::to_value(OpenSessionSnapshot {
            envelope: SessionEnvelope {
                session_id: "session-1".into(),
                source_kind: crate::ipc::SourceKind::Live,
                seek_epoch: 0,
                reset_revision: 0,
            },
            session: DomainValue::present(
                SessionSnapshot {
                    status: SessionStatus::Active,
                    connection: SessionConnection::Connected,
                    vehicle_state: None,
                    home_position: None,
                },
                DomainProvenance::Bootstrap,
            ),
            telemetry: DomainValue::missing(DomainProvenance::Bootstrap),
            mission_state: None,
            param_store: None,
            param_progress: None,
            support: DomainValue::missing(DomainProvenance::Bootstrap),
            sensor_health: DomainValue::missing(DomainProvenance::Bootstrap),
            configuration_facts: DomainValue::missing(DomainProvenance::Bootstrap),
            calibration: DomainValue::missing(DomainProvenance::Bootstrap),
            guided: DomainValue::missing(DomainProvenance::Bootstrap),
            status_text: DomainValue::missing(DomainProvenance::Bootstrap),
            playback: PlaybackSnapshot { cursor_usec: None },
        })
        .expect("serialize snapshot");

        assert!(value["session"]["value"].get("connection").is_some());
        assert!(value.get("mission_state").is_some());
        assert!(value.get("param_store").is_some());
        assert!(value.get("param_progress").is_some());
        assert!(value.get("support").is_some());
        assert!(value.get("sensor_health").is_some());
        assert!(value.get("configuration_facts").is_some());
        assert!(value.get("calibration").is_some());
        assert!(value.get("guided").is_some());
        assert!(value.get("status_text").is_some());
        assert!(value["telemetry"].get("value").is_some());
    }
}
