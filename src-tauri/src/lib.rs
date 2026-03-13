use bluetooth::{bt_get_bonded_devices, bt_request_permissions, bt_scan_ble, bt_stop_scan_ble};
use commands::{
    arm_vehicle, available_transports, calibrate_accel, calibrate_compass_accept,
    calibrate_compass_cancel, calibrate_compass_start, calibrate_gyro, disarm_vehicle,
    get_available_modes, get_vehicle_snapshot, list_serial_ports_cmd, mission_cancel,
    mission_clear_plan, mission_download_plan, mission_set_current, mission_upload_plan,
    mission_validate_plan, mission_verify_roundtrip, motor_test, param_download_all,
    param_format_file, param_parse_file, param_write, param_write_batch, reboot_vehicle,
    request_prearm_checks, set_flight_mode, set_telemetry_rate, vehicle_guided_goto,
    vehicle_takeoff,
};
use connection::{connect_link, disconnect_link};
use firmware::commands::{
    firmware_catalog_entries, firmware_catalog_targets, firmware_check_dfu_source,
    firmware_flash_dfu_recovery, firmware_flash_serial, firmware_reboot_to_bootloader,
    firmware_serial_preflight, firmware_session_cancel, firmware_session_status,
};
use firmware::discovery::{firmware_list_dfu_devices, firmware_list_ports};
use firmware::types::FirmwareSessionHandle;
use logs::LogStore;
use mavkit::Vehicle;
use recording::{TlogRecorderHandle, recording_start, recording_status, recording_stop};
mod bluetooth;
mod bridges;
mod commands;
mod connection;
#[allow(dead_code)]
mod firmware;
mod helpers;
mod logs;
mod recording;

pub(crate) struct AppState {
    pub(crate) vehicle: tokio::sync::Mutex<Option<Vehicle>>,
    pub(crate) connect_abort: tokio::sync::Mutex<Option<tokio::task::AbortHandle>>,
    pub(crate) log_store: tokio::sync::Mutex<Option<LogStore>>,
    pub(crate) recorder: TlogRecorderHandle,
    pub(crate) firmware_session: FirmwareSessionHandle,
    pub(crate) firmware_abort: tokio::sync::Mutex<Option<tokio::task::AbortHandle>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = AppState {
        vehicle: tokio::sync::Mutex::new(None),
        connect_abort: tokio::sync::Mutex::new(None),
        log_store: tokio::sync::Mutex::new(None),
        recorder: TlogRecorderHandle::new(),
        firmware_session: FirmwareSessionHandle::new(),
        firmware_abort: tokio::sync::Mutex::new(None),
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
        mission_validate_plan,
        mission_upload_plan,
        mission_download_plan,
        mission_clear_plan,
        mission_verify_roundtrip,
        mission_set_current,
        mission_cancel,
        arm_vehicle,
        disarm_vehicle,
        set_flight_mode,
        vehicle_takeoff,
        vehicle_guided_goto,
        get_available_modes,
        set_telemetry_rate,
        param_download_all,
        param_write,
        param_write_batch,
        param_parse_file,
        param_format_file,
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
        recording_start,
        recording_stop,
        recording_status,
        get_vehicle_snapshot,
        firmware_list_ports,
        firmware_list_dfu_devices,
        firmware_flash_serial,
        firmware_session_status,
        firmware_session_cancel,
        firmware_reboot_to_bootloader,
        firmware_serial_preflight,
        firmware_catalog_entries,
        firmware_catalog_targets,
        firmware_flash_dfu_recovery,
        firmware_check_dfu_source
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
