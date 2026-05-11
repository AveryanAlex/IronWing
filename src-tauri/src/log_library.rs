use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tracing::warn;

use crate::ipc::OperationId;
use crate::ipc::logs::{
    LOG_LIBRARY_CATALOG_SCHEMA_VERSION, LogCatalogMigrationError, LogDiagnostic,
    LogDiagnosticSeverity, LogDiagnosticSource, LogFormat, LogIndexReference, LogLibraryCatalog,
    LogLibraryEntry, LogLibraryEntryStatus, LogLibraryStorageLocation, LogMetadata,
    LogOperationPhase, ReferencedFileFingerprint, ReferencedFileStatus, ReferencedLogFile,
    migrate_log_library_catalog,
};
use crate::logs::{
    LogOperationReporter, LogStore, LogType, app_log_progress_emitter, parse_log_file,
    run_log_operation,
};

// Keep the app-data layout explicit so catalog paths remain diagnosable and
// index rebuilds can stay decoupled from catalog migration policy.
const LOGS_DIR: &str = "logs";
const CATALOG_FILENAME: &str = "catalog.json";
const INDEXES_DIR: &str = "indexes";
const RECORDINGS_DIR: &str = "recordings";
// Index files are versioned separately from the catalog because they can be
// regenerated in place when a source log is reindexed.
const INDEX_SCHEMA_VERSION: u16 = 1;
const RELINK_REQUIRES_REINDEX_CODE: &str = "relink_requires_reindex";

#[derive(Debug, Serialize, Deserialize)]
struct LogIndexFile {
    schema_version: u16,
    entry_id: String,
    source_path: String,
    source_fingerprint: ReferencedFileFingerprint,
    metadata: LogMetadata,
    diagnostics: Vec<LogDiagnostic>,
}

#[derive(Clone)]
pub(crate) struct LogLibrary {
    catalog_path: PathBuf,
    indexes_dir: PathBuf,
    recordings_dir: PathBuf,
}

impl LogLibrary {
    pub(crate) fn new(app_data_dir: PathBuf) -> Self {
        let logs_dir = app_data_dir.join(LOGS_DIR);
        Self {
            catalog_path: logs_dir.join(CATALOG_FILENAME),
            indexes_dir: logs_dir.join(INDEXES_DIR),
            recordings_dir: logs_dir.join(RECORDINGS_DIR),
        }
    }

    pub(crate) fn list(&self) -> Result<LogLibraryCatalog, String> {
        let mut catalog = self.load_catalog()?;
        self.refresh_catalog_statuses(&mut catalog);
        self.save_catalog(&catalog)?;
        Ok(catalog)
    }

    pub(crate) async fn register(
        &self,
        path: String,
        reporter: &LogOperationReporter,
    ) -> Result<LogLibraryEntry, String> {
        reporter.progress(
            LogOperationPhase::ReadingMetadata,
            0,
            None,
            None,
            None,
            None,
        )?;
        let original_path = canonical_existing_path(&path)?;
        let fingerprint = fingerprint_path(&original_path)?;
        let imported_at_unix_msec = now_unix_msec();
        let entry_id = entry_id_for(&original_path, imported_at_unix_msec, &fingerprint);
        let entry = self
            .build_indexed_entry(
                entry_id,
                original_path,
                fingerprint,
                imported_at_unix_msec,
                reporter,
            )
            .await?;

        let mut catalog = self.load_catalog()?;
        catalog
            .entries
            .retain(|existing| existing.entry_id != entry.entry_id);
        reporter.progress(
            LogOperationPhase::WritingCatalog,
            1,
            Some(1),
            Some(100.0),
            Some(entry.entry_id.clone()),
            None,
        )?;
        catalog.entries.push(entry.clone());
        self.save_catalog(&catalog)?;
        Ok(entry)
    }

    pub(crate) fn remove(&self, entry_id: &str) -> Result<LogLibraryCatalog, String> {
        let mut catalog = self.load_catalog()?;
        let removed = catalog
            .entries
            .iter()
            .find(|entry| entry.entry_id == entry_id)
            .cloned();
        catalog.entries.retain(|entry| entry.entry_id != entry_id);
        if let Some(entry) = removed
            && let Some(index) = entry.index
        {
            let index_path = self.indexes_dir.join(&index.relative_path);
            if let Err(error) = std::fs::remove_file(&index_path) {
                warn!(entry_id, index_path = %index_path.display(), "failed to remove log library index file: {error}");
            }
        }
        self.save_catalog(&catalog)?;
        Ok(catalog)
    }

    pub(crate) async fn relink(
        &self,
        entry_id: String,
        path: String,
        reporter: &LogOperationReporter,
    ) -> Result<LogLibraryEntry, String> {
        reporter.progress(
            LogOperationPhase::ReadingMetadata,
            0,
            None,
            None,
            Some(entry_id.clone()),
            None,
        )?;
        let original_path = canonical_existing_path(&path)?;
        let fingerprint = fingerprint_path(&original_path)?;
        let mut catalog = self.load_catalog()?;
        let mut entry = catalog
            .entries
            .iter()
            .find(|entry| entry.entry_id == entry_id)
            .cloned()
            .ok_or_else(|| format!("log library entry not found: {entry_id}"))?;

        apply_relinked_source(&mut entry, original_path, fingerprint);
        reporter.progress(
            LogOperationPhase::WritingCatalog,
            1,
            Some(1),
            Some(100.0),
            Some(entry.entry_id.clone()),
            Some("relinked log path; reindex explicitly to refresh metadata".to_string()),
        )?;
        replace_entry(&mut catalog, entry.clone());
        self.save_catalog(&catalog)?;
        Ok(entry)
    }

