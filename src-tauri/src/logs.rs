use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex as StdMutex};

use tauri::Manager;
use tokio::task::AbortHandle;
use tokio_util::sync::CancellationToken;

pub(crate) use ironwing_core::log_engine::{
    FlightPathPoint, FlightSummary, LogDataPoint, LogStore, LogSummary, LogType, TelemetrySnapshot,
};
pub(crate) use ironwing_core::log_playback::PlaybackFrame;
use ironwing_core::{
    event_names,
    log_engine::{self, ParsedLog},
    log_playback::{idle_playback_state, playback_state_for_log, validate_playback_speed},
};

use crate::{
    AppState,
    e2e_emit::emit_event,
    helpers,
    ipc::{
        LogOperationPhase, LogOperationProgress, OperationFailure, OperationId, Reason, ReasonKind,
        ReplayStatus, ScopedEvent, SessionEnvelope,
        logs::{
            ChartSeriesPage, ChartSeriesRequest, LogExportFormat, LogExportRequest,
            LogExportResult, RawMessagePage, RawMessageQuery,
        },
        operation_failure_json,
        playback::{PlaybackSeekResult, PlaybackState},
    },
};

#[derive(Clone)]
pub(crate) struct PlaybackRuntimeState {
    inner: Arc<tokio::sync::Mutex<PlaybackRuntime>>,
}

#[derive(Debug)]
struct PlaybackRuntime {
    generation: u64,
    task: Option<AbortHandle>,
    state: PlaybackState,
}

#[derive(Clone)]
pub(crate) struct LogOperationState {
    active: Arc<tokio::sync::Mutex<Option<ActiveLogOperation>>>,
}

#[derive(Clone)]
struct ActiveLogOperation {
    operation_id: OperationId,
    cancel: CancellationToken,
    abort_handle: AbortHandle,
}

#[derive(Clone)]
pub(crate) struct LogOperationReporter {
    operation_id: OperationId,
    cancel: CancellationToken,
    emit: LogProgressEmitter,
    last_progress: Arc<StdMutex<LogOperationProgress>>,
    instance_id: Arc<StdMutex<Option<String>>>,
}

pub(crate) type LogProgressEmitter = Arc<dyn Fn(LogOperationProgress) + Send + Sync>;

impl LogOperationState {
    pub(crate) fn new() -> Self {
        Self {
            active: Arc::new(tokio::sync::Mutex::new(None)),
        }
    }

    async fn start(
        &self,
        operation_id: OperationId,
        cancel: CancellationToken,
        abort_handle: AbortHandle,
    ) -> Result<(), String> {
        let mut guard = self.active.lock().await;
        if guard.is_some() {
            return Err(operation_failure_json(OperationFailure {
                operation_id,
                reason: Reason {
                    kind: ReasonKind::Conflict,
                    message: "another log operation is already active".to_string(),
                },
            }));
        }
        *guard = Some(ActiveLogOperation {
            operation_id,
            cancel,
            abort_handle,
        });
        Ok(())
    }

    async fn clear(&self, operation_id: OperationId) {
        let mut guard = self.active.lock().await;
        if guard
            .as_ref()
            .is_some_and(|operation| operation.operation_id == operation_id)
        {
            guard.take();
        }
    }

    pub(crate) async fn cancel(&self) -> bool {
        let active = self.active.lock().await.clone();
        if let Some(active) = active {
            active.cancel.cancel();
            if active.operation_id != OperationId::LogExport {
                active.abort_handle.abort();
            }
            true
        } else {
            false
        }
    }
}

impl Default for LogOperationState {
    fn default() -> Self {
        Self::new()
    }
}

impl PlaybackRuntimeState {
    pub(crate) fn new() -> Self {
        Self {
            inner: Arc::new(tokio::sync::Mutex::new(PlaybackRuntime::new())),
        }
    }

    pub(crate) async fn prepare_ready(
        &self,
        store: &LogStore,
        barrier_ready: bool,
    ) -> PlaybackState {
        let mut runtime = self.inner.lock().await;
        runtime.cancel_task();
        runtime.state = runtime.state_for_store(
            ReplayStatus::Ready,
            Some(OperationId::ReplayOpen),
            store,
            barrier_ready,
        );
        runtime.state.clone()
    }

    pub(crate) async fn prepare_play(&self, store: &LogStore) -> PlaybackState {
        let mut runtime = self.inner.lock().await;
        runtime.cancel_task();
        runtime.state = runtime.state_for_store(
            ReplayStatus::Playing,
            Some(OperationId::ReplayPlay),
            store,
            true,
        );
        runtime.state.clone()
    }

    pub(crate) async fn prepare_pause(&self, store: &LogStore) -> PlaybackState {
        let mut runtime = self.inner.lock().await;
        runtime.cancel_task();
        runtime.state = runtime.state_for_store(
            ReplayStatus::Paused,
            Some(OperationId::ReplayPause),
            store,
            true,
        );
        runtime.state.clone()
    }

    pub(crate) async fn prepare_seek(&self, store: &LogStore) -> PlaybackState {
        let mut runtime = self.inner.lock().await;
        runtime.cancel_task();
        runtime.state = runtime.state_for_store(
            ReplayStatus::Seeking,
            Some(OperationId::ReplaySeek),
            store,
            true,
        );
        runtime.state.clone()
    }

    pub(crate) async fn prepare_end(&self, store: &LogStore) -> PlaybackState {
        let mut runtime = self.inner.lock().await;
        runtime.clear_task();
        runtime.state = runtime.state_for_store(
            ReplayStatus::Ended,
            Some(OperationId::ReplayPlay),
            store,
            true,
        );
        runtime.state.clone()
    }

    pub(crate) async fn sync_playing(&self, store: &LogStore) -> PlaybackState {
        let mut runtime = self.inner.lock().await;
        runtime.state = runtime.state_for_store(
            ReplayStatus::Playing,
            Some(OperationId::ReplayPlay),
            store,
            true,
        );
        runtime.state.clone()
    }

    pub(crate) async fn prepare_speed(
        &self,
        store: &LogStore,
        speed: f32,
    ) -> Result<PlaybackState, String> {
        validate_playback_speed(speed)?;
        let mut runtime = self.inner.lock().await;
        runtime.cancel_task();
        runtime.state.speed = speed;
        let status = match runtime.state.status {
            ReplayStatus::Idle => ReplayStatus::Ready,
            ReplayStatus::Loading => ReplayStatus::Loading,
            ReplayStatus::Ready => ReplayStatus::Ready,
            ReplayStatus::Playing => ReplayStatus::Playing,
            ReplayStatus::Paused => ReplayStatus::Paused,
            ReplayStatus::Seeking => ReplayStatus::Seeking,
            ReplayStatus::Ended => ReplayStatus::Ended,
            ReplayStatus::Error => ReplayStatus::Error,
        };
        runtime.state =
            runtime.state_for_store(status, Some(OperationId::ReplaySetSpeed), store, true);
        runtime.state.speed = speed;
        Ok(runtime.state.clone())
    }

