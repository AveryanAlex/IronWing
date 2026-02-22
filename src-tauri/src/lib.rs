use mavkit::{
    format_param_file, parse_param_file, validate_plan, FlightMode, HomePosition, LinkState,
    MissionIssue, MissionPlan, MissionType, Param, ParamProgress, ParamStore, ParamWriteResult,
    StatusMessage, Telemetry, TransferProgress, Vehicle, VehicleConfig, VehicleState,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tauri::Emitter;
#[cfg(target_os = "android")]
use tauri::Manager;

static TELEMETRY_INTERVAL_MS: AtomicU64 = AtomicU64::new(200);

struct AppState {
    vehicle: tokio::sync::Mutex<Option<Vehicle>>,
    connect_abort: tokio::sync::Mutex<Option<tokio::task::AbortHandle>>,
}

#[derive(Deserialize)]
struct ConnectRequest {
    endpoint: LinkEndpoint,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum LinkEndpoint {
    Udp {
        bind_addr: String,
    },
    #[cfg(not(target_os = "android"))]
    Serial {
        port: String,
        baud: u32,
    },
    BluetoothBle {
        address: String,
    },
    #[cfg(target_os = "android")]
    BluetoothSpp {
        address: String,
    },
}

#[derive(Serialize, Deserialize, Clone)]
struct BluetoothDevice {
    name: String,
    address: String,
    device_type: String, // "ble" or "classic"
}

// ---------------------------------------------------------------------------
// Connection commands
// ---------------------------------------------------------------------------

#[tauri::command]
async fn connect_link(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    request: ConnectRequest,
) -> Result<(), String> {
    // Abort any in-flight connect attempt so its socket is released
    if let Some(handle) = state.connect_abort.lock().await.take() {
        handle.abort();
    }

    // Disconnect any existing vehicle
    {
        let prev = state.vehicle.lock().await.take();
        if let Some(v) = prev {
            let _ = v.disconnect().await;
        }
    }

    match request.endpoint {
        LinkEndpoint::Udp { bind_addr } => {
            let address = format!("udpin:{bind_addr}");
            let task = tokio::spawn(async move { Vehicle::connect(&address).await });
            *state.connect_abort.lock().await = Some(task.abort_handle());

            let vehicle = task
                .await
                .map_err(|e| {
                    if e.is_cancelled() {
                        "connection cancelled".to_string()
                    } else {
                        e.to_string()
                    }
                })?
                .map_err(|e| e.to_string())?;

            *state.connect_abort.lock().await = None;
            spawn_event_bridges(&app, &vehicle);
            *state.vehicle.lock().await = Some(vehicle);
        }
        #[cfg(not(target_os = "android"))]
        LinkEndpoint::Serial { port, baud } => {
            let address = format!("serial:{port}:{baud}");
            let task = tokio::spawn(async move { Vehicle::connect(&address).await });
            *state.connect_abort.lock().await = Some(task.abort_handle());

            let vehicle = task
                .await
                .map_err(|e| {
                    if e.is_cancelled() {
                        "connection cancelled".to_string()
                    } else {
                        e.to_string()
                    }
                })?
                .map_err(|e| e.to_string())?;

            *state.connect_abort.lock().await = None;
            spawn_event_bridges(&app, &vehicle);
            *state.vehicle.lock().await = Some(vehicle);
        }
        LinkEndpoint::BluetoothBle { address } => {
            let vehicle = connect_ble(&address).await?;
            spawn_event_bridges(&app, &vehicle);
            *state.vehicle.lock().await = Some(vehicle);
        }
        #[cfg(target_os = "android")]
        LinkEndpoint::BluetoothSpp { address } => {
            let vehicle = connect_spp(&app, &address).await?;
            spawn_event_bridges(&app, &vehicle);
            *state.vehicle.lock().await = Some(vehicle);
        }
    }

    Ok(())
}

/// Connect via BLE NUS (Nordic UART Service) using tauri-plugin-blec.
async fn connect_ble(address: &str) -> Result<Vehicle, String> {
    use mavkit::ble_transport::channel_pair;
    use mavkit::stream_connection::StreamConnection;

    let handler =
        tauri_plugin_blec::get_handler().map_err(|e| format!("BLE plugin not initialized: {e}"))?;

    // Standard NUS UUIDs
    let _nus_service = uuid::Uuid::parse_str("6E400001-B5A3-F393-E0A9-E50E24DCCA9E").unwrap();
    let nus_rx = uuid::Uuid::parse_str("6E400002-B5A3-F393-E0A9-E50E24DCCA9E").unwrap(); // write to this
    let nus_tx = uuid::Uuid::parse_str("6E400003-B5A3-F393-E0A9-E50E24DCCA9E").unwrap(); // notify from this

    // Try connecting (device should be in blec's cache from prior scan).
    // On Android, blec has no auto-discover fallback, so if the cache is
    // stale we scan briefly and retry.
    if handler
        .connect(address, tauri_plugin_blec::OnDisconnectHandler::None)
        .await
        .is_err()
    {
        handler
            .discover(None, 3000, tauri_plugin_blec::models::ScanFilter::None)
            .await
            .map_err(|e| format!("BLE scan failed: {e}"))?;
        handler
            .connect(address, tauri_plugin_blec::OnDisconnectHandler::None)
            .await
            .map_err(|e| format!("BLE connect failed: {e}"))?;
    }

    // Set up channel pair for bridging BLE ↔ AsyncRead/AsyncWrite
    let (reader, writer, incoming_tx, mut outgoing_rx) = channel_pair(64);

    // Subscribe to NUS TX notifications → push into incoming channel
    let tx_sender = incoming_tx.clone();
    handler
        .subscribe(nus_tx, move |data: Vec<u8>| {
            let _ = tx_sender.try_send(data);
        })
        .await
        .map_err(|e| format!("BLE subscribe failed: {e}"))?;

    // Spawn task to drain outgoing channel → send via BLE write
    tokio::spawn(async move {
        let handler = match tauri_plugin_blec::get_handler() {
            Ok(h) => h,
            Err(_) => return,
        };
        while let Some(data) = outgoing_rx.recv().await {
            // Chunk to MTU-3 (default 20 bytes for BLE 4.0, larger for 4.2+)
            let mtu = 20usize; // conservative default
            for chunk in data.chunks(mtu) {
                if let Err(e) = handler
                    .send_data(
                        nus_rx,
                        chunk,
                        tauri_plugin_blec::models::WriteType::WithoutResponse,
                    )
                    .await
                {
                    tracing::warn!("BLE write error: {e}");
                    return;
                }
            }
        }
    });

    // Create StreamConnection and build Vehicle
    let connection = StreamConnection::new(reader, writer);
    let connection: Box<
        dyn mavlink::AsyncMavConnection<mavlink::common::MavMessage> + Sync + Send,
    > = Box::new(connection);

    Vehicle::from_connection(connection, VehicleConfig::default())
        .await
        .map_err(|e| format!("Vehicle connection failed: {e}"))
}

/// Connect via Classic SPP on Android using tauri-plugin-bluetooth-classic.
#[cfg(target_os = "android")]
async fn connect_spp(app: &tauri::AppHandle, address: &str) -> Result<Vehicle, String> {
    use base64::Engine;
    use mavkit::ble_transport::channel_pair;
    use mavkit::stream_connection::StreamConnection;
    use tauri::Listener;

    let bt: tauri::State<'_, tauri_plugin_bluetooth_classic::BluetoothClassic<tauri::Wry>> =
        app.state();
    bt.connect(address)
        .map_err(|e: Box<dyn std::error::Error>| e.to_string())?;

    let (reader, writer, incoming_tx, mut outgoing_rx) = channel_pair(64);

    // Listen for incoming data events from the Kotlin plugin
    let tx_sender = incoming_tx.clone();
    app.listen("plugin:bluetooth-classic://data", move |event| {
        if let Ok(payload) = serde_json::from_str::<serde_json::Value>(event.payload()) {
            if let Some(data_b64) = payload.get("data").and_then(|v| v.as_str()) {
                if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(data_b64) {
                    let _ = tx_sender.try_send(bytes);
                }
            }
        }
    });

    // Spawn task to drain outgoing channel → send via Classic BT
    let bt_app = app.clone();
    tokio::spawn(async move {
        while let Some(data) = outgoing_rx.recv().await {
            let bt: tauri::State<'_, tauri_plugin_bluetooth_classic::BluetoothClassic<tauri::Wry>> =
                bt_app.state();
            if let Err(e) = bt.send(&data) {
                tracing::warn!("SPP write error: {e}");
                return;
            }
        }
    });

    let connection = StreamConnection::new(reader, writer);
    let connection: Box<
        dyn mavlink::AsyncMavConnection<mavlink::common::MavMessage> + Sync + Send,
    > = Box::new(connection);

    Vehicle::from_connection(connection, VehicleConfig::default())
        .await
        .map_err(|e| format!("Vehicle connection failed: {e}"))
}

#[tauri::command]
async fn disconnect_link(state: tauri::State<'_, AppState>) -> Result<(), String> {
    // Abort any in-flight connect attempt
    if let Some(handle) = state.connect_abort.lock().await.take() {
        handle.abort();
    }

    let vehicle = state.vehicle.lock().await.take();
    if let Some(v) = vehicle {
        v.disconnect().await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Pure commands (no connection needed)
// ---------------------------------------------------------------------------

#[cfg(not(target_os = "android"))]
#[tauri::command]
fn list_serial_ports_cmd() -> Result<Vec<String>, String> {
    let ports = serialport::available_ports().map_err(|e| e.to_string())?;
    Ok(ports.into_iter().map(|p| p.port_name).collect())
}

#[tauri::command]
fn mission_validate_plan(plan: MissionPlan) -> Vec<MissionIssue> {
    validate_plan(&plan)
}

#[tauri::command]
fn available_transports() -> Vec<&'static str> {
    let mut t = vec!["udp"];
    #[cfg(not(target_os = "android"))]
    t.push("serial");
    t.push("bluetooth_ble");
    #[cfg(target_os = "android")]
    t.push("bluetooth_spp");
    t
}

// ---------------------------------------------------------------------------
// Bluetooth permissions
// ---------------------------------------------------------------------------

/// Request Android runtime permissions for Bluetooth (CONNECT, SCAN, LOCATION).
/// No-op on desktop. Covers both BLE and Classic transports.
#[cfg(target_os = "android")]
#[tauri::command]
async fn bt_request_permissions(app: tauri::AppHandle) -> Result<(), String> {
    let bt: tauri::State<'_, tauri_plugin_bluetooth_classic::BluetoothClassic<tauri::Wry>> =
        app.state();
    bt.request_bt_permissions()
        .map_err(|e: Box<dyn std::error::Error>| e.to_string())?;
    Ok(())
}

#[cfg(not(target_os = "android"))]
#[tauri::command]
async fn bt_request_permissions() -> Result<(), String> {
    Ok(())
}

// ---------------------------------------------------------------------------
// BLE commands
// ---------------------------------------------------------------------------

#[tauri::command]
async fn bt_scan_ble(timeout_ms: Option<u64>) -> Result<Vec<BluetoothDevice>, String> {
    use tauri_plugin_blec::models::ScanFilter;

    let handler =
        tauri_plugin_blec::get_handler().map_err(|e| format!("BLE plugin not initialized: {e}"))?;

    let (tx, mut rx) = tokio::sync::mpsc::channel(8);
    let timeout = timeout_ms.unwrap_or(3000);

    handler
        .discover(Some(tx), timeout, ScanFilter::None)
        .await
        .map_err(|e| format!("BLE scan failed: {e}"))?;

    // Collect all discovered devices from the channel
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
                });
            }
        }
    }

    Ok(devices)
}

