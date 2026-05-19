use std::cell::RefCell;
use std::rc::Rc;
use std::time::Duration;

use futures::channel::oneshot;
use ironwing_core::event_names;
use ironwing_core::ipc::{
    AckSessionSnapshotResult, DomainProvenance, DomainValue, ScopedEvent, SessionConnection,
    SessionSnapshot, SourceKind, StatusTextEntry, TelemetrySnapshot,
    push_status_text_entry, sensor_health_snapshot_from_summary, session_connection_from_link_state,
    status_text_entry_from_value, status_text_snapshot_from_entries, support_snapshot,
};
use ironwing_core::live::{
    LiveSnapshotInput, SessionContext, base_live_snapshot_from_caches,
    session_snapshot_from_context,
};
use ironwing_core::runtime::SessionRuntime;
use ironwing_core::vehicle_snapshot::{
    mav_severity_name, seeded_vehicle_state, telemetry_snapshot_from_vehicle,
};
use mavkit::SensorHealthSummary;
use wasm_bindgen::prelude::*;
use web_time::Instant;

use crate::bridge::WasmByteBridge;
use crate::error::WasmError;
use crate::event_sink::EventSink;
use crate::js_value::to_js;
use crate::task::LocalTaskSet;

const TELEMETRY_INTERVAL_MS: u32 = 200;

struct RuntimeState {
    event_sink: EventSink,
    session_runtime: SessionRuntime,
    session_context: SessionContext,
    live_telemetry: TelemetrySnapshot,
    status_text_history: Vec<StatusTextEntry>,
    next_status_text_sequence: u64,
    vehicle: Option<mavkit::Vehicle>,
    bridge: Option<mavkit::byte_connection::ByteBridge>,
    connect_waiter: Option<oneshot::Receiver<Result<(), String>>>,
    tasks: LocalTaskSet,
}

impl RuntimeState {
    fn new(event_sink: EventSink) -> Self {
        Self {
            event_sink,
            session_runtime: SessionRuntime::new(),
            session_context: SessionContext::new(),
            live_telemetry: TelemetrySnapshot::missing(DomainProvenance::Bootstrap),
            status_text_history: Vec::new(),
            next_status_text_sequence: 1,
            vehicle: None,
            bridge: None,
            connect_waiter: None,
            tasks: LocalTaskSet::new(),
        }
    }

    fn reset_live_state(&mut self) {
        self.tasks.abort_all();
        if let Some(existing_bridge) = self.bridge.take() {
            existing_bridge.close();
        }
        self.connect_waiter = None;
        self.session_context.reset();
        self.live_telemetry = TelemetrySnapshot::missing(DomainProvenance::Bootstrap);
        self.status_text_history.clear();
        self.next_status_text_sequence = 1;
    }
}

#[wasm_bindgen]
pub struct IronwingWasmRuntime {
    state: Rc<RefCell<RuntimeState>>,
}

#[wasm_bindgen]
impl IronwingWasmRuntime {
    #[wasm_bindgen(constructor)]
    pub fn new(event_sink: js_sys::Function) -> Self {
        Self {
            state: Rc::new(RefCell::new(RuntimeState::new(EventSink::new(event_sink)))),
        }
    }

    #[wasm_bindgen(js_name = beginConnect)]
    pub fn begin_connect(&self) -> Result<WasmByteBridge, JsValue> {
        let (bridge, vehicle_future) = mavkit::Vehicle::from_byte_connection(
            wasm_vehicle_config(),
            mavkit::byte_connection::ByteConnectionConfig::default(),
        );
        let wasm_bridge = WasmByteBridge::new(bridge.clone());
        let (connect_tx, connect_rx) = oneshot::channel();

        let previous_vehicle = {
            let mut state = self.state.borrow_mut();
            state.reset_live_state();
            state.vehicle.take()
        };
        if let Some(vehicle) = previous_vehicle {
            wasm_bindgen_futures::spawn_local(async move {
                let _ = vehicle.disconnect().await;
            });
        }

        {
            let mut state = self.state.borrow_mut();
            state.bridge = Some(bridge);
            state.connect_waiter = Some(connect_rx);
            state.session_context.connection = SessionConnection::Connecting;
        }
        emit_session_state(&self.state, DomainProvenance::Stream);

        let state = Rc::clone(&self.state);
        wasm_bindgen_futures::spawn_local(async move {
            let result = vehicle_future.await.map_err(|error| error.to_string());
            match result {
                Ok(vehicle) => {
                    {
                        let mut state = state.borrow_mut();
                        state.session_context.vehicle_state = Some(seeded_vehicle_state(&vehicle));
                        state.session_context.connection = SessionConnection::Connected;
                        state.vehicle = Some(vehicle.clone());
                    }
                    spawn_event_bridges(&state, &vehicle);
                    emit_session_state(&state, DomainProvenance::Stream);
                    spawn_runtime_task(&state, request_telemetry_streams(vehicle));
                    let _ = connect_tx.send(Ok(()));
                }
                Err(error) => {
                    {
                        let mut state = state.borrow_mut();
                        if let Some(bridge) = state.bridge.take() {
                            bridge.close();
                        }
                        state.session_context.connection = SessionConnection::Error {
                            error: error.clone(),
                        };
                    }
                    emit_session_state(&state, DomainProvenance::Stream);
                    let _ = connect_tx.send(Err(error));
                }
            }
        });

        Ok(wasm_bridge)
    }