    pub(crate) async fn prepare_idle(&self) -> PlaybackState {
        let mut runtime = self.inner.lock().await;
        runtime.cancel_task();
        runtime.state = PlaybackRuntime::idle_state();
        runtime.state.clone()
    }

    pub(crate) async fn current_generation(&self) -> u64 {
        self.inner.lock().await.generation
    }

    pub(crate) async fn matches_generation(&self, generation: u64) -> bool {
        self.inner.lock().await.generation == generation
    }

    pub(crate) async fn track_spawned_task(&self, generation: u64, abort_handle: AbortHandle) {
        let mut runtime = self.inner.lock().await;
        if runtime.generation == generation {
            runtime.task = Some(abort_handle);
        } else {
            abort_handle.abort();
        }
    }
}

impl Default for PlaybackRuntimeState {
    fn default() -> Self {
        Self::new()
    }
}

impl PlaybackRuntime {
    fn new() -> Self {
        Self {
            generation: 0,
            task: None,
            state: Self::idle_state(),
        }
    }

    fn idle_state() -> PlaybackState {
        idle_playback_state()
    }

    fn cancel_task(&mut self) {
        self.generation = self.generation.saturating_add(1);
        self.clear_task();
    }

    fn clear_task(&mut self) {
        if let Some(task) = self.task.take() {
            task.abort();
        }
    }

    fn state_for_store(
        &self,
        status: ReplayStatus,
        operation_id: Option<OperationId>,
        store: &LogStore,
        barrier_ready: bool,
    ) -> PlaybackState {
        playback_state_for_log(
            status,
            operation_id,
            store.playback_log_bounds(),
            self.state.speed,
            barrier_ready,
        )
    }
}

impl LogOperationReporter {
    pub(crate) fn new(
        operation_id: OperationId,
        emit: LogProgressEmitter,
        cancel: CancellationToken,
    ) -> Self {
        Self {
            operation_id,
            cancel,
            emit,
            last_progress: Arc::new(StdMutex::new(LogOperationProgress {
                operation_id,
                phase: LogOperationPhase::Queued,
                completed_items: 0,
                total_items: None,
                percent: None,
                entry_id: None,
                instance_id: None,
                message: None,
            })),
            instance_id: Arc::new(StdMutex::new(None)),
        }
    }

    pub(crate) fn set_instance_id(&self, instance_id: Option<String>) {
        *self
            .instance_id
            .lock()
            .expect("log operation instance lock poisoned") = instance_id;
    }

    pub(crate) fn progress(
        &self,
        phase: LogOperationPhase,
        completed_items: u64,
        total_items: Option<u64>,
        percent: Option<f32>,
        entry_id: Option<String>,
        message: Option<String>,
    ) -> Result<(), String> {
        self.ensure_not_cancelled()?;
        let progress = LogOperationProgress {
            operation_id: self.operation_id,
            phase,
            completed_items,
            total_items,
            percent,
            entry_id,
            instance_id: self
                .instance_id
                .lock()
                .expect("log operation instance lock poisoned")
                .clone(),
            message,
        };
        self.replace_last(progress.clone());
        (self.emit)(progress);
        self.ensure_not_cancelled()
    }

    pub(crate) fn emit_terminal(&self, phase: LogOperationPhase, message: Option<String>) {
        let mut progress = self.snapshot();
        progress.phase = phase;
        if let Some(message) = message {
            progress.message = Some(message);
        }
        self.replace_last(progress.clone());
        (self.emit)(progress);
    }

    fn ensure_not_cancelled(&self) -> Result<(), String> {
        if self.cancel.is_cancelled() {
            Err(cancelled_log_operation_error(self.operation_id))
        } else {
            Ok(())
        }
    }

    fn snapshot(&self) -> LogOperationProgress {
        self.last_progress
            .lock()
            .expect("log operation progress lock poisoned")
            .clone()
    }

    fn replace_last(&self, progress: LogOperationProgress) {
        *self
            .last_progress
            .lock()
            .expect("log operation progress lock poisoned") = progress;
    }
}

pub(crate) fn app_log_progress_emitter(app: tauri::AppHandle) -> LogProgressEmitter {
    Arc::new(move |progress| emit_event(&app, event_names::LOG_PROGRESS, &progress))
}

pub(crate) async fn run_log_operation<T, F, Fut>(
    state: &LogOperationState,
    operation_id: OperationId,
    emit: LogProgressEmitter,
    work: F,
) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(LogOperationReporter) -> Fut + Send + 'static,
    Fut: std::future::Future<Output = Result<T, String>> + Send + 'static,
{
    let cancel = CancellationToken::new();
    let reporter = LogOperationReporter::new(operation_id, emit, cancel.clone());
    let (start_tx, start_rx) = tokio::sync::oneshot::channel::<()>();
    let worker = tokio::spawn({
        let reporter = reporter.clone();
        let operation_id = reporter.operation_id;
        async move {
            if start_rx.await.is_err() {
                return Err(cancelled_log_operation_error(operation_id));
            }
            work(reporter).await
        }
    });
    let abort_handle = worker.abort_handle();

    if let Err(error) = state
        .start(operation_id, cancel.clone(), abort_handle)
        .await
    {
        worker.abort();
        return Err(error);
    }

    if let Err(error) = reporter.progress(LogOperationPhase::Queued, 0, None, None, None, None) {
        state.clear(operation_id).await;
        return Err(error);
    }

    let _ = start_tx.send(());

    let resolve_worker = |joined: Result<Result<T, String>, tokio::task::JoinError>| match joined {
        Ok(Ok(value)) => {
            reporter.emit_terminal(LogOperationPhase::Completed, None);
            Ok(value)
        }
        Ok(Err(error)) => {
            if cancel.is_cancelled() {
                reporter.emit_terminal(
                    LogOperationPhase::Cancelled,
                    Some("log operation cancelled".to_string()),
                );
                Err(cancelled_log_operation_error(operation_id))
            } else {
                reporter.emit_terminal(LogOperationPhase::Failed, Some(error.clone()));
                Err(error)
            }
        }
        Err(error) if error.is_cancelled() && cancel.is_cancelled() => {
            reporter.emit_terminal(
                LogOperationPhase::Cancelled,
                Some("log operation cancelled".to_string()),
            );
            Err(cancelled_log_operation_error(operation_id))
        }
        Err(error) => {
            let message = format!("log operation task failed: {error}");
            reporter.emit_terminal(LogOperationPhase::Failed, Some(message.clone()));
            Err(message)
        }
    };

    tokio::pin!(worker);

    let result = tokio::select! {
        _ = cancel.cancelled() => {
            resolve_worker(worker.await)
        }
        joined = &mut worker => resolve_worker(joined)
    };

    state.clear(operation_id).await;
    result
}

