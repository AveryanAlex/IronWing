import { invoke } from "@platform/core";
import { listen, type UnlistenFn } from "@platform/event";
import type { FlightPathPoint } from "./playback";
import type { OperationId } from "./session";

export type LogType = "tlog" | "bin";

export type LogFormat = LogType;

export type LogFormatAdapter = {
  format: LogFormat;
  label: string;
  file_extensions: string[];
  supports_replay: boolean;
  supports_raw_messages: boolean;
  supports_chart_series: boolean;
};

export type LogSummary = {
  file_name: string;
  start_usec: number;
  end_usec: number;
  duration_secs: number;
  total_entries: number;
  message_types: Record<string, number>;
  log_type: LogType;
};

export type LogDataPoint = {
  timestamp_usec: number;
  fields: Record<string, number>;
};

export type ReferencedFileFingerprint = {
  size_bytes: number;
  modified_unix_msec: number;
};

export type ReferencedFileStatus =
  | { kind: "available"; current_fingerprint: ReferencedFileFingerprint }
  | { kind: "missing" }
  | { kind: "stale"; current_fingerprint: ReferencedFileFingerprint };

export type ReferencedLogFile = {
  original_path: string;
  fingerprint: ReferencedFileFingerprint;
  status: ReferencedFileStatus;
};

export type LogDiagnosticSeverity = "info" | "warning" | "error";

export type LogDiagnosticSource = "catalog" | "file_system" | "parse" | "index" | "replay" | "export" | "recording";

export type LogDiagnostic = {
  severity: LogDiagnosticSeverity;
  source: LogDiagnosticSource;
  code: string;
  message: string;
  recoverable: boolean;
  timestamp_usec: number | null;
};

export type LogMetadata = {
  display_name: string;
  format: LogFormat;
  start_usec: number | null;
  end_usec: number | null;
  duration_secs: number | null;
  total_messages: number;
  message_types: Record<string, number>;
  vehicle_type: string | null;
  autopilot: string | null;
};

/**
 * Snapshot of the entry-specific index file stored beside the catalog.
 * `index_version` is intentionally separate from the catalog schema so index
 * rebuilds can roll forward without forcing a catalog migration.
 */
export type LogIndexReference = {
  index_id: string;
  relative_path: string;
  format: LogFormat;
  index_version: number;
  built_at_unix_msec: number;
  message_count: number;
  covers_start_usec: number | null;
  covers_end_usec: number | null;
};

export type LogLibraryEntryStatus = "ready" | "missing" | "stale" | "indexing" | "partial" | "corrupt" | "unsupported";

export type LogLibraryEntry = {
  entry_id: string;
  status: LogLibraryEntryStatus;
  imported_at_unix_msec: number;
  source: ReferencedLogFile;
  metadata: LogMetadata;
  diagnostics: LogDiagnostic[];
  index: LogIndexReference | null;
};

/**
 * Serialized description of the app-data layout used for the log library.
 * The catalog records these paths so migrations and diagnostics can explain
 * where the catalog, indexes, and recordings live on disk.
 */
export type LogLibraryStorageLocation = {
  kind: "app_data";
  catalog_path: string;
  indexes_dir: string;
  recordings_dir: string;
};

/**
 * Top-level log library catalog persisted in app data.
 * `schema_version` is the catalog JSON contract; `migrated_from_schema_version`
 * captures exact-match v1 migrations only.
 */
export type LogLibraryCatalog = {
  schema_version: 1;
  storage: LogLibraryStorageLocation;
  migrated_from_schema_version: number | null;
  entries: LogLibraryEntry[];
};

export type LogCatalogMigrationError =
  | { kind: "missing_schema_version" }
  | { kind: "unsupported_schema_version"; schema_version: number; supported_schema_version: number }
  | { kind: "invalid_catalog"; message: string };

export type LogLoadPhase =
  | "queued"
  | "reading_metadata"
  | "parsing"
  | "indexing"
  | "writing_catalog"
  | "exporting"
  | "completed"
  | "cancelled"
  | "failed";

export type LogProgress = {
  operation_id: OperationId;
  phase: LogLoadPhase;
  completed_items: number;
  total_items: number | null;
  percent: number | null;
  entry_id: string | null;
  instance_id: string | null;
  message: string | null;
};

export type RawMessageQuery = {
  entry_id: string;
  cursor: string | null;
  start_usec: number | null;
  end_usec: number | null;
  message_types: string[];
  text: string | null;
  field_filters: RawMessageFieldFilter[];
  limit: number;
  include_detail: boolean;
  include_hex: boolean;
};

export type JsonFieldValue = string | number | boolean | null | JsonFieldValue[] | { [key: string]: JsonFieldValue };

export type RawMessageFieldFilter = {
  field: string;
  value_text: string | null;
};

export type RawMessageRecord = {
  sequence: number;
  timestamp_usec: number;
  message_type: string;
  system_id: number | null;
  component_id: number | null;
  raw_len_bytes: number;
  fields: Record<string, JsonFieldValue>;
  detail: JsonFieldValue | null;
  hex_payload: string | null;
  diagnostics: LogDiagnostic[];
};

export type RawMessagePage = {
  entry_id: string;
  items: RawMessageRecord[];
  next_cursor: string | null;
  total_available: number | null;
};

export type ChartSeriesSelector = {
  message_type: string;
  field: string;
  label: string;
  unit: string | null;
};