    pub(crate) async fn reindex(
        &self,
        entry_id: String,
        reporter: &LogOperationReporter,
    ) -> Result<LogLibraryEntry, String> {
        reporter.progress(
            LogOperationPhase::ReadingMetadata,
            0,
            None,
            None,
            Some(entry_id.clone()),
            None,
        )?;
        let mut catalog = self.load_catalog()?;
        let existing = catalog
            .entries
            .iter()
            .find(|entry| entry.entry_id == entry_id)
            .cloned()
            .ok_or_else(|| format!("log library entry not found: {entry_id}"))?;

        let path = PathBuf::from(&existing.source.original_path);
        let fingerprint = match fingerprint_path(&path) {
            Ok(fingerprint) => fingerprint,
            Err(_) => {
                let mut missing = existing;
                mark_missing(&mut missing);
                reporter.progress(
                    LogOperationPhase::WritingCatalog,
                    1,
                    Some(1),
                    Some(100.0),
                    Some(missing.entry_id.clone()),
                    Some("referenced log file is missing".to_string()),
                )?;
                replace_entry(&mut catalog, missing.clone());
                self.save_catalog(&catalog)?;
                return Ok(missing);
            }
        };

        if let Some(index) = existing.index {
            let index_path = self.indexes_dir.join(&index.relative_path);
            if let Err(error) = std::fs::remove_file(&index_path) {
                warn!(entry_id, index_path = %index_path.display(), "failed to remove stale log library index file before reindex: {error}");
            }
        }

        let entry = self
            .build_indexed_entry(
                entry_id.clone(),
                path,
                fingerprint,
                existing.imported_at_unix_msec,
                reporter,
            )
            .await?;
        reporter.progress(
            LogOperationPhase::WritingCatalog,
            1,
            Some(1),
            Some(100.0),
            Some(entry.entry_id.clone()),
            None,
        )?;
        replace_entry(&mut catalog, entry.clone());
        self.save_catalog(&catalog)?;
        Ok(entry)
    }

    fn load_catalog(&self) -> Result<LogLibraryCatalog, String> {
        if !self.catalog_path.exists() {
            return Ok(self.empty_catalog());
        }

        let bytes = std::fs::read(&self.catalog_path)
            .map_err(|error| format!("failed to read log library catalog: {error}"))?;
        let value: serde_json::Value = serde_json::from_slice(&bytes)
            .map_err(|error| format!("failed to parse log library catalog: {error}"))?;
        migrate_log_library_catalog(value).map_err(format_catalog_migration_error)
    }