fn cancelled_log_operation_error(operation_id: OperationId) -> String {
    operation_failure_json(OperationFailure {
        operation_id,
        reason: Reason {
            kind: ReasonKind::Cancelled,
            message: "log operation cancelled".to_string(),
        },
    })
}

fn cleanup_partial_export(path: &Path) {
    if let Err(error) = std::fs::remove_file(path)
        && error.kind() != std::io::ErrorKind::NotFound
    {
        let _ = error;
    }
}

fn pending_export_path(path: &str) -> PathBuf {
    let destination = Path::new(path);
    let parent = destination.parent().unwrap_or_else(|| Path::new("."));
    let file_name = destination
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "export.csv".to_string());
    parent.join(format!(
        ".{file_name}.ironwing-export-{}-{}.tmp",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ))
}

fn backup_export_path(path: &str) -> PathBuf {
    let destination = Path::new(path);
    let parent = destination.parent().unwrap_or_else(|| Path::new("."));
    let file_name = destination
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "export.csv".to_string());
    parent.join(format!(
        ".{file_name}.ironwing-backup-{}-{}.tmp",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ))
}

fn finalize_export_file(pending_path: &Path, destination_path: &Path) -> Result<(), String> {
    if !destination_path.exists() {
        return std::fs::rename(pending_path, destination_path)
            .map_err(|error| format!("failed to finalize export file: {error}"));
    }

    let backup_path = backup_export_path(&destination_path.to_string_lossy());
    std::fs::rename(destination_path, &backup_path)
        .map_err(|error| format!("failed to move existing export aside: {error}"))?;

    match std::fs::rename(pending_path, destination_path) {
        Ok(()) => {
            cleanup_partial_export(&backup_path);
            Ok(())
        }
        Err(error) => {
            let restore_result = std::fs::rename(&backup_path, destination_path);
            if let Err(restore_error) = restore_result {
                return Err(format!(
                    "failed to finalize export file: {error}; failed to restore previous destination: {restore_error}"
                ));
            }
            Err(format!("failed to finalize export file: {error}"))
        }
    }
}

fn ensure_export_not_cancelled(
    pending_path: Option<&Path>,
    cancel: &CancellationToken,
) -> Result<(), String> {
    if cancel.is_cancelled() {
        if let Some(path) = pending_path {
            cleanup_partial_export(path);
        }
        return Err(cancelled_log_operation_error(OperationId::LogExport));
    }

    Ok(())
}

fn write_export_bytes(
    destination_path: &str,
    bytes: &[u8],
    cancel: &CancellationToken,
) -> Result<u64, String> {
    ensure_export_not_cancelled(None, cancel)?;

    let destination = Path::new(destination_path);
    let pending_path = pending_export_path(destination_path);
    let mut file = match std::fs::File::create(&pending_path) {
        Ok(file) => file,
        Err(error) => return Err(format!("failed to create file: {error}")),
    };

    if let Err(error) = file.write_all(bytes) {
        cleanup_partial_export(&pending_path);
        return Err(error.to_string());
    }
    ensure_export_not_cancelled(Some(&pending_path), cancel)?;

    if let Err(error) = file.flush() {
        cleanup_partial_export(&pending_path);
        return Err(error.to_string());
    }
    ensure_export_not_cancelled(Some(&pending_path), cancel)?;
    drop(file);

    finalize_export_file(&pending_path, destination)
        .inspect_err(|_| cleanup_partial_export(&pending_path))?;
    let bytes_written = std::fs::metadata(destination)
        .map_err(|error| format!("failed to stat export file: {error}"))?
        .len();
    Ok(bytes_written)
}

async fn blocking_raw_message_query(
    store: LogStore,
    request: RawMessageQuery,
) -> Result<RawMessagePage, String> {
    tokio::task::spawn_blocking(move || log_engine::query_raw_message_page(&store, &request))
        .await
        .map_err(|error| format!("raw message query task failed: {error}"))?
}

async fn blocking_chart_series_query(
    store: LogStore,
    request: ChartSeriesRequest,
) -> Result<ChartSeriesPage, String> {
    tokio::task::spawn_blocking(move || log_engine::query_chart_series(&store, &request))
        .await
        .map_err(|error| format!("chart series query task failed: {error}"))
}

async fn blocking_export_csv(
    store: LogStore,
    request: LogExportRequest,
    cancel: CancellationToken,
) -> Result<LogExportResult, String> {
    tokio::task::spawn_blocking(move || {
        ensure_export_not_cancelled(None, &cancel)?;
        let destination_path = request.destination_path.clone();
        let (bytes, rows_written) = log_engine::export_csv_bytes(&store, &request)?;
        let bytes_written = write_export_bytes(&destination_path, &bytes, &cancel)?;
        Ok(LogExportResult {
            operation_id: OperationId::LogExport,
            destination_path,
            bytes_written,
            rows_written,
            diagnostics: Vec::new(),
        })
    })
    .await
    .map_err(|error| format!("log export task failed: {error}"))?
}

async fn blocking_compat_csv_export(
    store: LogStore,
    path: String,
    start_usec: Option<u64>,
    end_usec: Option<u64>,
) -> Result<u64, String> {
    let request = LogExportRequest {
        entry_id: store.entry_id().unwrap_or_default().to_string(),
        instance_id: "compat-csv-export".to_string(),
        format: LogExportFormat::Csv,
        destination_path: path,
        start_usec,
        end_usec,
        message_types: Vec::new(),
        text: None,
        field_filters: Vec::new(),
    };
    tokio::task::spawn_blocking(move || {
        let (bytes, row_count) = log_engine::export_csv_bytes(&store, &request)?;
        write_export_bytes(&request.destination_path, &bytes, &CancellationToken::new())?;
        Ok(row_count)
    })
    .await
    .map_err(|error| format!("compat log export task failed: {error}"))?
}

