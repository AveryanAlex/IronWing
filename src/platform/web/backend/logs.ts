import { PLAYBACK_SPEEDS, DEFAULT_PLAYBACK_SPEED } from "../../../lib/generated/ironwing";
import { emitWebEvent } from "../event";
import { wasmOpenLog, type ParsedLogHandle } from "../wasm";
import { definePlatformCommandHandlers } from "./command-handler";
import {
  BROWSER_LOG_STORAGE_LOCATION,
  createEmptyBrowserLogLibraryCatalog,
  getBrowserPersistentStorage,
} from "./browser-storage";
import { metadataForBrowserFile, openBrowserBinaryFile, saveBrowserBytes } from "./browser-files";
import type { BrowserFileMetadata } from "./browser-files";
import type {
  ChartSeriesRequest,
  LogDiagnostic,
  LogExportRequest,
  LogFormat,
  LogFormatAdapter,
  LogLibraryCatalog,
  LogLibraryEntry,
  LogLibraryEntryStatus,
  LogProgress,
  LogMetadata,
  RawMessageQuery,
} from "../../../logs";
import type { ReplayState } from "../../../playback";
import type { SessionEnvelope } from "../../../session";
import { EVENT_NAMES } from "../../../lib/generated/events";

export const EMPTY_WEB_LOG_LIBRARY: LogLibraryCatalog = createEmptyBrowserLogLibraryCatalog();

export const WEB_LOG_FORMAT_ADAPTERS: LogFormatAdapter[] = [
  {
    format: "tlog",
    label: "MAVLink telemetry log",
    file_extensions: ["tlog"],
    supports_replay: true,
    supports_raw_messages: true,
    supports_chart_series: true,
  },
  {
    format: "bin",
    label: "ArduPilot dataflash log",
    file_extensions: ["bin"],
    supports_replay: true,
    supports_raw_messages: true,
    supports_chart_series: true,
  },
];

const INDEX_SCHEMA_VERSION = 1;
const PLAYBACK_TICK_MSEC = 100;

type ActiveLog = {
  entryId: string;
  leases: number;
  closed: boolean;
  handle: ParsedLogHandle;
  summary: ParsedLogHandle["summary"];
};

type BrowserPlayback = {
  state: ReplayState;
  envelope: SessionEnvelope | null;
  timer: ReturnType<typeof setInterval> | null;
  startedAtMsec: number;
  startCursorUsec: number;
};

type LogQueryArgs = {
  msgType: string;
  startUsec: number | null;
  endUsec: number | null;
  maxPoints: number | null;
};

type FlightPathArgs =
  | { maxPoints: number | null }
  | { entryId: string; startUsec: number | null; endUsec: number | null; maxPoints: number | null };

type TelemetryTrackArgs = { maxPoints: number | null };
type LogExportCsvArgs = { path: string; startUsec: number | null; endUsec: number | null };

let activeLog: ActiveLog | null = null;
let activeOperation: AbortController | null = null;
let playback: BrowserPlayback = {
  state: idlePlaybackState(),
  envelope: null,
  timer: null,
  startedAtMsec: 0,
  startCursorUsec: 0,
};

export const logCommandHandlers = definePlatformCommandHandlers({
  log_format_adapters: () => WEB_LOG_FORMAT_ADAPTERS,
  log_library_list: async () => getBrowserPersistentStorage().loadLogCatalog(),
  log_library_register: async ({ path }) => registerPath(path),
  log_library_register_open_file: async () => registerOpenFile(),
  log_library_remove: async ({ entryId }) => removeEntry(entryId),
  log_library_relink: async ({ entryId, path }) => relinkEntry(entryId, path),
  log_library_reindex: async ({ entryId }) => reindexEntry(entryId),
  log_library_cancel: () => cancelLogOperation(),
  log_open: async ({ path }) => openStoredLog(path),
  log_query: async (args) => queryActiveLogMessages(args),
  log_get_summary: () => activeLog?.summary ?? null,
  log_close: () => {
    stopPlayback(false);
    closeLog(activeLog);
    activeLog = null;
  },
  log_raw_messages_query: async ({ request }) => queryRawMessages(request),
  log_chart_series_query: async ({ request }) => queryChartSeries(request),
  log_get_flight_path: async (args) => getFlightPath(args),
  log_get_telemetry_track: async (args) => getTelemetryTrack(args),
  log_get_flight_summary: async () => getFlightSummary(),
  log_export: async ({ request }) => exportLog(request),
  log_export_csv: async (args) => exportCompatCsv(args),
  playback_play: async () => playPlayback(),
  playback_pause: () => pausePlayback(),
  playback_seek: async ({ cursorUsec }) => seekPlayback(cursorUsec),
  playback_set_speed: async ({ speed }) => setPlaybackSpeed(speed),
  playback_stop: () => stopPlayback(true),
});

