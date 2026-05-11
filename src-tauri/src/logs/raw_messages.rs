use std::borrow::Cow;
use std::path::{Path, PathBuf};

use serde_json::{Map as JsonMap, Value as JsonValue};
use tokio_util::sync::CancellationToken;

use super::{
    DEFAULT_RAW_MESSAGE_LIMIT, LogStore, MAX_RAW_MESSAGE_LIMIT, StoredEntry, bounded_page_limit,
    encode_raw_cursor, entry_matches_common_filters, parse_raw_cursor,
};
use crate::ipc::{
    OperationId,
    logs::{RawMessagePage, RawMessageQuery, RawMessageRecord},
};

#[cfg(test)]
use crate::ipc::logs::{LogExportRequest, LogExportResult};

fn hex_payload(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn build_raw_message_record(
    entry: &StoredEntry,
    include_detail: bool,
    include_hex: bool,
) -> RawMessageRecord {
    RawMessageRecord {
        sequence: entry.sequence,
        timestamp_usec: entry.timestamp_usec,
        message_type: entry.msg_name.clone(),
        system_id: entry.system_id,
        component_id: entry.component_id,
        raw_len_bytes: entry.raw_len_bytes,
        fields: entry.field_values.clone(),
        detail: include_detail.then(|| JsonValue::Object(JsonMap::from_iter(entry.field_values.clone()))),
        hex_payload: include_hex
            .then_some(entry.raw_payload.as_deref())
            .flatten()
            .map(hex_payload),
        diagnostics: Vec::new(),
    }
}

pub(super) fn query_raw_message_page(
    store: &LogStore,
    request: &RawMessageQuery,
) -> Result<RawMessagePage, String> {
    let start_index = parse_raw_cursor(request.cursor.as_deref())?;
    let limit = bounded_page_limit(request.limit, DEFAULT_RAW_MESSAGE_LIMIT, MAX_RAW_MESSAGE_LIMIT);
    let mut items = Vec::with_capacity(limit);
    let mut matched_total = 0_u64;
    let mut next_cursor = None;

    for (index, entry) in store.entries.iter().enumerate() {
        if !entry_matches_common_filters(
            entry,
            request.start_usec,
            request.end_usec,
            &request.message_types,
            request.text.as_deref(),
            &request.field_filters,
        ) {
            continue;
        }

        matched_total += 1;
        if index < start_index {
            continue;
        }

        if items.len() < limit {
            items.push(build_raw_message_record(
                entry,
                request.include_detail,
                request.include_hex,
            ));
            continue;
        }

        if next_cursor.is_none() {
            next_cursor = Some(encode_raw_cursor(index));
        }
    }

    Ok(RawMessagePage {
        entry_id: request.entry_id.clone(),
        items,
        next_cursor,
        total_available: Some(matched_total),
    })
}

fn csv_field_names(entries: &[&StoredEntry]) -> Vec<String> {
    let mut field_set = std::collections::BTreeSet::new();
    for entry in entries {
        for key in entry.fields.keys() {
            field_set.insert(key.clone());
        }
    }
    field_set.into_iter().collect()
}

fn protect_formula_text(value: &str) -> Cow<'_, str> {
    match value.chars().next() {
        Some('=' | '+' | '-' | '@') => Cow::Owned(format!("'{value}")),
        _ => Cow::Borrowed(value),
    }
}

fn write_csv_cell<W: std::io::Write>(writer: &mut W, value: &str, protect_formula: bool) -> Result<(), String> {
    let escaped_value = if protect_formula {
        protect_formula_text(value)
    } else {
        Cow::Borrowed(value)
    };
    let needs_quotes = escaped_value.contains(',')
        || escaped_value.contains('"')
        || escaped_value.contains('\n')
        || escaped_value.contains('\r');
    if needs_quotes {
        let quoted = escaped_value.replace('"', "\"\"");
        write!(writer, "\"{quoted}\"").map_err(|error| error.to_string())
    } else {
        write!(writer, "{escaped_value}").map_err(|error| error.to_string())
    }
}

