use analytics::{analytics_status, analytics_track_event};
use bluetooth::{bt_get_bonded_devices, bt_request_permissions, bt_scan_ble, bt_stop_scan_ble};
use commands::{
    ack_session_snapshot, arm_vehicle, available_transports, calibrate_accel,
    calibrate_compass_accept, calibrate_compass_cancel, calibrate_compass_start, calibrate_gyro,
    disarm_vehicle, fence_clear, fence_download, fence_upload, get_available_message_rates,
    get_available_modes, list_serial_ports_cmd, mission_cancel, mission_clear, mission_download,
    mission_set_current, mission_upload, mission_validate, motor_test, open_session_snapshot,
    param_cancel, param_download_all, param_format_file, param_parse_file, param_write,
    param_write_batch, rally_clear, rally_download, rally_upload, rc_override, reboot_vehicle,
    request_prearm_checks, runtime_capabilities, set_flight_mode, set_message_rate, set_servo,
    set_telemetry_rate, start_guided_session, stop_guided_session, update_guided_session,
    vehicle_takeoff,
};
use connection::{ActiveLinkTarget, connect_link, disconnect_link};
use firmware::commands::{
    firmware_bootloader_catalog_targets, firmware_bootloader_installation,
    firmware_catalog_entries, firmware_catalog_targets, firmware_install_update,
    firmware_install_update_preflight, firmware_install_update_readiness, firmware_session_cancel,
    firmware_session_clear_completed, firmware_session_status,
};
use firmware::discovery::{firmware_list_dfu_devices, firmware_list_ports};
use firmware::types::FirmwareSessionHandle;
use ipc::GuidedRuntime;
use ironwing_core::live_runtime::{LiveVehicleRuntime, SharedLiveRuntime};
use log_library::{
    log_library_cancel, log_library_list, log_library_register, log_library_register_open_file,
    log_library_reindex, log_library_relink, log_library_remove,
};
use logs::{LogOperationState, LogStore, PlaybackRuntimeState};
use recording::{
    TlogRecorderHandle, recording_settings_read, recording_settings_write, recording_start,
    recording_status, recording_stop,
};
use remote_ui::RemoteUiEvent;
use tauri::Manager;
use tauri_event_sink::TauriEventSink;
mod analytics;
mod bluetooth;
mod bridges;
mod commands;
mod connection;
mod e2e_emit;
#[allow(dead_code)]
// Firmware module is conditionally used via Tauri commands; not all paths are exercised in all builds
mod firmware;
mod guided;
mod helpers;
mod ipc;
mod log_library;
mod logs;
mod recording;
mod remote_ui;
mod session_runtime;
mod tauri_event_sink;

pub(crate) type MissionCancelToken = tokio_util::sync::CancellationToken;

pub(crate) enum FirmwareAbortHandle {
    SafeToAbort { handle: tokio::task::AbortHandle },
    Cooperative { _handle: tokio::task::AbortHandle },
}

pub(crate) struct AppState {
    pub(crate) live_runtime: SharedLiveRuntime<TauriEventSink>,
    pub(crate) active_link_target: tokio::sync::Mutex<Option<ActiveLinkTarget>>,
    pub(crate) connect_abort: tokio::sync::Mutex<Option<tokio::task::AbortHandle>>,
    pub(crate) background_tasks: tokio::sync::Mutex<Vec<tokio::task::JoinHandle<()>>>,
    pub(crate) background_listeners: tokio::sync::Mutex<Vec<tauri::EventId>>,
    pub(crate) log_store: tokio::sync::Mutex<Option<LogStore>>,
    pub(crate) cached_library_store: tokio::sync::Mutex<Option<LogStore>>,
    pub(crate) log_operation: LogOperationState,
    pub(crate) playback_runtime: PlaybackRuntimeState,
    pub(crate) recorder: TlogRecorderHandle,
    pub(crate) firmware_session: FirmwareSessionHandle,
    pub(crate) firmware_abort: tokio::sync::Mutex<Option<FirmwareAbortHandle>>,
    pub(crate) firmware_cancel_requested: std::sync::Arc<std::sync::atomic::AtomicBool>,
    pub(crate) param_download_abort: tokio::sync::Mutex<Option<tokio::task::AbortHandle>>,
    pub(crate) mission_op_cancel: tokio::sync::Mutex<Option<MissionCancelToken>>,
    pub(crate) guided_runtime: tokio::sync::Mutex<GuidedRuntime>,
    pub(crate) remote_ui_events: tokio::sync::broadcast::Sender<RemoteUiEvent>,
}

