use std::cell::RefCell;
use std::rc::Rc;
use std::sync::{Arc, Mutex};

use mavkit::{HomePosition, SensorHealthSummary, Vehicle};
use web_time::Instant;

use crate::event_names;
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
    handle.with_runtime(|runtime| runtime.seed_connected_vehicle(vehicle));
    emit_session_state(&handle, DomainProvenance::Stream);

    {
        let handle = handle.clone();
        let timer = timer.clone();
        let interval = interval.clone();
        let vehicle = vehicle.clone();
        spawner.spawn_local(async move {
            loop {
                timer.sleep(interval.telemetry_interval()).await;
                let telemetry = telemetry_snapshot_from_vehicle(&vehicle, DomainProvenance::Stream);
                handle.with_runtime(|runtime| runtime.update_live_telemetry(telemetry.clone()));
                emit_scoped(&handle, event_names::TELEMETRY_STATE, telemetry);
            }
        });
    }

    {
        let handle = handle.clone();
        let mut link_sub = vehicle.link().state().subscribe();
        spawner.spawn_local(async move {
            while let Some(link_state) = link_sub.recv().await {
                handle.with_runtime(|runtime| runtime.update_link_state(&link_state));
                emit_session_state(&handle, DomainProvenance::Stream);
            }
        });
    }

    {
        let handle = handle.clone();
        let mut armed_sub = vehicle.telemetry().armed().subscribe();
        spawner.spawn_local(async move {
            while let Some(sample) = armed_sub.recv().await {
                handle.with_runtime(|runtime| runtime.update_armed(sample.value));
                emit_session_state(&handle, DomainProvenance::Stream);
            }
        });
    }

    {
        let handle = handle.clone();
        let mut mode_sub = vehicle.available_modes().current().subscribe();
        spawner.spawn_local(async move {
            while let Some(current_mode) = mode_sub.recv().await {
                handle.with_runtime(|runtime| {
                    runtime.update_current_mode(current_mode.custom_mode, &current_mode.name);
                });
                emit_session_state(&handle, DomainProvenance::Stream);
            }
        });
    }

    {
        let handle = handle.clone();
        let mut home_sub = vehicle.telemetry().home().subscribe();
        spawner.spawn_local(async move {
            while let Some(sample) = home_sub.recv().await {
                let geo = sample.value;
                handle.with_runtime(|runtime| {
                    runtime.update_home_position(HomePosition {
                        latitude_deg: geo.latitude_deg,
                        longitude_deg: geo.longitude_deg,
                        altitude_m: geo.altitude_msl_m,
                    });
                });
                emit_session_state(&handle, DomainProvenance::Stream);
            }
        });
    }

    spawn_local_domain_bridges(handle.clone(), spawner, vehicle);
    spawn_local_calibration_bridges(handle, spawner, vehicle);
}

fn spawn_local_domain_bridges<H, S>(handle: H, spawner: &mut S, vehicle: &Vehicle)
where
    H: LiveRuntimeHandle,
    S: LocalTaskSpawner,
{
    {
        let handle = handle.clone();
        let mut mission_sub = vehicle.mission().subscribe();
        spawner.spawn_local(async move {
            while let Some(mission_state) = mission_sub.recv().await {
                emit_scoped(&handle, event_names::MISSION_STATE, mission_state);
            }
        });
    }

    {
        let handle = handle.clone();
        let mut param_sub = vehicle.params().subscribe();
        spawner.spawn_local(async move {
            while let Some(param_state) = param_sub.recv().await {
                if let Some(store) = param_state.store.as_ref() {
                    emit_scoped(&handle, event_names::PARAM_STORE, store.clone());
                    emit_scoped(
                        &handle,
                        event_names::CONFIGURATION_FACTS_STATE,
                        configuration_facts_snapshot_from_param_store(
                            store,
                            DomainProvenance::Stream,
                        ),
                    );
                }
            }
        });
    }

    {
        let handle = handle.clone();
        let mut sensor_sub = vehicle.telemetry().sensor_health().subscribe();
        spawner.spawn_local(async move {
            while let Some(sample) = sensor_sub.recv().await {
                let value: SensorHealthSummary = sample.value;
                emit_scoped(
                    &handle,
                    event_names::SUPPORT_STATE,
                    support_snapshot(DomainProvenance::Stream),
                );
                emit_scoped(
                    &handle,
                    event_names::SENSOR_HEALTH_STATE,
                    sensor_health_snapshot_from_summary(&value, DomainProvenance::Stream),
                );
            }
        });
    }

    {
        let handle = handle.clone();
        let mut status_sub = vehicle.telemetry().messages().status_text().subscribe();
        spawner.spawn_local(async move {
            while let Some(sample) = status_sub.recv().await {
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
                    emit_scoped(&handle, event_names::STATUS_TEXT_STATE, snapshot);
                }
            }
        });
    }
}

