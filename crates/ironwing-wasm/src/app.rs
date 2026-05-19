use std::cell::{Cell, RefCell};
use std::rc::Rc;
use std::time::Duration;

use futures::channel::oneshot;
use ironwing_core::ipc::{AckSessionSnapshotResult, DomainProvenance, SourceKind};
use ironwing_core::live_runtime::commands as live_commands;
use ironwing_core::live_runtime::{
    self, LiveVehicleRuntime, LocalLiveRuntime, LocalTimer, TelemetryIntervalProvider,
};
use wasm_bindgen::prelude::*;

use crate::bridge::WasmByteBridge;
use crate::error::WasmError;
use crate::event_sink::EventSink;
use crate::js_value::to_js;
use crate::task::LocalTaskSet;

const DEFAULT_TELEMETRY_INTERVAL_MS: u32 = 200;

#[derive(Clone)]
struct WasmTimer;

impl LocalTimer for WasmTimer {
    type Sleep = std::pin::Pin<Box<dyn std::future::Future<Output = ()>>>;

    fn sleep(&self, duration: Duration) -> Self::Sleep {
        Box::pin(sleep_ms(
            duration.as_millis().try_into().unwrap_or(u32::MAX),
        ))
    }
}

#[derive(Clone)]
struct WasmTelemetryInterval {
    interval_ms: Rc<Cell<u32>>,
}

impl TelemetryIntervalProvider for WasmTelemetryInterval {
    fn telemetry_interval(&self) -> Duration {
        Duration::from_millis(u64::from(self.interval_ms.get()))
    }
}

struct RuntimeState {
    live_runtime: LocalLiveRuntime<EventSink>,
    bridge: Option<mavkit::byte_connection::ByteBridge>,
    connect_waiter: Option<oneshot::Receiver<Result<(), String>>>,
    tasks: LocalTaskSet,
    telemetry_interval_ms: Rc<Cell<u32>>,
}

impl RuntimeState {
    fn new(event_sink: EventSink) -> Self {
        Self {
            live_runtime: LocalLiveRuntime::new(LiveVehicleRuntime::new(event_sink)),
            bridge: None,
            connect_waiter: None,
            tasks: LocalTaskSet::new(),
            telemetry_interval_ms: Rc::new(Cell::new(DEFAULT_TELEMETRY_INTERVAL_MS)),
        }
    }

    fn reset_live_state(&mut self) {
        self.tasks.abort_all();
        if let Some(existing_bridge) = self.bridge.take() {
            existing_bridge.close();
        }
        self.connect_waiter = None;
        self.live_runtime
            .with_runtime(|runtime| runtime.reset_live_state());
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
            let previous_vehicle = state
                .live_runtime
                .with_runtime(|runtime| runtime.take_vehicle());
            state.reset_live_state();
            previous_vehicle
        };
        if let Some(vehicle) = previous_vehicle {
            wasm_bindgen_futures::spawn_local(async move {
                let _ = vehicle.disconnect().await;
            });
        }

        {
            let mut runtime_state = self.state.borrow_mut();
            runtime_state.bridge = Some(bridge);
            runtime_state.connect_waiter = Some(connect_rx);
            runtime_state
                .live_runtime
                .with_runtime(|runtime| runtime.prepare_connecting());
        }
        emit_session_state(&self.state, DomainProvenance::Stream);

