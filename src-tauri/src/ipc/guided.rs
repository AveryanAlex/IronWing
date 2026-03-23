use std::mem::discriminant;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::ipc::{DomainProvenance, DomainValue, OperationId, Reason, ReasonKind, SourceKind};

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum GuidedStatus {
    Idle,
    Active,
    Blocked,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum GuidedBlockingReason {
    LiveSessionRequired,
    Playback,
    VehicleDisarmed,
    VehicleModeIncompatible,
    OperationInProgress,
    StopUnsupported,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum GuidedTerminationReason {
    Disconnect,
    ModeChange,
    SourceSwitch,
    VehicleMissing,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum GuidedFatalityScope {
    Operation,
    Session,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum GuidedSessionKind {
    Goto,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(crate) enum GuidedSession {
    Goto {
        latitude_deg: f64,
        longitude_deg: f64,
        altitude_m: f32,
    },
}

impl GuidedSession {
    pub(crate) const fn kind(&self) -> GuidedSessionKind {
        match self {
            Self::Goto { .. } => GuidedSessionKind::Goto,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct GuidedAction {
    pub allowed: bool,
    pub blocking_reason: Option<GuidedBlockingReason>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct GuidedActions {
    pub start: GuidedAction,
    pub update: GuidedAction,
    pub stop: GuidedAction,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct GuidedTermination {
    pub reason: GuidedTerminationReason,
    pub at_unix_msec: u64,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct GuidedLastCommand {
    pub operation_id: OperationId,
    pub session_kind: Option<GuidedSessionKind>,
    pub at_unix_msec: u64,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct GuidedState {
    pub status: GuidedStatus,
    pub session: Option<GuidedSession>,
    pub entered_at_unix_msec: Option<u64>,
    pub blocking_reason: Option<GuidedBlockingReason>,
    pub termination: Option<GuidedTermination>,
    pub last_command: Option<GuidedLastCommand>,
    pub actions: GuidedActions,
}

pub(crate) type GuidedSnapshot = DomainValue<GuidedState>;

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct StartGuidedSessionRequest {
    pub session: GuidedSession,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub(crate) struct UpdateGuidedSessionRequest {
    pub session: GuidedSession,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(crate) enum GuidedFailureDetail {
    BlockingReason {
        blocking_reason: GuidedBlockingReason,
    },
    SourceKind {
        source_kind: SourceKind,
    },
    SessionKind {
        session_kind: GuidedSessionKind,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub(crate) struct GuidedFailure {
    pub operation_id: OperationId,
    pub reason: Reason,
    pub retryable: bool,
    pub fatality_scope: GuidedFatalityScope,
    pub detail: Option<GuidedFailureDetail>,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "result", rename_all = "snake_case")]
pub(crate) enum GuidedCommandResult {
    Accepted { state: GuidedSnapshot },
    Rejected { failure: GuidedFailure },
}

#[derive(Debug, Clone, PartialEq)]
enum ReservedOperation {
    Start(GuidedSession),
    Update(GuidedSession),
}

#[derive(Debug, Default)]
pub(crate) struct GuidedRuntime {
    active_session: Option<GuidedSession>,
    entered_at_unix_msec: Option<u64>,
    reservation: Option<ReservedOperation>,
    last_command: Option<GuidedLastCommand>,
    termination: Option<GuidedTermination>,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct GuidedLiveContext {
    pub has_live_vehicle: bool,
    pub is_armed: bool,
    pub in_guided_mode: bool,
}

impl GuidedLiveContext {
    pub(crate) const fn unavailable() -> Self {
        Self {
            has_live_vehicle: false,
            is_armed: false,
            in_guided_mode: false,
        }
    }
}

impl GuidedRuntime {
    pub(crate) fn snapshot_live(
        &self,
        provenance: DomainProvenance,
        context: GuidedLiveContext,
    ) -> GuidedSnapshot {
        DomainValue::present(self.state_for_context(context), provenance)
    }

    pub(crate) fn snapshot_playback() -> GuidedSnapshot {
        DomainValue::missing(DomainProvenance::Playback)
    }

    pub(crate) fn reserve_start(
        &mut self,
        source_kind: SourceKind,
        context: GuidedLiveContext,
        session: GuidedSession,
    ) -> Result<(), GuidedFailure> {
        self.validate_live_operation(OperationId::StartGuidedSession, source_kind)?;
        self.validate_context(OperationId::StartGuidedSession, context)?;
        if self.reservation.is_some() {
            return Err(guided_failure(
                OperationId::StartGuidedSession,
                ReasonKind::Conflict,
                "guided operation already in progress",
                true,
                GuidedFatalityScope::Operation,
                Some(GuidedFailureDetail::BlockingReason {
                    blocking_reason: GuidedBlockingReason::OperationInProgress,
                }),
            ));
        }
        if self.active_session.is_some() {
            return Err(guided_failure(
                OperationId::StartGuidedSession,
                ReasonKind::Conflict,
                "guided session already active; use update_guided_session",
                true,
                GuidedFatalityScope::Operation,
                None,
            ));
        }
        self.reservation = Some(ReservedOperation::Start(session));
        Ok(())
    }

    pub(crate) fn reserve_update(
        &mut self,
        source_kind: SourceKind,
        context: GuidedLiveContext,
        session: GuidedSession,
    ) -> Result<(), GuidedFailure> {
        self.validate_live_operation(OperationId::UpdateGuidedSession, source_kind)?;
        self.validate_context(OperationId::UpdateGuidedSession, context)?;
        if self.reservation.is_some() {
            return Err(guided_failure(
                OperationId::UpdateGuidedSession,
                ReasonKind::Conflict,
                "guided operation already in progress",
                true,
                GuidedFatalityScope::Operation,
                Some(GuidedFailureDetail::BlockingReason {
                    blocking_reason: GuidedBlockingReason::OperationInProgress,
                }),
            ));
        }
        let active = self.active_session.as_ref().ok_or_else(|| {
            guided_failure(
                OperationId::UpdateGuidedSession,
                ReasonKind::Conflict,
                "no active guided session to update",
                true,
                GuidedFatalityScope::Operation,
                None,
            )
        })?;
        if discriminant(active) != discriminant(&session) {
            return Err(guided_failure(
                OperationId::UpdateGuidedSession,
                ReasonKind::Conflict,
                "guided session kind mismatch",
                false,
                GuidedFatalityScope::Operation,
                Some(GuidedFailureDetail::SessionKind {
                    session_kind: active.kind(),
                }),
            ));
        }
        self.reservation = Some(ReservedOperation::Update(session));
        Ok(())
    }

    pub(crate) fn commit_reserved(&mut self, operation_id: OperationId) -> GuidedCommandResult {
        let reserved = self.reservation.take();
        match reserved {
            Some(ReservedOperation::Start(session)) => {
                self.entered_at_unix_msec = Some(now_unix_msec());
                self.active_session = Some(session.clone());
                self.last_command = Some(GuidedLastCommand {
                    operation_id,
                    session_kind: Some(session.kind()),
                    at_unix_msec: now_unix_msec(),
                });
                self.termination = None;
                GuidedCommandResult::Accepted {
                    state: self.snapshot_live(
                        DomainProvenance::Stream,
                        GuidedLiveContext {
                            has_live_vehicle: true,
                            is_armed: true,
                            in_guided_mode: true,
                        },
                    ),
                }
            }
            Some(ReservedOperation::Update(session)) => {
                self.active_session = Some(session.clone());
                self.last_command = Some(GuidedLastCommand {
                    operation_id,
                    session_kind: Some(session.kind()),
                    at_unix_msec: now_unix_msec(),
                });
                self.termination = None;
                GuidedCommandResult::Accepted {
                    state: self.snapshot_live(
                        DomainProvenance::Stream,
                        GuidedLiveContext {
                            has_live_vehicle: true,
                            is_armed: true,
                            in_guided_mode: true,
                        },
                    ),
                }
            }
            None => GuidedCommandResult::Rejected {
                failure: guided_failure(
                    operation_id,
                    ReasonKind::Conflict,
                    "no reserved guided operation to commit",
                    false,
                    GuidedFatalityScope::Operation,
                    None,
                ),
            },
        }
    }

    pub(crate) fn abort_reserved(
        &mut self,
        operation_id: OperationId,
        reason_kind: ReasonKind,
        message: String,
    ) -> GuidedCommandResult {
        let session_kind = self.reservation.as_ref().map(|reserved| match reserved {
            ReservedOperation::Start(session) | ReservedOperation::Update(session) => {
                session.kind()
            }
        });
        self.reservation = None;
        GuidedCommandResult::Rejected {
            failure: guided_failure(
                operation_id,
                reason_kind,
                message,
                true,
                GuidedFatalityScope::Operation,
                session_kind.map(|session_kind| GuidedFailureDetail::SessionKind { session_kind }),
            ),
        }
    }

    pub(crate) fn stop(
        &self,
        source_kind: SourceKind,
        context: GuidedLiveContext,
    ) -> GuidedCommandResult {
        if let Err(failure) =
            self.validate_live_operation(OperationId::StopGuidedSession, source_kind)
        {
            return GuidedCommandResult::Rejected { failure };
        }
        if let Err(failure) = self.validate_context(OperationId::StopGuidedSession, context) {
            return GuidedCommandResult::Rejected { failure };
        }
        let Some(active) = self.active_session.as_ref() else {
            return GuidedCommandResult::Rejected {
                failure: guided_failure(
                    OperationId::StopGuidedSession,
                    ReasonKind::Conflict,
                    "no active guided session to stop",
                    true,
                    GuidedFatalityScope::Operation,
                    None,
                ),
            };
        };
        GuidedCommandResult::Rejected {
            failure: guided_failure(
                OperationId::StopGuidedSession,
                ReasonKind::Unsupported,
                "explicit guided stop is not supported by the active vehicle backend",
                false,
                GuidedFatalityScope::Operation,
                Some(GuidedFailureDetail::SessionKind {
                    session_kind: active.kind(),
                }),
            ),
        }
    }

    pub(crate) fn reset_for_playback(&mut self, message: impl Into<String>) {
        let _ = self.terminate(
            DomainProvenance::Stream,
            GuidedTerminationReason::SourceSwitch,
            message,
            GuidedLiveContext::unavailable(),
        );
    }

    pub(crate) fn terminate(
        &mut self,
        provenance: DomainProvenance,
        reason: GuidedTerminationReason,
        message: impl Into<String>,
        context: GuidedLiveContext,
    ) -> GuidedSnapshot {
        self.active_session = None;
        self.entered_at_unix_msec = None;
        self.reservation = None;
        self.termination = Some(GuidedTermination {
            reason,
            at_unix_msec: now_unix_msec(),
            message: message.into(),
        });
        self.snapshot_live(provenance, context)
    }

    pub(crate) fn ensure_live_validity(
        &mut self,
        context: GuidedLiveContext,
    ) -> Option<GuidedSnapshot> {
        self.active_session.as_ref()?;
        if !context.has_live_vehicle {
            return Some(self.terminate(
                DomainProvenance::Stream,
                GuidedTerminationReason::Disconnect,
                "live vehicle disconnected",
                context,
            ));
        }
        if !context.is_armed || !context.in_guided_mode {
            return Some(self.terminate(
                DomainProvenance::Stream,
                GuidedTerminationReason::ModeChange,
                if !context.is_armed {
                    "vehicle disarmed during guided session"
                } else {
                    "vehicle left guided mode"
                },
                context,
            ));
        }
        None
    }

    fn state_for_context(&self, context: GuidedLiveContext) -> GuidedState {
        let blocking_reason = if !context.has_live_vehicle {
            Some(GuidedBlockingReason::LiveSessionRequired)
        } else if !context.is_armed {
            Some(GuidedBlockingReason::VehicleDisarmed)
        } else if !context.in_guided_mode && self.active_session.is_some() {
            Some(GuidedBlockingReason::VehicleModeIncompatible)
        } else if self.reservation.is_some() {
            Some(GuidedBlockingReason::OperationInProgress)
        } else {
            None
        };

        let status = if !context.has_live_vehicle {
            GuidedStatus::Unavailable
        } else if self.active_session.is_some() {
            GuidedStatus::Active
        } else if blocking_reason.is_some() {
            GuidedStatus::Blocked
        } else {
            GuidedStatus::Idle
        };

        let start_reason = if !context.has_live_vehicle {
            Some(GuidedBlockingReason::LiveSessionRequired)
        } else if !context.is_armed {
            Some(GuidedBlockingReason::VehicleDisarmed)
        } else if self.reservation.is_some() || self.active_session.is_some() {
            Some(GuidedBlockingReason::OperationInProgress)
        } else if !context.in_guided_mode {
            Some(GuidedBlockingReason::VehicleModeIncompatible)
        } else {
            None
        };
        let update_reason = if !context.has_live_vehicle {
            Some(GuidedBlockingReason::LiveSessionRequired)
        } else if !context.is_armed {
            Some(GuidedBlockingReason::VehicleDisarmed)
        } else if self.reservation.is_some() {
            Some(GuidedBlockingReason::OperationInProgress)
        } else if self.active_session.is_none() {
            Some(GuidedBlockingReason::LiveSessionRequired)
        } else if !context.in_guided_mode {
            Some(GuidedBlockingReason::VehicleModeIncompatible)
        } else {
            None
        };
        let stop_reason = if !context.has_live_vehicle || self.active_session.is_none() {
            Some(GuidedBlockingReason::LiveSessionRequired)
        } else {
            Some(GuidedBlockingReason::StopUnsupported)
        };

        GuidedState {
            status,
            session: self.active_session.clone(),
            entered_at_unix_msec: self.entered_at_unix_msec,
            blocking_reason,
            termination: self.termination.clone(),
            last_command: self.last_command.clone(),
            actions: GuidedActions {
                start: GuidedAction {
                    allowed: start_reason.is_none(),
                    blocking_reason: start_reason,
                },
                update: GuidedAction {
                    allowed: update_reason.is_none(),
                    blocking_reason: update_reason,
                },
                stop: GuidedAction {
                    allowed: false,
                    blocking_reason: stop_reason,
                },
            },
        }
    }

    fn validate_live_operation(
        &self,
        operation_id: OperationId,
        source_kind: SourceKind,
    ) -> Result<(), GuidedFailure> {
        if source_kind == SourceKind::Playback {
            return Err(guided_failure(
                operation_id,
                ReasonKind::Unavailable,
                "guided control is unavailable in playback",
                false,
                GuidedFatalityScope::Operation,
                Some(GuidedFailureDetail::SourceKind { source_kind }),
            ));
        }
        Ok(())
    }

    fn validate_context(
        &self,
        operation_id: OperationId,
        context: GuidedLiveContext,
    ) -> Result<(), GuidedFailure> {
        if !context.has_live_vehicle {
            return Err(guided_failure(
                operation_id,
                ReasonKind::Unavailable,
                "guided control requires a live vehicle session",
                true,
                GuidedFatalityScope::Session,
                Some(GuidedFailureDetail::BlockingReason {
                    blocking_reason: GuidedBlockingReason::LiveSessionRequired,
                }),
            ));
        }
        if !context.is_armed {
            return Err(guided_failure(
                operation_id,
                ReasonKind::Conflict,
                "guided control requires an armed vehicle",
                true,
                GuidedFatalityScope::Operation,
                Some(GuidedFailureDetail::BlockingReason {
                    blocking_reason: GuidedBlockingReason::VehicleDisarmed,
                }),
            ));
        }
        if !context.in_guided_mode {
            return Err(guided_failure(
                operation_id,
                ReasonKind::Conflict,
                "guided control requires GUIDED mode",
                true,
                GuidedFatalityScope::Operation,
                Some(GuidedFailureDetail::BlockingReason {
                    blocking_reason: GuidedBlockingReason::VehicleModeIncompatible,
                }),
            ));
        }
        Ok(())
    }
}

fn now_unix_msec() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn guided_failure(
    operation_id: OperationId,
    kind: ReasonKind,
    message: impl Into<String>,
    retryable: bool,
    fatality_scope: GuidedFatalityScope,
    detail: Option<GuidedFailureDetail>,
) -> GuidedFailure {
    GuidedFailure {
        operation_id,
        reason: Reason {
            kind,
            message: message.into(),
        },
        retryable,
        fatality_scope,
        detail,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn goto(lat: f64, lon: f64, alt: f32) -> GuidedSession {
        GuidedSession::Goto {
            latitude_deg: lat,
            longitude_deg: lon,
            altitude_m: alt,
        }
    }

    fn live() -> GuidedLiveContext {
        GuidedLiveContext {
            has_live_vehicle: true,
            is_armed: true,
            in_guided_mode: true,
        }
    }

    #[test]
    fn guided_commands_reject_playback_with_typed_reason() {
        let mut runtime = GuidedRuntime::default();
        let result = runtime.reserve_start(SourceKind::Playback, live(), goto(47.1, 8.5, 25.0));
        let value =
            serde_json::to_value(result.expect_err("failure")).expect("serialize guided failure");
        assert_eq!(value["operation_id"], "start_guided_session");
        assert_eq!(value["reason"]["kind"], "unavailable");
        assert_eq!(value["detail"]["kind"], "source_kind");
    }

    #[test]
    fn guided_state_carries_long_lived_session_fields() {
        let mut runtime = GuidedRuntime::default();
        runtime
            .reserve_start(SourceKind::Live, live(), goto(47.1, 8.5, 25.0))
            .expect("reserve");
        let value = serde_json::to_value(runtime.commit_reserved(OperationId::StartGuidedSession))
            .expect("serialize guided state");
        assert_eq!(value["state"]["value"]["status"], "active");
        assert_eq!(value["state"]["value"]["session"]["kind"], "goto");
        assert!(value["state"]["value"]["entered_at_unix_msec"].is_number());
        assert!(value["state"]["value"].get("actions").is_some());
    }

    #[test]
    fn guided_reservation_closes_double_start_race() {
        let mut runtime = GuidedRuntime::default();
        runtime
            .reserve_start(SourceKind::Live, live(), goto(47.1, 8.5, 25.0))
            .expect("reserve");
        let second = runtime.reserve_start(SourceKind::Live, live(), goto(47.2, 8.6, 25.0));
        assert!(second.is_err());
    }

    #[test]
    fn guided_update_and_abort_paths_are_exercised() {
        let mut runtime = GuidedRuntime::default();
        let start_request = StartGuidedSessionRequest {
            session: goto(47.1, 8.5, 25.0),
        };
        runtime
            .reserve_start(SourceKind::Live, live(), start_request.session.clone())
            .expect("reserve start");
        let _ = runtime.commit_reserved(OperationId::StartGuidedSession);

        let update_request = UpdateGuidedSessionRequest {
            session: goto(47.2, 8.6, 30.0),
        };
        runtime
            .reserve_update(SourceKind::Live, live(), update_request.session.clone())
            .expect("reserve update");
        let aborted = runtime.abort_reserved(
            OperationId::UpdateGuidedSession,
            ReasonKind::Failed,
            "goto failed".to_string(),
        );

        let value = serde_json::to_value(aborted).expect("serialize aborted update");
        assert_eq!(value["failure"]["operation_id"], "update_guided_session");
        assert_eq!(value["failure"]["detail"]["kind"], "session_kind");
    }

    #[test]
    fn unavailable_context_helper_is_used_by_tests() {
        let unavailable = GuidedLiveContext::unavailable();
        assert!(!unavailable.has_live_vehicle);
        assert!(!unavailable.is_armed);
        assert!(!unavailable.in_guided_mode);
    }

    #[test]
    fn guided_auto_terminates_when_vehicle_leaves_guided_mode() {
        let mut runtime = GuidedRuntime::default();
        runtime
            .reserve_start(SourceKind::Live, live(), goto(47.1, 8.5, 25.0))
            .expect("reserve");
        let _ = runtime.commit_reserved(OperationId::StartGuidedSession);
        let snapshot = runtime
            .ensure_live_validity(GuidedLiveContext {
                has_live_vehicle: true,
                is_armed: true,
                in_guided_mode: false,
            })
            .expect("terminated");
        let state = snapshot.value.expect("state");
        assert_eq!(state.status, GuidedStatus::Idle);
        assert_eq!(
            state.termination.expect("termination").reason,
            GuidedTerminationReason::ModeChange
        );
    }

    #[test]
    fn explicit_stop_is_rejected_as_unsupported() {
        let mut runtime = GuidedRuntime::default();
        runtime
            .reserve_start(SourceKind::Live, live(), goto(47.1, 8.5, 25.0))
            .expect("reserve");
        let _ = runtime.commit_reserved(OperationId::StartGuidedSession);
        let result = runtime.stop(SourceKind::Live, live());
        let value = serde_json::to_value(result).expect("serialize stop result");
        assert_eq!(value["failure"]["reason"]["kind"], "unsupported");
        assert_eq!(value["failure"]["fatality_scope"], "operation");
    }

    #[test]
    fn playback_snapshot_remains_missing() {
        assert_eq!(
            GuidedRuntime::snapshot_playback(),
            DomainValue::missing(DomainProvenance::Playback)
        );
    }

    #[test]
    fn playback_source_switch_resets_active_guided_session() {
        let mut runtime = GuidedRuntime::default();
        runtime
            .reserve_start(SourceKind::Live, live(), goto(47.1, 8.5, 25.0))
            .expect("reserve");
        let _ = runtime.commit_reserved(OperationId::StartGuidedSession);

        runtime.reset_for_playback("playback source switched");

        let state = runtime
            .snapshot_live(DomainProvenance::Bootstrap, live())
            .value
            .expect("guided state");
        assert_eq!(state.status, GuidedStatus::Idle);
        assert_eq!(state.session, None);
        assert_eq!(
            state.termination.expect("termination").reason,
            GuidedTerminationReason::SourceSwitch
        );
        assert_eq!(
            state.last_command.expect("last command").operation_id,
            OperationId::StartGuidedSession
        );
    }
}
