use mavkit::{
    format_param_file, parse_param_file,
    tlog::{TlogEntry, TlogFile, TlogWriter},
    validate_plan, FlightMode, HomePosition, LinkState, MissionIssue, MissionPlan, MissionType,
    Param, ParamProgress, ParamStore, ParamWriteResult, StatusMessage, Telemetry,
    TransferProgress, Vehicle, VehicleConfig, VehicleState,
};
use mavlink::{common::MavMessage, MavlinkVersion, Message};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::BufWriter;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::Emitter;
#[cfg(target_os = "android")]
use tauri::Manager;

static TELEMETRY_INTERVAL_MS: AtomicU64 = AtomicU64::new(200);

struct AppState {
    vehicle: tokio::sync::Mutex<Option<Vehicle>>,
    connect_abort: tokio::sync::Mutex<Option<tokio::task::AbortHandle>>,
    log_store: tokio::sync::Mutex<Option<LogStore>>,
    recorder: TlogRecorderHandle,
}

// ---------------------------------------------------------------------------
// TLOG recording
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone)]
#[serde(rename_all = "snake_case")]
enum RecordingStatus {
    Idle,
    Recording {
        file_name: String,
        bytes_written: u64,
    },
}

enum RecorderState {
    Idle,
    Recording {
        cancel: tokio::sync::oneshot::Sender<()>,
        file_name: String,
        bytes_written: Arc<AtomicU64>,
    },
}

struct TlogRecorderHandle {
    state: std::sync::Mutex<RecorderState>,
}

impl TlogRecorderHandle {
    fn new() -> Self {
        Self {
            state: std::sync::Mutex::new(RecorderState::Idle),
        }
    }

    fn start(&self, vehicle: &Vehicle, path: &str) -> Result<String, String> {
        let mut guard = self.state.lock().unwrap();
        if matches!(*guard, RecorderState::Recording { .. }) {
            return Err("already recording".into());
        }

        let file =
            std::fs::File::create(path).map_err(|e| format!("failed to create file: {e}"))?;
        let writer = BufWriter::new(file);
        let mut tlog_writer = TlogWriter::new(writer, MavlinkVersion::V2);

        let file_name = std::path::Path::new(path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string());

        let bytes_written = Arc::new(AtomicU64::new(0));
        let bytes_counter = bytes_written.clone();
        let mut rx = vehicle.raw_messages();
        let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel();

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = &mut cancel_rx => break,
                    result = rx.recv() => {
                        match result {
                            Ok((header, msg)) => {
                                match tlog_writer.write_now(&header, &msg) {
                                    Ok(n) => {
                                        bytes_counter.fetch_add(n as u64, Ordering::Relaxed);
                                    }
                                    Err(e) => {
                                        tracing::warn!("tlog write error: {e}");
                                        break;
                                    }
                                }
                            }
                            Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                                tracing::warn!("tlog recorder lagged, skipped {n} messages");
                            }
                            Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                        }
                    }
                }
            }
            let _ = tlog_writer.flush();
        });

        let name = file_name.clone();
        *guard = RecorderState::Recording {
            cancel: cancel_tx,
            file_name,
            bytes_written,
        };
        Ok(name)
    }

    fn stop(&self) {
        let mut guard = self.state.lock().unwrap();
        if let RecorderState::Recording { cancel, .. } =
            std::mem::replace(&mut *guard, RecorderState::Idle)
        {
            let _ = cancel.send(());
        }
    }

    fn status(&self) -> RecordingStatus {
        let guard = self.state.lock().unwrap();
        match &*guard {
            RecorderState::Idle => RecordingStatus::Idle,
            RecorderState::Recording {
                file_name,
                bytes_written,
                ..
            } => RecordingStatus::Recording {
                file_name: file_name.clone(),
                bytes_written: bytes_written.load(Ordering::Relaxed),
            },
        }
    }
}

// ---------------------------------------------------------------------------
// Log types
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
enum LogType {
    Tlog,
    Bin,
}

#[derive(Serialize, Clone)]
struct LogSummary {
    file_name: String,
    start_usec: u64,
    end_usec: u64,
    duration_secs: f64,
    total_entries: usize,
    message_types: HashMap<String, usize>,
    log_type: LogType,
}

#[derive(Serialize, Clone)]
struct LogDataPoint {
    timestamp_usec: u64,
    fields: HashMap<String, f64>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "snake_case")]
enum LogLoadPhase {
    Parsing,
    Indexing,
    Completed,
}

#[derive(Serialize, Clone)]
struct LogProgress {
    phase: LogLoadPhase,
    parsed: usize,
}

struct StoredEntry {
    timestamp_usec: u64,
    msg_name: String,
    fields: HashMap<String, f64>,
}

struct LogStore {
    summary: LogSummary,
    entries: Vec<StoredEntry>,
    type_index: HashMap<String, Vec<usize>>,
}