pub(super) fn write_csv_export(path: &str, entries: Vec<&StoredEntry>) -> Result<(u64, u64), String> {
    write_csv_export_inner(path, entries, &mut |_| false)
}

pub(super) fn write_csv_export_cancellable(
    path: &str,
    entries: Vec<&StoredEntry>,
    cancel: &CancellationToken,
) -> Result<(u64, u64), String> {
    write_csv_export_inner(path, entries, &mut |_| cancel.is_cancelled())
}

fn cleanup_partial_export(path: &str) {
    if let Err(error) = std::fs::remove_file(path)
        && error.kind() != std::io::ErrorKind::NotFound
    {
        let _ = error;
    }
}

fn pending_export_path(path: &str) -> PathBuf {
    let destination = Path::new(path);
    let parent = destination.parent().unwrap_or_else(|| Path::new("."));
    let file_name = destination
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "export.csv".to_string());
    parent.join(format!(
        ".{file_name}.ironwing-export-{}-{}.tmp",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ))
}

fn backup_export_path(path: &str) -> PathBuf {
    let destination = Path::new(path);
    let parent = destination.parent().unwrap_or_else(|| Path::new("."));
    let file_name = destination
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "export.csv".to_string());
    parent.join(format!(
        ".{file_name}.ironwing-backup-{}-{}.tmp",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ))
}

fn finalize_export_file(pending_path: &Path, destination_path: &Path) -> Result<(), String> {
    if !destination_path.exists() {
        return std::fs::rename(pending_path, destination_path)
            .map_err(|error| format!("failed to finalize export file: {error}"));
    }

    let backup_path = backup_export_path(&destination_path.to_string_lossy());
    std::fs::rename(destination_path, &backup_path)
        .map_err(|error| format!("failed to move existing export aside: {error}"))?;

    match std::fs::rename(pending_path, destination_path) {
        Ok(()) => {
            cleanup_partial_export(&backup_path.to_string_lossy());
            Ok(())
        }
        Err(error) => {
            let restore_result = std::fs::rename(&backup_path, destination_path);
            if let Err(restore_error) = restore_result {
                return Err(format!(
                    "failed to finalize export file: {error}; failed to restore previous destination: {restore_error}"
                ));
            }
            Err(format!("failed to finalize export file: {error}"))
        }
    }
}

fn ensure_not_cancelled(
    path: &str,
    rows_written: u64,
    should_cancel: &mut dyn FnMut(u64) -> bool,
) -> Result<(), String> {
    if should_cancel(rows_written) {
        cleanup_partial_export(path);
        return Err(super::cancelled_log_operation_error(OperationId::LogExport));
    }

    Ok(())
}

