use std::cell::RefCell;
use std::future::Future;
use std::rc::Rc;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use mavkit::ardupilot::{MagCalProgress, MagCalReport};
use mavkit::{HomePosition, ObservationSubscription, ParamStore, SensorHealthSummary, Vehicle};
use web_time::Instant;

use crate::event_names;
use crate::ipc::calibration::CalibrationSnapshot;
use crate::ipc::{
    AckSessionSnapshotResult, CalibrationSources, DomainProvenance, DomainValue,
    OpenSessionSnapshot, ScopedEvent, SessionConnection, SessionEnvelope, SessionSnapshot,
    SourceKind, StatusTextEntry, TelemetrySnapshot, calibration_snapshot_from_sources,
    configuration_facts_snapshot_from_param_store, push_status_text_entry,
    sensor_health_snapshot_from_summary, session_connection_from_link_state,
    status_text_entry_from_value, status_text_snapshot_from_entries, support_snapshot,
};
use crate::live::{
    LiveSnapshotInput, SessionContext, base_live_snapshot_from_caches,
    session_snapshot_from_context,
};
use crate::live_runtime::event_sink::EventSink;
use crate::live_runtime::task_set::{
    LocalTaskSpawner, LocalTimer, SendTaskSpawner, SendTimer, TelemetryIntervalProvider,
};
use crate::runtime::SessionRuntime;
use crate::vehicle_snapshot::{
    mav_severity_name, seeded_vehicle_state, telemetry_snapshot_from_vehicle,
};

pub struct LiveVehicleRuntime<E>
where
    E: EventSink,
{
    event_sink: E,
    session_runtime: SessionRuntime,
    session_context: SessionContext,
    live_telemetry: TelemetrySnapshot,
    status_text_history: Vec<StatusTextEntry>,
    next_status_text_sequence: u64,
    vehicle: Option<Vehicle>,
}

