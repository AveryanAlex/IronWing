use mavkit::Vehicle;

use bluetooth::{bt_request_permissions, bt_scan_ble, bt_stop_scan_ble};
#[cfg(target_os = "android")]
use bluetooth::bt_get_bonded_devices;
use commands::{
    arm_vehicle, available_transports, calibrate_accel, calibrate_gyro, disarm_vehicle,
    get_available_modes, mission_cancel, mission_clear_plan, mission_download_plan,
    mission_set_current, mission_upload_plan, mission_validate_plan, mission_verify_roundtrip,
    param_download_all, param_format_file, param_parse_file, param_write, param_write_batch,
    set_flight_mode, set_telemetry_rate, vehicle_guided_goto, vehicle_takeoff,
};
#[cfg(not(target_os = "android"))]
use commands::list_serial_ports_cmd;
use connection::{connect_link, disconnect_link};
use logs::LogStore;
use recording::{TlogRecorderHandle, recording_start, recording_status, recording_stop};

mod helpers;
mod recording;
mod bluetooth;
mod connection;
mod bridges;
mod commands;
mod logs;

pub(crate) struct AppState {
    pub(crate) vehicle: tokio::sync::Mutex<Option<Vehicle>>,
    pub(crate) connect_abort: tokio::sync::Mutex<Option<tokio::task::AbortHandle>>,
    pub(crate) log_store: tokio::sync::Mutex<Option<LogStore>>,
    pub(crate) recorder: TlogRecorderHandle,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = AppState {
        vehicle: tokio::sync::Mutex::new(None),
        connect_abort: tokio::sync::Mutex::new(None),
        log_store: tokio::sync::Mutex::new(None),
        recorder: TlogRecorderHandle::new(),
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

    #[cfg(not(target_os = "android"))]
    {
        builder = builder.invoke_handler(tauri::generate_handler![
            connect_link,
            disconnect_link,
            list_serial_ports_cmd,
            available_transports,
            bt_request_permissions,
            bt_scan_ble,
            bt_stop_scan_ble,
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
            recording_status
        ]);
    }

    #[cfg(target_os = "android")]
    {
        builder = builder.invoke_handler(tauri::generate_handler![
            connect_link,
            disconnect_link,
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
            recording_status
        ]);
    }

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
