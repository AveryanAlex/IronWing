//! Desktop MCP listener configuration. Secrets never appear in server status/events.
#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub struct McpSettings {
    pub enabled: bool,
    pub host: String,
    pub port: u16,
    pub token: Option<String>,
}
impl Default for McpSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            host: "127.0.0.1".into(),
            port: 14243,
            token: None,
        }
    }
}
#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct McpStatus {
    pub supported: bool,
    pub running: bool,
    pub endpoint: Option<String>,
    pub last_error: Option<String>,
}
#[cfg_attr(feature = "typescript", derive(specta::Type))]
#[derive(Clone, serde::Serialize, serde::Deserialize)]
pub struct McpSettingsResult {
    pub settings: McpSettings,
    pub status: McpStatus,
}