async function registerOpenFile(): Promise<LogLibraryEntry | null> {
  if (!canOpenBrowserPicker()) {
    return null;
  }
  const selection = await openBrowserBinaryFile({
    accepts: [{ description: "Telemetry logs", extensions: [".tlog", ".bin"] }],
  });
  if (!selection) {
    return null;
  }
  return registerBrowserLogBytes(selection.metadata, selection.contents);
}

function canOpenBrowserPicker(): boolean {
  const windowRef = globalThis.window as (Window & { showOpenFilePicker?: unknown }) | undefined;
  if (windowRef?.showOpenFilePicker) {
    return true;
  }
  return globalThis.navigator?.userActivation?.isActive === true;
}

async function registerPath(path: string): Promise<LogLibraryEntry> {
  const stored = await storedLogForPath(path);
  if (!stored) {
    throw new Error("Pure web mode can only register browser-picked or browser-stored log files.");
  }
  return reindexEntry(stored.entry_id);
}

export async function registerBrowserLogBytes(source: BrowserFileMetadata, bytes: Uint8Array, entryId = source.id): Promise<LogLibraryEntry> {
  const format = detectFormat(source.name);
  if (!format) {
    return saveEntry(unsupportedEntry(entryId, source));
  }

  const operation = startOperation("log_library_register");
  emitProgress("parsing", operation, { entryId, message: "parsing browser log" });
  try {
    const parsed = await wasmOpenLog(source.name, format, bytes);
    try {
      const importedAt = Date.now();
      const metadata = metadataFromSummary(parsed.summary);
      const index = {
        index_id: entryId,
        relative_path: `${entryId}.json`,
        format,
        index_version: INDEX_SCHEMA_VERSION,
        built_at_unix_msec: importedAt,
        message_count: metadata.total_messages,
        covers_start_usec: metadata.start_usec,
        covers_end_usec: metadata.end_usec,
      };
      await getBrowserPersistentStorage().putLogBytes({ entry_id: entryId, format, source, bytes });
      await getBrowserPersistentStorage().putLogIndex({
        index_id: entryId,
        entry_id: entryId,
        reference: index,
        payload: { metadata, diagnostics: parsed.diagnostics },
      });
      const entry = await saveEntry({
        entry_id: entryId,
        status: statusFromIndexResult(metadata.total_messages, parsed.diagnostics),
        imported_at_unix_msec: importedAt,
        source: referencedFile(source),
        metadata,
        diagnostics: parsed.diagnostics,
        index,
      });
      emitProgress("completed", operation, { entryId, completedItems: metadata.total_messages, totalItems: metadata.total_messages, percent: 100 });
      return entry;
    } finally {
      parsed.free();
    }
  } catch (error) {
    emitProgress("failed", operation, { entryId, message: errorMessage(error) });
    throw error;
  } finally {
    clearOperation();
  }
}

async function saveEntry(entry: LogLibraryEntry): Promise<LogLibraryEntry> {
  const storage = getBrowserPersistentStorage();
  const catalog = await storage.loadLogCatalog();
  catalog.entries = catalog.entries.filter((existing) => existing.entry_id !== entry.entry_id);
  catalog.entries.push(entry);
  await storage.saveLogCatalog({ ...catalog, storage: BROWSER_LOG_STORAGE_LOCATION });
  return entry;
}

