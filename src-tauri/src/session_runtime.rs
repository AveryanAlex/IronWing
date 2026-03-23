use std::time::{Duration, Instant};

use crate::ipc::{
    AckSessionSnapshotResult, OpenSessionSnapshot, OperationFailure, PlaybackSnapshot, Reason,
    ReasonKind, SessionEnvelope, SessionSnapshot, SessionStatus, SourceKind,
};

#[derive(Debug, Clone)]
struct PendingSession {
    snapshot: OpenSessionSnapshot,
    opened_at: Instant,
}

#[derive(Debug)]
pub(crate) struct SessionRuntime {
    live_active: Option<SessionEnvelope>,
    playback_active: Option<SessionEnvelope>,
    pending_live: Option<PendingSession>,
    pending_playback: Option<PendingSession>,
    pending_ttl: Duration,
    next_seek_epoch: u64,
    next_session_nonce: u64,
    reset_revision: u64,
    last_source_kind: Option<SourceKind>,
}

impl SessionRuntime {
    pub(crate) const DEFAULT_PENDING_SESSION_TTL: Duration = Duration::from_secs(2);

    pub(crate) fn new() -> Self {
        Self::with_pending_ttl(Self::DEFAULT_PENDING_SESSION_TTL)
    }

    pub(crate) fn with_pending_ttl(pending_ttl: Duration) -> Self {
        Self {
            live_active: None,
            playback_active: None,
            pending_live: None,
            pending_playback: None,
            pending_ttl,
            next_seek_epoch: 0,
            next_session_nonce: 1,
            reset_revision: 0,
            last_source_kind: None,
        }
    }

    pub(crate) fn open_session_snapshot(&mut self, source_kind: SourceKind) -> OpenSessionSnapshot {
        if self
            .last_source_kind
            .is_some_and(|kind| kind != source_kind)
        {
            self.reset_revision = self.reset_revision.saturating_add(1);
        }

        let envelope = SessionEnvelope {
            session_id: format!("session-{}", self.next_session_nonce),
            source_kind,
            seek_epoch: self.next_seek_epoch,
            reset_revision: self.reset_revision,
        };

        self.next_seek_epoch = self.next_seek_epoch.saturating_add(1);
        self.next_session_nonce = self.next_session_nonce.saturating_add(1);
        self.last_source_kind = Some(source_kind);

        let snapshot = OpenSessionSnapshot {
            envelope,
            session: crate::ipc::DomainValue::<SessionSnapshot>::present(
                SessionSnapshot {
                    status: SessionStatus::Pending,
                    connection: crate::ipc::SessionConnection::Disconnected,
                    vehicle_state: None,
                    home_position: None,
                },
                crate::ipc::DomainProvenance::Bootstrap,
            ),
            telemetry: crate::ipc::DomainValue::missing(crate::ipc::DomainProvenance::Bootstrap),
            mission_state: None,
            param_store: None,
            param_progress: None,
            support: crate::ipc::DomainValue::missing(crate::ipc::DomainProvenance::Bootstrap),
            sensor_health: crate::ipc::DomainValue::missing(
                crate::ipc::DomainProvenance::Bootstrap,
            ),
            configuration_facts: crate::ipc::DomainValue::missing(
                crate::ipc::DomainProvenance::Bootstrap,
            ),
            calibration: crate::ipc::DomainValue::missing(crate::ipc::DomainProvenance::Bootstrap),
            guided: crate::ipc::DomainValue::missing(crate::ipc::DomainProvenance::Bootstrap),
            status_text: crate::ipc::DomainValue::missing(crate::ipc::DomainProvenance::Bootstrap),
            playback: PlaybackSnapshot { cursor_usec: None },
        };

        self.pending_slot_mut(source_kind).replace(PendingSession {
            snapshot: snapshot.clone(),
            opened_at: Instant::now(),
        });

        snapshot
    }