fn write_csv_export_inner(
    path: &str,
    entries: Vec<&StoredEntry>,
    should_cancel: &mut dyn FnMut(u64) -> bool,
) -> Result<(u64, u64), String> {
    if entries.is_empty() {
        return Err("no entries in selected range".into());
    }

    ensure_not_cancelled(path, 0, should_cancel)?;

    let field_names = csv_field_names(&entries);
    let pending_path = pending_export_path(path);
    let pending_path_string = pending_path.to_string_lossy().to_string();
    let file = std::fs::File::create(&pending_path)
        .map_err(|error| format!("failed to create file: {error}"))?;
    let mut writer = std::io::BufWriter::new(file);

    use std::io::Write;

    write_csv_cell(&mut writer, "timestamp_sec", false).inspect_err(|_| cleanup_partial_export(&pending_path_string))?;
    write!(writer, ",").map_err(|error| error.to_string()).inspect_err(|_| cleanup_partial_export(&pending_path_string))?;
    write_csv_cell(&mut writer, "msg_type", false).inspect_err(|_| cleanup_partial_export(&pending_path_string))?;
    for name in &field_names {
        write!(writer, ",").map_err(|error| error.to_string()).inspect_err(|_| cleanup_partial_export(&pending_path_string))?;
        write_csv_cell(&mut writer, name, true).inspect_err(|_| cleanup_partial_export(&pending_path_string))?;
    }
    writeln!(writer).map_err(|error| error.to_string()).inspect_err(|_| cleanup_partial_export(&pending_path_string))?;
    ensure_not_cancelled(&pending_path_string, 0, should_cancel)?;

    let mut row_count = 0_u64;
    for entry in entries {
        ensure_not_cancelled(&pending_path_string, row_count, should_cancel)?;
        write_csv_cell(&mut writer, &format!("{:.6}", entry.timestamp_usec as f64 / 1e6), false)
            .inspect_err(|_| cleanup_partial_export(&pending_path_string))?;
        write!(writer, ",").map_err(|error| error.to_string()).inspect_err(|_| cleanup_partial_export(&pending_path_string))?;
        write_csv_cell(&mut writer, &entry.msg_name, true).inspect_err(|_| cleanup_partial_export(&pending_path_string))?;
        for name in &field_names {
            write!(writer, ",").map_err(|error| error.to_string()).inspect_err(|_| cleanup_partial_export(&pending_path_string))?;
            if let Some(value) = entry.fields.get(name) {
                write_csv_cell(&mut writer, &value.to_string(), false)
                    .inspect_err(|_| cleanup_partial_export(&pending_path_string))?;
            } else {
                write_csv_cell(&mut writer, "", false).inspect_err(|_| cleanup_partial_export(&pending_path_string))?;
            }
        }
        writeln!(writer).map_err(|error| error.to_string()).inspect_err(|_| cleanup_partial_export(&pending_path_string))?;
        row_count += 1;
        ensure_not_cancelled(&pending_path_string, row_count, should_cancel)?;
    }

    ensure_not_cancelled(&pending_path_string, row_count, should_cancel)?;
    writer.flush().map_err(|error| error.to_string()).inspect_err(|_| cleanup_partial_export(&pending_path_string))?;
    ensure_not_cancelled(&pending_path_string, row_count, should_cancel)?;

    finalize_export_file(&pending_path, Path::new(path)).inspect_err(|_| cleanup_partial_export(&pending_path_string))?;

    let bytes_written = std::fs::metadata(path)
        .map_err(|error| format!("failed to stat export file: {error}"))?
        .len();
    Ok((row_count, bytes_written))
}

