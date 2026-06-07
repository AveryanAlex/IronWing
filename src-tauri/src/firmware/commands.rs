use serde::Deserialize;
use std::sync::atomic::Ordering;
use tauri::Manager;

use ironwing_core::event_names;

use crate::AppState;
use crate::FirmwareAbortHandle;
use crate::connection;
use crate::connection::ActiveLinkTarget;
use crate::e2e_emit::emit_event;
use crate::firmware::artifact;
use crate::firmware::catalog::{
    fetch_supported_official_bootloader_targets_with_cache,
    resolve_supported_official_bootloader_url,
};
use crate::firmware::dfu_recovery::{self, DfuRecoveryResult};
use crate::firmware::discovery;
use crate::firmware::serial_executor::{self, PreflightSnapshot};
use crate::firmware::types::{
    BOOTLOADER_INSTALLATION_PATH, DfuDeviceInfo, DfuRecoveryPhase, DfuRecoverySource,
    FIRMWARE_INSTALL_UPDATE_PATH, FirmwareBootloaderBoardInfo, FirmwareError,
    FirmwareInstallBootloaderStatus, FirmwareProgress, FirmwareRebootToBootloaderResult,
    FirmwareSessionStatus, InventoryResult, PortInfo, SerialFlashOptions, SerialFlashPhase,
    SerialFlashSource, SerialFlowResult, SerialPreflightInfo, SerialReadiness,
    SerialReadinessBlockedReason, SerialReadinessRequest, SerialReadinessResponse,
};
use crate::helpers::ensure_live_write_allowed;
use crate::ipc::OperationId;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SessionCancelAction {
    AbortPretransfer,
    MarkCancelling,
    Ignore,
}

fn dfu_phase_label(phase: DfuRecoveryPhase) -> &'static str {
    match phase {
        DfuRecoveryPhase::Idle => "idle",
        DfuRecoveryPhase::Detecting => "detecting",
        DfuRecoveryPhase::Downloading => "downloading",
        DfuRecoveryPhase::Erasing => "erasing",
        DfuRecoveryPhase::Verifying => "verifying",
        DfuRecoveryPhase::ManifestingOrResetting => "manifesting_or_resetting",
    }
}

fn serial_phase_from_label(label: &str) -> Option<SerialFlashPhase> {
    match label {
        "probing" => Some(SerialFlashPhase::Probing),
        "erasing" | "extf_erasing" => Some(SerialFlashPhase::Erasing),
        "programming" | "extf_programming" => Some(SerialFlashPhase::Programming),
        "verifying" | "extf_verifying" => Some(SerialFlashPhase::Verifying),
        "rebooting" => Some(SerialFlashPhase::Rebooting),
        _ => None,
    }
}

fn emit_dfu_progress(
    app: &tauri::AppHandle,
    phase: DfuRecoveryPhase,
    bytes_written: usize,
    bytes_total: usize,
) {
    let pct = if bytes_total > 0 {
        (bytes_written as f32 / bytes_total as f32) * 100.0
    } else {
        0.0
    };

    emit_event(
        app,
        event_names::FIRMWARE_PROGRESS,
        &FirmwareProgress {
            phase_label: dfu_phase_label(phase).into(),
            bytes_written: bytes_written as u64,
            bytes_total: bytes_total as u64,
            pct,
        },
    );
}

fn report_dfu_phase(
    app: &tauri::AppHandle,
    session: &crate::firmware::types::FirmwareSessionHandle,
    phase: DfuRecoveryPhase,
) {
    session.set_bootloader_installation_phase(phase);
    emit_dfu_progress(app, phase, 0, 0);
}