async function removeEntry(entryId: string): Promise<LogLibraryCatalog> {
  const storage = getBrowserPersistentStorage();
  const catalog = await storage.loadLogCatalog();
  catalog.entries = catalog.entries.filter((entry) => entry.entry_id !== entryId);
  await storage.deleteLogBytes(entryId);
  await storage.deleteLogIndex(entryId);
  await storage.saveLogCatalog(catalog);
  if (activeLog?.entryId === entryId) {
    closeLog(activeLog);
    activeLog = null;
    stopPlayback(false);
  }
  return catalog;
}

async function relinkEntry(entryId: string, path: string): Promise<LogLibraryEntry> {
  const stored = await storedLogForPath(path);
  if (stored) {
    return registerBrowserLogBytes(stored.source, stored.bytes, entryId);
  }
  const selection = await openBrowserBinaryFile({
    accepts: [{ description: "Telemetry logs", extensions: [".tlog", ".bin"] }],
  });
  if (!selection) {
    throw new Error("no replacement log file selected");
  }
  return registerBrowserLogBytes(selection.metadata, selection.contents, entryId);
}

async function reindexEntry(entryId: string): Promise<LogLibraryEntry> {
  const stored = await getBrowserPersistentStorage().getLogBytes(entryId);
  if (!stored) {
    const catalog = await getBrowserPersistentStorage().loadLogCatalog();
    const entry = catalog.entries.find((candidate) => candidate.entry_id === entryId);
    if (!entry) {
      throw new Error(`log library entry not found: ${entryId}`);
    }
    const missing = { ...entry, status: "missing" as const, source: { ...entry.source, status: { kind: "missing" as const } } };
    await saveEntry(missing);
    return missing;
  }
  return registerBrowserLogBytes(stored.source, stored.bytes, entryId);
}

function cancelLogOperation(): boolean {
  if (!activeOperation) {
    return false;
  }
  activeOperation.abort();
  activeOperation = null;
  emitProgress("cancelled", "log_library_cancel", { message: "log operation cancelled" });
  return true;
}

async function openStoredLog(path: string) {
  const stored = await storedLogForPath(path);
  if (!stored) {
    throw new Error(`browser log not found: ${path}`);
  }
  const format = stored.format ?? detectFormat(stored.source.name);
  if (!format) {
    throw new Error("unsupported log format");
  }
  const parsed = await wasmOpenLog(stored.source.name, format, stored.bytes);
  stopPlayback(false);
  closeLog(activeLog);
  activeLog = {
    entryId: stored.entry_id,
    leases: 0,
    closed: false,
    handle: parsed,
    summary: parsed.summary,
  };
  playback.state = playbackState("ready", "replay_open", parsed.summary.start_usec, false);
  return parsed.summary;
}

async function queryActiveLogMessages(args: LogQueryArgs) {
  const log = requireActiveLog();
  return log.handle.queryMessages(args.msgType, args.startUsec, args.endUsec, args.maxPoints);
}

async function queryRawMessages(request: RawMessageQuery) {
  return usingLogEntry(request.entry_id, (log) => log.handle.rawMessagesQuery(request));
}

async function queryChartSeries(request: ChartSeriesRequest) {
  return usingLogEntry(request.entry_id, (log) => log.handle.chartSeriesQuery(request));
}

async function getFlightPath(args: FlightPathArgs) {
  if ("entryId" in args) return usingLogEntry(args.entryId, (log) => log.handle.flightPath(args.startUsec, args.endUsec, args.maxPoints));
  return requireActiveLog().handle.flightPath(null, null, args.maxPoints);
}

async function getTelemetryTrack(args: TelemetryTrackArgs) {
  const log = requireActiveLog();
  return log.handle.telemetryTrack(args.maxPoints);
}

async function getFlightSummary() {
  const log = requireActiveLog();
  return log.handle.flightSummary();
}