    #[wasm_bindgen(js_name = waitConnect)]
    pub async fn wait_connect(&self) -> Result<(), JsValue> {
        if self.state.borrow().vehicle.is_some() {
            return Ok(());
        }

        let waiter = self
            .state
            .borrow_mut()
            .connect_waiter
            .take()
            .ok_or_else(|| JsValue::from_str("no pending wasm connection"))?;

        match waiter.await {
            Ok(Ok(())) => Ok(()),
            Ok(Err(error)) => Err(JsValue::from_str(&error)),
            Err(_) => Err(JsValue::from_str("wasm connection task dropped")),
        }
    }

    #[wasm_bindgen(js_name = disconnectLink)]
    pub async fn disconnect_link(&self) -> Result<(), JsValue> {
        let vehicle = {
            let mut state = self.state.borrow_mut();
            state.reset_live_state();
            state.vehicle.take()
        };

        if let Some(vehicle) = vehicle {
            vehicle
                .disconnect()
                .await
                .map_err(|error| JsValue::from_str(&error.to_string()))?;
        }

        emit_session_state(&self.state, DomainProvenance::Stream);

        Ok(())
    }

    #[wasm_bindgen(js_name = getAvailableModes)]
    pub fn get_available_modes(&self) -> Result<JsValue, JsValue> {
        let vehicle = live_vehicle(&self.state)?;
        let modes: Vec<mavkit::FlightMode> = vehicle.available_modes().iter().collect();
        to_js(&modes)
    }

    #[wasm_bindgen(js_name = setFlightMode)]
    pub async fn set_flight_mode(&self, custom_mode: u32) -> Result<(), JsValue> {
        live_vehicle(&self.state)?
            .set_mode_no_wait(custom_mode)
            .await
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = armVehicle)]
    pub async fn arm_vehicle(&self, force: bool) -> Result<(), JsValue> {
        let vehicle = live_vehicle(&self.state)?;
        let result = if force {
            vehicle.force_arm().await
        } else {
            vehicle.arm().await
        };
        result.map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = disarmVehicle)]
    pub async fn disarm_vehicle(&self, force: bool) -> Result<(), JsValue> {
        let vehicle = live_vehicle(&self.state)?;
        let result = if force {
            vehicle.force_disarm().await
        } else {
            vehicle.disarm().await
        };
        result.map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = vehicleTakeoff)]
    pub async fn vehicle_takeoff(&self, altitude_m: f32) -> Result<(), JsValue> {
        live_vehicle(&self.state)?
            .raw()
            .command_long(
                mavkit::dialect::MavCmd::MAV_CMD_NAV_TAKEOFF as u16,
                [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, altitude_m],
            )
            .await
            .map(|_| ())
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = setMessageRate)]
    pub async fn set_message_rate(&self, message_id: u32, rate_hz: f32) -> Result<(), JsValue> {
        if !(0.1..=50.0).contains(&rate_hz) {
            return Err(WasmError::invalid_input("rate_hz must be between 0.1 and 50.0").into());
        }
        let interval_usec = (1_000_000.0 / rate_hz) as i32;
        live_vehicle(&self.state)?
            .raw()
            .set_message_interval(message_id, interval_usec)
            .await
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = openSessionSnapshot)]
    pub fn open_session_snapshot(&self, source_kind: String) -> Result<JsValue, JsValue> {
        let source_kind = parse_source_kind(&source_kind)?;
        let snapshot = {
            let mut state = self.state.borrow_mut();
            let snapshot = state.session_runtime.open_session_snapshot(source_kind);
            if source_kind == SourceKind::Live {
                base_live_snapshot_from_caches(LiveSnapshotInput {
                    envelope: snapshot.envelope,
                    session_context: &state.session_context,
                    live_telemetry: &state.live_telemetry,
                    status_text_entries: &state.status_text_history,
                    connected: state.vehicle.is_some(),
                    provenance: DomainProvenance::Bootstrap,
                })
            } else {
                snapshot
            }
        };
        to_js(&snapshot)
    }

    #[wasm_bindgen(js_name = ackSessionSnapshot)]
    pub fn ack_session_snapshot(
        &self,
        session_id: String,
        seek_epoch: f64,
        reset_revision: f64,
    ) -> Result<JsValue, JsValue> {
        let seek_epoch = safe_u64(seek_epoch, "seekEpoch")?;
        let reset_revision = safe_u64(reset_revision, "resetRevision")?;
        let result: AckSessionSnapshotResult = self
            .state
            .borrow_mut()
            .session_runtime
            .ack_session_snapshot(&session_id, seek_epoch, reset_revision);
        to_js(&result)
    }
}

