use std::net::SocketAddr;

use serde::{Serialize, de::DeserializeOwned};
use serde_json::{Value, json};
use tauri::Manager;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::broadcast;

use crate::{AppState, bluetooth, commands, connection, firmware, logs, recording};

#[derive(Debug, Clone, Serialize)]
pub(crate) struct RemoteUiEvent {
    event: String,
    payload: Value,
}

impl RemoteUiEvent {
    pub(crate) fn new<S: Serialize>(event: &str, payload: &S) -> Result<Self, serde_json::Error> {
        Ok(Self {
            event: event.to_string(),
            payload: serde_json::to_value(payload)?,
        })
    }
}

#[derive(Debug, serde::Deserialize)]
struct RemoteInvokeRequest {
    cmd: String,
    #[serde(default)]
    args: Value,
}

#[derive(Debug)]
struct HttpRequest {
    method: String,
    path: String,
    body: Vec<u8>,
}

const DEFAULT_REMOTE_UI_HOST: &str = "127.0.0.1";
const DEFAULT_REMOTE_UI_PORT: u16 = 14242;
const MAX_REQUEST_BYTES: usize = 1024 * 1024;

pub(crate) fn remote_ui_enabled() -> bool {
    std::env::var("IRONWING_REMOTE_UI").is_ok_and(|value| value == "1" || value == "true")
}

pub(crate) fn event_channel() -> broadcast::Sender<RemoteUiEvent> {
    broadcast::channel(512).0
}

pub(crate) fn spawn_remote_ui_server(app: tauri::AppHandle) {
    let host = std::env::var("IRONWING_REMOTE_UI_HOST")
        .unwrap_or_else(|_| DEFAULT_REMOTE_UI_HOST.to_string());
    let port = std::env::var("IRONWING_REMOTE_UI_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(DEFAULT_REMOTE_UI_PORT);

    tauri::async_runtime::spawn(async move {
        if let Err(error) = serve_remote_ui(app, &host, port).await {
            tracing::warn!("remote UI bridge stopped: {error}");
        }
    });
}

async fn serve_remote_ui(app: tauri::AppHandle, host: &str, port: u16) -> Result<(), String> {
    let addr: SocketAddr = format!("{host}:{port}")
        .parse()
        .map_err(|error| format!("invalid remote UI address {host}:{port}: {error}"))?;
    let listener = TcpListener::bind(addr)
        .await
        .map_err(|error| format!("failed to bind remote UI bridge at {addr}: {error}"))?;
    tracing::info!("remote UI bridge listening at http://{addr}");

    loop {
        let (stream, _) = listener
            .accept()
            .await
            .map_err(|error| format!("remote UI accept failed: {error}"))?;
        let app = app.clone();
        tokio::spawn(async move {
            if let Err(error) = handle_connection(app, stream).await {
                tracing::debug!("remote UI request failed: {error}");
            }
        });
    }
}

async fn handle_connection(app: tauri::AppHandle, mut stream: TcpStream) -> Result<(), String> {
    let request = read_http_request(&mut stream).await?;
    match (request.method.as_str(), request.path.as_str()) {
        ("GET", "/health") => write_json(&mut stream, 200, json!({ "ok": true })).await,
        ("GET", "/events") => stream_events(app, stream).await,
        ("POST", "/invoke") => {
            let request = serde_json::from_slice::<RemoteInvokeRequest>(&request.body)
                .map_err(|error| format!("invalid invoke request: {error}"))?;
            let response = match dispatch_invoke(&app, request).await {
                Ok(value) => json!({ "ok": true, "value": value }),
                Err(error) => json!({ "ok": false, "error": error }),
            };
            write_json(&mut stream, 200, response).await
        }
        ("OPTIONS", _) => write_response(&mut stream, 204, "text/plain", b"").await,
        _ => {
            write_json(
                &mut stream,
                404,
                json!({ "ok": false, "error": "not found" }),
            )
            .await
        }
    }
}

async fn read_http_request(stream: &mut TcpStream) -> Result<HttpRequest, String> {
    let mut buffer = Vec::new();
    let mut chunk = [0_u8; 4096];

    loop {
        let read = stream
            .read(&mut chunk)
            .await
            .map_err(|error| format!("failed reading request: {error}"))?;
        if read == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..read]);
        if buffer.len() > MAX_REQUEST_BYTES {
            return Err("remote UI request is too large".to_string());
        }
        if header_end(&buffer).is_some() {
            break;
        }
    }

    let header_end = header_end(&buffer).ok_or_else(|| "missing HTTP headers".to_string())?;
    let headers = String::from_utf8_lossy(&buffer[..header_end]);
    let mut lines = headers.lines();
    let request_line = lines
        .next()
        .ok_or_else(|| "missing request line".to_string())?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default().to_string();
    let path = parts.next().unwrap_or_default().to_string();
    let content_length = lines
        .filter_map(|line| line.split_once(':'))
        .find_map(|(name, value)| {
            name.eq_ignore_ascii_case("content-length")
                .then(|| value.trim().parse::<usize>().ok())
                .flatten()
        })
        .unwrap_or(0);
    let body_start = header_end + 4;
    while buffer.len() < body_start + content_length {
        let read = stream
            .read(&mut chunk)
            .await
            .map_err(|error| format!("failed reading request body: {error}"))?;
        if read == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..read]);
        if buffer.len() > MAX_REQUEST_BYTES {
            return Err("remote UI request is too large".to_string());
        }
    }

    let body = buffer
        .get(body_start..body_start + content_length)
        .unwrap_or_default()
        .to_vec();

    Ok(HttpRequest { method, path, body })
}