fn ble_plugin_enabled() -> bool {
    !matches!(
        std::env::var("IRONWING_DISABLE_BLE_PLUGIN"),
        Ok(value) if matches!(value.trim(), "1" | "true" | "TRUE" | "yes" | "YES")
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let tauri_event_sink = TauriEventSink::default();
    let state = AppState {
        live_runtime: SharedLiveRuntime::new(LiveVehicleRuntime::new(tauri_event_sink.clone())),
        active_link_target: tokio::sync::Mutex::new(None),
        connect_abort: tokio::sync::Mutex::new(None),
        background_tasks: tokio::sync::Mutex::new(Vec::new()),
        background_listeners: tokio::sync::Mutex::new(Vec::new()),
        log_store: tokio::sync::Mutex::new(None),
        cached_library_store: tokio::sync::Mutex::new(None),
        log_operation: LogOperationState::new(),
        playback_runtime: PlaybackRuntimeState::new(),
        recorder: TlogRecorderHandle::new(),
        firmware_session: FirmwareSessionHandle::new(),
        firmware_abort: tokio::sync::Mutex::new(None),
        firmware_cancel_requested: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
        param_download_abort: tokio::sync::Mutex::new(None),
        mission_op_cancel: tokio::sync::Mutex::new(None),
        guided_runtime: tokio::sync::Mutex::new(GuidedRuntime::default()),
        remote_ui_events: remote_ui::event_channel(),
    };
    let mut builder = tauri::Builder::default()
        .manage(state)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init());
    if let Some(app_key) = analytics::aptabase_native_key() {
        builder = builder.plugin(
            tauri_plugin_aptabase::Builder::new(app_key)
                .with_options(analytics::aptabase_options())
                .build(),
        );
    }
    if ble_plugin_enabled() {
        builder = builder.plugin(tauri_plugin_blec::init());
    }
    #[cfg(target_os = "android")]
    {
        builder = builder
            .plugin(tauri_plugin_bluetooth_classic::init())
            .plugin(tauri_plugin_geolocation::init());
    }
    builder = builder.invoke_handler(tauri::generate_handler![
        connect_link,
        disconnect_link,
        analytics_status,
        analytics_track_event,
        list_serial_ports_cmd,
        available_transports,
        runtime_capabilities,
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
        get_available_message_rates,
        set_message_rate,
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
        set_servo,
        rc_override,
        request_prearm_checks,
        log_library_list,
        log_library_register,
        log_library_register_open_file,
        log_library_remove,
        log_library_relink,
        log_library_reindex,
        log_library_cancel,
        crate::logs::log_open,
        crate::logs::log_raw_messages_query,
        crate::logs::log_chart_series_query,
        crate::logs::log_export,
        crate::logs::log_query,
        crate::logs::log_get_summary,
        crate::logs::log_get_flight_path,
        crate::logs::log_get_telemetry_track,
        crate::logs::log_get_flight_summary,
        crate::logs::log_export_csv,
        crate::logs::log_close,
        crate::logs::playback_play,
        crate::logs::playback_pause,
        crate::logs::playback_seek,
        crate::logs::playback_set_speed,
        crate::logs::playback_stop,
        recording_start,
        recording_stop,
        recording_status,
        recording_settings_read,
        recording_settings_write,
        open_session_snapshot,
        ack_session_snapshot,
        firmware_list_ports,
        firmware_list_dfu_devices,
        firmware_install_update,
        firmware_session_status,
        firmware_session_cancel,
        firmware_session_clear_completed,
        firmware_install_update_readiness,
        firmware_install_update_preflight,
        firmware_catalog_entries,
        firmware_catalog_targets,
        firmware_bootloader_catalog_targets,
        firmware_bootloader_installation
    ]);

    builder
        .setup(|_app| {
            let state = _app.state::<AppState>();
            state
                .live_runtime
                .with_runtime(|runtime| runtime.event_sink().set_handle(_app.handle().clone()));

            #[cfg(desktop)]
            {
                let bg = tauri::utils::config::Color(18, 23, 29, 255);
                if let Some(w) = _app.get_webview_window("main") {
                    let _ = w.set_background_color(Some(bg));
                }
            }
            if remote_ui::remote_ui_enabled() {
                remote_ui::spawn_remote_ui_server(_app.handle().clone());
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