fn spawn_local_calibration_bridges<H, S>(handle: H, spawner: &mut S, vehicle: &Vehicle)
where
    H: LiveRuntimeHandle,
    S: LocalTaskSpawner,
{
    let calibration_sources = Rc::new(RefCell::new(CalibrationSources::default()));

    {
        let handle = handle.clone();
        let calibration_sources = Rc::clone(&calibration_sources);
        let mut progress_sub = vehicle.ardupilot().mag_cal_progress().subscribe();
        spawner.spawn_local(async move {
            while let Some(progress_list) = progress_sub.recv().await {
                let value = progress_list.first().cloned();
                if let Some(value) = value.as_ref() {
                    emit_unscoped(&handle, event_names::COMPASS_CAL_PROGRESS, value.clone());
                }
                let calibration = {
                    let mut sources = calibration_sources.borrow_mut();
                    sources.update_mag_progress(value);
                    sources.snapshot(DomainProvenance::Stream)
                };
                emit_scoped(&handle, event_names::CALIBRATION_STATE, calibration);
            }
        });
    }

    {
        let handle = handle.clone();
        let calibration_sources = Rc::clone(&calibration_sources);
        let mut report_sub = vehicle.ardupilot().mag_cal_report().subscribe();
        spawner.spawn_local(async move {
            while let Some(report_list) = report_sub.recv().await {
                let value = report_list.first().cloned();
                if let Some(value) = value.as_ref() {
                    emit_unscoped(&handle, event_names::COMPASS_CAL_REPORT, value.clone());
                }
                let calibration = {
                    let mut sources = calibration_sources.borrow_mut();
                    sources.update_mag_report(value);
                    sources.snapshot(DomainProvenance::Stream)
                };
                emit_scoped(&handle, event_names::CALIBRATION_STATE, calibration);
            }
        });
    }
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
    handle.with_runtime(|runtime| runtime.seed_connected_vehicle(vehicle));
    emit_session_state(&handle, DomainProvenance::Stream);

    {
        let handle = handle.clone();
        let timer = timer.clone();
        let interval = interval.clone();
        let vehicle = vehicle.clone();
        spawner.spawn_send(async move {
            loop {
                timer.sleep(interval.telemetry_interval()).await;
                let telemetry = telemetry_snapshot_from_vehicle(&vehicle, DomainProvenance::Stream);
                handle.with_runtime(|runtime| runtime.update_live_telemetry(telemetry.clone()));
                emit_scoped(&handle, event_names::TELEMETRY_STATE, telemetry);
            }
        });
    }

    {
        let handle = handle.clone();
        let mut link_sub = vehicle.link().state().subscribe();
        spawner.spawn_send(async move {
            while let Some(link_state) = link_sub.recv().await {
                handle.with_runtime(|runtime| runtime.update_link_state(&link_state));
                emit_session_state(&handle, DomainProvenance::Stream);
            }
        });
    }

    {
        let handle = handle.clone();
        let mut armed_sub = vehicle.telemetry().armed().subscribe();
        spawner.spawn_send(async move {
            while let Some(sample) = armed_sub.recv().await {
                handle.with_runtime(|runtime| runtime.update_armed(sample.value));
                emit_session_state(&handle, DomainProvenance::Stream);
            }
        });
    }

    {
        let handle = handle.clone();
        let mut mode_sub = vehicle.available_modes().current().subscribe();
        spawner.spawn_send(async move {
            while let Some(current_mode) = mode_sub.recv().await {
                handle.with_runtime(|runtime| {
                    runtime.update_current_mode(current_mode.custom_mode, &current_mode.name);
                });
                emit_session_state(&handle, DomainProvenance::Stream);
            }
        });
    }

    {
        let handle = handle.clone();
        let mut home_sub = vehicle.telemetry().home().subscribe();
        spawner.spawn_send(async move {
            while let Some(sample) = home_sub.recv().await {
                let geo = sample.value;
                handle.with_runtime(|runtime| {
                    runtime.update_home_position(HomePosition {
                        latitude_deg: geo.latitude_deg,
                        longitude_deg: geo.longitude_deg,
                        altitude_m: geo.altitude_msl_m,
                    });
                });
                emit_session_state(&handle, DomainProvenance::Stream);
            }
        });
    }

    spawn_send_domain_bridges(handle, spawner, vehicle);
}

