pub(crate) fn emit_event<S: serde::Serialize + Clone + Send + 'static>(
    handle: &tauri::AppHandle,
    event: &str,
    payload: &S,
) {
    use tauri::Emitter;
    use tauri::Manager;
    let _ = handle.emit(event, payload);
    if let Ok(remote_event) = crate::remote_ui::RemoteUiEvent::new(event, payload) {
        let state: tauri::State<'_, crate::AppState> = handle.state();
        let _ = state.remote_ui_events.send(remote_event);
    }
}