impl<E> LiveVehicleRuntime<E>
where
    E: EventSink,
{
    pub fn new(event_sink: E) -> Self {
        Self {
            event_sink,
            session_runtime: SessionRuntime::new(),
            session_context: SessionContext::new(),
            live_telemetry: TelemetrySnapshot::missing(DomainProvenance::Bootstrap),
            status_text_history: Vec::new(),
            next_status_text_sequence: 1,
            vehicle: None,
        }
    }

    pub fn event_sink(&self) -> E {
        self.event_sink.clone()
    }

    pub fn session_runtime(&self) -> &SessionRuntime {
        &self.session_runtime
    }

    pub fn session_runtime_mut(&mut self) -> &mut SessionRuntime {
        &mut self.session_runtime
    }

    pub fn session_context(&self) -> &SessionContext {
        &self.session_context
    }

    pub fn live_telemetry(&self) -> &TelemetrySnapshot {
        &self.live_telemetry
    }

    pub fn status_text_history(&self) -> &[StatusTextEntry] {
        &self.status_text_history
    }

    pub fn vehicle(&self) -> Option<Vehicle> {
        self.vehicle.clone()
    }

    pub fn is_connected(&self) -> bool {
        self.vehicle.is_some()
    }

    pub fn take_vehicle(&mut self) -> Option<Vehicle> {
        self.vehicle.take()
    }

    pub fn reset_live_state(&mut self) {
        // Preserve SessionRuntime so the active live envelope can receive the
        // disconnected snapshot; opening a new live source creates a fresh
        // envelope through the existing session handoff path.
        self.session_context.reset();
        self.live_telemetry = TelemetrySnapshot::missing(DomainProvenance::Bootstrap);
        self.status_text_history.clear();
        self.next_status_text_sequence = 1;
        self.vehicle = None;
    }

    pub fn prepare_connecting(&mut self) {
        self.reset_live_state();
        self.session_context.connection = SessionConnection::Connecting;
    }

    pub fn set_connection_error(&mut self, error: impl Into<String>) {
        self.vehicle = None;
        self.session_context.connection = SessionConnection::Error {
            error: error.into(),
        };
    }

    pub fn seed_connected_vehicle(&mut self, vehicle: &Vehicle) {
        self.session_context.vehicle_state = Some(seeded_vehicle_state(vehicle));
        self.session_context.connection = SessionConnection::Connected;
        self.vehicle = Some(vehicle.clone());
    }

    pub fn update_link_state(&mut self, link_state: &mavkit::LinkState) {
        self.session_context.connection = session_connection_from_link_state(link_state);
    }

    pub fn update_armed(&mut self, armed: bool) {
        if let Some(vehicle_state) = self.session_context.vehicle_state.as_mut() {
            vehicle_state.armed = armed;
        }
    }

    pub fn update_current_mode(&mut self, custom_mode: u32, mode_name: &str) {
        if let Some(vehicle_state) = self.session_context.vehicle_state.as_mut() {
            vehicle_state.custom_mode = custom_mode;
            vehicle_state.mode_name = mode_name.to_string();
        }
    }

    pub fn update_home_position(&mut self, home_position: HomePosition) {
        self.session_context.home_position = Some(home_position);
    }

    pub fn update_live_telemetry(&mut self, telemetry: TelemetrySnapshot) {
        self.live_telemetry = telemetry;
    }

    pub fn session_snapshot(&self, provenance: DomainProvenance) -> DomainValue<SessionSnapshot> {
        session_snapshot_from_context(&self.session_context, self.is_connected(), provenance)
    }

    pub fn live_snapshot_with_envelope(
        &self,
        envelope: SessionEnvelope,
        provenance: DomainProvenance,
    ) -> OpenSessionSnapshot {
        let mut snapshot = base_live_snapshot_from_caches(LiveSnapshotInput {
            envelope,
            session_context: &self.session_context,
            live_telemetry: &self.live_telemetry,
            status_text_entries: &self.status_text_history,
            connected: self.is_connected(),
            provenance,
        });

        let Some(vehicle) = self.vehicle.as_ref() else {
            return snapshot;
        };

        snapshot.mission_state = vehicle.mission().latest();

        let param_state = vehicle.params().latest();
        let param_store = param_state.as_ref().and_then(|item| item.store.clone());
        snapshot.param_store = param_store.clone();
        snapshot.param_progress = None;
        snapshot.configuration_facts = param_store
            .as_ref()
            .map(|store| configuration_facts_snapshot_from_param_store(store, provenance))
            .unwrap_or_else(|| DomainValue::missing(provenance));

        let ardupilot = vehicle.ardupilot();
        let mag_progress_list = ardupilot.mag_cal_progress().latest().unwrap_or_default();
        let mag_report_list = ardupilot.mag_cal_report().latest().unwrap_or_default();
        snapshot.calibration = calibration_snapshot_from_sources(
            mag_progress_list.first(),
            mag_report_list.first(),
            provenance,
        );

        snapshot
    }

    pub fn open_session_snapshot(&mut self, source_kind: SourceKind) -> OpenSessionSnapshot {
        let snapshot = self.session_runtime.open_session_snapshot(source_kind);
        if source_kind == SourceKind::Live {
            self.live_snapshot_with_envelope(snapshot.envelope, DomainProvenance::Bootstrap)
        } else {
            snapshot
        }
    }

    pub fn ack_session_snapshot(
        &mut self,
        session_id: &str,
        seek_epoch: u64,
        reset_revision: u64,
    ) -> AckSessionSnapshotResult {
        self.session_runtime
            .ack_session_snapshot(session_id, seek_epoch, reset_revision)
    }

    pub fn current_stream_envelope(&mut self, now: Instant) -> Option<SessionEnvelope> {
        self.session_runtime.current_stream_envelope(now)
    }

    pub fn effective_session_envelope(&mut self, now: Instant) -> Option<SessionEnvelope> {
        self.session_runtime.effective_session_envelope(now)
    }

    pub fn effective_source_kind(&self) -> SourceKind {
        self.session_runtime.effective_source_kind()
    }

    pub fn guided_source_kind(&self) -> SourceKind {
        self.session_runtime.guided_source_kind()
    }

    pub fn close_playback_session(&mut self) -> Option<SessionEnvelope> {
        self.session_runtime.close_playback_session()
    }

    pub fn push_status_text_from_value(
        &mut self,
        value: &serde_json::Value,
        provenance: DomainProvenance,
    ) -> Option<crate::ipc::StatusTextSnapshot> {
        let mut entry = status_text_entry_from_value(value)?;
        entry.sequence = self.next_status_text_sequence;
        self.next_status_text_sequence = self.next_status_text_sequence.saturating_add(1);
        push_status_text_entry(&mut self.status_text_history, entry);
        Some(status_text_snapshot_from_entries(
            self.status_text_history.clone(),
            provenance,
        ))
    }
}