export type ChartSeriesRequest = {
  entry_id: string;
  selectors: ChartSeriesSelector[];
  start_usec: number | null;
  end_usec: number | null;
  max_points: number | null;
};

export type ChartPoint = {
  timestamp_usec: number;
  value: number;
};

export type ChartSeries = {
  selector: ChartSeriesSelector;
  points: ChartPoint[];
};

export type ChartSeriesPage = {
  entry_id: string;
  start_usec: number | null;
  end_usec: number | null;
  series: ChartSeries[];
  diagnostics: LogDiagnostic[];
};

export type LogExportFormat = "csv";

export type LogExportRequest = {
  entry_id: string;
  instance_id: string;
  format: LogExportFormat;
  destination_path: string;
  start_usec: number | null;
  end_usec: number | null;
  message_types: string[];
  text: string | null;
  field_filters: RawMessageFieldFilter[];
};

export type FlightPathQuery = {
  entry_id: string;
  start_usec: number | null;
  end_usec: number | null;
  max_points: number | null;
};

export type LogExportResult = {
  operation_id: OperationId;
  destination_path: string;
  bytes_written: number;
  rows_written: number;
  diagnostics: LogDiagnostic[];
};

/** Load only the log summary metadata; bounded queries fetch the actual data. */
export async function openLog(path: string): Promise<LogSummary> {
  return invoke<LogSummary>("log_open", { path });
}

export async function queryLogMessages(
  msgType: string,
  startUsec?: number,
  endUsec?: number,
  maxPoints?: number,
): Promise<LogDataPoint[]> {
  return invoke<LogDataPoint[]>("log_query", {
    msgType,
    startUsec: startUsec ?? null,
    endUsec: endUsec ?? null,
    maxPoints: maxPoints ?? null,
  });
}

export async function getLogSummary(): Promise<LogSummary | null> {
  return invoke<LogSummary | null>("log_get_summary");
}

export async function closeLog(): Promise<void> {
  return invoke<void>("log_close");
}

export async function listLogFormatAdapters(): Promise<LogFormatAdapter[]> {
  return invoke<LogFormatAdapter[]>("log_format_adapters");
}

export async function getLogLibraryCatalog(): Promise<LogLibraryCatalog> {
  return invoke<LogLibraryCatalog>("log_library_list");
}

export async function refreshLogLibrary(): Promise<LogLibraryCatalog> {
  return invoke<LogLibraryCatalog>("log_library_list");
}

export async function registerLogLibraryEntry(path: string): Promise<LogLibraryEntry> {
  return invoke<LogLibraryEntry>("log_library_register", { path });
}

export async function registerLogLibraryEntryFromPicker(): Promise<LogLibraryEntry | null> {
  return invoke<LogLibraryEntry | null>("log_library_register_open_file");
}

export async function removeLogLibraryEntry(entryId: string): Promise<LogLibraryCatalog> {
  return invoke<LogLibraryCatalog>("log_library_remove", { entryId });
}

export async function relinkLogLibraryEntry(entryId: string, path: string): Promise<LogLibraryEntry> {
  return invoke<LogLibraryEntry>("log_library_relink", { entryId, path });
}

export async function reindexLogLibraryEntry(entryId: string): Promise<LogLibraryEntry> {
  return invoke<LogLibraryEntry>("log_library_reindex", { entryId });
}

export async function cancelLogLibraryOperation(): Promise<boolean> {
  return invoke<boolean>("log_library_cancel");
}

/** Fetch one bounded raw-message page for the active entry and filter slice. */
export async function queryRawMessages(request: RawMessageQuery): Promise<RawMessagePage> {
  return invoke<RawMessagePage>("log_raw_messages_query", { request });
}

/** Fetch bounded chart series for the active entry and selected time window. */
export async function queryChartSeries(request: ChartSeriesRequest): Promise<ChartSeriesPage> {
  return invoke<ChartSeriesPage>("log_chart_series_query", { request });
}

export async function queryFlightPath(request: FlightPathQuery): Promise<FlightPathPoint[]> {
  return invoke<FlightPathPoint[]>("log_get_flight_path", {
    entryId: request.entry_id,
    startUsec: request.start_usec,
    endUsec: request.end_usec,
    maxPoints: request.max_points,
  });
}

export async function exportLog(request: LogExportRequest): Promise<LogExportResult> {
  return invoke<LogExportResult>("log_export", { request });
}

export type FlightSummary = {
  duration_secs: number;
  max_alt_m: number | null;
  avg_alt_m: number | null;
  max_speed_mps: number | null;
  avg_speed_mps: number | null;
  total_distance_m: number | null;
  max_distance_from_home_m: number | null;
  battery_start_v: number | null;
  battery_end_v: number | null;
  battery_min_v: number | null;
  mah_consumed: number | null;
  gps_sats_min: number | null;
  gps_sats_max: number | null;
};

export async function getFlightSummary(): Promise<FlightSummary> {
  return invoke<FlightSummary>("log_get_flight_summary");
}

export async function exportLogCsv(
  path: string,
  startUsec?: number,
  endUsec?: number,
): Promise<number> {
  return invoke<number>("log_export_csv", {
    path,
    startUsec: startUsec ?? null,
    endUsec: endUsec ?? null,
  });
}

export async function subscribeLogProgress(cb: (progress: LogProgress) => void): Promise<UnlistenFn> {
  return listen<LogProgress>("log://progress", (event) => cb(event.payload));
}