    fn save_catalog(&self, catalog: &LogLibraryCatalog) -> Result<(), String> {
        if let Some(parent) = self.catalog_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| format!("failed to create log library directory: {error}"))?;
        }
        std::fs::create_dir_all(&self.indexes_dir)
            .map_err(|error| format!("failed to create log index directory: {error}"))?;
        std::fs::create_dir_all(&self.recordings_dir)
            .map_err(|error| format!("failed to create log recordings directory: {error}"))?;

        let bytes = serde_json::to_vec_pretty(catalog)
            .map_err(|error| format!("failed to serialize log library catalog: {error}"))?;
        std::fs::write(&self.catalog_path, bytes)
            .map_err(|error| format!("failed to write log library catalog: {error}"))
    }

    fn empty_catalog(&self) -> LogLibraryCatalog {
        LogLibraryCatalog {
            schema_version: LOG_LIBRARY_CATALOG_SCHEMA_VERSION,
            storage: LogLibraryStorageLocation::AppData {
                catalog_path: self.catalog_path.to_string_lossy().to_string(),
                indexes_dir: self.indexes_dir.to_string_lossy().to_string(),
                recordings_dir: self.recordings_dir.to_string_lossy().to_string(),
            },
            migrated_from_schema_version: None,
            entries: Vec::new(),
        }
    }

    async fn build_indexed_entry(
        &self,
        entry_id: String,
        original_path: PathBuf,
        fingerprint: ReferencedFileFingerprint,
        imported_at_unix_msec: u64,
        reporter: &LogOperationReporter,
    ) -> Result<LogLibraryEntry, String> {
        let source = ReferencedLogFile {
            original_path: original_path.to_string_lossy().to_string(),
            fingerprint: fingerprint.clone(),
            status: ReferencedFileStatus::Available {
                current_fingerprint: fingerprint.clone(),
            },
        };

        let format = detect_format(&original_path);
        let Some(format) = format else {
            return Ok(LogLibraryEntry {
                entry_id,
                status: LogLibraryEntryStatus::Unsupported,
                imported_at_unix_msec,
                metadata: minimal_metadata(&original_path, LogFormat::Tlog),
                diagnostics: vec![diagnostic(
                    LogDiagnosticSeverity::Error,
                    LogDiagnosticSource::Catalog,
                    "unsupported_log_format",
                    "only .tlog and .bin logs are supported".to_string(),
                    true,
                    None,
                )],
                source,
                index: None,
            });
        };

        reporter.progress(
            LogOperationPhase::Parsing,
            0,
            None,
            None,
            Some(entry_id.clone()),
            None,
        )?;
        match parse_log_file(original_path.to_string_lossy().to_string()).await {
            Ok(parsed) => {
                let metadata = metadata_from_store(&parsed.store, format);
                let status = status_from_index_result(metadata.total_messages, &parsed.diagnostics);
                let total_items = (metadata.total_messages > 0).then_some(metadata.total_messages);
                let percent = total_items.map(|_| 100.0);
                reporter.progress(
                    LogOperationPhase::Parsing,
                    metadata.total_messages,
                    total_items,
                    percent,
                    Some(entry_id.clone()),
                    None,
                )?;
                reporter.progress(
                    LogOperationPhase::Indexing,
                    metadata.total_messages,
                    total_items,
                    percent,
                    Some(entry_id.clone()),
                    None,
                )?;
                let index = self.write_index(
                    &entry_id,
                    &source.original_path,
                    &fingerprint,
                    &metadata,
                    &parsed.diagnostics,
                    format,
                )?;
                Ok(LogLibraryEntry {
                    entry_id,
                    status,
                    imported_at_unix_msec,
                    source,
                    metadata,
                    diagnostics: parsed.diagnostics,
                    index: Some(index),
                })
            }
            Err(error) => Ok(LogLibraryEntry {
                entry_id,
                status: LogLibraryEntryStatus::Corrupt,
                imported_at_unix_msec,
                metadata: minimal_metadata(&original_path, format),
                diagnostics: vec![diagnostic(
                    LogDiagnosticSeverity::Error,
                    LogDiagnosticSource::Parse,
                    "parse_failed",
                    error,
                    true,
                    None,
                )],
                source,
                index: None,
            }),
        }
    }

    fn write_index(
        &self,
        entry_id: &str,
        source_path: &str,
        source_fingerprint: &ReferencedFileFingerprint,
        metadata: &LogMetadata,
        diagnostics: &[LogDiagnostic],
        format: LogFormat,
    ) -> Result<LogIndexReference, String> {
        std::fs::create_dir_all(&self.indexes_dir)
            .map_err(|error| format!("failed to create log index directory: {error}"))?;
        let relative_path = format!("{entry_id}.json");
        let index_path = self.indexes_dir.join(&relative_path);
        let index = LogIndexFile {
            schema_version: INDEX_SCHEMA_VERSION,
            entry_id: entry_id.to_string(),
            source_path: source_path.to_string(),
            source_fingerprint: source_fingerprint.clone(),
            metadata: metadata.clone(),
            diagnostics: diagnostics.to_vec(),
        };
        let bytes = serde_json::to_vec_pretty(&index)
            .map_err(|error| format!("failed to serialize log index: {error}"))?;
        std::fs::write(&index_path, bytes)
            .map_err(|error| format!("failed to write log index: {error}"))?;

        Ok(LogIndexReference {
            index_id: entry_id.to_string(),
            relative_path,
            format,
            index_version: INDEX_SCHEMA_VERSION,
            built_at_unix_msec: now_unix_msec(),
            message_count: metadata.total_messages,
            covers_start_usec: metadata.start_usec,
            covers_end_usec: metadata.end_usec,
        })
    }

    fn refresh_catalog_statuses(&self, catalog: &mut LogLibraryCatalog) {
        for entry in &mut catalog.entries {
            refresh_entry_status(entry);
        }
    }
}

async fn pick_log_library_path(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter("Telemetry logs", &["tlog", "bin"])
        .pick_file(move |file_path| {
            let _ = tx.send(file_path);
        });

    let selected = rx
        .await
        .map_err(|_| "failed to receive log file selection".to_string())?;
    let Some(path) = selected else {
        return Ok(None);
    };

    let path = path
        .into_path()
        .map_err(|error| format!("failed to resolve selected log file path: {error}"))?;
    Ok(Some(path.display().to_string()))
}

#[tauri::command]
pub(crate) async fn log_library_list(app: tauri::AppHandle) -> Result<LogLibraryCatalog, String> {
    library_from_app(&app)?.list()
}

#[tauri::command]
pub(crate) async fn log_library_register(
    app: tauri::AppHandle,
    path: String,
) -> Result<LogLibraryEntry, String> {
    let library = library_from_app(&app)?;
    let state: tauri::State<'_, crate::AppState> = app.state();
    run_log_operation(
        &state.log_operation,
        OperationId::LogLibraryRegister,
        app_log_progress_emitter(app.clone()),
        move |reporter| async move { library.register(path, &reporter).await },
    )
    .await
}

#[tauri::command]
pub(crate) async fn log_library_register_open_file(
    app: tauri::AppHandle,
) -> Result<Option<LogLibraryEntry>, String> {
    let Some(path) = pick_log_library_path(&app).await? else {
        return Ok(None);
    };

    let library = library_from_app(&app)?;
    let state: tauri::State<'_, crate::AppState> = app.state();
    run_log_operation(
        &state.log_operation,
        OperationId::LogLibraryRegister,
        app_log_progress_emitter(app.clone()),
        move |reporter| async move { library.register(path, &reporter).await },
    )
    .await
    .map(Some)
}

#[tauri::command]
pub(crate) async fn log_library_remove(
    app: tauri::AppHandle,
    entry_id: String,
) -> Result<LogLibraryCatalog, String> {
    library_from_app(&app)?.remove(&entry_id)
}

