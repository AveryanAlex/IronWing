import { invoke } from "@platform/core";
import { listen, type UnlistenFn } from "@platform/event";
import { EVENT_NAMES } from "./lib/generated/events";
import type * as Generated from "./lib/generated/ironwing";
import type { FlightPathPoint } from "./playback";

type UiWire<T> = T extends bigint
  ? number
  : T extends string | number | boolean | null | undefined
    ? T
    : T extends Array<infer Item>
      ? UiWire<Item>[]
      : T extends object
        ? { [K in keyof T]: UiWire<T[K]> }
        : T;

export type LogType = Generated.LogFormat;

export type LogFormat = Generated.LogFormat;

export type LogFormatAdapter = UiWire<Generated.LogFormatAdapter>;

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

export type ReferencedFileFingerprint = UiWire<Generated.ReferencedFileFingerprint>;
export type ReferencedFileStatus = UiWire<Generated.ReferencedFileStatus>;
export type ReferencedLogFile = UiWire<Generated.ReferencedLogFile>;
export type LogDiagnosticSeverity = Generated.LogDiagnosticSeverity;
export type LogDiagnosticSource = Generated.LogDiagnosticSource;
export type LogDiagnostic = UiWire<Generated.LogDiagnostic>;
export type LogMetadata = UiWire<Generated.LogMetadata>;
export type LogIndexReference = UiWire<Generated.LogIndexReference>;
export type LogLibraryEntryStatus = Generated.LogLibraryEntryStatus;
export type LogLibraryEntry = UiWire<Generated.LogLibraryEntry>;
export type AppDataLogLibraryStorageLocation = Extract<UiWire<Generated.LogLibraryStorageLocation>, { kind: "app_data" }>;
export type BrowserLogLibraryStorageLocation = Extract<UiWire<Generated.LogLibraryStorageLocation>, { kind: "browser_storage" }>;
export type LogLibraryStorageLocation = UiWire<Generated.LogLibraryStorageLocation>;
export type LogLibraryCatalog = UiWire<Generated.LogLibraryCatalog>;
export type LogCatalogMigrationError = UiWire<Generated.LogCatalogMigrationError>;
export type LogLoadPhase = Generated.LogOperationPhase;
export type LogProgress = UiWire<Generated.LogOperationProgress>;

export type RawMessageQuery = UiWire<Generated.RawMessageQuery>;

export type JsonFieldValue = string | number | boolean | null | JsonFieldValue[] | { [key: string]: JsonFieldValue };

export type RawMessageFieldFilter = UiWire<Generated.RawMessageFieldFilter>;
export type RawMessageRecord = Omit<UiWire<Generated.RawMessageRecord>, "fields" | "detail"> & {
  fields: Record<string, JsonFieldValue>;
  detail: JsonFieldValue | null;
};
export type RawMessagePage = Omit<UiWire<Generated.RawMessagePage>, "items"> & {
  items: RawMessageRecord[];
};
export type ChartSeriesSelector = UiWire<Generated.ChartSeriesSelector>;
export type ChartSeriesRequest = UiWire<Generated.ChartSeriesRequest>;
export type ChartPoint = Omit<UiWire<Generated.ChartPoint>, "value"> & { value: number };
export type ChartSeries = Omit<UiWire<Generated.ChartSeries>, "points"> & { points: ChartPoint[] };
export type ChartSeriesPage = Omit<UiWire<Generated.ChartSeriesPage>, "series"> & { series: ChartSeries[] };
export type LogExportFormat = Generated.LogExportFormat;
export type LogExportRequest = UiWire<Generated.LogExportRequest>;

export type FlightPathQuery = {
  entry_id: string;
  start_usec: number | null;
  end_usec: number | null;
  max_points: number | null;
};

export type LogExportResult = UiWire<Generated.LogExportResult>;

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
  return listen<LogProgress>(EVENT_NAMES.LOG_PROGRESS, (event) => cb(event.payload));
}
