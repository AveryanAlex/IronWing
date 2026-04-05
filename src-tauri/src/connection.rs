use mavkit::dialect::{
    ATTITUDE_DATA, GLOBAL_POSITION_INT_DATA, GPS_RAW_INT_DATA, MavCmd, SYS_STATUS_DATA,
};
use mavkit::{Vehicle, VehicleConfig};
use mavlink::MessageData;
use serde::Deserialize;
use std::future::Future;
use std::sync::atomic::Ordering;
use std::time::Duration;
use tauri::Listener;
#[cfg(target_os = "android")]
use tauri::Manager;
use tokio::task::JoinHandle;

use crate::AppState;
use crate::guided::emit_guided_reset;

/// Total time budget for the entire connect flow (TCP handshake + MAVLink
/// heartbeat wait).  The underlying `mavlink::connect_async` call has no
/// built-in timeout for the TCP socket phase, so without a wrapper the
/// connect can hang for the OS-level TCP timeout (~2 min on Linux).
const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);

struct ConnectedVehicle {
    vehicle: Vehicle,
    tasks: Vec<JoinHandle<()>>,
    listeners: Vec<tauri::EventId>,
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
    Other,
}

#[derive(Deserialize)]
pub(crate) struct ConnectRequest {
    transport: LinkEndpoint,
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
    let config = VehicleConfig {
        connect_timeout: CONNECT_TIMEOUT,
        ..VehicleConfig::default()
    };
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
    let interval_requests = [
        (GLOBAL_POSITION_INT_DATA::ID as f32, 200_000.0),
        (ATTITUDE_DATA::ID as f32, 200_000.0),
        (GPS_RAW_INT_DATA::ID as f32, 500_000.0),
        (SYS_STATUS_DATA::ID as f32, 1_000_000.0),
    ];

    for (message_id, interval_usec) in interval_requests {
        if let Err(err) = vehicle
            .raw()
            .command_long(
                MavCmd::MAV_CMD_SET_MESSAGE_INTERVAL as u16,
                [message_id, interval_usec, 0.0, 0.0, 0.0, 0.0, 0.0],
            )
            .await
        {
            tracing::warn!("failed to request telemetry stream for message id {message_id}: {err}");
        }
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
    } = connected_vehicle;
    tasks.extend(crate::bridges::spawn_event_bridges(app, &vehicle).await);
    *state.background_tasks.lock().await = tasks;
    *state.background_listeners.lock().await = listeners;
    *state.vehicle.lock().await = Some(vehicle);
    *state.active_link_target.lock().await = Some(active_target);
    Ok(())
}

#[tauri::command]
pub(crate) async fn connect_link(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    request: ConnectRequest,
) -> Result<(), String> {
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
        let prev = state.vehicle.lock().await.take();
        state.status_text_history.lock().await.clear();
        state.next_status_text_sequence.store(1, Ordering::Relaxed);
        state.session_context.lock().await.reset();
        if let Some(v) = prev {
            let _ = v.disconnect().await;
        }
    }

    match request.transport {
        LinkEndpoint::Udp { bind_addr } => {
            let vehicle = connect_via_address(&state, format!("udpin:{bind_addr}")).await?;
            store_connected_vehicle(&state, &app, vehicle, ActiveLinkTarget::Other).await
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
            Ok(())
        }
        #[cfg(not(target_os = "android"))]
        LinkEndpoint::Serial { port, baud } => {
            let vehicle = connect_via_address(&state, format!("serial:{port}:{baud}")).await?;
            store_connected_vehicle(&state, &app, vehicle, ActiveLinkTarget::Serial { port }).await
        }
        LinkEndpoint::BluetoothBle { address } => {
            let vehicle =
                connect_with_abort(&state, async move { connect_ble(&address).await }).await?;
            store_connected_vehicle(&state, &app, vehicle, ActiveLinkTarget::Other).await
        }
        #[cfg(target_os = "android")]
        LinkEndpoint::BluetoothSpp { address } => {
            let spp_app = app.clone();
            let vehicle =
                connect_with_abort(&state, async move { connect_spp(&spp_app, &address).await })
                    .await?;
            store_connected_vehicle(&state, &app, vehicle, ActiveLinkTarget::Other).await
        }
    }
}

/// Connect via BLE NUS (Nordic UART Service) using tauri-plugin-blec.
async fn connect_ble(address: &str) -> Result<ConnectedVehicle, String> {
    use mavkit::ble_transport::channel_pair;
    use mavkit::stream_connection::StreamConnection;

    let handler =
        tauri_plugin_blec::get_handler().map_err(|e| format!("BLE plugin not initialized: {e}"))?;

    // Standard NUS UUIDs
    let _nus_service = uuid::Uuid::parse_str("6E400001-B5A3-F393-E0A9-E50E24DCCA9E")
        .expect("valid NUS service UUID");
    let nus_rx =
        uuid::Uuid::parse_str("6E400002-B5A3-F393-E0A9-E50E24DCCA9E").expect("valid NUS RX UUID"); // write to this
    let nus_tx =
        uuid::Uuid::parse_str("6E400003-B5A3-F393-E0A9-E50E24DCCA9E").expect("valid NUS TX UUID"); // notify from this

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
    let writer_task = tokio::spawn(async move {
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
        dyn mavlink::AsyncMavConnection<mavkit::dialect::MavMessage> + Sync + Send,
    > = Box::new(connection);

    let config = VehicleConfig {
        connect_timeout: CONNECT_TIMEOUT,
        ..VehicleConfig::default()
    };
    let vehicle = Vehicle::from_connection(connection, config)
        .await
        .map_err(|e| format!("Vehicle connection failed: {e}"))?;

    Ok(ConnectedVehicle {
        vehicle,
        tasks: vec![writer_task],
        listeners: Vec::new(),
    })
}

/// Connect via Classic SPP on Android using tauri-plugin-bluetooth-classic.
#[cfg(target_os = "android")]
async fn connect_spp(app: &tauri::AppHandle, address: &str) -> Result<ConnectedVehicle, String> {
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

    let config = VehicleConfig {
        connect_timeout: CONNECT_TIMEOUT,
        ..VehicleConfig::default()
    };
    let vehicle = Vehicle::from_connection(connection, config)
        .await
        .map_err(|e| format!("Vehicle connection failed: {e}"))?;

    Ok(ConnectedVehicle {
        vehicle,
        tasks: vec![writer_task],
        listeners: vec![listener_id],
    })
}

#[tauri::command]
pub(crate) async fn disconnect_link(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    request: Option<DisconnectRequest>,
) -> Result<(), String> {
    let expected_session_id = state
        .session_runtime
        .lock()
        .await
        .current_stream_envelope(std::time::Instant::now())
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
    if let Some(handle) = state.recorder.stop() {
        let _ = handle.await; // best-effort join on disconnect
    }
    let _ = emit_guided_reset(
        state,
        app,
        crate::ipc::DomainProvenance::Stream,
        crate::ipc::guided::GuidedTerminationReason::Disconnect,
        "live vehicle disconnected",
    )
    .await;
    state.status_text_history.lock().await.clear();
    state.next_status_text_sequence.store(1, Ordering::Relaxed);
    state.session_context.lock().await.reset();

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

    let vehicle = state.vehicle.lock().await.take();
    *state.active_link_target.lock().await = None;
    if let Some(v) = vehicle {
        v.disconnect().await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub(crate) async fn is_vehicle_connected(state: &AppState) -> bool {
    state.vehicle.lock().await.is_some()
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
