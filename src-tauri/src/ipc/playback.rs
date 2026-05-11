use crate::ipc::{LogDiagnostic, OperationId, ReplayStatus, SessionEnvelope};

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct PlaybackSnapshot {
    pub cursor_usec: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct PlaybackSeekResult {
    pub envelope: SessionEnvelope,
    pub cursor_usec: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct PlaybackState {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ipc::SourceKind;

    #[test]
    fn playback_seek_result_serializes_envelope_and_cursor() {
        let value = serde_json::to_value(PlaybackSeekResult {
            envelope: SessionEnvelope {
                session_id: "session-1".into(),
                source_kind: SourceKind::Playback,
                seek_epoch: 4,
                reset_revision: 2,
            },
            cursor_usec: Some(123),
        })
        .expect("serialize seek result");

        assert_eq!(value["envelope"]["source_kind"], "playback");
        assert_eq!(value["envelope"]["seek_epoch"], 4);
        assert_eq!(value["cursor_usec"], 123);
    }

    #[test]
    fn playback_state_serializes_barrier_readiness() {
        let value = serde_json::to_value(PlaybackState {
            status: ReplayStatus::Seeking,
            entry_id: Some("log-1".into()),
            operation_id: Some(OperationId::ReplaySeek),
            cursor_usec: Some(456),
            start_usec: Some(100),
            end_usec: Some(900),
            duration_secs: Some(0.0008),
            speed: 1.0,
            available_speeds: vec![0.5, 1.0, 2.0, 4.0, 8.0, 16.0],
            barrier_ready: true,
            readonly: true,
            diagnostic: None,
        })
        .expect("serialize playback state");

        assert_eq!(value["status"], "seeking");
        assert_eq!(value["operation_id"], "replay_seek");
        assert_eq!(value["cursor_usec"], 456);
        assert_eq!(value["barrier_ready"], true);
        assert_eq!(value["readonly"], true);
    }

    #[test]
    fn playback_state_serializes_idle_after_stop() {
        let value = serde_json::to_value(PlaybackState {
            status: ReplayStatus::Idle,
            entry_id: None,
            operation_id: None,
            cursor_usec: None,
            start_usec: None,
            end_usec: None,
            duration_secs: None,
            speed: 1.0,
            available_speeds: vec![0.5, 1.0, 2.0, 4.0, 8.0, 16.0],
            barrier_ready: false,
            readonly: true,
            diagnostic: None,
        })
        .expect("serialize playback state");

        assert_eq!(value["status"], "idle");
        assert_eq!(value["operation_id"], serde_json::Value::Null);
        assert_eq!(value["cursor_usec"], serde_json::Value::Null);
        assert_eq!(value["barrier_ready"], false);
    }
}
