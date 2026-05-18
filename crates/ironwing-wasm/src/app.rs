use std::cell::RefCell;
use std::rc::Rc;

use futures::channel::oneshot;
use ironwing_core::ipc::{AckSessionSnapshotResult, SourceKind};
use ironwing_core::runtime::SessionRuntime;
use wasm_bindgen::prelude::*;

use crate::bridge::WasmByteBridge;
use crate::error::WasmError;
use crate::event_sink::EventSink;
use crate::js_value::to_js;

struct RuntimeState {
    #[allow(dead_code)]
    event_sink: EventSink,
    session_runtime: SessionRuntime,
    vehicle: Option<mavkit::Vehicle>,
    bridge: Option<mavkit::byte_connection::ByteBridge>,
    connect_waiter: Option<oneshot::Receiver<Result<(), String>>>,
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
            state: Rc::new(RefCell::new(RuntimeState {
                event_sink: EventSink::new(event_sink),
                session_runtime: SessionRuntime::new(),
                vehicle: None,
                bridge: None,
                connect_waiter: None,
            })),
        }
    }

    #[wasm_bindgen(js_name = beginConnect)]
    pub fn begin_connect(&self) -> Result<WasmByteBridge, JsValue> {
        let (bridge, vehicle_future) = mavkit::Vehicle::from_byte_connection(
            mavkit::VehicleConfig::default(),
            mavkit::byte_connection::ByteConnectionConfig::default(),
        );
        let wasm_bridge = WasmByteBridge::new(bridge.clone());
        let (connect_tx, connect_rx) = oneshot::channel();

        {
            let mut state = self.state.borrow_mut();
            if let Some(existing_bridge) = state.bridge.take() {
                existing_bridge.close();
            }
            state.vehicle = None;
            state.bridge = Some(bridge);
            state.connect_waiter = Some(connect_rx);
        }

        let state = Rc::clone(&self.state);
        wasm_bindgen_futures::spawn_local(async move {
            let result = vehicle_future.await.map_err(|error| error.to_string());
            match result {
                Ok(vehicle) => {
                    state.borrow_mut().vehicle = Some(vehicle);
                    let _ = connect_tx.send(Ok(()));
                }
                Err(error) => {
                    let mut state = state.borrow_mut();
                    if let Some(bridge) = state.bridge.take() {
                        bridge.close();
                    }
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
            if let Some(bridge) = state.bridge.take() {
                bridge.close();
            }
            state.connect_waiter = None;
            state.vehicle.take()
        };

        if let Some(vehicle) = vehicle {
            vehicle
                .disconnect()
                .await
                .map_err(|error| JsValue::from_str(&error.to_string()))?;
        }

        Ok(())
    }

    #[wasm_bindgen(js_name = openSessionSnapshot)]
    pub fn open_session_snapshot(&self, source_kind: String) -> Result<JsValue, JsValue> {
        let source_kind = parse_source_kind(&source_kind)?;
        let snapshot = self
            .state
            .borrow_mut()
            .session_runtime
            .open_session_snapshot(source_kind);
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
