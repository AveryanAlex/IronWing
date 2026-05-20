use std::cell::{Cell, RefCell};
use std::rc::Rc;
use std::time::Duration;

use futures::channel::oneshot;
use futures::future::{AbortHandle, Abortable};
use ironwing_core::event_names;
use ironwing_core::ipc::{
    AckSessionSnapshotResult, DomainProvenance, GuidedCommandResult, GuidedFailure,
    GuidedFatalityScope, GuidedLiveContext, GuidedRuntime, MissionDownload, OperationFailure,
    OperationId, RcOverrideChannelWire, Reason, ReasonKind, SourceKind, StartGuidedSessionRequest,
    UpdateGuidedSessionRequest, operation_failure_json,
};
use ironwing_core::live_runtime::commands as live_commands;
use ironwing_core::live_runtime::{
    self, LiveVehicleRuntime, LocalLiveRuntime, LocalTimer, TelemetryIntervalProvider,
};
use ironwing_core::telemetry;
use mavkit::{FencePlan, MissionPlan, ParamStore, RallyPlan};
use wasm_bindgen::prelude::*;

use crate::bridge::WasmByteBridge;
use crate::error::WasmError;
use crate::event_sink::EventSink;
use crate::js_value::{from_js, to_js};
use crate::task::LocalTaskSet;

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
    guided_runtime: GuidedRuntime,
    bridge: Option<mavkit::byte_connection::ByteBridge>,
    connect_waiter: Option<oneshot::Receiver<Result<(), String>>>,
    next_operation_token: u64,
    mission_op_abort: Option<(u64, AbortHandle)>,
    param_download_abort: Option<(u64, AbortHandle)>,
    tasks: LocalTaskSet,
    telemetry_interval_ms: Rc<Cell<u32>>,
}

impl RuntimeState {
    fn new(event_sink: EventSink) -> Self {
        Self {
            live_runtime: LocalLiveRuntime::new(LiveVehicleRuntime::new(event_sink)),
            guided_runtime: GuidedRuntime::default(),
            bridge: None,
            connect_waiter: None,
            next_operation_token: 1,
            mission_op_abort: None,
            param_download_abort: None,
            tasks: LocalTaskSet::new(),
            telemetry_interval_ms: Rc::new(Cell::new(
                telemetry::DEFAULT_TELEMETRY_INTERVAL_MS
                    .try_into()
                    .unwrap_or(u32::MAX),
            )),
        }
    }

    fn reset_live_state(&mut self) {
        self.tasks.abort_all();
        if let Some(existing_bridge) = self.bridge.take() {
            existing_bridge.close();
        }
        self.connect_waiter = None;
        if let Some((_, abort)) = self.mission_op_abort.take() {
            abort.abort();
        }
        if let Some((_, abort)) = self.param_download_abort.take() {
            abort.abort();
        }
        self.guided_runtime.terminate(
            DomainProvenance::Stream,
            ironwing_core::ipc::GuidedTerminationReason::Disconnect,
            "live vehicle disconnected",
            GuidedLiveContext::unavailable(),
        );
        self.live_runtime
            .with_runtime(|runtime| runtime.reset_live_state());
    }