fn live_vehicle(state: &Rc<RefCell<RuntimeState>>) -> Result<mavkit::Vehicle, JsValue> {
    state
        .borrow()
        .vehicle
        .clone()
        .ok_or_else(|| WasmError::invalid_input("live vehicle is not connected").into())
}

fn wasm_vehicle_config() -> mavkit::VehicleConfig {
    let mut init_policy = mavkit::InitPolicyConfig::default();
    init_policy.autopilot_version.enabled = false;
    init_policy.available_modes.enabled = false;
    init_policy.home.enabled = false;
    init_policy.origin.enabled = false;

    mavkit::VehicleConfig {
        connect_timeout: Duration::from_secs(20),
        command_timeout: Duration::from_secs(10),
        command_completion_timeout: Duration::from_secs(20),
        init_policy,
        auto_request_home: false,
        ..mavkit::VehicleConfig::default()
    }
}

fn spawn_runtime_task(state: &Rc<RefCell<RuntimeState>>, future: impl std::future::Future<Output = ()> + 'static) {
    state.borrow_mut().tasks.spawn(future);
}

fn emit_scoped<T>(state: &Rc<RefCell<RuntimeState>>, event: &str, value: T)
where
    T: serde::Serialize + Clone,
{
    let scoped = {
        let mut state = state.borrow_mut();
        state
            .session_runtime
            .current_stream_envelope(Instant::now())
            .map(|envelope| ScopedEvent { envelope, value })
    };

    let Some(scoped) = scoped else {
        return;
    };
    let event_sink = state.borrow().event_sink.clone();
    let _ = event_sink.emit(event, &scoped);
}

fn emit_session_state(state: &Rc<RefCell<RuntimeState>>, provenance: DomainProvenance) {
    let snapshot: DomainValue<SessionSnapshot> = {
        let state = state.borrow();
        session_snapshot_from_context(
            &state.session_context,
            state.vehicle.is_some(),
            provenance,
        )
    };
    emit_scoped(state, event_names::SESSION_STATE, snapshot);
}