fn header_end(buffer: &[u8]) -> Option<usize> {
    buffer.windows(4).position(|window| window == b"\r\n\r\n")
}

async fn write_json(stream: &mut TcpStream, status: u16, value: Value) -> Result<(), String> {
    let body =
        serde_json::to_vec(&value).map_err(|error| format!("serialize response: {error}"))?;
    write_response(stream, status, "application/json", &body).await
}

async fn write_response(
    stream: &mut TcpStream,
    status: u16,
    content_type: &str,
    body: &[u8],
) -> Result<(), String> {
    let reason = match status {
        200 => "OK",
        204 => "No Content",
        404 => "Not Found",
        _ => "OK",
    };
    let headers = format!(
        "HTTP/1.1 {status} {reason}\r\ncontent-type: {content_type}\r\ncontent-length: {}\r\naccess-control-allow-origin: *\r\naccess-control-allow-methods: GET, POST, OPTIONS\r\naccess-control-allow-headers: content-type\r\nconnection: close\r\n\r\n",
        body.len(),
    );
    stream
        .write_all(headers.as_bytes())
        .await
        .map_err(|error| format!("write response headers: {error}"))?;
    stream
        .write_all(body)
        .await
        .map_err(|error| format!("write response body: {error}"))
}

async fn stream_events(app: tauri::AppHandle, mut stream: TcpStream) -> Result<(), String> {
    let headers = "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncache-control: no-cache\r\naccess-control-allow-origin: *\r\nconnection: keep-alive\r\n\r\n";
    stream
        .write_all(headers.as_bytes())
        .await
        .map_err(|error| format!("write SSE headers: {error}"))?;

    let state: tauri::State<'_, AppState> = app.state();
    let mut receiver = state.remote_ui_events.subscribe();
    loop {
        let event = match receiver.recv().await {
            Ok(event) => event,
            Err(broadcast::error::RecvError::Lagged(_)) => continue,
            Err(broadcast::error::RecvError::Closed) => return Ok(()),
        };
        let data = serde_json::to_string(&event)
            .map_err(|error| format!("serialize SSE event: {error}"))?;
        let frame = format!("event: ironwing\ndata: {data}\n\n");
        stream
            .write_all(frame.as_bytes())
            .await
            .map_err(|error| format!("write SSE event: {error}"))?;
    }
}

fn arg<T: DeserializeOwned>(args: &Value, key: &str) -> Result<T, String> {
    serde_json::from_value(args.get(key).cloned().unwrap_or(Value::Null))
        .map_err(|error| format!("invalid {key}: {error}"))
}

fn optional_arg<T: DeserializeOwned>(args: &Value, key: &str) -> Result<Option<T>, String> {
    match args.get(key) {
        Some(Value::Null) | None => Ok(None),
        Some(value) => serde_json::from_value(value.clone())
            .map(Some)
            .map_err(|error| format!("invalid {key}: {error}")),
    }
}