#[tauri::command]
async fn bt_stop_scan_ble() -> Result<(), String> {
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
async fn bt_get_bonded_devices(app: tauri::AppHandle) -> Result<Vec<BluetoothDevice>, String> {
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
        })
        .collect())
}

// ---------------------------------------------------------------------------
// Vehicle commands
// ---------------------------------------------------------------------------

#[tauri::command]
async fn arm_vehicle(state: tauri::State<'_, AppState>, force: bool) -> Result<(), String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    vehicle.arm(force).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn disarm_vehicle(state: tauri::State<'_, AppState>, force: bool) -> Result<(), String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    vehicle.disarm(force).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_flight_mode(
    state: tauri::State<'_, AppState>,
    custom_mode: u32,
) -> Result<(), String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    vehicle
        .set_mode(custom_mode)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn vehicle_takeoff(state: tauri::State<'_, AppState>, altitude_m: f32) -> Result<(), String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    vehicle.takeoff(altitude_m).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn vehicle_guided_goto(
    state: tauri::State<'_, AppState>,
    lat_deg: f64,
    lon_deg: f64,
    alt_m: f32,
) -> Result<(), String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    vehicle
        .goto(lat_deg, lon_deg, alt_m)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_available_modes(state: tauri::State<'_, AppState>) -> Result<Vec<FlightMode>, String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    Ok(vehicle.available_modes())
}