async function exportLog(request: LogExportRequest) {
  const { result, fileName } = await usingLogEntry(request.entry_id, (log) => ({ result: log.handle.exportCsvBytes(request), fileName: log.summary.file_name }));
  const bytes = new Uint8Array(result.bytes);
  const suggestedName = request.destination_path.split(/[\\/]/).pop() || `${fileName}.csv`;
  await saveBrowserBytes(bytes, {
    suggested_name: suggestedName,
    mime_type: "text/csv",
    accepts: [{ description: "CSV", mime_types: ["text/csv"], extensions: [".csv"] }],
  });
  const { bytes: _bytes, ...wireResult } = result;
  return wireResult;
}

async function exportCompatCsv(args: LogExportCsvArgs): Promise<number> {
  const log = requireActiveLog();
  const request = {
    entry_id: log.entryId,
    instance_id: "browser-compat-export",
    format: "csv" as const,
    destination_path: args.path,
    start_usec: args.startUsec,
    end_usec: args.endUsec,
    message_types: [],
    text: null,
    field_filters: [],
  };
  const result = await exportLog(request);
  return result.rows_written;
}

async function playPlayback(): Promise<ReplayState> {
  const log = requireActiveLog();
  const startCursor = playback.state.cursor_usec ?? log.summary.start_usec;
  if (startCursor >= log.summary.end_usec) {
    playback.state = playbackState("ended", "replay_play", log.summary.end_usec, true);
    await emitPlaybackFrame();
    return playback.state;
  }
  clearPlaybackTimer();
  playback.state = playbackState("playing", "replay_play", startCursor, true);
  playback.envelope ??= playbackEnvelope();
  playback.startedAtMsec = Date.now();
  playback.startCursorUsec = startCursor;
  await emitPlaybackFrame();
  playback.timer = setInterval(() => void tickPlayback(), PLAYBACK_TICK_MSEC);
  return playback.state;
}

function pausePlayback(): ReplayState {
  requireActiveLog();
  clearPlaybackTimer();
  playback.state = { ...playback.state, status: "paused", operation_id: "replay_pause" };
  emitPlaybackState();
  return playback.state;
}

async function seekPlayback(cursorUsec: number | null) {
  const log = requireActiveLog();
  clearPlaybackTimer();
  const cursor = clampCursor(log, cursorUsec ?? log.summary.start_usec);
  playback.envelope = { ...(playback.envelope ?? playbackEnvelope()), seek_epoch: (playback.envelope?.seek_epoch ?? 0) + 1 };
  playback.state = playbackState("seeking", "replay_seek", cursor, true);
  await emitPlaybackFrame();
  return { envelope: playback.envelope, cursor_usec: cursor };
}

async function setPlaybackSpeed(speed: number): Promise<ReplayState> {
  if (!PLAYBACK_SPEEDS.some((value) => value === speed)) {
    throw new Error(`unsupported playback speed ${speed}; expected one of ${PLAYBACK_SPEEDS.join(", ")}`);
  }
  const wasPlaying = playback.state.status === "playing";
  playback.state = { ...playback.state, speed, operation_id: "replay_set_speed" };
  if (wasPlaying) {
    await playPlayback();
  } else {
    emitPlaybackState();
  }
  return playback.state;
}

function stopPlayback(emit: boolean): ReplayState {
  clearPlaybackTimer();
  playback.state = idlePlaybackState();
  if (emit) {
    emitPlaybackState();
  }
  playback.envelope = null;
  return playback.state;
}

async function tickPlayback(): Promise<void> {
  const log = activeLog;
  if (!log || playback.state.status !== "playing") {
    clearPlaybackTimer();
    return;
  }
  const elapsedUsec = Math.round((Date.now() - playback.startedAtMsec) * 1000 * playback.state.speed);
  const cursor = Math.min(log.summary.end_usec, playback.startCursorUsec + elapsedUsec);
  playback.state = playbackState(cursor >= log.summary.end_usec ? "ended" : "playing", "replay_play", cursor, true);
  await emitPlaybackFrame();
  if (cursor >= log.summary.end_usec) {
    clearPlaybackTimer();
  }
}

