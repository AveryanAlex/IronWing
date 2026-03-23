use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::AppState;
use crate::connection;
use crate::e2e_emit::emit_event;
use crate::firmware::artifact;
use crate::firmware::catalog::CatalogClient;
use crate::firmware::dfu_recovery::{self, DfuRecoveryResult};
use crate::firmware::serial_executor::{self, PreflightSnapshot};
use crate::firmware::types::{
    CatalogEntry, CatalogTargetSummary, DfuDeviceInfo, DfuRecoverySource, FirmwareProgress,
    FirmwareSessionStatus, InventoryResult, SerialFlashSource, SerialFlowResult,
    SerialPreflightInfo,
};

#[derive(Deserialize)]
pub(crate) struct SerialFlashRequest {
    port: String,
    baud: u32,
    source: SerialFlashSource,
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub(crate) async fn firmware_flash_serial(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    request: SerialFlashRequest,
) -> Result<SerialFlowResult, String> {
    let apj_bytes = resolve_source(request.source).await?;

    let artifact = artifact::parse_apj(&apj_bytes).map_err(|e| e.to_string())?;

    let was_connected = connection::is_vehicle_connected(&state).await;

    let preflight = capture_preflight(&request.port, request.baud);

    state
        .firmware_session
        .try_start_serial()
        .map_err(|e| e.to_string())?;

    if was_connected {
        // Connected preflight path: request bootloader reboot via MAVLink, then disconnect
        let reboot_result = {
            let guard = state.vehicle.lock().await;
            if let Some(vehicle) = guard.as_ref() {
                vehicle.ardupilot().reboot_to_bootloader().await
            } else {
                Ok(())
            }
        };
        if let Err(e) = &reboot_result {
            tracing::warn!("bootloader reboot request failed (proceeding with disconnect): {e}");
        }
    }

    connection::force_disconnect(&state, &app)
        .await
        .inspect_err(|_| {
            state.firmware_session.stop();
        })?;

    let (task, abort_handle) = {
        let handle = tokio::task::spawn_blocking({
            let app = app.clone();
            let preflight = preflight.clone();
            let artifact = artifact.clone();
            move || {
                let deps = serial_executor::RealSerialDeps;
                serial_executor::execute_serial_flash(
                    &deps,
                    &preflight,
                    &artifact,
                    |phase, written, total| {
                        let pct = if total > 0 {
                            (written as f32 / total as f32) * 100.0
                        } else {
                            0.0
                        };
                        emit_event(
                            &app,
                            "firmware://progress",
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

    *state.firmware_abort.lock().await = Some(abort_handle);

    let result = task.await.unwrap_or_else(|e| {
        if e.is_cancelled() {
            SerialFlowResult::Failed {
                reason: "flash cancelled".into(),
            }
        } else {
            SerialFlowResult::Failed {
                reason: format!("flash task panicked: {e}"),
            }
        }
    });

    *state.firmware_abort.lock().await = None;
    state.firmware_session.stop();
    Ok(result)
}

#[cfg(target_os = "android")]
#[tauri::command]
pub(crate) async fn firmware_flash_serial(
    _state: tauri::State<'_, AppState>,
    _app: tauri::AppHandle,
    _request: SerialFlashRequest,
) -> Result<SerialFlowResult, String> {
    Err(crate::firmware::types::FirmwareError::PlatformUnsupported.to_string())
}

#[tauri::command]
pub(crate) async fn firmware_reboot_to_bootloader(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    vehicle
        .ardupilot()
        .reboot_to_bootloader()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub(crate) async fn firmware_serial_preflight(
    state: tauri::State<'_, AppState>,
) -> Result<SerialPreflightInfo, String> {
    let vehicle_connected = connection::is_vehicle_connected(&state).await;

    let param_count = if vehicle_connected {
        let guard = state.vehicle.lock().await;
        guard
            .as_ref()
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

    let detected_board_id =
        crate::firmware::discovery::detect_board_id_from_ports(&available_ports);

    let session_status = state.firmware_session.status();
    let session_ready = matches!(session_status, FirmwareSessionStatus::Idle);

    Ok(SerialPreflightInfo {
        vehicle_connected,
        param_count,
        has_params_to_backup: param_count > 0,
        available_ports,
        detected_board_id,
        session_ready,
        session_status,
    })
}

#[tauri::command]
pub(crate) async fn firmware_catalog_entries(
    app: tauri::AppHandle,
    board_id: u32,
    platform: Option<String>,
) -> Result<Vec<CatalogEntry>, String> {
    tokio::task::spawn_blocking(move || {
        let cache_dir = app
            .path()
            .app_cache_dir()
            .unwrap_or_else(|_| std::env::temp_dir())
            .join("firmware_catalog");
        let client = CatalogClient::new(cache_dir);
        client
            .get_entries_filtered_online(board_id, platform.as_deref())
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("catalog task failed: {e}"))?
}

#[tauri::command]
pub(crate) async fn firmware_catalog_targets(
    app: tauri::AppHandle,
) -> Result<Vec<CatalogTargetSummary>, String> {
    tokio::task::spawn_blocking(move || {
        let cache_dir = app
            .path()
            .app_cache_dir()
            .unwrap_or_else(|_| std::env::temp_dir())
            .join("firmware_catalog");
        let client = CatalogClient::new(cache_dir);
        client
            .get_catalog_targets_online()
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("catalog task failed: {e}"))?
}

#[tauri::command]
pub(crate) fn firmware_session_status(state: tauri::State<'_, AppState>) -> FirmwareSessionStatus {
    state.firmware_session.status()
}

#[tauri::command]
pub(crate) async fn firmware_session_cancel(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    if let Some(handle) = state.firmware_abort.lock().await.take() {
        handle.abort();
    }
    state.firmware_session.stop();
    Ok(())
}

fn capture_preflight(port: &str, baud: u32) -> PreflightSnapshot {
    let ports_before = match crate::firmware::discovery::list_firmware_ports() {
        InventoryResult::Available { ports } => ports,
        _ => vec![],
    };
    PreflightSnapshot {
        port: port.to_string(),
        baud,
        ports_before,
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
pub(crate) async fn firmware_flash_dfu_recovery(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    request: DfuFlashRequest,
) -> Result<DfuRecoveryResult, String> {
    let bin_data = resolve_dfu_source(request.source).await?;

    let recovery_artifact =
        artifact::validate_recovery_bin(&bin_data).map_err(|e| e.to_string())?;

    state
        .firmware_session
        .try_start_dfu(connection::is_vehicle_connected(&state).await)
        .map_err(|e| e.to_string())?;

    let (task, abort_handle) = {
        let handle = tokio::task::spawn_blocking({
            let app = app.clone();
            let device = request.device.clone();
            let image = recovery_artifact.image;
            move || {
                let usb = dfu_recovery::NusbDfuAccess::new();
                dfu_recovery::execute_dfu_recovery(&usb, &device, &image, |written, total| {
                    let pct = if total > 0 {
                        (written as f32 / total as f32) * 100.0
                    } else {
                        0.0
                    };
                    emit_event(
                        &app,
                        "firmware://progress",
                        &FirmwareProgress {
                            phase_label: "dfu_downloading".into(),
                            bytes_written: written as u64,
                            bytes_total: total as u64,
                            pct,
                        },
                    );
                })
            }
        });
        let abort = handle.abort_handle();
        (handle, abort)
    };

    *state.firmware_abort.lock().await = Some(abort_handle);

    let result = task.await.unwrap_or_else(|e| {
        if e.is_cancelled() {
            DfuRecoveryResult::Failed {
                reason: "DFU recovery cancelled".into(),
            }
        } else {
            DfuRecoveryResult::Failed {
                reason: format!("DFU recovery task panicked: {e}"),
            }
        }
    });

    *state.firmware_abort.lock().await = None;
    state.firmware_session.stop();
    Ok(result)
}

#[cfg(target_os = "android")]
#[tauri::command]
pub(crate) async fn firmware_flash_dfu_recovery(
    _state: tauri::State<'_, AppState>,
    _app: tauri::AppHandle,
    _request: DfuFlashRequest,
) -> Result<DfuRecoveryResult, String> {
    Ok(DfuRecoveryResult::PlatformUnsupported)
}

#[cfg(not(target_os = "android"))]
async fn resolve_source(source: SerialFlashSource) -> Result<Vec<u8>, String> {
    match source {
        SerialFlashSource::LocalApjBytes { data } => Ok(data),
        SerialFlashSource::CatalogUrl { url } => download_url(url).await,
    }
}

#[cfg(not(target_os = "android"))]
async fn resolve_dfu_source(source: DfuRecoverySource) -> Result<Vec<u8>, String> {
    match source {
        DfuRecoverySource::LocalBinBytes { data } => Ok(data),
        DfuRecoverySource::LocalApjBytes { data } => apj_to_dfu_bin(&data),
        DfuRecoverySource::CatalogUrl { url } => {
            let apj_bytes = download_url(url).await?;
            apj_to_dfu_bin(&apj_bytes)
        }
    }
}

pub(crate) fn apj_to_dfu_bin(apj_bytes: &[u8]) -> Result<Vec<u8>, String> {
    let parsed = artifact::parse_apj(apj_bytes).map_err(|e| e.to_string())?;
    if parsed.extf.is_some() {
        return Err(
            "this APJ contains an external-flash payload; DFU recovery can only write \
             internal flash. Use the serial bootloader path for boards with external flash"
                .into(),
        );
    }
    Ok(parsed.image)
}

#[derive(Serialize)]
pub(crate) struct DfuSourceCheck {
    pub has_extf: bool,
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub(crate) async fn firmware_check_dfu_source(url: String) -> Result<DfuSourceCheck, String> {
    let apj_bytes = download_url(url).await?;
    let parsed = artifact::parse_apj(&apj_bytes).map_err(|e| e.to_string())?;
    Ok(DfuSourceCheck {
        has_extf: parsed.extf.is_some(),
    })
}

#[cfg(target_os = "android")]
#[tauri::command]
pub(crate) async fn firmware_check_dfu_source(_url: String) -> Result<DfuSourceCheck, String> {
    Err("DFU source inspection is not supported on Android".into())
}

#[cfg(not(target_os = "android"))]
async fn download_url(url: String) -> Result<Vec<u8>, String> {
    tokio::task::spawn_blocking(move || {
        let response = ureq::get(&url)
            .call()
            .map_err(|e| format!("catalog download failed: {e}"))?;
        response
            .into_body()
            .read_to_vec()
            .map_err(|e| format!("catalog read failed: {e}"))
    })
    .await
    .map_err(|e| format!("download task failed: {e}"))?
}