#[derive(Clone)]
pub struct LocalLiveRuntime<E>
where
    E: EventSink,
{
    inner: Rc<RefCell<LiveVehicleRuntime<E>>>,
}

impl<E> LocalLiveRuntime<E>
where
    E: EventSink,
{
    pub fn new(runtime: LiveVehicleRuntime<E>) -> Self {
        Self {
            inner: Rc::new(RefCell::new(runtime)),
        }
    }

    pub fn with_runtime<R>(&self, f: impl FnOnce(&mut LiveVehicleRuntime<E>) -> R) -> R {
        f(&mut self.inner.borrow_mut())
    }
}

#[derive(Clone)]
pub struct SharedLiveRuntime<E>
where
    E: EventSink,
{
    inner: Arc<Mutex<LiveVehicleRuntime<E>>>,
}

impl<E> SharedLiveRuntime<E>
where
    E: EventSink,
{
    pub fn new(runtime: LiveVehicleRuntime<E>) -> Self {
        Self {
            inner: Arc::new(Mutex::new(runtime)),
        }
    }

    pub fn with_runtime<R>(&self, f: impl FnOnce(&mut LiveVehicleRuntime<E>) -> R) -> R {
        let mut guard = self
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        f(&mut guard)
    }
}

pub trait LiveRuntimeHandle: Clone + 'static {
    type Sink: EventSink;

    fn with_runtime<R>(&self, f: impl FnOnce(&mut LiveVehicleRuntime<Self::Sink>) -> R) -> R;
}

impl<E> LiveRuntimeHandle for LocalLiveRuntime<E>
where
    E: EventSink,
{
    type Sink = E;

    fn with_runtime<R>(&self, f: impl FnOnce(&mut LiveVehicleRuntime<Self::Sink>) -> R) -> R {
        self.with_runtime(f)
    }
}

impl<E> LiveRuntimeHandle for SharedLiveRuntime<E>
where
    E: EventSink,
{
    type Sink = E;

    fn with_runtime<R>(&self, f: impl FnOnce(&mut LiveVehicleRuntime<Self::Sink>) -> R) -> R {
        self.with_runtime(f)
    }
}

