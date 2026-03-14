pub(crate) fn emit_event<S: serde::Serialize + Clone + Send + 'static>(
    handle: &tauri::AppHandle,
    event: &str,
    payload: &S,
) {
    use tauri::Emitter;
    let _ = handle.emit(event, payload);
}