// ---------------------------------------------------------------------------
// Settings commands
// ---------------------------------------------------------------------------

#[tauri::command]
fn set_telemetry_rate(rate_hz: u32) -> Result<(), String> {
    if rate_hz == 0 || rate_hz > 20 {
        return Err("rate_hz must be between 1 and 20".into());
    }
    TELEMETRY_INTERVAL_MS.store(1000 / rate_hz as u64, Ordering::Relaxed);
    Ok(())
}

// ---------------------------------------------------------------------------
// Mission commands
// ---------------------------------------------------------------------------

#[tauri::command]
async fn mission_upload_plan(
    state: tauri::State<'_, AppState>,
    plan: MissionPlan,
) -> Result<(), String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    vehicle
        .mission()
        .upload(plan)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn mission_download_plan(
    state: tauri::State<'_, AppState>,
    mission_type: MissionType,
) -> Result<MissionPlan, String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    vehicle
        .mission()
        .download(mission_type)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn mission_clear_plan(
    state: tauri::State<'_, AppState>,
    mission_type: MissionType,
) -> Result<(), String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    vehicle
        .mission()
        .clear(mission_type)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn mission_verify_roundtrip(
    state: tauri::State<'_, AppState>,
    plan: MissionPlan,
) -> Result<bool, String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    vehicle
        .mission()
        .verify_roundtrip(plan)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn mission_set_current(state: tauri::State<'_, AppState>, seq: u16) -> Result<(), String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    vehicle
        .mission()
        .set_current(seq)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn mission_cancel(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    vehicle.mission().cancel_transfer();
    Ok(())
}

// ---------------------------------------------------------------------------
// Parameter commands
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Calibration commands
// ---------------------------------------------------------------------------

#[tauri::command]
async fn calibrate_accel(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    vehicle
        .preflight_calibration(false, true, false)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn calibrate_gyro(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    vehicle
        .preflight_calibration(true, false, false)
        .await
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Parameter commands
// ---------------------------------------------------------------------------

#[tauri::command]
async fn param_download_all(state: tauri::State<'_, AppState>) -> Result<ParamStore, String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    vehicle
        .params()
        .download_all()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn param_write(
    state: tauri::State<'_, AppState>,
    name: String,
    value: f32,
) -> Result<Param, String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    vehicle
        .params()
        .write(name, value)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn param_write_batch(
    state: tauri::State<'_, AppState>,
    params: Vec<(String, f32)>,
) -> Result<Vec<ParamWriteResult>, String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    vehicle
        .params()
        .write_batch(params)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn param_parse_file(contents: String) -> Result<HashMap<String, f32>, String> {
    parse_param_file(&contents)
}

#[tauri::command]
fn param_format_file(store: ParamStore) -> String {
    format_param_file(&store)
}

// ---------------------------------------------------------------------------
// Watch → Tauri event bridges
// ---------------------------------------------------------------------------

fn spawn_event_bridges(app: &tauri::AppHandle, vehicle: &Vehicle) {
    // Telemetry — throttled by TELEMETRY_INTERVAL_MS (re-read each loop for live rate changes)
    {
        let mut rx = vehicle.telemetry();
        let handle = app.clone();
        tokio::spawn(async move {
            loop {
                let ms = TELEMETRY_INTERVAL_MS.load(Ordering::Relaxed);
                tokio::time::sleep(Duration::from_millis(ms)).await;
                match rx.has_changed() {
                    Ok(true) => {
                        let t: Telemetry = rx.borrow_and_update().clone();
                        let _ = handle.emit("telemetry://tick", &t);
                    }
                    Ok(false) => {}
                    Err(_) => break,
                }
            }
        });
    }

    // VehicleState
    {
        let mut rx = vehicle.state();
        let handle = app.clone();
        tokio::spawn(async move {
            while rx.changed().await.is_ok() {
                let s: VehicleState = rx.borrow().clone();
                let _ = handle.emit("vehicle://state", &s);
            }
        });
    }

    // HomePosition
    {
        let mut rx = vehicle.home_position();
        let handle = app.clone();
        tokio::spawn(async move {
            while rx.changed().await.is_ok() {
                let hp: Option<HomePosition> = rx.borrow().clone();
                if let Some(hp) = hp {
                    let _ = handle.emit("home://position", &hp);
                }
            }
        });
    }

    // MissionState
    {
        let mut rx = vehicle.mission_state();
        let handle = app.clone();
        tokio::spawn(async move {
            while rx.changed().await.is_ok() {
                let ms = rx.borrow().clone();
                let _ = handle.emit("mission.state", &ms);
            }
        });
    }

    // LinkState
    {
        let mut rx = vehicle.link_state();
        let handle = app.clone();
        tokio::spawn(async move {
            while rx.changed().await.is_ok() {
                let ls: LinkState = rx.borrow().clone();
                let _ = handle.emit("link://state", &ls);
            }
        });
    }

    // MissionProgress
    {
        let mut rx = vehicle.mission_progress();
        let handle = app.clone();
        tokio::spawn(async move {
            while rx.changed().await.is_ok() {
                let mp: Option<TransferProgress> = rx.borrow().clone();
                if let Some(mp) = mp {
                    let _ = handle.emit("mission.progress", &mp);
                }
            }
        });
    }

    // ParamStore
    {
        let mut rx = vehicle.param_store();
        let handle = app.clone();
        tokio::spawn(async move {
            while rx.changed().await.is_ok() {
                let ps: ParamStore = rx.borrow().clone();
                let _ = handle.emit("param://store", &ps);
            }
        });
    }

    // ParamProgress
    {
        let mut rx = vehicle.param_progress();
        let handle = app.clone();
        tokio::spawn(async move {
            while rx.changed().await.is_ok() {
                let pp: ParamProgress = rx.borrow().clone();
                let _ = handle.emit("param://progress", &pp);
            }
        });
    }

    // StatusText
    {
        let mut rx = vehicle.statustext();
        let handle = app.clone();
        tokio::spawn(async move {
            while rx.changed().await.is_ok() {
                let msg: Option<StatusMessage> = rx.borrow().clone();
                if let Some(msg) = msg {
                    let _ = handle.emit("statustext://message", &msg);
                }
            }
        });
    }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = AppState {
        vehicle: tokio::sync::Mutex::new(None),
        connect_abort: tokio::sync::Mutex::new(None),
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
            calibrate_gyro
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
            calibrate_gyro
        ]);
    }

    builder
        .setup(|_app| {
            // Set window + webview background to match the dark theme so there's
            // no white flash before the frontend CSS loads.
            #[cfg(desktop)]
            {
                use tauri::Manager;
                let bg = tauri::utils::config::Color(18, 23, 29, 255); // #12171d
                if let Some(w) = _app.get_webview_window("main") {
                    let _ = w.set_background_color(Some(bg));
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