fn ok<T: Serialize>(value: T) -> Result<Value, String> {
    serde_json::to_value(value).map_err(|error| format!("serialize command result: {error}"))
}

async fn dispatch_invoke(
    app: &tauri::AppHandle,
    request: RemoteInvokeRequest,
) -> Result<Value, String> {
    let state: tauri::State<'_, AppState> = app.state();
    let args = request.args;

    match request.cmd.as_str() {
        "available_transports" => ok(commands::available_transports()),
        "list_serial_ports_cmd" => ok(commands::list_serial_ports_cmd()?),
        "connect_link" => {
            connection::connect_link(state, app.clone(), arg(&args, "request")?).await?;
            ok(())
        }
        "disconnect_link" => {
            connection::disconnect_link(state, app.clone(), optional_arg(&args, "request")?)
                .await?;
            ok(())
        }
        "open_session_snapshot" => {
            ok(
                commands::open_session_snapshot(state, app.clone(), arg(&args, "sourceKind")?)
                    .await?,
            )
        }
        "ack_session_snapshot" => ok(commands::ack_session_snapshot(
            state,
            arg(&args, "sessionId")?,
            arg(&args, "seekEpoch")?,
            arg(&args, "resetRevision")?,
        )
        .await?),
        "arm_vehicle" => {
            commands::arm_vehicle(state, arg(&args, "force")?).await?;
            ok(())
        }
        "disarm_vehicle" => {
            commands::disarm_vehicle(state, arg(&args, "force")?).await?;
            ok(())
        }
        "set_flight_mode" => {
            commands::set_flight_mode(state, arg(&args, "customMode")?).await?;
            ok(())
        }
        "vehicle_takeoff" => {
            commands::vehicle_takeoff(state, arg(&args, "altitudeM")?).await?;
            ok(())
        }
        "get_available_modes" => ok(commands::get_available_modes(state).await?),
        "get_available_message_rates" => ok(commands::get_available_message_rates()),
        "set_telemetry_rate" => {
            commands::set_telemetry_rate(arg(&args, "rateHz")?)?;
            ok(())
        }
        "set_message_rate" => {
            commands::set_message_rate(state, arg(&args, "messageId")?, arg(&args, "rateHz")?)
                .await?;
            ok(())
        }
        "start_guided_session" => {
            ok(commands::start_guided_session(state, app.clone(), arg(&args, "request")?).await?)
        }
        "update_guided_session" => {
            ok(commands::update_guided_session(state, app.clone(), arg(&args, "request")?).await?)
        }
        "stop_guided_session" => ok(commands::stop_guided_session(state, app.clone()).await?),
        "mission_validate" => ok(commands::mission_validate(arg(&args, "plan")?)),
        "mission_upload" => {
            commands::mission_upload(state, arg(&args, "plan")?).await?;
            ok(())
        }
        "mission_download" => ok(commands::mission_download(state).await?),
        "mission_clear" => {
            commands::mission_clear(state).await?;
            ok(())
        }
        "mission_set_current" => {
            commands::mission_set_current(state, arg(&args, "seq")?).await?;
            ok(())
        }
        "mission_cancel" => {
            commands::mission_cancel(state).await?;
            ok(())
        }
        "fence_upload" => {
            commands::fence_upload(state, arg(&args, "plan")?).await?;
            ok(())
        }
        "fence_download" => ok(commands::fence_download(state).await?),
        "fence_clear" => {
            commands::fence_clear(state).await?;
            ok(())
        }
        "rally_upload" => {
            commands::rally_upload(state, arg(&args, "plan")?).await?;
            ok(())
        }
        "rally_download" => ok(commands::rally_download(state).await?),
        "rally_clear" => {
            commands::rally_clear(state).await?;
            ok(())
        }
        "param_download_all" => {
            commands::param_download_all(state, app.clone()).await?;
            ok(())
        }
        "param_cancel" => {
            commands::param_cancel(state).await?;
            ok(())
        }
        "param_write" => {
            ok(commands::param_write(state, arg(&args, "name")?, arg(&args, "value")?).await?)
        }
        "param_write_batch" => {
            ok(commands::param_write_batch(state, app.clone(), arg(&args, "params")?).await?)
        }
        "param_parse_file" => ok(commands::param_parse_file(arg(&args, "contents")?)?),
        "param_format_file" => ok(commands::param_format_file(arg(&args, "store")?)),
        "calibrate_accel" => {
            commands::calibrate_accel(state).await?;
            ok(())
        }
        "calibrate_gyro" => {
            commands::calibrate_gyro(state).await?;
            ok(())
        }
        "calibrate_compass_start" => {
            commands::calibrate_compass_start(state, arg(&args, "compassMask")?).await?;
            ok(())
        }
        "calibrate_compass_accept" => {
            commands::calibrate_compass_accept(state, arg(&args, "compassMask")?).await?;
            ok(())
        }
        "calibrate_compass_cancel" => {
            commands::calibrate_compass_cancel(state, arg(&args, "compassMask")?).await?;
            ok(())
        }
        "motor_test" => {
            commands::motor_test(
                state,
                arg(&args, "motorInstance")?,
                arg(&args, "throttlePct")?,
                arg(&args, "durationS")?,
            )
            .await?;
            ok(())
        }
        "set_servo" => {
            commands::set_servo(state, arg(&args, "instance")?, arg(&args, "pwmUs")?).await?;
            ok(())
        }
        "rc_override" => {
            commands::rc_override(state, arg(&args, "channels")?).await?;
            ok(())
        }
        "reboot_vehicle" => {
            commands::reboot_vehicle(state).await?;
            ok(())
        }
        "request_prearm_checks" => {
            commands::request_prearm_checks(state).await?;
            ok(())
        }
        "bt_request_permissions" => {
            bt_request_permissions(app).await?;
            ok(())
        }
        "bt_scan_ble" => ok(bluetooth::bt_scan_ble(optional_arg(&args, "timeoutMs")?).await?),
        "bt_stop_scan_ble" => {
            bluetooth::bt_stop_scan_ble().await?;
            ok(())
        }
        "bt_get_bonded_devices" => ok(bt_get_bonded_devices(app).await?),
        "recording_start" => {
            ok(recording::recording_start(state, app.clone(), arg(&args, "request")?).await?)
        }
        "recording_stop" => {
            recording::recording_stop(state, app.clone()).await?;
            ok(())
        }
        "recording_status" => ok(recording::recording_status(state)),
        "recording_settings_read" => ok(recording::recording_settings_read(app.clone())?),
        "recording_settings_write" => ok(recording::recording_settings_write(
            app.clone(),
            arg(&args, "settings")?,
        )?),
        "log_library_list" => ok(crate::log_library::log_library_list(app.clone()).await?),
        "log_library_register" => {
            ok(crate::log_library::log_library_register(app.clone(), arg(&args, "path")?).await?)
        }
        "log_library_register_open_file" => {
            ok(crate::log_library::log_library_register_open_file(app.clone()).await?)
        }
        "log_library_remove" => {
            ok(crate::log_library::log_library_remove(app.clone(), arg(&args, "entryId")?).await?)
        }
        "log_library_relink" => ok(crate::log_library::log_library_relink(
            app.clone(),
            arg(&args, "entryId")?,
            arg(&args, "path")?,
        )
        .await?),
        "log_library_reindex" => ok(crate::log_library::log_library_reindex(
            app.clone(),
            arg(&args, "entryId")?,
        )
        .await?),
        "log_library_cancel" => ok(crate::log_library::log_library_cancel(state).await?),
        "log_open" => ok(logs::log_open(state, app.clone(), arg(&args, "path")?).await?),
        "log_raw_messages_query" => {
            ok(logs::log_raw_messages_query(state, app.clone(), arg(&args, "request")?).await?)
        }
        "log_chart_series_query" => {
            ok(logs::log_chart_series_query(state, app.clone(), arg(&args, "request")?).await?)
        }
        "log_export" => ok(logs::log_export(state, app.clone(), arg(&args, "request")?).await?),
        "log_query" => ok(logs::log_query(
            state,
            arg(&args, "msgType")?,
            optional_arg(&args, "startUsec")?,
            optional_arg(&args, "endUsec")?,
            optional_arg(&args, "maxPoints")?,
        )
        .await?),
        "log_get_summary" => ok(logs::log_get_summary(state).await?),
        "log_close" => {
            logs::log_close(state, app.clone()).await?;
            ok(())
        }
        "log_get_flight_summary" => ok(logs::log_get_flight_summary(state).await?),
        "log_get_flight_path" => ok(logs::log_get_flight_path(
            state,
            app.clone(),
            optional_arg(&args, "entryId")?,
            optional_arg(&args, "startUsec")?,
            optional_arg(&args, "endUsec")?,
            optional_arg(&args, "maxPoints")?,
        )
        .await?),
        "log_get_telemetry_track" => {
            ok(logs::log_get_telemetry_track(state, optional_arg(&args, "maxPoints")?).await?)
        }
        "playback_seek" => {
            ok(logs::playback_seek(state, app.clone(), arg(&args, "cursorUsec")?).await?)
        }
        "playback_play" => ok(logs::playback_play(state, app.clone()).await?),
        "playback_pause" => ok(logs::playback_pause(state, app.clone()).await?),
        "playback_set_speed" => {
            ok(logs::playback_set_speed(state, app.clone(), arg(&args, "speed")?).await?)
        }
        "playback_stop" => ok(logs::playback_stop(state, app.clone()).await?),
        "log_export_csv" => ok(logs::log_export_csv(
            state,
            arg(&args, "path")?,
            optional_arg(&args, "startUsec")?,
            optional_arg(&args, "endUsec")?,
        )
        .await?),
        "firmware_catalog_entries" => ok(firmware::commands::firmware_catalog_entries(
            app.clone(),
            arg(&args, "boardId")?,
            optional_arg(&args, "platform")?,
        )
        .await?),
        "firmware_catalog_targets" => {
            ok(firmware::commands::firmware_catalog_targets(app.clone()).await?)
        }
        "firmware_recovery_catalog_targets" => {
            ok(firmware::commands::firmware_recovery_catalog_targets(app.clone()).await?)
        }
        "firmware_serial_preflight" => {
            ok(firmware::commands::firmware_serial_preflight(state).await?)
        }
        "firmware_flash_serial" => ok(firmware::commands::firmware_flash_serial(
            state,
            app.clone(),
            arg(&args, "request")?,
        )
        .await?),
        "firmware_serial_readiness" => ok(firmware::commands::firmware_serial_readiness(
            state,
            arg(&args, "request")?,
        )
        .await?),
        "firmware_flash_dfu_recovery" => ok(firmware::commands::firmware_flash_dfu_recovery(
            state,
            app.clone(),
            arg(&args, "request")?,
        )
        .await?),
        "firmware_session_status" => ok(firmware::commands::firmware_session_status(state)),
        "firmware_session_cancel" => {
            firmware::commands::firmware_session_cancel(state).await?;
            ok(())
        }
        "firmware_session_clear_completed" => {
            firmware::commands::firmware_session_clear_completed(state);
            ok(())
        }
        "firmware_list_ports" => ok(firmware::discovery::firmware_list_ports()),
        "firmware_list_dfu_devices" => ok(firmware::discovery::firmware_list_dfu_devices()),
        other => Err(format!("unsupported remote UI command: {other}")),
    }
}

#[cfg(target_os = "android")]
async fn bt_request_permissions(app: &tauri::AppHandle) -> Result<(), String> {
    bluetooth::bt_request_permissions(app.clone()).await
}

#[cfg(not(target_os = "android"))]
async fn bt_request_permissions(_app: &tauri::AppHandle) -> Result<(), String> {
    bluetooth::bt_request_permissions().await
}

#[cfg(target_os = "android")]
async fn bt_get_bonded_devices(
    app: &tauri::AppHandle,
) -> Result<Vec<crate::bluetooth::BluetoothDevice>, String> {
    bluetooth::bt_get_bonded_devices(app.clone()).await
}

#[cfg(not(target_os = "android"))]
async fn bt_get_bonded_devices(
    _app: &tauri::AppHandle,
) -> Result<Vec<crate::bluetooth::BluetoothDevice>, String> {
    bluetooth::bt_get_bonded_devices().await
}
