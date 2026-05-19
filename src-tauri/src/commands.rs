use std::collections::HashMap;
use std::future::Future;
use std::sync::atomic::Ordering;

use crate::bridges::TELEMETRY_INTERVAL_MS;
use crate::bridges::emit_scoped;
use crate::e2e_emit::emit_event;
use crate::guided::{emit_guided_snapshot, live_context_from_vehicle};
use crate::ipc::{
    AckSessionSnapshotResult, DomainProvenance, DomainValue, GuidedCommandResult, GuidedFailure,
    GuidedFatalityScope, GuidedLiveContext, OpenSessionSnapshot, OperationId, ScopedEvent,
    SessionEnvelope, SourceKind, StartGuidedSessionRequest, UpdateGuidedSessionRequest,
};
use crate::{
    AppState,
    helpers::{ensure_live_write_allowed, with_vehicle},
};
use ironwing_core::event_names;
use ironwing_core::live_runtime::RuntimeCapabilities;
use ironwing_core::live_runtime::commands as live_commands;
use ironwing_core::telemetry::{self, MessageRateInfo};
use ironwing_core::transport::{self, TransportDescriptor};
use mavkit::dialect::MavCmd;
use mavkit::{
    FencePlan, FlightMode, HomePosition, MissionIssue, MissionPlan, ParamStore, ParamWriteResult,
    RallyPlan, RcOverride, RcOverrideChannelValue, format_param_file, parse_param_file,
    validate_plan,
};
use tauri::Manager;

#[cfg(test)]
use crate::ipc::SessionConnection;
#[cfg(test)]
use crate::ipc::StatusTextEntry;
#[cfg(test)]
use ironwing_core::live::{LiveSnapshotInput, base_live_snapshot_from_caches};

/// Result of downloading a mission plan from a vehicle.
/// Home position is extracted from the telemetry home, not from plan items.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub(crate) struct MissionDownload {
    pub plan: MissionPlan,
    pub home: Option<HomePosition>,
}

#[derive(Debug, Clone, Copy, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(crate) enum RcOverrideChannelValueWire {
    Ignore,
    Release,
    Pwm { pwm_us: u16 },
}

impl TryFrom<RcOverrideChannelValueWire> for RcOverrideChannelValue {
    type Error = mavkit::VehicleError;

    fn try_from(value: RcOverrideChannelValueWire) -> Result<Self, Self::Error> {
        match value {
            RcOverrideChannelValueWire::Ignore => Ok(RcOverrideChannelValue::Ignore),
            RcOverrideChannelValueWire::Release => Ok(RcOverrideChannelValue::Release),
            RcOverrideChannelValueWire::Pwm { pwm_us } => RcOverrideChannelValue::pwm(pwm_us),
        }
    }
}