pub fn emit_scoped<H, T>(handle: &H, event: &'static str, value: T)
where
    H: LiveRuntimeHandle,
    T: serde::Serialize + Clone + Send + 'static,
{
    let emission = handle.with_runtime(|runtime| {
        let envelope = runtime.current_stream_envelope(Instant::now())?;
        Some((runtime.event_sink(), ScopedEvent { envelope, value }))
    });

    if let Some((sink, scoped)) = emission {
        sink.emit(event, &scoped);
    }
}

pub fn emit_unscoped<H, T>(handle: &H, event: &'static str, value: T)
where
    H: LiveRuntimeHandle,
    T: serde::Serialize + Clone + Send + 'static,
{
    let sink = handle.with_runtime(|runtime| runtime.event_sink());
    sink.emit(event, &value);
}

pub fn emit_session_state<H>(handle: &H, provenance: DomainProvenance)
where
    H: LiveRuntimeHandle,
{
    let snapshot = handle.with_runtime(|runtime| runtime.session_snapshot(provenance));
    emit_scoped(handle, event_names::SESSION_STATE, snapshot);
}

fn initialize_live_event_bridges<H>(handle: &H, vehicle: &Vehicle)
where
    H: LiveRuntimeHandle,
{
    handle.with_runtime(|runtime| runtime.seed_connected_vehicle(vehicle));
    emit_session_state(handle, DomainProvenance::Stream);
}

async fn telemetry_poll_bridge<H, I, F, Sleep>(handle: H, interval: I, vehicle: Vehicle, sleep: F)
where
    H: LiveRuntimeHandle,
    I: TelemetryIntervalProvider,
    F: Fn(Duration) -> Sleep + 'static,
    Sleep: Future<Output = ()> + 'static,
{
    loop {
        sleep(interval.telemetry_interval()).await;
        emit_telemetry_update(&handle, &vehicle);
    }
}

async fn observation_bridge<H, T, F>(
    handle: H,
    mut subscription: ObservationSubscription<T>,
    mut update: F,
) where
    H: LiveRuntimeHandle,
    T: Clone + Send + Sync + 'static,
    F: FnMut(&H, T) + 'static,
{
    while let Some(value) = subscription.recv().await {
        update(&handle, value);
    }
}

trait ObservationBridgeRegistrar {
    type Handle: LiveRuntimeHandle;

    fn spawn_observation<T, F>(&mut self, subscription: ObservationSubscription<T>, update: F)
    where
        T: Clone + Send + Sync + 'static,
        F: FnMut(&Self::Handle, T) + Send + 'static;
}

struct LocalObservationBridgeRegistrar<'a, H, S>
where
    H: LiveRuntimeHandle,
    S: LocalTaskSpawner,
{
    handle: H,
    spawner: &'a mut S,
}

impl<'a, H, S> LocalObservationBridgeRegistrar<'a, H, S>
where
    H: LiveRuntimeHandle,
    S: LocalTaskSpawner,
{
    fn new(handle: H, spawner: &'a mut S) -> Self {
        Self { handle, spawner }
    }
}

impl<H, S> ObservationBridgeRegistrar for LocalObservationBridgeRegistrar<'_, H, S>
where
    H: LiveRuntimeHandle,
    S: LocalTaskSpawner,
{
    type Handle = H;

    fn spawn_observation<T, F>(&mut self, subscription: ObservationSubscription<T>, update: F)
    where
        T: Clone + Send + Sync + 'static,
        F: FnMut(&Self::Handle, T) + Send + 'static,
    {
        self.spawner.spawn_local(observation_bridge(
            self.handle.clone(),
            subscription,
            update,
        ));
    }
}

struct SendObservationBridgeRegistrar<'a, H, S>
where
    H: LiveRuntimeHandle + Send + Sync,
    H::Sink: Send + Sync,
    S: SendTaskSpawner,
{
    handle: H,
    spawner: &'a mut S,
}

impl<'a, H, S> SendObservationBridgeRegistrar<'a, H, S>
where
    H: LiveRuntimeHandle + Send + Sync,
    H::Sink: Send + Sync,
    S: SendTaskSpawner,
{
    fn new(handle: H, spawner: &'a mut S) -> Self {
        Self { handle, spawner }
    }
}

impl<H, S> ObservationBridgeRegistrar for SendObservationBridgeRegistrar<'_, H, S>
where
    H: LiveRuntimeHandle + Send + Sync,
    H::Sink: Send + Sync,
    S: SendTaskSpawner,
{
    type Handle = H;

    fn spawn_observation<T, F>(&mut self, subscription: ObservationSubscription<T>, update: F)
    where
        T: Clone + Send + Sync + 'static,
        F: FnMut(&Self::Handle, T) + Send + 'static,
    {
        self.spawner.spawn_send(observation_bridge(
            self.handle.clone(),
            subscription,
            update,
        ));
    }
}

fn emit_telemetry_update<H>(handle: &H, vehicle: &Vehicle)
where
    H: LiveRuntimeHandle,
{
    let telemetry = telemetry_snapshot_from_vehicle(vehicle, DomainProvenance::Stream);
    handle.with_runtime(|runtime| runtime.update_live_telemetry(telemetry.clone()));
    emit_scoped(handle, event_names::TELEMETRY_STATE, telemetry);
}

fn emit_link_state_update<H>(handle: &H, link_state: &mavkit::LinkState)
where
    H: LiveRuntimeHandle,
{
    handle.with_runtime(|runtime| runtime.update_link_state(link_state));
    emit_session_state(handle, DomainProvenance::Stream);
}

fn emit_armed_update<H>(handle: &H, armed: bool)
where
    H: LiveRuntimeHandle,
{
    handle.with_runtime(|runtime| runtime.update_armed(armed));
    emit_session_state(handle, DomainProvenance::Stream);
}

fn emit_current_mode_update<H>(handle: &H, custom_mode: u32, mode_name: &str)
where
    H: LiveRuntimeHandle,
{
    handle.with_runtime(|runtime| runtime.update_current_mode(custom_mode, mode_name));
    emit_session_state(handle, DomainProvenance::Stream);
}

fn emit_home_position_update<H>(handle: &H, latitude_deg: f64, longitude_deg: f64, altitude_m: f64)
where
    H: LiveRuntimeHandle,
{
    handle.with_runtime(|runtime| {
        runtime.update_home_position(HomePosition {
            latitude_deg,
            longitude_deg,
            altitude_m,
        });
    });
    emit_session_state(handle, DomainProvenance::Stream);
}

fn emit_param_store_update<H>(handle: &H, store: &ParamStore)
where
    H: LiveRuntimeHandle,
{
    emit_scoped(handle, event_names::PARAM_STORE, store.clone());
    emit_scoped(
        handle,
        event_names::CONFIGURATION_FACTS_STATE,
        configuration_facts_snapshot_from_param_store(store, DomainProvenance::Stream),
    );
}

fn emit_sensor_health_update<H>(handle: &H, value: &SensorHealthSummary)
where
    H: LiveRuntimeHandle,
{
    emit_scoped(
        handle,
        event_names::SUPPORT_STATE,
        support_snapshot(DomainProvenance::Stream),
    );
    emit_scoped(
        handle,
        event_names::SENSOR_HEALTH_STATE,
        sensor_health_snapshot_from_summary(value, DomainProvenance::Stream),
    );
}

fn snapshot_after_mag_progress_update(
    sources: &mut CalibrationSources,
    value: Option<MagCalProgress>,
) -> CalibrationSnapshot {
    sources.update_mag_progress(value);
    sources.snapshot(DomainProvenance::Stream)
}

fn snapshot_after_mag_report_update(
    sources: &mut CalibrationSources,
    value: Option<MagCalReport>,
) -> CalibrationSnapshot {
    sources.update_mag_report(value);
    sources.snapshot(DomainProvenance::Stream)
}

trait CalibrationSourcesState: Clone + 'static {
    fn snapshot_after_progress(&self, value: Option<MagCalProgress>) -> CalibrationSnapshot;

    fn snapshot_after_report(&self, value: Option<MagCalReport>) -> CalibrationSnapshot;
}

#[derive(Clone)]
struct LocalCalibrationSources {
    inner: Rc<RefCell<CalibrationSources>>,
}

impl LocalCalibrationSources {
    fn new() -> Self {
        Self {
            inner: Rc::new(RefCell::new(CalibrationSources::default())),
        }
    }
}

impl CalibrationSourcesState for LocalCalibrationSources {
    fn snapshot_after_progress(&self, value: Option<MagCalProgress>) -> CalibrationSnapshot {
        let mut sources = self.inner.borrow_mut();
        snapshot_after_mag_progress_update(&mut sources, value)
    }

    fn snapshot_after_report(&self, value: Option<MagCalReport>) -> CalibrationSnapshot {
        let mut sources = self.inner.borrow_mut();
        snapshot_after_mag_report_update(&mut sources, value)
    }
}

#[derive(Clone)]
struct SendCalibrationSources {
    inner: Arc<Mutex<CalibrationSources>>,
}

impl SendCalibrationSources {
    fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(CalibrationSources::default())),
        }
    }
}

