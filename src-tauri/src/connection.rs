use mavkit::{Vehicle, VehicleConfig};
use mavlink::common::{
    ATTITUDE_DATA, GLOBAL_POSITION_INT_DATA, GPS_RAW_INT_DATA, MavCmd, SYS_STATUS_DATA,
};
use mavlink::MessageData;
use serde::Deserialize;
#[cfg(target_os = "android")]
use tauri::Manager;

use crate::AppState;

#[derive(Deserialize)]
pub(crate) struct ConnectRequest {
    endpoint: LinkEndpoint,
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
) -> Result<Vehicle, String> {
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
    Ok(vehicle)
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
            .command_long(
                MavCmd::MAV_CMD_SET_MESSAGE_INTERVAL,
                [message_id, interval_usec, 0.0, 0.0, 0.0, 0.0, 0.0],
            )
            .await
        {
            tracing::warn!(
                "failed to request telemetry stream for message id {message_id}: {err}"
            );
        }
    }
}

async fn store_connected_vehicle(
    state: &AppState,
    app: &tauri::AppHandle,
    vehicle: Vehicle,
) -> Result<(), String> {
    crate::bridges::spawn_event_bridges(app, &vehicle);
    *state.vehicle.lock().await = Some(vehicle);
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

    // Disconnect any existing vehicle
    {
        let prev = state.vehicle.lock().await.take();
        if let Some(v) = prev {
            let _ = v.disconnect().await;
        }
    }

    match request.endpoint {
        LinkEndpoint::Udp { bind_addr } => {
            let vehicle = connect_via_address(&state, format!("udpin:{bind_addr}")).await?;
            store_connected_vehicle(&state, &app, vehicle).await
        }
        LinkEndpoint::Tcp { address } => {
            let vehicle = connect_via_address(&state, format!("tcpout:{address}")).await?;
            store_connected_vehicle(&state, &app, vehicle.clone()).await?;
            tauri::async_runtime::spawn(request_tcp_telemetry_streams(vehicle));
            Ok(())
        }
        #[cfg(not(target_os = "android"))]
        LinkEndpoint::Serial { port, baud } => {
            let vehicle = connect_via_address(&state, format!("serial:{port}:{baud}")).await?;
            store_connected_vehicle(&state, &app, vehicle).await
        }
        LinkEndpoint::BluetoothBle { address } => {
            let vehicle = connect_ble(&address).await?;
            store_connected_vehicle(&state, &app, vehicle).await
        }
        #[cfg(target_os = "android")]
        LinkEndpoint::BluetoothSpp { address } => {
            let vehicle = connect_spp(&app, &address).await?;
            store_connected_vehicle(&state, &app, vehicle).await
        }
    }
}

/// Connect via BLE NUS (Nordic UART Service) using tauri-plugin-blec.
async fn connect_ble(address: &str) -> Result<Vehicle, String> {
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
pub(crate) async fn disconnect_link(state: tauri::State<'_, AppState>) -> Result<(), String> {
    force_disconnect(&state).await
}

pub(crate) async fn force_disconnect(state: &AppState) -> Result<(), String> {
    state.recorder.stop();

    if let Some(handle) = state.connect_abort.lock().await.take() {
        handle.abort();
    }

    let vehicle = state.vehicle.lock().await.take();
    if let Some(v) = vehicle {
        v.disconnect().await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub(crate) async fn is_vehicle_connected(state: &AppState) -> bool {
    state.vehicle.lock().await.is_some()
}
