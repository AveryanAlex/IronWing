use serde_json::Value;

use crate::ipc::{OperationFailure, OperationId, Reason};

pub const LOG_LIBRARY_CATALOG_SCHEMA_VERSION: u16 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LogFormat {
    Tlog,
    Bin,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct LogFormatAdapter {
    pub format: LogFormat,
    pub label: String,
    pub file_extensions: Vec<String>,
    pub supports_replay: bool,
    pub supports_raw_messages: bool,
    pub supports_chart_series: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ReferencedFileFingerprint {
    pub size_bytes: u64,
    pub modified_unix_msec: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ReferencedFileStatus {
    Available {
        current_fingerprint: ReferencedFileFingerprint,
    },
    Missing,
    Stale {
        current_fingerprint: ReferencedFileFingerprint,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct ReferencedLogFile {
    pub original_path: String,
    pub fingerprint: ReferencedFileFingerprint,
    pub status: ReferencedFileStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LogDiagnosticSeverity {
    Info,
    Warning,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LogDiagnosticSource {
    Catalog,
    FileSystem,
    Parse,
    Index,
    Replay,
    Export,
    Recording,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct LogDiagnostic {
    pub severity: LogDiagnosticSeverity,
    pub source: LogDiagnosticSource,
    pub code: String,
    pub message: String,
    pub recoverable: bool,
    pub timestamp_usec: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct LogMetadata {
    pub display_name: String,
    pub format: LogFormat,
    pub start_usec: Option<u64>,
    pub end_usec: Option<u64>,
    pub duration_secs: Option<f64>,
    pub total_messages: u64,
    pub message_types: std::collections::HashMap<String, u64>,
    pub vehicle_type: Option<String>,
    pub autopilot: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct LogIndexReference {
    pub index_id: String,
    pub relative_path: String,
    pub format: LogFormat,
    pub index_version: u16,
    pub built_at_unix_msec: u64,
    pub message_count: u64,
    pub covers_start_usec: Option<u64>,
    pub covers_end_usec: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LogLibraryEntryStatus {
    Ready,
    Missing,
    Stale,
    Indexing,
    Partial,
    Corrupt,
    Unsupported,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct LogLibraryEntry {
    pub entry_id: String,
    pub status: LogLibraryEntryStatus,
    pub imported_at_unix_msec: u64,
    pub source: ReferencedLogFile,
    pub metadata: LogMetadata,
    pub diagnostics: Vec<LogDiagnostic>,
    pub index: Option<LogIndexReference>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum LogLibraryStorageLocation {
    AppData {
        catalog_path: String,
        indexes_dir: String,
        recordings_dir: String,
    },
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct LogLibraryCatalog {
    pub schema_version: u16,
    pub storage: LogLibraryStorageLocation,
    pub migrated_from_schema_version: Option<u16>,
    pub entries: Vec<LogLibraryEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum LogCatalogMigrationError {
    MissingSchemaVersion,
    UnsupportedSchemaVersion {
        schema_version: u64,
        supported_schema_version: u16,
    },
    InvalidCatalog {
        message: String,
    },
}

pub fn migrate_log_library_catalog(value: Value) -> Result<LogLibraryCatalog, LogCatalogMigrationError> {
    let schema_version = value
        .get("schema_version")
        .and_then(Value::as_u64)
        .ok_or(LogCatalogMigrationError::MissingSchemaVersion)?;

    match schema_version {
        version if version == u64::from(LOG_LIBRARY_CATALOG_SCHEMA_VERSION) => {
            serde_json::from_value(value).map_err(|error| LogCatalogMigrationError::InvalidCatalog {
                message: error.to_string(),
            })
        }
        version => Err(LogCatalogMigrationError::UnsupportedSchemaVersion {
            schema_version: version,
            supported_schema_version: LOG_LIBRARY_CATALOG_SCHEMA_VERSION,
        }),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LogOperationPhase {
    Queued,
    ReadingMetadata,
    Parsing,
    Indexing,
    WritingCatalog,
    Exporting,
    Completed,
    Cancelled,
    Failed,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct LogOperationProgress {
    pub operation_id: OperationId,
    pub phase: LogOperationPhase,
    pub completed_items: u64,
    pub total_items: Option<u64>,
    pub percent: Option<f32>,
    pub entry_id: Option<String>,
    pub instance_id: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReplayStatus {
    Idle,
    Loading,
    Ready,
    Playing,
    Paused,
    Seeking,
    Ended,
    Error,
}

pub type ReplayState = crate::ipc::playback::PlaybackState;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct RawMessageFieldFilter {
    pub field: String,
    pub value_text: Option<String>,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct RawMessageQuery {
    pub entry_id: String,
    pub cursor: Option<String>,
    pub start_usec: Option<u64>,
    pub end_usec: Option<u64>,
    pub message_types: Vec<String>,
    pub text: Option<String>,
    pub field_filters: Vec<RawMessageFieldFilter>,
    pub limit: u32,
    pub include_detail: bool,
    pub include_hex: bool,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct RawMessageRecord {
    pub sequence: u64,
    pub timestamp_usec: u64,
    pub message_type: String,
    pub system_id: Option<u8>,
    pub component_id: Option<u8>,
    pub raw_len_bytes: u32,
    pub fields: std::collections::BTreeMap<String, Value>,
    pub detail: Option<Value>,
    pub hex_payload: Option<String>,
    pub diagnostics: Vec<LogDiagnostic>,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct RawMessagePage {
    pub entry_id: String,
    pub items: Vec<RawMessageRecord>,
    pub next_cursor: Option<String>,
    pub total_available: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct ChartSeriesSelector {
    pub message_type: String,
    pub field: String,
    pub label: String,
    pub unit: Option<String>,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct ChartSeriesRequest {
    pub entry_id: String,
    pub selectors: Vec<ChartSeriesSelector>,
    pub start_usec: Option<u64>,
    pub end_usec: Option<u64>,
    pub max_points: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct ChartPoint {
    pub timestamp_usec: u64,
    pub value: f64,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct ChartSeries {
    pub selector: ChartSeriesSelector,
    pub points: Vec<ChartPoint>,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct ChartSeriesPage {
    pub entry_id: String,
    pub start_usec: Option<u64>,
    pub end_usec: Option<u64>,
    pub series: Vec<ChartSeries>,
    pub diagnostics: Vec<LogDiagnostic>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LogExportFormat {
    Csv,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct LogExportRequest {
    pub entry_id: String,
    pub instance_id: String,
    pub format: LogExportFormat,
    pub destination_path: String,
    pub start_usec: Option<u64>,
    pub end_usec: Option<u64>,
    pub message_types: Vec<String>,
    pub text: Option<String>,
    pub field_filters: Vec<RawMessageFieldFilter>,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct LogExportResult {
    pub operation_id: OperationId,
    pub destination_path: String,
    pub bytes_written: u64,
    pub rows_written: u64,
    pub diagnostics: Vec<LogDiagnostic>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecordingMode {
    Manual,
    AutoOnConnect,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct RecordingSettings {
    pub auto_record_on_connect: bool,
    pub auto_record_directory: String,
    pub filename_template: String,
    pub add_completed_recordings_to_library: bool,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RecordingStatus {
    Idle,
    Recording {
        operation_id: OperationId,
        mode: RecordingMode,
        file_name: String,
        destination_path: String,
        bytes_written: u64,
        started_at_unix_msec: u64,
    },
    Stopping {
        operation_id: OperationId,
        file_name: String,
        destination_path: String,
        bytes_written: u64,
    },
    Failed {
        failure: OperationFailure,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct RecordingStartRequest {
    pub destination_path: String,
    pub mode: RecordingMode,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct RecordingSettingsResult {
    pub operation_id: OperationId,
    pub settings: RecordingSettings,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct RecordingFailure {
    pub operation_id: OperationId,
    pub reason: Reason,
    pub destination_path: Option<String>,
}