impl CalibrationSourcesState for SendCalibrationSources {
    fn snapshot_after_progress(&self, value: Option<MagCalProgress>) -> CalibrationSnapshot {
        let mut sources = self
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        snapshot_after_mag_progress_update(&mut sources, value)
    }

    fn snapshot_after_report(&self, value: Option<MagCalReport>) -> CalibrationSnapshot {
        let mut sources = self
            .inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        snapshot_after_mag_report_update(&mut sources, value)
    }
}

async fn mag_progress_bridge<H, C>(
    handle: H,
    calibration_sources: C,
    mut progress_sub: ObservationSubscription<Vec<MagCalProgress>>,
) where
    H: LiveRuntimeHandle,
    C: CalibrationSourcesState,
{
    while let Some(progress_list) = progress_sub.recv().await {
        let value = progress_list.first().cloned();
        let calibration = calibration_sources.snapshot_after_progress(value.clone());
        emit_mag_progress_update(&handle, value, calibration);
    }
}

async fn mag_report_bridge<H, C>(
    handle: H,
    calibration_sources: C,
    mut report_sub: ObservationSubscription<Vec<MagCalReport>>,
) where
    H: LiveRuntimeHandle,
    C: CalibrationSourcesState,
{
    while let Some(report_list) = report_sub.recv().await {
        let value = report_list.first().cloned();
        let calibration = calibration_sources.snapshot_after_report(value.clone());
        emit_mag_report_update(&handle, value, calibration);
    }
}

