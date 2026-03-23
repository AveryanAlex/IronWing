use std::io::BufWriter;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use mavkit::{Vehicle, tlog::TlogWriter};
use mavlink::MavlinkVersion;
use serde::Serialize;

use crate::AppState;

#[derive(Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub(crate) enum RecordingStatus {
    Idle,
    Recording {
        file_name: String,
        bytes_written: u64,
    },
}

enum RecorderState {
    Idle,
    Recording {
        cancel: tokio::sync::oneshot::Sender<()>,
        file_name: String,
        bytes_written: Arc<AtomicU64>,
    },
}

pub(crate) struct TlogRecorderHandle {
    state: std::sync::Mutex<RecorderState>,
}

impl TlogRecorderHandle {
    pub(crate) fn new() -> Self {
        Self {
            state: std::sync::Mutex::new(RecorderState::Idle),
        }
    }

    pub(crate) fn start(&self, vehicle: &Vehicle, path: &str) -> Result<String, String> {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if matches!(*guard, RecorderState::Recording { .. }) {
            return Err("already recording".into());
        }

        let file =
            std::fs::File::create(path).map_err(|e| format!("failed to create file: {e}"))?;
        let writer = BufWriter::new(file);
        let mut tlog_writer = TlogWriter::new(writer, MavlinkVersion::V2);

        let file_name = std::path::Path::new(path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string());

        let bytes_written = Arc::new(AtomicU64::new(0));
        let bytes_counter = bytes_written.clone();
        let raw_stream = vehicle.raw().subscribe();
        let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel();

        tokio::spawn(async move {
            use tokio_stream::StreamExt;
            use mavlink::Message;
            tokio::pin!(raw_stream);
            loop {
                tokio::select! {
                    _ = &mut cancel_rx => break,
                    maybe_msg = raw_stream.next() => {
                        match maybe_msg {
                            Some(raw_msg) => {
                                // Reconstruct a MavHeader from the RawMessage fields
                                let header = mavlink::MavHeader {
                                    system_id: raw_msg.system_id,
                                    component_id: raw_msg.component_id,
                                    sequence: 0,
                                };
                                // Re-parse the raw payload back into a typed message
                                if let Ok(msg) = mavkit::dialect::MavMessage::parse(
                                    MavlinkVersion::V2,
                                    raw_msg.message_id,
                                    &raw_msg.payload,
                                ) {
                                    match tlog_writer.write_now(&header, &msg) {
                                        Ok(n) => {
                                            bytes_counter.fetch_add(n as u64, Ordering::Relaxed);
                                        }
                                        Err(e) => {
                                            tracing::warn!("tlog write error: {e}");
                                            break;
                                        }
                                    }
                                }
                            }
                            None => break,
                        }
                    }
                }
            }
            let _ = tlog_writer.flush();
        });

        let name = file_name.clone();
        *guard = RecorderState::Recording {
            cancel: cancel_tx,
            file_name,
            bytes_written,
        };
        Ok(name)
    }

    pub(crate) fn stop(&self) {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if let RecorderState::Recording { cancel, .. } =
            std::mem::replace(&mut *guard, RecorderState::Idle)
        {
            let _ = cancel.send(());
        }
    }

    pub(crate) fn status(&self) -> RecordingStatus {
        let guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        match &*guard {
            RecorderState::Idle => RecordingStatus::Idle,
            RecorderState::Recording {
                file_name,
                bytes_written,
                ..
            } => RecordingStatus::Recording {
                file_name: file_name.clone(),
                bytes_written: bytes_written.load(Ordering::Relaxed),
            },
        }
    }
}

#[tauri::command]
pub(crate) async fn recording_start(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<String, String> {
    let vehicle = crate::helpers::with_vehicle(&state).await?;
    state.recorder.start(&vehicle, &path)
}

#[tauri::command]
pub(crate) fn recording_stop(state: tauri::State<'_, AppState>) {
    state.recorder.stop();
}

#[tauri::command]
pub(crate) fn recording_status(state: tauri::State<'_, AppState>) -> RecordingStatus {
    state.recorder.status()
}