    pub(crate) fn ack_session_snapshot(
        &mut self,
        session_id: &str,
        seek_epoch: u64,
        reset_revision: u64,
    ) -> AckSessionSnapshotResult {
        self.sweep_expired_pending(Instant::now());

        let Some((source_kind, pending)) =
            self.pending_matching(session_id, seek_epoch, reset_revision)
        else {
            if self.pending_live.is_none() && self.pending_playback.is_none() {
                return AckSessionSnapshotResult::Rejected {
                    failure: OperationFailure {
                        operation_id: crate::ipc::OperationId::AckSessionSnapshot,
                        reason: Reason {
                            kind: ReasonKind::Timeout,
                            message: "pending session expired or missing".to_string(),
                        },
                    },
                };
            }

            return AckSessionSnapshotResult::Rejected {
                failure: OperationFailure {
                    operation_id: crate::ipc::OperationId::AckSessionSnapshot,
                    reason: Reason {
                        kind: ReasonKind::Conflict,
                        message: "session snapshot mismatch".to_string(),
                    },
                },
            };
        };

        let envelope = pending.snapshot.envelope.clone();
        match source_kind {
            SourceKind::Live => {
                self.live_active = Some(envelope.clone());
                self.pending_live = None;
            }
            SourceKind::Playback => {
                self.playback_active = Some(envelope.clone());
                self.pending_playback = None;
            }
        }
        AckSessionSnapshotResult::Accepted { envelope }
    }

    pub(crate) fn issue_playback_seek(&mut self) -> Result<SessionEnvelope, OperationFailure> {
        let Some(active) = self.playback_active.as_mut() else {
            return Err(OperationFailure {
                operation_id: crate::ipc::OperationId::OpenSessionSnapshot,
                reason: Reason {
                    kind: ReasonKind::Conflict,
                    message: "playback session is not active".to_string(),
                },
            });
        };

        if active.source_kind != SourceKind::Playback {
            return Err(OperationFailure {
                operation_id: crate::ipc::OperationId::OpenSessionSnapshot,
                reason: Reason {
                    kind: ReasonKind::Conflict,
                    message: "active session is not playback".to_string(),
                },
            });
        }

        active.seek_epoch = active.seek_epoch.saturating_add(1);
        active.reset_revision = active.reset_revision.saturating_add(1);
        self.last_source_kind = Some(SourceKind::Playback);
        Ok(active.clone())
    }

    #[allow(dead_code)] // Task 1 session guard remains available for future bridge filtering.
    pub(crate) fn should_drop_event(&self, envelope: &SessionEnvelope) -> bool {
        let Some(active) = self.active_envelope_for_source(envelope.source_kind) else {
            return false;
        };

        if envelope.session_id != active.session_id {
            return true;
        }

        if envelope.seek_epoch != active.seek_epoch {
            return true;
        }

        envelope.reset_revision < active.reset_revision
    }

    pub(crate) fn current_stream_envelope(&mut self, now: Instant) -> Option<SessionEnvelope> {
        self.sweep_expired_pending(now);
        self.live_active.clone()
    }

    pub(crate) fn close_playback_session(&mut self) {
        self.playback_active = None;
    }

    pub(crate) fn guided_source_kind(&self) -> SourceKind {
        if self.playback_active.is_some() {
            SourceKind::Playback
        } else {
            SourceKind::Live
        }
    }

    pub(crate) fn sweep_expired_pending(&mut self, now: Instant) {
        for pending in [&mut self.pending_live, &mut self.pending_playback] {
            let expired = pending
                .as_ref()
                .is_some_and(|pending| now.duration_since(pending.opened_at) >= self.pending_ttl);
            if expired {
                *pending = None;
            }
        }
    }

    #[cfg(test)]
    fn active_envelope(&self) -> Option<&SessionEnvelope> {
        self.live_active.as_ref().or(self.playback_active.as_ref())
    }

    #[cfg(test)]
    fn live_active_envelope(&self) -> Option<&SessionEnvelope> {
        self.live_active.as_ref()
    }

    #[cfg(test)]
    fn playback_active_envelope(&self) -> Option<&SessionEnvelope> {
        self.playback_active.as_ref()
    }