#[tauri::command]
pub(crate) async fn log_library_relink(
    app: tauri::AppHandle,
    entry_id: String,
    path: String,
) -> Result<LogLibraryEntry, String> {
    let library = library_from_app(&app)?;
    let state: tauri::State<'_, crate::AppState> = app.state();
    run_log_operation(
        &state.log_operation,
        OperationId::LogLibraryRelink,
        app_log_progress_emitter(app.clone()),
        move |reporter| async move { library.relink(entry_id, path, &reporter).await },
    )
    .await
}

#[tauri::command]
pub(crate) async fn log_library_reindex(
    app: tauri::AppHandle,
    entry_id: String,
) -> Result<LogLibraryEntry, String> {
    let library = library_from_app(&app)?;
    let state: tauri::State<'_, crate::AppState> = app.state();
    run_log_operation(
        &state.log_operation,
        OperationId::LogLibraryReindex,
        app_log_progress_emitter(app.clone()),
        move |reporter| async move { library.reindex(entry_id, &reporter).await },
    )
    .await
}

#[tauri::command]
pub(crate) async fn log_library_cancel(
    state: tauri::State<'_, crate::AppState>,
) -> Result<bool, String> {
    Ok(state.log_operation.cancel().await)
}

pub(crate) fn log_library_get_entry(
    app: &tauri::AppHandle,
    entry_id: &str,
) -> Result<LogLibraryEntry, String> {
    library_from_app(app)?
        .list()?
        .entries
        .into_iter()
        .find(|entry| entry.entry_id == entry_id)
        .ok_or_else(|| format!("log library entry not found: {entry_id}"))
}

fn library_from_app(app: &tauri::AppHandle) -> Result<LogLibrary, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app-data directory: {error}"))?;
    Ok(LogLibrary::new(app_data_dir))
}

fn refresh_entry_status(entry: &mut LogLibraryEntry) {
    let path = PathBuf::from(&entry.source.original_path);
    match fingerprint_path(&path) {
        Ok(current_fingerprint) if current_fingerprint == entry.source.fingerprint => {
            entry.source.status = ReferencedFileStatus::Available {
                current_fingerprint,
            };
            clear_resolved_filesystem_diagnostics(entry);
            if matches!(
                entry.status,
                LogLibraryEntryStatus::Missing | LogLibraryEntryStatus::Indexing
            ) || (entry.status == LogLibraryEntryStatus::Stale
                && !entry
                    .diagnostics
                    .iter()
                    .any(|diagnostic| diagnostic.code == RELINK_REQUIRES_REINDEX_CODE))
            {
                entry.status =
                    status_from_index_result(entry.metadata.total_messages, &entry.diagnostics);
            }
        }
        Ok(current_fingerprint) => {
            entry.source.status = ReferencedFileStatus::Stale {
                current_fingerprint,
            };
            entry.status = LogLibraryEntryStatus::Stale;
            remove_diagnostics(&mut entry.diagnostics, &["referenced_file_missing"]);
            push_unique_diagnostic(
                &mut entry.diagnostics,
                diagnostic(
                    LogDiagnosticSeverity::Warning,
                    LogDiagnosticSource::FileSystem,
                    "referenced_file_stale",
                    "referenced log file size or modification time changed; reindex explicitly to refresh metadata".to_string(),
                    true,
                    None,
                ),
            );
        }
        Err(_) => mark_missing(entry),
    }
}

fn mark_missing(entry: &mut LogLibraryEntry) {
    entry.source.status = ReferencedFileStatus::Missing;
    entry.status = LogLibraryEntryStatus::Missing;
    remove_diagnostics(&mut entry.diagnostics, &["referenced_file_stale"]);
    push_unique_diagnostic(
        &mut entry.diagnostics,
        diagnostic(
            LogDiagnosticSeverity::Warning,
            LogDiagnosticSource::FileSystem,
            "referenced_file_missing",
            "referenced log file is missing; relink or remove the catalog entry explicitly"
                .to_string(),
            true,
            None,
        ),
    );
}

fn apply_relinked_source(
    entry: &mut LogLibraryEntry,
    original_path: PathBuf,
    fingerprint: ReferencedFileFingerprint,
) {
    entry.source = ReferencedLogFile {
        original_path: original_path.to_string_lossy().to_string(),
        fingerprint: fingerprint.clone(),
        status: ReferencedFileStatus::Available {
            current_fingerprint: fingerprint,
        },
    };
    entry.status = LogLibraryEntryStatus::Stale;
    remove_diagnostics(
        &mut entry.diagnostics,
        &[
            "referenced_file_missing",
            "referenced_file_stale",
            RELINK_REQUIRES_REINDEX_CODE,
        ],
    );
    push_unique_diagnostic(
        &mut entry.diagnostics,
        diagnostic(
            LogDiagnosticSeverity::Warning,
            LogDiagnosticSource::Catalog,
            RELINK_REQUIRES_REINDEX_CODE,
            "relinked log path is available, but metadata and index remain stale until you reindex explicitly"
                .to_string(),
            true,
            None,
        ),
    );
}

fn clear_resolved_filesystem_diagnostics(entry: &mut LogLibraryEntry) {
    remove_diagnostics(
        &mut entry.diagnostics,
        &["referenced_file_missing", "referenced_file_stale"],
    );
}