fn ready_library_entry(
    entry_id: &str,
    entry: crate::ipc::logs::LogLibraryEntry,
) -> Result<crate::ipc::logs::LogLibraryEntry, String> {
    match entry.status {
        crate::ipc::logs::LogLibraryEntryStatus::Ready
        | crate::ipc::logs::LogLibraryEntryStatus::Partial
        | crate::ipc::logs::LogLibraryEntryStatus::Corrupt => Ok(entry),
        crate::ipc::logs::LogLibraryEntryStatus::Missing => Err(format!(
            "log library entry {entry_id} is missing and must be relinked"
        )),
        crate::ipc::logs::LogLibraryEntryStatus::Stale => Err(format!(
            "log library entry {entry_id} is stale and must be reindexed"
        )),
        crate::ipc::logs::LogLibraryEntryStatus::Indexing => {
            Err(format!("log library entry {entry_id} is still indexing"))
        }
        crate::ipc::logs::LogLibraryEntryStatus::Unsupported => Err(format!(
            "log library entry {entry_id} uses an unsupported format"
        )),
    }
}

fn store_matches_entry(store: &LogStore, entry_id: &str, source_path: &str) -> bool {
    store.entry_id() == Some(entry_id) || store.source_path() == source_path
}

fn reusable_library_store<'a>(
    active_store: Option<&'a LogStore>,
    cached_store: Option<&'a LogStore>,
    entry_id: &str,
    source_path: &str,
) -> Option<&'a LogStore> {
    active_store
        .filter(|store| store_matches_entry(store, entry_id, source_path))
        .or_else(|| cached_store.filter(|store| store_matches_entry(store, entry_id, source_path)))
}

async fn store_for_entry(
    state: &AppState,
    app: &tauri::AppHandle,
    entry_id: &str,
) -> Result<LogStore, String> {
    let entry = ready_library_entry(
        entry_id,
        crate::log_library::log_library_get_entry(app, entry_id)?,
    )?;
    let source_path = entry.source.original_path.clone();
    if let Some(active_store) = reusable_library_store(
        state.log_store.lock().await.as_ref(),
        None,
        entry_id,
        &source_path,
    )
    .cloned()
    {
        return Ok(active_store);
    }

    if let Some(cached_store) = reusable_library_store(
        None,
        state.cached_library_store.lock().await.as_ref(),
        entry_id,
        &source_path,
    )
    .cloned()
    {
        return Ok(cached_store);
    }

    let mut parsed = parse_log_file(source_path).await?;
    parsed.store.set_entry_id(Some(entry.entry_id));
    *state.cached_library_store.lock().await = Some(parsed.store.clone());
    Ok(parsed.store)
}

pub(crate) async fn parse_log_file(path: String) -> Result<ParsedLog, String> {
    let log_type = if path.ends_with(".bin") || path.ends_with(".BIN") {
        LogType::Bin
    } else {
        LogType::Tlog
    };
    let read_label = match log_type {
        LogType::Bin => "BIN",
        LogType::Tlog => "TLOG",
    };
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|error| format!("failed to read {read_label} log: {error}"))?;

    tokio::task::spawn_blocking(move || log_engine::parse_log_bytes(&path, &bytes, log_type))
        .await
        .map_err(|error| format!("{read_label} parse task failed: {error}"))?
}

#[tauri::command]
pub(crate) async fn log_open(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    path: String,
) -> Result<LogSummary, String> {
    *state.log_store.lock().await = None;

    run_log_operation(
        &state.log_operation,
        OperationId::LogOpen,
        app_log_progress_emitter(app.clone()),
        move |reporter| {
            let app = app.clone();
            async move {
                reporter.progress(LogOperationPhase::Parsing, 0, None, None, None, None)?;

                let parsed = parse_log_file(path).await?;
                let total = parsed.store.summary().total_entries as u64;
                let percent = (total > 0).then_some(100.0);
                reporter.progress(
                    LogOperationPhase::Parsing,
                    total,
                    Some(total),
                    percent,
                    None,
                    None,
                )?;
                reporter.progress(
                    LogOperationPhase::Indexing,
                    total,
                    Some(total),
                    percent,
                    None,
                    None,
                )?;

                let summary = parsed.store.summary().clone();
                let state: tauri::State<'_, AppState> = app.state();
                {
                    let mut guard = state.log_store.lock().await;
                    *guard = Some(parsed.store);
                    if let Some(store) = guard.as_ref() {
                        state.playback_runtime.prepare_ready(store, false).await;
                    }
                }

                Ok(summary)
            }
        },
    )
    .await
}

pub(crate) fn emit_playback_state_snapshot(
    app: &tauri::AppHandle,
    envelope: &SessionEnvelope,
    playback_state: &PlaybackState,
) {
    emit_event(
        app,
        event_names::PLAYBACK_STATE,
        &ScopedEvent {
            envelope: envelope.clone(),
            value: playback_state.clone(),
        },
    );
}

fn emit_playback_frame(
    app: &tauri::AppHandle,
    envelope: &SessionEnvelope,
    frame: &PlaybackFrame,
    playback_state: &PlaybackState,
) {
    emit_event(
        app,
        event_names::SESSION_STATE,
        &ScopedEvent {
            envelope: envelope.clone(),
            value: frame.session.clone(),
        },
    );
    emit_event(
        app,
        event_names::TELEMETRY_STATE,
        &ScopedEvent {
            envelope: envelope.clone(),
            value: frame.telemetry.clone(),
        },
    );
    emit_event(
        app,
        event_names::SUPPORT_STATE,
        &ScopedEvent {
            envelope: envelope.clone(),
            value: frame.support.clone(),
        },
    );
    emit_event(
        app,
        event_names::STATUS_TEXT_STATE,
        &ScopedEvent {
            envelope: envelope.clone(),
            value: frame.status_text.clone(),
        },
    );
    emit_playback_state_snapshot(app, envelope, playback_state);
}

fn playback_tick_duration() -> std::time::Duration {
    let millis = crate::bridges::TELEMETRY_INTERVAL_MS
        .load(std::sync::atomic::Ordering::Relaxed)
        .max(1);
    std::time::Duration::from_millis(millis)
}

fn playback_elapsed_usec(started_at: std::time::Instant, speed: f32) -> u64 {
    (started_at.elapsed().as_micros() as f64 * f64::from(speed))
        .round()
        .clamp(0.0, u64::MAX as f64) as u64
}

