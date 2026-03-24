#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum SourceKind {
    Live,
    Playback,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct SessionEnvelope {
    pub session_id: String,
    pub source_kind: SourceKind,
    pub seek_epoch: u64,
    pub reset_revision: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum OperationId {
    OpenSessionSnapshot,
    AckSessionSnapshot,
    StartGuidedSession,
    UpdateGuidedSession,
    StopGuidedSession,
}

impl OperationId {
    #[cfg(test)]
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::OpenSessionSnapshot => "open_session_snapshot",
            Self::AckSessionSnapshot => "ack_session_snapshot",
            Self::StartGuidedSession => "start_guided_session",
            Self::UpdateGuidedSession => "update_guided_session",
            Self::StopGuidedSession => "stop_guided_session",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ReasonKind {
    Unsupported,
    Unavailable,
    Conflict,
    InvalidInput,
    Cancelled,
    Failed,
    Timeout,
    PermissionDenied,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct Reason {
    pub kind: ReasonKind,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct OperationFailure {
    pub operation_id: OperationId,
    pub reason: Reason,
}

/// Wraps a value with its session envelope for scoped IPC emission.
// contract_fixtures.rs textually includes this file; the struct is only
// constructed in runtime code, so suppress the dead_code lint for tests.
#[cfg_attr(test, allow(dead_code))]
#[derive(Debug, Clone, serde::Serialize)]
pub(crate) struct ScopedEvent<T> {
    pub envelope: SessionEnvelope,
    pub value: T,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn operation_ids_are_stable_and_reason_payloads_are_typed() {
        let failure = OperationFailure {
            operation_id: OperationId::AckSessionSnapshot,
            reason: Reason {
                kind: ReasonKind::Conflict,
                message: "snapshot barrier active".to_string(),
            },
        };

        assert_eq!(
            OperationId::OpenSessionSnapshot.as_str(),
            "open_session_snapshot"
        );
        assert_eq!(
            OperationId::AckSessionSnapshot.as_str(),
            "ack_session_snapshot"
        );
        assert_eq!(
            OperationId::StartGuidedSession.as_str(),
            "start_guided_session"
        );
        assert_eq!(
            OperationId::UpdateGuidedSession.as_str(),
            "update_guided_session"
        );
        assert_eq!(
            OperationId::StopGuidedSession.as_str(),
            "stop_guided_session"
        );

        let value = serde_json::to_value(&failure).expect("serialize operation failure");
        assert_eq!(value["operation_id"], "ack_session_snapshot");
        assert_eq!(value["reason"]["kind"], "conflict");
        assert_eq!(value["reason"]["message"], "snapshot barrier active");
    }
}
