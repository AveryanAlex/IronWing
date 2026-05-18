use crate::ipc::{LogDiagnostic, OperationId, ReplayStatus, SessionEnvelope};

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct PlaybackSnapshot {
    pub cursor_usec: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct PlaybackSeekResult {
    pub envelope: SessionEnvelope,
    pub cursor_usec: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct PlaybackState {
    pub status: ReplayStatus,
    pub entry_id: Option<String>,
    pub operation_id: Option<OperationId>,
    pub cursor_usec: Option<u64>,
    pub start_usec: Option<u64>,
    pub end_usec: Option<u64>,
    pub duration_secs: Option<f64>,
    pub speed: f32,
    pub available_speeds: Vec<f32>,
    pub barrier_ready: bool,
    pub readonly: bool,
    pub diagnostic: Option<LogDiagnostic>,
}
