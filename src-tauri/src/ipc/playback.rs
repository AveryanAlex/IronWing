use crate::ipc::SessionEnvelope;

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
    pub cursor_usec: Option<u64>,
    pub barrier_ready: bool,
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
            cursor_usec: Some(456),
            barrier_ready: true,
        })
        .expect("serialize playback state");

        assert_eq!(value["cursor_usec"], 456);
        assert_eq!(value["barrier_ready"], true);
    }
}
