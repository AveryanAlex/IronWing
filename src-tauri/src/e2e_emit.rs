/// Emit to native webview; with `e2e-remote-ui` also forwards to Remote UI WebSocket clients.
pub(crate) fn emit_event<S: serde::Serialize + Clone + Send + 'static>(
    handle: &tauri::AppHandle,
    event: &str,
    payload: &S,
) {
    use tauri::Emitter;
    let _ = handle.emit(event, payload);

    #[cfg(feature = "e2e-remote-ui")]
    forward_to_remote_ui(handle, event, payload);
}

#[cfg(feature = "e2e-remote-ui")]
fn forward_to_remote_ui<S: serde::Serialize + Clone + Send + 'static>(
    handle: &tauri::AppHandle,
    event: &str,
    payload: &S,
) {
    use tauri::Manager;

    if let Some(state) =
        handle.try_state::<std::sync::Arc<tokio::sync::RwLock<tauri_remote_ui::RemoteUi>>>()
    {
        let remote_ui = state.inner().clone();
        let event = event.to_string();
        let payload = payload.clone();
        tauri::async_runtime::spawn(async move {
            let guard = remote_ui.read().await;
            let _ = guard.emit(&event, payload).await;
        });
    }
}
