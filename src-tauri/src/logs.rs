use std::collections::{BTreeMap, HashMap};
use std::io::Cursor;
use std::sync::{Arc, Mutex as StdMutex};

use mavkit::dialect::MavMessage;
use mavlink::{
    Message, ReadVersion, async_peek_reader::AsyncPeekReader, read_versioned_raw_message_async,
};
use serde::Serialize;
use serde_json::{Map as JsonMap, Value as JsonValue};
use tauri::Manager;
use tokio::task::AbortHandle;
use tokio_util::sync::CancellationToken;

mod raw_messages;

use crate::{
    AppState,
    e2e_emit::emit_event,
    helpers::{self, operation_failure_json},
    ipc::{
        DomainProvenance, DomainValue, LogDiagnostic, LogOperationPhase, LogOperationProgress,
        OperationFailure, OperationId, PlaybackSnapshot, Reason, ReasonKind, ReplayStatus,
        ScopedEvent, SessionConnection, SessionEnvelope, SessionSnapshot, SessionStatus,
        StatusTextSnapshot, SupportSnapshot, TelemetrySnapshot as GroupedTelemetrySnapshot,
        VehicleState,
        logs::{
            ChartPoint, ChartSeries, ChartSeriesPage, ChartSeriesRequest, LogDiagnosticSeverity,
            LogDiagnosticSource, LogExportFormat, LogExportRequest, LogExportResult,
            RawMessageFieldFilter, RawMessagePage, RawMessageQuery,
        },
        playback::{PlaybackSeekResult, PlaybackState},
        status_text_snapshot_from_entries, telemetry_snapshot_from_value,
    },
};

#[derive(Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum LogType {
    Tlog,
    Bin,
}

#[derive(Serialize, Clone)]
pub(crate) struct LogSummary {
    pub(crate) file_name: String,
    pub(crate) start_usec: u64,
    pub(crate) end_usec: u64,
    pub(crate) duration_secs: f64,
    pub(crate) total_entries: usize,
    pub(crate) message_types: HashMap<String, usize>,
    pub(crate) log_type: LogType,
}

#[derive(Serialize, Clone)]
pub(crate) struct LogDataPoint {
    timestamp_usec: u64,
    fields: HashMap<String, f64>,
}

#[derive(Clone)]
pub(crate) struct StoredEntry {
    sequence: u64,
    timestamp_usec: u64,
    msg_name: String,
    fields: HashMap<String, f64>,
    field_values: BTreeMap<String, JsonValue>,
    raw_len_bytes: u32,
    raw_payload: Option<Vec<u8>>,
    system_id: Option<u8>,
    component_id: Option<u8>,
    text: String,
}

#[derive(Clone)]
pub(crate) struct LogStore {
    pub(crate) summary: LogSummary,
    source_path: String,
    entry_id: Option<String>,
    entries: Vec<StoredEntry>,
    type_index: HashMap<String, Vec<usize>>,
    playback_cursor_usec: Option<u64>,
}

pub(crate) struct ParsedLog {
    pub(crate) store: LogStore,
    pub(crate) diagnostics: Vec<LogDiagnostic>,
}

#[derive(Clone, PartialEq)]
pub(crate) struct PlaybackFrame {
    pub session: DomainValue<SessionSnapshot>,
    pub telemetry: GroupedTelemetrySnapshot,
    pub support: SupportSnapshot,
    pub status_text: StatusTextSnapshot,
    pub playback: PlaybackSnapshot,
}

const AVAILABLE_PLAYBACK_SPEEDS: [f32; 6] = [0.5, 1.0, 2.0, 4.0, 8.0, 16.0];
const DEFAULT_COMPAT_QUERY_POINTS: usize = 2_000;
const DEFAULT_CHART_QUERY_POINTS: usize = 1_000;
const MAX_CHART_QUERY_POINTS: usize = 5_000;
const MAX_RAW_MESSAGE_LIMIT: usize = 500;
const DEFAULT_RAW_MESSAGE_LIMIT: usize = 100;
const DEFAULT_FLIGHT_PATH_POINTS: usize = 1_000;
const MAX_FLIGHT_PATH_POINTS: usize = 5_000;

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
        PlaybackState {
            status: ReplayStatus::Idle,
            entry_id: None,
            operation_id: None,
            cursor_usec: None,
            start_usec: None,
            end_usec: None,
            duration_secs: None,
            speed: 1.0,
            available_speeds: AVAILABLE_PLAYBACK_SPEEDS.to_vec(),
            barrier_ready: false,
            readonly: true,
            diagnostic: None,
        }
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
        PlaybackState {
            status,
            entry_id: None,
            operation_id,
            cursor_usec: store.resolved_playback_cursor_usec(),
            start_usec: Some(store.summary.start_usec),
            end_usec: Some(store.summary.end_usec),
            duration_secs: Some(store.summary.duration_secs),
            speed: self.state.speed,
            available_speeds: AVAILABLE_PLAYBACK_SPEEDS.to_vec(),
            barrier_ready,
            readonly: true,
            diagnostic: None,
        }
    }
}

