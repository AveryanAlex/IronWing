use bluetooth::{bt_get_bonded_devices, bt_request_permissions, bt_scan_ble, bt_stop_scan_ble};
use std::sync::atomic::AtomicU64;

use commands::{
    ack_session_snapshot, arm_vehicle, available_transports, calibrate_accel,
    calibrate_compass_accept, calibrate_compass_cancel, calibrate_compass_start, calibrate_gyro,
    disarm_vehicle, fence_clear, fence_download, fence_upload, get_available_modes,
    list_serial_ports_cmd, mission_cancel, mission_clear, mission_download, mission_set_current,
    mission_upload, mission_validate, motor_test, open_session_snapshot, param_cancel,
    param_download_all, param_format_file, param_parse_file, param_write, param_write_batch,
    rally_clear,
    rally_download, rally_upload, reboot_vehicle, request_prearm_checks, set_flight_mode,
    set_telemetry_rate, start_guided_session, stop_guided_session, update_guided_session,
    vehicle_takeoff,
};
use connection::{ActiveLinkTarget, connect_link, disconnect_link};
use firmware::commands::{
    firmware_catalog_entries, firmware_catalog_targets, firmware_flash_dfu_recovery,
    firmware_flash_serial, firmware_recovery_catalog_targets, firmware_serial_preflight,
    firmware_serial_readiness, firmware_session_cancel, firmware_session_clear_completed,
    firmware_session_status,
};
use firmware::discovery::{firmware_list_dfu_devices, firmware_list_ports};
use firmware::types::FirmwareSessionHandle;
use ipc::{GuidedRuntime, StatusTextEntry};
use logs::LogStore;
use mavkit::Vehicle;
use recording::{TlogRecorderHandle, recording_start, recording_status, recording_stop};
use session_runtime::SessionRuntime;
mod bluetooth;
mod bridges;
mod commands;
mod connection;
mod e2e_emit;
#[allow(dead_code)] // Firmware module is conditionally used via Tauri commands; not all paths are exercised in all builds
mod firmware;
mod guided;
mod helpers;
mod ipc;
mod logs;
mod recording;
mod session_runtime;

pub(crate) enum FirmwareAbortHandle {
    SafeToAbort { handle: tokio::task::AbortHandle },
    Cooperative { _handle: tokio::task::AbortHandle },
}

pub(crate) struct AppState {
    pub(crate) vehicle: tokio::sync::Mutex<Option<Vehicle>>,
    pub(crate) active_link_target: tokio::sync::Mutex<Option<ActiveLinkTarget>>,
    pub(crate) connect_abort: tokio::sync::Mutex<Option<tokio::task::AbortHandle>>,
    pub(crate) background_tasks: tokio::sync::Mutex<Vec<tokio::task::JoinHandle<()>>>,
    pub(crate) background_listeners: tokio::sync::Mutex<Vec<tauri::EventId>>,
    pub(crate) log_store: tokio::sync::Mutex<Option<LogStore>>,
    pub(crate) recorder: TlogRecorderHandle,
    pub(crate) firmware_session: FirmwareSessionHandle,
    pub(crate) firmware_abort: tokio::sync::Mutex<Option<FirmwareAbortHandle>>,
    pub(crate) firmware_cancel_requested: std::sync::Arc<std::sync::atomic::AtomicBool>,
    pub(crate) param_download_abort: tokio::sync::Mutex<Option<tokio::task::AbortHandle>>,
    pub(crate) session_runtime: tokio::sync::Mutex<SessionRuntime>,
    pub(crate) guided_runtime: tokio::sync::Mutex<GuidedRuntime>,
    #[allow(dead_code)] // Read by event bridge wiring (Task 3)
    pub(crate) session_context: tokio::sync::Mutex<bridges::SessionContext>,
    pub(crate) status_text_history: tokio::sync::Mutex<Vec<StatusTextEntry>>,
    pub(crate) next_status_text_sequence: AtomicU64,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = AppState {
        vehicle: tokio::sync::Mutex::new(None),
        active_link_target: tokio::sync::Mutex::new(None),
        connect_abort: tokio::sync::Mutex::new(None),
        background_tasks: tokio::sync::Mutex::new(Vec::new()),
        background_listeners: tokio::sync::Mutex::new(Vec::new()),
        log_store: tokio::sync::Mutex::new(None),
        recorder: TlogRecorderHandle::new(),
        firmware_session: FirmwareSessionHandle::new(),
        firmware_abort: tokio::sync::Mutex::new(None),
        firmware_cancel_requested: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
        param_download_abort: tokio::sync::Mutex::new(None),
        session_runtime: tokio::sync::Mutex::new(SessionRuntime::new()),
        guided_runtime: tokio::sync::Mutex::new(GuidedRuntime::default()),
        session_context: tokio::sync::Mutex::new(bridges::SessionContext::new()),
        status_text_history: tokio::sync::Mutex::new(Vec::new()),
        next_status_text_sequence: AtomicU64::new(1),
    };
    let mut builder = tauri::Builder::default()
        .manage(state)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_blec::init());
    #[cfg(target_os = "android")]
    {
        builder = builder
            .plugin(tauri_plugin_bluetooth_classic::init())
            .plugin(tauri_plugin_geolocation::init());
    }
    builder = builder.invoke_handler(tauri::generate_handler![
        connect_link,
        disconnect_link,
        list_serial_ports_cmd,
        available_transports,
        bt_request_permissions,
        bt_scan_ble,
        bt_stop_scan_ble,
        bt_get_bonded_devices,
        mission_validate,
        mission_upload,
        mission_download,
        mission_clear,
        mission_set_current,
        mission_cancel,
        fence_upload,
        fence_download,
        fence_clear,
        rally_upload,
        rally_download,
        rally_clear,
        arm_vehicle,
        disarm_vehicle,
        set_flight_mode,
        vehicle_takeoff,
        start_guided_session,
        update_guided_session,
        stop_guided_session,
        get_available_modes,
        set_telemetry_rate,
        param_download_all,
        param_write,
        param_write_batch,
        param_parse_file,
        param_format_file,
        param_cancel,
        calibrate_accel,
        calibrate_gyro,
        calibrate_compass_start,
        calibrate_compass_accept,
        calibrate_compass_cancel,
        reboot_vehicle,
        motor_test,
        request_prearm_checks,
        crate::logs::log_open,
        crate::logs::log_query,
        crate::logs::log_get_summary,
        crate::logs::log_get_flight_path,
        crate::logs::log_get_telemetry_track,
        crate::logs::log_get_flight_summary,
        crate::logs::log_export_csv,
        crate::logs::log_close,
        crate::logs::playback_seek,
        recording_start,
        recording_stop,
        recording_status,
        open_session_snapshot,
        ack_session_snapshot,
        firmware_list_ports,
        firmware_list_dfu_devices,
        firmware_flash_serial,
        firmware_session_status,
        firmware_session_cancel,
        firmware_session_clear_completed,
        firmware_serial_readiness,
        firmware_serial_preflight,
        firmware_catalog_entries,
        firmware_catalog_targets,
        firmware_recovery_catalog_targets,
        firmware_flash_dfu_recovery
    ]);

    builder
        .setup(|_app| {
            #[cfg(desktop)]
            {
                use tauri::Manager;
                let bg = tauri::utils::config::Color(18, 23, 29, 255);
                if let Some(w) = _app.get_webview_window("main") {
                    let _ = w.set_background_color(Some(bg));
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
