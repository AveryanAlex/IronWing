use std::mem::discriminant;

use web_time::{SystemTime, UNIX_EPOCH};

use crate::ipc::{DomainProvenance, DomainValue, OperationId, Reason, ReasonKind, SourceKind};

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GuidedStatus {
    Idle,
    Active,
    Blocked,
    Unavailable,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GuidedBlockingReason {
    LiveSessionRequired,
    Playback,
    VehicleDisarmed,
    VehicleModeIncompatible,
    OperationInProgress,
    StopUnsupported,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GuidedTerminationReason {
    Disconnect,
    ModeChange,
    SourceSwitch,
    VehicleMissing,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GuidedFatalityScope {
    Operation,
    Session,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GuidedSessionKind {
    Goto,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum GuidedSession {
    Goto {
        latitude_deg: f64,
        longitude_deg: f64,
        altitude_msl_m: f32,
    },
}

impl GuidedSession {
    pub const fn kind(&self) -> GuidedSessionKind {
        match self {
            Self::Goto { .. } => GuidedSessionKind::Goto,
        }
    }
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct GuidedAction {
    pub allowed: bool,
    pub blocking_reason: Option<GuidedBlockingReason>,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct GuidedActions {
    pub start: GuidedAction,
    pub update: GuidedAction,
    pub stop: GuidedAction,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct GuidedTermination {
    pub reason: GuidedTerminationReason,
    pub at_unix_msec: u64,
    pub message: String,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct GuidedLastCommand {
    pub operation_id: OperationId,
    pub session_kind: Option<GuidedSessionKind>,
    pub at_unix_msec: u64,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct GuidedState {
    pub status: GuidedStatus,
    pub session: Option<GuidedSession>,
    pub entered_at_unix_msec: Option<u64>,
    pub blocking_reason: Option<GuidedBlockingReason>,
    pub termination: Option<GuidedTermination>,
    pub last_command: Option<GuidedLastCommand>,
    pub actions: GuidedActions,
}

pub type GuidedSnapshot = DomainValue<GuidedState>;

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct StartGuidedSessionRequest {
    pub session: GuidedSession,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct UpdateGuidedSessionRequest {
    pub session: GuidedSession,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum GuidedFailureDetail {
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

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct GuidedFailure {
    pub operation_id: OperationId,
    pub reason: Reason,
    pub retryable: bool,
    pub fatality_scope: GuidedFatalityScope,
    pub detail: Option<GuidedFailureDetail>,
}

#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "result", rename_all = "snake_case")]
pub enum GuidedCommandResult {
    Accepted { state: GuidedSnapshot },
    Rejected { failure: GuidedFailure },
}

#[derive(Debug, Clone, PartialEq)]
enum ReservedOperation {
    Start(GuidedSession),
    Update(GuidedSession),
}

#[derive(Debug, Default)]
pub struct GuidedRuntime {
    active_session: Option<GuidedSession>,
    entered_at_unix_msec: Option<u64>,
    reservation: Option<ReservedOperation>,
    last_command: Option<GuidedLastCommand>,
    termination: Option<GuidedTermination>,
}

#[derive(Debug, Clone, Copy)]
pub struct GuidedLiveContext {
    pub has_live_vehicle: bool,
    pub is_armed: bool,
    pub in_guided_mode: bool,
}

impl GuidedLiveContext {
    pub const fn unavailable() -> Self {
        Self {
            has_live_vehicle: false,
            is_armed: false,
            in_guided_mode: false,
        }
    }
}

impl GuidedRuntime {
    pub fn snapshot_live(
        &self,
        provenance: DomainProvenance,
        context: GuidedLiveContext,
    ) -> GuidedSnapshot {
        DomainValue::present(self.state_for_context(context), provenance)
    }

    pub fn snapshot_playback() -> GuidedSnapshot {
        DomainValue::missing(DomainProvenance::Playback)
    }

    pub fn reserve_start(
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

    pub fn reserve_update(
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

    pub fn commit_reserved(&mut self, operation_id: OperationId) -> GuidedCommandResult {
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

    pub fn abort_reserved(
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

    pub fn stop(&self, source_kind: SourceKind, context: GuidedLiveContext) -> GuidedCommandResult {
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

    pub fn reset_for_playback(&mut self, message: impl Into<String>) {
        let _ = self.terminate(
            DomainProvenance::Stream,
            GuidedTerminationReason::SourceSwitch,
            message,
            GuidedLiveContext::unavailable(),
        );
    }

    pub fn terminate(
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

    pub fn ensure_live_validity(&mut self, context: GuidedLiveContext) -> Option<GuidedSnapshot> {
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