fn status_from_index_result(
    total_messages: u64,
    diagnostics: &[LogDiagnostic],
) -> LogLibraryEntryStatus {
    if diagnostics
        .iter()
        .any(|diagnostic| diagnostic.severity == LogDiagnosticSeverity::Error)
    {
        LogLibraryEntryStatus::Corrupt
    } else if !diagnostics.is_empty() || total_messages == 0 {
        LogLibraryEntryStatus::Partial
    } else {
        LogLibraryEntryStatus::Ready
    }
}

fn push_unique_diagnostic(diagnostics: &mut Vec<LogDiagnostic>, diagnostic: LogDiagnostic) {
    if !diagnostics
        .iter()
        .any(|existing| existing.code == diagnostic.code)
    {
        diagnostics.push(diagnostic);
    }
}

fn remove_diagnostics(diagnostics: &mut Vec<LogDiagnostic>, codes: &[&str]) {
    diagnostics.retain(|diagnostic| !codes.iter().any(|code| diagnostic.code == *code));
}

fn diagnostic(
    severity: LogDiagnosticSeverity,
    source: LogDiagnosticSource,
    code: &str,
    message: String,
    recoverable: bool,
    timestamp_usec: Option<u64>,
) -> LogDiagnostic {
    LogDiagnostic {
        severity,
        source,
        code: code.to_string(),
        message,
        recoverable,
        timestamp_usec,
    }
}

fn metadata_from_store(store: &LogStore, format: LogFormat) -> LogMetadata {
    LogMetadata {
        display_name: store.summary.file_name.clone(),
        format,
        start_usec: (store.summary.total_entries > 0).then_some(store.summary.start_usec),
        end_usec: (store.summary.total_entries > 0).then_some(store.summary.end_usec),
        duration_secs: (store.summary.total_entries > 0).then_some(store.summary.duration_secs),
        total_messages: store.summary.total_entries as u64,
        message_types: store
            .summary
            .message_types
            .iter()
            .map(|(name, count)| (name.clone(), *count as u64))
            .collect::<HashMap<_, _>>(),
        vehicle_type: None,
        autopilot: None,
    }
}

fn minimal_metadata(path: &Path, format: LogFormat) -> LogMetadata {
    LogMetadata {
        display_name: path
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string_lossy().to_string()),
        format,
        start_usec: None,
        end_usec: None,
        duration_secs: None,
        total_messages: 0,
        message_types: HashMap::new(),
        vehicle_type: None,
        autopilot: None,
    }
}

fn detect_format(path: &Path) -> Option<LogFormat> {
    match path.extension().and_then(|extension| extension.to_str()) {
        Some(extension) if extension.eq_ignore_ascii_case("tlog") => Some(LogFormat::Tlog),
        Some(extension) if extension.eq_ignore_ascii_case("bin") => Some(LogFormat::Bin),
        _ => None,
    }
}

fn fingerprint_path(path: &Path) -> Result<ReferencedFileFingerprint, String> {
    let metadata = std::fs::metadata(path)
        .map_err(|error| format!("failed to stat referenced log file: {error}"))?;
    let modified_unix_msec = metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0);
    Ok(ReferencedFileFingerprint {
        size_bytes: metadata.len(),
        modified_unix_msec,
    })
}

fn canonical_existing_path(path: &str) -> Result<PathBuf, String> {
    std::fs::canonicalize(path).map_err(|error| format!("failed to resolve log path: {error}"))
}

fn now_unix_msec() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn entry_id_for(
    path: &Path,
    imported_at_unix_msec: u64,
    fingerprint: &ReferencedFileFingerprint,
) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    path.hash(&mut hasher);
    imported_at_unix_msec.hash(&mut hasher);
    fingerprint.size_bytes.hash(&mut hasher);
    fingerprint.modified_unix_msec.hash(&mut hasher);
    format!("log-{:016x}", hasher.finish())
}

fn replace_entry(catalog: &mut LogLibraryCatalog, entry: LogLibraryEntry) {
    if let Some(existing) = catalog
        .entries
        .iter_mut()
        .find(|existing| existing.entry_id == entry.entry_id)
    {
        *existing = entry;
    } else {
        catalog.entries.push(entry);
    }
}

fn format_catalog_migration_error(error: LogCatalogMigrationError) -> String {
    match error {
        LogCatalogMigrationError::MissingSchemaVersion => {
            "log library catalog is missing schema_version".to_string()
        }
        LogCatalogMigrationError::UnsupportedSchemaVersion {
            schema_version,
            supported_schema_version,
        } => format!(
            "unsupported log library catalog schema {schema_version}; supported schema is {supported_schema_version}"
        ),
        LogCatalogMigrationError::InvalidCatalog { message } => {
            format!("invalid log library catalog: {message}")
        }
    }
}

