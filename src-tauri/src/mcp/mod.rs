//! Embedded desktop MCP server. Configuration belongs to Rust, not web storage.
use ironwing_core::ipc::mcp::{McpSettings, McpSettingsResult};
#[cfg(not(target_os = "android"))]
use tauri::Manager;

#[cfg(not(target_os = "android"))]
mod metadata;
#[cfg(not(target_os = "android"))]
mod schemas;
#[cfg(not(target_os = "android"))]
mod server;
#[cfg(not(target_os = "android"))]
mod telemetry;
#[cfg(not(target_os = "android"))]
mod tools;
#[cfg(not(target_os = "android"))]
pub(crate) use server::{McpRuntime, connected, reset_session, start_saved};

#[tauri::command]
pub(crate) async fn mcp_settings_read(app: tauri::AppHandle) -> Result<McpSettingsResult, String> {
    #[cfg(not(target_os = "android"))]
    {
        server::initialize(&app).await;
        Ok(app
            .state::<crate::AppState>()
            .mcp
            .settings
            .lock()
            .await
            .snapshot())
    }
    #[cfg(target_os = "android")]
    {
        let _ = app;
        Ok(McpSettingsResult {
            settings: McpSettings::default(),
            status: Default::default(),
        })
    }
}

#[tauri::command]
pub(crate) async fn mcp_settings_write(
    app: tauri::AppHandle,
    settings: McpSettings,
) -> Result<McpSettingsResult, String> {
    #[cfg(not(target_os = "android"))]
    {
        server::apply(&app, settings, true).await
    }
    #[cfg(target_os = "android")]
    {
        let _ = (app, settings);
        Err("MCP server requires desktop".into())
    }
}

#[tauri::command]
pub(crate) fn mcp_token_generate() -> Result<String, String> {
    #[cfg(not(target_os = "android"))]
    {
        // Two OS-random UUID v4 values provide 244 random bits.
        Ok(format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        ))
    }
    #[cfg(target_os = "android")]
    {
        Err("MCP server requires desktop".into())
    }
}