fn spawn_send_domain_bridges<H, S>(handle: H, spawner: &mut S, vehicle: &Vehicle)
where
    H: LiveRuntimeHandle + Send + Sync,
    H::Sink: Send + Sync,
    S: SendTaskSpawner,
{
    {
        let handle = handle.clone();
        let mut mission_sub = vehicle.mission().subscribe();
        spawner.spawn_send(async move {
            while let Some(mission_state) = mission_sub.recv().await {
                emit_scoped(&handle, event_names::MISSION_STATE, mission_state);
            }
        });
    }

    {
        let handle = handle.clone();
        let mut param_sub = vehicle.params().subscribe();
        spawner.spawn_send(async move {
            while let Some(param_state) = param_sub.recv().await {
                if let Some(store) = param_state.store.as_ref() {
                    emit_scoped(&handle, event_names::PARAM_STORE, store.clone());
                    emit_scoped(
                        &handle,
                        event_names::CONFIGURATION_FACTS_STATE,
                        configuration_facts_snapshot_from_param_store(
                            store,
                            DomainProvenance::Stream,
                        ),
                    );
                }
            }
        });
    }

    {
        let handle = handle.clone();
        let mut sensor_sub = vehicle.telemetry().sensor_health().subscribe();
        spawner.spawn_send(async move {
            while let Some(sample) = sensor_sub.recv().await {
                let value: SensorHealthSummary = sample.value;
                emit_scoped(
                    &handle,
                    event_names::SUPPORT_STATE,
                    support_snapshot(DomainProvenance::Stream),
                );
                emit_scoped(
                    &handle,
                    event_names::SENSOR_HEALTH_STATE,
                    sensor_health_snapshot_from_summary(&value, DomainProvenance::Stream),
                );
            }
        });
    }

    {
        let handle = handle.clone();
        let mut status_sub = vehicle.telemetry().messages().status_text().subscribe();
        spawner.spawn_send(async move {
            while let Some(sample) = status_sub.recv().await {
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
                    emit_scoped(&handle, event_names::STATUS_TEXT_STATE, snapshot);
                }
            }
        });
    }

    spawn_send_calibration_bridges(handle, spawner, vehicle);
}

fn spawn_send_calibration_bridges<H, S>(handle: H, spawner: &mut S, vehicle: &Vehicle)
where
    H: LiveRuntimeHandle + Send + Sync,
    H::Sink: Send + Sync,
    S: SendTaskSpawner,
{
    let calibration_sources = Arc::new(Mutex::new(CalibrationSources::default()));

    {
        let handle = handle.clone();
        let calibration_sources = Arc::clone(&calibration_sources);
        let mut progress_sub = vehicle.ardupilot().mag_cal_progress().subscribe();
        spawner.spawn_send(async move {
            while let Some(progress_list) = progress_sub.recv().await {
                let value = progress_list.first().cloned();
                if let Some(value) = value.as_ref() {
                    emit_unscoped(&handle, event_names::COMPASS_CAL_PROGRESS, value.clone());
                }
                let calibration = {
                    let mut sources = calibration_sources
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner());
                    sources.update_mag_progress(value);
                    sources.snapshot(DomainProvenance::Stream)
                };
                emit_scoped(&handle, event_names::CALIBRATION_STATE, calibration);
            }
        });
    }

    {
        let handle = handle.clone();
        let calibration_sources = Arc::clone(&calibration_sources);
        let mut report_sub = vehicle.ardupilot().mag_cal_report().subscribe();
        spawner.spawn_send(async move {
            while let Some(report_list) = report_sub.recv().await {
                let value = report_list.first().cloned();
                if let Some(value) = value.as_ref() {
                    emit_unscoped(&handle, event_names::COMPASS_CAL_REPORT, value.clone());
                }
                let calibration = {
                    let mut sources = calibration_sources
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner());
                    sources.update_mag_report(value);
                    sources.snapshot(DomainProvenance::Stream)
                };
                emit_scoped(&handle, event_names::CALIBRATION_STATE, calibration);
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ipc::telemetry::{TelemetryState, telemetry_snapshot_from_value};
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
                .unwrap_or_else(TelemetryState::default)
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