async fn spawn_playback_task(
    app: tauri::AppHandle,
    playback_runtime: PlaybackRuntimeState,
    generation: u64,
    envelope: SessionEnvelope,
    start_cursor_usec: u64,
    end_usec: u64,
    speed: f32,
) {
    let task = tokio::spawn({
        let app = app.clone();
        let playback_runtime = playback_runtime.clone();
        let envelope = envelope.clone();
        async move {
            let started_at = std::time::Instant::now();
            loop {
                tokio::time::sleep(playback_tick_duration()).await;
                if !playback_runtime.matches_generation(generation).await {
                    break;
                }

                let next_cursor_usec = start_cursor_usec
                    .saturating_add(playback_elapsed_usec(started_at, speed))
                    .min(end_usec);

                let state: tauri::State<'_, AppState> = app.state();
                let mut guard = state.log_store.lock().await;
                let Some(store) = guard.as_mut() else {
                    break;
                };

                store.set_playback_cursor_usec(Some(next_cursor_usec));
                let frame = store.playback_frame();
                let playback_state = if next_cursor_usec >= end_usec {
                    playback_runtime.prepare_end(store).await
                } else {
                    playback_runtime.sync_playing(store).await
                };
                drop(guard);

                if !playback_runtime.matches_generation(generation).await {
                    break;
                }

                emit_playback_frame(&app, &envelope, &frame, &playback_state);
                if playback_state.status == ReplayStatus::Ended {
                    break;
                }
            }
        }
    });

    playback_runtime
        .track_spawned_task(generation, task.abort_handle())
        .await;
}

async fn playback_stop_inner(
    state: &AppState,
    app: &tauri::AppHandle,
) -> Result<PlaybackState, String> {
    let playback_envelope = {
        state.live_runtime.with_runtime(|runtime| {
            runtime
                .session_runtime()
                .active_playback_envelope(OperationId::ReplayStop)
                .ok()
        })
    };

    let idle_state = state.playback_runtime.prepare_idle().await;
    *state.log_store.lock().await = None;

    if let Some(envelope) = playback_envelope.as_ref() {
        emit_playback_state_snapshot(app, envelope, &idle_state);
    }

    let live_envelope = state
        .live_runtime
        .with_runtime(|runtime| runtime.close_playback_session());
    if let Some(envelope) = live_envelope {
        crate::commands::emit_live_snapshot_restore(state, app, envelope).await;
    }

    Ok(idle_state)
}

#[tauri::command]
pub(crate) async fn playback_seek(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    cursor_usec: Option<u64>,
) -> Result<PlaybackSeekResult, String> {
    let mut guard = state.log_store.lock().await;
    let store = guard.as_mut().ok_or_else(|| "no log open".to_string())?;
    let envelope = {
        state.live_runtime.with_runtime(|runtime| {
            runtime
                .session_runtime_mut()
                .issue_playback_seek()
                .map_err(|failure| failure.reason.message)
        })?
    };
    state
        .guided_runtime
        .lock()
        .await
        .reset_for_playback("playback source switched");
    let result = store.seek_playback(cursor_usec, envelope.clone());
    let playback_state = state.playback_runtime.prepare_seek(store).await;
    let frame = store.playback_frame();
    emit_playback_frame(&app, &envelope, &frame, &playback_state);
    Ok(result)
}

