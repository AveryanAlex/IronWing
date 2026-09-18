use super::{telemetry::TelemetryCache, tools::IronWingMcp};
use axum::{
    Router,
    extract::{Request, State},
    http::StatusCode,
    middleware::{self, Next},
    response::Response,
};
use ironwing_core::ipc::{
    ConnectTransport,
    mcp::{McpSettings, McpSettingsResult, McpStatus},
};
use rmcp::ServerHandler;
use rmcp::transport::streamable_http_server::{
    StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
};
use std::{
    path::PathBuf,
    sync::{Arc, RwLock},
};
use tauri::Manager;
use tokio::{
    net::TcpListener,
    sync::{Mutex, OnceCell},
    task::JoinHandle,
};
use tokio_util::sync::CancellationToken;

pub(crate) struct McpRuntime {
    initialized: OnceCell<()>,
    pub settings: Mutex<ListenerState>,
    pub session: RwLock<LiveSession>,
    pub telemetry: Arc<RwLock<TelemetryCache>>,
    pub metadata: super::metadata::MetadataCache,
}
impl Default for McpRuntime {
    fn default() -> Self {
        Self {
            initialized: OnceCell::new(),
            settings: Mutex::new(ListenerState::default()),
            session: RwLock::new(LiveSession::default()),
            telemetry: Arc::default(),
            metadata: Default::default(),
        }
    }
}
#[derive(Clone)]
pub(crate) struct LiveSession {
    pub id: String,
    pub transport: Option<ConnectTransport>,
    pub cancelled: CancellationToken,
}
impl Default for LiveSession {
    fn default() -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            transport: None,
            cancelled: CancellationToken::new(),
        }
    }
}
pub(crate) struct ListenerState {
    settings: McpSettings,
    status: McpStatus,
    running: Option<RunningServer>,
    auth: Arc<RwLock<Option<String>>>,
}
impl Default for ListenerState {
    fn default() -> Self {
        Self {
            settings: Default::default(),
            status: McpStatus {
                supported: true,
                ..Default::default()
            },
            running: None,
            auth: Arc::default(),
        }
    }
}
impl ListenerState {
    pub fn snapshot(&self) -> McpSettingsResult {
        let mut status = self.status.clone();
        if self.running.as_ref().is_some_and(|r| r.task.is_finished()) {
            status.running = false;
            status.last_error = Some("MCP listener stopped unexpectedly".into());
        }
        McpSettingsResult {
            settings: self.settings.clone(),
            status,
        }
    }
}
struct RunningServer {
    cancel: CancellationToken,
    task: JoinHandle<()>,
}
impl RunningServer {
    async fn stop(self) {
        self.cancel.cancel();
        let mut task = self.task;
        if tokio::time::timeout(std::time::Duration::from_secs(2), &mut task)
            .await
            .is_err()
        {
            task.abort();
            let _ = task.await;
        }
    }
}
impl Drop for ListenerState {
    fn drop(&mut self) {
        if let Some(server) = &self.running {
            server.cancel.cancel();
            server.task.abort();
        }
    }
}
fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?
        .join("mcp.json"))
}