fn emit_mag_progress_update<H>(
    handle: &H,
    value: Option<MagCalProgress>,
    calibration: CalibrationSnapshot,
) where
    H: LiveRuntimeHandle,
{
    if let Some(value) = value {
        emit_unscoped(handle, event_names::COMPASS_CAL_PROGRESS, value);
    }
    emit_scoped(handle, event_names::CALIBRATION_STATE, calibration);
}

fn emit_mag_report_update<H>(
    handle: &H,
    value: Option<MagCalReport>,
    calibration: CalibrationSnapshot,
) where
    H: LiveRuntimeHandle,
{
    if let Some(value) = value {
        emit_unscoped(handle, event_names::COMPASS_CAL_REPORT, value);
    }
    emit_scoped(handle, event_names::CALIBRATION_STATE, calibration);
}

fn spawn_observation_event_bridges<R>(registrar: &mut R, vehicle: &Vehicle)
where
    R: ObservationBridgeRegistrar,
{
    registrar.spawn_observation(vehicle.link().state().subscribe(), |handle, link_state| {
        emit_link_state_update(handle, &link_state);
    });

    registrar.spawn_observation(vehicle.telemetry().armed().subscribe(), |handle, sample| {
        emit_armed_update(handle, sample.value);
    });

    registrar.spawn_observation(
        vehicle.available_modes().current().subscribe(),
        |handle, current_mode| {
            emit_current_mode_update(handle, current_mode.custom_mode, &current_mode.name);
        },
    );

    registrar.spawn_observation(vehicle.telemetry().home().subscribe(), |handle, sample| {
        let geo = sample.value;
        emit_home_position_update(
            handle,
            geo.latitude_deg,
            geo.longitude_deg,
            geo.altitude_msl_m,
        );
    });

    registrar.spawn_observation(vehicle.mission().subscribe(), |handle, mission_state| {
        emit_scoped(handle, event_names::MISSION_STATE, mission_state);
    });

    registrar.spawn_observation(vehicle.params().subscribe(), |handle, param_state| {
        if let Some(store) = param_state.store.as_ref() {
            emit_param_store_update(handle, store);
        }
    });

    registrar.spawn_observation(
        vehicle.telemetry().sensor_health().subscribe(),
        |handle, sample| {
            let value: SensorHealthSummary = sample.value;
            emit_sensor_health_update(handle, &value);
        },
    );

    registrar.spawn_observation(
        vehicle.telemetry().messages().status_text().subscribe(),
        |handle, sample| {
            let message = sample.value;
            let value = serde_json::json!({
                "text": message.text,
                "severity": mav_severity_name(message.severity),
                "id": message.id,
                "source_system": message.source_system,
                "source_component": message.source_component,
            });
            let snapshot = handle.with_runtime(|runtime| {
                runtime.push_status_text_from_value(&value, DomainProvenance::Stream)
            });
            if let Some(snapshot) = snapshot {
                emit_scoped(handle, event_names::STATUS_TEXT_STATE, snapshot);
            }
        },
    );
}

