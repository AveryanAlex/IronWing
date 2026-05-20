use ironwing_core::event_names;
use web_time::Instant;

use crate::AppState;
use crate::e2e_emit::emit_event;
use crate::ipc::{
    DomainProvenance, GuidedLiveContext, GuidedSnapshot, GuidedTerminationReason, ScopedEvent,
};

pub(crate) use ironwing_core::live_runtime::commands::live_context_from_vehicle;

pub(crate) async fn emit_guided_snapshot(
    state: &AppState,
    app: &tauri::AppHandle,
    guided: GuidedSnapshot,
) {
    let envelope = {
        state
            .live_runtime
            .with_runtime(|runtime| runtime.current_stream_envelope(Instant::now()))
    };

    if let Some(envelope) = envelope {
        emit_event(
            app,
            event_names::GUIDED_STATE,
            &ScopedEvent {
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
