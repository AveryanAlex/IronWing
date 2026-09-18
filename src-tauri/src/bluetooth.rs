use serde::{Deserialize, Serialize};
#[cfg(not(target_os = "android"))]
use std::sync::atomic::Ordering;
use tauri_plugin_blec::models::ScanFilter;

use crate::AppState;
use ironwing_core::{bluetooth_profile, transport::BluetoothProfile};

#[cfg(target_os = "android")]
use tauri::Manager;

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct BluetoothDevice {
    name: String,
    address: String,
    device_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    profile: Option<BluetoothProfile>,
}

pub(crate) fn nordic_uart_service_uuid() -> uuid::Uuid {
    uuid::Uuid::parse_str(bluetooth_profile::NORDIC_UART_SERVICE_UUID)
        .expect("valid NUS service UUID")
}

pub(crate) fn scan_filter_for_profile(profile: BluetoothProfile) -> ScanFilter {
    match profile {
        BluetoothProfile::NordicUart => ScanFilter::Service(nordic_uart_service_uuid()),
    }
}

#[cfg(not(target_os = "android"))]
pub(crate) async fn ensure_ble_plugin(
    app: &tauri::AppHandle,
    state: &AppState,
) -> Result<(), String> {
    if state.ble_plugin_registered.load(Ordering::Acquire) {
        return Ok(());
    }
    if !crate::ble_plugin_enabled() {
        return Err("BLE support is disabled by IRONWING_DISABLE_BLE_PLUGIN".to_string());
    }

    let _guard = state.ble_init_gate.lock().await;
    if state.ble_plugin_registered.load(Ordering::Acquire) {
        return Ok(());
    }

    // blec constructs its async handler synchronously during init, so keep that
    // blocking work off the command future before dynamically registering it.
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        app.plugin(tauri_plugin_blec::init())
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| {
        format!("BLE initialization failed. Check Bluetooth access in system settings: {error}")
    })?
    .map_err(|error| format!("BLE plugin registration failed: {error}"))?;
    state.ble_plugin_registered.store(true, Ordering::Release);
    Ok(())
}

#[cfg(target_os = "android")]
pub(crate) async fn ensure_ble_plugin(
    _app: &tauri::AppHandle,
    _state: &AppState,
) -> Result<(), String> {
    tauri_plugin_blec::get_handler()
        .map(|_| ())
        .map_err(|error| format!("BLE plugin not initialized: {error}"))
}

#[cfg(target_os = "android")]
#[tauri::command]
pub(crate) async fn bt_request_permissions(app: tauri::AppHandle) -> Result<(), String> {
    let bt: tauri::State<'_, tauri_plugin_bluetooth_classic::BluetoothClassic<tauri::Wry>> =
        app.state();
    bt.request_bt_permissions()
        .map_err(|e: Box<dyn std::error::Error>| e.to_string())?;
    Ok(())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub(crate) async fn bt_request_permissions() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub(crate) async fn bt_scan_ble(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    timeout_ms: Option<u64>,
    profile: Option<BluetoothProfile>,
) -> Result<Vec<BluetoothDevice>, String> {
    scan_ble(&app, state.inner(), timeout_ms, profile).await
}

pub(crate) async fn scan_ble(
    app: &tauri::AppHandle,
    state: &AppState,
    timeout_ms: Option<u64>,
    profile: Option<BluetoothProfile>,
) -> Result<Vec<BluetoothDevice>, String> {
    ensure_ble_plugin(app, state).await?;
    let _scan_guard = state.ble_scan_gate.lock().await;
    let handler =
        tauri_plugin_blec::get_handler().map_err(|e| format!("BLE plugin not initialized: {e}"))?;

    let (tx, mut rx) = tokio::sync::mpsc::channel(8);
    let timeout = timeout_ms.unwrap_or(3000);
    let profile = profile.unwrap_or(BluetoothProfile::NordicUart);

    handler
        .discover(Some(tx), timeout, scan_filter_for_profile(profile))
        .await
        .map_err(|e| format!("BLE scan failed: {e}"))?;

    let mut devices = Vec::new();
    while let Some(batch) = rx.recv().await {
        for d in batch {
            if !devices
                .iter()
                .any(|existing: &BluetoothDevice| existing.address == d.address)
            {
                devices.push(BluetoothDevice {
                    name: if d.name.is_empty() {
                        d.address.clone()
                    } else {
                        d.name
                    },
                    address: d.address,
                    device_type: "ble".to_string(),
                    profile: Some(profile),
                });
            }
        }
    }

    Ok(devices)
}

#[tauri::command]
pub(crate) async fn bt_stop_scan_ble() -> Result<(), String> {
    let Ok(handler) = tauri_plugin_blec::get_handler() else {
        return Ok(());
    };
    handler
        .stop_scan()
        .await
        .map_err(|e| format!("BLE stop scan failed: {e}"))?;
    Ok(())
}

#[cfg(target_os = "android")]
#[tauri::command]
pub(crate) async fn bt_get_bonded_devices(
    app: tauri::AppHandle,
) -> Result<Vec<BluetoothDevice>, String> {
    let bt: tauri::State<'_, tauri_plugin_bluetooth_classic::BluetoothClassic<tauri::Wry>> =
        app.state();
    let devices = bt
        .get_bonded_devices()
        .map_err(|e: Box<dyn std::error::Error>| e.to_string())?;
    Ok(devices
        .into_iter()
        .map(|d| BluetoothDevice {
            name: d.name,
            address: d.address,
            device_type: "classic".to_string(),
            profile: None,
        })
        .collect())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
pub(crate) async fn bt_get_bonded_devices() -> Result<Vec<BluetoothDevice>, String> {
    Err("not supported on desktop".to_string())
}