fn spawn_event_bridges(state: &Rc<RefCell<RuntimeState>>, vehicle: &mavkit::Vehicle) {
    {
        let state = Rc::clone(state);
        let vehicle = vehicle.clone();
        spawn_runtime_task(&state.clone(), async move {
            loop {
                sleep_ms(TELEMETRY_INTERVAL_MS).await;
                let snapshot = telemetry_snapshot_from_vehicle(&vehicle, DomainProvenance::Stream);
                state.borrow_mut().live_telemetry = snapshot.clone();
                emit_scoped(&state, event_names::TELEMETRY_STATE, snapshot);
            }
        });
    }

    {
        let state = Rc::clone(state);
        let mut link_sub = vehicle.link().state().subscribe();
        spawn_runtime_task(&state.clone(), async move {
            while let Some(link_state) = link_sub.recv().await {
                state.borrow_mut().session_context.connection = session_connection_from_link_state(&link_state);
                emit_session_state(&state, DomainProvenance::Stream);
            }
        });
    }

    {
        let state = Rc::clone(state);
        let armed_metric = vehicle.telemetry().armed();
        let mut armed_sub = armed_metric.subscribe();
        spawn_runtime_task(&state.clone(), async move {
            while let Some(sample) = armed_sub.recv().await {
                if let Some(vehicle_state) = state.borrow_mut().session_context.vehicle_state.as_mut() {
                    vehicle_state.armed = sample.value;
                }
                emit_session_state(&state, DomainProvenance::Stream);
            }
        });
    }

    {
        let state = Rc::clone(state);
        let mode_obs = vehicle.available_modes().current();
        let mut mode_sub = mode_obs.subscribe();
        spawn_runtime_task(&state.clone(), async move {
            while let Some(current_mode) = mode_sub.recv().await {
                if let Some(vehicle_state) = state.borrow_mut().session_context.vehicle_state.as_mut() {
                    vehicle_state.custom_mode = current_mode.custom_mode;
                    vehicle_state.mode_name = current_mode.name.clone();
                }
                emit_session_state(&state, DomainProvenance::Stream);
            }
        });
    }

    {
        let state = Rc::clone(state);
        let home_metric = vehicle.telemetry().home();
        let mut home_sub = home_metric.subscribe();
        spawn_runtime_task(&state.clone(), async move {
            while let Some(sample) = home_sub.recv().await {
                let geo = sample.value;
                state.borrow_mut().session_context.home_position = Some(mavkit::HomePosition {
                    latitude_deg: geo.latitude_deg,
                    longitude_deg: geo.longitude_deg,
                    altitude_m: geo.altitude_msl_m,
                });
                emit_session_state(&state, DomainProvenance::Stream);
            }
        });
    }

    {
        let state = Rc::clone(state);
        let sensor_health_metric = vehicle.telemetry().sensor_health();
        let mut sensor_sub = sensor_health_metric.subscribe();
        spawn_runtime_task(&state.clone(), async move {
            while let Some(sample) = sensor_sub.recv().await {
                let value: SensorHealthSummary = sample.value;
                emit_scoped(
                    &state,
                    event_names::SUPPORT_STATE,
                    support_snapshot(DomainProvenance::Stream),
                );
                emit_scoped(
                    &state,
                    event_names::SENSOR_HEALTH_STATE,
                    sensor_health_snapshot_from_summary(&value, DomainProvenance::Stream),
                );
            }
        });
    }

    {
        let state = Rc::clone(state);
        let status_text_handle = vehicle.telemetry().messages().status_text();
        let mut status_sub = status_text_handle.subscribe();
        spawn_runtime_task(&state.clone(), async move {
            while let Some(sample) = status_sub.recv().await {
                let message = sample.value;
                let message_json = serde_json::json!({
                    "text": message.text,
                    "severity": mav_severity_name(message.severity),
                    "id": message.id,
                    "source_system": message.source_system,
                    "source_component": message.source_component,
                });
                if let Some(mut entry) = status_text_entry_from_value(&message_json) {
                    {
                        let mut state = state.borrow_mut();
                        entry.sequence = state.next_status_text_sequence;
                        state.next_status_text_sequence = state.next_status_text_sequence.saturating_add(1);
                        push_status_text_entry(&mut state.status_text_history, entry);
                    }
                    let snapshot = {
                        let state = state.borrow();
                        status_text_snapshot_from_entries(
                            state.status_text_history.clone(),
                            DomainProvenance::Stream,
                        )
                    };
                    emit_scoped(&state, event_names::STATUS_TEXT_STATE, snapshot);
                }
            }
        });
    }
}

async fn request_telemetry_streams(vehicle: mavkit::Vehicle) {
    let interval_requests = [
        (33_u32, 200_000_i32),
        (30_u32, 200_000_i32),
        (24_u32, 500_000_i32),
        (1_u32, 1_000_000_i32),
    ];

    for (message_id, interval_usec) in interval_requests {
        let _ = vehicle
            .raw()
            .set_message_interval(message_id, interval_usec)
            .await;
    }
}

async fn sleep_ms(milliseconds: u32) {
    #[cfg(target_arch = "wasm32")]
    gloo_timers::future::TimeoutFuture::new(milliseconds).await;

    #[cfg(not(target_arch = "wasm32"))]
    std::thread::sleep(Duration::from_millis(u64::from(milliseconds)));
}

fn parse_source_kind(value: &str) -> Result<SourceKind, JsValue> {
    match value {
        "live" => Ok(SourceKind::Live),
        "playback" => Ok(SourceKind::Playback),
        _ => Err(WasmError::invalid_input(format!("unknown source kind: {value}")).into()),
    }
}

fn safe_u64(value: f64, field: &str) -> Result<u64, JsValue> {
    if !value.is_finite() || value < 0.0 || value.fract() != 0.0 || value > u64::MAX as f64 {
        return Err(WasmError::invalid_input(format!("{field} must be a safe unsigned integer")).into());
    }

    Ok(value as u64)
}