fn validate_playback_speed(speed: f32) -> Result<(), String> {
    if AVAILABLE_PLAYBACK_SPEEDS
        .iter()
        .any(|candidate| (*candidate - speed).abs() < f32::EPSILON)
    {
        Ok(())
    } else {
        Err(format!(
            "unsupported playback speed {speed}; expected one of {:?}",
            AVAILABLE_PLAYBACK_SPEEDS
        ))
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
    Arc::new(move |progress| emit_event(&app, "log://progress", &progress))
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

impl LogStore {
    pub(crate) fn playback_bounds(&self) -> Option<(u64, u64)> {
        (!self.entries.is_empty()).then_some((self.summary.start_usec, self.summary.end_usec))
    }

    pub(crate) fn resolved_playback_cursor_usec(&self) -> Option<u64> {
        self.resolve_cursor_usec(self.playback_cursor_usec)
    }

    pub(crate) fn set_playback_cursor_usec(&mut self, cursor_usec: Option<u64>) -> Option<u64> {
        self.playback_cursor_usec = self.resolve_cursor_usec(cursor_usec);
        self.playback_cursor_usec
    }

    pub(crate) fn seek_playback(
        &mut self,
        cursor_usec: Option<u64>,
        envelope: SessionEnvelope,
    ) -> PlaybackSeekResult {
        self.playback_cursor_usec = self.resolve_cursor_usec(cursor_usec);
        PlaybackSeekResult {
            envelope,
            cursor_usec: self.playback_cursor_usec,
        }
    }

    pub(crate) fn playback_frame(&self) -> PlaybackFrame {
        let cursor_usec = self.resolve_cursor_usec(self.playback_cursor_usec);
        let telemetry = self.telemetry_at(cursor_usec);
        let vehicle_state = self.vehicle_state_at(&telemetry);

        PlaybackFrame {
            session: DomainValue::present(
                SessionSnapshot {
                    status: SessionStatus::Active,
                    connection: SessionConnection::Disconnected,
                    vehicle_state,
                    home_position: None,
                },
                DomainProvenance::Playback,
            ),
            telemetry: telemetry_snapshot_from_value(
                &serde_json::to_value(telemetry).unwrap_or(serde_json::Value::Null),
                DomainProvenance::Playback,
            ),
            support: DomainValue::missing(DomainProvenance::Playback),
            status_text: status_text_snapshot_from_entries(Vec::new(), DomainProvenance::Playback),
            playback: PlaybackSnapshot { cursor_usec },
        }
    }

    fn resolve_cursor_usec(&self, cursor_usec: Option<u64>) -> Option<u64> {
        if self.entries.is_empty() {
            return None;
        }

        let min = self.summary.start_usec;
        let max = self.summary.end_usec;
        Some(cursor_usec.unwrap_or(min).clamp(min, max))
    }

    fn telemetry_at(&self, cursor_usec: Option<u64>) -> TelemetrySnapshot {
        let Some(cursor_usec) = cursor_usec else {
            return TelemetrySnapshot::default();
        };

        let mut telemetry = TelemetrySnapshot::default();
        for entry in self
            .entries
            .iter()
            .take_while(|entry| entry.timestamp_usec <= cursor_usec)
        {
            if self.summary.log_type == LogType::Bin {
                apply_bin_entry(&mut telemetry, entry);
            } else {
                apply_tlog_entry(&mut telemetry, entry);
            }
        }
        telemetry.timestamp_usec = cursor_usec;
        telemetry
    }

    fn vehicle_state_at(&self, telemetry: &TelemetrySnapshot) -> Option<VehicleState> {
        let armed = telemetry.armed?;
        let custom_mode = telemetry.custom_mode?;

        Some(VehicleState {
            armed,
            custom_mode,
            mode_name: format!("Mode {custom_mode}"),
            system_status: mavkit::SystemStatus::Active,
            vehicle_type: Default::default(),
            autopilot: Default::default(),
            system_id: 0,
            component_id: 0,
            heartbeat_received: false,
        })
    }
}

fn bounded_max_points(max_points: Option<usize>, default: usize, max: usize) -> usize {
    match max_points {
        Some(value) if value > 0 => value.min(max),
        _ => default,
    }
}

fn bounded_page_limit(limit: u32, default: usize, max: usize) -> usize {
    let requested = usize::try_from(limit).unwrap_or(max);
    if requested == 0 {
        default
    } else {
        requested.min(max)
    }
}

fn parse_raw_cursor(cursor: Option<&str>) -> Result<usize, String> {
    cursor
        .map(|value| {
            usize::from_str_radix(value, 16)
                .map_err(|error| format!("invalid raw message cursor {value}: {error}"))
        })
        .transpose()
        .map(|value| value.unwrap_or(0))
}

fn encode_raw_cursor(index: usize) -> String {
    format!("{index:016x}")
}

fn normalized_text_filter(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|candidate| !candidate.is_empty())
        .map(|candidate| candidate.to_ascii_lowercase())
}

fn json_value_matches_text(value: &JsonValue, needle: &str) -> bool {
    match value {
        JsonValue::String(text) => text.to_ascii_lowercase().contains(needle),
        JsonValue::Number(number) => number.to_string().to_ascii_lowercase().contains(needle),
        JsonValue::Bool(boolean) => boolean.to_string().contains(needle),
        JsonValue::Null => "null".contains(needle),
        JsonValue::Array(items) => items
            .iter()
            .any(|item| json_value_matches_text(item, needle)),
        JsonValue::Object(map) => map.iter().any(|(key, value)| {
            key.to_ascii_lowercase().contains(needle) || json_value_matches_text(value, needle)
        }),
    }
}

fn entry_matches_text_filter(entry: &StoredEntry, text: &str) -> bool {
    entry.msg_name.to_ascii_lowercase().contains(text)
        || entry.text.to_ascii_lowercase().contains(text)
        || entry.field_values.iter().any(|(key, value)| {
            key.to_ascii_lowercase().contains(text) || json_value_matches_text(value, text)
        })
}

fn entry_matches_field_filters(entry: &StoredEntry, filters: &[RawMessageFieldFilter]) -> bool {
    filters.iter().all(|filter| {
        let Some(value) = entry.field_values.get(&filter.field) else {
            return false;
        };
        match normalized_text_filter(filter.value_text.as_deref()) {
            Some(needle) => json_value_matches_text(value, &needle),
            None => true,
        }
    })
}

fn entry_matches_common_filters(
    entry: &StoredEntry,
    start_usec: Option<u64>,
    end_usec: Option<u64>,
    message_types: &[String],
    text: Option<&str>,
    field_filters: &[RawMessageFieldFilter],
) -> bool {
    if let Some(start) = start_usec
        && entry.timestamp_usec < start
    {
        return false;
    }
    if let Some(end) = end_usec
        && entry.timestamp_usec > end
    {
        return false;
    }
    if !message_types.is_empty()
        && !message_types
            .iter()
            .any(|candidate| candidate == &entry.msg_name)
    {
        return false;
    }
    if let Some(text) = normalized_text_filter(text)
        && !entry_matches_text_filter(entry, &text)
    {
        return false;
    }
    entry_matches_field_filters(entry, field_filters)
}

fn query_chart_series(store: &LogStore, request: &ChartSeriesRequest) -> ChartSeriesPage {
    let max_points = bounded_max_points(
        request.max_points.map(|value| value as usize),
        DEFAULT_CHART_QUERY_POINTS,
        MAX_CHART_QUERY_POINTS,
    );
    let series = request
        .selectors
        .iter()
        .map(|selector| {
            let mut points = Vec::new();
            if let Some(indices) = store.type_index.get(&selector.message_type) {
                for &index in indices {
                    let entry = &store.entries[index];
                    if !entry_matches_common_filters(
                        entry,
                        request.start_usec,
                        request.end_usec,
                        std::slice::from_ref(&selector.message_type),
                        None,
                        &[],
                    ) {
                        continue;
                    }
                    if let Some(value) = entry.fields.get(&selector.field).copied() {
                        points.push(ChartPoint {
                            timestamp_usec: entry.timestamp_usec,
                            value,
                        });
                    }
                }
            }

            let points = if points.len() > max_points {
                helpers::downsample(points, max_points)
            } else {
                points
            };

            ChartSeries {
                selector: selector.clone(),
                points,
            }
        })
        .collect();

    ChartSeriesPage {
        entry_id: request.entry_id.clone(),
        start_usec: request.start_usec,
        end_usec: request.end_usec,
        series,
        diagnostics: Vec::new(),
    }
}

fn filtered_flight_path_points(
    store: &LogStore,
    start_usec: Option<u64>,
    end_usec: Option<u64>,
    max_points: Option<usize>,
) -> Result<Vec<FlightPathPoint>, String> {
    let gps_type = if store.type_index.contains_key("GLOBAL_POSITION_INT") {
        "GLOBAL_POSITION_INT"
    } else if store.type_index.contains_key("GPS") {
        "GPS"
    } else {
        return Err("no GPS data in log".into());
    };

    let (lat_key, lon_key, alt_key, hdg_key, needs_dege7_scale) = match store.summary.log_type {
        LogType::Tlog => ("lat", "lon", "relative_alt", "hdg", false),
        LogType::Bin => ("Lat", "Lng", "Alt", "GCrs", true),
    };

    let mut points = Vec::with_capacity(store.type_index[gps_type].len());
    for &index in &store.type_index[gps_type] {
        let entry = &store.entries[index];
        if let Some(start) = start_usec
            && entry.timestamp_usec < start
        {
            continue;
        }
        if let Some(end) = end_usec
            && entry.timestamp_usec > end
        {
            continue;
        }

        let mut lat = entry.fields.get(lat_key).copied().unwrap_or(0.0);
        let mut lon = entry.fields.get(lon_key).copied().unwrap_or(0.0);
        if needs_dege7_scale {
            lat /= 1e7;
            lon /= 1e7;
        }
        if lat.abs() < 1e-6 && lon.abs() < 1e-6 {
            continue;
        }
        points.push(FlightPathPoint {
            timestamp_usec: entry.timestamp_usec,
            lat,
            lon,
            alt: entry.fields.get(alt_key).copied().unwrap_or(0.0),
            heading: entry.fields.get(hdg_key).copied().unwrap_or(0.0),
        });
    }

    let max_points = bounded_max_points(
        max_points,
        DEFAULT_FLIGHT_PATH_POINTS,
        MAX_FLIGHT_PATH_POINTS,
    );
    if points.len() > max_points {
        Ok(helpers::downsample(points, max_points))
    } else {
        Ok(points)
    }
}

async fn blocking_raw_message_query(
    store: LogStore,
    request: RawMessageQuery,
) -> Result<RawMessagePage, String> {
    tokio::task::spawn_blocking(move || raw_messages::query_raw_message_page(&store, &request))
        .await
        .map_err(|error| format!("raw message query task failed: {error}"))?
}

async fn blocking_chart_series_query(
    store: LogStore,
    request: ChartSeriesRequest,
) -> Result<ChartSeriesPage, String> {
    tokio::task::spawn_blocking(move || query_chart_series(&store, &request))
        .await
        .map_err(|error| format!("chart series query task failed: {error}"))
}

async fn blocking_export_csv(
    store: LogStore,
    request: LogExportRequest,
    cancel: CancellationToken,
) -> Result<LogExportResult, String> {
    tokio::task::spawn_blocking(move || {
        let entries: Vec<&StoredEntry> = store
            .entries
            .iter()
            .filter(|entry| {
                entry_matches_common_filters(
                    entry,
                    request.start_usec,
                    request.end_usec,
                    &request.message_types,
                    request.text.as_deref(),
                    &request.field_filters,
                )
            })
            .collect();
        let (rows_written, bytes_written) = raw_messages::write_csv_export_cancellable(
            &request.destination_path,
            entries,
            &cancel,
        )?;
        Ok(LogExportResult {
            operation_id: OperationId::LogExport,
            destination_path: request.destination_path.clone(),
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
    tokio::task::spawn_blocking(move || {
        let entries = store
            .entries
            .iter()
            .filter(|entry| {
                entry_matches_common_filters(entry, start_usec, end_usec, &[], None, &[])
            })
            .collect();
        let (row_count, _) = raw_messages::write_csv_export(&path, entries)?;
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
    store.entry_id.as_deref() == Some(entry_id) || store.source_path == source_path
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
    parsed.store.entry_id = Some(entry.entry_id);
    *state.cached_library_store.lock().await = Some(parsed.store.clone());
    Ok(parsed.store)
}

fn extract_fields(msg: &MavMessage) -> (String, HashMap<String, f64>) {
    let name = msg.message_name().to_string();
    let mut fields = HashMap::new();

    match msg {
        MavMessage::ATTITUDE(d) => {
            fields.insert("roll".into(), d.roll as f64);
            fields.insert("pitch".into(), d.pitch as f64);
            fields.insert("yaw".into(), d.yaw as f64);
            fields.insert("rollspeed".into(), d.rollspeed as f64);
            fields.insert("pitchspeed".into(), d.pitchspeed as f64);
            fields.insert("yawspeed".into(), d.yawspeed as f64);
        }
        MavMessage::VFR_HUD(d) => {
            fields.insert("airspeed".into(), d.airspeed as f64);
            fields.insert("groundspeed".into(), d.groundspeed as f64);
            fields.insert("heading".into(), d.heading as f64);
            fields.insert("throttle".into(), d.throttle as f64);
            fields.insert("alt".into(), d.alt as f64);
            fields.insert("climb".into(), d.climb as f64);
        }
        MavMessage::GLOBAL_POSITION_INT(d) => {
            fields.insert("lat".into(), d.lat as f64 / 1e7);
            fields.insert("lon".into(), d.lon as f64 / 1e7);
            fields.insert("alt".into(), d.alt as f64 / 1000.0);
            fields.insert("relative_alt".into(), d.relative_alt as f64 / 1000.0);
            fields.insert("vx".into(), d.vx as f64 / 100.0);
            fields.insert("vy".into(), d.vy as f64 / 100.0);
            fields.insert("vz".into(), d.vz as f64 / 100.0);
            fields.insert("hdg".into(), d.hdg as f64 / 100.0);
        }
        MavMessage::SYS_STATUS(d) => {
            fields.insert("voltage_battery".into(), d.voltage_battery as f64 / 1000.0);
            fields.insert("current_battery".into(), d.current_battery as f64 / 100.0);
            fields.insert("battery_remaining".into(), d.battery_remaining as f64);
            fields.insert("load".into(), d.load as f64 / 10.0);
        }
        MavMessage::GPS_RAW_INT(d) => {
            fields.insert("lat".into(), d.lat as f64 / 1e7);
            fields.insert("lon".into(), d.lon as f64 / 1e7);
            fields.insert("alt".into(), d.alt as f64 / 1000.0);
            fields.insert("fix_type".into(), d.fix_type as u8 as f64);
            fields.insert("satellites_visible".into(), d.satellites_visible as f64);
            fields.insert("eph".into(), d.eph as f64 / 100.0);
            fields.insert("epv".into(), d.epv as f64 / 100.0);
        }
        MavMessage::HEARTBEAT(d) => {
            fields.insert("custom_mode".into(), d.custom_mode as f64);
            fields.insert("base_mode".into(), d.base_mode.bits() as f64);
            fields.insert("system_status".into(), d.system_status as u8 as f64);
        }
        MavMessage::RC_CHANNELS(d) => {
            fields.insert("chan1_raw".into(), d.chan1_raw as f64);
            fields.insert("chan2_raw".into(), d.chan2_raw as f64);
            fields.insert("chan3_raw".into(), d.chan3_raw as f64);
            fields.insert("chan4_raw".into(), d.chan4_raw as f64);
            fields.insert("chan5_raw".into(), d.chan5_raw as f64);
            fields.insert("chan6_raw".into(), d.chan6_raw as f64);
            fields.insert("chan7_raw".into(), d.chan7_raw as f64);
            fields.insert("chan8_raw".into(), d.chan8_raw as f64);
            fields.insert("chancount".into(), d.chancount as f64);
            fields.insert("rssi".into(), d.rssi as f64);
        }
        MavMessage::SERVO_OUTPUT_RAW(d) => {
            fields.insert("servo1_raw".into(), d.servo1_raw as f64);
            fields.insert("servo2_raw".into(), d.servo2_raw as f64);
            fields.insert("servo3_raw".into(), d.servo3_raw as f64);
            fields.insert("servo4_raw".into(), d.servo4_raw as f64);
            fields.insert("servo5_raw".into(), d.servo5_raw as f64);
            fields.insert("servo6_raw".into(), d.servo6_raw as f64);
            fields.insert("servo7_raw".into(), d.servo7_raw as f64);
            fields.insert("servo8_raw".into(), d.servo8_raw as f64);
        }
        MavMessage::BATTERY_STATUS(d) => {
            fields.insert("current_battery".into(), d.current_battery as f64 / 100.0);
            fields.insert("current_consumed".into(), d.current_consumed as f64);
            fields.insert("energy_consumed".into(), d.energy_consumed as f64);
            fields.insert("battery_remaining".into(), d.battery_remaining as f64);
        }
        MavMessage::NAV_CONTROLLER_OUTPUT(d) => {
            fields.insert("nav_roll".into(), d.nav_roll as f64);
            fields.insert("nav_pitch".into(), d.nav_pitch as f64);
            fields.insert("nav_bearing".into(), d.nav_bearing as f64);
            fields.insert("target_bearing".into(), d.target_bearing as f64);
            fields.insert("wp_dist".into(), d.wp_dist as f64);
            fields.insert("alt_error".into(), d.alt_error as f64);
            fields.insert("xtrack_error".into(), d.xtrack_error as f64);
        }
        _ => {}
    }

    (name, fields)
}

fn json_fields_from_numeric(fields: &HashMap<String, f64>) -> BTreeMap<String, JsonValue> {
    fields
        .iter()
        .map(|(key, value)| (key.clone(), JsonValue::from(*value)))
        .collect()
}

fn compact_json_string(value: &JsonValue) -> String {
    serde_json::to_string(value).unwrap_or_default()
}

#[derive(Default)]
struct StoredEntryContext {
    raw_payload: Option<Vec<u8>>,
    system_id: Option<u8>,
    component_id: Option<u8>,
}

fn build_stored_entry(
    sequence: u64,
    timestamp_usec: u64,
    msg_name: String,
    fields: HashMap<String, f64>,
    field_values: BTreeMap<String, JsonValue>,
    context: StoredEntryContext,
) -> StoredEntry {
    let detail = JsonValue::Object(JsonMap::from_iter(field_values.clone()));
    let text = if field_values.is_empty() {
        msg_name.clone()
    } else {
        format!("{msg_name} {}", compact_json_string(&detail))
    };
    let raw_len_bytes = context
        .raw_payload
        .as_ref()
        .map_or(0, |payload| payload.len() as u32);

    StoredEntry {
        sequence,
        timestamp_usec,
        msg_name,
        fields,
        field_values,
        raw_len_bytes,
        raw_payload: context.raw_payload,
        system_id: context.system_id,
        component_id: context.component_id,
        text,
    }
}

fn tlog_to_stored(
    sequence: u64,
    timestamp_usec: u64,
    system_id: u8,
    component_id: u8,
    raw_payload: Vec<u8>,
    message: MavMessage,
) -> StoredEntry {
    let (name, fields) = extract_fields(&message);
    let field_values = json_fields_from_numeric(&fields);
    build_stored_entry(
        sequence,
        timestamp_usec,
        name,
        fields,
        field_values,
        StoredEntryContext {
            raw_payload: Some(raw_payload),
            system_id: Some(system_id),
            component_id: Some(component_id),
        },
    )
}

fn bin_to_stored(sequence: u64, entry: &ardupilot_binlog::Entry) -> Option<StoredEntry> {
    let ts = entry.timestamp_usec?;
    let mut fields = HashMap::new();
    let mut field_values = BTreeMap::new();
    for (key, value) in entry.fields() {
        if let Some(number) = value.as_f64() {
            fields.insert(key.to_string(), number);
            field_values.insert(key.to_string(), JsonValue::from(number));
        }
    }
    Some(build_stored_entry(
        sequence,
        ts,
        entry.name.clone(),
        fields,
        field_values,
        StoredEntryContext::default(),
    ))
}

fn log_diagnostic(
    severity: LogDiagnosticSeverity,
    source: LogDiagnosticSource,
    code: &str,
    message: String,
    recoverable: bool,
    timestamp_usec: Option<u64>,
) -> LogDiagnostic {
    LogDiagnostic {
        severity,
        source,
        code: code.to_string(),
        message,
        recoverable,
        timestamp_usec,
    }
}

fn build_type_index(entries: &[StoredEntry]) -> HashMap<String, Vec<usize>> {
    let mut type_index: HashMap<String, Vec<usize>> = HashMap::new();
    for (i, entry) in entries.iter().enumerate() {
        type_index
            .entry(entry.msg_name.clone())
            .or_default()
            .push(i);
    }
    type_index
}

fn build_message_types(entries: &[StoredEntry]) -> HashMap<String, usize> {
    let mut message_types = HashMap::new();
    for entry in entries {
        *message_types.entry(entry.msg_name.clone()).or_insert(0) += 1;
    }
    message_types
}

fn summarize_entries(path: &str, log_type: LogType, entries: &[StoredEntry]) -> LogSummary {
    let start_usec = entries.first().map_or(0, |entry| entry.timestamp_usec);
    let end_usec = entries.last().map_or(0, |entry| entry.timestamp_usec);
    let duration_secs = if end_usec > start_usec {
        (end_usec - start_usec) as f64 / 1_000_000.0
    } else {
        0.0
    };
    let file_name = std::path::Path::new(path)
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string());

    LogSummary {
        file_name,
        start_usec,
        end_usec,
        duration_secs,
        total_entries: entries.len(),
        message_types: build_message_types(entries),
        log_type,
    }
}

fn build_store(path: &str, log_type: LogType, entries: Vec<StoredEntry>) -> LogStore {
    let summary = summarize_entries(path, log_type, &entries);
    let type_index = build_type_index(&entries);

    LogStore {
        summary,
        source_path: path.to_string(),
        entry_id: None,
        entries,
        type_index,
        playback_cursor_usec: None,
    }
}

fn parse_bin_log(path: String) -> Result<ParsedLog, String> {
    let bytes = std::fs::read(&path).map_err(|error| format!("failed to read BIN log: {error}"))?;
    let has_trailing_fragment = bytes
        .windows(2)
        .rposition(|window| window == [0xA3, 0x95])
        .is_some_and(|position| position > 0 && bytes.len() - position < 5);
    let mut entries = Vec::new();
    let mut diagnostics = Vec::new();

    for result in ardupilot_binlog::Reader::new(Cursor::new(bytes)) {
        match result {
            Ok(entry) => {
                let sequence = entries.len() as u64;
                if let Some(stored) = bin_to_stored(sequence, &entry) {
                    entries.push(stored);
                }
            }
            Err(error) => {
                let code = if entries.is_empty() {
                    "bin_parse_failed"
                } else {
                    "bin_partial_parse"
                };
                let severity = if entries.is_empty() {
                    LogDiagnosticSeverity::Error
                } else {
                    LogDiagnosticSeverity::Warning
                };
                diagnostics.push(log_diagnostic(
                    severity,
                    LogDiagnosticSource::Parse,
                    code,
                    format!(
                        "BIN parse stopped after {} recoverable messages: {error}",
                        entries.len()
                    ),
                    !entries.is_empty(),
                    entries.last().map(|entry| entry.timestamp_usec),
                ));
                break;
            }
        }
    }

    if has_trailing_fragment && diagnostics.is_empty() {
        diagnostics.push(log_diagnostic(
            LogDiagnosticSeverity::Warning,
            LogDiagnosticSource::Parse,
            "bin_partial_parse",
            format!(
                "BIN parse stopped after {} recoverable messages because the file ends with a partial record",
                entries.len()
            ),
            !entries.is_empty(),
            entries.last().map(|entry| entry.timestamp_usec),
        ));
    }

    Ok(ParsedLog {
        store: build_store(&path, LogType::Bin, entries),
        diagnostics,
    })
}

async fn parse_tlog_log(path: String) -> Result<ParsedLog, String> {
    let file = tokio::fs::File::open(&path)
        .await
        .map_err(|error| format!("failed to open TLOG: {error}"))?;
    let mut reader = AsyncPeekReader::new(file);
    let mut entries = Vec::new();
    let mut sequence = 0_u64;

    loop {
        let ts_bytes = match reader.read_exact(8).await {
            Ok(bytes) => bytes,
            Err(mavlink::error::MessageReadError::Io(ref error))
                if error.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(error) => return Err(format!("failed to parse TLOG timestamp: {error}")),
        };
        let timestamp_usec = u64::from_le_bytes(
            ts_bytes
                .try_into()
                .map_err(|_| "invalid TLOG timestamp width")?,
        );

        let raw = read_versioned_raw_message_async::<MavMessage, _>(&mut reader, ReadVersion::Any)
            .await
            .map_err(|error| format!("failed to parse TLOG frame: {error}"))?;
        let message = MavMessage::parse(raw.version(), raw.message_id(), raw.payload())
            .map_err(|error| format!("failed to decode TLOG payload: {error}"))?;

        entries.push(tlog_to_stored(
            sequence,
            timestamp_usec,
            raw.system_id(),
            raw.component_id(),
            raw.payload().to_vec(),
            message,
        ));
        sequence += 1;
    }

    Ok(ParsedLog {
        store: build_store(&path, LogType::Tlog, entries),
        diagnostics: Vec::new(),
    })
}

pub(crate) async fn parse_log_file(path: String) -> Result<ParsedLog, String> {
    let is_bin = path.ends_with(".bin") || path.ends_with(".BIN");
    if is_bin {
        tokio::task::spawn_blocking(move || parse_bin_log(path))
            .await
            .map_err(|error| format!("BIN parse task failed: {error}"))?
    } else {
        parse_tlog_log(path).await
    }
}

#[derive(Serialize, Clone)]
pub(crate) struct FlightPathPoint {
    timestamp_usec: u64,
    lat: f64,
    lon: f64,
    alt: f64,
    heading: f64,
}

const TELEMETRY_TRACK_INTERVAL_USEC: u64 = 100_000;

#[derive(Serialize, Clone, Default)]
pub(crate) struct TelemetrySnapshot {
    timestamp_usec: u64,
    latitude_deg: Option<f64>,
    longitude_deg: Option<f64>,
    altitude_m: Option<f64>,
    heading_deg: Option<f64>,
    speed_mps: Option<f64>,
    airspeed_mps: Option<f64>,
    climb_rate_mps: Option<f64>,
    roll_deg: Option<f64>,
    pitch_deg: Option<f64>,
    yaw_deg: Option<f64>,
    battery_pct: Option<f64>,
    battery_voltage_v: Option<f64>,
    battery_current_a: Option<f64>,
    energy_consumed_wh: Option<f64>,
    gps_fix_type: Option<String>,
    gps_satellites: Option<f64>,
    gps_hdop: Option<f64>,
    throttle_pct: Option<f64>,
    wp_dist_m: Option<f64>,
    nav_bearing_deg: Option<f64>,
    target_bearing_deg: Option<f64>,
    xtrack_error_m: Option<f64>,
    armed: Option<bool>,
    custom_mode: Option<u32>,
    rc_channels: Option<Vec<f64>>,
    rc_rssi: Option<f64>,
    servo_outputs: Option<Vec<f64>>,
}

#[derive(Serialize, Clone)]
pub(crate) struct FlightSummary {
    duration_secs: f64,
    max_alt_m: Option<f64>,
    avg_alt_m: Option<f64>,
    max_speed_mps: Option<f64>,
    avg_speed_mps: Option<f64>,
    total_distance_m: Option<f64>,
    max_distance_from_home_m: Option<f64>,
    battery_start_v: Option<f64>,
    battery_end_v: Option<f64>,
    battery_min_v: Option<f64>,
    mah_consumed: Option<f64>,
    gps_sats_min: Option<u32>,
    gps_sats_max: Option<u32>,
}

/// Maps a raw GPS fix_type u8 to the same snake_case names as
/// `mavkit::GpsFixType`'s serde output so the wire format is consistent
/// between live and playback paths.
fn gps_fix_type_name(val: f64) -> &'static str {
    match val as u8 {
        2 => "fix_2d",
        3 => "fix_3d",
        4 => "dgps",
        5 => "rtk_float",
        6 => "rtk_fixed",
        _ => "no_fix",
    }
}

fn apply_tlog_entry(snap: &mut TelemetrySnapshot, entry: &StoredEntry) {
    let f = &entry.fields;
    match entry.msg_name.as_str() {
        "ATTITUDE" => {
            snap.roll_deg = f.get("roll").map(|v| v.to_degrees());
            snap.pitch_deg = f.get("pitch").map(|v| v.to_degrees());
            snap.yaw_deg = f.get("yaw").map(|v| v.to_degrees());
        }
        "VFR_HUD" => {
            snap.altitude_m = f.get("alt").copied();
            snap.speed_mps = f.get("groundspeed").copied();
            snap.heading_deg = f.get("heading").copied();
            snap.climb_rate_mps = f.get("climb").copied();
            snap.throttle_pct = f.get("throttle").copied();
            snap.airspeed_mps = f.get("airspeed").copied();
        }
        "GLOBAL_POSITION_INT" => {
            snap.latitude_deg = f.get("lat").copied();
            snap.longitude_deg = f.get("lon").copied();
            if snap.altitude_m.is_none() {
                snap.altitude_m = f.get("relative_alt").copied();
            }
            if snap.heading_deg.is_none() {
                snap.heading_deg = f.get("hdg").copied();
            }
        }
        "SYS_STATUS" => {
            snap.battery_voltage_v = f.get("voltage_battery").copied();
            snap.battery_current_a = f.get("current_battery").copied();
            snap.battery_pct = f.get("battery_remaining").copied();
        }
        "GPS_RAW_INT" => {
            snap.gps_fix_type = f.get("fix_type").map(|v| gps_fix_type_name(*v).into());
            snap.gps_satellites = f.get("satellites_visible").copied();
            snap.gps_hdop = f.get("eph").copied();
        }
        "HEARTBEAT" => {
            snap.custom_mode = f.get("custom_mode").map(|v| *v as u32);
            snap.armed = f.get("base_mode").map(|v| (*v as u32) & 0x80 != 0);
        }
        "NAV_CONTROLLER_OUTPUT" => {
            snap.nav_bearing_deg = f.get("nav_bearing").copied();
            snap.target_bearing_deg = f.get("target_bearing").copied();
            snap.wp_dist_m = f.get("wp_dist").copied();
            snap.xtrack_error_m = f.get("xtrack_error").copied();
        }
        "RC_CHANNELS" => {
            let chans: Vec<f64> = (1..=8)
                .filter_map(|i| f.get(&format!("chan{i}_raw")).copied())
                .collect();
            if !chans.is_empty() {
                snap.rc_channels = Some(chans);
            }
            snap.rc_rssi = f.get("rssi").copied();
        }
        "SERVO_OUTPUT_RAW" => {
            let servos: Vec<f64> = (1..=8)
                .filter_map(|i| f.get(&format!("servo{i}_raw")).copied())
                .collect();
            if !servos.is_empty() {
                snap.servo_outputs = Some(servos);
            }
        }
        "BATTERY_STATUS" => {
            snap.energy_consumed_wh = f.get("energy_consumed").copied();
        }
        _ => {}
    }
}

fn apply_bin_entry(snap: &mut TelemetrySnapshot, entry: &StoredEntry) {
    let f = &entry.fields;
    match entry.msg_name.as_str() {
        "ATT" => {
            snap.roll_deg = f.get("Roll").copied();
            snap.pitch_deg = f.get("Pitch").copied();
            snap.yaw_deg = f.get("Yaw").copied();
        }
        "CTUN" => {
            snap.altitude_m = f.get("Alt").copied();
            snap.climb_rate_mps = f.get("CRt").copied();
        }
        "GPS" => {
            snap.latitude_deg = f.get("Lat").map(|v| v / 1e7);
            snap.longitude_deg = f.get("Lng").map(|v| v / 1e7);
            snap.speed_mps = f.get("Spd").copied();
            snap.heading_deg = f.get("GCrs").copied();
            snap.gps_fix_type = f.get("Status").map(|v| gps_fix_type_name(*v).into());
            snap.gps_satellites = f.get("NSats").copied();
            snap.gps_hdop = f.get("HDop").copied();
        }
        "BAT" => {
            snap.battery_voltage_v = f.get("Volt").copied();
            snap.battery_current_a = f.get("Curr").copied();
            snap.battery_pct = f.get("Rem").copied();
        }
        "MODE" => {
            snap.custom_mode = f.get("ModeNum").map(|v| *v as u32);
        }
        "RCIN" => {
            let chans: Vec<f64> = (1..=8)
                .filter_map(|i| f.get(&format!("C{i}")).copied())
                .collect();
            if !chans.is_empty() {
                snap.rc_channels = Some(chans);
            }
        }
        "RCOU" => {
            let servos: Vec<f64> = (1..=8)
                .filter_map(|i| f.get(&format!("C{i}")).copied())
                .collect();
            if !servos.is_empty() {
                snap.servo_outputs = Some(servos);
            }
        }
        _ => {}
    }
}

fn haversine_m(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let r = 6_371_000.0;
    let dlat = (lat2 - lat1).to_radians();
    let dlon = (lon2 - lon1).to_radians();
    let a = (dlat / 2.0).sin().powi(2)
        + lat1.to_radians().cos() * lat2.to_radians().cos() * (dlon / 2.0).sin().powi(2);
    r * 2.0 * a.sqrt().asin()
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
                let total = parsed.store.summary.total_entries as u64;
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

                let summary = parsed.store.summary.clone();
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
        "playback://state",
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
        "session://state",
        &ScopedEvent {
            envelope: envelope.clone(),
            value: frame.session.clone(),
        },
    );
    emit_event(
        app,
        "telemetry://state",
        &ScopedEvent {
            envelope: envelope.clone(),
            value: frame.telemetry.clone(),
        },
    );
    emit_event(
        app,
        "support://state",
        &ScopedEvent {
            envelope: envelope.clone(),
            value: frame.support.clone(),
        },
    );
    emit_event(
        app,
        "status_text://state",
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
        let runtime = state.session_runtime.lock().await;
        runtime
            .active_playback_envelope(OperationId::ReplayStop)
            .ok()
    };

    let idle_state = state.playback_runtime.prepare_idle().await;
    *state.log_store.lock().await = None;

    if let Some(envelope) = playback_envelope.as_ref() {
        emit_playback_state_snapshot(app, envelope, &idle_state);
    }

    let live_envelope = state.session_runtime.lock().await.close_playback_session();
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
        let mut runtime = state.session_runtime.lock().await;
        runtime
            .issue_playback_seek()
            .map_err(|failure| failure.reason.message)?
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
        let runtime = state.session_runtime.lock().await;
        runtime
            .active_playback_envelope(OperationId::ReplayPlay)
            .map_err(|failure| failure.reason.message)?
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
        let runtime = state.session_runtime.lock().await;
        runtime
            .active_playback_envelope(OperationId::ReplayPause)
            .map_err(|failure| failure.reason.message)?
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
        let runtime = state.session_runtime.lock().await;
        runtime
            .active_playback_envelope(OperationId::ReplaySetSpeed)
            .map_err(|failure| failure.reason.message)?
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

    let indices = store
        .type_index
        .get(&msg_type)
        .ok_or_else(|| format!("no entries for message type: {msg_type}"))?;

    let mut points: Vec<LogDataPoint> = Vec::new();
    for &idx in indices {
        let entry = &store.entries[idx];
        let ts = entry.timestamp_usec;
        if let Some(start) = start_usec
            && ts < start
        {
            continue;
        }
        if let Some(end) = end_usec
            && ts > end
        {
            continue;
        }
        points.push(LogDataPoint {
            timestamp_usec: ts,
            fields: entry.fields.clone(),
        });
    }

    let max_points = bounded_max_points(
        max_points,
        DEFAULT_COMPAT_QUERY_POINTS,
        MAX_CHART_QUERY_POINTS,
    );
    if points.len() > max_points {
        return Ok(helpers::downsample(points, max_points));
    }

    Ok(points)
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
    filtered_flight_path_points(&store, start_usec, end_usec, max_points)
}

#[tauri::command]
pub(crate) async fn log_get_telemetry_track(
    state: tauri::State<'_, AppState>,
    max_points: Option<usize>,
) -> Result<Vec<TelemetrySnapshot>, String> {
    let store = helpers::with_log_store(&state).await?;

    let is_bin = store.summary.log_type == LogType::Bin;
    let mut running = TelemetrySnapshot::default();
    let mut track: Vec<TelemetrySnapshot> = Vec::new();
    let mut last_emit: u64 = 0;

    for entry in &store.entries {
        if is_bin {
            apply_bin_entry(&mut running, entry);
        } else {
            apply_tlog_entry(&mut running, entry);
        }

        if entry.timestamp_usec >= last_emit + TELEMETRY_TRACK_INTERVAL_USEC || track.is_empty() {
            let mut snap = running.clone();
            snap.timestamp_usec = entry.timestamp_usec;
            track.push(snap);
            last_emit = entry.timestamp_usec;
        }
    }

    if let Some(max) = max_points {
        return Ok(helpers::downsample(track, max));
    }

    Ok(track)
}

#[tauri::command]
pub(crate) async fn log_get_summary(
    state: tauri::State<'_, AppState>,
) -> Result<Option<LogSummary>, String> {
    let guard = state.log_store.lock().await;
    Ok(guard.as_ref().map(|s| s.summary.clone()))
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
    let is_bin = store.summary.log_type == LogType::Bin;

    let (alt_msg, alt_field) = if is_bin {
        ("CTUN", "Alt")
    } else {
        ("VFR_HUD", "alt")
    };
    let (spd_msg, spd_field) = if is_bin {
        ("GPS", "Spd")
    } else {
        ("VFR_HUD", "groundspeed")
    };
    let (bat_msg, bat_v_field) = if is_bin {
        ("BAT", "Volt")
    } else {
        ("SYS_STATUS", "voltage_battery")
    };
    let (gps_msg, lat_key, lon_key, sats_key, needs_dege7) = if is_bin {
        ("GPS", "Lat", "Lng", "NSats", true)
    } else {
        (
            "GLOBAL_POSITION_INT",
            "lat",
            "lon",
            "satellites_visible",
            false,
        )
    };
    let sats_msg = if is_bin { "GPS" } else { "GPS_RAW_INT" };

    let mut alt_sum = 0.0_f64;
    let mut alt_count = 0_u64;
    let mut alt_max: Option<f64> = None;
    if let Some(indices) = store.type_index.get(alt_msg) {
        for &idx in indices {
            if let Some(&v) = store.entries[idx].fields.get(alt_field) {
                alt_sum += v;
                alt_count += 1;
                alt_max = Some(alt_max.map_or(v, |m: f64| m.max(v)));
            }
        }
    }

    let mut spd_sum = 0.0_f64;
    let mut spd_count = 0_u64;
    let mut spd_max: Option<f64> = None;
    if let Some(indices) = store.type_index.get(spd_msg) {
        for &idx in indices {
            if let Some(&v) = store.entries[idx].fields.get(spd_field) {
                spd_sum += v;
                spd_count += 1;
                spd_max = Some(spd_max.map_or(v, |m: f64| m.max(v)));
            }
        }
    }

    let mut bat_start: Option<f64> = None;
    let mut bat_end: Option<f64> = None;
    let mut bat_min: Option<f64> = None;
    if let Some(indices) = store.type_index.get(bat_msg) {
        for &idx in indices {
            if let Some(&v) = store.entries[idx].fields.get(bat_v_field)
                && v > 0.0
            {
                if bat_start.is_none() {
                    bat_start = Some(v);
                }
                bat_end = Some(v);
                bat_min = Some(bat_min.map_or(v, |m: f64| m.min(v)));
            }
        }
    }

    let mah_consumed = if is_bin {
        store.type_index.get("BAT").and_then(|indices| {
            indices
                .last()
                .and_then(|&idx| store.entries[idx].fields.get("CurrTot").copied())
        })
    } else {
        store.type_index.get("BATTERY_STATUS").and_then(|indices| {
            indices
                .last()
                .and_then(|&idx| store.entries[idx].fields.get("current_consumed").copied())
        })
    };

    let mut total_dist = 0.0_f64;
    let mut max_dist_home: Option<f64> = None;
    let mut home_lat: Option<f64> = None;
    let mut home_lon: Option<f64> = None;
    let mut prev_lat: Option<f64> = None;
    let mut prev_lon: Option<f64> = None;

    if let Some(indices) = store.type_index.get(gps_msg) {
        for &idx in indices {
            let entry = &store.entries[idx];
            let mut lat = entry.fields.get(lat_key).copied().unwrap_or(0.0);
            let mut lon = entry.fields.get(lon_key).copied().unwrap_or(0.0);
            if needs_dege7 {
                lat /= 1e7;
                lon /= 1e7;
            }
            if lat.abs() < 1e-6 && lon.abs() < 1e-6 {
                continue;
            }
            if home_lat.is_none() {
                home_lat = Some(lat);
                home_lon = Some(lon);
            }
            if let (Some(plat), Some(plon)) = (prev_lat, prev_lon) {
                total_dist += haversine_m(plat, plon, lat, lon);
            }
            if let (Some(hlat), Some(hlon)) = (home_lat, home_lon) {
                let d = haversine_m(hlat, hlon, lat, lon);
                max_dist_home = Some(max_dist_home.map_or(d, |m: f64| m.max(d)));
            }
            prev_lat = Some(lat);
            prev_lon = Some(lon);
        }
    }

    let mut sats_min: Option<u32> = None;
    let mut sats_max: Option<u32> = None;
    if let Some(indices) = store.type_index.get(sats_msg) {
        for &idx in indices {
            if let Some(&v) = store.entries[idx].fields.get(sats_key) {
                let s = v as u32;
                sats_min = Some(sats_min.map_or(s, |m| m.min(s)));
                sats_max = Some(sats_max.map_or(s, |m| m.max(s)));
            }
        }
    }

    Ok(FlightSummary {
        duration_secs: store.summary.duration_secs,
        max_alt_m: alt_max,
        avg_alt_m: if alt_count > 0 {
            Some(alt_sum / alt_count as f64)
        } else {
            None
        },
        max_speed_mps: spd_max,
        avg_speed_mps: if spd_count > 0 {
            Some(spd_sum / spd_count as f64)
        } else {
            None
        },
        total_distance_m: if total_dist > 0.0 {
            Some(total_dist)
        } else {
            None
        },
        max_distance_from_home_m: max_dist_home,
        battery_start_v: bat_start,
        battery_end_v: bat_end,
        battery_min_v: bat_min,
        mah_consumed,
        gps_sats_min: sats_min,
        gps_sats_max: sats_max,
    })
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
    use ardupilot_binlog::Reader;
    use mavkit::dialect::{
        ATTITUDE_DATA, COMMAND_LONG_DATA, GLOBAL_POSITION_INT_DATA, GPS_RAW_INT_DATA,
        HEARTBEAT_DATA, MavAutopilot, MavModeFlag, MavState, MavSysStatusSensor,
        MavSysStatusSensorExtended, MavType, RC_CHANNELS_DATA, SYS_STATUS_DATA, VFR_HUD_DATA,
    };
    use std::io::Cursor;
    use std::sync::{Arc, Mutex as StdMutex};
    use std::time::Duration;

    const HEADER_MAGIC: [u8; 2] = [0xA3, 0x95];
    const FMT_TYPE: u8 = 0x80;

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

    fn assert_field_eq(fields: &HashMap<String, f64>, key: &str, expected: f64) {
        let got = fields.get(key).copied().unwrap_or(f64::NAN);
        assert!(
            (got - expected).abs() < 1e-5,
            "field {key} mismatch: got {got}, expected {expected}"
        );
    }

    fn build_fmt_bootstrap() -> Vec<u8> {
        let mut msg = Vec::new();
        msg.extend_from_slice(&HEADER_MAGIC);
        msg.push(FMT_TYPE);
        let mut payload = [0u8; 86];
        payload[0] = FMT_TYPE;
        payload[1] = 89;
        payload[2..6].copy_from_slice(b"FMT\0");
        payload[6..11].copy_from_slice(b"BBnNZ");
        let labels = b"Type,Length,Name,Format,Labels";
        payload[22..22 + labels.len()].copy_from_slice(labels);
        msg.extend_from_slice(&payload);
        msg
    }

    fn build_fmt_for_type(
        msg_type: u8,
        msg_len: u8,
        name: &[u8; 4],
        format: &str,
        labels: &str,
    ) -> Vec<u8> {
        let mut msg = Vec::new();
        msg.extend_from_slice(&HEADER_MAGIC);
        msg.push(FMT_TYPE);
        let mut payload = [0u8; 86];
        payload[0] = msg_type;
        payload[1] = msg_len;
        payload[2..6].copy_from_slice(name);
        let fmt_bytes = format.as_bytes();
        payload[6..6 + fmt_bytes.len()].copy_from_slice(fmt_bytes);
        let lbl_bytes = labels.as_bytes();
        payload[22..22 + lbl_bytes.len()].copy_from_slice(lbl_bytes);
        msg.extend_from_slice(&payload);
        msg
    }

    fn build_data_message(msg_type: u8, payload: &[u8]) -> Vec<u8> {
        let mut msg = Vec::new();
        msg.extend_from_slice(&HEADER_MAGIC);
        msg.push(msg_type);
        msg.extend_from_slice(payload);
        msg
    }

    fn parse_entries(bytes: Vec<u8>) -> Vec<ardupilot_binlog::Entry> {
        Reader::new(Cursor::new(bytes))
            .collect::<Result<Vec<_>, _>>()
            .expect("synthetic BIN should parse")
    }

    fn stored_entry(msg_name: &str, fields: HashMap<String, f64>) -> StoredEntry {
        let field_values = json_fields_from_numeric(&fields);
        build_stored_entry(
            0,
            0,
            msg_name.to_string(),
            fields,
            field_values,
            StoredEntryContext::default(),
        )
    }

    fn stored_entry_with_values(
        sequence: u64,
        timestamp_usec: u64,
        msg_name: &str,
        fields: HashMap<String, f64>,
        field_values: BTreeMap<String, JsonValue>,
    ) -> StoredEntry {
        stored_entry_with_values_and_payload(
            sequence,
            timestamp_usec,
            msg_name,
            fields,
            field_values,
            None,
        )
    }

    fn stored_entry_with_values_and_payload(
        sequence: u64,
        timestamp_usec: u64,
        msg_name: &str,
        fields: HashMap<String, f64>,
        field_values: BTreeMap<String, JsonValue>,
        raw_payload: Option<Vec<u8>>,
    ) -> StoredEntry {
        build_stored_entry(
            sequence,
            timestamp_usec,
            msg_name.to_string(),
            fields,
            field_values,
            StoredEntryContext {
                raw_payload,
                ..StoredEntryContext::default()
            },
        )
    }

    fn store_from_entries(path: &str, log_type: LogType, entries: Vec<StoredEntry>) -> LogStore {
        build_store(path, log_type, entries)
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

    fn empty_store() -> LogStore {
        LogStore {
            summary: LogSummary {
                file_name: "test.tlog".into(),
                start_usec: 100,
                end_usec: 200,
                duration_secs: 0.1,
                total_entries: 0,
                message_types: HashMap::new(),
                log_type: LogType::Tlog,
            },
            source_path: "test.tlog".into(),
            entry_id: None,
            entries: Vec::new(),
            type_index: HashMap::new(),
            playback_cursor_usec: None,
        }
    }

    #[test]
    fn reusable_library_store_prefers_active_store_for_matching_entry() {
        let mut active = empty_store();
        active.entry_id = Some("entry-a".into());
        active.source_path = "/logs/a.tlog".into();

        let mut cached = empty_store();
        cached.entry_id = Some("entry-a".into());
        cached.source_path = "/logs/a.tlog".into();

        let reused =
            reusable_library_store(Some(&active), Some(&cached), "entry-a", "/logs/a.tlog")
                .expect("matching store");

        assert_eq!(reused.summary.file_name, active.summary.file_name);
        assert_eq!(reused.source_path, active.source_path);
    }

    #[test]
    fn reusable_library_store_falls_back_to_cached_store_for_repeated_entry_queries() {
        let mut active = empty_store();
        active.entry_id = Some("entry-active".into());
        active.source_path = "/logs/active.tlog".into();

        let mut cached = empty_store();
        cached.entry_id = Some("entry-cached".into());
        cached.source_path = "/logs/cached.tlog".into();

        let reused = reusable_library_store(
            Some(&active),
            Some(&cached),
            "entry-cached",
            "/logs/cached.tlog",
        )
        .expect("cached store reused");

        assert_eq!(reused.entry_id.as_deref(), Some("entry-cached"));
        assert_eq!(reused.source_path, "/logs/cached.tlog");
    }

    fn playback_test_store() -> LogStore {
        let mut store = empty_store();
        store.entries = vec![
            build_stored_entry(
                0,
                100,
                "HEARTBEAT".into(),
                HashMap::from([
                    ("custom_mode".to_string(), 4.0),
                    ("base_mode".to_string(), 128.0),
                ]),
                BTreeMap::from([
                    ("custom_mode".to_string(), JsonValue::from(4.0)),
                    ("base_mode".to_string(), JsonValue::from(128.0)),
                ]),
                StoredEntryContext::default(),
            ),
            build_stored_entry(
                1,
                150,
                "VFR_HUD".into(),
                HashMap::from([("alt".to_string(), 12.3), ("groundspeed".to_string(), 4.5)]),
                BTreeMap::from([
                    ("alt".to_string(), JsonValue::from(12.3)),
                    ("groundspeed".to_string(), JsonValue::from(4.5)),
                ]),
                StoredEntryContext::default(),
            ),
            build_stored_entry(
                2,
                200,
                "VFR_HUD".into(),
                HashMap::from([("alt".to_string(), 18.6), ("groundspeed".to_string(), 5.5)]),
                BTreeMap::from([
                    ("alt".to_string(), JsonValue::from(18.6)),
                    ("groundspeed".to_string(), JsonValue::from(5.5)),
                ]),
                StoredEntryContext::default(),
            ),
        ];
        store.summary.total_entries = store.entries.len();
        store
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
    fn extract_fields_attitude() {
        let msg = MavMessage::ATTITUDE(ATTITUDE_DATA {
            time_boot_ms: 0,
            roll: 0.5,
            pitch: -0.1,
            yaw: 1.2,
            rollspeed: 0.01,
            pitchspeed: 0.02,
            yawspeed: 0.03,
        });

        let (name, fields) = extract_fields(&msg);
        assert_eq!(name, "ATTITUDE");
        assert_eq!(fields.len(), 6);
        assert_field_eq(&fields, "roll", 0.5);
        assert_field_eq(&fields, "pitch", -0.1);
        assert_field_eq(&fields, "yaw", 1.2);
        assert_field_eq(&fields, "rollspeed", 0.01);
        assert_field_eq(&fields, "pitchspeed", 0.02);
        assert_field_eq(&fields, "yawspeed", 0.03);
    }

    #[test]
    fn extract_fields_vfr_hud() {
        let msg = MavMessage::VFR_HUD(VFR_HUD_DATA {
            airspeed: 12.3,
            groundspeed: 11.4,
            heading: 250,
            throttle: 77,
            alt: 123.4,
            climb: -1.2,
        });

        let (name, fields) = extract_fields(&msg);
        assert_eq!(name, "VFR_HUD");
        assert_eq!(fields.len(), 6);
        assert_field_eq(&fields, "airspeed", 12.3);
        assert_field_eq(&fields, "groundspeed", 11.4);
        assert_field_eq(&fields, "heading", 250.0);
        assert_field_eq(&fields, "throttle", 77.0);
        assert_field_eq(&fields, "alt", 123.4);
        assert_field_eq(&fields, "climb", -1.2);
    }

    #[test]
    fn extract_fields_global_position_int_scaled() {
        let msg = MavMessage::GLOBAL_POSITION_INT(GLOBAL_POSITION_INT_DATA {
            time_boot_ms: 0,
            lat: 374221234,
            lon: -1220845678,
            alt: 123_456,
            relative_alt: 7_890,
            vx: 321,
            vy: -123,
            vz: 45,
            hdg: 9_001,
        });

        let (_, fields) = extract_fields(&msg);
        assert_eq!(fields.len(), 8);
        assert_field_eq(&fields, "lat", 37.4221234);
        assert_field_eq(&fields, "lon", -122.0845678);
        assert_field_eq(&fields, "alt", 123.456);
        assert_field_eq(&fields, "relative_alt", 7.89);
        assert_field_eq(&fields, "vx", 3.21);
        assert_field_eq(&fields, "vy", -1.23);
        assert_field_eq(&fields, "vz", 0.45);
        assert_field_eq(&fields, "hdg", 90.01);
    }

    #[test]
    fn extract_fields_sys_status_scaled() {
        let msg = MavMessage::SYS_STATUS(SYS_STATUS_DATA {
            onboard_control_sensors_present: MavSysStatusSensor::empty(),
            onboard_control_sensors_enabled: MavSysStatusSensor::empty(),
            onboard_control_sensors_health: MavSysStatusSensor::empty(),
            onboard_control_sensors_present_extended: MavSysStatusSensorExtended::empty(),
            onboard_control_sensors_enabled_extended: MavSysStatusSensorExtended::empty(),
            onboard_control_sensors_health_extended: MavSysStatusSensorExtended::empty(),
            load: 500,
            voltage_battery: 11_900,
            current_battery: 345,
            battery_remaining: 67,
            drop_rate_comm: 0,
            errors_comm: 0,
            errors_count1: 0,
            errors_count2: 0,
            errors_count3: 0,
            errors_count4: 0,
        });

        let (_, fields) = extract_fields(&msg);
        assert_field_eq(&fields, "voltage_battery", 11.9);
        assert_field_eq(&fields, "current_battery", 3.45);
        assert_field_eq(&fields, "battery_remaining", 67.0);
        assert_field_eq(&fields, "load", 50.0);
    }

    #[test]
    fn extract_fields_gps_raw_int_scaled() {
        let msg = MavMessage::GPS_RAW_INT(GPS_RAW_INT_DATA {
            time_usec: 0,
            fix_type: mavkit::dialect::GpsFixType::GPS_FIX_TYPE_3D_FIX,
            lat: 374221234,
            lon: -1220845678,
            alt: 12_345,
            eph: 234,
            epv: 567,
            vel: 0,
            cog: 0,
            satellites_visible: 12,
            alt_ellipsoid: 0,
            h_acc: 0,
            v_acc: 0,
            vel_acc: 0,
            hdg_acc: 0,
            yaw: 0,
        });

        let (_, fields) = extract_fields(&msg);
        assert_eq!(fields.len(), 7);
        assert_field_eq(&fields, "lat", 37.4221234);
        assert_field_eq(&fields, "lon", -122.0845678);
        assert_field_eq(&fields, "alt", 12.345);
        assert_field_eq(&fields, "fix_type", 3.0);
        assert_field_eq(&fields, "satellites_visible", 12.0);
        assert_field_eq(&fields, "eph", 2.34);
        assert_field_eq(&fields, "epv", 5.67);
    }

    #[test]
    fn extract_fields_heartbeat() {
        let msg = MavMessage::HEARTBEAT(HEARTBEAT_DATA {
            custom_mode: 42,
            mavtype: MavType::MAV_TYPE_QUADROTOR,
            autopilot: MavAutopilot::MAV_AUTOPILOT_ARDUPILOTMEGA,
            base_mode: MavModeFlag::MAV_MODE_FLAG_SAFETY_ARMED,
            system_status: MavState::MAV_STATE_ACTIVE,
            mavlink_version: 3,
        });

        let (_, fields) = extract_fields(&msg);
        assert_eq!(fields.len(), 3);
        assert_field_eq(&fields, "custom_mode", 42.0);
        assert_field_eq(
            &fields,
            "base_mode",
            MavModeFlag::MAV_MODE_FLAG_SAFETY_ARMED.bits() as f64,
        );
        assert_field_eq(
            &fields,
            "system_status",
            MavState::MAV_STATE_ACTIVE as u8 as f64,
        );
    }

    #[test]
    fn extract_fields_unhandled_message_returns_empty_map() {
        let msg = MavMessage::COMMAND_LONG(COMMAND_LONG_DATA {
            target_system: 1,
            target_component: 1,
            command: mavkit::dialect::MavCmd::MAV_CMD_COMPONENT_ARM_DISARM,
            confirmation: 0,
            param1: 0.0,
            param2: 0.0,
            param3: 0.0,
            param4: 0.0,
            param5: 0.0,
            param6: 0.0,
            param7: 0.0,
        });

        let (_, fields) = extract_fields(&msg);
        assert!(fields.is_empty());
    }

    #[test]
    fn tlog_to_stored_copies_timestamp_and_extracts_fields() {
        let msg = MavMessage::ATTITUDE(ATTITUDE_DATA {
            time_boot_ms: 0,
            roll: 0.25,
            pitch: -0.5,
            yaw: 1.0,
            rollspeed: 0.11,
            pitchspeed: 0.22,
            yawspeed: 0.33,
        });
        let expected = extract_fields(&msg);
        let stored = tlog_to_stored(0, 123_456, 1, 2, vec![0xFE, 0x01], msg);
        assert_eq!(stored.timestamp_usec, 123_456);
        assert_eq!(stored.msg_name, expected.0);
        assert_eq!(stored.fields, expected.1);
    }

    #[test]
    fn playback_seek_clamps_cursor_and_keeps_envelope() {
        let mut store = empty_store();
        store.entries.push(build_stored_entry(
            0,
            150,
            "GPS_RAW_INT".into(),
            HashMap::new(),
            BTreeMap::new(),
            StoredEntryContext::default(),
        ));

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
    fn bin_to_stored_with_timestamp_returns_entry() {
        let mut data = Vec::new();
        data.extend(build_fmt_bootstrap());
        data.extend(build_fmt_for_type(0x81, 11, b"TST\0", "Q", "TimeUS"));
        data.extend(build_data_message(0x81, &1_234u64.to_le_bytes()));
        let entries = parse_entries(data);
        let tst = entries
            .iter()
            .find(|e| e.name == "TST")
            .expect("TST entry should exist");

        let stored = bin_to_stored(0, tst).expect("timestamped entry should convert");
        assert_eq!(stored.timestamp_usec, 1_234);
        assert_eq!(stored.msg_name, "TST");
        assert_field_eq(&stored.fields, "TimeUS", 1_234.0);
    }

    #[test]
    fn bin_to_stored_without_timestamp_returns_none() {
        let mut data = Vec::new();
        data.extend(build_fmt_bootstrap());
        data.extend(build_fmt_for_type(0x82, 7, b"NOT\0", "f", "Value"));
        data.extend(build_data_message(0x82, &12.5f32.to_le_bytes()));
        let entries = parse_entries(data);
        let no_ts = entries
            .iter()
            .find(|e| e.name == "NOT")
            .expect("NOT entry should exist");

        assert!(bin_to_stored(0, no_ts).is_none());
    }

    #[test]
    fn bin_to_stored_keeps_only_numeric_fields() {
        let mut data = Vec::new();
        data.extend(build_fmt_bootstrap());
        data.extend(build_fmt_for_type(
            0x83,
            79,
            b"MIX\0",
            "QZf",
            "TimeUS,Message,Value",
        ));

        let mut payload = Vec::new();
        payload.extend_from_slice(&777u64.to_le_bytes());
        let mut msg_bytes = [0u8; 64];
        msg_bytes[..2].copy_from_slice(b"ok");
        payload.extend_from_slice(&msg_bytes);
        payload.extend_from_slice(&3.5f32.to_le_bytes());
        data.extend(build_data_message(0x83, &payload));

        let entries = parse_entries(data);
        let mix = entries
            .iter()
            .find(|e| e.name == "MIX")
            .expect("MIX entry should exist");

        let stored = bin_to_stored(0, mix).expect("MIX should convert");
        assert!(stored.fields.contains_key("TimeUS"));
        assert!(stored.fields.contains_key("Value"));
        assert!(!stored.fields.contains_key("Message"));
    }

    #[test]
    fn gps_fix_type_name_matches_mavkit_serde_variants() {
        assert_eq!(gps_fix_type_name(0.0), "no_fix");
        assert_eq!(gps_fix_type_name(1.0), "no_fix");
        assert_eq!(gps_fix_type_name(2.0), "fix_2d");
        assert_eq!(gps_fix_type_name(3.0), "fix_3d");
        assert_eq!(gps_fix_type_name(4.0), "dgps");
        assert_eq!(gps_fix_type_name(5.0), "rtk_float");
        assert_eq!(gps_fix_type_name(6.0), "rtk_fixed");
        assert_eq!(gps_fix_type_name(99.0), "no_fix");
    }

    #[test]
    fn haversine_nyc_to_london() {
        let dist = haversine_m(40.7128, -74.0060, 51.5074, -0.1278);
        assert!(
            (5_514_000.0..=5_626_000.0).contains(&dist),
            "expected ~5570 km, got {dist}"
        );
    }

    #[test]
    fn haversine_same_point() {
        let dist = haversine_m(48.8566, 2.3522, 48.8566, 2.3522);
        assert!(dist.abs() < 1e-6, "expected 0.0, got {dist}");
    }

    #[test]
    fn haversine_short_distance() {
        let dist = haversine_m(0.0, 0.0, 0.0009, 0.0);
        assert!(
            (50.0..=200.0).contains(&dist),
            "expected ~100 m, got {dist}"
        );
    }

    #[test]
    fn apply_tlog_entry_attitude_converts_radians_to_degrees() {
        let msg = MavMessage::ATTITUDE(ATTITUDE_DATA {
            time_boot_ms: 0,
            roll: 1.0,
            pitch: 0.5,
            yaw: -0.3,
            rollspeed: 0.0,
            pitchspeed: 0.0,
            yawspeed: 0.0,
        });
        let (_, fields) = extract_fields(&msg);
        let entry = stored_entry("ATTITUDE", fields);

        let mut snap = TelemetrySnapshot::default();
        apply_tlog_entry(&mut snap, &entry);

        assert!((snap.roll_deg.expect("roll") - 1.0_f64.to_degrees()).abs() < 1e-6);
        assert!((snap.pitch_deg.expect("pitch") - 0.5_f64.to_degrees()).abs() < 1e-6);
        assert!((snap.yaw_deg.expect("yaw") - (-0.3_f64).to_degrees()).abs() < 1e-6);
    }

    #[test]
    fn apply_tlog_entry_vfr_hud_sets_core_fields() {
        let msg = MavMessage::VFR_HUD(VFR_HUD_DATA {
            airspeed: 21.2,
            groundspeed: 19.8,
            heading: 275,
            throttle: 64,
            alt: 123.4,
            climb: -0.7,
        });
        let (_, fields) = extract_fields(&msg);
        let entry = stored_entry("VFR_HUD", fields);

        let mut snap = TelemetrySnapshot::default();
        apply_tlog_entry(&mut snap, &entry);

        assert!((snap.altitude_m.expect("alt") - 123.4).abs() < 1e-5);
        assert!((snap.speed_mps.expect("speed") - 19.8).abs() < 1e-5);
        assert_eq!(snap.heading_deg, Some(275.0));
        assert!((snap.climb_rate_mps.expect("climb") - (-0.7)).abs() < 1e-5);
        assert_eq!(snap.throttle_pct, Some(64.0));
        assert!((snap.airspeed_mps.expect("airspeed") - 21.2).abs() < 1e-5);
    }

    #[test]
    fn apply_tlog_entry_global_position_int_sets_position() {
        let msg = MavMessage::GLOBAL_POSITION_INT(GLOBAL_POSITION_INT_DATA {
            time_boot_ms: 0,
            lat: 377_749_000,
            lon: -1_220_419_000,
            alt: 42_000,
            relative_alt: 15_500,
            vx: 0,
            vy: 0,
            vz: 0,
            hdg: 9_000,
        });
        let (_, fields) = extract_fields(&msg);
        let entry = stored_entry("GLOBAL_POSITION_INT", fields);

        let mut snap = TelemetrySnapshot::default();
        apply_tlog_entry(&mut snap, &entry);

        assert!((snap.latitude_deg.expect("lat") - 37.7749).abs() < 1e-6);
        assert!((snap.longitude_deg.expect("lon") - (-122.0419)).abs() < 1e-6);
        assert_eq!(snap.altitude_m, Some(15.5));
        assert_eq!(snap.heading_deg, Some(90.0));
    }

    #[test]
    fn apply_tlog_entry_sys_status_sets_battery_fields() {
        let msg = MavMessage::SYS_STATUS(SYS_STATUS_DATA {
            onboard_control_sensors_present: MavSysStatusSensor::empty(),
            onboard_control_sensors_enabled: MavSysStatusSensor::empty(),
            onboard_control_sensors_health: MavSysStatusSensor::empty(),
            onboard_control_sensors_present_extended: MavSysStatusSensorExtended::empty(),
            onboard_control_sensors_enabled_extended: MavSysStatusSensorExtended::empty(),
            onboard_control_sensors_health_extended: MavSysStatusSensorExtended::empty(),
            load: 0,
            voltage_battery: 11_200,
            current_battery: 378,
            battery_remaining: 55,
            drop_rate_comm: 0,
            errors_comm: 0,
            errors_count1: 0,
            errors_count2: 0,
            errors_count3: 0,
            errors_count4: 0,
        });
        let (_, fields) = extract_fields(&msg);
        let entry = stored_entry("SYS_STATUS", fields);

        let mut snap = TelemetrySnapshot::default();
        apply_tlog_entry(&mut snap, &entry);

        assert_eq!(snap.battery_voltage_v, Some(11.2));
        assert_eq!(snap.battery_current_a, Some(3.78));
        assert_eq!(snap.battery_pct, Some(55.0));
    }

    #[test]
    fn apply_tlog_entry_gps_raw_int_sets_fix_label() {
        let msg = MavMessage::GPS_RAW_INT(GPS_RAW_INT_DATA {
            time_usec: 0,
            fix_type: mavkit::dialect::GpsFixType::GPS_FIX_TYPE_3D_FIX,
            lat: 0,
            lon: 0,
            alt: 0,
            eph: 145,
            epv: 200,
            vel: 0,
            cog: 0,
            satellites_visible: 17,
            alt_ellipsoid: 0,
            h_acc: 0,
            v_acc: 0,
            vel_acc: 0,
            hdg_acc: 0,
            yaw: 0,
        });
        let (_, fields) = extract_fields(&msg);
        let entry = stored_entry("GPS_RAW_INT", fields);

        let mut snap = TelemetrySnapshot::default();
        apply_tlog_entry(&mut snap, &entry);

        assert_eq!(snap.gps_fix_type.as_deref(), Some("fix_3d"));
        assert_eq!(snap.gps_satellites, Some(17.0));
        assert_eq!(snap.gps_hdop, Some(1.45));
    }

    #[test]
    fn apply_tlog_entry_heartbeat_sets_armed_and_custom_mode() {
        let msg = MavMessage::HEARTBEAT(HEARTBEAT_DATA {
            custom_mode: 6,
            mavtype: MavType::MAV_TYPE_QUADROTOR,
            autopilot: MavAutopilot::MAV_AUTOPILOT_ARDUPILOTMEGA,
            base_mode: MavModeFlag::MAV_MODE_FLAG_SAFETY_ARMED,
            system_status: MavState::MAV_STATE_ACTIVE,
            mavlink_version: 3,
        });
        let (_, fields) = extract_fields(&msg);
        let entry = stored_entry("HEARTBEAT", fields);

        let mut snap = TelemetrySnapshot::default();
        apply_tlog_entry(&mut snap, &entry);

        assert_eq!(snap.armed, Some(true));
        assert_eq!(snap.custom_mode, Some(6));
    }

    #[test]
    fn apply_tlog_entry_rc_channels_populates_channels_and_rssi() {
        let msg = MavMessage::RC_CHANNELS(RC_CHANNELS_DATA {
            time_boot_ms: 0,
            chancount: 8,
            chan1_raw: 1100,
            chan2_raw: 1200,
            chan3_raw: 1300,
            chan4_raw: 1400,
            chan5_raw: 1500,
            chan6_raw: 1600,
            chan7_raw: 1700,
            chan8_raw: 1800,
            chan9_raw: 1900,
            chan10_raw: 2000,
            chan11_raw: 0,
            chan12_raw: 0,
            chan13_raw: 0,
            chan14_raw: 0,
            chan15_raw: 0,
            chan16_raw: 0,
            chan17_raw: 0,
            chan18_raw: 0,
            rssi: 99,
        });
        let (_, fields) = extract_fields(&msg);
        let entry = stored_entry("RC_CHANNELS", fields);

        let mut snap = TelemetrySnapshot::default();
        apply_tlog_entry(&mut snap, &entry);

        assert_eq!(snap.rc_rssi, Some(99.0));
        assert_eq!(
            snap.rc_channels,
            Some(vec![
                1100.0, 1200.0, 1300.0, 1400.0, 1500.0, 1600.0, 1700.0, 1800.0
            ])
        );
    }

    #[test]
    fn apply_tlog_entry_unknown_keeps_existing_values() {
        let mut snap = TelemetrySnapshot {
            roll_deg: Some(12.0),
            altitude_m: Some(50.0),
            gps_fix_type: Some("fix_3d".to_string()),
            ..Default::default()
        };

        let mut fields = HashMap::new();
        fields.insert("ignored".to_string(), 1.0);
        let entry = stored_entry("UNKNOWN", fields);
        apply_tlog_entry(&mut snap, &entry);

        assert_eq!(snap.roll_deg, Some(12.0));
        assert_eq!(snap.altitude_m, Some(50.0));
        assert_eq!(snap.gps_fix_type.as_deref(), Some("fix_3d"));
    }

    #[test]
    fn apply_tlog_entry_carry_forward_across_messages() {
        let att = MavMessage::ATTITUDE(ATTITUDE_DATA {
            time_boot_ms: 0,
            roll: 0.25,
            pitch: 0.0,
            yaw: 0.0,
            rollspeed: 0.0,
            pitchspeed: 0.0,
            yawspeed: 0.0,
        });
        let (_, att_fields) = extract_fields(&att);
        let att_entry = stored_entry("ATTITUDE", att_fields);

        let vfr = MavMessage::VFR_HUD(VFR_HUD_DATA {
            airspeed: 10.0,
            groundspeed: 9.0,
            heading: 180,
            throttle: 45,
            alt: 88.0,
            climb: 0.1,
        });
        let (_, vfr_fields) = extract_fields(&vfr);
        let vfr_entry = stored_entry("VFR_HUD", vfr_fields);

        let mut unknown_fields = HashMap::new();
        unknown_fields.insert("foo".to_string(), 1.0);
        let unknown_entry = stored_entry("UNKNOWN", unknown_fields);

        let mut snap = TelemetrySnapshot::default();
        apply_tlog_entry(&mut snap, &att_entry);
        let expected_roll = 0.25_f64.to_degrees();
        assert!((snap.roll_deg.expect("roll") - expected_roll).abs() < 1e-6);

        apply_tlog_entry(&mut snap, &vfr_entry);
        assert!((snap.roll_deg.expect("roll retained") - expected_roll).abs() < 1e-6);
        assert_eq!(snap.altitude_m, Some(88.0));

        apply_tlog_entry(&mut snap, &unknown_entry);
        assert!((snap.roll_deg.expect("roll still retained") - expected_roll).abs() < 1e-6);
        assert_eq!(snap.altitude_m, Some(88.0));
        assert_eq!(snap.heading_deg, Some(180.0));
    }

    #[test]
    fn apply_bin_entry_att_sets_attitude_fields() {
        let mut fields = HashMap::new();
        fields.insert("Roll".to_string(), 45.0);
        fields.insert("Pitch".to_string(), -10.0);
        fields.insert("Yaw".to_string(), 180.0);
        let entry = stored_entry("ATT", fields);

        let mut snap = TelemetrySnapshot::default();
        apply_bin_entry(&mut snap, &entry);

        assert_eq!(snap.roll_deg, Some(45.0));
        assert_eq!(snap.pitch_deg, Some(-10.0));
        assert_eq!(snap.yaw_deg, Some(180.0));
    }

    #[test]
    fn apply_bin_entry_gps_scales_and_sets_navigation_fields() {
        let mut fields = HashMap::new();
        fields.insert("Lat".to_string(), 377_749_000.0);
        fields.insert("Lng".to_string(), -1_220_419_000.0);
        fields.insert("Spd".to_string(), 15.5);
        fields.insert("GCrs".to_string(), 270.0);
        fields.insert("Status".to_string(), 3.0);
        fields.insert("NSats".to_string(), 14.0);
        fields.insert("HDop".to_string(), 0.8);
        let entry = stored_entry("GPS", fields);

        let mut snap = TelemetrySnapshot::default();
        apply_bin_entry(&mut snap, &entry);

        assert!((snap.latitude_deg.expect("lat") - 37.7749).abs() < 1e-6);
        assert!((snap.longitude_deg.expect("lon") - (-122.0419)).abs() < 1e-6);
        assert_eq!(snap.speed_mps, Some(15.5));
        assert_eq!(snap.heading_deg, Some(270.0));
        assert_eq!(snap.gps_fix_type.as_deref(), Some("fix_3d"));
        assert_eq!(snap.gps_satellites, Some(14.0));
    }

    #[test]
    fn apply_bin_entry_bat_sets_battery_fields() {
        let mut fields = HashMap::new();
        fields.insert("Volt".to_string(), 11.7);
        fields.insert("Curr".to_string(), 6.3);
        fields.insert("Rem".to_string(), 48.0);
        let entry = stored_entry("BAT", fields);

        let mut snap = TelemetrySnapshot::default();
        apply_bin_entry(&mut snap, &entry);

        assert_eq!(snap.battery_voltage_v, Some(11.7));
        assert_eq!(snap.battery_current_a, Some(6.3));
        assert_eq!(snap.battery_pct, Some(48.0));
    }

    #[test]
    fn apply_bin_entry_rcin_populates_rc_channels() {
        let mut fields = HashMap::new();
        for i in 1..=8 {
            fields.insert(format!("C{i}"), 1000.0 + (i as f64 * 10.0));
        }
        let entry = stored_entry("RCIN", fields);

        let mut snap = TelemetrySnapshot::default();
        apply_bin_entry(&mut snap, &entry);

        assert_eq!(
            snap.rc_channels,
            Some(vec![
                1010.0, 1020.0, 1030.0, 1040.0, 1050.0, 1060.0, 1070.0, 1080.0
            ])
        );
    }

    #[test]
    fn apply_bin_entry_rcou_populates_servo_outputs() {
        let mut fields = HashMap::new();
        for i in 1..=8 {
            fields.insert(format!("C{i}"), 1100.0 + (i as f64 * 5.0));
        }
        let entry = stored_entry("RCOU", fields);

        let mut snap = TelemetrySnapshot::default();
        apply_bin_entry(&mut snap, &entry);

        assert_eq!(
            snap.servo_outputs,
            Some(vec![
                1105.0, 1110.0, 1115.0, 1120.0, 1125.0, 1130.0, 1135.0, 1140.0
            ])
        );
    }

    #[test]
    fn apply_bin_entry_ctun_sets_altitude_and_climb_rate() {
        let mut fields = HashMap::new();
        fields.insert("Alt".to_string(), 120.0);
        fields.insert("CRt".to_string(), 1.7);
        let entry = stored_entry("CTUN", fields);

        let mut snap = TelemetrySnapshot::default();
        apply_bin_entry(&mut snap, &entry);

        assert_eq!(snap.altitude_m, Some(120.0));
        assert_eq!(snap.climb_rate_mps, Some(1.7));
    }

    #[test]
    fn apply_bin_entry_mode_sets_custom_mode() {
        let mut fields = HashMap::new();
        fields.insert("ModeNum".to_string(), 4.0);
        let entry = stored_entry("MODE", fields);

        let mut snap = TelemetrySnapshot::default();
        apply_bin_entry(&mut snap, &entry);

        assert_eq!(snap.custom_mode, Some(4));
    }

    #[test]
    fn apply_bin_entry_unknown_keeps_existing_values() {
        let mut snap = TelemetrySnapshot {
            roll_deg: Some(9.0),
            altitude_m: Some(22.0),
            ..Default::default()
        };

        let mut fields = HashMap::new();
        fields.insert("Something".to_string(), 1.0);
        let entry = stored_entry("NKF1", fields);
        apply_bin_entry(&mut snap, &entry);

        assert_eq!(snap.roll_deg, Some(9.0));
        assert_eq!(snap.altitude_m, Some(22.0));
    }

    #[test]
    fn tlog_and_bin_gps_scaling_parity() {
        let tlog_msg = MavMessage::GLOBAL_POSITION_INT(GLOBAL_POSITION_INT_DATA {
            time_boot_ms: 0,
            lat: 377_749_000,
            lon: -1_220_419_000,
            alt: 0,
            relative_alt: 0,
            vx: 0,
            vy: 0,
            vz: 0,
            hdg: 0,
        });
        let (_, tlog_fields) = extract_fields(&tlog_msg);
        let tlog_entry = stored_entry("GLOBAL_POSITION_INT", tlog_fields);

        let mut bin_fields = HashMap::new();
        bin_fields.insert("Lat".to_string(), 377_749_000.0);
        bin_fields.insert("Lng".to_string(), -1_220_419_000.0);
        let bin_entry = stored_entry("GPS", bin_fields);

        let mut tlog_snap = TelemetrySnapshot::default();
        let mut bin_snap = TelemetrySnapshot::default();
        apply_tlog_entry(&mut tlog_snap, &tlog_entry);
        apply_bin_entry(&mut bin_snap, &bin_entry);

        let tlog_lat = tlog_snap.latitude_deg.expect("tlog lat");
        let tlog_lon = tlog_snap.longitude_deg.expect("tlog lon");
        let bin_lat = bin_snap.latitude_deg.expect("bin lat");
        let bin_lon = bin_snap.longitude_deg.expect("bin lon");

        assert!((tlog_lat - 37.7749).abs() < 1e-6);
        assert!((tlog_lon - (-122.0419)).abs() < 1e-6);
        assert!((bin_lat - 37.7749).abs() < 1e-6);
        assert!((bin_lon - (-122.0419)).abs() < 1e-6);
        assert!((tlog_lat - bin_lat).abs() < 1e-6);
        assert!((tlog_lon - bin_lon).abs() < 1e-6);
    }

    #[test]
    fn logs_raw_query_paginates_and_filters() {
        let tlog_store = store_from_entries(
            "raw-query.tlog",
            LogType::Tlog,
            vec![
                stored_entry_with_values_and_payload(
                    0,
                    100,
                    "HEARTBEAT",
                    HashMap::from([("custom_mode".to_string(), 4.0)]),
                    BTreeMap::from([
                        ("custom_mode".to_string(), JsonValue::from(4.0)),
                        ("note".to_string(), JsonValue::from("startup")),
                    ]),
                    Some(vec![0xFE, 0x09, 0x00]),
                ),
                stored_entry_with_values_and_payload(
                    1,
                    200,
                    "GLOBAL_POSITION_INT",
                    HashMap::from([("relative_alt".to_string(), 12_000.0)]),
                    BTreeMap::from([
                        ("relative_alt".to_string(), JsonValue::from(12_000.0)),
                        ("valid".to_string(), JsonValue::from(true)),
                        ("note".to_string(), JsonValue::from("alt match one")),
                    ]),
                    Some(vec![0xFD, 0x0C, 0x01]),
                ),
                stored_entry_with_values_and_payload(
                    2,
                    300,
                    "GLOBAL_POSITION_INT",
                    HashMap::from([("relative_alt".to_string(), 16_000.0)]),
                    BTreeMap::from([
                        ("relative_alt".to_string(), JsonValue::from(16_000.0)),
                        ("valid".to_string(), JsonValue::from(false)),
                        ("note".to_string(), JsonValue::from("alt match two")),
                    ]),
                    Some(vec![0xFD, 0x0C, 0x02]),
                ),
            ],
        );
        let request = RawMessageQuery {
            entry_id: "entry-tlog".into(),
            cursor: None,
            start_usec: Some(150),
            end_usec: Some(350),
            message_types: vec!["GLOBAL_POSITION_INT".into()],
            text: Some("alt match".into()),
            field_filters: vec![RawMessageFieldFilter {
                field: "relative_alt".into(),
                value_text: Some("000".into()),
            }],
            limit: 1,
            include_detail: true,
            include_hex: true,
        };

        let first_page = raw_messages::query_raw_message_page(&tlog_store, &request)
            .expect("query tlog raw page");
        assert_eq!(first_page.total_available, Some(2));
        assert_eq!(first_page.items.len(), 1);
        assert_eq!(first_page.items[0].sequence, 1);
        assert!(first_page.items[0].detail.is_some());
        assert!(first_page.items[0].hex_payload.is_some());
        assert_eq!(first_page.next_cursor.as_deref(), Some("0000000000000002"));

        let second_page = raw_messages::query_raw_message_page(
            &tlog_store,
            &RawMessageQuery {
                cursor: first_page.next_cursor.clone(),
                ..request.clone()
            },
        )
        .expect("query tlog raw second page");
        assert_eq!(second_page.items.len(), 1);
        assert_eq!(second_page.items[0].sequence, 2);
        assert_eq!(second_page.next_cursor, None);

        let bin_store = store_from_entries(
            "raw-query.bin",
            LogType::Bin,
            vec![
                stored_entry_with_values(
                    0,
                    5_000_000,
                    "GPS",
                    HashMap::from([("Status".to_string(), 3.0), ("Alt".to_string(), 22.0)]),
                    BTreeMap::from([
                        ("Status".to_string(), JsonValue::from(3.0)),
                        ("Alt".to_string(), JsonValue::from(22.0)),
                        ("note".to_string(), JsonValue::from("nav bin point")),
                    ]),
                ),
                stored_entry_with_values(
                    1,
                    6_000_000,
                    "MODE",
                    HashMap::from([("ModeNum".to_string(), 4.0)]),
                    BTreeMap::from([("ModeNum".to_string(), JsonValue::from(4.0))]),
                ),
            ],
        );
        let bin_page = raw_messages::query_raw_message_page(
            &bin_store,
            &RawMessageQuery {
                entry_id: "entry-bin".into(),
                cursor: None,
                start_usec: Some(4_500_000),
                end_usec: Some(5_500_000),
                message_types: vec!["GPS".into()],
                text: Some("nav".into()),
                field_filters: vec![RawMessageFieldFilter {
                    field: "Status".into(),
                    value_text: Some("3".into()),
                }],
                limit: 50,
                include_detail: false,
                include_hex: false,
            },
        )
        .expect("query bin raw page");
        assert_eq!(bin_page.total_available, Some(1));
        assert_eq!(bin_page.items.len(), 1);
        assert_eq!(bin_page.items[0].message_type, "GPS");
        assert_eq!(bin_page.items[0].detail, None);
        assert_eq!(bin_page.items[0].hex_payload, None);
    }

    #[test]
    fn logs_chart_query_bounds_points() {
        let tlog_store = store_from_entries(
            "chart-query.tlog",
            LogType::Tlog,
            vec![
                stored_entry_with_values(
                    0,
                    100,
                    "VFR_HUD",
                    HashMap::from([("alt".to_string(), 0.0)]),
                    BTreeMap::from([("alt".to_string(), JsonValue::from(0.0))]),
                ),
                stored_entry_with_values(
                    1,
                    200,
                    "VFR_HUD",
                    HashMap::from([("alt".to_string(), 10.0)]),
                    BTreeMap::from([("alt".to_string(), JsonValue::from(10.0))]),
                ),
                stored_entry_with_values(
                    2,
                    300,
                    "VFR_HUD",
                    HashMap::from([("alt".to_string(), 20.0)]),
                    BTreeMap::from([("alt".to_string(), JsonValue::from(20.0))]),
                ),
                stored_entry_with_values(
                    3,
                    400,
                    "VFR_HUD",
                    HashMap::from([("alt".to_string(), 30.0)]),
                    BTreeMap::from([("alt".to_string(), JsonValue::from(30.0))]),
                ),
            ],
        );
        let tlog_page = query_chart_series(
            &tlog_store,
            &ChartSeriesRequest {
                entry_id: "entry-tlog".into(),
                selectors: vec![crate::ipc::logs::ChartSeriesSelector {
                    message_type: "VFR_HUD".into(),
                    field: "alt".into(),
                    label: "Altitude".into(),
                    unit: Some("m".into()),
                }],
                start_usec: Some(150),
                end_usec: Some(450),
                max_points: Some(2),
            },
        );
        assert_eq!(tlog_page.series.len(), 1);
        assert_eq!(tlog_page.series[0].points.len(), 2);
        assert!(
            tlog_page.series[0]
                .points
                .iter()
                .all(|point| (150..=450).contains(&point.timestamp_usec))
        );

        let bin_store = store_from_entries(
            "chart-query.bin",
            LogType::Bin,
            vec![
                stored_entry_with_values(
                    0,
                    1_000,
                    "CTUN",
                    HashMap::from([("Alt".to_string(), 11.0)]),
                    BTreeMap::from([("Alt".to_string(), JsonValue::from(11.0))]),
                ),
                stored_entry_with_values(
                    1,
                    2_000,
                    "CTUN",
                    HashMap::from([("Alt".to_string(), 22.0)]),
                    BTreeMap::from([("Alt".to_string(), JsonValue::from(22.0))]),
                ),
                stored_entry_with_values(
                    2,
                    3_000,
                    "CTUN",
                    HashMap::from([("Alt".to_string(), 33.0)]),
                    BTreeMap::from([("Alt".to_string(), JsonValue::from(33.0))]),
                ),
            ],
        );
        let bin_page = query_chart_series(
            &bin_store,
            &ChartSeriesRequest {
                entry_id: "entry-bin".into(),
                selectors: vec![crate::ipc::logs::ChartSeriesSelector {
                    message_type: "CTUN".into(),
                    field: "Alt".into(),
                    label: "Relative altitude".into(),
                    unit: Some("m".into()),
                }],
                start_usec: Some(1_500),
                end_usec: Some(3_500),
                max_points: Some(1),
            },
        );
        assert_eq!(bin_page.series[0].points.len(), 1);
        assert!((1_500..=3_500).contains(&bin_page.series[0].points[0].timestamp_usec));
    }

    #[test]
    fn logs_export_filtered_range_csv() {
        let temp_dir = temp_dir("log-export-filtered-range");
        let tlog_path = temp_dir.join("filtered-tlog.csv");
        let tlog_store = store_from_entries(
            "export-query.tlog",
            LogType::Tlog,
            vec![
                stored_entry_with_values(
                    0,
                    100,
                    "GLOBAL_POSITION_INT",
                    HashMap::from([("relative_alt".to_string(), 10_000.0)]),
                    BTreeMap::from([
                        ("relative_alt".to_string(), JsonValue::from(10_000.0)),
                        ("note".to_string(), JsonValue::from("keep")),
                    ]),
                ),
                stored_entry_with_values(
                    1,
                    200,
                    "GLOBAL_POSITION_INT",
                    HashMap::from([("relative_alt".to_string(), 20_000.0)]),
                    BTreeMap::from([
                        ("relative_alt".to_string(), JsonValue::from(20_000.0)),
                        ("note".to_string(), JsonValue::from("skip")),
                    ]),
                ),
            ],
        );
        let tlog_result = raw_messages::export_csv_from_store(
            &tlog_store,
            &LogExportRequest {
                entry_id: "entry-tlog".into(),
                instance_id: "export-1".into(),
                format: LogExportFormat::Csv,
                destination_path: tlog_path.to_string_lossy().to_string(),
                start_usec: Some(50),
                end_usec: Some(150),
                message_types: vec!["GLOBAL_POSITION_INT".into()],
                text: Some("keep".into()),
                field_filters: vec![RawMessageFieldFilter {
                    field: "relative_alt".into(),
                    value_text: Some("10000".into()),
                }],
            },
        )
        .expect("export filtered tlog csv");
        let tlog_csv = std::fs::read_to_string(&tlog_path).expect("read tlog csv");
        assert_eq!(tlog_result.rows_written, 1);
        assert!(tlog_result.bytes_written > 0);
        assert!(tlog_csv.contains("timestamp_sec,msg_type,relative_alt"));
        assert!(tlog_csv.contains("0.000100,GLOBAL_POSITION_INT,10000"));
        assert!(!tlog_csv.contains("20000"));

        let bin_path = temp_dir.join("filtered-bin.csv");
        let bin_store = store_from_entries(
            "export-query.bin",
            LogType::Bin,
            vec![
                stored_entry_with_values(
                    0,
                    1_000,
                    "GPS",
                    HashMap::from([("Alt".to_string(), 12.0)]),
                    BTreeMap::from([
                        ("Alt".to_string(), JsonValue::from(12.0)),
                        ("note".to_string(), JsonValue::from("bin-keep")),
                    ]),
                ),
                stored_entry_with_values(
                    1,
                    2_000,
                    "GPS",
                    HashMap::from([("Alt".to_string(), 24.0)]),
                    BTreeMap::from([
                        ("Alt".to_string(), JsonValue::from(24.0)),
                        ("note".to_string(), JsonValue::from("bin-skip")),
                    ]),
                ),
            ],
        );
        let bin_result = raw_messages::export_csv_from_store(
            &bin_store,
            &LogExportRequest {
                entry_id: "entry-bin".into(),
                instance_id: "export-2".into(),
                format: LogExportFormat::Csv,
                destination_path: bin_path.to_string_lossy().to_string(),
                start_usec: Some(500),
                end_usec: Some(1_500),
                message_types: vec!["GPS".into()],
                text: Some("bin-keep".into()),
                field_filters: vec![RawMessageFieldFilter {
                    field: "Alt".into(),
                    value_text: Some("12".into()),
                }],
            },
        )
        .expect("export filtered bin csv");
        let bin_csv = std::fs::read_to_string(&bin_path).expect("read bin csv");
        assert_eq!(bin_result.rows_written, 1);
        assert!(bin_csv.contains("0.001000,GPS,12"));
        assert!(!bin_csv.contains("24"));
    }

    #[test]
    fn logs_export_csv_escapes_and_sanitizes_string_cells() {
        let temp_dir = temp_dir("log-export-string-cells");
        let path = temp_dir.join("string-cells.csv");
        let store = store_from_entries(
            "export-strings.tlog",
            LogType::Tlog,
            vec![stored_entry_with_values(
                0,
                100,
                "=MSG,TYPE",
                HashMap::from([
                    ("field,comma".to_string(), 1.0),
                    ("field\"quote".to_string(), 2.0),
                    ("field\nnewline".to_string(), 3.0),
                    ("=field_formula".to_string(), 4.0),
                ]),
                BTreeMap::from([
                    ("field,comma".to_string(), JsonValue::from(1.0)),
                    ("field\"quote".to_string(), JsonValue::from(2.0)),
                    ("field\nnewline".to_string(), JsonValue::from(3.0)),
                    ("=field_formula".to_string(), JsonValue::from(4.0)),
                ]),
            )],
        );

        raw_messages::export_csv_from_store(
            &store,
            &LogExportRequest {
                entry_id: "entry-tlog".into(),
                instance_id: "export-strings".into(),
                format: LogExportFormat::Csv,
                destination_path: path.to_string_lossy().to_string(),
                start_usec: None,
                end_usec: None,
                message_types: vec!["=MSG,TYPE".into()],
                text: None,
                field_filters: vec![],
            },
        )
        .expect("export string csv");

        let csv = std::fs::read_to_string(&path).expect("read string csv");
        assert!(csv.contains("\"field,comma\""));
        assert!(csv.contains("\"field\"\"quote\""));
        assert!(csv.contains("\"field\nnewline\""));
        assert!(csv.contains("'=field_formula"));
        assert!(csv.contains("\"'=MSG,TYPE\""));
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
    async fn blocking_raw_message_query_matches_sync_helper_behavior() {
        let store = store_from_entries(
            "blocking-raw-query.tlog",
            LogType::Tlog,
            vec![stored_entry_with_values(
                0,
                100,
                "HEARTBEAT",
                HashMap::from([("custom_mode".to_string(), 4.0)]),
                BTreeMap::from([("custom_mode".to_string(), JsonValue::from(4.0))]),
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
    async fn blocking_chart_series_query_matches_sync_helper_behavior() {
        let store = store_from_entries(
            "blocking-chart-query.tlog",
            LogType::Tlog,
            vec![stored_entry_with_values(
                0,
                100,
                "VFR_HUD",
                HashMap::from([("alt".to_string(), 42.0)]),
                BTreeMap::from([("alt".to_string(), JsonValue::from(42.0))]),
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

    #[tokio::test(flavor = "current_thread")]
    async fn blocking_export_csv_matches_sync_helper_behavior() {
        let temp_dir = temp_dir("blocking-export-query");
        let path = temp_dir.join("blocking.csv");
        let store = store_from_entries(
            "blocking-export.tlog",
            LogType::Tlog,
            vec![stored_entry_with_values(
                0,
                100,
                "GLOBAL_POSITION_INT",
                HashMap::from([("relative_alt".to_string(), 10_000.0)]),
                BTreeMap::from([("relative_alt".to_string(), JsonValue::from(10_000.0))]),
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

    #[test]
    fn haversine_antipodal_points() {
        // Antipodal points are exactly opposite on the globe
        // Distance should be half the Earth's circumference ≈ 20,015 km
        let dist = haversine_m(0.0, 0.0, 0.0, 180.0);
        // Half circumference = π * R = π * 6,371,000 ≈ 20,015,087 m
        let expected = std::f64::consts::PI * 6_371_000.0;
        assert!(
            (dist - expected).abs() / expected < 0.01,
            "Expected ~{:.0}m, got {:.0}m",
            expected,
            dist
        );
    }
}
