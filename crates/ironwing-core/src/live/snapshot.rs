use crate::ipc::{
    DomainProvenance, DomainValue, OpenSessionSnapshot, PlaybackSnapshot, SessionConnection,
    SessionEnvelope, SessionSnapshot, SessionStatus, StatusTextEntry, TelemetrySnapshot,
    status_text_snapshot_from_entries, support_snapshot,
};
use crate::live::SessionContext;

#[derive(Debug, Clone)]
pub struct LiveSnapshotInput<'a> {
    pub envelope: SessionEnvelope,
    pub session_context: &'a SessionContext,
    pub live_telemetry: &'a TelemetrySnapshot,
    pub status_text_entries: &'a [StatusTextEntry],
    pub connected: bool,
    pub provenance: DomainProvenance,
}

pub fn reprovenance<T: Clone>(
    value: &DomainValue<T>,
    provenance: DomainProvenance,
) -> DomainValue<T> {
    DomainValue {
        available: value.available,
        complete: value.complete,
        provenance,
        value: value.value.clone(),
    }
}

pub fn session_snapshot_from_context(
    session_context: &SessionContext,
    connected: bool,
    provenance: DomainProvenance,
) -> DomainValue<SessionSnapshot> {
    let status = if connected {
        SessionStatus::Active
    } else {
        SessionStatus::Pending
    };
    let connection = if connected {
        session_context.connection.clone()
    } else {
        SessionConnection::Disconnected
    };

    DomainValue::present(
        SessionSnapshot {
            status,
            connection,
            vehicle_state: connected
                .then(|| session_context.vehicle_state.clone())
                .flatten(),
            home_position: connected
                .then(|| session_context.home_position.clone())
                .flatten(),
        },
        provenance,
    )
}

pub fn base_live_snapshot_from_caches(input: LiveSnapshotInput<'_>) -> OpenSessionSnapshot {
    OpenSessionSnapshot {
        envelope: input.envelope,
        session: session_snapshot_from_context(
            input.session_context,
            input.connected,
            input.provenance,
        ),
        telemetry: if input.connected {
            reprovenance(input.live_telemetry, input.provenance)
        } else {
            DomainValue::missing(input.provenance)
        },
        mission_state: None,
        param_store: None,
        param_progress: None,
        support: if input.connected {
            support_snapshot(input.provenance)
        } else {
            DomainValue::missing(input.provenance)
        },
        sensor_health: DomainValue::missing(input.provenance),
        configuration_facts: DomainValue::missing(input.provenance),
        calibration: DomainValue::missing(input.provenance),
        guided: DomainValue::missing(input.provenance),
        status_text: status_text_snapshot_from_entries(
            input.status_text_entries.to_vec(),
            input.provenance,
        ),
        playback: PlaybackSnapshot { cursor_usec: None },
    }
}
