use std::io::BufWriter;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use mavkit::{Vehicle, tlog::TlogWriter};
use mavlink::MavlinkVersion;
use tauri::Manager;

use crate::{
    AppState,
    ipc::{
        OperationFailure, OperationId, Reason, ReasonKind, RecordingMode, RecordingSettings,
        RecordingSettingsResult, RecordingStartRequest, RecordingStatus,
    },
    log_library::LogLibrary,
};

const RECORDINGS_DIR_SEGMENTS: [&str; 2] = ["logs", "recordings"];
const AUTO_RECORD_FILENAME_TEMPLATE: &str =
    "YYYY-MM-DD_HH-MM-SS_{vehicle-or-sysid-or-unknown}.tlog";
const ADD_COMPLETED_RECORDINGS_TO_LIBRARY: bool = true;

enum CompletedRecordingRegistration {
    Skip,
    Library(LogLibrary),
}

type FinalizeRecordingRegistration = Result<CompletedRecordingRegistration, OperationFailure>;

enum RecorderState {
    Idle,
    Failed {
        failure: OperationFailure,
    },
    Stopping {
        file_name: String,
        destination_path: String,
        bytes_written: u64,
    },
    Recording {
        cancel: tokio::sync::oneshot::Sender<()>,
        handle: tokio::task::JoinHandle<()>,
        mode: RecordingMode,
        file_name: String,
        destination_path: String,
        bytes_written: Arc<AtomicU64>,
        started_at_unix_msec: u64,
        runtime_failure: Arc<std::sync::Mutex<Option<OperationFailure>>>,
    },
}

struct RecorderRuntime {
    generation: u64,
    state: RecorderState,
}

pub(crate) struct StoppedRecording {
    handle: tokio::task::JoinHandle<()>,
    destination_path: String,
    finalization_generation: u64,
    runtime_failure: Arc<std::sync::Mutex<Option<OperationFailure>>>,
}

#[derive(Clone)]
pub(crate) struct TlogRecorderHandle {
    state: Arc<std::sync::Mutex<RecorderRuntime>>,
}

impl TlogRecorderHandle {
    pub(crate) fn new() -> Self {
        Self {
            state: Arc::new(std::sync::Mutex::new(RecorderRuntime {
                generation: 0,
                state: RecorderState::Idle,
            })),
        }
    }

    pub(crate) fn start(
        &self,
        vehicle: &Vehicle,
        app: &tauri::AppHandle,
        request: RecordingStartRequest,
    ) -> Result<String, String> {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if matches!(guard.state, RecorderState::Recording { .. }) {
            return Err("already recording".into());
        }

        let destination_path = match resolve_destination_path(vehicle, app, &request) {
            Ok(destination_path) => destination_path,
            Err(error) => {
                guard.generation = guard.generation.saturating_add(1);
                guard.state = RecorderState::Failed {
                    failure: operation_failure(OperationId::RecordingStart, &error),
                };
                return Err(error);
            }
        };

        if let Some(parent) = Path::new(&destination_path).parent()
            && !parent.as_os_str().is_empty()
        {
            std::fs::create_dir_all(parent)
                .map_err(|error| format!("failed to create recording directory: {error}"))?;
        }

        let file = std::fs::File::create(&destination_path)
            .map_err(|e| format!("failed to create file: {e}"))?;
        let writer = BufWriter::new(file);
        let mut tlog_writer = TlogWriter::new(writer, MavlinkVersion::V2);

        let file_name = Path::new(&destination_path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| destination_path.clone());
        let started_at_unix_msec = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis() as u64)
            .unwrap_or(0);

        let bytes_written = Arc::new(AtomicU64::new(0));
        let bytes_counter = bytes_written.clone();
        let runtime_failure = Arc::new(std::sync::Mutex::new(None));
        let runtime_failure_writer = runtime_failure.clone();
        let raw_stream = vehicle.raw().subscribe();
        let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel();