    #[cfg(test)]
    fn has_pending(&self) -> bool {
        self.pending_live.is_some() || self.pending_playback.is_some()
    }

    #[cfg(test)]
    fn pending_ttl(&self) -> Duration {
        self.pending_ttl
    }

    fn active_envelope_for_source(&self, source_kind: SourceKind) -> Option<&SessionEnvelope> {
        match source_kind {
            SourceKind::Live => self.live_active.as_ref(),
            SourceKind::Playback => self.playback_active.as_ref(),
        }
    }

    fn pending_slot_mut(&mut self, source_kind: SourceKind) -> &mut Option<PendingSession> {
        match source_kind {
            SourceKind::Live => &mut self.pending_live,
            SourceKind::Playback => &mut self.pending_playback,
        }
    }

    fn pending_matching(
        &self,
        session_id: &str,
        seek_epoch: u64,
        reset_revision: u64,
    ) -> Option<(SourceKind, &PendingSession)> {
        for (source_kind, pending) in [
            (SourceKind::Live, self.pending_live.as_ref()),
            (SourceKind::Playback, self.pending_playback.as_ref()),
        ] {
            if let Some(pending) = pending
                && pending.snapshot.envelope.session_id == session_id
                && pending.snapshot.envelope.seek_epoch == seek_epoch
                && pending.snapshot.envelope.reset_revision == reset_revision
            {
                return Some((source_kind, pending));
            }
        }

        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ipc::OperationId;

    #[test]
    fn session_runtime_open_returns_snapshot_with_ids() {
        let mut runtime = SessionRuntime::new();

        let snapshot = runtime.open_session_snapshot(SourceKind::Live);

        assert!(!snapshot.envelope.session_id.is_empty());
        assert_eq!(snapshot.envelope.seek_epoch, 0);
        assert_eq!(snapshot.envelope.reset_revision, 0);
        assert_eq!(
            snapshot.session.value.expect("session").status,
            SessionStatus::Pending
        );
    }

    #[test]
    fn session_runtime_drops_stale_events_from_older_session_id() {
        let mut runtime = SessionRuntime::new();
        let first = runtime.open_session_snapshot(SourceKind::Live);
        assert!(matches!(
            runtime.ack_session_snapshot(
                &first.envelope.session_id,
                first.envelope.seek_epoch,
                first.envelope.reset_revision
            ),
            AckSessionSnapshotResult::Accepted { .. }
        ));

        let second = runtime.open_session_snapshot(SourceKind::Playback);
        assert!(matches!(
            runtime.ack_session_snapshot(
                &second.envelope.session_id,
                second.envelope.seek_epoch,
                second.envelope.reset_revision
            ),
            AckSessionSnapshotResult::Accepted { .. }
        ));

        assert!(!runtime.should_drop_event(&first.envelope));
    }

    #[test]
    fn session_runtime_drops_stale_events_from_older_seek_epoch() {
        let mut runtime = SessionRuntime::new();
        let _ = runtime.open_session_snapshot(SourceKind::Live);
        let snapshot = runtime.open_session_snapshot(SourceKind::Live);
        assert!(matches!(
            runtime.ack_session_snapshot(
                &snapshot.envelope.session_id,
                snapshot.envelope.seek_epoch,
                snapshot.envelope.reset_revision
            ),
            AckSessionSnapshotResult::Accepted { .. }
        ));

        let mut stale = runtime.active_envelope().expect("active envelope").clone();
        stale.seek_epoch = stale.seek_epoch.saturating_sub(1);

        assert!(runtime.should_drop_event(&stale));
    }

    #[test]
    fn session_runtime_drops_events_from_mismatched_newer_seek_epoch() {
        let mut runtime = SessionRuntime::new();
        let _ = runtime.open_session_snapshot(SourceKind::Live);
        let snapshot = runtime.open_session_snapshot(SourceKind::Live);
        assert!(matches!(
            runtime.ack_session_snapshot(
                &snapshot.envelope.session_id,
                snapshot.envelope.seek_epoch,
                snapshot.envelope.reset_revision
            ),
            AckSessionSnapshotResult::Accepted { .. }
        ));

        let mut mismatched = runtime.active_envelope().expect("active envelope").clone();
        mismatched.seek_epoch = mismatched.seek_epoch.saturating_add(1);

        assert!(runtime.should_drop_event(&mismatched));
    }

    #[test]
    fn session_runtime_drops_stale_events_from_older_reset_revision() {
        let mut runtime = SessionRuntime::new();
        let _ = runtime.open_session_snapshot(SourceKind::Live);
        let snapshot = runtime.open_session_snapshot(SourceKind::Playback);
        assert!(matches!(
            runtime.ack_session_snapshot(
                &snapshot.envelope.session_id,
                snapshot.envelope.seek_epoch,
                snapshot.envelope.reset_revision
            ),
            AckSessionSnapshotResult::Accepted { .. }
        ));

        let mut stale = runtime.active_envelope().expect("active envelope").clone();
        stale.reset_revision = stale.reset_revision.saturating_sub(1);

        assert!(runtime.should_drop_event(&stale));
    }

    #[test]
    fn session_runtime_expires_pending_session_without_ack() {
        let mut runtime = SessionRuntime::with_pending_ttl(Duration::from_millis(10));
        let snapshot = runtime.open_session_snapshot(SourceKind::Playback);

        runtime.sweep_expired_pending(Instant::now() + Duration::from_millis(11));

        assert!(!runtime.has_pending());
        assert!(matches!(
            runtime.ack_session_snapshot(
                &snapshot.envelope.session_id,
                snapshot.envelope.seek_epoch,
                snapshot.envelope.reset_revision
            ),
            AckSessionSnapshotResult::Rejected { .. }
        ));
    }

    #[test]
    fn session_runtime_rejects_ack_with_typed_failure_details() {
        let mut runtime = SessionRuntime::new();
        let snapshot = runtime.open_session_snapshot(SourceKind::Live);

        let result = runtime.ack_session_snapshot(
            &snapshot.envelope.session_id,
            snapshot.envelope.seek_epoch.saturating_add(1),
            snapshot.envelope.reset_revision,
        );

        assert_eq!(
            result,
            AckSessionSnapshotResult::Rejected {
                failure: OperationFailure {
                    operation_id: OperationId::AckSessionSnapshot,
                    reason: Reason {
                        kind: ReasonKind::Conflict,
                        message: "session snapshot mismatch".to_string()
                    }
                }
            }
        );
    }

    #[test]
    fn session_runtime_new_uses_named_default_pending_ttl() {
        let runtime = SessionRuntime::new();
        assert_eq!(
            runtime.pending_ttl(),
            SessionRuntime::DEFAULT_PENDING_SESSION_TTL
        );
    }

    #[test]
    fn session_runtime_snapshot_playback_has_no_redundant_source_boolean() {
        let mut runtime = SessionRuntime::new();
        let snapshot = runtime.open_session_snapshot(SourceKind::Playback);

        let value = serde_json::to_value(&snapshot).expect("serialize snapshot");
        assert!(value["playback"].get("is_playback").is_none());
    }

    #[test]
    fn current_stream_envelope_drops_expired_pending_snapshot() {
        let mut runtime = SessionRuntime::with_pending_ttl(Duration::from_millis(10));
        let snapshot = runtime.open_session_snapshot(SourceKind::Live);

        let envelope = runtime.current_stream_envelope(Instant::now() + Duration::from_millis(11));

        assert!(
            envelope.is_none(),
            "expired pending envelope should not be emitted: {snapshot:?}"
        );
    }

    #[test]
    fn current_stream_envelope_does_not_emit_pending_snapshot_before_ack() {
        let mut runtime = SessionRuntime::new();
        runtime.open_session_snapshot(SourceKind::Live);

        let envelope = runtime.current_stream_envelope(Instant::now());

        assert!(envelope.is_none());
    }

    #[test]
    fn playback_seek_advances_active_playback_without_new_session_id() {
        let mut runtime = SessionRuntime::new();
        let snapshot = runtime.open_session_snapshot(SourceKind::Playback);
        assert!(matches!(
            runtime.ack_session_snapshot(
                &snapshot.envelope.session_id,
                snapshot.envelope.seek_epoch,
                snapshot.envelope.reset_revision
            ),
            AckSessionSnapshotResult::Accepted { .. }
        ));

        let first = runtime.issue_playback_seek().expect("playback seek");
        let second = runtime.issue_playback_seek().expect("playback seek");

        assert_eq!(first.session_id, snapshot.envelope.session_id);
        assert_eq!(first.seek_epoch, snapshot.envelope.seek_epoch + 1);
        assert_eq!(first.reset_revision, snapshot.envelope.reset_revision + 1);
        assert_eq!(second.session_id, snapshot.envelope.session_id);
        assert_eq!(second.seek_epoch, first.seek_epoch + 1);
        assert_eq!(second.reset_revision, first.reset_revision + 1);
    }

    #[test]
    fn playback_session_does_not_replace_live_stream_envelope() {
        let mut runtime = SessionRuntime::new();
        let live = runtime.open_session_snapshot(SourceKind::Live);
        assert!(matches!(
            runtime.ack_session_snapshot(
                &live.envelope.session_id,
                live.envelope.seek_epoch,
                live.envelope.reset_revision
            ),
            AckSessionSnapshotResult::Accepted { .. }
        ));

        let playback = runtime.open_session_snapshot(SourceKind::Playback);
        assert!(matches!(
            runtime.ack_session_snapshot(
                &playback.envelope.session_id,
                playback.envelope.seek_epoch,
                playback.envelope.reset_revision
            ),
            AckSessionSnapshotResult::Accepted { .. }
        ));

        let stream = runtime
            .current_stream_envelope(Instant::now())
            .expect("live stream envelope");

        assert_eq!(stream, live.envelope);
        assert_eq!(runtime.live_active_envelope(), Some(&live.envelope));
        assert_eq!(runtime.playback_active_envelope(), Some(&playback.envelope));
    }

    #[test]
    fn close_playback_session_restores_live_stream_envelope() {
        let mut runtime = SessionRuntime::new();
        let live = runtime.open_session_snapshot(SourceKind::Live);
        assert!(matches!(
            runtime.ack_session_snapshot(
                &live.envelope.session_id,
                live.envelope.seek_epoch,
                live.envelope.reset_revision
            ),
            AckSessionSnapshotResult::Accepted { .. }
        ));

        let playback = runtime.open_session_snapshot(SourceKind::Playback);
        assert!(matches!(
            runtime.ack_session_snapshot(
                &playback.envelope.session_id,
                playback.envelope.seek_epoch,
                playback.envelope.reset_revision
            ),
            AckSessionSnapshotResult::Accepted { .. }
        ));

        runtime.close_playback_session();

        assert_eq!(runtime.playback_active_envelope(), None);
        assert_eq!(
            runtime.current_stream_envelope(Instant::now()),
            Some(live.envelope)
        );
    }

    #[test]
    fn live_ack_survives_opening_playback_before_live_ack() {
        let mut runtime = SessionRuntime::new();
        let live = runtime.open_session_snapshot(SourceKind::Live);
        let playback = runtime.open_session_snapshot(SourceKind::Playback);

        assert!(matches!(
            runtime.ack_session_snapshot(
                &live.envelope.session_id,
                live.envelope.seek_epoch,
                live.envelope.reset_revision
            ),
            AckSessionSnapshotResult::Accepted { .. }
        ));
        assert!(matches!(
            runtime.ack_session_snapshot(
                &playback.envelope.session_id,
                playback.envelope.seek_epoch,
                playback.envelope.reset_revision
            ),
            AckSessionSnapshotResult::Accepted { .. }
        ));
    }
}