async function emitPlaybackFrame(): Promise<void> {
  const log = requireActiveLog();
  const envelope = playback.envelope ?? playbackEnvelope();
  playback.envelope = envelope;
  const frame = log.handle.playbackFrame(playback.state.cursor_usec);
  emitWebEvent(EVENT_NAMES.SESSION_STATE, { envelope, value: { ...frame.session, value: frame.session.value ? { ...frame.session.value, home_position: null } : null } });
  emitWebEvent(EVENT_NAMES.TELEMETRY_STATE, { envelope, value: frame.telemetry });
  emitWebEvent(EVENT_NAMES.SUPPORT_STATE, { envelope, value: frame.support });
  emitWebEvent(EVENT_NAMES.STATUS_TEXT_STATE, { envelope, value: { ...frame.status_text, value: frame.status_text.value ? { entries: frame.status_text.value.entries.map((entry) => ({ ...entry, timestamp_usec: entry.timestamp_usec ?? undefined })) } : null } });
  emitPlaybackState();
}

function emitPlaybackState(): void {
  const envelope = playback.envelope ?? playbackEnvelope();
  playback.envelope = envelope;
  emitWebEvent(EVENT_NAMES.PLAYBACK_STATE, { envelope, value: playback.state });
}

function clearPlaybackTimer(): void {
  if (playback.timer) {
    clearInterval(playback.timer);
    playback.timer = null;
  }
}

async function storedLogForPath(path: string) {
  const storage = getBrowserPersistentStorage();
  const direct = await storage.getLogBytes(path);
  if (direct) {
    return direct;
  }
  const all = await storage.listLogBytes();
  return all.find((stored) => stored.source.pseudo_path === path || stored.source.id === path || stored.source.name === path) ?? null;
}

async function logForEntry(entryId: string): Promise<ActiveLog> {
  if (activeLog?.entryId === entryId) {
    activeLog.leases += 1;
    return activeLog;
  }
  const stored = await getBrowserPersistentStorage().getLogBytes(entryId);
  if (!stored) {
    throw new Error(`log library entry not found: ${entryId}`);
  }
  const format = stored.format ?? detectFormat(stored.source.name);
  if (!format) {
    throw new Error("unsupported log format");
  }
  const parsed = await wasmOpenLog(stored.source.name, format, stored.bytes);
  return { entryId, leases: 1, closed: true, handle: parsed, summary: parsed.summary };
}

async function usingLogEntry<T>(entryId: string, query: (log: ActiveLog) => T): Promise<T> {
  const log = await logForEntry(entryId);
  try {
    return query(log);
  } finally {
    log.leases -= 1;
    if (log.closed && log.leases === 0) log.handle.free();
  }
}

function closeLog(log: ActiveLog | null): void {
  if (!log) return;
  log.closed = true;
  if (log.leases === 0) log.handle.free();
}

function requireActiveLog(): ActiveLog {
  if (!activeLog) {
    throw new Error("no log open");
  }
  return activeLog;
}

function playbackState(status: ReplayState["status"], operationId: ReplayState["operation_id"], cursorUsec: number, barrierReady: boolean): ReplayState {
  const log = requireActiveLog();
  return {
    status,
    entry_id: log.entryId,
    operation_id: operationId,
    cursor_usec: clampCursor(log, cursorUsec),
    start_usec: log.summary.start_usec,
    end_usec: log.summary.end_usec,
    duration_secs: log.summary.duration_secs,
    speed: playback.state.speed,
    available_speeds: [...PLAYBACK_SPEEDS],
    barrier_ready: barrierReady,
    readonly: true,
    diagnostic: null,
  };
}

function idlePlaybackState(): ReplayState {
  return {
    status: "idle",
    entry_id: null,
    operation_id: null,
    cursor_usec: null,
    start_usec: null,
    end_usec: null,
    duration_secs: null,
    speed: DEFAULT_PLAYBACK_SPEED,
    available_speeds: [...PLAYBACK_SPEEDS],
    barrier_ready: false,
    readonly: true,
    diagnostic: null,
  };
}