    fn next_operation_token(&mut self) -> u64 {
        let token = self.next_operation_token;
        self.next_operation_token = self.next_operation_token.saturating_add(1);
        token
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
        let vehicle = live_vehicle_for_write(&self.state, OperationId::SetFlightMode)?;
        live_commands::set_flight_mode(&vehicle, custom_mode)
            .await
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = armVehicle)]
    pub async fn arm_vehicle(&self, force: bool) -> Result<(), JsValue> {
        let vehicle = live_vehicle_for_write(&self.state, OperationId::ArmVehicle)?;
        live_commands::arm(&vehicle, force)
            .await
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = disarmVehicle)]
    pub async fn disarm_vehicle(&self, force: bool) -> Result<(), JsValue> {
        let vehicle = live_vehicle_for_write(&self.state, OperationId::DisarmVehicle)?;
        live_commands::disarm(&vehicle, force)
            .await
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = vehicleTakeoff)]
    pub async fn vehicle_takeoff(&self, altitude_m: f32) -> Result<(), JsValue> {
        let vehicle = live_vehicle_for_write(&self.state, OperationId::VehicleTakeoff)?;
        live_commands::takeoff(&vehicle, altitude_m)
            .await
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = setMessageRate)]
    pub async fn set_message_rate(&self, message_id: u32, rate_hz: f32) -> Result<(), JsValue> {
        let vehicle = live_vehicle_for_write(&self.state, OperationId::SetMessageRate)?;
        live_commands::set_message_rate(&vehicle, message_id, rate_hz)
            .await
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = setTelemetryRate)]
    pub fn set_telemetry_rate(&self, rate_hz: u32) -> Result<(), JsValue> {
        let interval_ms =
            telemetry::telemetry_interval_ms_for_rate(rate_hz).map_err(WasmError::invalid_input)?;

        self.state
            .borrow()
            .telemetry_interval_ms
            .set(interval_ms.try_into().unwrap_or(u32::MAX));
        Ok(())
    }

    #[wasm_bindgen(js_name = paramDownloadAll)]
    pub fn param_download_all(&self) -> Result<(), JsValue> {
        let vehicle = live_vehicle_for_write(&self.state, OperationId::ParamDownloadAll)?;
        if self.state.borrow().param_download_abort.is_some() {
            return Err(WasmError::invalid_input("parameter download already in progress").into());
        }

        let handle = vehicle
            .params()
            .download_all()
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        let mut progress_sub = handle.subscribe();
        let live_runtime = self.state.borrow().live_runtime.clone();
        spawn_runtime_task(&self.state, async move {
            while let Some(progress) = progress_sub.recv().await {
                live_runtime::emit_scoped(&live_runtime, event_names::PARAM_PROGRESS, progress);
            }
        });

        let (abort_handle, registration) = AbortHandle::new_pair();
        let token = {
            let mut state = self.state.borrow_mut();
            let token = state.next_operation_token();
            state.param_download_abort = Some((token, abort_handle));
            token
        };
        let state = Rc::clone(&self.state);
        wasm_bindgen_futures::spawn_local(async move {
            let _ = Abortable::new(
                async move {
                    let _ = handle.wait().await;
                },
                registration,
            )
            .await;
            clear_param_download_operation(&state, token);
        });

        Ok(())
    }

    #[wasm_bindgen(js_name = paramWrite)]
    pub async fn param_write(&self, name: String, value: f32) -> Result<JsValue, JsValue> {
        let vehicle = live_vehicle_for_write(&self.state, OperationId::ParamWrite)?;
        let result = live_commands::param_write(&vehicle, &name, value)
            .await
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        to_js(&result)
    }

    #[wasm_bindgen(js_name = paramWriteBatch)]
    pub async fn param_write_batch(&self, params: JsValue) -> Result<JsValue, JsValue> {
        let params: Vec<(String, f32)> = from_js(params)?;
        let vehicle = live_vehicle_for_write(&self.state, OperationId::ParamWriteBatch)?;
        let handle = vehicle
            .params()
            .write_batch(params)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;

        let mut progress_sub = handle.subscribe();
        let live_runtime = self.state.borrow().live_runtime.clone();
        spawn_runtime_task(&self.state, async move {
            while let Some(progress) = progress_sub.recv().await {
                live_runtime::emit_scoped(&live_runtime, event_names::PARAM_PROGRESS, progress);
            }
        });

        let result = handle
            .wait()
            .await
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        to_js(&result)
    }

    #[wasm_bindgen(js_name = paramCancel)]
    pub fn param_cancel(&self) -> Result<(), JsValue> {
        if let Some((_, abort)) = self.state.borrow_mut().param_download_abort.take() {
            abort.abort();
        }
        Ok(())
    }

    #[wasm_bindgen(js_name = paramParseFile)]
    pub fn param_parse_file(&self, contents: String) -> Result<JsValue, JsValue> {
        let params = live_commands::param_parse_file(&contents)
            .map_err(|error| JsValue::from_str(&error.to_string()))?;
        to_js(&params)
    }

    #[wasm_bindgen(js_name = paramFormatFile)]
    pub fn param_format_file(&self, store: JsValue) -> Result<String, JsValue> {
        let store: ParamStore = from_js(store)?;
        Ok(live_commands::param_format_file(&store))
    }

    #[wasm_bindgen(js_name = missionValidate)]
    pub fn mission_validate(&self, plan: JsValue) -> Result<JsValue, JsValue> {
        let plan: MissionPlan = from_js(plan)?;
        to_js(&live_commands::mission_validate(&plan))
    }

    #[wasm_bindgen(js_name = missionUpload)]
    pub async fn mission_upload(&self, plan: JsValue) -> Result<(), JsValue> {
        let plan: MissionPlan = from_js(plan)?;
        let vehicle = live_vehicle_for_write(&self.state, OperationId::MissionUpload)?;
        run_cancellable_mission(&self.state, async move {
            live_commands::mission_upload(&vehicle, plan)
                .await
                .map_err(|error| error.to_string())
        })
        .await
    }

    #[wasm_bindgen(js_name = missionDownload)]
    pub async fn mission_download(&self) -> Result<JsValue, JsValue> {
        let vehicle = live_vehicle_for_write(&self.state, OperationId::MissionDownload)?;
        let result: MissionDownload = run_cancellable_mission(&self.state, async move {
            live_commands::mission_download(&vehicle)
                .await
                .map_err(|error| error.to_string())
        })
        .await?;
        to_js(&result)
    }

    #[wasm_bindgen(js_name = missionClear)]
    pub async fn mission_clear(&self) -> Result<(), JsValue> {
        let vehicle = live_vehicle_for_write(&self.state, OperationId::MissionClear)?;
        run_cancellable_mission(&self.state, async move {
            live_commands::mission_clear(&vehicle)
                .await
                .map_err(|error| error.to_string())
        })
        .await
    }

    #[wasm_bindgen(js_name = missionSetCurrent)]
    pub async fn mission_set_current(&self, seq: u16) -> Result<(), JsValue> {
        let vehicle = live_vehicle_for_write(&self.state, OperationId::MissionSetCurrent)?;
        live_commands::mission_set_current(&vehicle, seq)
            .await
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = missionCancel)]
    pub fn mission_cancel(&self) -> Result<(), JsValue> {
        if let Some((_, abort)) = self.state.borrow_mut().mission_op_abort.take() {
            abort.abort();
        }
        Ok(())
    }

    #[wasm_bindgen(js_name = fenceUpload)]
    pub async fn fence_upload(&self, plan: JsValue) -> Result<(), JsValue> {
        let plan: FencePlan = from_js(plan)?;
        let vehicle = live_vehicle_for_write(&self.state, OperationId::FenceUpload)?;
        run_cancellable_mission(&self.state, async move {
            live_commands::fence_upload(&vehicle, plan)
                .await
                .map_err(|error| error.to_string())
        })
        .await
    }

    #[wasm_bindgen(js_name = fenceDownload)]
    pub async fn fence_download(&self) -> Result<JsValue, JsValue> {
        let vehicle = live_vehicle_for_write(&self.state, OperationId::FenceDownload)?;
        let result = run_cancellable_mission(&self.state, async move {
            live_commands::fence_download(&vehicle)
                .await
                .map_err(|error| error.to_string())
        })
        .await?;
        to_js(&result)
    }

    #[wasm_bindgen(js_name = fenceClear)]
    pub async fn fence_clear(&self) -> Result<(), JsValue> {
        let vehicle = live_vehicle_for_write(&self.state, OperationId::FenceClear)?;
        run_cancellable_mission(&self.state, async move {
            live_commands::fence_clear(&vehicle)
                .await
                .map_err(|error| error.to_string())
        })
        .await
    }

    #[wasm_bindgen(js_name = rallyUpload)]
    pub async fn rally_upload(&self, plan: JsValue) -> Result<(), JsValue> {
        let plan: RallyPlan = from_js(plan)?;
        let vehicle = live_vehicle_for_write(&self.state, OperationId::RallyUpload)?;
        run_cancellable_mission(&self.state, async move {
            live_commands::rally_upload(&vehicle, plan)
                .await
                .map_err(|error| error.to_string())
        })
        .await
    }

    #[wasm_bindgen(js_name = rallyDownload)]
    pub async fn rally_download(&self) -> Result<JsValue, JsValue> {
        let vehicle = live_vehicle_for_write(&self.state, OperationId::RallyDownload)?;
        let result = run_cancellable_mission(&self.state, async move {
            live_commands::rally_download(&vehicle)
                .await
                .map_err(|error| error.to_string())
        })
        .await?;
        to_js(&result)
    }

    #[wasm_bindgen(js_name = rallyClear)]
    pub async fn rally_clear(&self) -> Result<(), JsValue> {
        let vehicle = live_vehicle_for_write(&self.state, OperationId::RallyClear)?;
        run_cancellable_mission(&self.state, async move {
            live_commands::rally_clear(&vehicle)
                .await
                .map_err(|error| error.to_string())
        })
        .await
    }

    #[wasm_bindgen(js_name = startGuidedSession)]
    pub async fn start_guided_session(&self, request: JsValue) -> Result<JsValue, JsValue> {
        let request: StartGuidedSessionRequest = from_js(request)?;
        let result = run_guided_goto(
            &self.state,
            OperationId::StartGuidedSession,
            request.session,
        )
        .await;
        to_js(&result)
    }

    #[wasm_bindgen(js_name = updateGuidedSession)]
    pub async fn update_guided_session(&self, request: JsValue) -> Result<JsValue, JsValue> {
        let request: UpdateGuidedSessionRequest = from_js(request)?;
        let result = run_guided_goto(
            &self.state,
            OperationId::UpdateGuidedSession,
            request.session,
        )
        .await;
        to_js(&result)
    }

    #[wasm_bindgen(js_name = stopGuidedSession)]
    pub fn stop_guided_session(&self) -> Result<JsValue, JsValue> {
        let vehicle = self
            .state
            .borrow()
            .live_runtime
            .with_runtime(|runtime| runtime.vehicle());
        let source_kind = self
            .state
            .borrow()
            .live_runtime
            .with_runtime(|runtime| runtime.guided_source_kind());
        let context = vehicle
            .as_ref()
            .map(live_commands::live_context_from_vehicle)
            .unwrap_or(GuidedLiveContext::unavailable());
        let result = self
            .state
            .borrow_mut()
            .guided_runtime
            .stop(source_kind, context);
        to_js(&result)
    }

    #[wasm_bindgen(js_name = calibrateAccel)]
    pub async fn calibrate_accel(&self) -> Result<(), JsValue> {
        let vehicle = live_vehicle_for_write(&self.state, OperationId::CalibrateAccel)?;
        live_commands::calibrate_accel(&vehicle)
            .await
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = calibrateGyro)]
    pub async fn calibrate_gyro(&self) -> Result<(), JsValue> {
        let vehicle = live_vehicle_for_write(&self.state, OperationId::CalibrateGyro)?;
        live_commands::calibrate_gyro(&vehicle)
            .await
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = calibrateCompassStart)]
    pub async fn calibrate_compass_start(&self, compass_mask: u8) -> Result<(), JsValue> {
        let vehicle = live_vehicle_for_write(&self.state, OperationId::CalibrateCompassStart)?;
        live_commands::calibrate_compass_start(&vehicle, compass_mask)
            .await
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = calibrateCompassAccept)]
    pub async fn calibrate_compass_accept(&self, _compass_mask: u8) -> Result<(), JsValue> {
        let vehicle = live_vehicle_for_write(&self.state, OperationId::CalibrateCompassAccept)?;
        live_commands::calibrate_compass_accept(&vehicle)
            .await
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = calibrateCompassCancel)]
    pub async fn calibrate_compass_cancel(&self, _compass_mask: u8) -> Result<(), JsValue> {
        let vehicle = live_vehicle_for_write(&self.state, OperationId::CalibrateCompassCancel)?;
        live_commands::calibrate_compass_cancel(&vehicle)
            .await
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = rebootVehicle)]
    pub async fn reboot_vehicle(&self) -> Result<(), JsValue> {
        let vehicle = live_vehicle_for_write(&self.state, OperationId::RebootVehicle)?;
        live_commands::reboot_vehicle(&vehicle)
            .await
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = motorTest)]
    pub async fn motor_test(
        &self,
        motor_instance: u8,
        throttle_pct: f32,
        duration_s: f32,
    ) -> Result<(), JsValue> {
        let vehicle = live_vehicle_for_write(&self.state, OperationId::MotorTest)?;
        live_commands::motor_test(&vehicle, motor_instance, throttle_pct, duration_s)
            .await
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = setServo)]
    pub async fn set_servo(&self, instance: u8, pwm_us: u16) -> Result<(), JsValue> {
        let vehicle = live_vehicle_for_write(&self.state, OperationId::SetServo)?;
        live_commands::set_servo(&vehicle, instance, pwm_us)
            .await
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = rcOverride)]
    pub async fn rc_override(&self, channels: JsValue) -> Result<(), JsValue> {
        let channels: Vec<RcOverrideChannelWire> = from_js(channels)?;
        let vehicle = live_vehicle_for_write(&self.state, OperationId::RcOverride)?;
        live_commands::rc_override(&vehicle, channels)
            .await
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = requestPrearmChecks)]
    pub async fn request_prearm_checks(&self) -> Result<(), JsValue> {
        let vehicle = live_vehicle_for_write(&self.state, OperationId::RequestPrearmChecks)?;
        live_commands::request_prearm_checks(&vehicle)
            .await
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }

    #[wasm_bindgen(js_name = openSessionSnapshot)]
    pub fn open_session_snapshot(&self, source_kind: String) -> Result<JsValue, JsValue> {
        let source_kind = parse_source_kind(&source_kind)?;
        let mut snapshot = self
            .state
            .borrow()
            .live_runtime
            .with_runtime(|runtime| runtime.open_session_snapshot(source_kind));
        snapshot.guided = guided_snapshot(&self.state, source_kind, DomainProvenance::Bootstrap);
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

fn live_vehicle_for_write(
    state: &Rc<RefCell<RuntimeState>>,
    operation_id: OperationId,
) -> Result<mavkit::Vehicle, JsValue> {
    let source_kind = state
        .borrow()
        .live_runtime
        .with_runtime(|runtime| runtime.effective_source_kind());
    if source_kind == SourceKind::Playback {
        return Err(JsValue::from_str(&operation_failure_json(OperationFailure {
            operation_id,
            reason: Reason {
                kind: ReasonKind::PermissionDenied,
                message:
                    "replay is read-only while playback is the effective source; switch back to the live source to send vehicle commands"
                        .to_string(),
            },
        })));
    }

    live_vehicle(state)
}

async fn run_cancellable_mission<T>(
    state: &Rc<RefCell<RuntimeState>>,
    future: impl std::future::Future<Output = Result<T, String>> + 'static,
) -> Result<T, JsValue>
where
    T: 'static,
{
    if state.borrow().mission_op_abort.is_some() {
        return Err(WasmError::invalid_input("mission operation already in progress").into());
    }

    let (abort_handle, registration) = AbortHandle::new_pair();
    let token = {
        let mut state = state.borrow_mut();
        let token = state.next_operation_token();
        state.mission_op_abort = Some((token, abort_handle));
        token
    };
    let (tx, rx) = oneshot::channel();
    wasm_bindgen_futures::spawn_local(async move {
        let result = Abortable::new(future, registration)
            .await
            .unwrap_or_else(|_| Err("mission operation cancelled".to_string()));
        let _ = tx.send(result);
    });

    let result = rx
        .await
        .map_err(|_| JsValue::from_str("mission operation task dropped"))?;
    clear_mission_operation(state, token);
    result.map_err(|error| JsValue::from_str(&error))
}

fn clear_mission_operation(state: &Rc<RefCell<RuntimeState>>, token: u64) {
    let mut state = state.borrow_mut();
    if state
        .mission_op_abort
        .as_ref()
        .is_some_and(|(active_token, _)| *active_token == token)
    {
        state.mission_op_abort = None;
    }
}

fn clear_param_download_operation(state: &Rc<RefCell<RuntimeState>>, token: u64) {
    let mut state = state.borrow_mut();
    if state
        .param_download_abort
        .as_ref()
        .is_some_and(|(active_token, _)| *active_token == token)
    {
        state.param_download_abort = None;
    }
}

fn guided_snapshot(
    state: &Rc<RefCell<RuntimeState>>,
    source_kind: SourceKind,
    provenance: DomainProvenance,
) -> ironwing_core::ipc::GuidedSnapshot {
    if source_kind == SourceKind::Playback {
        state
            .borrow_mut()
            .guided_runtime
            .reset_for_playback("playback source switched");
        return GuidedRuntime::snapshot_playback();
    }

    let vehicle = state
        .borrow()
        .live_runtime
        .with_runtime(|runtime| runtime.vehicle());
    let context = vehicle
        .as_ref()
        .map(live_commands::live_context_from_vehicle)
        .unwrap_or(GuidedLiveContext::unavailable());
    state
        .borrow()
        .guided_runtime
        .snapshot_live(provenance, context)
}

async fn run_guided_goto(
    state: &Rc<RefCell<RuntimeState>>,
    operation_id: OperationId,
    session: ironwing_core::ipc::GuidedSession,
) -> GuidedCommandResult {
    let vehicle = state
        .borrow()
        .live_runtime
        .with_runtime(|runtime| runtime.vehicle());
    let source_kind = state
        .borrow()
        .live_runtime
        .with_runtime(|runtime| runtime.guided_source_kind());
    let context = vehicle
        .as_ref()
        .map(live_commands::live_context_from_vehicle)
        .unwrap_or(GuidedLiveContext::unavailable());

    let reserve_result = {
        let mut state = state.borrow_mut();
        if operation_id == OperationId::StartGuidedSession {
            state
                .guided_runtime
                .reserve_start(source_kind, context, session.clone())
        } else {
            state
                .guided_runtime
                .reserve_update(source_kind, context, session.clone())
        }
    };
    if let Err(failure) = reserve_result {
        return GuidedCommandResult::Rejected { failure };
    }

    let Some(vehicle) = vehicle else {
        return guided_operation_failure(
            operation_id,
            ReasonKind::Unavailable,
            "guided control requires a live vehicle session",
            true,
            GuidedFatalityScope::Session,
        );
    };

    let ironwing_core::ipc::GuidedSession::Goto {
        latitude_deg,
        longitude_deg,
        altitude_m,
    } = session;

    if let Err(error) =
        live_commands::guided_goto(&vehicle, latitude_deg, longitude_deg, altitude_m).await
    {
        return state.borrow_mut().guided_runtime.abort_reserved(
            operation_id,
            ReasonKind::Failed,
            error.to_string(),
        );
    }

    let result = state
        .borrow_mut()
        .guided_runtime
        .commit_reserved(operation_id);
    if let GuidedCommandResult::Accepted { state: guided } = &result {
        let live_runtime = state.borrow().live_runtime.clone();
        live_runtime::emit_scoped(&live_runtime, event_names::GUIDED_STATE, guided.clone());
    }
    result
}

fn guided_operation_failure(
    operation_id: OperationId,
    kind: ReasonKind,
    message: impl Into<String>,
    retryable: bool,
    fatality_scope: GuidedFatalityScope,
) -> GuidedCommandResult {
    GuidedCommandResult::Rejected {
        failure: GuidedFailure {
            operation_id,
            reason: Reason {
                kind,
                message: message.into(),
            },
            retryable,
            fatality_scope,
            detail: None,
        },
    }
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
    for request in telemetry::DEFAULT_TELEMETRY_STREAM_REQUESTS {
        let _ = vehicle
            .raw()
            .set_message_interval(request.message_id, request.interval_usec)
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
