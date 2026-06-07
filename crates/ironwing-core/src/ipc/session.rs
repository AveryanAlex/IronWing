use mavkit::mission::MissionState;
use mavkit::{
    AutopilotType, HomePosition, LinkState, ParamOperationProgress, ParamStore, SystemStatus,
    VehicleType,
};

use crate::ipc::calibration::CalibrationSnapshot;
use crate::ipc::guided::GuidedSnapshot;
use crate::ipc::sensor_health::SensorHealthSnapshot;
use crate::ipc::{
    SessionEnvelope, domain::DomainValue, envelope::OperationFailure, playback::PlaybackSnapshot,
    status_text::StatusTextSnapshot, support::SupportSnapshot, telemetry::TelemetrySnapshot,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Pending,
    Active,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SessionConnection {
    Connecting,
    Connected,
    Disconnected,
    Error { error: String },
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct VehicleState {
    pub armed: bool,
    pub custom_mode: u32,
    pub mode_name: String,
    pub system_status: SystemStatus,
    pub vehicle_type: VehicleType,
    pub autopilot: AutopilotType,
    pub firmware_version: Option<String>,
    pub system_id: u8,
    pub component_id: u8,
    pub heartbeat_received: bool,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct SessionSnapshot {
    pub status: SessionStatus,
    pub connection: SessionConnection,
    pub vehicle_state: Option<VehicleState>,
    pub home_position: Option<HomePosition>,
}

pub type SessionDomain = DomainValue<SessionSnapshot>;

#[allow(dead_code)]
pub fn session_connection_from_link_state(link_state: &LinkState) -> SessionConnection {
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
pub struct OpenSessionSnapshot {
    pub envelope: SessionEnvelope,
    pub session: SessionDomain,
    pub telemetry: TelemetrySnapshot,
    pub mission_state: Option<MissionState>,
    pub param_store: Option<ParamStore>,
    pub param_progress: Option<ParamOperationProgress>,
    pub support: SupportSnapshot,
    pub sensor_health: SensorHealthSnapshot,
    pub calibration: CalibrationSnapshot,
    pub guided: GuidedSnapshot,
    pub status_text: StatusTextSnapshot,
    pub playback: PlaybackSnapshot,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "result", rename_all = "snake_case")]
pub enum AckSessionSnapshotResult {
    Accepted { envelope: SessionEnvelope },
    Rejected { failure: OperationFailure },
}