#[derive(Deserialize)]
pub(crate) struct SerialFlashRequest {
    port: String,
    baud: u32,
    source: SerialFlashSource,
    options: Option<SerialFlashOptions>,
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub(crate) async fn firmware_install_update(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    request: SerialFlashRequest,
) -> Result<SerialFlowResult, String> {
    ensure_live_write_allowed(state.inner(), OperationId::FirmwareInstallUpdate).await?;
    let SerialFlashRequest {
        port,
        baud,
        source,
        options,
    } = request;

    let options = normalize_serial_options(options)?;

    state
        .firmware_session
        .try_start_firmware_install_update()
        .map_err(|e| e.to_string())?;

    let readiness_request = SerialReadinessRequest {
        port: port.clone(),
        source: source.clone(),
        options: Some(options.clone()),
    };
    let available_ports = match crate::firmware::discovery::list_firmware_ports() {
        InventoryResult::Available { ports } => ports,
        InventoryResult::Unsupported => Vec::new(),
    };

    if let Err(err) = validate_started_serial_flash_request(&readiness_request, &available_ports) {
        finish_serial_session_failed(&state, err.clone());
        return Err(err);
    }

    if cancellation_signal(&state) {
        let result = SerialFlowResult::Cancelled;
        finish_serial_session(&state, &result);
        return Ok(result);
    }

    let active_link_target = connection::active_link_target(&state).await;
    if selected_port_has_active_serial_link(active_link_target.as_ref(), &port) {
        let err = "selected serial port has an active MAVLink connection; reboot to bootloader before starting install".to_string();
        finish_serial_session_failed(&state, err.clone());
        return Err(err);
    }

    let apj_bytes = match resolve_source_with_cancellation(&state, source).await {
        Ok(bytes) => bytes,
        Err(ResolveSerialSourceError::Cancelled) => {
            let result = SerialFlowResult::Cancelled;
            finish_serial_session(&state, &result);
            return Ok(result);
        }
        Err(ResolveSerialSourceError::Failed(err)) => {
            finish_serial_session_failed(&state, err.clone());
            return Err(err);
        }
    };

    if cancellation_signal(&state) {
        let result = SerialFlowResult::Cancelled;
        finish_serial_session(&state, &result);
        return Ok(result);
    }

    let artifact = match artifact::parse_apj(&apj_bytes).map_err(|e| e.to_string()) {
        Ok(artifact) => artifact,
        Err(err) => {
            finish_serial_session_failed(&state, err.clone());
            return Err(err);
        }
    };

    let preflight = capture_preflight(&port, baud);

    if cancellation_signal(&state) {
        let result = SerialFlowResult::Cancelled;
        finish_serial_session(&state, &result);
        return Ok(result);
    }

    if cancellation_requested(&state.firmware_session.status()) || cancellation_signal(&state) {
        let result = SerialFlowResult::Cancelled;
        finish_serial_session(&state, &result);
        return Ok(result);
    }

    let (task, abort_handle) = {
        let handle = tokio::task::spawn_blocking({
            let app = app.clone();
            let firmware_session = state.firmware_session.clone();
            let preflight = preflight.clone();
            let artifact = artifact.clone();
            let cancel_requested = state.firmware_cancel_requested.clone();
            move || {
                firmware_session.set_firmware_install_update_phase(SerialFlashPhase::Probing);
                let deps = serial_executor::RealSerialDeps;
                serial_executor::execute_serial_flash_with_options(
                    &deps,
                    &preflight,
                    &artifact,
                    &options,
                    &|| cancel_requested.load(Ordering::SeqCst),
                    |phase, written, total| {
                        if let Some(serial_phase) = serial_phase_from_label(phase) {
                            firmware_session.set_firmware_install_update_phase(serial_phase);
                        }
                        let pct = if total > 0 {
                            (written as f32 / total as f32) * 100.0
                        } else {
                            0.0
                        };
                        emit_event(
                            &app,
                            event_names::FIRMWARE_PROGRESS,
                            &FirmwareProgress {
                                phase_label: phase.into(),
                                bytes_written: written as u64,
                                bytes_total: total as u64,
                                pct,
                            },
                        );
                    },
                )
            }
        });
        let abort = handle.abort_handle();
        (handle, abort)
    };

    *state.firmware_abort.lock().await = Some(FirmwareAbortHandle::Cooperative {
        _handle: abort_handle,
    });

    let result = task.await.unwrap_or_else(|e| {
        if e.is_cancelled() {
            SerialFlowResult::Cancelled
        } else {
            SerialFlowResult::Failed {
                reason: format!("flash task panicked: {e}"),
            }
        }
    });

    *state.firmware_abort.lock().await = None;
    finish_serial_session(&state, &result);
    Ok(result)
}

#[cfg(target_os = "android")]
#[tauri::command]
pub(crate) async fn firmware_install_update(
    state: tauri::State<'_, AppState>,
    _app: tauri::AppHandle,
    _request: SerialFlashRequest,
) -> Result<SerialFlowResult, String> {
    ensure_live_write_allowed(state.inner(), OperationId::FirmwareInstallUpdate).await?;
    Err(crate::firmware::types::FirmwareError::PlatformUnsupported.to_string())
}

#[tauri::command]
pub(crate) async fn firmware_install_update_preflight(
    state: tauri::State<'_, AppState>,
) -> Result<SerialPreflightInfo, String> {
    let vehicle_connected = connection::is_vehicle_connected(&state).await;

    let param_count = if vehicle_connected {
        state
            .live_runtime
            .with_runtime(|runtime| runtime.vehicle())
            .and_then(|v| {
                v.params()
                    .latest()
                    .and_then(|s| s.store)
                    .map(|store| store.params.len() as u32)
            })
            .unwrap_or(0)
    } else {
        0
    };

    let available_ports = match crate::firmware::discovery::list_firmware_ports() {
        InventoryResult::Available { ports } => ports,
        _ => vec![],
    };

    let session_status = state.firmware_session.status();
    let session_ready = matches!(session_status, FirmwareSessionStatus::Idle);

    Ok(SerialPreflightInfo {
        vehicle_connected,
        param_count,
        has_params_to_backup: param_count > 0,
        available_ports,
        session_ready,
        session_status,
    })
}

#[tauri::command]
pub(crate) fn firmware_session_status(state: tauri::State<'_, AppState>) -> FirmwareSessionStatus {
    state.firmware_session.status()
}

#[tauri::command]
pub(crate) fn firmware_session_clear_completed(state: tauri::State<'_, AppState>) {
    state.firmware_session.clear_completed();
}

#[tauri::command]
pub(crate) async fn firmware_session_cancel(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    match classify_session_cancel_action(
        &state.firmware_session.status(),
        state.firmware_abort.lock().await.is_some(),
    ) {
        SessionCancelAction::AbortPretransfer => {
            state
                .firmware_cancel_requested
                .store(true, Ordering::SeqCst);
            state.firmware_session.mark_cancelling();
            if let Some(FirmwareAbortHandle::SafeToAbort { handle }) =
                state.firmware_abort.lock().await.as_ref()
            {
                handle.abort();
            }
        }
        SessionCancelAction::MarkCancelling => {
            state
                .firmware_cancel_requested
                .store(true, Ordering::SeqCst);
            state.firmware_session.mark_cancelling();
        }
        SessionCancelAction::Ignore => {}
    }

    Ok(())
}

#[tauri::command]
pub(crate) async fn firmware_install_update_readiness(
    state: tauri::State<'_, AppState>,
    request: SerialReadinessRequest,
) -> Result<SerialReadinessResponse, String> {
    let available_ports = match crate::firmware::discovery::list_firmware_ports() {
        InventoryResult::Available { ports } => ports,
        InventoryResult::Unsupported => Vec::new(),
    };

    let session_status = state.firmware_session.status();
    let active_link_target = connection::active_link_target(&state).await;
    let blocked_reason =
        serial_readiness_blocked_reason(&request, &available_ports, &session_status);
    let readiness = serial_readiness(blocked_reason);
    let bootloader_status =
        serial_bootloader_status(&request.port, &available_ports, active_link_target.as_ref());

    Ok(SerialReadinessResponse {
        request_token: serial_readiness_request_token(&request),
        session_status,
        readiness,
        bootloader_status,
    })
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub(crate) async fn firmware_reboot_to_bootloader(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    port: String,
) -> Result<FirmwareRebootToBootloaderResult, String> {
    if let Err(error) =
        ensure_live_write_allowed(state.inner(), OperationId::FirmwareInstallUpdate).await
    {
        return Ok(FirmwareRebootToBootloaderResult::Failed { error });
    }

    let selected_port = port.trim();
    if selected_port.is_empty() {
        return Ok(FirmwareRebootToBootloaderResult::Unsupported {
            reason: "choose a serial port before requesting bootloader reboot".into(),
        });
    }

    if !connection::is_vehicle_connected(&state).await
        || !selected_port_has_active_serial_link(
            connection::active_link_target(&state).await.as_ref(),
            selected_port,
        )
    {
        return Ok(FirmwareRebootToBootloaderResult::Unsupported {
            reason: "reboot is only available for the active live serial link on the selected port"
                .into(),
        });
    }

    let Some(vehicle) = state.live_runtime.with_runtime(|runtime| runtime.vehicle()) else {
        return Ok(FirmwareRebootToBootloaderResult::Failed {
            error: "active live vehicle runtime is unavailable".into(),
        });
    };

    if let Err(error) = vehicle.ardupilot().reboot_to_bootloader().await {
        return Ok(FirmwareRebootToBootloaderResult::Failed {
            error: error.to_string(),
        });
    }

    if let Err(error) = connection::force_disconnect(&state, &app).await {
        return Ok(FirmwareRebootToBootloaderResult::Failed {
            error: error.to_string(),
        });
    }

    Ok(FirmwareRebootToBootloaderResult::Requested)
}

#[cfg(target_os = "android")]
#[tauri::command]
pub(crate) async fn firmware_reboot_to_bootloader(
    _state: tauri::State<'_, AppState>,
    _app: tauri::AppHandle,
    _port: String,
) -> Result<FirmwareRebootToBootloaderResult, String> {
    Ok(FirmwareRebootToBootloaderResult::Unsupported {
        reason: "firmware serial reboot is not supported on this platform".into(),
    })
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub(crate) async fn firmware_detect_bootloader_board(
    state: tauri::State<'_, AppState>,
    port: String,
) -> Result<FirmwareBootloaderBoardInfo, String> {
    let selected_port = port.trim().to_string();
    validate_bootloader_board_detection_target(
        &selected_port,
        connection::active_link_target(&state).await.as_ref(),
    )?;

    tokio::task::spawn_blocking(move || {
        let deps = serial_executor::RealSerialDeps;
        serial_executor::detect_bootloader_board(&deps, &selected_port, &|| false)
            .map(|(_io, info)| serial_executor::build_bootloader_board_info(&selected_port, &info))
            .map_err(|error| bootloader_board_detection_error(&selected_port, error))
    })
    .await
    .unwrap_or_else(|error| Err(format!("bootloader board detection task failed: {error}")))
}

#[cfg(target_os = "android")]
#[tauri::command]
pub(crate) async fn firmware_detect_bootloader_board(
    _port: String,
) -> Result<FirmwareBootloaderBoardInfo, String> {
    Err(crate::firmware::types::FirmwareError::PlatformUnsupported.to_string())
}

pub(crate) fn serial_readiness_request_token(request: &SerialReadinessRequest) -> String {
    let full_chip_erase = request
        .options
        .as_ref()
        .is_some_and(|options| options.full_chip_erase);
    let (source_kind, source_identity) = serial_readiness_source_identity(&request.source);

    format!(
        "firmware-install-readiness:port={}:source_kind={source_kind}:source_identity={source_identity}:full_chip_erase={}",
        request.port,
        u8::from(full_chip_erase),
    )
}

fn serial_readiness_source_identity(source: &SerialFlashSource) -> (&'static str, String) {
    match source {
        SerialFlashSource::CatalogUrl { url } => (
            "catalog_url",
            serial_readiness_content_identity(url.as_bytes()),
        ),
        SerialFlashSource::LocalApjBytes { data } => {
            ("local_apj_bytes", serial_readiness_content_identity(data))
        }
    }
}

fn serial_readiness_content_identity(bytes: &[u8]) -> String {
    format!(
        "{}-{:016x}",
        bytes.len(),
        serial_readiness_request_digest(bytes)
    )
}

fn serial_readiness_request_digest(bytes: &[u8]) -> u64 {
    let mut hash = 0xcbf29ce484222325u64;
    for &byte in bytes {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

fn serial_readiness(blocked_reason: Option<SerialReadinessBlockedReason>) -> SerialReadiness {
    match blocked_reason {
        None => SerialReadiness::Advisory,
        Some(reason) => SerialReadiness::Blocked { reason },
    }
}

fn selected_port_has_active_serial_link(
    active_link_target: Option<&ActiveLinkTarget>,
    selected_port: &str,
) -> bool {
    matches!(
        active_link_target,
        Some(ActiveLinkTarget::Serial { port }) if port == selected_port
    )
}

fn bootloader_board_detection_error(port: &str, error: FirmwareError) -> String {
    match error {
        FirmwareError::Timeout { .. }
        | FirmwareError::BootloaderSyncMismatch { .. }
        | FirmwareError::ProtocolError { .. }
        | FirmwareError::IoTransient { .. } => {
            format!("no ArduPilot bootloader responded on {port}: {error}")
        }
        other => other.to_string(),
    }
}

fn validate_bootloader_board_detection_target(
    selected_port: &str,
    active_link_target: Option<&ActiveLinkTarget>,
) -> Result<(), String> {
    if selected_port.trim().is_empty() {
        return Err("serial port not selected".into());
    }

    if selected_port_has_active_serial_link(active_link_target, selected_port) {
        return Err("selected serial port has an active MAVLink connection; reboot to bootloader before autodetecting the board".into());
    }

    Ok(())
}

fn serial_bootloader_status(
    selected_port: &str,
    available_ports: &[crate::firmware::types::PortInfo],
    active_link_target: Option<&ActiveLinkTarget>,
) -> FirmwareInstallBootloaderStatus {
    let selected_port_info = available_ports
        .iter()
        .find(|candidate| candidate.port_name == selected_port);

    if selected_port_info.is_some_and(crate::firmware::discovery::is_authoritative_bootloader_port)
    {
        return FirmwareInstallBootloaderStatus::AlreadyInBootloader;
    }

    if selected_port_has_active_serial_link(active_link_target, selected_port) {
        return FirmwareInstallBootloaderStatus::NotInBootloader { can_reboot: true };
    }

    FirmwareInstallBootloaderStatus::Unknown
}

pub(crate) fn normalize_serial_options(
    options: Option<SerialFlashOptions>,
) -> Result<SerialFlashOptions, String> {
    let resolved = options.unwrap_or(SerialFlashOptions {
        full_chip_erase: false,
    });

    Ok(resolved)
}

fn is_serial_source_ready(source: &SerialFlashSource) -> bool {
    match source {
        SerialFlashSource::CatalogUrl { url } => !url.trim().is_empty(),
        SerialFlashSource::LocalApjBytes { data } => !data.is_empty(),
    }
}

pub(crate) fn evaluate_serial_readiness(
    request: &SerialReadinessRequest,
    available_ports: &[crate::firmware::types::PortInfo],
    session_status: &FirmwareSessionStatus,
) -> bool {
    serial_readiness_blocked_reason(request, available_ports, session_status).is_none()
}

fn validate_started_serial_flash_request(
    request: &SerialReadinessRequest,
    available_ports: &[PortInfo],
) -> Result<(), String> {
    if request.port.trim().is_empty() {
        return Err("serial port not selected".into());
    }
    if !available_ports.iter().any(|p| p.port_name == request.port) {
        return Err("serial port not found".into());
    }
    if !is_serial_source_ready(&request.source) {
        return Err("firmware source missing".into());
    }
    Ok(())
}

fn with_serial_flash_start_guard<T, F>(
    request: &SerialReadinessRequest,
    available_ports: &[PortInfo],
    session_status: &FirmwareSessionStatus,
    proceed: F,
) -> Result<T, String>
where
    F: FnOnce() -> Result<T, String>,
{
    if let Some(blocked_reason) =
        serial_readiness_blocked_reason(request, available_ports, session_status)
    {
        return Err(serial_readiness_blocked_error(
            &blocked_reason,
            session_status,
        ));
    }

    proceed()
}

fn serial_readiness_blocked_error(
    blocked_reason: &SerialReadinessBlockedReason,
    session_status: &FirmwareSessionStatus,
) -> String {
    match blocked_reason {
        SerialReadinessBlockedReason::SessionBusy => match session_status {
            FirmwareSessionStatus::FirmwareInstallUpdate { .. } => {
                format!("firmware session already active: {FIRMWARE_INSTALL_UPDATE_PATH}")
            }
            FirmwareSessionStatus::BootloaderInstallation { .. } => {
                format!("firmware session already active: {BOOTLOADER_INSTALLATION_PATH}")
            }
            FirmwareSessionStatus::Cancelling { .. } => {
                "firmware session already active: cancelling".into()
            }
            FirmwareSessionStatus::Completed { .. } | FirmwareSessionStatus::Idle => {
                "firmware session already active".into()
            }
        },
        SerialReadinessBlockedReason::PortUnselected => "serial port not selected".into(),
        SerialReadinessBlockedReason::PortUnavailable => "serial port not found".into(),
        SerialReadinessBlockedReason::SourceMissing => "firmware source missing".into(),
    }
}

fn serial_readiness_blocked_reason(
    request: &SerialReadinessRequest,
    available_ports: &[crate::firmware::types::PortInfo],
    session_status: &FirmwareSessionStatus,
) -> Option<SerialReadinessBlockedReason> {
    if !matches!(
        session_status,
        FirmwareSessionStatus::Idle | FirmwareSessionStatus::Completed { .. }
    ) {
        return Some(SerialReadinessBlockedReason::SessionBusy);
    }
    if request.port.trim().is_empty() {
        return Some(SerialReadinessBlockedReason::PortUnselected);
    }
    if !available_ports.iter().any(|p| p.port_name == request.port) {
        return Some(SerialReadinessBlockedReason::PortUnavailable);
    }
    if !is_serial_source_ready(&request.source) {
        return Some(SerialReadinessBlockedReason::SourceMissing);
    }
    None
}

fn cancellation_requested(status: &FirmwareSessionStatus) -> bool {
    matches!(status, FirmwareSessionStatus::Cancelling { .. })
}

fn classify_session_cancel_action(
    status: &FirmwareSessionStatus,
    has_abort_handle: bool,
) -> SessionCancelAction {
    if has_abort_handle {
        return SessionCancelAction::AbortPretransfer;
    }

    match status {
        FirmwareSessionStatus::FirmwareInstallUpdate { .. }
        | FirmwareSessionStatus::BootloaderInstallation { .. }
        | FirmwareSessionStatus::Cancelling { .. } => SessionCancelAction::MarkCancelling,
        FirmwareSessionStatus::Idle | FirmwareSessionStatus::Completed { .. } => {
            SessionCancelAction::Ignore
        }
    }
}

fn cancellation_signal(state: &tauri::State<'_, AppState>) -> bool {
    state.firmware_cancel_requested.load(Ordering::SeqCst)
}

fn reset_firmware_cancellation(state: &tauri::State<'_, AppState>) {
    state
        .firmware_cancel_requested
        .store(false, Ordering::SeqCst);
}

fn finish_serial_session(state: &tauri::State<'_, AppState>, result: &SerialFlowResult) {
    reset_firmware_cancellation(state);
    state.firmware_session.complete(
        crate::firmware::types::FirmwareOutcome::FirmwareInstallUpdate {
            outcome: result.to_outcome(),
        },
    );
}

fn finish_dfu_session(state: &tauri::State<'_, AppState>, result: &DfuRecoveryResult) {
    reset_firmware_cancellation(state);
    state.firmware_session.complete(
        crate::firmware::types::FirmwareOutcome::BootloaderInstallation {
            outcome: result.to_outcome(),
        },
    );
}

fn finish_serial_session_failed(state: &tauri::State<'_, AppState>, reason: String) {
    reset_firmware_cancellation(state);
    state.firmware_session.complete(
        crate::firmware::types::FirmwareOutcome::FirmwareInstallUpdate {
            outcome: crate::firmware::types::SerialFlashOutcome::Failed { reason },
        },
    );
}

fn capture_preflight(port: &str, baud: u32) -> PreflightSnapshot {
    PreflightSnapshot {
        port: port.to_string(),
        baud,
        ports_before: Vec::new(),
    }
}

// ── DFU recovery command (separate from serial) ──

#[derive(Deserialize)]
pub(crate) struct DfuFlashRequest {
    device: DfuDeviceInfo,
    source: DfuRecoverySource,
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub(crate) async fn firmware_bootloader_installation(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    request: DfuFlashRequest,
) -> Result<DfuRecoveryResult, String> {
    ensure_live_write_allowed(state.inner(), OperationId::FirmwareBootloaderInstallation).await?;
    state
        .firmware_session
        .try_start_bootloader_installation(connection::is_vehicle_connected(&state).await)
        .map_err(|e| e.to_string())?;

    let request = match validate_selected_dfu_request(request) {
        Ok(request) => request,
        Err(err) => {
            let result = classify_dfu_pretransfer_error(&err);
            finish_dfu_session(&state, &result);
            return Ok(result);
        }
    };
    let bootloader_cache_dir = app
        .path()
        .app_cache_dir()
        .unwrap_or_else(|_| std::env::temp_dir())
        .join("firmware_catalog")
        .join("bootloader_index");

    if cancellation_signal(&state) {
        let result = DfuRecoveryResult::Cancelled;
        finish_dfu_session(&state, &result);
        return Ok(result);
    }

    let bin_data =
        match resolve_dfu_source_with_cancellation(&state, request.source, bootloader_cache_dir)
            .await
        {
            Ok(bin) => bin,
            Err(ResolveDfuSourceError::Cancelled) => {
                let result = DfuRecoveryResult::Cancelled;
                finish_dfu_session(&state, &result);
                return Ok(result);
            }
            Err(ResolveDfuSourceError::Failed(err)) => {
                let result = classify_dfu_pretransfer_error(&err);
                finish_dfu_session(&state, &result);
                return Ok(result);
            }
        };

    if cancellation_signal(&state) {
        let result = DfuRecoveryResult::Cancelled;
        finish_dfu_session(&state, &result);
        return Ok(result);
    }

    let recovery_artifact = match artifact::validate_recovery_bin(&bin_data) {
        Ok(artifact) => artifact,
        Err(err) => {
            let result = classify_dfu_pretransfer_error(&map_dfu_validation_error(err));
            finish_dfu_session(&state, &result);
            return Ok(result);
        }
    };

    if cancellation_signal(&state) {
        let result = DfuRecoveryResult::Cancelled;
        finish_dfu_session(&state, &result);
        return Ok(result);
    }

    let mut usb = dfu_recovery::NusbDfuAccess::new();
    let cancel_requested = state.firmware_cancel_requested.clone();
    let result = dfu_recovery::execute_async_dfu_recovery_with_phases(
        &mut usb,
        &request.device,
        &recovery_artifact.image,
        &|| cancel_requested.load(Ordering::SeqCst),
        |phase| report_dfu_phase(&app, &state.firmware_session, phase),
        |written, total| emit_dfu_progress(&app, DfuRecoveryPhase::Downloading, written, total),
    )
    .await;

    finish_dfu_session(&state, &result);
    Ok(result)
}

#[cfg(target_os = "android")]
#[tauri::command]
pub(crate) async fn firmware_bootloader_installation(
    state: tauri::State<'_, AppState>,
    _app: tauri::AppHandle,
    _request: DfuFlashRequest,
) -> Result<DfuRecoveryResult, String> {
    ensure_live_write_allowed(state.inner(), OperationId::FirmwareBootloaderInstallation).await?;
    Ok(DfuRecoveryResult::PlatformUnsupported)
}

#[cfg(not(target_os = "android"))]
async fn resolve_source(source: SerialFlashSource) -> Result<Vec<u8>, String> {
    match source {
        SerialFlashSource::LocalApjBytes { data } => Ok(data),
        SerialFlashSource::CatalogUrl { url } => download_url(url).await.map_err(|e| e.to_string()),
    }
}

#[cfg(not(target_os = "android"))]
async fn resolve_dfu_source(
    source: DfuRecoverySource,
    bootloader_cache_dir: std::path::PathBuf,
) -> Result<Vec<u8>, FirmwareError> {
    match source {
        DfuRecoverySource::LocalBinBytes { data } => Ok(data),
        DfuRecoverySource::LocalApjBytes { data } => apj_to_dfu_bin(&data),
        DfuRecoverySource::OfficialBootloader { board_target } => {
            let url = tokio::task::spawn_blocking(move || {
                let supported = fetch_supported_official_bootloader_targets_with_cache(
                    bootloader_cache_dir,
                    crate::firmware::catalog::fetch_bootloader_index_listing,
                )?;
                resolve_supported_official_bootloader_url(&board_target, &supported)
            })
            .await
            .map_err(|e| FirmwareError::ProtocolError {
                detail: format!("bootloader resolution task failed: {e}"),
            })??;
            download_url(url).await
        }
    }
}

pub(crate) fn apj_to_dfu_bin(apj_bytes: &[u8]) -> Result<Vec<u8>, FirmwareError> {
    ironwing_firmware::dfu_flow::apj_to_dfu_bin(apj_bytes)
}

#[cfg(not(target_os = "android"))]
async fn download_url(url: String) -> Result<Vec<u8>, FirmwareError> {
    tokio::task::spawn_blocking(move || {
        let response = ureq::get(&url)
            .call()
            .map_err(|e| FirmwareError::CatalogUnavailable {
                reason: format!("catalog download failed: {e}"),
            })?;
        response
            .into_body()
            .read_to_vec()
            .map_err(|e| FirmwareError::CatalogUnavailable {
                reason: format!("catalog read failed: {e}"),
            })
    })
    .await
    .map_err(|e| FirmwareError::ProtocolError {
        detail: format!("download task failed: {e}"),
    })?
}

enum ResolveSerialSourceError {
    Cancelled,
    Failed(String),
}

enum ResolveDfuSourceError {
    Cancelled,
    Failed(DfuPretransferError),
}

#[derive(Debug, Clone)]
enum DfuPretransferError {
    UnsupportedOfficialBootloaderTarget { guidance: String },
    ManualRecoveryRequiresSerialPath { guidance: String },
    ExactTargetingUnavailable { guidance: String },
    InvalidRecoveryArtifact { reason: String },
    Other(FirmwareError),
}

fn validate_selected_dfu_request(
    request: DfuFlashRequest,
) -> Result<DfuFlashRequest, DfuPretransferError> {
    let available = match discovery::list_dfu_devices() {
        crate::firmware::types::DfuScanResult::Available { devices } => devices,
        crate::firmware::types::DfuScanResult::Unsupported => {
            return Err(DfuPretransferError::Other(
                FirmwareError::PlatformUnsupported,
            ));
        }
    };

    let device = discovery::resolve_exact_dfu_device(&available, &request.device.unique_id)
        .map_err(map_dfu_validation_error)?;
    Ok(DfuFlashRequest {
        device,
        source: request.source,
    })
}

fn classify_dfu_pretransfer_error(err: &DfuPretransferError) -> DfuRecoveryResult {
    match err {
        DfuPretransferError::UnsupportedOfficialBootloaderTarget { guidance }
        | DfuPretransferError::ManualRecoveryRequiresSerialPath { guidance }
        | DfuPretransferError::ExactTargetingUnavailable { guidance } => {
            DfuRecoveryResult::DriverGuidance {
                guidance: guidance.clone(),
            }
        }
        DfuPretransferError::InvalidRecoveryArtifact { reason } => DfuRecoveryResult::Failed {
            reason: reason.clone(),
        },
        DfuPretransferError::Other(other) => DfuRecoveryResult::Failed {
            reason: other.to_string(),
        },
    }
}

fn map_dfu_validation_error(err: FirmwareError) -> DfuPretransferError {
    match err {
        FirmwareError::UnsupportedDfuBootloaderTarget { guidance } => {
            DfuPretransferError::UnsupportedOfficialBootloaderTarget { guidance }
        }
        FirmwareError::ManualDfuRecoveryRequiresSerialPath { guidance } => {
            DfuPretransferError::ManualRecoveryRequiresSerialPath { guidance }
        }
        FirmwareError::DfuExactTargetingUnavailable { guidance } => {
            DfuPretransferError::ExactTargetingUnavailable { guidance }
        }
        FirmwareError::ArtifactInvalid { reason } => {
            DfuPretransferError::InvalidRecoveryArtifact { reason }
        }
        other => DfuPretransferError::Other(other),
    }
}

async fn resolve_source_with_cancellation(
    state: &tauri::State<'_, AppState>,
    source: SerialFlashSource,
) -> Result<Vec<u8>, ResolveSerialSourceError> {
    await_abortable_pretransfer_string(state, async move { resolve_source(source).await }).await
}

async fn resolve_dfu_source_with_cancellation(
    state: &tauri::State<'_, AppState>,
    source: DfuRecoverySource,
    bootloader_cache_dir: std::path::PathBuf,
) -> Result<Vec<u8>, ResolveDfuSourceError> {
    await_abortable_pretransfer_firmware(state, async move {
        resolve_dfu_source(source, bootloader_cache_dir).await
    })
    .await
}

async fn await_abortable_pretransfer_string<F>(
    state: &tauri::State<'_, AppState>,
    task: F,
) -> Result<Vec<u8>, ResolveSerialSourceError>
where
    F: std::future::Future<Output = Result<Vec<u8>, String>> + Send + 'static,
{
    let task = tokio::spawn(task);
    let abort_handle = task.abort_handle();
    *state.firmware_abort.lock().await = Some(FirmwareAbortHandle::SafeToAbort {
        handle: abort_handle,
    });

    let result = task.await;
    *state.firmware_abort.lock().await = None;

    match result {
        Ok(result) => result.map_err(ResolveSerialSourceError::Failed),
        Err(err) if err.is_cancelled() => Err(ResolveSerialSourceError::Cancelled),
        Err(err) => Err(ResolveSerialSourceError::Failed(format!(
            "source task failed: {err}"
        ))),
    }
}

async fn await_abortable_pretransfer_firmware<F>(
    state: &tauri::State<'_, AppState>,
    task: F,
) -> Result<Vec<u8>, ResolveDfuSourceError>
where
    F: std::future::Future<Output = Result<Vec<u8>, FirmwareError>> + Send + 'static,
{
    let task = tokio::spawn(task);
    let abort_handle = task.abort_handle();
    *state.firmware_abort.lock().await = Some(FirmwareAbortHandle::SafeToAbort {
        handle: abort_handle,
    });

    let result = task.await;
    *state.firmware_abort.lock().await = None;

    match result {
        Ok(result) => {
            result.map_err(|err| ResolveDfuSourceError::Failed(map_dfu_validation_error(err)))
        }
        Err(err) if err.is_cancelled() => Err(ResolveDfuSourceError::Cancelled),
        Err(err) => Err(ResolveDfuSourceError::Failed(DfuPretransferError::Other(
            FirmwareError::ProtocolError {
                detail: format!("source task failed: {err}"),
            },
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        SessionCancelAction, cancellation_requested, classify_dfu_pretransfer_error,
        classify_session_cancel_action, evaluate_serial_readiness, map_dfu_validation_error,
        normalize_serial_options, selected_port_has_active_serial_link, serial_bootloader_status,
        serial_readiness_blocked_reason, serial_readiness_request_token,
        validate_bootloader_board_detection_target, with_serial_flash_start_guard,
    };
    use crate::connection::ActiveLinkTarget;
    use crate::firmware::types::{
        FirmwareInstallBootloaderStatus, FirmwareSessionStatus, PortInfo, SerialFlashOptions,
        SerialFlashSource, SerialReadinessRequest,
    };

    #[test]
    fn cancel_action_ignores_idle_and_completed_states_instead_of_arming_next_start() {
        assert!(matches!(
            classify_session_cancel_action(&FirmwareSessionStatus::Idle, false),
            SessionCancelAction::Ignore
        ));
        assert!(matches!(
            classify_session_cancel_action(
                &FirmwareSessionStatus::Completed {
                    outcome: crate::firmware::types::FirmwareOutcome::FirmwareInstallUpdate {
                        outcome: crate::firmware::types::SerialFlashOutcome::Cancelled,
                    },
                },
                false,
            ),
            SessionCancelAction::Ignore
        ));
    }

    #[test]
    fn cancel_action_marks_active_sessions_cancelling_without_pending_start_flag() {
        assert!(matches!(
            classify_session_cancel_action(
                &FirmwareSessionStatus::FirmwareInstallUpdate {
                    phase: crate::firmware::types::SerialFlashPhase::Idle,
                },
                false,
            ),
            SessionCancelAction::MarkCancelling
        ));
        assert!(matches!(
            classify_session_cancel_action(
                &FirmwareSessionStatus::BootloaderInstallation {
                    phase: crate::firmware::types::DfuRecoveryPhase::Detecting,
                },
                false,
            ),
            SessionCancelAction::MarkCancelling
        ));
    }

    #[test]
    fn normalize_serial_options_defaults_to_normal_erase() {
        let options = normalize_serial_options(None).unwrap();
        assert!(!options.full_chip_erase);
    }

    #[test]
    fn normalize_serial_options_accepts_full_chip_erase_override() {
        let options = normalize_serial_options(Some(SerialFlashOptions {
            full_chip_erase: true,
        }))
        .unwrap();
        assert!(options.full_chip_erase);
    }

    #[test]
    fn evaluate_serial_readiness_requires_port_source_and_idle_session() {
        let request = SerialReadinessRequest {
            port: "/dev/ttyACM0".into(),
            source: SerialFlashSource::CatalogUrl {
                url: "https://example.com/fw.apj".into(),
            },
            options: None,
        };
        let ports = vec![PortInfo {
            port_name: "/dev/ttyACM0".into(),
            vid: Some(0x2DAE),
            pid: Some(0x1058),
            serial_number: None,
            manufacturer: None,
            product: None,
            location: None,
        }];

        assert!(evaluate_serial_readiness(
            &request,
            &ports,
            &FirmwareSessionStatus::Idle
        ));

        assert!(evaluate_serial_readiness(
            &request,
            &ports,
            &FirmwareSessionStatus::Completed {
                outcome: crate::firmware::types::FirmwareOutcome::FirmwareInstallUpdate {
                    outcome: crate::firmware::types::SerialFlashOutcome::Verified {
                        board_id: 9,
                        bootloader_rev: 4,
                        port: "/dev/ttyACM0".into(),
                    },
                },
            }
        ));

        assert!(!evaluate_serial_readiness(
            &request,
            &ports,
            &FirmwareSessionStatus::Cancelling {
                path: crate::firmware::types::FirmwareSessionPath::FirmwareInstallUpdate,
            }
        ));

        let bad_source = SerialReadinessRequest {
            port: "/dev/ttyACM0".into(),
            source: SerialFlashSource::LocalApjBytes { data: Vec::new() },
            options: None,
        };
        assert!(!evaluate_serial_readiness(
            &bad_source,
            &ports,
            &FirmwareSessionStatus::Idle
        ));

        let full_erase_options = SerialReadinessRequest {
            port: "/dev/ttyACM0".into(),
            source: SerialFlashSource::CatalogUrl {
                url: "https://example.com/fw.apj".into(),
            },
            options: Some(SerialFlashOptions {
                full_chip_erase: true,
            }),
        };
        assert!(evaluate_serial_readiness(
            &full_erase_options,
            &ports,
            &FirmwareSessionStatus::Idle
        ));
        assert!(
            serial_readiness_blocked_reason(&request, &ports, &FirmwareSessionStatus::Idle)
                .is_none()
        );
    }

    #[test]
    fn blocked_serial_start_does_not_reach_disconnect_or_flash_setup() {
        let request = SerialReadinessRequest {
            port: "".into(),
            source: SerialFlashSource::CatalogUrl {
                url: "https://example.com/fw.apj".into(),
            },
            options: None,
        };
        let ports = vec![PortInfo {
            port_name: "/dev/ttyACM0".into(),
            vid: Some(0x2DAE),
            pid: Some(0x1058),
            serial_number: None,
            manufacturer: None,
            product: None,
            location: None,
        }];
        let mut attempted_disconnect_or_flash_setup = false;

        let result =
            with_serial_flash_start_guard(&request, &ports, &FirmwareSessionStatus::Idle, || {
                attempted_disconnect_or_flash_setup = true;
                Ok(())
            });

        assert_eq!(result.unwrap_err(), "serial port not selected");
        assert!(!attempted_disconnect_or_flash_setup);
    }

    #[test]
    fn blocked_serial_start_due_to_busy_session_does_not_proceed() {
        let request = SerialReadinessRequest {
            port: "/dev/ttyACM0".into(),
            source: SerialFlashSource::LocalApjBytes {
                data: vec![1, 2, 3],
            },
            options: None,
        };
        let ports = vec![PortInfo {
            port_name: "/dev/ttyACM0".into(),
            vid: Some(0x2DAE),
            pid: Some(0x1058),
            serial_number: None,
            manufacturer: None,
            product: None,
            location: None,
        }];
        let mut attempted_flash_setup = false;

        let result = with_serial_flash_start_guard(
            &request,
            &ports,
            &FirmwareSessionStatus::FirmwareInstallUpdate {
                phase: crate::firmware::types::SerialFlashPhase::Idle,
            },
            || {
                attempted_flash_setup = true;
                Ok(())
            },
        );

        assert_eq!(
            result.unwrap_err(),
            "firmware session already active: firmware_install_update"
        );
        assert!(!attempted_flash_setup);
    }

    #[test]
    fn serial_readiness_request_token_is_stable_for_identical_requests() {
        let request = SerialReadinessRequest {
            port: "/dev/ttyACM0".into(),
            source: SerialFlashSource::CatalogUrl {
                url: "https://example.com/fw.apj".into(),
            },
            options: Some(SerialFlashOptions {
                full_chip_erase: true,
            }),
        };

        assert_eq!(
            serial_readiness_request_token(&request),
            serial_readiness_request_token(&request)
        );
    }

    #[test]
    fn serial_readiness_request_token_changes_with_catalog_url() {
        let base = SerialReadinessRequest {
            port: "/dev/ttyACM0".into(),
            source: SerialFlashSource::CatalogUrl {
                url: "https://example.com/fw-a.apj".into(),
            },
            options: Some(SerialFlashOptions {
                full_chip_erase: false,
            }),
        };
        let changed = SerialReadinessRequest {
            source: SerialFlashSource::CatalogUrl {
                url: "https://example.com/fw-b.apj".into(),
            },
            ..base.clone()
        };

        assert_ne!(
            serial_readiness_request_token(&base),
            serial_readiness_request_token(&changed)
        );
    }

    #[test]
    fn serial_readiness_request_token_changes_with_port() {
        let base = SerialReadinessRequest {
            port: "/dev/ttyACM0".into(),
            source: SerialFlashSource::CatalogUrl {
                url: "https://example.com/fw.apj".into(),
            },
            options: Some(SerialFlashOptions {
                full_chip_erase: false,
            }),
        };
        let changed = SerialReadinessRequest {
            port: "/dev/ttyUSB1".into(),
            ..base.clone()
        };

        assert_ne!(
            serial_readiness_request_token(&base),
            serial_readiness_request_token(&changed)
        );
    }

    #[test]
    fn serial_readiness_request_token_changes_with_local_apj_content() {
        let base = SerialReadinessRequest {
            port: "/dev/ttyACM0".into(),
            source: SerialFlashSource::LocalApjBytes {
                data: vec![1, 2, 3, 4],
            },
            options: Some(SerialFlashOptions {
                full_chip_erase: false,
            }),
        };
        let changed = SerialReadinessRequest {
            source: SerialFlashSource::LocalApjBytes {
                data: vec![1, 2, 3, 5],
            },
            ..base.clone()
        };

        assert_ne!(
            serial_readiness_request_token(&base),
            serial_readiness_request_token(&changed)
        );
    }

    #[test]
    fn serial_readiness_request_token_normalizes_missing_options_to_false() {
        let without_options = SerialReadinessRequest {
            port: "/dev/ttyACM0".into(),
            source: SerialFlashSource::CatalogUrl {
                url: "https://example.com/fw.apj".into(),
            },
            options: None,
        };
        let explicit_false = SerialReadinessRequest {
            options: Some(SerialFlashOptions {
                full_chip_erase: false,
            }),
            ..without_options.clone()
        };

        assert_eq!(
            serial_readiness_request_token(&without_options),
            serial_readiness_request_token(&explicit_false)
        );
    }

    #[test]
    fn serial_readiness_request_token_changes_with_full_chip_erase() {
        let base = SerialReadinessRequest {
            port: "/dev/ttyACM0".into(),
            source: SerialFlashSource::CatalogUrl {
                url: "https://example.com/fw.apj".into(),
            },
            options: Some(SerialFlashOptions {
                full_chip_erase: false,
            }),
        };
        let changed = SerialReadinessRequest {
            options: Some(SerialFlashOptions {
                full_chip_erase: true,
            }),
            ..base.clone()
        };

        assert_ne!(
            serial_readiness_request_token(&base),
            serial_readiness_request_token(&changed)
        );
    }

    #[test]
    fn active_serial_match_requires_selected_port() {
        assert!(selected_port_has_active_serial_link(
            Some(&ActiveLinkTarget::Serial {
                port: "/dev/ttyACM0".into(),
            }),
            "/dev/ttyACM0",
        ));
        assert!(!selected_port_has_active_serial_link(
            Some(&ActiveLinkTarget::Serial {
                port: "/dev/ttyUSB1".into(),
            }),
            "/dev/ttyACM0",
        ));
        assert!(!selected_port_has_active_serial_link(
            Some(&ActiveLinkTarget::Other),
            "/dev/ttyACM0",
        ));
        assert!(!selected_port_has_active_serial_link(None, "/dev/ttyACM0"));
    }

    #[test]
    fn bootloader_board_detection_target_rejects_active_mavlink_port() {
        let result = validate_bootloader_board_detection_target(
            "/dev/ttyACM0",
            Some(&ActiveLinkTarget::Serial {
                port: "/dev/ttyACM0".into(),
            }),
        );

        assert!(
            result
                .unwrap_err()
                .contains("reboot to bootloader before autodetecting")
        );
    }

    #[test]
    fn serial_bootloader_status_reports_already_in_bootloader_for_authoritative_identity() {
        let ports = vec![PortInfo {
            port_name: "/dev/ttyACM0".into(),
            vid: Some(0x2DAE),
            pid: Some(0x1016),
            serial_number: Some("bootloader".into()),
            manufacturer: Some("ArduPilot".into()),
            product: Some("CubeBlack Bootloader".into()),
            location: None,
        }];

        assert!(matches!(
            serial_bootloader_status("/dev/ttyACM0", &ports, None),
            FirmwareInstallBootloaderStatus::AlreadyInBootloader
        ));
    }

    #[test]
    fn serial_bootloader_status_reports_not_in_bootloader_only_for_active_serial_match() {
        let ports = vec![PortInfo {
            port_name: "/dev/ttyACM0".into(),
            vid: Some(0x2DAE),
            pid: Some(0x1058),
            serial_number: Some("app".into()),
            manufacturer: Some("Hex".into()),
            product: Some("CubeOrange".into()),
            location: None,
        }];

        assert!(matches!(
            serial_bootloader_status(
                "/dev/ttyACM0",
                &ports,
                Some(&ActiveLinkTarget::Serial {
                    port: "/dev/ttyACM0".into(),
                }),
            ),
            FirmwareInstallBootloaderStatus::NotInBootloader { can_reboot: true }
        ));
        assert!(matches!(
            serial_bootloader_status(
                "/dev/ttyACM0",
                &ports,
                Some(&ActiveLinkTarget::Serial {
                    port: "/dev/ttyUSB1".into(),
                }),
            ),
            FirmwareInstallBootloaderStatus::Unknown
        ));
    }

    #[test]
    fn serial_bootloader_status_reports_unknown_for_disconnected_application_port() {
        let ports = vec![PortInfo {
            port_name: "/dev/ttyACM0".into(),
            vid: Some(0x2DAE),
            pid: Some(0x1058),
            serial_number: Some("app".into()),
            manufacturer: Some("Hex".into()),
            product: Some("CubeOrange".into()),
            location: None,
        }];

        assert!(matches!(
            serial_bootloader_status("/dev/ttyACM0", &ports, None),
            FirmwareInstallBootloaderStatus::Unknown
        ));
    }

    #[test]
    fn serial_bootloader_status_prefers_authoritative_bootloader_identity_over_active_match() {
        let ports = vec![PortInfo {
            port_name: "/dev/ttyACM0".into(),
            vid: None,
            pid: None,
            serial_number: Some("BL123".into()),
            manufacturer: Some("Hex".into()),
            product: Some("CubeOrange Bootloader".into()),
            location: None,
        }];

        assert!(matches!(
            serial_bootloader_status(
                "/dev/ttyACM0",
                &ports,
                Some(&ActiveLinkTarget::Serial {
                    port: "/dev/ttyACM0".into(),
                }),
            ),
            FirmwareInstallBootloaderStatus::AlreadyInBootloader
        ));
    }

    #[test]
    fn serial_bootloader_status_reports_already_in_bootloader_for_matek_bl_suffix() {
        let ports = vec![PortInfo {
            port_name: "/dev/ttyACM0".into(),
            vid: Some(0x1209),
            pid: Some(0x5741),
            serial_number: Some("36001D001647333135353532".into()),
            manufacturer: Some("ArduPilot".into()),
            product: Some("MatekF405-VTOL-BL".into()),
            location: None,
        }];

        assert!(matches!(
            serial_bootloader_status("/dev/ttyACM0", &ports, None),
            FirmwareInstallBootloaderStatus::AlreadyInBootloader
        ));
    }

    #[test]
    fn cancellation_requested_only_for_cancelling_status() {
        assert!(cancellation_requested(&FirmwareSessionStatus::Cancelling {
            path: crate::firmware::types::FirmwareSessionPath::FirmwareInstallUpdate,
        }));
        assert!(!cancellation_requested(&FirmwareSessionStatus::Idle));
        assert!(!cancellation_requested(
            &FirmwareSessionStatus::FirmwareInstallUpdate {
                phase: crate::firmware::types::SerialFlashPhase::Idle,
            }
        ));
    }

    #[test]
    fn cancel_action_prefers_aborting_pretransfer_tasks() {
        assert!(matches!(
            classify_session_cancel_action(
                &FirmwareSessionStatus::FirmwareInstallUpdate {
                    phase: crate::firmware::types::SerialFlashPhase::Idle,
                },
                true,
            ),
            SessionCancelAction::AbortPretransfer
        ));
    }

    #[test]
    fn dfu_manual_apj_boundary_error_maps_to_typed_guidance() {
        let result = super::classify_dfu_pretransfer_error(&map_dfu_validation_error(crate::firmware::types::FirmwareError::ManualDfuRecoveryRequiresSerialPath {
            guidance: "this APJ contains an external-flash payload; DFU recovery can only write internal flash. Use the serial bootloader path for boards with external flash".into(),
        }));

        assert!(matches!(
            result,
            crate::firmware::dfu_recovery::DfuRecoveryResult::DriverGuidance { .. }
        ));
    }

    #[test]
    fn dfu_empty_bin_validation_maps_to_typed_failure_not_guidance() {
        let result = classify_dfu_pretransfer_error(&map_dfu_validation_error(
            crate::firmware::types::FirmwareError::ArtifactInvalid {
                reason: "recovery binary is empty".into(),
            },
        ));

        assert!(matches!(
            result,
            crate::firmware::dfu_recovery::DfuRecoveryResult::Failed { .. }
        ));
    }

    #[test]
    fn dfu_duplicate_indistinguishable_devices_map_to_typed_guidance() {
        let result = classify_dfu_pretransfer_error(&map_dfu_validation_error(crate::firmware::types::FirmwareError::DfuExactTargetingUnavailable {
            guidance: "exact DFU targeting is ambiguous because multiple indistinguishable STM32 DFU devices are attached. Disconnect extra devices and try again".into(),
        }));

        assert!(matches!(
            result,
            crate::firmware::dfu_recovery::DfuRecoveryResult::DriverGuidance { .. }
        ));
    }

    #[test]
    fn unsupported_official_bootloader_guidance_maps_via_typed_reason() {
        let result = classify_dfu_pretransfer_error(&map_dfu_validation_error(
            crate::firmware::types::FirmwareError::UnsupportedDfuBootloaderTarget {
                guidance: "no official bootloader is published for 'NoSuchBoard'. Use the advanced/manual DFU APJ/BIN recovery path instead, and remember that normal ArduPilot firmware installs belong on the serial bootloader path".into(),
            },
        ));

        assert!(matches!(
            result,
            crate::firmware::dfu_recovery::DfuRecoveryResult::DriverGuidance { .. }
        ));
    }
}
