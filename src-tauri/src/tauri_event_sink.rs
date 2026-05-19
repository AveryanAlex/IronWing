use std::sync::{Arc, Mutex};

#[derive(Clone, Default)]
pub(crate) struct TauriEventSink {
    handle: Arc<Mutex<Option<tauri::AppHandle>>>,
}

impl TauriEventSink {
    pub(crate) fn set_handle(&self, handle: tauri::AppHandle) {
        let mut guard = self
            .handle
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *guard = Some(handle);
    }
}

impl ironwing_core::live_runtime::EventSink for TauriEventSink {
    fn emit<T>(&self, event: &'static str, payload: &T)
    where
        T: serde::Serialize + Clone + Send + 'static,
    {
        let handle = self
            .handle
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone();
        if let Some(handle) = handle {
            crate::e2e_emit::emit_event(&handle, event, payload);
        }
    }
}