#[derive(Debug, Clone, Copy, serde::Deserialize)]
pub(crate) struct RcOverrideChannelWire {
    channel: u8,
    value: RcOverrideChannelValueWire,
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

#[tauri::command]
pub(crate) fn available_transports() -> Vec<TransportDescriptor> {
    transport::current_native_transport_descriptors()
}

#[tauri::command]
pub(crate) fn runtime_capabilities() -> RuntimeCapabilities {
    RuntimeCapabilities::native(available_transports())
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

#[cfg(test)]
fn live_snapshot_from_caches(
    envelope: SessionEnvelope,
    session_context: &crate::bridges::SessionContext,
    live_telemetry: &crate::ipc::TelemetrySnapshot,
    status_text_entries: &[StatusTextEntry],
    connected: bool,
    provenance: DomainProvenance,
) -> OpenSessionSnapshot {
    base_live_snapshot_from_caches(LiveSnapshotInput {
        envelope,
        session_context,
        live_telemetry,
        status_text_entries,
        connected,
        provenance,
    })
}

async fn build_live_snapshot(
    state: &AppState,
    envelope: SessionEnvelope,
    provenance: DomainProvenance,
) -> OpenSessionSnapshot {
    let vehicle = state.live_runtime.with_runtime(|runtime| runtime.vehicle());
    let mut snapshot = state
        .live_runtime
        .with_runtime(|runtime| runtime.live_snapshot_with_envelope(envelope, provenance));

    let Some(vehicle) = vehicle.as_ref() else {
        snapshot.guided = state
            .guided_runtime
            .lock()
            .await
            .snapshot_live(provenance, GuidedLiveContext::unavailable());
        return snapshot;
    };

    snapshot.guided = state
        .guided_runtime
        .lock()
        .await
        .snapshot_live(provenance, live_context_from_vehicle(vehicle));
    snapshot
}

async fn run_cancellable_plan_op<T, Start, Wait>(
    state: &AppState,
    operation_id: OperationId,
    start: Start,
) -> Result<T, String>
where
    Start: FnOnce(mavkit::Vehicle) -> Result<(crate::MissionCancelToken, Wait), String>,
    Wait: Future<Output = Result<T, String>>,
{
    ensure_live_write_allowed(state, operation_id).await?;
    let vehicle = with_vehicle(state).await?;
    let (cancel_token, wait) = start(vehicle)?;

    state.mission_op_cancel.lock().await.replace(cancel_token);
    let result = wait.await;
    state.mission_op_cancel.lock().await.take();
    result
}

pub(crate) async fn emit_live_snapshot_restore(
    state: &AppState,
    app: &tauri::AppHandle,
    envelope: SessionEnvelope,
) {
    let snapshot = build_live_snapshot(state, envelope.clone(), DomainProvenance::Stream).await;

    emit_event(
        app,
        event_names::SESSION_STATE,
        &ScopedEvent {
            envelope: envelope.clone(),
            value: snapshot.session,
        },
    );
    emit_event(
        app,
        event_names::TELEMETRY_STATE,
        &ScopedEvent {
            envelope: envelope.clone(),
            value: snapshot.telemetry,
        },
    );
    emit_event(
        app,
        event_names::SUPPORT_STATE,
        &ScopedEvent {
            envelope: envelope.clone(),
            value: snapshot.support,
        },
    );
    emit_event(
        app,
        event_names::STATUS_TEXT_STATE,
        &ScopedEvent {
            envelope,
            value: snapshot.status_text,
        },
    );
}

#[tauri::command]
pub(crate) async fn arm_vehicle(
    state: tauri::State<'_, AppState>,
    force: bool,
) -> Result<(), String> {
    ensure_live_write_allowed(state.inner(), OperationId::ArmVehicle).await?;
    let vehicle = with_vehicle(&state).await?;
    live_commands::arm(&vehicle, force)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn disarm_vehicle(
    state: tauri::State<'_, AppState>,
    force: bool,
) -> Result<(), String> {
    ensure_live_write_allowed(state.inner(), OperationId::DisarmVehicle).await?;
    let vehicle = with_vehicle(&state).await?;
    live_commands::disarm(&vehicle, force)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn set_flight_mode(
    state: tauri::State<'_, AppState>,
    custom_mode: u32,
) -> Result<(), String> {
    ensure_live_write_allowed(state.inner(), OperationId::SetFlightMode).await?;
    let vehicle = with_vehicle(&state).await?;
    live_commands::set_flight_mode(&vehicle, custom_mode)
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
    ensure_live_write_allowed(state.inner(), OperationId::VehicleTakeoff).await?;
    let vehicle = with_vehicle(&state).await?;
    live_commands::takeoff(&vehicle, altitude_m)
        .await
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
                -1.0, // ground speed (unchanged)
                0.0,  // bitmask
                0.0,  // loiter radius
                0.0,  // yaw heading
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
    let vehicle = state.live_runtime.with_runtime(|runtime| runtime.vehicle());
    let source_kind = state
        .live_runtime
        .with_runtime(|runtime| runtime.guided_source_kind());
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
    let vehicle = state.live_runtime.with_runtime(|runtime| runtime.vehicle());
    let source_kind = state
        .live_runtime
        .with_runtime(|runtime| runtime.guided_source_kind());
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
    let vehicle = state.live_runtime.with_runtime(|runtime| runtime.vehicle());
    let source_kind = state
        .live_runtime
        .with_runtime(|runtime| runtime.guided_source_kind());
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
    let vehicle = with_vehicle(&state).await?;
    Ok(live_commands::get_available_modes(&vehicle))
}

#[tauri::command]
pub(crate) async fn set_message_rate(
    state: tauri::State<'_, AppState>,
    message_id: u32,
    rate_hz: f32,
) -> Result<(), String> {
    ensure_live_write_allowed(state.inner(), OperationId::SetMessageRate).await?;
    let vehicle = with_vehicle(&state).await?;
    live_commands::set_message_rate(&vehicle, message_id, rate_hz)
        .await
        .map_err(|e| e.to_string())
}

/// Returns the set of MAVLink messages whose streaming rate is user-configurable,
/// along with sensible defaults tuned for ArduPilot SITL / Copter. These rates
/// balance bandwidth and UI responsiveness; actual firmware defaults may differ.
#[tauri::command]
pub(crate) fn get_available_message_rates() -> Vec<MessageRateInfo> {
    telemetry::available_message_rates()
}

#[tauri::command]
pub(crate) fn set_telemetry_rate(rate_hz: u32) -> Result<(), String> {
    let interval_ms = telemetry::telemetry_interval_ms_for_rate(rate_hz)?;
    TELEMETRY_INTERVAL_MS.store(interval_ms, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
pub(crate) async fn mission_upload(
    state: tauri::State<'_, AppState>,
    plan: MissionPlan,
) -> Result<(), String> {
    run_cancellable_plan_op(state.inner(), OperationId::MissionUpload, move |vehicle| {
        let op = vehicle.mission().upload(plan).map_err(|e| e.to_string())?;
        Ok((op.cancel_token(), async move {
            op.wait().await.map_err(|e| e.to_string())
        }))
    })
    .await
}

#[tauri::command]
pub(crate) async fn mission_download(
    state: tauri::State<'_, AppState>,
) -> Result<MissionDownload, String> {
    run_cancellable_plan_op(state.inner(), OperationId::MissionDownload, |vehicle| {
        let op = vehicle.mission().download().map_err(|e| e.to_string())?;
        Ok((op.cancel_token(), async move {
            let plan = op.wait().await.map_err(|e| e.to_string())?;
            let home = vehicle
                .telemetry()
                .home()
                .latest()
                .map(|sample| HomePosition {
                    latitude_deg: sample.value.latitude_deg,
                    longitude_deg: sample.value.longitude_deg,
                    altitude_m: sample.value.altitude_msl_m,
                });
            Ok(MissionDownload { plan, home })
        }))
    })
    .await
}

#[tauri::command]
pub(crate) async fn mission_clear(state: tauri::State<'_, AppState>) -> Result<(), String> {
    run_cancellable_plan_op(state.inner(), OperationId::MissionClear, |vehicle| {
        let op = vehicle.mission().clear().map_err(|e| e.to_string())?;
        Ok((op.cancel_token(), async move {
            op.wait().await.map_err(|e| e.to_string())
        }))
    })
    .await
}

#[tauri::command]
pub(crate) async fn fence_upload(
    state: tauri::State<'_, AppState>,
    plan: FencePlan,
) -> Result<(), String> {
    run_cancellable_plan_op(state.inner(), OperationId::FenceUpload, move |vehicle| {
        let op = vehicle.fence().upload(plan).map_err(|e| e.to_string())?;
        Ok((op.cancel_token(), async move {
            op.wait().await.map_err(|e| e.to_string())
        }))
    })
    .await
}

#[tauri::command]
pub(crate) async fn fence_download(state: tauri::State<'_, AppState>) -> Result<FencePlan, String> {
    run_cancellable_plan_op(state.inner(), OperationId::FenceDownload, |vehicle| {
        let op = vehicle.fence().download().map_err(|e| e.to_string())?;
        Ok((op.cancel_token(), async move {
            op.wait().await.map_err(|e| e.to_string())
        }))
    })
    .await
}

#[tauri::command]
pub(crate) async fn fence_clear(state: tauri::State<'_, AppState>) -> Result<(), String> {
    run_cancellable_plan_op(state.inner(), OperationId::FenceClear, |vehicle| {
        let op = vehicle.fence().clear().map_err(|e| e.to_string())?;
        Ok((op.cancel_token(), async move {
            op.wait().await.map_err(|e| e.to_string())
        }))
    })
    .await
}

#[tauri::command]
pub(crate) async fn rally_upload(
    state: tauri::State<'_, AppState>,
    plan: RallyPlan,
) -> Result<(), String> {
    run_cancellable_plan_op(state.inner(), OperationId::RallyUpload, move |vehicle| {
        let op = vehicle.rally().upload(plan).map_err(|e| e.to_string())?;
        Ok((op.cancel_token(), async move {
            op.wait().await.map_err(|e| e.to_string())
        }))
    })
    .await
}

#[tauri::command]
pub(crate) async fn rally_download(state: tauri::State<'_, AppState>) -> Result<RallyPlan, String> {
    run_cancellable_plan_op(state.inner(), OperationId::RallyDownload, |vehicle| {
        let op = vehicle.rally().download().map_err(|e| e.to_string())?;
        Ok((op.cancel_token(), async move {
            op.wait().await.map_err(|e| e.to_string())
        }))
    })
    .await
}

#[tauri::command]
pub(crate) async fn rally_clear(state: tauri::State<'_, AppState>) -> Result<(), String> {
    run_cancellable_plan_op(state.inner(), OperationId::RallyClear, |vehicle| {
        let op = vehicle.rally().clear().map_err(|e| e.to_string())?;
        Ok((op.cancel_token(), async move {
            op.wait().await.map_err(|e| e.to_string())
        }))
    })
    .await
}

#[tauri::command]
pub(crate) async fn mission_set_current(
    state: tauri::State<'_, AppState>,
    seq: u16,
) -> Result<(), String> {
    ensure_live_write_allowed(state.inner(), OperationId::MissionSetCurrent).await?;
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
    ensure_live_write_allowed(state.inner(), OperationId::CalibrateAccel).await?;
    with_vehicle(&state)
        .await?
        .ardupilot()
        .preflight_calibration(false, true, false, false)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn calibrate_gyro(state: tauri::State<'_, AppState>) -> Result<(), String> {
    ensure_live_write_allowed(state.inner(), OperationId::CalibrateGyro).await?;
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

    // Spawn progress bridge: relay ParamOperationProgress to the shared progress event.
    let mut progress_sub = handle.subscribe();
    let app_for_bridge = app.clone();
    let bridge_task = tokio::spawn(async move {
        while let Some(p) = progress_sub.recv().await {
            emit_scoped(&app_for_bridge, event_names::PARAM_PROGRESS, p).await;
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
        app_for_wait
            .state::<AppState>()
            .param_download_abort
            .lock()
            .await
            .take();
    });

    // Store the abort handle — param_cancel will abort this task.
    // The wait task is managed exclusively through this handle and is not pushed
    // into background_tasks, to avoid a double-abort on disconnect teardown.
    let abort_handle = wait_task.abort_handle();
    state
        .param_download_abort
        .lock()
        .await
        .replace(abort_handle);

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
    ensure_live_write_allowed(state.inner(), OperationId::ParamWrite).await?;
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
    ensure_live_write_allowed(state.inner(), OperationId::ParamWriteBatch).await?;
    let handle = with_vehicle(&state)
        .await?
        .params()
        .write_batch(params)
        .map_err(|e| e.to_string())?;

    // Spawn progress bridge: relay ParamOperationProgress to the shared progress event.
    let mut progress_sub = handle.subscribe();
    let app_for_bridge = app.clone();
    let bridge_task = tokio::spawn(async move {
        while let Some(p) = progress_sub.recv().await {
            emit_scoped(&app_for_bridge, event_names::PARAM_PROGRESS, p).await;
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
pub(crate) async fn param_cancel(state: tauri::State<'_, AppState>) -> Result<(), String> {
    // Abort the wait task — its Drop calls ParamOperationHandle::cancel()
    if let Some(abort) = state.param_download_abort.lock().await.take() {
        abort.abort();
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn reboot_vehicle(state: tauri::State<'_, AppState>) -> Result<(), String> {
    ensure_live_write_allowed(state.inner(), OperationId::RebootVehicle).await?;
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
    ensure_live_write_allowed(state.inner(), OperationId::MotorTest).await?;
    with_vehicle(&state)
        .await?
        .ardupilot()
        .motor_test(
            motor_instance,
            throttle_pct,
            duration_s.clamp(0.0, u16::MAX as f32) as u16,
        )
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn set_servo(
    state: tauri::State<'_, AppState>,
    instance: u8,
    pwm_us: u16,
) -> Result<(), String> {
    ensure_live_write_allowed(state.inner(), OperationId::SetServo).await?;
    with_vehicle(&state)
        .await?
        .ardupilot()
        .set_servo(instance, pwm_us)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn rc_override(
    state: tauri::State<'_, AppState>,
    channels: Vec<RcOverrideChannelWire>,
) -> Result<(), String> {
    ensure_live_write_allowed(state.inner(), OperationId::RcOverride).await?;
    let mut overrides = RcOverride::new();
    for channel in channels {
        let value = RcOverrideChannelValue::try_from(channel.value).map_err(|e| e.to_string())?;
        overrides
            .set(channel.channel, value)
            .map_err(|e| e.to_string())?;
    }

    with_vehicle(&state)
        .await?
        .rc_override(overrides)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn calibrate_compass_start(
    state: tauri::State<'_, AppState>,
    compass_mask: u8,
) -> Result<(), String> {
    ensure_live_write_allowed(state.inner(), OperationId::CalibrateCompassStart).await?;
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
    ensure_live_write_allowed(state.inner(), OperationId::CalibrateCompassAccept).await?;
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
    ensure_live_write_allowed(state.inner(), OperationId::CalibrateCompassCancel).await?;
    with_vehicle(&state)
        .await?
        .ardupilot()
        .cancel_mag_cal()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn request_prearm_checks(state: tauri::State<'_, AppState>) -> Result<(), String> {
    ensure_live_write_allowed(state.inner(), OperationId::RequestPrearmChecks).await?;
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
    app: tauri::AppHandle,
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

        let mut snapshot = state.live_runtime.with_runtime(|runtime| {
            runtime
                .session_runtime_mut()
                .open_session_snapshot(source_kind)
        });

        snapshot.guided = crate::ipc::guided::GuidedRuntime::snapshot_playback();
        hydrate_playback_snapshot(&mut snapshot, store.playback_frame());
        let playback_state = state.playback_runtime.prepare_ready(store, false).await;
        crate::logs::emit_playback_state_snapshot(&app, &snapshot.envelope, &playback_state);
        return Ok(snapshot);
    }

    let envelope = {
        state.live_runtime.with_runtime(|runtime| {
            runtime
                .session_runtime_mut()
                .open_session_snapshot(source_kind)
                .envelope
        })
    };

    Ok(build_live_snapshot(state.inner(), envelope, DomainProvenance::Bootstrap).await)
}

#[cfg(test)]
mod tests {
    use super::*;

    use crate::ipc::{OperationFailure, ReasonKind, VehicleState};
    use mavkit::SystemStatus;

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

    fn app_state_for_tests() -> AppState {
        AppState {
            live_runtime: ironwing_core::live_runtime::SharedLiveRuntime::new(
                ironwing_core::live_runtime::LiveVehicleRuntime::new(
                    crate::tauri_event_sink::TauriEventSink::default(),
                ),
            ),
            active_link_target: tokio::sync::Mutex::new(None),
            connect_abort: tokio::sync::Mutex::new(None),
            background_tasks: tokio::sync::Mutex::new(Vec::new()),
            background_listeners: tokio::sync::Mutex::new(Vec::new()),
            log_store: tokio::sync::Mutex::new(None),
            cached_library_store: tokio::sync::Mutex::new(None),
            log_operation: crate::logs::LogOperationState::new(),
            playback_runtime: crate::logs::PlaybackRuntimeState::new(),
            recorder: crate::recording::TlogRecorderHandle::new(),
            firmware_session: crate::firmware::types::FirmwareSessionHandle::new(),
            firmware_abort: tokio::sync::Mutex::new(None),
            firmware_cancel_requested: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(
                false,
            )),
            param_download_abort: tokio::sync::Mutex::new(None),
            mission_op_cancel: tokio::sync::Mutex::new(None),
            guided_runtime: tokio::sync::Mutex::new(crate::ipc::GuidedRuntime::default()),
            remote_ui_events: crate::remote_ui::event_channel(),
        }
    }

    #[test]
    fn playback_stop_restores_live_telemetry() {
        let mut runtime = crate::session_runtime::SessionRuntime::new();
        let live = runtime.open_session_snapshot(SourceKind::Live);
        assert!(matches!(
            runtime.ack_session_snapshot(
                &live.envelope.session_id,
                live.envelope.seek_epoch,
                live.envelope.reset_revision
            ),
            AckSessionSnapshotResult::Accepted { .. }
        ));

        let playback = runtime.open_session_snapshot(SourceKind::Playback);
        assert!(matches!(
            runtime.ack_session_snapshot(
                &playback.envelope.session_id,
                playback.envelope.seek_epoch,
                playback.envelope.reset_revision
            ),
            AckSessionSnapshotResult::Accepted { .. }
        ));

        let mut session_context = crate::bridges::SessionContext::new();
        session_context.connection = SessionConnection::Connected;
        session_context.vehicle_state = Some(VehicleState {
            armed: true,
            custom_mode: 4,
            mode_name: "GUIDED".into(),
            system_status: SystemStatus::Active,
            vehicle_type: Default::default(),
            autopilot: Default::default(),
            system_id: 1,
            component_id: 1,
            heartbeat_received: true,
        });
        session_context.home_position = Some(HomePosition {
            latitude_deg: 47.397742,
            longitude_deg: 8.545594,
            altitude_m: 488.0,
        });
        let live_telemetry = crate::ipc::telemetry_snapshot_from_value(
            &serde_json::json!({
                "latitude_deg": 47.397742,
                "longitude_deg": 8.545594,
                "altitude_m": 515.5,
                "speed_mps": 12.3,
                "heading_deg": 180.0,
                "battery_pct": 84.0,
            }),
            DomainProvenance::Stream,
        );
        let status_entries = vec![StatusTextEntry {
            sequence: 7,
            text: "Live telemetry resumed".into(),
            severity: "info".into(),
            timestamp_usec: Some(42),
        }];

        let envelope = runtime.close_playback_session().expect("live envelope");
        let snapshot = live_snapshot_from_caches(
            envelope.clone(),
            &session_context,
            &live_telemetry,
            &status_entries,
            true,
            DomainProvenance::Stream,
        );

        assert_eq!(runtime.effective_source_kind(), SourceKind::Live);
        assert_eq!(snapshot.envelope, envelope);
        assert_eq!(
            snapshot.session.value.expect("session").connection,
            SessionConnection::Connected
        );
        assert_eq!(
            snapshot
                .telemetry
                .value
                .expect("telemetry")
                .navigation
                .latitude_deg,
            Some(47.397742)
        );
        assert!(
            snapshot
                .support
                .value
                .expect("support")
                .can_request_prearm_checks
        );
        assert_eq!(
            snapshot.status_text.value.expect("status text").entries,
            status_entries
        );
    }

    #[tokio::test]
    async fn playback_rejects_write_commands() {
        let state = app_state_for_tests();
        {
            let live = state.live_runtime.with_runtime(|runtime| {
                runtime
                    .session_runtime_mut()
                    .open_session_snapshot(SourceKind::Live)
            });
            assert!(matches!(
                state
                    .live_runtime
                    .with_runtime(|runtime| runtime.ack_session_snapshot(
                        &live.envelope.session_id,
                        live.envelope.seek_epoch,
                        live.envelope.reset_revision
                    )),
                AckSessionSnapshotResult::Accepted { .. }
            ));
            let playback = state.live_runtime.with_runtime(|runtime| {
                runtime
                    .session_runtime_mut()
                    .open_session_snapshot(SourceKind::Playback)
            });
            assert!(matches!(
                state
                    .live_runtime
                    .with_runtime(|runtime| runtime.ack_session_snapshot(
                        &playback.envelope.session_id,
                        playback.envelope.seek_epoch,
                        playback.envelope.reset_revision
                    )),
                AckSessionSnapshotResult::Accepted { .. }
            ));
        }

        let mission_failure: OperationFailure = serde_json::from_str(
            &ensure_live_write_allowed(&state, OperationId::MissionUpload)
                .await
                .expect_err("mission upload should be blocked"),
        )
        .expect("deserialize mission failure");
        assert_eq!(mission_failure.operation_id, OperationId::MissionUpload);
        assert_eq!(mission_failure.reason.kind, ReasonKind::PermissionDenied);

        let param_failure: OperationFailure = serde_json::from_str(
            &ensure_live_write_allowed(&state, OperationId::ParamWrite)
                .await
                .expect_err("param write should be blocked"),
        )
        .expect("deserialize param failure");
        assert_eq!(param_failure.operation_id, OperationId::ParamWrite);
        assert_eq!(param_failure.reason.kind, ReasonKind::PermissionDenied);

        let firmware_failure: OperationFailure = serde_json::from_str(
            &ensure_live_write_allowed(&state, OperationId::FirmwareFlashSerial)
                .await
                .expect_err("firmware flashing should be blocked"),
        )
        .expect("deserialize firmware failure");
        assert_eq!(
            firmware_failure.operation_id,
            OperationId::FirmwareFlashSerial
        );
        assert_eq!(firmware_failure.reason.kind, ReasonKind::PermissionDenied);

        let source_kind = state
            .live_runtime
            .with_runtime(|runtime| runtime.guided_source_kind());
        let guided_failure = state
            .guided_runtime
            .lock()
            .await
            .reserve_start(
                source_kind,
                GuidedLiveContext {
                    has_live_vehicle: true,
                    is_armed: true,
                    in_guided_mode: true,
                },
                crate::ipc::GuidedSession::Goto {
                    latitude_deg: 47.1,
                    longitude_deg: 8.5,
                    altitude_m: 25.0,
                },
            )
            .expect_err("guided start should be blocked");
        assert_eq!(guided_failure.operation_id, OperationId::StartGuidedSession);
        assert_eq!(guided_failure.reason.kind, ReasonKind::Unavailable);
        assert_eq!(
            guided_failure.detail,
            Some(crate::ipc::guided::GuidedFailureDetail::SourceKind {
                source_kind: SourceKind::Playback,
            })
        );
    }
}

#[tauri::command]
pub(crate) async fn ack_session_snapshot(
    state: tauri::State<'_, AppState>,
    session_id: String,
    seek_epoch: u64,
    reset_revision: u64,
) -> Result<AckSessionSnapshotResult, String> {
    Ok(state.live_runtime.with_runtime(|runtime| {
        runtime.ack_session_snapshot(&session_id, seek_epoch, reset_revision)
    }))
}