pub(crate) fn reset_session(state: &crate::AppState) {
    let mut session = state.mcp.session.write().unwrap_or_else(|e| e.into_inner());
    session.cancelled.cancel();
    *session = LiveSession::default();
    *state
        .mcp
        .telemetry
        .write()
        .unwrap_or_else(|e| e.into_inner()) = TelemetryCache::default();
}
pub(crate) fn connected(state: &crate::AppState, vehicle: &mavkit::Vehicle) -> JoinHandle<()> {
    let session = state
        .mcp
        .session
        .read()
        .unwrap_or_else(|e| e.into_inner())
        .clone();
    super::telemetry::spawn_collector(vehicle, state.mcp.telemetry.clone(), session.cancelled)
}
pub(crate) fn start_saved(app: tauri::AppHandle) {
    tauri::async_runtime::spawn(async move {
        initialize(&app).await;
    });
}
pub(crate) async fn initialize(app: &tauri::AppHandle) {
    let state = app.state::<crate::AppState>();
    state
        .mcp
        .initialized
        .get_or_init(|| async {
            let mut controller = state.mcp.settings.lock().await;
            let result = async {
                let path = config_path(app)?;
                if !path.exists() {
                    return Ok(());
                }
                let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
                let settings: McpSettings =
                    serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
                // Preserve desired settings on startup failure so users can correct the port.
                controller.settings = settings.clone();
                configure(&mut controller, settings, None, |cancel| {
                    IronWingMcp::new(app.clone(), cancel)
                })
                .await
                .map(|_| ())
            }
            .await;
            if let Err(error) = result {
                controller.status.last_error = Some(error);
            }
        })
        .await;
}
fn validate(settings: &McpSettings) -> Result<(), String> {
    if settings.port == 0 {
        return Err("port must be between 1 and 65535".into());
    }
    if settings.host != "localhost" && settings.host.parse::<std::net::IpAddr>().is_err() {
        return Err("host must be localhost or an IPv4/IPv6 bind address".into());
    }
    if settings
        .token
        .as_ref()
        .is_some_and(|t| t.is_empty() || !t.bytes().all(|b| b.is_ascii_graphic()))
    {
        return Err("token must contain non-empty printable ASCII without spaces".into());
    }
    Ok(())
}
fn persist(path: &std::path::Path, settings: &McpSettings) -> Result<(), String> {
    use std::io::Write;
    let parent = path.parent().ok_or("invalid config path")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&tmp).map_err(|e| e.to_string())?;
    file.write_all(&serde_json::to_vec_pretty(settings).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    std::fs::rename(tmp, path).map_err(|e| e.to_string())
}
pub(crate) async fn apply(
    app: &tauri::AppHandle,
    settings: McpSettings,
    save: bool,
) -> Result<McpSettingsResult, String> {
    initialize(app).await;
    let state = app.state::<crate::AppState>();
    let mut controller = state.mcp.settings.lock().await;
    let path = if save { Some(config_path(app)?) } else { None };
    configure(&mut controller, settings, path.as_deref(), |cancel| {
        IronWingMcp::new(app.clone(), cancel)
    })
    .await
}
async fn configure<H: ServerHandler + Clone + Send + Sync + 'static>(
    controller: &mut ListenerState,
    settings: McpSettings,
    path: Option<&std::path::Path>,
    create_handler: impl FnOnce(CancellationToken) -> H,
) -> Result<McpSettingsResult, String> {
    validate(&settings)?;
    let same_address = controller
        .running
        .as_ref()
        .is_some_and(|r| !r.task.is_finished())
        && controller.settings.host == settings.host
        && controller.settings.port == settings.port;
    let listener = if settings.enabled && !same_address {
        match TcpListener::bind((settings.host.as_str(), settings.port)).await {
            Ok(listener) => Some(listener),
            Err(error) => {
                controller.status.last_error = Some(format!("Cannot listen: {error}"));
                return Err(format!("Cannot listen: {error}"));
            }
        }
    } else {
        None
    };
    if let Some(path) = path {
        persist(path, &settings)?;
    }
    *controller.auth.write().unwrap_or_else(|e| e.into_inner()) = settings.token.clone();
    if (!settings.enabled || listener.is_some())
        && let Some(running) = controller.running.take()
    {
        running.stop().await;
    }
    if let Some(listener) = listener {
        let cancel = CancellationToken::new();
        let handler = create_handler(cancel.clone());
        let router = router(
            handler,
            &settings.host,
            cancel.clone(),
            controller.auth.clone(),
        );
        let shutdown = cancel.clone();
        let task = tokio::spawn(async move {
            if let Err(error) = axum::serve(listener, router)
                .with_graceful_shutdown(shutdown.cancelled_owned())
                .await
            {
                tracing::error!("MCP listener stopped: {error}");
            }
        });
        controller.running = Some(RunningServer { cancel, task });
    }
    let host = if settings.host.contains(':') {
        format!("[{}]", settings.host)
    } else {
        settings.host.clone()
    };
    controller.status = McpStatus {
        supported: true,
        running: settings.enabled,
        endpoint: settings
            .enabled
            .then(|| format!("http://{host}:{}/mcp", settings.port)),
        last_error: None,
    };
    controller.settings = settings;
    Ok(controller.snapshot())
}
fn router<H: ServerHandler + Clone + Send + Sync + 'static>(
    handler: H,
    host: &str,
    cancel: CancellationToken,
    auth: Arc<RwLock<Option<String>>>,
) -> Router {
    let mut config = StreamableHttpServerConfig::default()
        .with_cancellation_token(cancel)
        .enforce_origin_validation();
    config.allowed_hosts = if host == "0.0.0.0" || host == "::" {
        vec![]
    } else {
        vec![
            host.into(),
            "localhost".into(),
            "127.0.0.1".into(),
            "[::1]".into(),
        ]
    };
    let service: StreamableHttpService<H, LocalSessionManager> =
        StreamableHttpService::new(move || Ok(handler.clone()), Default::default(), config);
    Router::new()
        .nest_service("/mcp", service)
        .layer(middleware::from_fn_with_state(auth, authenticate))
}
async fn authenticate(
    State(auth): State<Arc<RwLock<Option<String>>>>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let allowed = {
        let token = auth.read().unwrap_or_else(|e| e.into_inner());
        token.as_ref().is_none_or(|expected| {
            request
                .headers()
                .get("authorization")
                .and_then(|h| h.to_str().ok())
                .and_then(|h| h.strip_prefix("Bearer "))
                .is_some_and(|actual| token_matches(actual, expected))
        })
    };
    if !allowed {
        return Err(StatusCode::UNAUTHORIZED);
    }
    Ok(next.run(request).await)
}
fn token_matches(actual: &str, expected: &str) -> bool {
    if actual.len() != expected.len() {
        return false;
    }
    actual
        .bytes()
        .zip(expected.bytes())
        .fold(0_u8, |acc, (a, b)| acc | (a ^ b))
        == 0
}