#[cfg(test)]
pub(super) fn export_csv_from_store(
    store: &LogStore,
    request: &LogExportRequest,
) -> Result<LogExportResult, String> {
    let entries: Vec<&StoredEntry> = store
        .entries
        .iter()
        .filter(|entry| {
            entry_matches_common_filters(
                entry,
                request.start_usec,
                request.end_usec,
                &request.message_types,
                request.text.as_deref(),
                &request.field_filters,
            )
        })
        .collect();
    let (rows_written, bytes_written) = write_csv_export(&request.destination_path, entries)?;
    Ok(LogExportResult {
        operation_id: OperationId::LogExport,
        destination_path: request.destination_path.clone(),
        bytes_written,
        rows_written,
        diagnostics: Vec::new(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_csv_export_cleans_up_partial_file_when_cancelled_during_rows() {
        let entry_one = StoredEntry {
            sequence: 0,
            timestamp_usec: 100,
            msg_name: "HEARTBEAT".into(),
            fields: std::collections::HashMap::from([("custom_mode".to_string(), 4.0)]),
            field_values: std::collections::BTreeMap::from([("custom_mode".to_string(), JsonValue::from(4.0))]),
            raw_len_bytes: 0,
            raw_payload: None,
            system_id: None,
            component_id: None,
            text: "HEARTBEAT".into(),
        };
        let entry_two = StoredEntry {
            sequence: 1,
            timestamp_usec: 200,
            msg_name: "ATTITUDE".into(),
            fields: std::collections::HashMap::from([("roll".to_string(), 1.0)]),
            field_values: std::collections::BTreeMap::from([("roll".to_string(), JsonValue::from(1.0))]),
            raw_len_bytes: 0,
            raw_payload: None,
            system_id: None,
            component_id: None,
            text: "ATTITUDE".into(),
        };
        let entries = vec![&entry_one, &entry_two];
        let path = std::env::temp_dir().join(format!(
            "ironwing-cancelled-export-{}-{}.csv",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        let path_string = path.to_string_lossy().to_string();

        let result = write_csv_export_inner(&path_string, entries, &mut |rows_written| rows_written >= 1);

        assert!(result.is_err());
        assert!(!path.exists());
    }

    #[test]
    fn cancelled_export_keeps_existing_destination_file() {
        let entry_one = StoredEntry {
            sequence: 0,
            timestamp_usec: 100,
            msg_name: "HEARTBEAT".into(),
            fields: std::collections::HashMap::from([("custom_mode".to_string(), 4.0)]),
            field_values: std::collections::BTreeMap::from([("custom_mode".to_string(), JsonValue::from(4.0))]),
            raw_len_bytes: 0,
            raw_payload: None,
            system_id: None,
            component_id: None,
            text: "HEARTBEAT".into(),
        };
        let entry_two = StoredEntry {
            sequence: 1,
            timestamp_usec: 200,
            msg_name: "ATTITUDE".into(),
            fields: std::collections::HashMap::from([("roll".to_string(), 1.0)]),
            field_values: std::collections::BTreeMap::from([("roll".to_string(), JsonValue::from(1.0))]),
            raw_len_bytes: 0,
            raw_payload: None,
            system_id: None,
            component_id: None,
            text: "ATTITUDE".into(),
        };
        let entries = vec![&entry_one, &entry_two];
        let temp_dir = std::env::temp_dir().join(format!(
            "ironwing-cancelled-export-destination-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        std::fs::create_dir_all(&temp_dir).expect("create temp export dir");
        let path = temp_dir.join("export.csv");
        std::fs::write(&path, "keep-this-file\n").expect("seed destination file");
        let path_string = path.to_string_lossy().to_string();

        let result = write_csv_export_inner(&path_string, entries, &mut |rows_written| rows_written >= 1);

        assert!(result.is_err());
        assert_eq!(
            std::fs::read_to_string(&path).expect("read seeded destination"),
            "keep-this-file\n"
        );
        let entries_after = std::fs::read_dir(&temp_dir)
            .expect("read temp export dir")
            .map(|entry| entry.expect("dir entry").file_name().to_string_lossy().to_string())
            .collect::<Vec<_>>();
        assert_eq!(entries_after, vec!["export.csv".to_string()]);
    }

    #[test]
    fn finalize_failure_restores_previous_destination_and_cleans_pending_temp() {
        let temp_dir = std::env::temp_dir().join(format!(
            "ironwing-finalize-failure-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        std::fs::create_dir_all(&temp_dir).expect("create temp dir");
        let destination = temp_dir.join("export.csv");
        std::fs::write(&destination, "keep-this-file\n").expect("seed destination file");
        let missing_pending = temp_dir.join("missing-pending.tmp");

        let result = finalize_export_file(&missing_pending, &destination);

        assert!(result.is_err());
        assert_eq!(
            std::fs::read_to_string(&destination).expect("read restored destination"),
            "keep-this-file\n"
        );
        if let Some(parent) = destination.parent() {
            for entry in std::fs::read_dir(parent).expect("read temp export dir") {
                let entry = entry.expect("dir entry");
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with(".export.csv.ironwing-backup") {
                    cleanup_partial_export(&entry.path().to_string_lossy());
                }
            }
        }
    }
}
