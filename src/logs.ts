import { EVENT_NAMES } from "./lib/generated/events";
import type * as Generated from "./lib/generated/ironwing";
import type * as GeneratedJson from "./lib/generated/ironwing-json";
import { typedInvoke, typedListen, type UnlistenFn } from "./lib/ipc/client";
import type { FlightPathPoint } from "./playback";

export type LogType = Generated.LogFormat;

export type LogFormat = Generated.LogFormat;

export type LogFormatAdapter = GeneratedJson.LogFormatAdapter;

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

export type ReferencedFileFingerprint = GeneratedJson.ReferencedFileFingerprint;
export type ReferencedFileStatus = GeneratedJson.ReferencedFileStatus;
export type ReferencedLogFile = GeneratedJson.ReferencedLogFile;
export type LogDiagnosticSeverity = Generated.LogDiagnosticSeverity;
export type LogDiagnosticSource = Generated.LogDiagnosticSource;
export type LogDiagnostic = GeneratedJson.LogDiagnostic;
export type LogMetadata = GeneratedJson.LogMetadata;
export type LogIndexReference = GeneratedJson.LogIndexReference;
export type LogLibraryEntryStatus = Generated.LogLibraryEntryStatus;
export type LogLibraryEntry = GeneratedJson.LogLibraryEntry;
export type AppDataLogLibraryStorageLocation = Extract<GeneratedJson.LogLibraryStorageLocation, { kind: "app_data" }>;
export type BrowserLogLibraryStorageLocation = Extract<GeneratedJson.LogLibraryStorageLocation, { kind: "browser_storage" }>;
export type LogLibraryStorageLocation = GeneratedJson.LogLibraryStorageLocation;
export type LogLibraryCatalog = GeneratedJson.LogLibraryCatalog;
export type LogCatalogMigrationError = GeneratedJson.LogCatalogMigrationError;
export type LogLoadPhase = Generated.LogOperationPhase;
export type LogProgress = GeneratedJson.LogProgress;

export type RawMessageQuery = GeneratedJson.RawMessageQuery;

export type JsonFieldValue = string | number | boolean | null | JsonFieldValue[] | { [key: string]: JsonFieldValue };

export type RawMessageFieldFilter = GeneratedJson.RawMessageFieldFilter;
export type RawMessageRecord = Omit<GeneratedJson.RawMessageRecord, "fields" | "detail"> & {
  fields: Record<string, JsonFieldValue>;
  detail: JsonFieldValue | null;
};
export type RawMessagePage = Omit<GeneratedJson.RawMessagePage, "items"> & {
  items: RawMessageRecord[];
};
export type ChartSeriesSelector = GeneratedJson.ChartSeriesSelector;
export type ChartSeriesRequest = GeneratedJson.ChartSeriesRequest;
export type ChartPoint = GeneratedJson.ChartPoint;
export type NonNullChartPoint = Omit<GeneratedJson.ChartPoint, "value"> & { value: number };
export type ChartSeries = GeneratedJson.ChartSeries;
export type NonNullChartSeries = Omit<GeneratedJson.ChartSeries, "points"> & { points: NonNullChartPoint[] };
export type ChartSeriesPage = GeneratedJson.ChartSeriesPage;

export function isNonNullChartPoint(point: GeneratedJson.ChartPoint): point is NonNullChartPoint {
  return point.value !== null;
}

export type LogExportFormat = Generated.LogExportFormat;
export type LogExportRequest = GeneratedJson.LogExportRequest;

export type FlightPathQuery = {
  entry_id: string;
  start_usec: number | null;
  end_usec: number | null;
  max_points: number | null;
};

export type LogExportResult = GeneratedJson.LogExportResult;

/** Load only the log summary metadata; bounded queries fetch the actual data. */
export async function openLog(path: string): Promise<LogSummary> {
  return typedInvoke("log_open", { path });
}

export async function queryLogMessages(
  msgType: string,
  startUsec?: number,
  endUsec?: number,
  maxPoints?: number,
): Promise<LogDataPoint[]> {
  return typedInvoke("log_query", {
    msgType,
    startUsec: startUsec ?? null,
    endUsec: endUsec ?? null,
    maxPoints: maxPoints ?? null,
  });
}

export async function getLogSummary(): Promise<LogSummary | null> {
  return typedInvoke("log_get_summary");
}

export async function closeLog(): Promise<void> {
  return typedInvoke("log_close");
}

export async function listLogFormatAdapters(): Promise<LogFormatAdapter[]> {
  return typedInvoke("log_format_adapters");
}

export async function getLogLibraryCatalog(): Promise<LogLibraryCatalog> {
  return typedInvoke("log_library_list");
}

export async function refreshLogLibrary(): Promise<LogLibraryCatalog> {
  return typedInvoke("log_library_list");
}

export async function registerLogLibraryEntry(path: string): Promise<LogLibraryEntry> {
  return typedInvoke("log_library_register", { path });
}

export async function registerLogLibraryEntryFromPicker(): Promise<LogLibraryEntry | null> {
  return typedInvoke("log_library_register_open_file");
}

export async function removeLogLibraryEntry(entryId: string): Promise<LogLibraryCatalog> {
  return typedInvoke("log_library_remove", { entryId });
}

export async function relinkLogLibraryEntry(entryId: string, path: string): Promise<LogLibraryEntry> {
  return typedInvoke("log_library_relink", { entryId, path });
}

export async function reindexLogLibraryEntry(entryId: string): Promise<LogLibraryEntry> {
  return typedInvoke("log_library_reindex", { entryId });
}

export async function cancelLogLibraryOperation(): Promise<boolean> {
  return typedInvoke("log_library_cancel");
}

/** Fetch one bounded raw-message page for the active entry and filter slice. */
export async function queryRawMessages(request: RawMessageQuery): Promise<RawMessagePage> {
  return typedInvoke("log_raw_messages_query", { request });
}

/** Fetch bounded chart series for the active entry and selected time window. */
export async function queryChartSeries(request: ChartSeriesRequest): Promise<ChartSeriesPage> {
  return typedInvoke("log_chart_series_query", { request });
}

export async function queryFlightPath(request: FlightPathQuery): Promise<FlightPathPoint[]> {
  return typedInvoke("log_get_flight_path", {
    entryId: request.entry_id,
    startUsec: request.start_usec,
    endUsec: request.end_usec,
    maxPoints: request.max_points,
  });
}

export async function exportLog(request: LogExportRequest): Promise<LogExportResult> {
  return typedInvoke("log_export", { request });
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
  return typedInvoke("log_get_flight_summary");
}

export async function exportLogCsv(
  path: string,
  startUsec?: number,
  endUsec?: number,
): Promise<number> {
  return typedInvoke("log_export_csv", {
    path,
    startUsec: startUsec ?? null,
    endUsec: endUsec ?? null,
  });
}

export async function subscribeLogProgress(cb: (progress: LogProgress) => void): Promise<UnlistenFn> {
  return typedListen(EVENT_NAMES.LOG_PROGRESS, (event) => cb(event.payload));
}