#[cfg(test)]
mod tests {
    use super::*;
    use rmcp::{
        ErrorData, RoleServer, ServiceExt,
        model::{
            CallToolRequestParams, CallToolResponse, CallToolResult, ListToolsResult,
            PaginatedRequestParams, ServerCapabilities, ServerConfig, Tool,
        },
        service::RequestContext,
        transport::StreamableHttpClientTransport,
    };
    use serde_json::json;
    #[derive(Clone, Default)]
    struct Probe {
        started: Arc<tokio::sync::Notify>,
        cancelled: Arc<tokio::sync::Notify>,
    }
    impl ServerHandler for Probe {
        fn get_info(&self) -> ServerConfig {
            ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
        }
        fn get_tool(&self, name: &str) -> Option<Tool> {
            super::super::tools::definitions()
                .into_iter()
                .find(|t| t.name == name)
        }
        async fn list_tools(
            &self,
            _: Option<PaginatedRequestParams>,
            _: RequestContext<RoleServer>,
        ) -> Result<ListToolsResult, ErrorData> {
            Ok(ListToolsResult {
                tools: super::super::tools::definitions(),
                ..Default::default()
            })
        }
        async fn call_tool(
            &self,
            request: CallToolRequestParams,
            context: RequestContext<RoleServer>,
        ) -> Result<CallToolResponse, ErrorData> {
            if self.get_tool(&request.name).is_none() {
                return Err(ErrorData::invalid_params("Unknown tool", None));
            }
            if request.name == "vehicle_status" {
                self.started.notify_one();
                context.ct.cancelled().await;
                self.cancelled.notify_one();
                return Ok(CallToolResult::structured_error(json!({"error":"cancelled"})).into());
            }
            Ok(CallToolResult::structured(json!({"session_id":"test","source":"live","connected":false,"transport":null,"state":{},"effective_ui_source":"live"})).into())
        }
    }
    #[tokio::test]
    async fn real_sdk_client_negotiates_lists_and_calls_over_http() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let cancel = CancellationToken::new();
        let probe = Probe::default();
        let app = router(probe.clone(), "127.0.0.1", cancel.clone(), Arc::default());
        let shutdown = cancel.clone();
        let task = tokio::spawn(async move {
            axum::serve(listener, app)
                .with_graceful_shutdown(shutdown.cancelled_owned())
                .await
                .unwrap();
        });
        let transport = StreamableHttpClientTransport::from_uri(format!("http://{address}/mcp"));
        let client = ().serve(transport).await.unwrap();
        let tools = client.list_all_tools().await.unwrap();
        assert_eq!(tools.len(), 14);
        assert!(tools.iter().all(|t| t.output_schema.is_some()));
        let result = client
            .call_tool(CallToolRequestParams::new("connection_status"))
            .await
            .unwrap();
        assert_eq!(result.structured_content.unwrap()["connected"], false);
        assert!(
            client
                .call_tool(CallToolRequestParams::new("not_a_tool"))
                .await
                .is_err()
        );
        let request = client
            .send_cancellable_request(
                rmcp::model::CallToolRequest::new(CallToolRequestParams::new("vehicle_status"))
                    .into(),
                rmcp::service::PeerRequestOptions::no_options(),
            )
            .await
            .unwrap();
        tokio::time::timeout(std::time::Duration::from_secs(5), probe.started.notified())
            .await
            .unwrap();
        request
            .cancel(Some("sampling no longer needed".into()))
            .await
            .unwrap();
        tokio::time::timeout(
            std::time::Duration::from_secs(5),
            probe.cancelled.notified(),
        )
        .await
        .unwrap();
        client.cancel().await.unwrap();
        RunningServer { cancel, task }.stop().await;
        let rebound = TcpListener::bind(address).await.unwrap();
        drop(rebound);
    }
    #[tokio::test]
    async fn token_origin_and_token_rotation_are_enforced() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let cancel = CancellationToken::new();
        let auth = Arc::new(RwLock::new(Some("secret-one".into())));
        let app = router(Probe::default(), "127.0.0.1", cancel.clone(), auth.clone());
        let shutdown = cancel.clone();
        let task = tokio::spawn(async move {
            axum::serve(listener, app)
                .with_graceful_shutdown(shutdown.cancelled_owned())
                .await
                .unwrap();
        });
        let client = reqwest::Client::new();
        let url = format!("http://{address}/mcp");
        assert_eq!(client.get(&url).send().await.unwrap().status(), 401);
        assert_eq!(
            client
                .get(&url)
                .bearer_auth("secret-one")
                .header("origin", "https://untrusted.example")
                .send()
                .await
                .unwrap()
                .status(),
            403
        );
        *auth.write().unwrap() = Some("secret-two".into());
        assert_eq!(
            client
                .get(&url)
                .bearer_auth("secret-one")
                .send()
                .await
                .unwrap()
                .status(),
            401
        );
        assert_ne!(
            client
                .get(&url)
                .bearer_auth("secret-two")
                .send()
                .await
                .unwrap()
                .status(),
            401
        );
        RunningServer { cancel, task }.stop().await;
    }
    #[tokio::test]
    async fn failed_rebind_preserves_listener_and_disable_releases_port() {
        let temporary = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = temporary.local_addr().unwrap().port();
        drop(temporary);
        let mut controller = ListenerState::default();
        let settings = McpSettings {
            enabled: true,
            port,
            ..Default::default()
        };
        configure(&mut controller, settings.clone(), None, |_| {
            Probe::default()
        })
        .await
        .unwrap();
        let occupied = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let proposed = McpSettings {
            port: occupied.local_addr().unwrap().port(),
            ..settings.clone()
        };
        assert!(
            configure(&mut controller, proposed, None, |_| Probe::default())
                .await
                .is_err()
        );
        assert_eq!(controller.snapshot().settings.port, port);
        assert!(controller.snapshot().status.running);
        assert!(
            tokio::net::TcpStream::connect(("127.0.0.1", port))
                .await
                .is_ok()
        );
        configure(
            &mut controller,
            McpSettings {
                enabled: false,
                ..settings
            },
            None,
            |_| Probe::default(),
        )
        .await
        .unwrap();
        assert!(!controller.snapshot().status.running);
        assert!(TcpListener::bind(("127.0.0.1", port)).await.is_ok());
    }
    #[test]
    fn settings_roundtrip_and_validation() {
        let root =
            std::env::temp_dir().join(format!("ironwing-mcp-settings-{}", uuid::Uuid::new_v4()));
        let path = root.join("mcp.json");
        let mut settings = McpSettings::default();
        assert!(validate(&settings).is_ok());
        settings.token = Some("sample-token".into());
        persist(&path, &settings).unwrap();
        let read: McpSettings = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert!(read == settings);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
        settings.port = 0;
        assert!(validate(&settings).is_err());
        settings.port = 14243;
        settings.host = "http://example.com".into();
        assert!(validate(&settings).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