fn extract_fields(msg: &MavMessage) -> (String, HashMap<String, f64>) {
    let name = msg.message_name().to_string();
    let mut fields = HashMap::new();

    match msg {
        MavMessage::ATTITUDE(d) => {
            fields.insert("roll".into(), d.roll as f64);
            fields.insert("pitch".into(), d.pitch as f64);
            fields.insert("yaw".into(), d.yaw as f64);
            fields.insert("rollspeed".into(), d.rollspeed as f64);
            fields.insert("pitchspeed".into(), d.pitchspeed as f64);
            fields.insert("yawspeed".into(), d.yawspeed as f64);
        }
        MavMessage::VFR_HUD(d) => {
            fields.insert("airspeed".into(), d.airspeed as f64);
            fields.insert("groundspeed".into(), d.groundspeed as f64);
            fields.insert("heading".into(), d.heading as f64);
            fields.insert("throttle".into(), d.throttle as f64);
            fields.insert("alt".into(), d.alt as f64);
            fields.insert("climb".into(), d.climb as f64);
        }
        MavMessage::GLOBAL_POSITION_INT(d) => {
            fields.insert("lat".into(), d.lat as f64 / 1e7);
            fields.insert("lon".into(), d.lon as f64 / 1e7);
            fields.insert("alt".into(), d.alt as f64 / 1000.0);
            fields.insert("relative_alt".into(), d.relative_alt as f64 / 1000.0);
            fields.insert("vx".into(), d.vx as f64 / 100.0);
            fields.insert("vy".into(), d.vy as f64 / 100.0);
            fields.insert("vz".into(), d.vz as f64 / 100.0);
            fields.insert("hdg".into(), d.hdg as f64 / 100.0);
        }
        MavMessage::SYS_STATUS(d) => {
            fields.insert("voltage_battery".into(), d.voltage_battery as f64 / 1000.0);
            fields.insert("current_battery".into(), d.current_battery as f64 / 100.0);
            fields.insert("battery_remaining".into(), d.battery_remaining as f64);
            fields.insert("load".into(), d.load as f64 / 10.0);
        }
        MavMessage::GPS_RAW_INT(d) => {
            fields.insert("lat".into(), d.lat as f64 / 1e7);
            fields.insert("lon".into(), d.lon as f64 / 1e7);
            fields.insert("alt".into(), d.alt as f64 / 1000.0);
            fields.insert("fix_type".into(), d.fix_type as u8 as f64);
            fields.insert("satellites_visible".into(), d.satellites_visible as f64);
            fields.insert("eph".into(), d.eph as f64 / 100.0);
            fields.insert("epv".into(), d.epv as f64 / 100.0);
        }
        MavMessage::HEARTBEAT(d) => {
            fields.insert("custom_mode".into(), d.custom_mode as f64);
            fields.insert("base_mode".into(), d.base_mode.bits() as f64);
            fields.insert("system_status".into(), d.system_status as u8 as f64);
        }
        MavMessage::RC_CHANNELS(d) => {
            fields.insert("chan1_raw".into(), d.chan1_raw as f64);
            fields.insert("chan2_raw".into(), d.chan2_raw as f64);
            fields.insert("chan3_raw".into(), d.chan3_raw as f64);
            fields.insert("chan4_raw".into(), d.chan4_raw as f64);
            fields.insert("chan5_raw".into(), d.chan5_raw as f64);
            fields.insert("chan6_raw".into(), d.chan6_raw as f64);
            fields.insert("chan7_raw".into(), d.chan7_raw as f64);
            fields.insert("chan8_raw".into(), d.chan8_raw as f64);
            fields.insert("chancount".into(), d.chancount as f64);
            fields.insert("rssi".into(), d.rssi as f64);
        }
        MavMessage::SERVO_OUTPUT_RAW(d) => {
            fields.insert("servo1_raw".into(), d.servo1_raw as f64);
            fields.insert("servo2_raw".into(), d.servo2_raw as f64);
            fields.insert("servo3_raw".into(), d.servo3_raw as f64);
            fields.insert("servo4_raw".into(), d.servo4_raw as f64);
            fields.insert("servo5_raw".into(), d.servo5_raw as f64);
            fields.insert("servo6_raw".into(), d.servo6_raw as f64);
            fields.insert("servo7_raw".into(), d.servo7_raw as f64);
            fields.insert("servo8_raw".into(), d.servo8_raw as f64);
        }
        MavMessage::BATTERY_STATUS(d) => {
            fields.insert("current_battery".into(), d.current_battery as f64 / 100.0);
            fields.insert(
                "current_consumed".into(),
                d.current_consumed as f64,
            );
            fields.insert("energy_consumed".into(), d.energy_consumed as f64);
            fields.insert("battery_remaining".into(), d.battery_remaining as f64);
        }
        MavMessage::NAV_CONTROLLER_OUTPUT(d) => {
            fields.insert("nav_roll".into(), d.nav_roll as f64);
            fields.insert("nav_pitch".into(), d.nav_pitch as f64);
            fields.insert("nav_bearing".into(), d.nav_bearing as f64);
            fields.insert("target_bearing".into(), d.target_bearing as f64);
            fields.insert("wp_dist".into(), d.wp_dist as f64);
            fields.insert("alt_error".into(), d.alt_error as f64);
            fields.insert("xtrack_error".into(), d.xtrack_error as f64);
        }
        _ => {}
    }

    (name, fields)
}