#[tauri::command]
pub(crate) async fn playback_play(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<PlaybackState, String> {
    let envelope = {
        state.live_runtime.with_runtime(|runtime| {
            runtime
                .session_runtime()
                .active_playback_envelope(OperationId::ReplayPlay)
                .map_err(|failure| failure.reason.message)
        })?
    };
    let mut guard = state.log_store.lock().await;
    let store = guard.as_mut().ok_or_else(|| "no log open".to_string())?;
    let Some((start_usec, end_usec)) = store.playback_bounds() else {
        return Err("open log has no replayable entries".to_string());
    };
    let start_cursor_usec = store.resolved_playback_cursor_usec().unwrap_or(start_usec);
    if start_cursor_usec >= end_usec {
        let playback_state = state.playback_runtime.prepare_end(store).await;
        let frame = store.playback_frame();
        emit_playback_frame(&app, &envelope, &frame, &playback_state);
        return Ok(playback_state);
    }
    let playback_state = state.playback_runtime.prepare_play(store).await;
    let frame = store.playback_frame();
    let speed = playback_state.speed;
    let generation = state.playback_runtime.current_generation().await;
    emit_playback_frame(&app, &envelope, &frame, &playback_state);
    drop(guard);
    spawn_playback_task(
        app,
        state.playback_runtime.clone(),
        generation,
        envelope,
        start_cursor_usec,
        end_usec,
        speed,
    )
    .await;
    Ok(playback_state)
}

#[tauri::command]
pub(crate) async fn playback_pause(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<PlaybackState, String> {
    let envelope = {
        state.live_runtime.with_runtime(|runtime| {
            runtime
                .session_runtime()
                .active_playback_envelope(OperationId::ReplayPause)
                .map_err(|failure| failure.reason.message)
        })?
    };
    let mut guard = state.log_store.lock().await;
    let store = guard.as_mut().ok_or_else(|| "no log open".to_string())?;
    let playback_state = state.playback_runtime.prepare_pause(store).await;
    let frame = store.playback_frame();
    emit_playback_frame(&app, &envelope, &frame, &playback_state);
    Ok(playback_state)
}

#[tauri::command]
pub(crate) async fn playback_set_speed(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    speed: f32,
) -> Result<PlaybackState, String> {
    let envelope = {
        state.live_runtime.with_runtime(|runtime| {
            runtime
                .session_runtime()
                .active_playback_envelope(OperationId::ReplaySetSpeed)
                .map_err(|failure| failure.reason.message)
        })?
    };
    let mut guard = state.log_store.lock().await;
    let store = guard.as_mut().ok_or_else(|| "no log open".to_string())?;
    let Some((start_usec, end_usec)) = store.playback_bounds() else {
        return Err("open log has no replayable entries".to_string());
    };
    let start_cursor_usec = store.resolved_playback_cursor_usec().unwrap_or(start_usec);
    let playback_state = state.playback_runtime.prepare_speed(store, speed).await?;
    let frame = store.playback_frame();
    let generation = state.playback_runtime.current_generation().await;
    let should_resume = playback_state.status == ReplayStatus::Playing;
    emit_playback_frame(&app, &envelope, &frame, &playback_state);
    drop(guard);
    if should_resume {
        spawn_playback_task(
            app,
            state.playback_runtime.clone(),
            generation,
            envelope,
            start_cursor_usec,
            end_usec,
            playback_state.speed,
        )
        .await;
    }
    Ok(playback_state)
}

#[tauri::command]
pub(crate) async fn playback_stop(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<PlaybackState, String> {
    playback_stop_inner(state.inner(), &app).await
}

#[tauri::command]
pub(crate) async fn log_raw_messages_query(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    request: RawMessageQuery,
) -> Result<RawMessagePage, String> {
    let store = store_for_entry(state.inner(), &app, &request.entry_id).await?;
    blocking_raw_message_query(store, request).await
}

#[tauri::command]
pub(crate) async fn log_chart_series_query(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    request: ChartSeriesRequest,
) -> Result<ChartSeriesPage, String> {
    let store = store_for_entry(state.inner(), &app, &request.entry_id).await?;
    blocking_chart_series_query(store, request).await
}

#[tauri::command]
pub(crate) async fn log_query(
    state: tauri::State<'_, AppState>,
    msg_type: String,
    start_usec: Option<u64>,
    end_usec: Option<u64>,
    max_points: Option<usize>,
) -> Result<Vec<LogDataPoint>, String> {
    let store = helpers::with_log_store(&state).await?;
    log_engine::query_log_messages(&store, &msg_type, start_usec, end_usec, max_points)
}

#[tauri::command]
pub(crate) async fn log_get_flight_path(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    entry_id: Option<String>,
    start_usec: Option<u64>,
    end_usec: Option<u64>,
    max_points: Option<usize>,
) -> Result<Vec<FlightPathPoint>, String> {
    let store = if let Some(entry_id) = entry_id {
        store_for_entry(state.inner(), &app, &entry_id).await?
    } else {
        helpers::with_log_store(&state).await?.clone()
    };
    log_engine::flight_path_points(&store, start_usec, end_usec, max_points)
}

#[tauri::command]
pub(crate) async fn log_get_telemetry_track(
    state: tauri::State<'_, AppState>,
    max_points: Option<usize>,
) -> Result<Vec<TelemetrySnapshot>, String> {
    let store = helpers::with_log_store(&state).await?;
    Ok(log_engine::telemetry_track(&store, max_points))
}

#[tauri::command]
pub(crate) async fn log_get_summary(
    state: tauri::State<'_, AppState>,
) -> Result<Option<LogSummary>, String> {
    let guard = state.log_store.lock().await;
    Ok(guard.as_ref().map(|store| store.summary().clone()))
}

#[tauri::command]
pub(crate) async fn log_close(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    playback_stop_inner(state.inner(), &app).await?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn log_get_flight_summary(
    state: tauri::State<'_, AppState>,
) -> Result<FlightSummary, String> {
    let store = helpers::with_log_store(&state).await?;
    Ok(log_engine::flight_summary(&store))
}

#[tauri::command]
pub(crate) async fn log_export(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    request: LogExportRequest,
) -> Result<LogExportResult, String> {
    if request.format != LogExportFormat::Csv {
        return Err(operation_failure_json(OperationFailure {
            operation_id: OperationId::LogExport,
            reason: Reason {
                kind: ReasonKind::Unsupported,
                message: format!(
                    "log export format {:?} is not implemented yet",
                    request.format
                ),
            },
        }));
    }

    run_log_operation(
        &state.log_operation,
        OperationId::LogExport,
        app_log_progress_emitter(app.clone()),
        move |reporter| {
            let app = app.clone();
            let request = request.clone();
            async move {
                reporter.set_instance_id(Some(request.instance_id.clone()));
                reporter.progress(
                    LogOperationPhase::Exporting,
                    0,
                    None,
                    None,
                    Some(request.entry_id.clone()),
                    Some("exporting filtered CSV".into()),
                )?;
                let state: tauri::State<'_, AppState> = app.state();
                let store = store_for_entry(state.inner(), &app, &request.entry_id).await?;
                let result =
                    blocking_export_csv(store, request.clone(), reporter.cancel.clone()).await?;
                reporter.progress(
                    LogOperationPhase::Exporting,
                    result.rows_written,
                    Some(result.rows_written),
                    Some(100.0),
                    Some(request.entry_id.clone()),
                    Some("export completed".into()),
                )?;
                Ok(result)
            }
        },
    )
    .await
}

#[tauri::command]
pub(crate) async fn log_export_csv(
    state: tauri::State<'_, AppState>,
    path: String,
    start_usec: Option<u64>,
    end_usec: Option<u64>,
) -> Result<u64, String> {
    let store = helpers::with_log_store(&state).await?.clone();
    blocking_compat_csv_export(store, path, start_usec, end_usec).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ipc::SourceKind;
    use ironwing_core::log_engine::StoredEntry;
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex as StdMutex};
    use std::time::Duration;

    fn collect_progress_events(
        progress: Arc<StdMutex<Vec<LogOperationProgress>>>,
    ) -> LogProgressEmitter {
        Arc::new(move |event| {
            progress
                .lock()
                .expect("progress collector lock poisoned")
                .push(event);
        })
    }

    fn stored_entry(
        sequence: u64,
        timestamp_usec: u64,
        msg_name: &str,
        fields: HashMap<String, f64>,
    ) -> StoredEntry {
        StoredEntry::from_numeric_fields(sequence, timestamp_usec, msg_name, fields)
    }

    fn store_from_entries(path: &str, log_type: LogType, entries: Vec<StoredEntry>) -> LogStore {
        LogStore::from_entries(path, log_type, entries)
    }

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "ironwing-logs-{name}-{}-{nonce}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    fn empty_store(path: &str) -> LogStore {
        LogStore::from_entries(path, LogType::Tlog, Vec::new())
    }

    #[test]
    fn reusable_library_store_prefers_active_store_for_matching_entry() {
        let mut active = empty_store("/logs/a.tlog");
        active.set_entry_id(Some("entry-a".into()));

        let mut cached = empty_store("/logs/a.tlog");
        cached.set_entry_id(Some("entry-a".into()));

        let reused =
            reusable_library_store(Some(&active), Some(&cached), "entry-a", "/logs/a.tlog")
                .expect("matching store");

        assert_eq!(reused.summary().file_name, active.summary().file_name);
        assert_eq!(reused.source_path(), active.source_path());
    }

    #[test]
    fn reusable_library_store_falls_back_to_cached_store_for_repeated_entry_queries() {
        let mut active = empty_store("/logs/active.tlog");
        active.set_entry_id(Some("entry-active".into()));

        let mut cached = empty_store("/logs/cached.tlog");
        cached.set_entry_id(Some("entry-cached".into()));

        let reused = reusable_library_store(
            Some(&active),
            Some(&cached),
            "entry-cached",
            "/logs/cached.tlog",
        )
        .expect("cached store reused");

        assert_eq!(reused.entry_id(), Some("entry-cached"));
        assert_eq!(reused.source_path(), "/logs/cached.tlog");
    }

    fn playback_test_store() -> LogStore {
        store_from_entries(
            "test.tlog",
            LogType::Tlog,
            vec![
                stored_entry(
                    0,
                    100,
                    "HEARTBEAT",
                    HashMap::from([
                        ("custom_mode".to_string(), 4.0),
                        ("base_mode".to_string(), 128.0),
                    ]),
                ),
                stored_entry(
                    1,
                    150,
                    "VFR_HUD",
                    HashMap::from([("alt".to_string(), 12.3), ("groundspeed".to_string(), 4.5)]),
                ),
                stored_entry(
                    2,
                    200,
                    "VFR_HUD",
                    HashMap::from([("alt".to_string(), 18.6), ("groundspeed".to_string(), 5.5)]),
                ),
            ],
        )
    }

    #[tokio::test(flavor = "current_thread")]
    async fn playback_runtime_play_pause_seek_speed_stop() {
        let mut store = playback_test_store();
        let runtime = PlaybackRuntimeState::new();

        let ready = runtime.prepare_ready(&store, false).await;
        assert_eq!(ready.status, ReplayStatus::Ready);
        assert_eq!(ready.cursor_usec, Some(100));
        assert!(!ready.barrier_ready);

        let playing = runtime.prepare_play(&store).await;
        assert_eq!(playing.status, ReplayStatus::Playing);
        assert_eq!(playing.speed, 1.0);

        store.set_playback_cursor_usec(Some(150));
        let paused = runtime.prepare_pause(&store).await;
        assert_eq!(paused.status, ReplayStatus::Paused);
        assert_eq!(paused.cursor_usec, Some(150));

        let faster = runtime
            .prepare_speed(&store, 4.0)
            .await
            .expect("valid speed");
        assert_eq!(faster.status, ReplayStatus::Paused);
        assert_eq!(faster.speed, 4.0);

        store.set_playback_cursor_usec(Some(180));
        let seeking = runtime.prepare_seek(&store).await;
        assert_eq!(seeking.status, ReplayStatus::Seeking);
        assert_eq!(seeking.cursor_usec, Some(180));

        let replaying = runtime.prepare_play(&store).await;
        assert_eq!(replaying.status, ReplayStatus::Playing);
        assert_eq!(replaying.speed, 4.0);

        store.set_playback_cursor_usec(Some(200));
        let ended = runtime.prepare_end(&store).await;
        assert_eq!(ended.status, ReplayStatus::Ended);
        assert_eq!(ended.cursor_usec, Some(200));

        let idle = runtime.prepare_idle().await;
        assert_eq!(idle.status, ReplayStatus::Idle);
        assert_eq!(idle.cursor_usec, None);
        assert_eq!(idle.start_usec, None);
        assert_eq!(idle.end_usec, None);
        assert_eq!(idle.speed, 1.0);
    }

    #[tokio::test(flavor = "current_thread")]
    async fn playback_seek_invalidates_stale_frames() {
        let mut store = playback_test_store();
        let runtime = PlaybackRuntimeState::new();

        runtime.prepare_ready(&store, false).await;
        runtime.prepare_play(&store).await;
        let play_generation = runtime.current_generation().await;
        assert!(runtime.matches_generation(play_generation).await);

        store.set_playback_cursor_usec(Some(150));
        runtime.prepare_seek(&store).await;
        let seek_generation = runtime.current_generation().await;
        assert_ne!(seek_generation, play_generation);
        assert!(!runtime.matches_generation(play_generation).await);
        assert!(runtime.matches_generation(seek_generation).await);

        runtime.prepare_idle().await;
        let stop_generation = runtime.current_generation().await;
        assert_ne!(stop_generation, seek_generation);
        assert!(!runtime.matches_generation(seek_generation).await);
    }

    #[test]
    fn playback_seek_clamps_cursor_and_keeps_envelope() {
        let mut store = store_from_entries(
            "seek.tlog",
            LogType::Tlog,
            vec![
                stored_entry(0, 100, "GPS_RAW_INT", HashMap::new()),
                stored_entry(1, 200, "GPS_RAW_INT", HashMap::new()),
            ],
        );
        let envelope = SessionEnvelope {
            session_id: "session-1".into(),
            source_kind: SourceKind::Playback,
            seek_epoch: 1,
            reset_revision: 1,
        };

        let result = store.seek_playback(Some(500), envelope.clone());

        assert_eq!(result.envelope, envelope);
        assert_eq!(result.cursor_usec, Some(200));
    }

    #[tokio::test(flavor = "current_thread")]
    async fn logs_operation_cancel_stops_progress() {
        let state = LogOperationState::new();
        let events = Arc::new(StdMutex::new(Vec::new()));
        let cancel_state = state.clone();
        let cancel_task = tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(25)).await;
            cancel_state.cancel().await
        });

        let result = run_log_operation(
            &state,
            OperationId::LogLibraryReindex,
            collect_progress_events(events.clone()),
            |reporter| async move {
                reporter.progress(
                    LogOperationPhase::Parsing,
                    0,
                    None,
                    None,
                    Some("entry-1".to_string()),
                    None,
                )?;
                tokio::time::sleep(Duration::from_millis(250)).await;
                reporter.progress(
                    LogOperationPhase::Indexing,
                    1,
                    Some(1),
                    Some(100.0),
                    Some("entry-1".to_string()),
                    None,
                )?;
                Ok::<(), String>(())
            },
        )
        .await;

        assert!(cancel_task.await.expect("cancel task joined"));
        let error = result.expect_err("operation should cancel");
        assert!(error.contains("cancelled"));

        let phases: Vec<_> = events
            .lock()
            .expect("progress collector lock poisoned")
            .iter()
            .map(|event| event.phase)
            .collect();
        assert_eq!(
            phases,
            vec![
                LogOperationPhase::Queued,
                LogOperationPhase::Parsing,
                LogOperationPhase::Cancelled,
            ]
        );
    }

    #[tokio::test(flavor = "current_thread")]
    async fn logs_progress_failed_phase_emitted() {
        let state = LogOperationState::new();
        let events = Arc::new(StdMutex::new(Vec::new()));

        let error = run_log_operation(
            &state,
            OperationId::LogOpen,
            collect_progress_events(events.clone()),
            |reporter| async move {
                reporter.progress(LogOperationPhase::Parsing, 0, None, None, None, None)?;
                Err::<(), String>("synthetic parse failure".to_string())
            },
        )
        .await
        .expect_err("operation should fail");

        assert_eq!(error, "synthetic parse failure");

        let collected = events.lock().expect("progress collector lock poisoned");
        assert_eq!(collected.len(), 3);
        assert_eq!(collected[0].phase, LogOperationPhase::Queued);
        assert_eq!(collected[1].phase, LogOperationPhase::Parsing);
        assert_eq!(collected[2].phase, LogOperationPhase::Failed);
        assert_eq!(
            collected[2].message.as_deref(),
            Some("synthetic parse failure")
        );
    }

    #[test]
    fn log_operation_reporter_progress_carries_export_instance_id() {
        let progress = Arc::new(StdMutex::new(Vec::<LogOperationProgress>::new()));
        let reporter = LogOperationReporter::new(
            OperationId::LogExport,
            collect_progress_events(progress.clone()),
            CancellationToken::new(),
        );

        reporter.set_instance_id(Some("export-42".into()));
        reporter
            .progress(
                LogOperationPhase::Exporting,
                1,
                Some(2),
                Some(50.0),
                Some("entry-a".into()),
                Some("exporting".into()),
            )
            .expect("emit progress");

        let events = progress.lock().expect("progress lock");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].instance_id.as_deref(), Some("export-42"));
    }

    #[tokio::test(flavor = "current_thread")]
    async fn blocking_raw_message_query_uses_core_helper() {
        let store = store_from_entries(
            "blocking-raw-query.tlog",
            LogType::Tlog,
            vec![stored_entry(
                0,
                100,
                "HEARTBEAT",
                HashMap::from([("custom_mode".to_string(), 4.0)]),
            )],
        );
        let request = RawMessageQuery {
            entry_id: "entry-tlog".into(),
            cursor: None,
            start_usec: None,
            end_usec: None,
            message_types: vec!["HEARTBEAT".into()],
            text: None,
            field_filters: vec![],
            limit: 25,
            include_detail: true,
            include_hex: false,
        };

        let page = blocking_raw_message_query(store, request)
            .await
            .expect("blocking raw query");

        assert_eq!(page.entry_id, "entry-tlog");
        assert_eq!(page.items.len(), 1);
        assert_eq!(page.items[0].message_type, "HEARTBEAT");
    }

    #[tokio::test(flavor = "current_thread")]
    async fn blocking_chart_series_query_uses_core_helper() {
        let store = store_from_entries(
            "blocking-chart-query.tlog",
            LogType::Tlog,
            vec![stored_entry(
                0,
                100,
                "VFR_HUD",
                HashMap::from([("alt".to_string(), 42.0)]),
            )],
        );
        let request = ChartSeriesRequest {
            entry_id: "entry-tlog".into(),
            selectors: vec![crate::ipc::logs::ChartSeriesSelector {
                message_type: "VFR_HUD".into(),
                field: "alt".into(),
                label: "Altitude".into(),
                unit: Some("m".into()),
            }],
            start_usec: None,
            end_usec: None,
            max_points: Some(10),
        };

        let page = blocking_chart_series_query(store, request)
            .await
            .expect("blocking chart query");

        assert_eq!(page.entry_id, "entry-tlog");
        assert_eq!(page.series.len(), 1);
        assert_eq!(page.series[0].points.len(), 1);
        assert_eq!(page.series[0].points[0].value, 42.0);
    }

    #[test]
    fn write_export_bytes_replaces_existing_destination() {
        let temp_dir = temp_dir("write-export-bytes");
        let path = temp_dir.join("export.csv");
        std::fs::write(&path, "old\n").expect("seed destination");
        let cancel = CancellationToken::new();

        let bytes_written = write_export_bytes(&path.to_string_lossy(), b"new\n", &cancel)
            .expect("write export bytes");

        assert_eq!(bytes_written, 4);
        assert_eq!(
            std::fs::read_to_string(&path).expect("read export"),
            "new\n"
        );
    }

    #[tokio::test(flavor = "current_thread")]
    async fn blocking_export_csv_writes_core_csv_bytes() {
        let temp_dir = temp_dir("blocking-export-query");
        let path = temp_dir.join("blocking.csv");
        let store = store_from_entries(
            "blocking-export.tlog",
            LogType::Tlog,
            vec![stored_entry(
                0,
                100,
                "GLOBAL_POSITION_INT",
                HashMap::from([("relative_alt".to_string(), 10_000.0)]),
            )],
        );
        let request = LogExportRequest {
            entry_id: "entry-tlog".into(),
            instance_id: "export-blocking".into(),
            format: LogExportFormat::Csv,
            destination_path: path.to_string_lossy().to_string(),
            start_usec: None,
            end_usec: None,
            message_types: vec!["GLOBAL_POSITION_INT".into()],
            text: None,
            field_filters: vec![],
        };

        let result = blocking_export_csv(store, request, CancellationToken::new())
            .await
            .expect("blocking export query");

        assert_eq!(result.rows_written, 1);
        assert!(result.bytes_written > 0);
        let csv = std::fs::read_to_string(path).expect("read exported csv");
        assert!(csv.contains("timestamp_sec,msg_type,relative_alt"));
        assert!(csv.contains("0.000100,GLOBAL_POSITION_INT,10000"));
    }

    #[tokio::test(flavor = "current_thread")]
    async fn run_log_operation_waits_for_export_cleanup_before_clearing_active_operation() {
        let state = LogOperationState::new();
        let emit: LogProgressEmitter = Arc::new(|_| {});
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();
        let (cleanup_tx, mut cleanup_rx) = tokio::sync::mpsc::unbounded_channel();

        let handle = tokio::spawn({
            let state = state.clone();
            async move {
                run_log_operation(
                    &state,
                    OperationId::LogExport,
                    emit,
                    move |reporter| async move {
                        let _ = started_tx.send(());
                        reporter.cancel.cancelled().await;
                        tokio::time::sleep(Duration::from_millis(50)).await;
                        let _ = cleanup_tx.send(());
                        Err(cancelled_log_operation_error(OperationId::LogExport))
                    },
                )
                .await
            }
        });

        started_rx.await.expect("worker started");
        assert!(state.cancel().await);
        tokio::time::sleep(Duration::from_millis(10)).await;
        assert!(!handle.is_finished());
        cleanup_rx.recv().await.expect("cleanup finished");

        let result: Result<(), String> = handle.await.expect("operation join");
        assert_eq!(
            result,
            Err(cancelled_log_operation_error(OperationId::LogExport))
        );
    }
}
