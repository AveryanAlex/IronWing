use serde::{Deserialize, Serialize};
use tauri_plugin_blec::models::ScanFilter;

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
    timeout_ms: Option<u64>,
    profile: Option<BluetoothProfile>,
) -> Result<Vec<BluetoothDevice>, String> {
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
    let handler =
        tauri_plugin_blec::get_handler().map_err(|e| format!("BLE plugin not initialized: {e}"))?;
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