fn tlog_to_stored(entry: &TlogEntry) -> StoredEntry {
    let (name, fields) = extract_fields(&entry.message);
    StoredEntry {
        timestamp_usec: entry.timestamp_usec,
        msg_name: name,
        fields,
    }
}

fn bin_to_stored(entry: &ardupilot_binlog::Entry) -> Option<StoredEntry> {
    let ts = entry.timestamp_usec?;
    let fields: HashMap<String, f64> = entry
        .fields()
        .filter_map(|(k, v)| v.as_f64().map(|f| (k.to_string(), f)))
        .collect();
    Some(StoredEntry {
        timestamp_usec: ts,
        msg_name: entry.name.clone(),
        fields,
    })
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
    Tcp {
        address: String,
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
        LinkEndpoint::Tcp { address } => {
            let addr = format!("tcpout:{address}");
            let task = tokio::spawn(async move { Vehicle::connect(&addr).await });
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
    // Stop any active recording before disconnecting
    state.recorder.stop();

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
    let mut t = vec!["udp", "tcp"];
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
// Log commands
// ---------------------------------------------------------------------------

#[tauri::command]
async fn log_open(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    path: String,
) -> Result<LogSummary, String> {
    // Close any existing log
    *state.log_store.lock().await = None;

    let _ = app.emit(
        "log://progress",
        LogProgress {
            phase: LogLoadPhase::Parsing,
            parsed: 0,
        },
    );

    let is_bin = path.ends_with(".bin") || path.ends_with(".BIN");

    let (stored_entries, start_usec, end_usec, log_type) = if is_bin {
        // BIN log: sync parser via spawn_blocking
        let path_clone = path.clone();
        let (bin_entries, time_range) = tokio::task::spawn_blocking(move || {
            let file =
                ardupilot_binlog::File::open(&path_clone).map_err(|e| e.to_string())?;
            let time_range = file.time_range().map_err(|e| e.to_string())?;
            let entries: Vec<ardupilot_binlog::Entry> = file
                .entries()
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            Ok::<_, String>((entries, time_range))
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e: String| e)?;

        let total_parsed = bin_entries.len();
        let _ = app.emit(
            "log://progress",
            LogProgress {
                phase: LogLoadPhase::Parsing,
                parsed: total_parsed,
            },
        );

        let stored: Vec<StoredEntry> =
            bin_entries.iter().filter_map(bin_to_stored).collect();

        let (start, end) = match time_range {
            Some((s, e)) => (s, e),
            None if !stored.is_empty() => (
                stored.first().unwrap().timestamp_usec,
                stored.last().unwrap().timestamp_usec,
            ),
            _ => (0, 0),
        };

        (stored, start, end, LogType::Bin)
    } else {
        // TLOG
        let tlog = TlogFile::open(&path).await.map_err(|e| e.to_string())?;
        let reader = tlog.entries().await.map_err(|e| e.to_string())?;
        let all_entries = reader.collect().await.map_err(|e| e.to_string())?;

        let total_parsed = all_entries.len();
        let _ = app.emit(
            "log://progress",
            LogProgress {
                phase: LogLoadPhase::Parsing,
                parsed: total_parsed,
            },
        );

        let (start, end) = if total_parsed > 0 {
            (
                all_entries[0].timestamp_usec,
                all_entries[total_parsed - 1].timestamp_usec,
            )
        } else {
            (0, 0)
        };

        let stored: Vec<StoredEntry> = all_entries.iter().map(tlog_to_stored).collect();
        (stored, start, end, LogType::Tlog)
    };

    let _ = app.emit(
        "log://progress",
        LogProgress {
            phase: LogLoadPhase::Indexing,
            parsed: stored_entries.len(),
        },
    );

    // Build index and count message types
    let mut type_index: HashMap<String, Vec<usize>> = HashMap::new();
    let mut message_types: HashMap<String, usize> = HashMap::new();
    for (i, entry) in stored_entries.iter().enumerate() {
        type_index
            .entry(entry.msg_name.clone())
            .or_default()
            .push(i);
        *message_types.entry(entry.msg_name.clone()).or_insert(0) += 1;

        if (i + 1) % 5000 == 0 {
            let _ = app.emit(
                "log://progress",
                LogProgress {
                    phase: LogLoadPhase::Indexing,
                    parsed: i + 1,
                },
            );
        }
    }

    let total = stored_entries.len();

    let duration_secs = if end_usec > start_usec {
        (end_usec - start_usec) as f64 / 1_000_000.0
    } else {
        0.0
    };

    let file_name = std::path::Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());

    let summary = LogSummary {
        file_name,
        start_usec,
        end_usec,
        duration_secs,
        total_entries: total,
        message_types,
        log_type,
    };

    let store = LogStore {
        summary: summary.clone(),
        entries: stored_entries,
        type_index,
    };

    *state.log_store.lock().await = Some(store);

    let _ = app.emit(
        "log://progress",
        LogProgress {
            phase: LogLoadPhase::Completed,
            parsed: total,
        },
    );

    Ok(summary)
}

#[tauri::command]
async fn log_query(
    state: tauri::State<'_, AppState>,
    msg_type: String,
    start_usec: Option<u64>,
    end_usec: Option<u64>,
    max_points: Option<usize>,
) -> Result<Vec<LogDataPoint>, String> {
    let guard = state.log_store.lock().await;
    let store = guard.as_ref().ok_or("no log loaded")?;

    let indices = store
        .type_index
        .get(&msg_type)
        .ok_or_else(|| format!("no entries for message type: {msg_type}"))?;

    let mut points: Vec<LogDataPoint> = Vec::new();
    for &idx in indices {
        let entry = &store.entries[idx];
        let ts = entry.timestamp_usec;
        if let Some(start) = start_usec {
            if ts < start {
                continue;
            }
        }
        if let Some(end) = end_usec {
            if ts > end {
                continue;
            }
        }
        points.push(LogDataPoint {
            timestamp_usec: ts,
            fields: entry.fields.clone(),
        });
    }

    // Downsample if needed
    if let Some(max) = max_points {
        if points.len() > max && max > 0 {
            let step = points.len() as f64 / max as f64;
            let mut sampled = Vec::with_capacity(max);
            let mut i = 0.0;
            while (i as usize) < points.len() && sampled.len() < max {
                sampled.push(points[i as usize].clone());
                i += step;
            }
            return Ok(sampled);
        }
    }

    Ok(points)
}

#[derive(Serialize, Clone)]
struct FlightPathPoint {
    timestamp_usec: u64,
    lat: f64,
    lon: f64,
    alt: f64,
    heading: f64,
}

// ---------------------------------------------------------------------------
// Telemetry track for playback (carry-forward merged snapshots)
// ---------------------------------------------------------------------------

#[derive(Serialize, Clone, Default)]
struct TelemetrySnapshot {
    timestamp_usec: u64,
    // Position
    latitude_deg: Option<f64>,
    longitude_deg: Option<f64>,
    altitude_m: Option<f64>,
    heading_deg: Option<f64>,
    // Speed
    speed_mps: Option<f64>,
    airspeed_mps: Option<f64>,
    climb_rate_mps: Option<f64>,
    // Attitude
    roll_deg: Option<f64>,
    pitch_deg: Option<f64>,
    yaw_deg: Option<f64>,
    // Battery
    battery_pct: Option<f64>,
    battery_voltage_v: Option<f64>,
    battery_current_a: Option<f64>,
    energy_consumed_wh: Option<f64>,
    // GPS
    gps_fix_type: Option<String>,
    gps_satellites: Option<f64>,
    gps_hdop: Option<f64>,
    // Control
    throttle_pct: Option<f64>,
    // Navigation
    wp_dist_m: Option<f64>,
    nav_bearing_deg: Option<f64>,
    target_bearing_deg: Option<f64>,
    xtrack_error_m: Option<f64>,
    // Vehicle state
    armed: Option<bool>,
    custom_mode: Option<u32>,
    // RC / Servo
    rc_channels: Option<Vec<f64>>,
    rc_rssi: Option<f64>,
    servo_outputs: Option<Vec<f64>>,
}

fn gps_fix_type_name(val: f64) -> String {
    match val as u8 {
        0 => "No GPS".into(),
        1 => "No Fix".into(),
        2 => "2D Fix".into(),
        3 => "3D Fix".into(),
        4 => "DGPS".into(),
        5 => "RTK Float".into(),
        6 => "RTK Fixed".into(),
        _ => format!("Fix({})", val as u8),
    }
}

fn apply_tlog_entry(snap: &mut TelemetrySnapshot, entry: &StoredEntry) {
    let f = &entry.fields;
    match entry.msg_name.as_str() {
        "ATTITUDE" => {
            snap.roll_deg = f.get("roll").map(|v| v.to_degrees());
            snap.pitch_deg = f.get("pitch").map(|v| v.to_degrees());
            snap.yaw_deg = f.get("yaw").map(|v| v.to_degrees());
        }
        "VFR_HUD" => {
            snap.altitude_m = f.get("alt").copied();
            snap.speed_mps = f.get("groundspeed").copied();
            snap.heading_deg = f.get("heading").copied();
            snap.climb_rate_mps = f.get("climb").copied();
            snap.throttle_pct = f.get("throttle").copied();
            snap.airspeed_mps = f.get("airspeed").copied();
        }
        "GLOBAL_POSITION_INT" => {
            // Already scaled to degrees and meters in extract_fields
            snap.latitude_deg = f.get("lat").copied();
            snap.longitude_deg = f.get("lon").copied();
            if snap.altitude_m.is_none() {
                snap.altitude_m = f.get("relative_alt").copied();
            }
            if snap.heading_deg.is_none() {
                snap.heading_deg = f.get("hdg").copied();
            }
        }
        "SYS_STATUS" => {
            snap.battery_voltage_v = f.get("voltage_battery").copied();
            snap.battery_current_a = f.get("current_battery").copied();
            snap.battery_pct = f.get("battery_remaining").copied();
        }
        "GPS_RAW_INT" => {
            snap.gps_fix_type = f.get("fix_type").map(|v| gps_fix_type_name(*v));
            snap.gps_satellites = f.get("satellites_visible").copied();
            snap.gps_hdop = f.get("eph").copied();
        }
        "HEARTBEAT" => {
            snap.custom_mode = f.get("custom_mode").map(|v| *v as u32);
            snap.armed = f
                .get("base_mode")
                .map(|v| (*v as u32) & 0x80 != 0);
        }
        "NAV_CONTROLLER_OUTPUT" => {
            snap.nav_bearing_deg = f.get("nav_bearing").copied();
            snap.target_bearing_deg = f.get("target_bearing").copied();
            snap.wp_dist_m = f.get("wp_dist").copied();
            snap.xtrack_error_m = f.get("xtrack_error").copied();
        }
        "RC_CHANNELS" => {
            let chans: Vec<f64> = (1..=8)
                .filter_map(|i| f.get(&format!("chan{i}_raw")).copied())
                .collect();
            if !chans.is_empty() {
                snap.rc_channels = Some(chans);
            }
            snap.rc_rssi = f.get("rssi").copied();
        }
        "SERVO_OUTPUT_RAW" => {
            let servos: Vec<f64> = (1..=8)
                .filter_map(|i| f.get(&format!("servo{i}_raw")).copied())
                .collect();
            if !servos.is_empty() {
                snap.servo_outputs = Some(servos);
            }
        }
        "BATTERY_STATUS" => {
            snap.energy_consumed_wh = f.get("energy_consumed").copied();
            // Prefer SYS_STATUS for voltage/current but fallback here
            if snap.battery_voltage_v.is_none() {
                snap.battery_voltage_v = f.get("current_battery").copied();
            }
        }
        _ => {}
    }
}

fn apply_bin_entry(snap: &mut TelemetrySnapshot, entry: &StoredEntry) {
    let f = &entry.fields;
    match entry.msg_name.as_str() {
        "ATT" => {
            snap.roll_deg = f.get("Roll").copied();
            snap.pitch_deg = f.get("Pitch").copied();
            snap.yaw_deg = f.get("Yaw").copied();
        }
        "CTUN" => {
            snap.altitude_m = f.get("Alt").copied();
            snap.climb_rate_mps = f.get("CRt").copied();
        }
        "GPS" => {
            snap.latitude_deg = f.get("Lat").map(|v| v / 1e7);
            snap.longitude_deg = f.get("Lng").map(|v| v / 1e7);
            snap.speed_mps = f.get("Spd").copied();
            snap.heading_deg = f.get("GCrs").copied();
            snap.gps_fix_type = f.get("Status").map(|v| gps_fix_type_name(*v));
            snap.gps_satellites = f.get("NSats").copied();
            snap.gps_hdop = f.get("HDop").copied();
        }
        "BAT" => {
            snap.battery_voltage_v = f.get("Volt").copied();
            snap.battery_current_a = f.get("Curr").copied();
            snap.battery_pct = f.get("Rem").copied();
        }
        "MODE" => {
            snap.custom_mode = f.get("ModeNum").map(|v| *v as u32);
        }
        "RCIN" => {
            let chans: Vec<f64> = (1..=8)
                .filter_map(|i| f.get(&format!("C{i}")).copied())
                .collect();
            if !chans.is_empty() {
                snap.rc_channels = Some(chans);
            }
        }
        "RCOU" => {
            let servos: Vec<f64> = (1..=8)
                .filter_map(|i| f.get(&format!("C{i}")).copied())
                .collect();
            if !servos.is_empty() {
                snap.servo_outputs = Some(servos);
            }
        }
        _ => {}
    }
}

#[tauri::command]
async fn log_get_flight_path(
    state: tauri::State<'_, AppState>,
    max_points: Option<usize>,
) -> Result<Vec<FlightPathPoint>, String> {
    let guard = state.log_store.lock().await;
    let store = guard.as_ref().ok_or("no log loaded")?;

    // Detect which GPS message type exists
    let gps_type = if store.type_index.contains_key("GLOBAL_POSITION_INT") {
        "GLOBAL_POSITION_INT"
    } else if store.type_index.contains_key("GPS") {
        "GPS"
    } else {
        return Err("no GPS data in log".into());
    };

    let (lat_key, lon_key, alt_key, hdg_key, needs_dege7_scale) =
        match store.summary.log_type {
            LogType::Tlog => ("lat", "lon", "relative_alt", "hdg", false),
            LogType::Bin => ("Lat", "Lng", "Alt", "GCrs", true),
        };

    let indices = &store.type_index[gps_type];
    let mut points: Vec<FlightPathPoint> = Vec::with_capacity(indices.len());
    for &idx in indices {
        let entry = &store.entries[idx];
        let mut lat = entry.fields.get(lat_key).copied().unwrap_or(0.0);
        let mut lon = entry.fields.get(lon_key).copied().unwrap_or(0.0);
        if needs_dege7_scale {
            lat /= 1e7;
            lon /= 1e7;
        }
        // Skip zero-position entries (no fix)
        if lat.abs() < 1e-6 && lon.abs() < 1e-6 {
            continue;
        }
        points.push(FlightPathPoint {
            timestamp_usec: entry.timestamp_usec,
            lat,
            lon,
            alt: entry.fields.get(alt_key).copied().unwrap_or(0.0),
            heading: entry.fields.get(hdg_key).copied().unwrap_or(0.0),
        });
    }

    // Downsample if needed
    if let Some(max) = max_points {
        if points.len() > max && max > 0 {
            let step = points.len() as f64 / max as f64;
            let mut sampled = Vec::with_capacity(max);
            let mut i = 0.0;
            while (i as usize) < points.len() && sampled.len() < max {
                sampled.push(points[i as usize].clone());
                i += step;
            }
            return Ok(sampled);
        }
    }

    Ok(points)
}

const TELEMETRY_TRACK_INTERVAL_USEC: u64 = 100_000; // 10 Hz snapshots

#[tauri::command]
async fn log_get_telemetry_track(
    state: tauri::State<'_, AppState>,
    max_points: Option<usize>,
) -> Result<Vec<TelemetrySnapshot>, String> {
    let guard = state.log_store.lock().await;
    let store = guard.as_ref().ok_or("no log loaded")?;

    let is_bin = store.summary.log_type == LogType::Bin;
    let mut running = TelemetrySnapshot::default();
    let mut track: Vec<TelemetrySnapshot> = Vec::new();
    let mut last_emit: u64 = 0;

    for entry in &store.entries {
        if is_bin {
            apply_bin_entry(&mut running, entry);
        } else {
            apply_tlog_entry(&mut running, entry);
        }

        if entry.timestamp_usec >= last_emit + TELEMETRY_TRACK_INTERVAL_USEC || track.is_empty() {
            let mut snap = running.clone();
            snap.timestamp_usec = entry.timestamp_usec;
            track.push(snap);
            last_emit = entry.timestamp_usec;
        }
    }

    if let Some(max) = max_points {
        if track.len() > max && max > 0 {
            let step = track.len() as f64 / max as f64;
            let mut sampled = Vec::with_capacity(max);
            let mut i = 0.0;
            while (i as usize) < track.len() && sampled.len() < max {
                sampled.push(track[i as usize].clone());
                i += step;
            }
            return Ok(sampled);
        }
    }

    Ok(track)
}

#[tauri::command]
async fn log_get_summary(state: tauri::State<'_, AppState>) -> Result<Option<LogSummary>, String> {
    let guard = state.log_store.lock().await;
    Ok(guard.as_ref().map(|s| s.summary.clone()))
}

#[tauri::command]
async fn log_close(state: tauri::State<'_, AppState>) -> Result<(), String> {
    *state.log_store.lock().await = None;
    Ok(())
}

// ---------------------------------------------------------------------------
// Flight summary
// ---------------------------------------------------------------------------

fn haversine_m(lat1: f64, lon1: f64, lat2: f64, lon2: f64) -> f64 {
    let r = 6_371_000.0;
    let dlat = (lat2 - lat1).to_radians();
    let dlon = (lon2 - lon1).to_radians();
    let a = (dlat / 2.0).sin().powi(2)
        + lat1.to_radians().cos() * lat2.to_radians().cos() * (dlon / 2.0).sin().powi(2);
    r * 2.0 * a.sqrt().asin()
}

#[derive(Serialize, Clone)]
struct FlightSummary {
    duration_secs: f64,
    max_alt_m: Option<f64>,
    avg_alt_m: Option<f64>,
    max_speed_mps: Option<f64>,
    avg_speed_mps: Option<f64>,
    total_distance_m: Option<f64>,
    max_distance_from_home_m: Option<f64>,
    battery_start_v: Option<f64>,
    battery_end_v: Option<f64>,
    battery_min_v: Option<f64>,
    mah_consumed: Option<f64>,
    gps_sats_min: Option<u32>,
    gps_sats_max: Option<u32>,
}

#[tauri::command]
async fn log_get_flight_summary(
    state: tauri::State<'_, AppState>,
) -> Result<FlightSummary, String> {
    let guard = state.log_store.lock().await;
    let store = guard.as_ref().ok_or("no log loaded")?;
    let is_bin = store.summary.log_type == LogType::Bin;

    // Field name mappings
    let (alt_msg, alt_field) = if is_bin { ("CTUN", "Alt") } else { ("VFR_HUD", "alt") };
    let (spd_msg, spd_field) = if is_bin { ("GPS", "Spd") } else { ("VFR_HUD", "groundspeed") };
    let (bat_msg, bat_v_field) = if is_bin { ("BAT", "Volt") } else { ("SYS_STATUS", "voltage_battery") };
    let (gps_msg, lat_key, lon_key, sats_key, needs_dege7) = if is_bin {
        ("GPS", "Lat", "Lng", "NSats", true)
    } else {
        ("GLOBAL_POSITION_INT", "lat", "lon", "satellites_visible", false)
    };
    let sats_msg = if is_bin { "GPS" } else { "GPS_RAW_INT" };

    // Altitude stats
    let mut alt_sum = 0.0_f64;
    let mut alt_count = 0_u64;
    let mut alt_max: Option<f64> = None;
    if let Some(indices) = store.type_index.get(alt_msg) {
        for &idx in indices {
            if let Some(&v) = store.entries[idx].fields.get(alt_field) {
                alt_sum += v;
                alt_count += 1;
                alt_max = Some(alt_max.map_or(v, |m: f64| m.max(v)));
            }
        }
    }

    // Speed stats
    let mut spd_sum = 0.0_f64;
    let mut spd_count = 0_u64;
    let mut spd_max: Option<f64> = None;
    if let Some(indices) = store.type_index.get(spd_msg) {
        for &idx in indices {
            if let Some(&v) = store.entries[idx].fields.get(spd_field) {
                spd_sum += v;
                spd_count += 1;
                spd_max = Some(spd_max.map_or(v, |m: f64| m.max(v)));
            }
        }
    }

    // Battery stats
    let mut bat_start: Option<f64> = None;
    let mut bat_end: Option<f64> = None;
    let mut bat_min: Option<f64> = None;
    if let Some(indices) = store.type_index.get(bat_msg) {
        for &idx in indices {
            if let Some(&v) = store.entries[idx].fields.get(bat_v_field) {
                if v > 0.0 {
                    if bat_start.is_none() {
                        bat_start = Some(v);
                    }
                    bat_end = Some(v);
                    bat_min = Some(bat_min.map_or(v, |m: f64| m.min(v)));
                }
            }
        }
    }

    // mAh consumed — from BATTERY_STATUS (tlog) or BAT.CurrTot (bin)
    let mah_consumed = if is_bin {
        store.type_index.get("BAT").and_then(|indices| {
            indices.last().and_then(|&idx| {
                store.entries[idx].fields.get("CurrTot").copied()
            })
        })
    } else {
        store.type_index.get("BATTERY_STATUS").and_then(|indices| {
            indices.last().and_then(|&idx| {
                store.entries[idx].fields.get("current_consumed").copied()
            })
        })
    };

    // GPS: distance, max distance from home, satellites
    let mut total_dist = 0.0_f64;
    let mut max_dist_home: Option<f64> = None;
    let mut home_lat: Option<f64> = None;
    let mut home_lon: Option<f64> = None;
    let mut prev_lat: Option<f64> = None;
    let mut prev_lon: Option<f64> = None;

    if let Some(indices) = store.type_index.get(gps_msg) {
        for &idx in indices {
            let entry = &store.entries[idx];
            let mut lat = entry.fields.get(lat_key).copied().unwrap_or(0.0);
            let mut lon = entry.fields.get(lon_key).copied().unwrap_or(0.0);
            if needs_dege7 {
                lat /= 1e7;
                lon /= 1e7;
            }
            if lat.abs() < 1e-6 && lon.abs() < 1e-6 {
                continue;
            }
            if home_lat.is_none() {
                home_lat = Some(lat);
                home_lon = Some(lon);
            }
            if let (Some(plat), Some(plon)) = (prev_lat, prev_lon) {
                total_dist += haversine_m(plat, plon, lat, lon);
            }
            if let (Some(hlat), Some(hlon)) = (home_lat, home_lon) {
                let d = haversine_m(hlat, hlon, lat, lon);
                max_dist_home = Some(max_dist_home.map_or(d, |m: f64| m.max(d)));
            }
            prev_lat = Some(lat);
            prev_lon = Some(lon);
        }
    }

    // GPS satellite stats
    let mut sats_min: Option<u32> = None;
    let mut sats_max: Option<u32> = None;
    if let Some(indices) = store.type_index.get(sats_msg) {
        for &idx in indices {
            if let Some(&v) = store.entries[idx].fields.get(sats_key) {
                let s = v as u32;
                sats_min = Some(sats_min.map_or(s, |m| m.min(s)));
                sats_max = Some(sats_max.map_or(s, |m| m.max(s)));
            }
        }
    }

    Ok(FlightSummary {
        duration_secs: store.summary.duration_secs,
        max_alt_m: alt_max,
        avg_alt_m: if alt_count > 0 { Some(alt_sum / alt_count as f64) } else { None },
        max_speed_mps: spd_max,
        avg_speed_mps: if spd_count > 0 { Some(spd_sum / spd_count as f64) } else { None },
        total_distance_m: if total_dist > 0.0 { Some(total_dist) } else { None },
        max_distance_from_home_m: max_dist_home,
        battery_start_v: bat_start,
        battery_end_v: bat_end,
        battery_min_v: bat_min,
        mah_consumed,
        gps_sats_min: sats_min,
        gps_sats_max: sats_max,
    })
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

#[tauri::command]
async fn log_export_csv(
    state: tauri::State<'_, AppState>,
    path: String,
    start_usec: Option<u64>,
    end_usec: Option<u64>,
) -> Result<u64, String> {
    let guard = state.log_store.lock().await;
    let store = guard.as_ref().ok_or("no log loaded")?;

    // Collect entries in range
    let entries: Vec<&StoredEntry> = store
        .entries
        .iter()
        .filter(|e| {
            if let Some(s) = start_usec {
                if e.timestamp_usec < s { return false; }
            }
            if let Some(end) = end_usec {
                if e.timestamp_usec > end { return false; }
            }
            true
        })
        .collect();

    if entries.is_empty() {
        return Err("no entries in selected range".into());
    }

    // Collect all unique field names (preserving a stable order)
    let mut field_set = std::collections::BTreeSet::new();
    for e in &entries {
        for k in e.fields.keys() {
            field_set.insert(k.clone());
        }
    }
    let field_names: Vec<String> = field_set.into_iter().collect();

    // Write CSV
    let file = std::fs::File::create(&path)
        .map_err(|e| format!("failed to create file: {e}"))?;
    let mut w = std::io::BufWriter::new(file);

    use std::io::Write;

    // Header
    write!(w, "timestamp_sec,msg_type").map_err(|e| e.to_string())?;
    for name in &field_names {
        write!(w, ",{name}").map_err(|e| e.to_string())?;
    }
    writeln!(w).map_err(|e| e.to_string())?;

    // Rows
    let mut row_count = 0_u64;
    for e in &entries {
        write!(w, "{:.6},{}", e.timestamp_usec as f64 / 1e6, e.msg_name)
            .map_err(|e| e.to_string())?;
        for name in &field_names {
            if let Some(&v) = e.fields.get(name) {
                write!(w, ",{v}").map_err(|e| e.to_string())?;
            } else {
                write!(w, ",").map_err(|e| e.to_string())?;
            }
        }
        writeln!(w).map_err(|e| e.to_string())?;
        row_count += 1;
    }

    w.flush().map_err(|e| e.to_string())?;
    Ok(row_count)
}

// ---------------------------------------------------------------------------
// Recording commands
// ---------------------------------------------------------------------------

#[tauri::command]
async fn recording_start(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<String, String> {
    let guard = state.vehicle.lock().await;
    let vehicle = guard.as_ref().ok_or("not connected")?;
    state.recorder.start(vehicle, &path)
}

#[tauri::command]
fn recording_stop(state: tauri::State<'_, AppState>) {
    state.recorder.stop();
}

#[tauri::command]
fn recording_status(state: tauri::State<'_, AppState>) -> RecordingStatus {
    state.recorder.status()
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
            log_open,
            log_query,
            log_get_summary,
            log_get_flight_path,
            log_get_telemetry_track,
            log_get_flight_summary,
            log_export_csv,
            log_close,
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
            log_open,
            log_query,
            log_get_summary,
            log_get_flight_path,
            log_get_telemetry_track,
            log_get_flight_summary,
            log_export_csv,
            log_close,
            recording_start,
            recording_stop,
            recording_status
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