impl From<LogType> for LogFormat {
    fn from(value: LogType) -> Self {
        match value {
            LogType::Tlog => Self::Tlog,
            LogType::Bin => Self::Bin,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use mavkit::dialect::{HEARTBEAT_DATA, MavAutopilot, MavModeFlag, MavState, MavType};
    use mavkit::tlog::TlogWriter;
    use mavlink::{MavHeader, MavlinkVersion};
    use std::io::{self, Write};
    use std::sync::Arc;
    use std::sync::Mutex;
    use tokio_util::sync::CancellationToken;
    use tracing::Level;

    #[derive(Clone)]
    struct BufferWriter(Arc<Mutex<Vec<u8>>>);

    impl Write for BufferWriter {
        fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
            let mut output = self.0.lock().expect("log buffer");
            output.extend_from_slice(buf);
            Ok(buf.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    const HEADER_MAGIC: [u8; 2] = [0xA3, 0x95];
    const FMT_TYPE: u8 = 0x80;

    fn runtime() -> tokio::runtime::Runtime {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("test runtime")
    }

    fn temp_dir(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let dir =
            std::env::temp_dir().join(format!("ironwing-{name}-{}-{nonce}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    fn noop_reporter(operation_id: OperationId) -> LogOperationReporter {
        LogOperationReporter::new(operation_id, Arc::new(|_| {}), CancellationToken::new())
    }

    fn write_tlog_messages(path: &Path, count: usize) {
        let file = std::fs::File::create(path).expect("create tlog");
        let writer = std::io::BufWriter::new(file);
        let mut tlog = TlogWriter::new(writer, MavlinkVersion::V2);
        let header = MavHeader {
            system_id: 1,
            component_id: 1,
            sequence: 0,
        };
        for offset in 0..count {
            let message = mavkit::dialect::MavMessage::HEARTBEAT(HEARTBEAT_DATA {
                custom_mode: 3 + offset as u32,
                mavtype: MavType::MAV_TYPE_QUADROTOR,
                autopilot: MavAutopilot::MAV_AUTOPILOT_ARDUPILOTMEGA,
                base_mode: MavModeFlag::MAV_MODE_FLAG_SAFETY_ARMED,
                system_status: MavState::MAV_STATE_ACTIVE,
                mavlink_version: 3,
            });
            tlog.write_now(&header, &message)
                .expect("write tlog message");
        }
        tlog.flush().expect("flush tlog");
    }

    fn write_tlog(path: &Path) {
        write_tlog_messages(path, 1);
    }

    fn build_fmt_bootstrap() -> Vec<u8> {
        let mut msg = Vec::new();
        msg.extend_from_slice(&HEADER_MAGIC);
        msg.push(FMT_TYPE);
        let mut payload = [0u8; 86];
        payload[0] = FMT_TYPE;
        payload[1] = 89;
        payload[2..6].copy_from_slice(b"FMT\0");
        payload[6..11].copy_from_slice(b"BBnNZ");
        let labels = b"Type,Length,Name,Format,Labels";
        payload[22..22 + labels.len()].copy_from_slice(labels);
        msg.extend_from_slice(&payload);
        msg
    }

    fn build_fmt_for_type(
        msg_type: u8,
        msg_len: u8,
        name: &[u8; 4],
        format: &str,
        labels: &str,
    ) -> Vec<u8> {
        let mut msg = Vec::new();
        msg.extend_from_slice(&HEADER_MAGIC);
        msg.push(FMT_TYPE);
        let mut payload = [0u8; 86];
        payload[0] = msg_type;
        payload[1] = msg_len;
        payload[2..6].copy_from_slice(name);
        let fmt_bytes = format.as_bytes();
        payload[6..6 + fmt_bytes.len()].copy_from_slice(fmt_bytes);
        let lbl_bytes = labels.as_bytes();
        payload[22..22 + lbl_bytes.len()].copy_from_slice(lbl_bytes);
        msg.extend_from_slice(&payload);
        msg
    }

    fn build_data_message(msg_type: u8, payload: &[u8]) -> Vec<u8> {
        let mut msg = Vec::new();
        msg.extend_from_slice(&HEADER_MAGIC);
        msg.push(msg_type);
        msg.extend_from_slice(payload);
        msg
    }

    fn write_partial_bin(path: &Path) {
        let mut data = Vec::new();
        data.extend(build_fmt_bootstrap());
        data.extend(build_fmt_for_type(0x81, 11, b"TST\0", "Q", "TimeUS"));
        data.extend(build_data_message(0x81, &1_234u64.to_le_bytes()));
        data.extend_from_slice(&[0xA3, 0x95, 0x81, 0xFF]);
        std::fs::write(path, data).expect("write partial bin");
    }

    fn contains_raw_log_copy(path: &Path) -> bool {
        let entries = match std::fs::read_dir(path) {
            Ok(entries) => entries,
            Err(_) => return false,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if contains_raw_log_copy(&path) {
                    return true;
                }
            } else if matches!(
                path.extension().and_then(|extension| extension.to_str()),
                Some(extension) if extension.eq_ignore_ascii_case("tlog") || extension.eq_ignore_ascii_case("bin")
            ) {
                return true;
            }
        }
        false
    }

    fn capture_warnings(action: impl FnOnce()) -> String {
        let buffer = Arc::new(Mutex::new(Vec::new()));
        let writer = buffer.clone();
        let subscriber = tracing_subscriber::fmt()
            .with_max_level(Level::WARN)
            .with_ansi(false)
            .with_writer(move || BufferWriter(writer.clone()))
            .finish();

        tracing::subscriber::with_default(subscriber, action);

        let bytes = buffer.lock().expect("log buffer").clone();
        String::from_utf8(bytes).expect("utf8 log output")
    }

    #[test]
    fn logs_library_imports_referenced_tlog() {
        let root = temp_dir("referenced-tlog");
        let app_data = root.join("app-data");
        let source_dir = root.join("source");
        std::fs::create_dir_all(&source_dir).expect("create source dir");
        let source = source_dir.join("flight.tlog");
        write_tlog(&source);

        let library = LogLibrary::new(app_data.clone());
        let entry = runtime()
            .block_on(library.register(
                source.to_string_lossy().to_string(),
                &noop_reporter(OperationId::LogLibraryRegister),
            ))
            .expect("register tlog");

        assert_eq!(entry.status, LogLibraryEntryStatus::Ready);
        assert_eq!(entry.metadata.format, LogFormat::Tlog);
        assert_eq!(entry.metadata.total_messages, 1);
        assert_eq!(
            PathBuf::from(&entry.source.original_path),
            std::fs::canonicalize(&source).unwrap()
        );
        assert!(entry.index.is_some());
        assert!(app_data.join(LOGS_DIR).join(CATALOG_FILENAME).exists());
        assert!(!contains_raw_log_copy(&app_data));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn logs_library_missing_file_preserved() {
        let root = temp_dir("missing-preserved");
        let app_data = root.join("app-data");
        let source = root.join("flight.tlog");
        write_tlog(&source);

        let library = LogLibrary::new(app_data);
        let entry = runtime()
            .block_on(library.register(
                source.to_string_lossy().to_string(),
                &noop_reporter(OperationId::LogLibraryRegister),
            ))
            .expect("register tlog");
        std::fs::remove_file(&source).expect("remove source log");

        let catalog = library.list().expect("list catalog");
        let preserved = catalog
            .entries
            .iter()
            .find(|candidate| candidate.entry_id == entry.entry_id)
            .expect("entry remains in catalog");

        assert_eq!(preserved.status, LogLibraryEntryStatus::Missing);
        assert!(matches!(
            preserved.source.status,
            ReferencedFileStatus::Missing
        ));
        assert_eq!(preserved.metadata.total_messages, 1);
        assert!(preserved.index.is_some());
        assert!(
            preserved
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.code == "referenced_file_missing")
        );

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn logs_library_recovered_file_clears_resolved_filesystem_diagnostics() {
        let root = temp_dir("recovered-file-ready");
        let app_data = root.join("app-data");
        let source = root.join("flight.tlog");
        write_tlog(&source);

        let library = LogLibrary::new(app_data);
        let entry = runtime()
            .block_on(library.register(
                source.to_string_lossy().to_string(),
                &noop_reporter(OperationId::LogLibraryRegister),
            ))
            .expect("register tlog");

        let backup = root.join("flight-backup.tlog");
        std::fs::rename(&source, &backup).expect("move source log away");
        let missing_catalog = library.list().expect("refresh missing catalog");
        let missing = missing_catalog
            .entries
            .iter()
            .find(|candidate| candidate.entry_id == entry.entry_id)
            .expect("missing entry present");
        assert_eq!(missing.status, LogLibraryEntryStatus::Missing);
        assert!(
            missing
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.code == "referenced_file_missing")
        );

        std::fs::rename(&backup, &source).expect("restore original source log");
        let recovered_catalog = library.list().expect("refresh recovered catalog");
        let recovered = recovered_catalog
            .entries
            .iter()
            .find(|candidate| candidate.entry_id == entry.entry_id)
            .expect("recovered entry present");

        assert_eq!(recovered.status, LogLibraryEntryStatus::Ready);
        assert!(matches!(
            recovered.source.status,
            ReferencedFileStatus::Available { .. }
        ));
        assert!(
            !recovered
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.code == "referenced_file_missing"
                    || diagnostic.code == "referenced_file_stale")
        );

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn refresh_entry_status_clears_stale_filesystem_diagnostics_when_file_matches_again() {
        let root = temp_dir("stale-diagnostic-recovery");
        let source = root.join("flight.tlog");
        write_tlog(&source);
        let fingerprint = fingerprint_path(&source).expect("fingerprint source");

        let mut entry = LogLibraryEntry {
            entry_id: "entry-1".to_string(),
            status: LogLibraryEntryStatus::Stale,
            imported_at_unix_msec: 1,
            source: ReferencedLogFile {
                original_path: source.to_string_lossy().to_string(),
                fingerprint: fingerprint.clone(),
                status: ReferencedFileStatus::Stale {
                    current_fingerprint: ReferencedFileFingerprint {
                        size_bytes: fingerprint.size_bytes + 1,
                        modified_unix_msec: fingerprint.modified_unix_msec + 1,
                    },
                },
            },
            metadata: LogMetadata {
                display_name: "flight.tlog".to_string(),
                format: LogFormat::Tlog,
                start_usec: Some(1),
                end_usec: Some(2),
                duration_secs: Some(1.0),
                total_messages: 1,
                message_types: HashMap::new(),
                vehicle_type: None,
                autopilot: None,
            },
            diagnostics: vec![diagnostic(
                LogDiagnosticSeverity::Warning,
                LogDiagnosticSource::FileSystem,
                "referenced_file_stale",
                "stale".to_string(),
                true,
                None,
            )],
            index: Some(LogIndexReference {
                index_id: "idx-1".to_string(),
                relative_path: "entry-1.json".to_string(),
                format: LogFormat::Tlog,
                index_version: INDEX_SCHEMA_VERSION,
                built_at_unix_msec: 1,
                message_count: 1,
                covers_start_usec: Some(1),
                covers_end_usec: Some(2),
            }),
        };

        refresh_entry_status(&mut entry);

        assert_eq!(entry.status, LogLibraryEntryStatus::Ready);
        assert!(matches!(
            entry.source.status,
            ReferencedFileStatus::Available { .. }
        ));
        assert!(
            !entry
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.code == "referenced_file_stale")
        );

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn logs_corrupt_bin_partial_index_diagnostics() {
        let root = temp_dir("partial-bin");
        let app_data = root.join("app-data");
        let source = root.join("partial.bin");
        write_partial_bin(&source);

        let library = LogLibrary::new(app_data);
        let entry = runtime()
            .block_on(library.register(
                source.to_string_lossy().to_string(),
                &noop_reporter(OperationId::LogLibraryRegister),
            ))
            .expect("register partial bin");

        assert_eq!(entry.status, LogLibraryEntryStatus::Partial);
        assert_eq!(entry.metadata.format, LogFormat::Bin);
        assert_eq!(entry.metadata.total_messages, 1);
        assert!(entry.index.is_some());
        assert!(
            entry
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.code == "bin_partial_parse" && diagnostic.recoverable)
        );

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn logs_library_relink_reindex_refresh() {
        let root = temp_dir("relink-reindex-refresh");
        let app_data = root.join("app-data");
        let source_a = root.join("flight-a.tlog");
        let source_b = root.join("flight-b.tlog");
        write_tlog_messages(&source_a, 1);
        write_tlog_messages(&source_b, 2);

        let library = LogLibrary::new(app_data);
        let registered = runtime()
            .block_on(library.register(
                source_a.to_string_lossy().to_string(),
                &noop_reporter(OperationId::LogLibraryRegister),
            ))
            .expect("register initial log");

        write_tlog_messages(&source_a, 3);

        let refreshed = library.list().expect("refresh stale catalog");
        let stale = refreshed
            .entries
            .iter()
            .find(|entry| entry.entry_id == registered.entry_id)
            .expect("stale entry present");
        assert_eq!(stale.status, LogLibraryEntryStatus::Stale);
        assert_eq!(stale.metadata.total_messages, 1);
        assert!(matches!(
            stale.source.status,
            ReferencedFileStatus::Stale { .. }
        ));

        let relinked = runtime()
            .block_on(library.relink(
                registered.entry_id.clone(),
                source_b.to_string_lossy().to_string(),
                &noop_reporter(OperationId::LogLibraryRelink),
            ))
            .expect("relink entry");
        assert_eq!(relinked.status, LogLibraryEntryStatus::Stale);
        assert_eq!(relinked.metadata.total_messages, 1);
        assert_eq!(
            relinked.source.original_path,
            std::fs::canonicalize(&source_b).unwrap().to_string_lossy()
        );
        assert!(matches!(
            relinked.source.status,
            ReferencedFileStatus::Available { .. }
        ));
        assert!(
            relinked
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.code == RELINK_REQUIRES_REINDEX_CODE)
        );

        let reindexed = runtime()
            .block_on(library.reindex(
                registered.entry_id.clone(),
                &noop_reporter(OperationId::LogLibraryReindex),
            ))
            .expect("reindex entry");
        assert_eq!(reindexed.status, LogLibraryEntryStatus::Ready);
        assert_eq!(reindexed.metadata.total_messages, 2);
        assert!(
            !reindexed
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.code == RELINK_REQUIRES_REINDEX_CODE)
        );

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn logs_library_remove_logs_missing_index_cleanup_failures() {
        let root = temp_dir("remove-index-cleanup-failure");
        let app_data = root.join("app-data");
        let source = root.join("flight.tlog");
        write_tlog(&source);

        let library = LogLibrary::new(app_data);
        let entry = runtime()
            .block_on(library.register(
                source.to_string_lossy().to_string(),
                &noop_reporter(OperationId::LogLibraryRegister),
            ))
            .expect("register tlog");

        let index_path = library
            .indexes_dir
            .join(&entry.index.as_ref().expect("index").relative_path);
        std::fs::remove_file(&index_path).expect("remove index file");

        let logs = capture_warnings(|| {
            let catalog = library.remove(&entry.entry_id).expect("remove entry");
            assert!(
                catalog
                    .entries
                    .iter()
                    .all(|candidate| candidate.entry_id != entry.entry_id)
            );
        });

        assert!(logs.contains("failed to remove log library index file"));
        assert!(logs.contains(&entry.entry_id));

        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn logs_library_reindex_logs_missing_index_cleanup_failures() {
        let root = temp_dir("reindex-index-cleanup-failure");
        let app_data = root.join("app-data");
        let source = root.join("flight.tlog");
        write_tlog_messages(&source, 2);

        let library = LogLibrary::new(app_data);
        let entry = runtime()
            .block_on(library.register(
                source.to_string_lossy().to_string(),
                &noop_reporter(OperationId::LogLibraryRegister),
            ))
            .expect("register tlog");

        let index_path = library
            .indexes_dir
            .join(&entry.index.as_ref().expect("index").relative_path);
        std::fs::remove_file(&index_path).expect("remove index file");

        let logs = capture_warnings(|| {
            let reindexed = runtime()
                .block_on(library.reindex(
                    entry.entry_id.clone(),
                    &noop_reporter(OperationId::LogLibraryReindex),
                ))
                .expect("reindex entry");
            assert_eq!(reindexed.status, LogLibraryEntryStatus::Ready);
        });

        assert!(logs.contains("failed to remove stale log library index file before reindex"));
        assert!(logs.contains(&entry.entry_id));

        let _ = std::fs::remove_dir_all(root);
    }
}