        let state = Rc::clone(&self.state);
        wasm_bindgen_futures::spawn_local(async move {
            let result = vehicle_future.await.map_err(|error| error.to_string());
            match result {
                Ok(vehicle) => {
                    {
                        let mut runtime_state = state.borrow_mut();
                        let live_runtime = runtime_state.live_runtime.clone();
                        let telemetry_interval = WasmTelemetryInterval {
                            interval_ms: Rc::clone(&runtime_state.telemetry_interval_ms),
                        };
                        live_runtime::spawn_local_event_bridges(
                            live_runtime,
                            &mut runtime_state.tasks,
                            WasmTimer,
                            telemetry_interval,
                            &vehicle,
                        );
                    }
                    spawn_runtime_task(&state, request_telemetry_streams(vehicle));
                    let _ = connect_tx.send(Ok(()));
                }
                Err(error) => {
                    {
                        let mut state = state.borrow_mut();
                        if let Some(bridge) = state.bridge.take() {
                            bridge.close();
                        }
                        state
                            .live_runtime
                            .with_runtime(|runtime| runtime.set_connection_error(error.clone()));
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
        if self
            .state
            .borrow()
            .live_runtime
            .with_runtime(|runtime| runtime.is_connected())
        {
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
            let vehicle = state
                .live_runtime
                .with_runtime(|runtime| runtime.take_vehicle());
            state.reset_live_state();
            vehicle
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
        let modes = live_commands::get_available_modes(&vehicle);
        to_js(&modes)
    }

    #[wasm_bindgen(js_name = setFlightMode)]
    pub async fn set_flight_mode(&self, custom_mode: u32) -> Result<(), JsValue> {
        let vehicle = live_vehicle(&self.state)?;
        live_commands::set_flight_mode(&vehicle, custom_mode)
            .await
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = armVehicle)]
    pub async fn arm_vehicle(&self, force: bool) -> Result<(), JsValue> {
        let vehicle = live_vehicle(&self.state)?;
        live_commands::arm(&vehicle, force)
            .await
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = disarmVehicle)]
    pub async fn disarm_vehicle(&self, force: bool) -> Result<(), JsValue> {
        let vehicle = live_vehicle(&self.state)?;
        live_commands::disarm(&vehicle, force)
            .await
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = vehicleTakeoff)]
    pub async fn vehicle_takeoff(&self, altitude_m: f32) -> Result<(), JsValue> {
        let vehicle = live_vehicle(&self.state)?;
        live_commands::takeoff(&vehicle, altitude_m)
            .await
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = setMessageRate)]
    pub async fn set_message_rate(&self, message_id: u32, rate_hz: f32) -> Result<(), JsValue> {
        let vehicle = live_vehicle(&self.state)?;
        live_commands::set_message_rate(&vehicle, message_id, rate_hz)
            .await
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = setTelemetryRate)]
    pub fn set_telemetry_rate(&self, rate_hz: u32) -> Result<(), JsValue> {
        if rate_hz == 0 || rate_hz > 20 {
            return Err(WasmError::invalid_input("rate_hz must be between 1 and 20").into());
        }

        self.state
            .borrow()
            .telemetry_interval_ms
            .set(1000 / rate_hz);
        Ok(())
    }

    #[wasm_bindgen(js_name = openSessionSnapshot)]
    pub fn open_session_snapshot(&self, source_kind: String) -> Result<JsValue, JsValue> {
        let source_kind = parse_source_kind(&source_kind)?;
        let snapshot = self
            .state
            .borrow()
            .live_runtime
            .with_runtime(|runtime| runtime.open_session_snapshot(source_kind));
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
        let result: AckSessionSnapshotResult =
            self.state.borrow().live_runtime.with_runtime(|runtime| {
                runtime.ack_session_snapshot(&session_id, seek_epoch, reset_revision)
            });
        to_js(&result)
    }
}

fn live_vehicle(state: &Rc<RefCell<RuntimeState>>) -> Result<mavkit::Vehicle, JsValue> {
    state
        .borrow()
        .live_runtime
        .with_runtime(|runtime| runtime.vehicle())
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

fn spawn_runtime_task(
    state: &Rc<RefCell<RuntimeState>>,
    future: impl std::future::Future<Output = ()> + 'static,
) {
    state.borrow_mut().tasks.spawn(future);
}

fn emit_session_state(state: &Rc<RefCell<RuntimeState>>, provenance: DomainProvenance) {
    let live_runtime = state.borrow().live_runtime.clone();
    live_runtime::emit_session_state(&live_runtime, provenance);
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
        return Err(
            WasmError::invalid_input(format!("{field} must be a safe unsigned integer")).into(),
        );
    }

    Ok(value as u64)
}
