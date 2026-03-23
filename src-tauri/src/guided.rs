use std::time::Instant;

use serde::Serialize;

use crate::AppState;
use crate::e2e_emit::emit_event;
use crate::ipc::{
    DomainProvenance, GuidedLiveContext, GuidedSnapshot, GuidedTerminationReason, SessionEnvelope,
};

#[derive(Clone, Serialize)]
struct ScopedGuidedEvent {
    envelope: SessionEnvelope,
    value: GuidedSnapshot,
}

pub(crate) fn live_context_from_vehicle(vehicle: &mavkit::Vehicle) -> GuidedLiveContext {
    let link_connected = vehicle
        .link()
        .state()
        .latest()
        .is_some_and(|ls| matches!(ls, mavkit::LinkState::Connected));
    let armed = vehicle
        .telemetry()
        .armed()
        .latest()
        .map(|s| s.value)
        .unwrap_or(false);
    let mode_name = vehicle
        .current_mode()
        .latest()
        .map(|m| m.name.to_ascii_uppercase())
        .unwrap_or_default();
    GuidedLiveContext {
        has_live_vehicle: link_connected,
        is_armed: armed,
        in_guided_mode: mode_name == "GUIDED",
    }
}

pub(crate) async fn emit_guided_snapshot(
    state: &AppState,
    app: &tauri::AppHandle,
    guided: GuidedSnapshot,
) {
    let envelope = {
        let mut runtime = state.session_runtime.lock().await;
        runtime.current_stream_envelope(Instant::now())
    };

    if let Some(envelope) = envelope {
        emit_event(
            app,
            "guided://state",
            &ScopedGuidedEvent {
                envelope,
                value: guided,
            },
        );
    }
}

pub(crate) async fn emit_guided_reset(
    state: &AppState,
    app: &tauri::AppHandle,
    provenance: DomainProvenance,
    reason: GuidedTerminationReason,
    message: impl Into<String>,
) -> GuidedSnapshot {
    let guided = state.guided_runtime.lock().await.terminate(
        provenance,
        reason,
        message,
        GuidedLiveContext::unavailable(),
    );
    emit_guided_snapshot(state, app, guided.clone()).await;
    guided
}
