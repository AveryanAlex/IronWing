use mavkit::Vehicle;
use mavkit::sim::{DemoProfile, DemoVehicle, DemoVehicleHandle};
use mavkit::stream::{ChannelBridge, StreamConnection};
use serde::Deserialize;
use std::future::Future;
use std::time::Duration;
use tauri::Listener;
#[cfg(target_os = "android")]
use tauri::Manager;
use tokio::task::JoinHandle;

use crate::AppState;
use crate::guided::emit_guided_reset;
use crate::ipc::DomainProvenance;
use crate::recording::auto_record_start_request;
use ironwing_core::{bluetooth_profile, telemetry, transport::BluetoothProfile, vehicle_config};

/// Total time budget for the entire connect flow (TCP handshake + MAVLink
/// heartbeat wait).  The underlying `mavlink::connect_async` call has no
/// built-in timeout for the TCP socket phase, so without a wrapper the
/// connect can hang for the OS-level TCP timeout (~2 min on Linux).
const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);

struct ConnectedVehicle {
    vehicle: Vehicle,
    tasks: Vec<JoinHandle<()>>,
    listeners: Vec<tauri::EventId>,
    demo_handle: Option<DemoVehicleHandle>,
}

async fn abort_background_tasks(state: &AppState) {
    let mut tasks = state.background_tasks.lock().await;
    for task in tasks.drain(..) {
        task.abort();
    }
}