function playbackEnvelope(): SessionEnvelope {
  return {
    session_id: `web-playback-${Date.now()}`,
    source_kind: "playback",
    seek_epoch: 0,
    reset_revision: 0,
  };
}

function clampCursor(log: ActiveLog, cursorUsec: number): number {
  return Math.max(log.summary.start_usec, Math.min(log.summary.end_usec, cursorUsec));
}

function metadataFromSummary(summary: ActiveLog["summary"]): LogMetadata {
  return {
    display_name: summary.file_name,
    format: summary.log_type,
    start_usec: summary.total_entries > 0 ? summary.start_usec : null,
    end_usec: summary.total_entries > 0 ? summary.end_usec : null,
    duration_secs: summary.total_entries > 0 ? summary.duration_secs : null,
    total_messages: summary.total_entries,
    message_types: summary.message_types,
    vehicle_type: null,
    autopilot: null,
  };
}

function referencedFile(source: BrowserFileMetadata): LogLibraryEntry["source"] {
  const fingerprint = {
    size_bytes: source.size_bytes,
    modified_unix_msec: source.modified_unix_msec,
  };
  return {
    original_path: source.pseudo_path,
    fingerprint,
    status: { kind: "available", current_fingerprint: fingerprint },
  };
}

function unsupportedEntry(entryId: string, source: BrowserFileMetadata): LogLibraryEntry {
  const metadata: LogMetadata = {
    display_name: source.name,
    format: "tlog",
    start_usec: null,
    end_usec: null,
    duration_secs: null,
    total_messages: 0,
    message_types: {},
    vehicle_type: null,
    autopilot: null,
  };
  return {
    entry_id: entryId,
    status: "unsupported",
    imported_at_unix_msec: Date.now(),
    source: referencedFile(source),
    metadata,
    diagnostics: [{
      severity: "error",
      source: "catalog",
      code: "unsupported_log_format",
      message: "only .tlog and .bin logs are supported",
      recoverable: true,
      timestamp_usec: null,
    }],
    index: null,
  };
}

function statusFromIndexResult(totalMessages: number, diagnostics: LogDiagnostic[]): LogLibraryEntryStatus {
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return "corrupt";
  }
  if (diagnostics.length > 0 || totalMessages === 0) {
    return "partial";
  }
  return "ready";
}

function detectFormat(name: string): LogFormat | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".tlog")) return "tlog";
  if (lower.endsWith(".bin")) return "bin";
  return null;
}

function startOperation(operationId: LogProgress["operation_id"]): LogProgress["operation_id"] {
  if (activeOperation) {
    throw new Error("another log operation is already active");
  }
  activeOperation = new AbortController();
  emitProgress("queued", operationId, {});
  return operationId;
}

function clearOperation(): void {
  if (activeOperation && !activeOperation.signal.aborted) {
    activeOperation = null;
  }
}

function emitProgress(
  phase: LogProgress["phase"],
  operationId: LogProgress["operation_id"],
  options: { entryId?: string; completedItems?: number; totalItems?: number; percent?: number; message?: string },
): void {
  emitWebEvent(EVENT_NAMES.LOG_PROGRESS, {
    operation_id: operationId,
    phase,
    completed_items: options.completedItems ?? 0,
    total_items: options.totalItems ?? null,
    percent: options.percent ?? null,
    entry_id: options.entryId ?? null,
    instance_id: null,
    message: options.message ?? null,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function webLogTestFile(name: string, bytes: Uint8Array, lastModified = 1): File {
  const copy = new Uint8Array(bytes);
  return new File([copy.buffer], name, { type: "application/octet-stream", lastModified });
}

export async function registerWebLogTestBytes(name: string, bytes: Uint8Array, lastModified = 1): Promise<LogLibraryEntry> {
  return registerBrowserLogBytes(metadataForBrowserFile(webLogTestFile(name, bytes, lastModified)), bytes);
}
