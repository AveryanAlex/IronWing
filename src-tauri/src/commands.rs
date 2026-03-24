use std::collections::HashMap;
use std::sync::atomic::Ordering;

use mavkit::{
    FencePlan, FlightMode, HomePosition, MissionIssue, MissionPlan, ParamStore, ParamWriteResult,
    RallyPlan, format_param_file, parse_param_file, validate_plan,
};
use tauri::Manager;
use crate::bridges::emit_scoped;
use mavkit::dialect::MavCmd;
use crate::bridges::TELEMETRY_INTERVAL_MS;
use crate::guided::{emit_guided_snapshot, live_context_from_vehicle};
use crate::ipc::{
    AckSessionSnapshotResult, DomainProvenance, DomainValue, GuidedCommandResult, GuidedFailure,
    GuidedFatalityScope, GuidedLiveContext, OpenSessionSnapshot, SessionConnection,
    SessionSnapshot, SourceKind, StartGuidedSessionRequest, UpdateGuidedSessionRequest,
    calibration_snapshot_from_sources, configuration_facts_snapshot_from_param_store,
    session_connection_from_link_state, status_text_snapshot_from_entries,
};
use crate::{AppState, helpers::with_vehicle};

/// Result of downloading a mission plan from a vehicle.
/// Home position is extracted from the telemetry home, not from plan items.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub(crate) struct MissionDownload {
    pub plan: MissionPlan,
    pub home: Option<HomePosition>,
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub(crate) fn list_serial_ports_cmd() -> Result<Vec<String>, String> {
    let ports = serialport::available_ports().map_err(|e| e.to_string())?;
    Ok(ports.into_iter().map(|p| p.port_name).collect())
}

#[cfg(target_os = "android")]
#[tauri::command]
pub(crate) fn list_serial_ports_cmd() -> Result<Vec<String>, String> {
    Err("not supported on android".to_string())
}