pub fn spawn_local_event_bridges<H, S, T, I>(
    handle: H,
    spawner: &mut S,
    timer: T,
    interval: I,
    vehicle: &Vehicle,
) where
    H: LiveRuntimeHandle,
    S: LocalTaskSpawner,
    T: LocalTimer,
    I: TelemetryIntervalProvider,
{
    initialize_live_event_bridges(&handle, vehicle);

    {
        let handle = handle.clone();
        let timer = timer.clone();
        let interval = interval.clone();
        let vehicle = vehicle.clone();
        spawner.spawn_local(telemetry_poll_bridge(
            handle,
            interval,
            vehicle,
            move |duration| timer.sleep(duration),
        ));
    }

    spawn_observation_event_bridges(
        &mut LocalObservationBridgeRegistrar::new(handle.clone(), spawner),
        vehicle,
    );
    spawn_local_calibration_bridges(handle, spawner, vehicle);
}

fn spawn_local_calibration_bridges<H, S>(handle: H, spawner: &mut S, vehicle: &Vehicle)
where
    H: LiveRuntimeHandle,
    S: LocalTaskSpawner,
{
    let calibration_sources = LocalCalibrationSources::new();

    spawner.spawn_local(mag_progress_bridge(
        handle.clone(),
        calibration_sources.clone(),
        vehicle.ardupilot().mag_cal_progress().subscribe(),
    ));
    spawner.spawn_local(mag_report_bridge(
        handle,
        calibration_sources,
        vehicle.ardupilot().mag_cal_report().subscribe(),
    ));
}

pub fn spawn_send_event_bridges<H, S, T, I>(
    handle: H,
    spawner: &mut S,
    timer: T,
    interval: I,
    vehicle: &Vehicle,
) where
    H: LiveRuntimeHandle + Send + Sync,
    H::Sink: Send + Sync,
    S: SendTaskSpawner,
    T: SendTimer,
    I: TelemetryIntervalProvider + Send + Sync,
{
    initialize_live_event_bridges(&handle, vehicle);

    {
        let handle = handle.clone();
        let timer = timer.clone();
        let interval = interval.clone();
        let vehicle = vehicle.clone();
        spawner.spawn_send(telemetry_poll_bridge(
            handle,
            interval,
            vehicle,
            move |duration| timer.sleep(duration),
        ));
    }

    spawn_observation_event_bridges(
        &mut SendObservationBridgeRegistrar::new(handle.clone(), spawner),
        vehicle,
    );

    spawn_send_calibration_bridges(handle, spawner, vehicle);
}