async fn clear_background_listeners(state: &AppState, app: &tauri::AppHandle) {
    let mut listeners = state.background_listeners.lock().await;
    for listener in listeners.drain(..) {
        app.unlisten(listener);
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ActiveLinkTarget {
    Serial { port: String },
    BluetoothBle,
    Other,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum DemoVehiclePreset {
    Quadcopter,
    Airplane,
    Quadplane,
}

impl DemoVehiclePreset {
    fn profile(self) -> DemoProfile {
        match self {
            Self::Quadcopter => DemoProfile::ArduCopter,
            Self::Airplane => DemoProfile::ArduPlane,
            Self::Quadplane => DemoProfile::ArduQuadPlane,
        }
    }
}

#[derive(Deserialize)]
pub(crate) struct ConnectRequest {
    transport: LinkEndpoint,
    #[serde(default)]
    auto_record_on_connect: bool,
}

#[derive(Debug, Deserialize)]
pub(crate) struct DisconnectRequest {
    #[allow(dead_code)]
    session_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub(crate) enum LinkEndpoint {
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
        #[serde(default)]
        profile: Option<BluetoothProfile>,
    },
    Demo {
        vehicle_preset: DemoVehiclePreset,
    },
    #[cfg(target_os = "android")]
    BluetoothSpp {
        address: String,
    },
}

async fn connect_via_address(
    state: &AppState,
    address: String,
) -> Result<ConnectedVehicle, String> {
    let config = vehicle_config::live_vehicle_config(CONNECT_TIMEOUT);
    tracing::info!("connecting to {address} (timeout {CONNECT_TIMEOUT:?})");
    let task = tokio::spawn(async move {
        let result = tokio::time::timeout(
            CONNECT_TIMEOUT,
            Vehicle::connect_with_config(&address, config),
        )
        .await;
        match &result {
            Ok(Ok(_)) => tracing::info!("vehicle connected to {address}"),
            Ok(Err(e)) => tracing::warn!("vehicle connect failed for {address}: {e}"),
            Err(_) => tracing::warn!("vehicle connect timed out for {address}"),
        }
        result.map_err(|_| mavkit::VehicleError::Timeout("connecting to vehicle".into()))?
    });
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
    Ok(ConnectedVehicle {
        vehicle,
        tasks: Vec::new(),
        listeners: Vec::new(),
        demo_handle: None,
    })
}

async fn connect_with_abort<F>(state: &AppState, future: F) -> Result<ConnectedVehicle, String>
where
    F: Future<Output = Result<ConnectedVehicle, String>> + Send + 'static,
{
    let task = tokio::spawn(future);
    *state.connect_abort.lock().await = Some(task.abort_handle());

    let result = task.await.map_err(|e| {
        if e.is_cancelled() {
            "connection cancelled".to_string()
        } else {
            e.to_string()
        }
    })?;

    *state.connect_abort.lock().await = None;
    result
}

async fn request_tcp_telemetry_streams(vehicle: Vehicle) {
    for request in telemetry::DEFAULT_TELEMETRY_STREAM_REQUESTS {
        if let Err(err) = vehicle
            .raw()
            .set_message_interval(request.message_id, request.interval_usec)
            .await
        {
            tracing::warn!(
                "failed to request telemetry stream for message id {}: {err}",
                request.message_id
            );
        }
    }
}

async fn connect_demo(vehicle_preset: DemoVehiclePreset) -> Result<ConnectedVehicle, String> {
    let config = vehicle_config::adapter_vehicle_config(
        CONNECT_TIMEOUT,
        Duration::from_secs(10),
        Duration::from_secs(20),
        Duration::from_secs(20),
    );

    let (vehicle, demo_handle) = DemoVehicle::builder()
        .profile(vehicle_preset.profile())
        .connect(config)
        .await
        .map_err(|error| error.to_string())?;

    Ok(ConnectedVehicle {
        vehicle,
        tasks: Vec::new(),
        listeners: Vec::new(),
        demo_handle: Some(demo_handle),
    })
}

async fn shutdown_demo_vehicle(state: &AppState) {
    if let Some(handle) = state.demo_vehicle.lock().await.take() {
        let _ = handle.shutdown().await;
    }
}

async fn teardown_transport_target(target: Option<&ActiveLinkTarget>) {
    if !matches!(target, Some(ActiveLinkTarget::BluetoothBle)) {
        return;
    }

    let handler = match tauri_plugin_blec::get_handler() {
        Ok(handler) => handler,
        Err(error) => {
            tracing::debug!("BLE plugin was not initialized during BLE teardown: {error}");
            return;
        }
    };

    match handler.disconnect().await {
        Ok(()) | Err(tauri_plugin_blec::Error::NoDeviceConnected) => {}
        Err(error) => tracing::warn!("BLE disconnect failed during teardown: {error}"),
    }
}

async fn store_connected_vehicle(
    state: &AppState,
    app: &tauri::AppHandle,
    connected_vehicle: ConnectedVehicle,
    active_target: ActiveLinkTarget,
) -> Result<(), String> {
    let ConnectedVehicle {
        vehicle,
        mut tasks,
        listeners,
        demo_handle,
    } = connected_vehicle;
    tasks.extend(crate::bridges::spawn_event_bridges(app, &vehicle).await);
    *state.background_tasks.lock().await = tasks;
    *state.background_listeners.lock().await = listeners;
    *state.demo_vehicle.lock().await = demo_handle;
    *state.active_link_target.lock().await = Some(active_target);
    Ok(())
}

async fn maybe_start_auto_recording(
    state: &AppState,
    app: &tauri::AppHandle,
    request: Option<crate::ipc::RecordingStartRequest>,
) {
    let Some(request) = request else {
        return;
    };
    let Some(vehicle) = state.live_runtime.with_runtime(|runtime| runtime.vehicle()) else {
        return;
    };

    if let Err(error) = state.recorder.start(&vehicle, app, request) {
        tracing::warn!("failed to auto-start recording after connect: {error}");
    }
}

#[tauri::command]
pub(crate) async fn connect_link(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    request: ConnectRequest,
) -> Result<(), String> {
    let auto_record_request = auto_record_start_request(request.auto_record_on_connect);

    // Abort any in-flight connect attempt so its socket is released
    if let Some(handle) = state.connect_abort.lock().await.take() {
        handle.abort();
    }
    // Abort any in-flight param download before switching vehicle
    if let Some(abort) = state.param_download_abort.lock().await.take() {
        abort.abort();
    }
    if let Some(token) = state.mission_op_cancel.lock().await.take() {
        token.cancel();
    }
    abort_background_tasks(&state).await;
    clear_background_listeners(&state, &app).await;

    // Disconnect any existing vehicle
    {
        let _ = emit_guided_reset(
            &state,
            &app,
            crate::ipc::DomainProvenance::Stream,
            crate::ipc::guided::GuidedTerminationReason::SourceSwitch,
            "live source switched",
        )
        .await;
        let prev = state.live_runtime.with_runtime(|runtime| {
            let previous = runtime.take_vehicle();
            runtime.reset_live_state();
            previous
        });
        let previous_target = state.active_link_target.lock().await.take();
        if let Some(v) = prev {
            let _ = v.disconnect().await;
        }
        shutdown_demo_vehicle(&state).await;
        teardown_transport_target(previous_target.as_ref()).await;
    }

    match request.transport {
        LinkEndpoint::Udp { bind_addr } => {
            let vehicle = connect_via_address(&state, format!("udpin:{bind_addr}")).await?;
            store_connected_vehicle(&state, &app, vehicle, ActiveLinkTarget::Other).await?;
        }
        LinkEndpoint::Tcp { address } => {
            let mut connected_vehicle =
                connect_via_address(&state, format!("tcpout:{address}")).await?;
            let vehicle = connected_vehicle.vehicle.clone();
            connected_vehicle
                .tasks
                .push(tokio::spawn(request_tcp_telemetry_streams(vehicle)));
            store_connected_vehicle(&state, &app, connected_vehicle, ActiveLinkTarget::Other)
                .await?;
        }
        #[cfg(not(target_os = "android"))]
        LinkEndpoint::Serial { port, baud } => {
            let vehicle = connect_via_address(&state, format!("serial:{port}:{baud}")).await?;
            store_connected_vehicle(&state, &app, vehicle, ActiveLinkTarget::Serial { port })
                .await?;
        }
        LinkEndpoint::BluetoothBle { address, profile } => {
            let profile = profile.unwrap_or(BluetoothProfile::NordicUart);
            let vehicle =
                connect_with_abort(&state, async move { connect_ble(&address, profile).await })
                    .await?;
            store_connected_vehicle(&state, &app, vehicle, ActiveLinkTarget::BluetoothBle).await?;
        }
        LinkEndpoint::Demo { vehicle_preset } => {
            let vehicle =
                connect_with_abort(&state, async move { connect_demo(vehicle_preset).await })
                    .await?;
            store_connected_vehicle(&state, &app, vehicle, ActiveLinkTarget::Other).await?;
        }
        #[cfg(target_os = "android")]
        LinkEndpoint::BluetoothSpp { address } => {
            let spp_app = app.clone();
            let vehicle =
                connect_with_abort(&state, async move { connect_spp(&spp_app, &address).await })
                    .await?;
            store_connected_vehicle(&state, &app, vehicle, ActiveLinkTarget::Other).await?;
        }
    }

    maybe_start_auto_recording(&state, &app, auto_record_request).await;
    Ok(())
}

/// Connect via BLE NUS (Nordic UART Service) using tauri-plugin-blec.
async fn connect_ble(address: &str, profile: BluetoothProfile) -> Result<ConnectedVehicle, String> {
    match profile {
        BluetoothProfile::NordicUart => connect_nordic_uart_ble(address).await,
    }
}

async fn connect_nordic_uart_ble(address: &str) -> Result<ConnectedVehicle, String> {
    let handler =
        tauri_plugin_blec::get_handler().map_err(|e| format!("BLE plugin not initialized: {e}"))?;

    let nus_service = crate::bluetooth::nordic_uart_service_uuid();
    let nus_rx = uuid::Uuid::parse_str(bluetooth_profile::NORDIC_UART_RX_CHARACTERISTIC_UUID)
        .expect("valid NUS RX UUID");
    let nus_tx = uuid::Uuid::parse_str(bluetooth_profile::NORDIC_UART_TX_CHARACTERISTIC_UUID)
        .expect("valid NUS TX UUID");

    // Try connecting (device should be in blec's cache from prior scan).
    // On Android, blec has no auto-discover fallback, so if the cache is
    // stale we scan briefly and retry.
    if let Err(error) = handler
        .connect(address, tauri_plugin_blec::OnDisconnectHandler::None)
        .await
    {
        tracing::debug!("BLE connect attempt failed before NUS scan fallback: {error}");
        match handler.disconnect().await {
            Ok(()) | Err(tauri_plugin_blec::Error::NoDeviceConnected) => {}
            Err(error) => tracing::debug!("BLE cleanup before scan fallback failed: {error}"),
        }

        let (scan_tx, mut scan_rx) = tokio::sync::mpsc::channel(8);
        handler
            .discover(
                Some(scan_tx),
                3000,
                tauri_plugin_blec::models::ScanFilter::Service(nus_service),
            )
            .await
            .map_err(|e| format!("BLE scan failed: {e}"))?;

        let mut found_device = false;
        while let Some(devices) = scan_rx.recv().await {
            found_device |= devices.iter().any(|device| device.address == address);
        }
        if !found_device {
            return Err(format!(
                "BLE device {address} was not found advertising the Nordic UART Service"
            ));
        }

        handler
            .connect(address, tauri_plugin_blec::OnDisconnectHandler::None)
            .await
            .map_err(|e| format!("BLE connect failed: {e}"))?;
    }

    // Set up channel pair for bridging BLE ↔ AsyncRead/AsyncWrite
    let ChannelBridge {
        reader,
        writer,
        incoming_tx,
        mut outgoing_rx,
    } = ChannelBridge::new(64);

    // Subscribe to NUS TX notifications → push into incoming channel
    let tx_sender = incoming_tx.clone();
    handler
        .subscribe(nus_tx, move |data: Vec<u8>| {
            let _ = tx_sender.try_send(data);
        })
        .await
        .map_err(|e| format!("BLE subscribe failed: {e}"))?;

    // Spawn task to drain outgoing channel → send via BLE write
    let writer_task = tokio::spawn(async move {
        let handler = match tauri_plugin_blec::get_handler() {
            Ok(h) => h,
            Err(_) => return,
        };
        while let Some(data) = outgoing_rx.recv().await {
            for chunk in data.chunks(bluetooth_profile::NORDIC_UART_DEFAULT_CHUNK_SIZE) {
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
        dyn mavlink::AsyncMavConnection<mavkit::dialect::MavMessage> + Sync + Send,
    > = Box::new(connection);

    let config = vehicle_config::live_vehicle_config(CONNECT_TIMEOUT);
    let vehicle = Vehicle::from_connection(connection, config)
        .await
        .map_err(|e| format!("Vehicle connection failed: {e}"))?;

    Ok(ConnectedVehicle {
        vehicle,
        tasks: vec![writer_task],
        listeners: Vec::new(),
        demo_handle: None,
    })
}

/// Connect via Classic SPP on Android using tauri-plugin-bluetooth-classic.
#[cfg(target_os = "android")]
async fn connect_spp(app: &tauri::AppHandle, address: &str) -> Result<ConnectedVehicle, String> {
    use base64::Engine;
    use tauri::Listener;

    let bt: tauri::State<'_, tauri_plugin_bluetooth_classic::BluetoothClassic<tauri::Wry>> =
        app.state();
    bt.connect(address)
        .map_err(|e: Box<dyn std::error::Error>| e.to_string())?;

    let ChannelBridge {
        reader,
        writer,
        incoming_tx,
        mut outgoing_rx,
    } = ChannelBridge::new(64);

    // Listen for incoming data events from the Kotlin plugin
    let tx_sender = incoming_tx.clone();
    let listener_id = app.listen("plugin:bluetooth-classic://data", move |event| {
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
    let writer_task = tokio::spawn(async move {
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
        dyn mavlink::AsyncMavConnection<mavkit::dialect::MavMessage> + Sync + Send,
    > = Box::new(connection);

    let config = vehicle_config::live_vehicle_config(CONNECT_TIMEOUT);
    let vehicle = Vehicle::from_connection(connection, config)
        .await
        .map_err(|e| format!("Vehicle connection failed: {e}"))?;

    Ok(ConnectedVehicle {
        vehicle,
        tasks: vec![writer_task],
        listeners: vec![listener_id],
        demo_handle: None,
    })
}

#[tauri::command]
pub(crate) async fn disconnect_link(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    request: Option<DisconnectRequest>,
) -> Result<(), String> {
    let expected_session_id = state
        .live_runtime
        .with_runtime(|runtime| runtime.effective_session_envelope(web_time::Instant::now()))
        .map(|envelope| envelope.session_id);
    validate_disconnect_request(expected_session_id.as_deref(), request.as_ref())?;
    force_disconnect(&state, &app).await
}

fn validate_disconnect_request(
    expected_session_id: Option<&str>,
    request: Option<&DisconnectRequest>,
) -> Result<(), String> {
    let Some(requested_session_id) = request.and_then(|value| value.session_id.as_deref()) else {
        return Ok(());
    };

    match expected_session_id {
        Some(expected) if expected == requested_session_id => Ok(()),
        Some(expected) => Err(format!(
            "session_id mismatch: expected {expected}, got {requested_session_id}"
        )),
        None => Err(format!(
            "session_id mismatch: no active session for {requested_session_id}"
        )),
    }
}

pub(crate) async fn force_disconnect(
    state: &AppState,
    app: &tauri::AppHandle,
) -> Result<(), String> {
    if let Some(stopped_recording) = state.recorder.stop() {
        crate::recording::queue_stopped_recording_finalization(
            &state.recorder,
            app,
            stopped_recording,
        );
    }
    let _ = emit_guided_reset(
        state,
        app,
        crate::ipc::DomainProvenance::Stream,
        crate::ipc::guided::GuidedTerminationReason::Disconnect,
        "live vehicle disconnected",
    )
    .await;
    if let Some(handle) = state.connect_abort.lock().await.take() {
        handle.abort();
    }
    // Abort any in-flight param download before aborting background tasks
    if let Some(abort) = state.param_download_abort.lock().await.take() {
        abort.abort();
    }
    if let Some(token) = state.mission_op_cancel.lock().await.take() {
        token.cancel();
    }
    abort_background_tasks(state).await;
    clear_background_listeners(state, app).await;

    let vehicle = state.live_runtime.with_runtime(|runtime| {
        let previous = runtime.take_vehicle();
        runtime.reset_live_state();
        previous
    });
    ironwing_core::live_runtime::emit_session_state(&state.live_runtime, DomainProvenance::Stream);

    let previous_target = state.active_link_target.lock().await.take();
    let vehicle_disconnect_result = if let Some(v) = vehicle {
        v.disconnect().await.map_err(|e| e.to_string())
    } else {
        Ok(())
    };
    if let Err(error) = &vehicle_disconnect_result {
        tracing::warn!("vehicle disconnect failed during teardown: {error}");
    }
    shutdown_demo_vehicle(state).await;
    teardown_transport_target(previous_target.as_ref()).await;
    vehicle_disconnect_result
}

pub(crate) async fn is_vehicle_connected(state: &AppState) -> bool {
    state
        .live_runtime
        .with_runtime(|runtime| runtime.is_connected())
}

pub(crate) async fn active_link_target(state: &AppState) -> Option<ActiveLinkTarget> {
    state.active_link_target.lock().await.clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn typed_connect_request_deserializes_transport_field() {
        let request: ConnectRequest = serde_json::from_value(serde_json::json!({
            "transport": { "kind": "tcp", "address": "127.0.0.1:5760" }
        }))
        .expect("deserialize connect request");

        assert!(matches!(request.transport, LinkEndpoint::Tcp { .. }));
        assert!(!request.auto_record_on_connect);
    }

    #[test]
    fn typed_connect_request_deserializes_demo_preset() {
        let request: ConnectRequest = serde_json::from_value(serde_json::json!({
            "transport": { "kind": "demo", "vehicle_preset": "quadplane" }
        }))
        .expect("deserialize demo connect request");

        assert!(matches!(
            request.transport,
            LinkEndpoint::Demo {
                vehicle_preset: DemoVehiclePreset::Quadplane,
            }
        ));
    }

    #[test]
    fn typed_connect_request_deserializes_nordic_uart_ble_profile() {
        let request: ConnectRequest = serde_json::from_value(serde_json::json!({
            "transport": {
                "kind": "bluetooth_ble",
                "address": "AA:BB:CC:DD:EE:FF",
                "profile": "nordic_uart"
            }
        }))
        .expect("deserialize BLE connect request");

        assert!(matches!(
            request.transport,
            LinkEndpoint::BluetoothBle {
                profile: Some(BluetoothProfile::NordicUart),
                ..
            }
        ));
    }

    #[test]
    fn recording_auto_on_connect_setting() {
        let disabled = ConnectRequest {
            transport: LinkEndpoint::Udp {
                bind_addr: "0.0.0.0:14550".into(),
            },
            auto_record_on_connect: false,
        };
        let enabled = ConnectRequest {
            transport: LinkEndpoint::Udp {
                bind_addr: "0.0.0.0:14550".into(),
            },
            auto_record_on_connect: true,
        };

        assert_eq!(
            auto_record_start_request(disabled.auto_record_on_connect),
            None
        );
        assert_eq!(
            auto_record_start_request(enabled.auto_record_on_connect),
            Some(crate::ipc::RecordingStartRequest {
                destination_path: String::new(),
                mode: crate::ipc::RecordingMode::AutoOnConnect,
            })
        );
    }

    #[test]
    fn typed_disconnect_request_accepts_session_id() {
        let request: DisconnectRequest = serde_json::from_value(serde_json::json!({
            "session_id": "session-1"
        }))
        .expect("deserialize disconnect request");

        assert_eq!(request.session_id.as_deref(), Some("session-1"));
    }

    #[test]
    fn disconnect_request_rejects_mismatched_session_id() {
        let request = DisconnectRequest {
            session_id: Some("session-2".into()),
        };

        let result = validate_disconnect_request(Some("session-1"), Some(&request));

        assert!(
            result
                .expect_err("should reject mismatched session id")
                .contains("session_id mismatch")
        );
    }
}