        let handle = tokio::spawn(async move {
            use mavlink::Message;
            use tokio_stream::StreamExt;
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
                                            *runtime_failure_writer
                                                .lock()
                                                .unwrap_or_else(|poisoned| poisoned.into_inner()) =
                                                Some(operation_failure(
                                                    OperationId::RecordingStart,
                                                    &format!("tlog write error: {e}"),
                                                ));
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
        guard.generation = guard.generation.saturating_add(1);
        guard.state = RecorderState::Recording {
            cancel: cancel_tx,
            handle,
            mode: request.mode,
            file_name,
            destination_path,
            bytes_written,
            started_at_unix_msec,
            runtime_failure,
        };
        Ok(name)
    }

    pub(crate) fn stop(&self) -> Option<StoppedRecording> {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if let RecorderState::Recording {
            cancel,
            handle,
            file_name,
            destination_path,
            bytes_written,
            runtime_failure,
            ..
        } = std::mem::replace(&mut guard.state, RecorderState::Idle)
        {
            let bytes_written = bytes_written.load(Ordering::Relaxed);
            let finalization_generation = guard.generation.saturating_add(1);
            guard.generation = finalization_generation;
            guard.state = RecorderState::Stopping {
                file_name: file_name.clone(),
                destination_path: destination_path.clone(),
                bytes_written,
            };
            let _ = cancel.send(());
            Some(StoppedRecording {
                handle,
                destination_path,
                finalization_generation,
                runtime_failure,
            })
        } else {
            None
        }
    }

    fn finish_stopped_recording(
        &self,
        finalization_generation: u64,
        result: Result<(), OperationFailure>,
    ) {
        let mut guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        if guard.generation != finalization_generation {
            return;
        }

        guard.state = match result {
            Ok(()) => RecorderState::Idle,
            Err(failure) => RecorderState::Failed { failure },
        };
    }

    pub(crate) fn status(&self) -> RecordingStatus {
        let guard = self.state.lock().unwrap_or_else(|e| e.into_inner());
        match &guard.state {
            RecorderState::Idle => RecordingStatus::Idle,
            RecorderState::Failed { failure } => RecordingStatus::Failed {
                failure: failure.clone(),
            },
            RecorderState::Stopping {
                file_name,
                destination_path,
                bytes_written,
            } => RecordingStatus::Stopping {
                operation_id: OperationId::RecordingStop,
                file_name: file_name.clone(),
                destination_path: destination_path.clone(),
                bytes_written: *bytes_written,
            },
            RecorderState::Recording {
                mode,
                file_name,
                destination_path,
                bytes_written,
                started_at_unix_msec,
                runtime_failure,
                ..
            } => match clone_runtime_failure(runtime_failure) {
                Some(failure) => RecordingStatus::Failed { failure },
                None => RecordingStatus::Recording {
                    operation_id: OperationId::RecordingStart,
                    mode: *mode,
                    file_name: file_name.clone(),
                    destination_path: destination_path.clone(),
                    bytes_written: bytes_written.load(Ordering::Relaxed),
                    started_at_unix_msec: *started_at_unix_msec,
                },
            },
        }
    }
}

#[tauri::command]
pub(crate) async fn recording_start(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    request: RecordingStartRequest,
) -> Result<String, String> {
    let vehicle = crate::helpers::with_vehicle(&state).await?;
    state.recorder.start(&vehicle, &app, request)
}

#[tauri::command]
pub(crate) async fn recording_stop(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    if let Some(stopped_recording) = state.recorder.stop() {
        queue_stopped_recording_finalization(&state.recorder, &app, stopped_recording);
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn recording_status(state: tauri::State<'_, AppState>) -> RecordingStatus {
    state.recorder.status()
}

#[tauri::command]
pub(crate) fn recording_settings_read(
    app: tauri::AppHandle,
) -> Result<RecordingSettingsResult, String> {
    Ok(RecordingSettingsResult {
        operation_id: OperationId::RecordingSettingsRead,
        settings: default_recording_settings(&app)?,
    })
}

#[tauri::command]
pub(crate) fn recording_settings_write(
    app: tauri::AppHandle,
    settings: RecordingSettings,
) -> Result<RecordingSettingsResult, String> {
    let defaults = default_recording_settings(&app)?;
    Ok(RecordingSettingsResult {
        operation_id: OperationId::RecordingSettingsWrite,
        settings: RecordingSettings {
            auto_record_on_connect: settings.auto_record_on_connect,
            auto_record_directory: defaults.auto_record_directory,
            filename_template: defaults.filename_template,
            add_completed_recordings_to_library: defaults.add_completed_recordings_to_library,
        },
    })
}

pub(crate) fn auto_record_start_request(enabled: bool) -> Option<RecordingStartRequest> {
    enabled.then_some(RecordingStartRequest {
        destination_path: String::new(),
        mode: RecordingMode::AutoOnConnect,
    })
}

pub(crate) fn queue_stopped_recording_finalization(
    recorder: &TlogRecorderHandle,
    app: &tauri::AppHandle,
    stopped_recording: StoppedRecording,
) -> tokio::task::JoinHandle<()> {
    spawn_stopped_recording_finalization(
        recorder.clone(),
        stopped_recording,
        completed_recording_registration(app, OperationId::RecordingStop),
    )
}

fn spawn_stopped_recording_finalization(
    recorder: TlogRecorderHandle,
    stopped_recording: StoppedRecording,
    registration: FinalizeRecordingRegistration,
) -> tokio::task::JoinHandle<()> {
    let finalization_generation = stopped_recording.finalization_generation;
    tokio::spawn(async move {
        let result = finalize_stopped_recording(stopped_recording, registration).await;
        recorder.finish_stopped_recording(finalization_generation, result);
    })
}

async fn finalize_stopped_recording(
    stopped_recording: StoppedRecording,
    registration: FinalizeRecordingRegistration,
) -> Result<(), OperationFailure> {
    stopped_recording.handle.await.map_err(|error| {
        operation_failure(
            OperationId::RecordingStop,
            &format!("recording task panicked: {error}"),
        )
    })?;

    if let Some(failure) = clone_runtime_failure(&stopped_recording.runtime_failure) {
        return Err(failure);
    }

    match registration {
        Ok(CompletedRecordingRegistration::Skip) => Ok(()),
        Ok(CompletedRecordingRegistration::Library(library)) => {
            register_completed_recording(&library, &stopped_recording.destination_path)
                .await
                .map_err(|error| operation_failure(OperationId::RecordingStop, &error))
        }
        Err(failure) => Err(failure),
    }
}

fn completed_recording_registration(
    app: &tauri::AppHandle,
    operation_id: OperationId,
) -> FinalizeRecordingRegistration {
    let settings = match default_recording_settings(app) {
        Ok(settings) => settings,
        Err(error) => return Err(operation_failure(operation_id, &error)),
    };

    if !settings.add_completed_recordings_to_library {
        return Ok(CompletedRecordingRegistration::Skip);
    }

    let app_data_dir = match app.path().app_data_dir() {
        Ok(path) => path,
        Err(error) => {
            return Err(operation_failure(
                operation_id,
                &format!("failed to resolve app-data directory: {error}"),
            ));
        }
    };

    Ok(CompletedRecordingRegistration::Library(LogLibrary::new(
        app_data_dir,
    )))
}

fn default_recording_settings(app: &tauri::AppHandle) -> Result<RecordingSettings, String> {
    Ok(RecordingSettings {
        auto_record_on_connect: false,
        auto_record_directory: recordings_dir(app)?.to_string_lossy().to_string(),
        filename_template: AUTO_RECORD_FILENAME_TEMPLATE.to_string(),
        add_completed_recordings_to_library: ADD_COMPLETED_RECORDINGS_TO_LIBRARY,
    })
}

fn recordings_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app-data directory: {error}"))?;
    Ok(RECORDINGS_DIR_SEGMENTS
        .iter()
        .fold(app_data_dir, |path, segment| path.join(segment)))
}

fn resolve_destination_path(
    vehicle: &Vehicle,
    app: &tauri::AppHandle,
    request: &RecordingStartRequest,
) -> Result<String, String> {
    match request.mode {
        RecordingMode::Manual => {
            let destination_path = request.destination_path.trim();
            if destination_path.is_empty() {
                return Err("manual recording requires a destination_path".to_string());
            }

            Ok(destination_path.to_string())
        }
        RecordingMode::AutoOnConnect => Ok(recordings_dir(app)?
            .join(auto_recording_file_name(vehicle))
            .to_string_lossy()
            .to_string()),
    }
}

fn auto_recording_file_name(vehicle: &Vehicle) -> String {
    let unix_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0);
    let identity = vehicle.identity();
    let label = serde_json::to_value(identity.vehicle_type)
        .ok()
        .and_then(|value| value.as_str().map(str::to_string))
        .map(|value| sanitize_filename_segment(&value))
        .filter(|value| !value.is_empty() && value != "generic" && value != "unknown")
        .unwrap_or_else(|| {
            if identity.system_id > 0 {
                format!("sysid-{}", identity.system_id)
            } else {
                "unknown".to_string()
            }
        });
    format!("{}_{}.tlog", format_unix_secs_utc(unix_secs), label)
}

fn sanitize_filename_segment(value: &str) -> String {
    let mut sanitized = String::with_capacity(value.len());
    for character in value.chars() {
        if character.is_ascii_alphanumeric() {
            sanitized.push(character.to_ascii_lowercase());
        } else if matches!(character, '_' | '-') {
            sanitized.push(character);
        }
    }
    sanitized.trim_matches('_').trim_matches('-').to_string()
}

fn format_unix_secs_utc(unix_secs: i64) -> String {
    let days = unix_secs.div_euclid(86_400);
    let seconds_of_day = unix_secs.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;
    format!("{year:04}-{month:02}-{day:02}_{hour:02}-{minute:02}-{second:02}")
}

fn civil_from_days(days_since_epoch: i64) -> (i64, i64, i64) {
    let shifted_days = days_since_epoch + 719_468;
    let era = if shifted_days >= 0 {
        shifted_days
    } else {
        shifted_days - 146_096
    } / 146_097;
    let day_of_era = shifted_days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    if month <= 2 {
        year += 1;
    }
    (year, month, day)
}

fn operation_failure(operation_id: OperationId, message: &str) -> OperationFailure {
    OperationFailure {
        operation_id,
        reason: Reason {
            kind: ReasonKind::Failed,
            message: message.to_string(),
        },
    }
}

fn clone_runtime_failure(
    runtime_failure: &Arc<std::sync::Mutex<Option<OperationFailure>>>,
) -> Option<OperationFailure> {
    runtime_failure
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone()
}

async fn register_completed_recording(
    library: &LogLibrary,
    destination_path: &str,
) -> Result<(), String> {
    let reporter = crate::logs::LogOperationReporter::new(
        OperationId::LogLibraryRegister,
        Arc::new(|_| {}),
        tokio_util::sync::CancellationToken::new(),
    );
    library
        .register(destination_path.to_string(), &reporter)
        .await
        .map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;
    use mavkit::dialect::{HEARTBEAT_DATA, MavAutopilot, MavModeFlag, MavState, MavType};
    use mavkit::tlog::TlogWriter;
    use mavlink::{MavHeader, MavlinkVersion};

    fn runtime() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("test runtime")
    }