#[tauri::command]
pub(crate) fn mission_validate(plan: MissionPlan) -> Vec<MissionIssue> {
    validate_plan(&plan)
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(crate) enum TransportDescriptor {
    Udp {
        label: &'static str,
        available: bool,
        validation: UdpValidation,
    },
    Tcp {
        label: &'static str,
        available: bool,
        validation: TcpValidation,
    },
    Serial {
        label: &'static str,
        available: bool,
        validation: SerialValidation,
        default_baud: u32,
    },
    BluetoothBle {
        label: &'static str,
        available: bool,
        validation: AddressValidation,
    },
    #[cfg(target_os = "android")]
    BluetoothSpp {
        label: &'static str,
        available: bool,
        validation: AddressValidation,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub(crate) struct UdpValidation {
    bind_addr_required: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub(crate) struct TcpValidation {
    address_required: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub(crate) struct SerialValidation {
    port_required: bool,
    baud_required: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub(crate) struct AddressValidation {
    address_required: bool,
}

#[tauri::command]
pub(crate) fn available_transports() -> Vec<TransportDescriptor> {
    let mut transports = vec![
        TransportDescriptor::Udp {
            label: "UDP",
            available: true,
            validation: UdpValidation {
                bind_addr_required: true,
            },
        },
        TransportDescriptor::Tcp {
            label: "TCP",
            available: true,
            validation: TcpValidation {
                address_required: true,
            },
        },
    ];
    #[cfg(not(target_os = "android"))]
    transports.push(TransportDescriptor::Serial {
        label: "Serial",
        available: true,
        validation: SerialValidation {
            port_required: true,
            baud_required: true,
        },
        default_baud: 57600,
    });
    transports.push(TransportDescriptor::BluetoothBle {
        label: "BLE",
        available: true,
        validation: AddressValidation {
            address_required: true,
        },
    });
    #[cfg(target_os = "android")]
    transports.push(TransportDescriptor::BluetoothSpp {
        label: "Classic BT",
        available: true,
        validation: AddressValidation {
            address_required: true,
        },
    });
    transports
}

fn hydrate_playback_snapshot(
    snapshot: &mut OpenSessionSnapshot,
    frame: crate::logs::PlaybackFrame,
) {
    snapshot.session = frame.session;
    snapshot.telemetry = frame.telemetry;
    snapshot.mission_state = None;
    snapshot.param_store = None;
    snapshot.param_progress = None;
    snapshot.support = frame.support;
    snapshot.sensor_health = DomainValue::missing(DomainProvenance::Playback);
    snapshot.configuration_facts = DomainValue::missing(DomainProvenance::Playback);
    snapshot.calibration = DomainValue::missing(DomainProvenance::Playback);
    snapshot.guided = DomainValue::missing(DomainProvenance::Playback);
    snapshot.status_text = frame.status_text;
    snapshot.playback = frame.playback;
}

async fn hydrate_live_snapshot(
    state: &tauri::State<'_, AppState>,
    snapshot: &mut OpenSessionSnapshot,
    vehicle: &mavkit::Vehicle,
) {
    let link_state = vehicle.link().state().latest().unwrap_or(mavkit::LinkState::Connecting);
    let param_state = vehicle.params().latest();
    let param_store = param_state
        .as_ref()
        .and_then(|s| s.store.clone())
        .unwrap_or_default();

    snapshot.session = DomainValue::present(
        SessionSnapshot {
            status: crate::ipc::SessionStatus::Active,
            connection: session_connection_from_link_state(&link_state),
            vehicle_state: None,
            home_position: None,
        },
        DomainProvenance::Bootstrap,
    );
    snapshot.telemetry = DomainValue::missing(DomainProvenance::Bootstrap);
    snapshot.mission_state = vehicle.mission().latest();
    snapshot.param_store = Some(param_store.clone());
    snapshot.param_progress = None;
    snapshot.support = DomainValue::missing(DomainProvenance::Bootstrap);
    snapshot.sensor_health = DomainValue::missing(DomainProvenance::Bootstrap);
    snapshot.configuration_facts =
        configuration_facts_snapshot_from_param_store(&param_store, DomainProvenance::Bootstrap);

    let ardupilot = vehicle.ardupilot();
    let mag_progress_list = ardupilot.mag_cal_progress().latest().unwrap_or_default();
    let mag_report_list = ardupilot.mag_cal_report().latest().unwrap_or_default();
    snapshot.calibration = calibration_snapshot_from_sources(
        mag_progress_list.first(),
        mag_report_list.first(),
        DomainProvenance::Bootstrap,
    );
    snapshot.guided = state.guided_runtime.lock().await.snapshot_live(
        DomainProvenance::Bootstrap,
        live_context_from_vehicle(vehicle),
    );
    let entries = state.status_text_history.lock().await.clone();
    snapshot.status_text = status_text_snapshot_from_entries(entries, DomainProvenance::Bootstrap);
}

fn guided_operation_failure(
    operation_id: crate::ipc::OperationId,
    kind: crate::ipc::ReasonKind,
    message: impl Into<String>,
    retryable: bool,
    fatality_scope: GuidedFatalityScope,
) -> GuidedCommandResult {
    GuidedCommandResult::Rejected {
        failure: GuidedFailure {
            operation_id,
            reason: crate::ipc::Reason {
                kind,
                message: message.into(),
            },
            retryable,
            fatality_scope,
            detail: None,
        },
    }
}

#[tauri::command]
pub(crate) async fn arm_vehicle(
    state: tauri::State<'_, AppState>,
    force: bool,
) -> Result<(), String> {
    with_vehicle(&state)
        .await?
        .arm(force)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn disarm_vehicle(
    state: tauri::State<'_, AppState>,
    force: bool,
) -> Result<(), String> {
    with_vehicle(&state)
        .await?
        .disarm(force)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn set_flight_mode(
    state: tauri::State<'_, AppState>,
    custom_mode: u32,
) -> Result<(), String> {
    with_vehicle(&state)
        .await?
        .set_mode(custom_mode, false)
        .await
        .map_err(|e| e.to_string())
}

/// Takeoff requires a guided session in the new mavkit API. This uses a
/// raw COMMAND_LONG as a back-compat shim until the caller migrates.
#[tauri::command]
pub(crate) async fn vehicle_takeoff(
    state: tauri::State<'_, AppState>,
    altitude_m: f32,
) -> Result<(), String> {
    with_vehicle(&state)
        .await?
        .raw()
        .command_long(
            MavCmd::MAV_CMD_NAV_TAKEOFF as u16,
            [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, altitude_m],
        )
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Back-compat shim: sends DO_REPOSITION via raw COMMAND_LONG as a goto.
/// The new mavkit API requires a typed guided session, but the IronWing
/// frontend manages guided mode independently.
async fn send_guided_goto(
    vehicle: &mavkit::Vehicle,
    latitude_deg: f64,
    longitude_deg: f64,
    altitude_m: f32,
) -> Result<(), String> {
    vehicle
        .raw()
        .command_long(
            MavCmd::MAV_CMD_DO_REPOSITION as u16,
            [
                -1.0,     // ground speed (unchanged)
                0.0,      // bitmask
                0.0,      // loiter radius
                0.0,      // yaw heading
                // COMMAND_LONG params are f32 on the wire; ~1 m precision loss is inherent to the protocol.
                latitude_deg as f32,
                longitude_deg as f32,
                altitude_m,
            ],
        )
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn start_guided_session(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    request: StartGuidedSessionRequest,
) -> Result<GuidedCommandResult, String> {
    let vehicle = state.vehicle.lock().await.clone();
    let source_kind = state.session_runtime.lock().await.guided_source_kind();
    let context = vehicle
        .as_ref()
        .map(live_context_from_vehicle)
        .unwrap_or(GuidedLiveContext::unavailable());

    {
        let mut guided_runtime = state.guided_runtime.lock().await;
        if let Err(failure) =
            guided_runtime.reserve_start(source_kind, context, request.session.clone())
        {
            return Ok(GuidedCommandResult::Rejected { failure });
        }
    }

    let Some(vehicle) = vehicle else {
        return Ok(guided_operation_failure(
            crate::ipc::OperationId::StartGuidedSession,
            crate::ipc::ReasonKind::Unavailable,
            "guided control requires a live vehicle session",
            true,
            GuidedFatalityScope::Session,
        ));
    };

    let crate::ipc::GuidedSession::Goto {
        latitude_deg,
        longitude_deg,
        altitude_m,
    } = request.session;

    if let Err(error) = send_guided_goto(&vehicle, latitude_deg, longitude_deg, altitude_m).await {
        return Ok(state.guided_runtime.lock().await.abort_reserved(
            crate::ipc::OperationId::StartGuidedSession,
            crate::ipc::ReasonKind::Failed,
            error.to_string(),
        ));
    }

    let result = state
        .guided_runtime
        .lock()
        .await
        .commit_reserved(crate::ipc::OperationId::StartGuidedSession);
    if let GuidedCommandResult::Accepted { state: guided } = &result {
        emit_guided_snapshot(&state, &app, guided.clone()).await;
    }
    Ok(result)
}

#[tauri::command]
pub(crate) async fn update_guided_session(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    request: UpdateGuidedSessionRequest,
) -> Result<GuidedCommandResult, String> {
    let vehicle = state.vehicle.lock().await.clone();
    let source_kind = state.session_runtime.lock().await.guided_source_kind();
    let context = vehicle
        .as_ref()
        .map(live_context_from_vehicle)
        .unwrap_or(GuidedLiveContext::unavailable());

    {
        let mut guided_runtime = state.guided_runtime.lock().await;
        if let Err(failure) =
            guided_runtime.reserve_update(source_kind, context, request.session.clone())
        {
            return Ok(GuidedCommandResult::Rejected { failure });
        }
    }

    let Some(vehicle) = vehicle else {
        return Ok(guided_operation_failure(
            crate::ipc::OperationId::UpdateGuidedSession,
            crate::ipc::ReasonKind::Unavailable,
            "guided control requires a live vehicle session",
            true,
            GuidedFatalityScope::Session,
        ));
    };

    let crate::ipc::GuidedSession::Goto {
        latitude_deg,
        longitude_deg,
        altitude_m,
    } = request.session;

    if let Err(error) = send_guided_goto(&vehicle, latitude_deg, longitude_deg, altitude_m).await {
        return Ok(state.guided_runtime.lock().await.abort_reserved(
            crate::ipc::OperationId::UpdateGuidedSession,
            crate::ipc::ReasonKind::Failed,
            error.to_string(),
        ));
    }

    let result = state
        .guided_runtime
        .lock()
        .await
        .commit_reserved(crate::ipc::OperationId::UpdateGuidedSession);
    if let GuidedCommandResult::Accepted { state: guided } = &result {
        emit_guided_snapshot(&state, &app, guided.clone()).await;
    }
    Ok(result)
}

#[tauri::command]
pub(crate) async fn stop_guided_session(
    state: tauri::State<'_, AppState>,
    _app: tauri::AppHandle,
) -> Result<GuidedCommandResult, String> {
    let vehicle = state.vehicle.lock().await.clone();
    let source_kind = state.session_runtime.lock().await.guided_source_kind();
    let context = vehicle
        .as_ref()
        .map(live_context_from_vehicle)
        .unwrap_or(GuidedLiveContext::unavailable());
    let result = state.guided_runtime.lock().await.stop(source_kind, context);
    Ok(result)
}

#[tauri::command]
pub(crate) async fn get_available_modes(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<FlightMode>, String> {
    Ok(with_vehicle(&state).await?.available_modes().iter().collect())
}

#[tauri::command]
pub(crate) fn set_telemetry_rate(rate_hz: u32) -> Result<(), String> {
    if rate_hz == 0 || rate_hz > 20 {
        return Err("rate_hz must be between 1 and 20".into());
    }
    TELEMETRY_INTERVAL_MS.store(1000 / rate_hz as u64, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
pub(crate) async fn mission_upload(
    state: tauri::State<'_, AppState>,
    plan: MissionPlan,
) -> Result<(), String> {
    let op = with_vehicle(&state)
        .await?
        .mission()
        .upload(plan)
        .map_err(|e| e.to_string())?;
    state.mission_op_cancel.lock().await.replace(op.cancel_token());
    let result = op.wait().await.map_err(|e| e.to_string());
    state.mission_op_cancel.lock().await.take();
    result
}

#[tauri::command]
pub(crate) async fn mission_download(
    state: tauri::State<'_, AppState>,
) -> Result<MissionDownload, String> {
    let vehicle = with_vehicle(&state).await?;
    let op = vehicle
        .mission()
        .download()
        .map_err(|e| e.to_string())?;
    state.mission_op_cancel.lock().await.replace(op.cancel_token());
    let plan = op.wait().await.map_err(|e| e.to_string());
    state.mission_op_cancel.lock().await.take();
    let plan = plan?;
    let home = vehicle.home().latest().map(|sample| HomePosition {
        latitude_deg: sample.value.latitude_deg,
        longitude_deg: sample.value.longitude_deg,
        altitude_m: sample.value.altitude_msl_m,
    });
    Ok(MissionDownload { plan, home })
}

#[tauri::command]
pub(crate) async fn mission_clear(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let op = with_vehicle(&state)
        .await?
        .mission()
        .clear()
        .map_err(|e| e.to_string())?;
    state.mission_op_cancel.lock().await.replace(op.cancel_token());
    let result = op.wait().await.map_err(|e| e.to_string());
    state.mission_op_cancel.lock().await.take();
    result
}

#[tauri::command]
pub(crate) async fn fence_upload(
    state: tauri::State<'_, AppState>,
    plan: FencePlan,
) -> Result<(), String> {
    let op = with_vehicle(&state)
        .await?
        .fence()
        .upload(plan)
        .map_err(|e| e.to_string())?;
    state.mission_op_cancel.lock().await.replace(op.cancel_token());
    let result = op.wait().await.map_err(|e| e.to_string());
    state.mission_op_cancel.lock().await.take();
    result
}

#[tauri::command]
pub(crate) async fn fence_download(
    state: tauri::State<'_, AppState>,
) -> Result<FencePlan, String> {
    let op = with_vehicle(&state)
        .await?
        .fence()
        .download()
        .map_err(|e| e.to_string())?;
    state.mission_op_cancel.lock().await.replace(op.cancel_token());
    let result = op.wait().await.map_err(|e| e.to_string());
    state.mission_op_cancel.lock().await.take();
    result
}

#[tauri::command]
pub(crate) async fn fence_clear(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let op = with_vehicle(&state)
        .await?
        .fence()
        .clear()
        .map_err(|e| e.to_string())?;
    state.mission_op_cancel.lock().await.replace(op.cancel_token());
    let result = op.wait().await.map_err(|e| e.to_string());
    state.mission_op_cancel.lock().await.take();
    result
}

#[tauri::command]
pub(crate) async fn rally_upload(
    state: tauri::State<'_, AppState>,
    plan: RallyPlan,
) -> Result<(), String> {
    let op = with_vehicle(&state)
        .await?
        .rally()
        .upload(plan)
        .map_err(|e| e.to_string())?;
    state.mission_op_cancel.lock().await.replace(op.cancel_token());
    let result = op.wait().await.map_err(|e| e.to_string());
    state.mission_op_cancel.lock().await.take();
    result
}

#[tauri::command]
pub(crate) async fn rally_download(
    state: tauri::State<'_, AppState>,
) -> Result<RallyPlan, String> {
    let op = with_vehicle(&state)
        .await?
        .rally()
        .download()
        .map_err(|e| e.to_string())?;
    state.mission_op_cancel.lock().await.replace(op.cancel_token());
    let result = op.wait().await.map_err(|e| e.to_string());
    state.mission_op_cancel.lock().await.take();
    result
}

#[tauri::command]
pub(crate) async fn rally_clear(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let op = with_vehicle(&state)
        .await?
        .rally()
        .clear()
        .map_err(|e| e.to_string())?;
    state.mission_op_cancel.lock().await.replace(op.cancel_token());
    let result = op.wait().await.map_err(|e| e.to_string());
    state.mission_op_cancel.lock().await.take();
    result
}

#[tauri::command]
pub(crate) async fn mission_set_current(
    state: tauri::State<'_, AppState>,
    seq: u16,
) -> Result<(), String> {
    with_vehicle(&state)
        .await?
        .mission()
        .set_current(seq)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn mission_cancel(state: tauri::State<'_, AppState>) -> Result<(), String> {
    if let Some(token) = state.mission_op_cancel.lock().await.take() {
        token.cancel();
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn calibrate_accel(state: tauri::State<'_, AppState>) -> Result<(), String> {
    with_vehicle(&state)
        .await?
        .ardupilot()
        .preflight_calibration(false, true, false, false)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn calibrate_gyro(state: tauri::State<'_, AppState>) -> Result<(), String> {
    with_vehicle(&state)
        .await?
        .ardupilot()
        .preflight_calibration(true, false, false, false)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn param_download_all(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // Guard: reject concurrent download
    {
        let guard = state.param_download_abort.lock().await;
        if guard.is_some() {
            return Err("parameter download already in progress".to_string());
        }
    }

    let handle = with_vehicle(&state)
        .await?
        .params()
        .download_all()
        .map_err(|e| e.to_string())?;

    // Spawn progress bridge: relay ParamOperationProgress → param://progress
    let mut progress_sub = handle.subscribe();
    let app_for_bridge = app.clone();
    let bridge_task = tokio::spawn(async move {
        while let Some(p) = progress_sub.recv().await {
            emit_scoped(&app_for_bridge, "param://progress", p).await;
        }
    });

    // Spawn wait task that owns the handle.
    // Cancellation works by aborting this task — tokio drops the handle,
    // which calls ParamOperationHandle::Drop → CancellationToken::cancel().
    let app_for_wait = app.clone();
    let wait_task = tokio::spawn(async move {
        let _ = handle.wait().await;
        // Clear the guard on natural completion. Abort paths (param_cancel, disconnect)
        // clear it themselves before aborting this task, so this is a no-op there.
        app_for_wait.state::<AppState>().param_download_abort.lock().await.take();
    });

    // Store the abort handle — param_cancel will abort this task.
    // The wait task is managed exclusively through this handle and is not pushed
    // into background_tasks, to avoid a double-abort on disconnect teardown.
    let abort_handle = wait_task.abort_handle();
    state.param_download_abort.lock().await.replace(abort_handle);

    state.background_tasks.lock().await.push(bridge_task);
    // wait_task is intentionally detached; it is cancelled via param_download_abort.

    Ok(())
}

#[tauri::command]
pub(crate) async fn param_write(
    state: tauri::State<'_, AppState>,
    name: String,
    value: f32,
) -> Result<ParamWriteResult, String> {
    with_vehicle(&state)
        .await?
        .params()
        .write(&name, value)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn param_write_batch(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    params: Vec<(String, f32)>,
) -> Result<Vec<ParamWriteResult>, String> {
    let handle = with_vehicle(&state)
        .await?
        .params()
        .write_batch(params)
        .map_err(|e| e.to_string())?;

    // Spawn progress bridge: relay ParamOperationProgress → param://progress
    let mut progress_sub = handle.subscribe();
    let app_for_bridge = app.clone();
    let bridge_task = tokio::spawn(async move {
        while let Some(p) = progress_sub.recv().await {
            emit_scoped(&app_for_bridge, "param://progress", p).await;
        }
    });
    // The bridge task self-terminates when the progress channel closes (i.e. when
    // `handle` is dropped at function return). Not tracked in background_tasks
    // because it needs no external cancellation for this synchronous operation.
    drop(bridge_task);

    handle.wait().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn param_parse_file(contents: String) -> Result<HashMap<String, f32>, String> {
    parse_param_file(&contents)
        .map(|pairs| pairs.into_iter().collect())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) fn param_format_file(store: ParamStore) -> String {
    format_param_file(&store)
}

#[tauri::command]
pub(crate) async fn param_cancel(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    // Abort the wait task — its Drop calls ParamOperationHandle::cancel()
    if let Some(abort) = state.param_download_abort.lock().await.take() {
        abort.abort();
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn reboot_vehicle(state: tauri::State<'_, AppState>) -> Result<(), String> {
    with_vehicle(&state)
        .await?
        .ardupilot()
        .reboot()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn motor_test(
    state: tauri::State<'_, AppState>,
    motor_instance: u8,
    throttle_pct: f32,
    duration_s: f32,
) -> Result<(), String> {
    with_vehicle(&state)
        .await?
        .ardupilot()
        .motor_test(motor_instance, throttle_pct, duration_s.clamp(0.0, u16::MAX as f32) as u16)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn calibrate_compass_start(
    state: tauri::State<'_, AppState>,
    compass_mask: u8,
) -> Result<(), String> {
    with_vehicle(&state)
        .await?
        .ardupilot()
        .start_mag_cal(compass_mask)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn calibrate_compass_accept(
    state: tauri::State<'_, AppState>,
    _compass_mask: u8,
) -> Result<(), String> {
    with_vehicle(&state)
        .await?
        .ardupilot()
        .accept_mag_cal()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn calibrate_compass_cancel(
    state: tauri::State<'_, AppState>,
    _compass_mask: u8,
) -> Result<(), String> {
    with_vehicle(&state)
        .await?
        .ardupilot()
        .cancel_mag_cal()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn request_prearm_checks(state: tauri::State<'_, AppState>) -> Result<(), String> {
    with_vehicle(&state)
        .await?
        .ardupilot()
        .request_prearm_checks()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn open_session_snapshot(
    state: tauri::State<'_, AppState>,
    _app: tauri::AppHandle,
    source_kind: SourceKind,
) -> Result<OpenSessionSnapshot, String> {
    if source_kind == SourceKind::Playback {
        let guard = state.log_store.lock().await;
        let Some(store) = guard.as_ref() else {
            return Err("no log open".to_string());
        };

        state
            .guided_runtime
            .lock()
            .await
            .reset_for_playback("playback source switched");

        let mut runtime = state.session_runtime.lock().await;
        let mut snapshot = runtime.open_session_snapshot(source_kind);
        drop(runtime);

        snapshot.guided = crate::ipc::guided::GuidedRuntime::snapshot_playback();
        hydrate_playback_snapshot(&mut snapshot, store.playback_frame());
        return Ok(snapshot);
    }

    let mut runtime = state.session_runtime.lock().await;
    let mut snapshot = runtime.open_session_snapshot(source_kind);
    drop(runtime);

    let vehicle = state.vehicle.lock().await.clone();
    if let Some(vehicle) = vehicle.as_ref() {
        hydrate_live_snapshot(&state, &mut snapshot, vehicle).await;
    } else {
        snapshot.session = DomainValue::present(
            SessionSnapshot {
                status: crate::ipc::SessionStatus::Pending,
                connection: SessionConnection::Disconnected,
                vehicle_state: None,
                home_position: None,
            },
            DomainProvenance::Bootstrap,
        );
        snapshot.telemetry = DomainValue::missing(DomainProvenance::Bootstrap);
        snapshot.mission_state = None;
        snapshot.param_store = None;
        snapshot.param_progress = None;
        snapshot.support = DomainValue::missing(DomainProvenance::Bootstrap);
        snapshot.sensor_health = DomainValue::missing(DomainProvenance::Bootstrap);
        snapshot.configuration_facts = DomainValue::missing(DomainProvenance::Bootstrap);
        snapshot.calibration = DomainValue::missing(DomainProvenance::Bootstrap);
        snapshot.guided = state.guided_runtime.lock().await.snapshot_live(
            DomainProvenance::Bootstrap,
            GuidedLiveContext::unavailable(),
        );
        snapshot.status_text =
            status_text_snapshot_from_entries(Vec::new(), DomainProvenance::Bootstrap);
    }

    Ok(snapshot)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn available_transports_returns_typed_descriptors() {
        let value = serde_json::to_value(available_transports()).expect("serialize transports");
        assert!(
            value
                .as_array()
                .expect("array")
                .iter()
                .all(|entry| entry.get("kind").is_some())
        );
        assert!(value.to_string().contains("validation"));
    }

    #[test]
    fn guided_operation_failure_serializes_typed_operation_id_and_reason() {
        let value = serde_json::to_value(guided_operation_failure(
            crate::ipc::OperationId::StartGuidedSession,
            crate::ipc::ReasonKind::Failed,
            "goto failed",
            true,
            GuidedFatalityScope::Operation,
        ))
        .expect("serialize guided failure");

        assert_eq!(value["result"], "rejected");
        assert_eq!(value["failure"]["operation_id"], "start_guided_session");
        assert_eq!(value["failure"]["reason"]["kind"], "failed");
        assert_eq!(value["failure"]["reason"]["message"], "goto failed");
    }
}

#[tauri::command]
pub(crate) async fn ack_session_snapshot(
    state: tauri::State<'_, AppState>,
    session_id: String,
    seek_epoch: u64,
    reset_revision: u64,
) -> Result<AckSessionSnapshotResult, String> {
    let mut runtime = state.session_runtime.lock().await;
    Ok(runtime.ack_session_snapshot(&session_id, seek_epoch, reset_revision))
}