fn spawn_send_calibration_bridges<H, S>(handle: H, spawner: &mut S, vehicle: &Vehicle)
where
    H: LiveRuntimeHandle + Send + Sync,
    H::Sink: Send + Sync,
    S: SendTaskSpawner,
{
    let calibration_sources = SendCalibrationSources::new();

    spawner.spawn_send(mag_progress_bridge(
        handle.clone(),
        calibration_sources.clone(),
        vehicle.ardupilot().mag_cal_progress().subscribe(),
    ));
    spawner.spawn_send(mag_report_bridge(
        handle,
        calibration_sources,
        vehicle.ardupilot().mag_cal_report().subscribe(),
    ));
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ipc::telemetry::telemetry_snapshot_from_value;
    use crate::live_runtime::{EventSink, NoopEventSink};

    #[derive(Clone, Default)]
    struct RecordingEventSink {
        events: Rc<RefCell<Vec<(String, serde_json::Value)>>>,
    }

    impl RecordingEventSink {
        fn events(&self) -> Vec<(String, serde_json::Value)> {
            self.events.borrow().clone()
        }
    }

    impl EventSink for RecordingEventSink {
        fn emit<T>(&self, event: &'static str, payload: &T)
        where
            T: serde::Serialize + Clone + Send + 'static,
        {
            let value = serde_json::to_value(payload).expect("serialize recorded event");
            self.events.borrow_mut().push((event.to_string(), value));
        }
    }

    #[test]
    fn telemetry_cache_hydrates_live_snapshot() {
        let mut runtime = LiveVehicleRuntime::new(NoopEventSink);
        let envelope = runtime
            .session_runtime_mut()
            .open_session_snapshot(SourceKind::Live)
            .envelope;
        let telemetry = telemetry_snapshot_from_value(
            &serde_json::json!({
                "latitude_deg": 47.397742,
                "longitude_deg": 8.545594,
                "altitude_m": 515.5,
            }),
            DomainProvenance::Stream,
        );
        runtime.update_live_telemetry(telemetry);

        let snapshot = base_live_snapshot_from_caches(LiveSnapshotInput {
            envelope,
            session_context: runtime.session_context(),
            live_telemetry: runtime.live_telemetry(),
            status_text_entries: runtime.status_text_history(),
            connected: true,
            provenance: DomainProvenance::Stream,
        });

        assert_eq!(
            snapshot
                .telemetry
                .value
                .unwrap_or_default()
                .navigation
                .latitude_deg,
            Some(47.397742)
        );
    }

    #[test]
    fn disconnect_snapshot_is_disconnected_after_reset() {
        let mut runtime = LiveVehicleRuntime::new(NoopEventSink);
        runtime.session_context.connection = SessionConnection::Connected;
        runtime.reset_live_state();

        let snapshot = runtime.session_snapshot(DomainProvenance::Stream);

        assert_eq!(
            snapshot.value.expect("session").connection,
            SessionConnection::Disconnected
        );
    }

    #[test]
    fn disconnect_emits_disconnected_session_for_active_live_envelope() {
        let sink = RecordingEventSink::default();
        let handle = LocalLiveRuntime::new(LiveVehicleRuntime::new(sink.clone()));
        let live = handle.with_runtime(|runtime| {
            runtime
                .session_runtime_mut()
                .open_session_snapshot(SourceKind::Live)
        });
        handle.with_runtime(|runtime| {
            let _ = runtime.ack_session_snapshot(
                &live.envelope.session_id,
                live.envelope.seek_epoch,
                live.envelope.reset_revision,
            );
            runtime.session_context.connection = SessionConnection::Connected;
            runtime.reset_live_state();
        });

        emit_session_state(&handle, DomainProvenance::Stream);

        let events = sink.events();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].0, event_names::SESSION_STATE);
        assert_eq!(
            events[0].1["value"]["value"]["connection"]["kind"],
            "disconnected"
        );
    }
}