    fn temp_dir(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "ironwing-recording-{name}-{}-{nonce}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    fn write_tlog(path: &Path) {
        let file = std::fs::File::create(path).expect("create tlog");
        let writer = std::io::BufWriter::new(file);
        let mut tlog = TlogWriter::new(writer, MavlinkVersion::V2);
        let header = MavHeader {
            system_id: 1,
            component_id: 1,
            sequence: 0,
        };
        let message = mavkit::dialect::MavMessage::HEARTBEAT(HEARTBEAT_DATA {
            custom_mode: 3,
            mavtype: MavType::MAV_TYPE_QUADROTOR,
            autopilot: MavAutopilot::MAV_AUTOPILOT_ARDUPILOTMEGA,
            base_mode: MavModeFlag::MAV_MODE_FLAG_SAFETY_ARMED,
            system_status: MavState::MAV_STATE_ACTIVE,
            mavlink_version: 3,
        });
        tlog.write_now(&header, &message)
            .expect("write tlog message");
        tlog.flush().expect("flush tlog");
    }

    #[test]
    fn recording_status_reports_active_filename_path_and_bytes_written() {
        runtime().block_on(async {
            let recorder = TlogRecorderHandle::new();
            let (cancel, _cancel_rx) = tokio::sync::oneshot::channel();
            let handle = tokio::spawn(async {
                std::future::pending::<()>().await;
            });
            let runtime_failure = Arc::new(std::sync::Mutex::new(None));

            *recorder
                .state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()) = RecorderRuntime {
                generation: 1,
                state: RecorderState::Recording {
                    cancel,
                    handle,
                    mode: RecordingMode::AutoOnConnect,
                    file_name: "2026-05-08_10-11-12_sysid-42.tlog".to_string(),
                    destination_path: "/tmp/recordings/2026-05-08_10-11-12_sysid-42.tlog"
                        .to_string(),
                    bytes_written: Arc::new(AtomicU64::new(4_096)),
                    started_at_unix_msec: 1_778_246_400_000,
                    runtime_failure,
                },
            };

            let status = recorder.status();
            assert_eq!(
                status,
                RecordingStatus::Recording {
                    operation_id: OperationId::RecordingStart,
                    mode: RecordingMode::AutoOnConnect,
                    file_name: "2026-05-08_10-11-12_sysid-42.tlog".to_string(),
                    destination_path: "/tmp/recordings/2026-05-08_10-11-12_sysid-42.tlog"
                        .to_string(),
                    bytes_written: 4_096,
                    started_at_unix_msec: 1_778_246_400_000,
                }
            );

            let stopped_recording = recorder.stop().expect("stop recording state");
            assert_eq!(
                recorder.status(),
                RecordingStatus::Stopping {
                    operation_id: OperationId::RecordingStop,
                    file_name: "2026-05-08_10-11-12_sysid-42.tlog".to_string(),
                    destination_path: "/tmp/recordings/2026-05-08_10-11-12_sysid-42.tlog"
                        .to_string(),
                    bytes_written: 4_096,
                }
            );
            stopped_recording.handle.abort();
        });
    }

    #[test]
    fn recording_status_reports_runtime_failure_state() {
        runtime().block_on(async {
            let recorder = TlogRecorderHandle::new();
            let (cancel, _cancel_rx) = tokio::sync::oneshot::channel();
            let handle = tokio::spawn(async {});
            let runtime_failure = Arc::new(std::sync::Mutex::new(Some(operation_failure(
                OperationId::RecordingStart,
                "tlog write error: disk full",
            ))));

            *recorder
                .state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()) = RecorderRuntime {
                generation: 1,
                state: RecorderState::Recording {
                    cancel,
                    handle,
                    mode: RecordingMode::Manual,
                    file_name: "flight.tlog".to_string(),
                    destination_path: "/tmp/flight.tlog".to_string(),
                    bytes_written: Arc::new(AtomicU64::new(128)),
                    started_at_unix_msec: 0,
                    runtime_failure,
                },
            };

            let status = recorder.status();
            assert_eq!(
                status,
                RecordingStatus::Failed {
                    failure: operation_failure(
                        OperationId::RecordingStart,
                        "tlog write error: disk full",
                    ),
                }
            );
        });
    }

    #[test]
    fn recording_manual_stop_adds_library_entry() {
        let root = temp_dir("manual-stop-register");
        let app_data = root.join("app-data");
        let recording = root.join("flight-complete.tlog");
        write_tlog(&recording);

        runtime().block_on(async {
            let recorder = TlogRecorderHandle::new();
            let finalize = spawn_stopped_recording_finalization(
                recorder.clone(),
                StoppedRecording {
                    handle: tokio::spawn(async {}),
                    destination_path: recording.to_string_lossy().to_string(),
                    finalization_generation: 1,
                    runtime_failure: Arc::new(std::sync::Mutex::new(None)),
                },
                Ok(CompletedRecordingRegistration::Library(LogLibrary::new(
                    app_data.clone(),
                ))),
            );
            finalize.await.expect("finalization task completed");

            let catalog = LogLibrary::new(app_data.clone())
                .list()
                .expect("list catalog");
            assert_eq!(catalog.entries.len(), 1);
            let entry = &catalog.entries[0];
            assert_eq!(entry.metadata.format, crate::ipc::logs::LogFormat::Tlog);
            assert_eq!(entry.metadata.total_messages, 1);
            assert!(entry.index.is_some());
            assert_eq!(
                PathBuf::from(&entry.source.original_path),
                std::fs::canonicalize(&recording).expect("canonical recording path")
            );
            assert_eq!(recorder.status(), RecordingStatus::Idle);
        });

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn recording_disconnect_preserves_library_registration() {
        let root = temp_dir("disconnect-register");
        let app_data = root.join("app-data");
        let recording = root.join("disconnect-flight.tlog");
        write_tlog(&recording);

        runtime().block_on(async {
            let recorder = TlogRecorderHandle::new();
            let (cancel, _cancel_rx) = tokio::sync::oneshot::channel();
            let (release_tx, release_rx) = tokio::sync::oneshot::channel();
            let runtime_failure = Arc::new(std::sync::Mutex::new(None));

            *recorder
                .state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()) = RecorderRuntime {
                generation: 1,
                state: RecorderState::Recording {
                    cancel,
                    handle: tokio::spawn(async {
                        let _ = release_rx.await;
                    }),
                    mode: RecordingMode::AutoOnConnect,
                    file_name: "disconnect-flight.tlog".to_string(),
                    destination_path: recording.to_string_lossy().to_string(),
                    bytes_written: Arc::new(AtomicU64::new(1_024)),
                    started_at_unix_msec: 1_778_246_400_000,
                    runtime_failure,
                },
            };

            let stopped_recording = recorder.stop().expect("stop recording during disconnect");
            let finalize = spawn_stopped_recording_finalization(
                recorder.clone(),
                stopped_recording,
                Ok(CompletedRecordingRegistration::Library(LogLibrary::new(
                    app_data.clone(),
                ))),
            );

            tokio::task::yield_now().await;
            assert!(!finalize.is_finished());
            assert_eq!(
                LogLibrary::new(app_data.clone())
                    .list()
                    .unwrap()
                    .entries
                    .len(),
                0
            );

            release_tx.send(()).expect("release finalization wait");
            finalize.await.expect("finalization task completed");

            let catalog = LogLibrary::new(app_data.clone())
                .list()
                .expect("list catalog");
            assert_eq!(catalog.entries.len(), 1);
            assert_eq!(
                catalog.entries[0].source.original_path,
                std::fs::canonicalize(&recording).unwrap().to_string_lossy()
            );
            assert_eq!(recorder.status(), RecordingStatus::Idle);
        });

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn recording_stop_can_skip_library_registration_and_settle_idle() {
        runtime().block_on(async {
            let recorder = TlogRecorderHandle::new();
            let finalize = spawn_stopped_recording_finalization(
                recorder.clone(),
                StoppedRecording {
                    handle: tokio::spawn(async {}),
                    destination_path: "/tmp/recordings/skipped.tlog".to_string(),
                    finalization_generation: 1,
                    runtime_failure: Arc::new(std::sync::Mutex::new(None)),
                },
                Ok(CompletedRecordingRegistration::Skip),
            );

            finalize.await.expect("finalization task completed");
            assert_eq!(recorder.status(), RecordingStatus::Idle);
        });
    }

    #[test]
    fn auto_record_filename_uses_expected_timestamp_format() {
        assert_eq!(
            format_unix_secs_utc(1_778_246_400),
            "2026-05-08_13-20-00".to_string()
        );
    }

    #[test]
    fn auto_record_start_request_follows_connect_setting() {
        assert_eq!(auto_record_start_request(false), None);
        assert_eq!(
            auto_record_start_request(true),
            Some(RecordingStartRequest {
                destination_path: String::new(),
                mode: RecordingMode::AutoOnConnect,
            })
        );
    }
}
