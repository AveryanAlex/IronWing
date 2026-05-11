import type {
  ChartSeriesPage,
  FlightSummary,
  LogDataPoint,
  LogExportRequest,
  LogExportResult,
  LogFormatAdapter,
  LogLibraryCatalog,
  LogLibraryEntry,
  LogProgress,
  LogSummary,
  RawMessageFieldFilter,
  RawMessagePage,
} from "../../../logs";
import type { FlightPathPoint, PlaybackStateSnapshot, TelemetrySnapshot } from "../../../playback";
import type { RecordingSettings, RecordingStatus } from "../../../recording";
import type { CommandArgs, MockPlatformEvent } from "./types";

export type MockLogSeedPreset =
  | "ready_tlog"
  | "ready_bin"
  | "missing_tlog"
  | "missing_bin"
  | "corrupt_tlog"
  | "corrupt_bin";

type MockLogFixture = {
  summary: LogSummary;
  dataPoints: Record<string, LogDataPoint[]>;
  rawPage: RawMessagePage;
  chartPage: ChartSeriesPage;
  flightPath: FlightPathPoint[];
  telemetryTrack: TelemetrySnapshot[];
  flightSummary: FlightSummary;
};

type MockLogsState = {
  catalog: LogLibraryCatalog;
  activeEntryId: string | null;
  replayState: PlaybackStateSnapshot;
  recordingSettings: RecordingSettings;
  recordingStatus: RecordingStatus;
};

type BrowserOpenFileHandle = {
  getFile(): Promise<File>;
};

type BrowserFilePickerWindow = Window & {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    excludeAcceptAllOption?: boolean;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<BrowserOpenFileHandle[]>;
};

const DEFAULT_LIBRARY_PRESETS: MockLogSeedPreset[] = [
  "ready_tlog",
  "ready_bin",
  "missing_tlog",
  "corrupt_bin",
];

const AVAILABLE_SPEEDS = [0.5, 1, 2, 4, 8, 16];

const LOG_FORMAT_ADAPTERS: LogFormatAdapter[] = [
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

const DEFAULT_RECORDING_SETTINGS: RecordingSettings = {
  auto_record_on_connect: false,
  auto_record_directory: "/mock-app-data/logs/recordings",
  filename_template: "YYYY-MM-DD_HH-MM-SS_{vehicle-or-sysid-or-unknown}.tlog",
  add_completed_recordings_to_library: true,
};

function baseReplayState(): PlaybackStateSnapshot {
  return {
    status: "idle",
    entry_id: null,
    operation_id: null,
    cursor_usec: null,
    start_usec: null,
    end_usec: null,
    duration_secs: null,
    speed: 1,
    available_speeds: AVAILABLE_SPEEDS.slice(),
    barrier_ready: false,
    readonly: true,
    diagnostic: null,
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isRecordingSettings(value: unknown): value is RecordingSettings {
  return Boolean(
    value
      && typeof value === "object"
      && !Array.isArray(value)
      && typeof (value as Partial<RecordingSettings>).auto_record_on_connect === "boolean"
      && typeof (value as Partial<RecordingSettings>).auto_record_directory === "string"
      && typeof (value as Partial<RecordingSettings>).filename_template === "string"
      && typeof (value as Partial<RecordingSettings>).add_completed_recordings_to_library === "boolean",
  );
}

function fileNameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function buildLogEntry(preset: MockLogSeedPreset): LogLibraryEntry {
  switch (preset) {
    case "ready_tlog":
      return {
        entry_id: "log-2026-05-08-001",
        status: "ready",
        imported_at_unix_msec: 1778246400000,
        source: {
          original_path: "/mock/logs/flight-001.tlog",
          fingerprint: { size_bytes: 1048576, modified_unix_msec: 1778246300000 },
          status: {
            kind: "available",
            current_fingerprint: { size_bytes: 1048576, modified_unix_msec: 1778246300000 },
          },
        },
        metadata: {
          display_name: "flight-001.tlog",
          format: "tlog",
          start_usec: 1000000,
          end_usec: 61000000,
          duration_secs: 60,
          total_messages: 2400,
          message_types: {
            ATTITUDE: 600,
            GLOBAL_POSITION_INT: 300,
            HEARTBEAT: 60,
            SYS_STATUS: 120,
            VFR_HUD: 180,
          },
          vehicle_type: "quadrotor",
          autopilot: "ardupilotmega",
        },
        diagnostics: [
          {
            severity: "warning",
            source: "parse",
            code: "partial_message",
            message: "one trailing frame was ignored while indexing",
            recoverable: true,
            timestamp_usec: 61000000,
          },
        ],
        index: {
          index_id: "idx-log-2026-05-08-001",
          relative_path: "logs/indexes/idx-log-2026-05-08-001.json",
          format: "tlog",
          index_version: 1,
          built_at_unix_msec: 1778246410000,
          message_count: 2399,
          covers_start_usec: 1000000,
          covers_end_usec: 61000000,
        },
      };
    case "ready_bin":
      return {
        entry_id: "log-2026-05-08-002",
        status: "ready",
        imported_at_unix_msec: 1778247400000,
        source: {
          original_path: "/mock/logs/flight-002.bin",
          fingerprint: { size_bytes: 2097152, modified_unix_msec: 1778247390000 },
          status: {
            kind: "available",
            current_fingerprint: { size_bytes: 2097152, modified_unix_msec: 1778247390000 },
          },
        },
        metadata: {
          display_name: "flight-002.bin",
          format: "bin",
          start_usec: 5000000,
          end_usec: 125000000,
          duration_secs: 120,
          total_messages: 3600,
          message_types: {
            ATT: 900,
            BAT: 260,
            BARO: 240,
            CTUN: 320,
            GPS: 400,
            MODE: 40,
            NKF1: 300,
          },
          vehicle_type: "quadrotor",
          autopilot: "ardupilotmega",
        },
        diagnostics: [],
        index: {
          index_id: "idx-log-2026-05-08-002",
          relative_path: "logs/indexes/idx-log-2026-05-08-002.json",
          format: "bin",
          index_version: 1,
          built_at_unix_msec: 1778247410000,
          message_count: 3600,
          covers_start_usec: 5000000,
          covers_end_usec: 125000000,
        },
      };
    case "missing_tlog":
      return {
        entry_id: "log-2026-05-08-003",
        status: "missing",
        imported_at_unix_msec: 1778248400000,
        source: {
          original_path: "/mock/missing/missing-flight.tlog",
          fingerprint: { size_bytes: 524288, modified_unix_msec: 1778248300000 },
          status: { kind: "missing" },
        },
        metadata: {
          display_name: "missing-flight.tlog",
          format: "tlog",
          start_usec: 2000000,
          end_usec: 48000000,
          duration_secs: 46,
          total_messages: 900,
          message_types: {
            HEARTBEAT: 46,
            GLOBAL_POSITION_INT: 180,
          },
          vehicle_type: "quadrotor",
          autopilot: "ardupilotmega",
        },
        diagnostics: [
          {
            severity: "warning",
            source: "file_system",
            code: "path_missing",
            message: "referenced log file is missing and must be relinked or removed",
            recoverable: true,
            timestamp_usec: null,
          },
        ],
        index: {
          index_id: "idx-log-2026-05-08-003",
          relative_path: "logs/indexes/idx-log-2026-05-08-003.json",
          format: "tlog",
          index_version: 1,
          built_at_unix_msec: 1778248410000,
          message_count: 900,
          covers_start_usec: 2000000,
          covers_end_usec: 48000000,
        },
      };
    case "missing_bin":
      return {
        entry_id: "log-2026-05-08-004",
        status: "missing",
        imported_at_unix_msec: 1778249400000,
        source: {
          original_path: "/mock/missing/missing-flight.bin",
          fingerprint: { size_bytes: 7340032, modified_unix_msec: 1778249300000 },
          status: { kind: "missing" },
        },
        metadata: {
          display_name: "missing-flight.bin",
          format: "bin",
          start_usec: 3000000,
          end_usec: 90000000,
          duration_secs: 87,
          total_messages: 1800,
          message_types: {
            ATT: 600,
            GPS: 320,
          },
          vehicle_type: "quadrotor",
          autopilot: "ardupilotmega",
        },
        diagnostics: [
          {
            severity: "warning",
            source: "file_system",
            code: "path_missing",
            message: "referenced log file is missing and must be relinked or removed",
            recoverable: true,
            timestamp_usec: null,
          },
        ],
        index: {
          index_id: "idx-log-2026-05-08-004",
          relative_path: "logs/indexes/idx-log-2026-05-08-004.json",
          format: "bin",
          index_version: 1,
          built_at_unix_msec: 1778249410000,
          message_count: 1800,
          covers_start_usec: 3000000,
          covers_end_usec: 90000000,
        },
      };
    case "corrupt_tlog":
      return {
        entry_id: "log-2026-05-08-005",
        status: "corrupt",
        imported_at_unix_msec: 1778250400000,
        source: {
          original_path: "/mock/logs/corrupt-flight.tlog",
          fingerprint: { size_bytes: 65536, modified_unix_msec: 1778250300000 },
          status: {
            kind: "available",
            current_fingerprint: { size_bytes: 65536, modified_unix_msec: 1778250300000 },
          },
        },
        metadata: {
          display_name: "corrupt-flight.tlog",
          format: "tlog",
          start_usec: 1200000,
          end_usec: null,
          duration_secs: null,
          total_messages: 17,
          message_types: {
            HEARTBEAT: 2,
          },
          vehicle_type: null,
          autopilot: null,
        },
        diagnostics: [
          {
            severity: "error",
            source: "parse",
            code: "invalid_crc",
            message: "failed to decode MAVLink frame: CRC mismatch",
            recoverable: false,
            timestamp_usec: 1400000,
          },
        ],
        index: null,
      };
    case "corrupt_bin":
      return {
        entry_id: "log-2026-05-08-006",
        status: "corrupt",
        imported_at_unix_msec: 1778251400000,
        source: {
          original_path: "/mock/logs/corrupt-flight.bin",
          fingerprint: { size_bytes: 98304, modified_unix_msec: 1778251300000 },
          status: {
            kind: "available",
            current_fingerprint: { size_bytes: 98304, modified_unix_msec: 1778251300000 },
          },
        },
        metadata: {
          display_name: "corrupt-flight.bin",
          format: "bin",
          start_usec: 8000000,
          end_usec: null,
          duration_secs: null,
          total_messages: 41,
          message_types: {
            ATT: 12,
          },
          vehicle_type: "quadrotor",
          autopilot: "ardupilotmega",
        },
        diagnostics: [
          {
            severity: "error",
            source: "index",
            code: "unexpected_eof",
            message: "dataflash stream ended while decoding a record",
            recoverable: true,
            timestamp_usec: 12000000,
          },
        ],
        index: null,
      };
  }
}

function buildFixture(entry: LogLibraryEntry): MockLogFixture {
  const isTlog = entry.metadata.format === "tlog";
  const start = entry.metadata.start_usec ?? (isTlog ? 1000000 : 5000000);
  const middle = start + (isTlog ? 41000000 : 60000000);
  const end = entry.metadata.end_usec ?? middle;
  const lat = isTlog ? 47.397742 : 47.39791;
  const lon = isTlog ? 8.545594 : 8.54572;
  const alt = isTlog ? 12.3 : 18.7;
  const msgType = isTlog ? "GLOBAL_POSITION_INT" : "GPS";
  const chartDataPoints: Record<string, LogDataPoint[]> = isTlog
    ? {
        ATTITUDE: [
          { timestamp_usec: start, fields: { roll: 0.1, pitch: -0.05, yaw: 1.2 } },
          { timestamp_usec: middle, fields: { roll: 0.4, pitch: 0.08, yaw: 1.4 } },
          { timestamp_usec: end, fields: { roll: 0.2, pitch: 0.03, yaw: 1.1 } },
        ],
        VFR_HUD: [
          { timestamp_usec: start, fields: { alt: 0 } },
          { timestamp_usec: middle, fields: { alt } },
          { timestamp_usec: end, fields: { alt: alt + 2.5 } },
        ],
        SYS_STATUS: [
          { timestamp_usec: start, fields: { voltage_battery: 16400, current_battery: 0, battery_remaining: 100 } },
          { timestamp_usec: middle, fields: { voltage_battery: 15900, current_battery: 820, battery_remaining: 92 } },
          { timestamp_usec: end, fields: { voltage_battery: 15500, current_battery: 640, battery_remaining: 88 } },
        ],
      }
    : {
        ATT: [
          { timestamp_usec: start, fields: { Roll: 1.2, Pitch: -0.4, Yaw: 92 } },
          { timestamp_usec: middle, fields: { Roll: 4.8, Pitch: 1.5, Yaw: 115 } },
          { timestamp_usec: end, fields: { Roll: 2.1, Pitch: 0.3, Yaw: 125 } },
        ],
        CTUN: [
          { timestamp_usec: start, fields: { Alt: 0 } },
          { timestamp_usec: middle, fields: { Alt: alt } },
          { timestamp_usec: end, fields: { Alt: alt + 2.5 } },
        ],
        BARO: [
          { timestamp_usec: start, fields: { Alt: 0.2 } },
          { timestamp_usec: middle, fields: { Alt: alt - 0.3 } },
          { timestamp_usec: end, fields: { Alt: alt + 2.1 } },
        ],
        BAT: [
          { timestamp_usec: start, fields: { Volt: 16.4, Curr: 0, RemPct: 100 } },
          { timestamp_usec: middle, fields: { Volt: 15.9, Curr: 8.2, RemPct: 92 } },
          { timestamp_usec: end, fields: { Volt: 15.5, Curr: 6.4, RemPct: 88 } },
        ],
      };

  return {
    summary: {
      file_name: entry.metadata.display_name,
      start_usec: entry.metadata.start_usec ?? start,
      end_usec: entry.metadata.end_usec ?? end,
      duration_secs: entry.metadata.duration_secs ?? 0,
      total_entries: entry.metadata.total_messages,
      message_types: clone(entry.metadata.message_types),
      log_type: entry.metadata.format,
    },
    dataPoints: {
      [msgType]: [
        { timestamp_usec: start, fields: { lat: lat * 1e7, lon: lon * 1e7, alt } },
        { timestamp_usec: middle, fields: { lat: (lat + 0.00004) * 1e7, lon: (lon + 0.00005) * 1e7, alt: alt + 3.2 } },
      ],
      ...chartDataPoints,
    },
    rawPage: {
      entry_id: entry.entry_id,
      items: [
        {
          sequence: isTlog ? 7 : 11,
          timestamp_usec: middle,
          message_type: msgType,
          system_id: 1,
          component_id: 1,
          raw_len_bytes: isTlog ? 28 : 64,
          fields: {
            lat: Math.round(lat * 1e7),
            lon: Math.round(lon * 1e7),
            relative_alt: Math.round(alt * 1000),
            valid: true,
            note: null,
          },
          detail: {
            latitude_deg: lat,
            longitude_deg: lon,
            altitude_m: alt,
          },
          hex_payload: null,
          diagnostics: [],
        },
      ],
      next_cursor: isTlog ? "0000000000000008" : "0000000000000012",
      total_available: entry.metadata.total_messages,
    },
    chartPage: {
      entry_id: entry.entry_id,
      start_usec: entry.metadata.start_usec,
      end_usec: entry.metadata.end_usec,
      series: [
        {
          selector: {
            message_type: isTlog ? "VFR_HUD" : "CTUN",
            field: "alt",
            label: isTlog ? "Altitude" : "Relative altitude",
            unit: "m",
          },
          points: [
            { timestamp_usec: start, value: 0 },
            { timestamp_usec: middle, value: alt },
          ],
        },
      ],
      diagnostics: [],
    },
    flightPath: [
      { timestamp_usec: start, lat, lon, alt: 0, heading: 90 },
      { timestamp_usec: middle, lat: lat + 0.00004, lon: lon + 0.00005, alt, heading: 115 },
      { timestamp_usec: end, lat: lat + 0.00007, lon: lon + 0.00009, alt: alt + 2.5, heading: 125 },
    ],
    telemetryTrack: [
      {
        timestamp_usec: start,
        latitude_deg: lat,
        longitude_deg: lon,
        altitude_m: 0,
        heading_deg: 90,
        speed_mps: 0,
        airspeed_mps: 0,
        climb_rate_mps: 0,
        roll_deg: 0,
        pitch_deg: 0,
        yaw_deg: 90,
        battery_pct: 100,
        battery_voltage_v: 16.4,
        battery_current_a: 0,
        energy_consumed_wh: 0,
        gps_fix_type: "3d_fix",
        gps_satellites: 15,
        gps_hdop: 0.8,
        throttle_pct: 0,
        wp_dist_m: 52,
        nav_bearing_deg: 92,
        target_bearing_deg: 94,
        xtrack_error_m: 0,
        armed: false,
        custom_mode: 0,
      },
      {
        timestamp_usec: middle,
        latitude_deg: lat + 0.00004,
        longitude_deg: lon + 0.00005,
        altitude_m: alt,
        heading_deg: 115,
        speed_mps: 8.5,
        airspeed_mps: 8.1,
        climb_rate_mps: 1.7,
        roll_deg: 2.4,
        pitch_deg: -0.6,
        yaw_deg: 115,
        battery_pct: 92,
        battery_voltage_v: 15.9,
        battery_current_a: 8.2,
        energy_consumed_wh: 14.5,
        gps_fix_type: "3d_fix",
        gps_satellites: 16,
        gps_hdop: 0.7,
        throttle_pct: 44,
        wp_dist_m: 18,
        nav_bearing_deg: 117,
        target_bearing_deg: 120,
        xtrack_error_m: 0.6,
        armed: true,
        custom_mode: 4,
      },
      {
        timestamp_usec: end,
        latitude_deg: lat + 0.00007,
        longitude_deg: lon + 0.00009,
        altitude_m: alt + 2.5,
        heading_deg: 125,
        speed_mps: 6.2,
        airspeed_mps: 5.9,
        climb_rate_mps: 0.4,
        roll_deg: 1.1,
        pitch_deg: -0.2,
        yaw_deg: 125,
        battery_pct: 88,
        battery_voltage_v: 15.5,
        battery_current_a: 6.4,
        energy_consumed_wh: 21.2,
        gps_fix_type: "3d_fix",
        gps_satellites: 15,
        gps_hdop: 0.8,
        throttle_pct: 33,
        wp_dist_m: 4,
        nav_bearing_deg: 126,
        target_bearing_deg: 126,
        xtrack_error_m: 0.2,
        armed: true,
        custom_mode: 4,
      },
    ],
    flightSummary: {
      duration_secs: entry.metadata.duration_secs ?? 0,
      max_alt_m: alt + 2.5,
      avg_alt_m: alt / 2,
      max_speed_mps: 8.5,
      avg_speed_mps: 4.9,
      total_distance_m: isTlog ? 124.2 : 301.5,
      max_distance_from_home_m: isTlog ? 52 : 96,
      battery_start_v: 16.4,
      battery_end_v: 15.5,
      battery_min_v: 15.4,
      mah_consumed: isTlog ? 540 : 880,
      gps_sats_min: 15,
      gps_sats_max: 16,
    },
  };
}

function buildCatalog(presets: MockLogSeedPreset[]): LogLibraryCatalog {
  return {
    schema_version: 1,
    storage: {
      kind: "app_data",
      catalog_path: "logs/catalog.json",
      indexes_dir: "logs/indexes",
      recordings_dir: "logs/recordings",
    },
    migrated_from_schema_version: null,
    entries: presets.map((preset) => buildLogEntry(preset)),
  };
}

function seededEntryForPath(path: string): LogLibraryEntry | null {
  switch (path) {
    case "/mock/logs/flight-001.tlog":
      return buildLogEntry("ready_tlog");
    case "/mock/logs/flight-002.bin":
      return buildLogEntry("ready_bin");
    case "/mock/missing/missing-flight.tlog":
      return buildLogEntry("missing_tlog");
    case "/mock/missing/missing-flight.bin":
      return buildLogEntry("missing_bin");
    case "/mock/logs/corrupt-flight.tlog":
      return buildLogEntry("corrupt_tlog");
    case "/mock/logs/corrupt-flight.bin":
      return buildLogEntry("corrupt_bin");
    default:
      return null;
  }
}

function defaultLogsState(): MockLogsState {
  return {
    catalog: buildCatalog(DEFAULT_LIBRARY_PRESETS),
    activeEntryId: null,
    replayState: baseReplayState(),
    recordingSettings: clone(DEFAULT_RECORDING_SETTINGS),
    recordingStatus: { kind: "idle" },
  };
}

const logsState = defaultLogsState();

function mutateLogsState(next: MockLogsState) {
  logsState.catalog = next.catalog;
  logsState.activeEntryId = next.activeEntryId;
  logsState.replayState = next.replayState;
  logsState.recordingSettings = next.recordingSettings;
  logsState.recordingStatus = next.recordingStatus;
}

function fixtureForEntry(entry: LogLibraryEntry): MockLogFixture {
  return buildFixture(entry);
}

function activeEntry(): LogLibraryEntry | null {
  if (!logsState.activeEntryId) {
    return null;
  }

  return logsState.catalog.entries.find((entry) => entry.entry_id === logsState.activeEntryId) ?? null;
}

function assertReadyEntry(entryId: string): LogLibraryEntry {
  const entry = logsState.catalog.entries.find((candidate) => candidate.entry_id === entryId) ?? null;
  if (!entry) {
    throw new Error(`unknown mock log entry: ${entryId}`);
  }
  if (entry.status !== "ready") {
    throw new Error(`mock log entry is not ready: ${entry.entry_id} (${entry.status})`);
  }
  return entry;
}

function selectReadyEntryByFormat(format: "tlog" | "bin"): LogLibraryEntry {
  const entry = logsState.catalog.entries.find((candidate) => candidate.status === "ready" && candidate.metadata.format === format) ?? null;
  if (!entry) {
    throw new Error(`no ready mock ${format} log is seeded`);
  }
  return entry;
}

function resolveEntryFromPath(path: string): LogLibraryEntry | null {
  const exactMatch = logsState.catalog.entries.find((entry) => entry.source.original_path === path) ?? null;
  if (exactMatch) {
    return exactMatch;
  }
  if (path.endsWith(".bin")) {
    return selectReadyEntryByFormat("bin");
  }
  if (path.endsWith(".tlog")) {
    return selectReadyEntryByFormat("tlog");
  }
  return null;
}

function activateEntry(entry: LogLibraryEntry) {
  logsState.activeEntryId = entry.entry_id;
  logsState.replayState = {
    status: "ready",
    entry_id: entry.entry_id,
    operation_id: "replay_open",
    cursor_usec: null,
    start_usec: entry.metadata.start_usec,
    end_usec: entry.metadata.end_usec,
    duration_secs: entry.metadata.duration_secs,
    speed: 1,
    available_speeds: AVAILABLE_SPEEDS.slice(),
    barrier_ready: true,
    readonly: true,
    diagnostic: entry.diagnostics.find((diagnostic) => diagnostic.source === "replay") ?? null,
  };
}

function clampCursorUsec(entry: LogLibraryEntry, cursorUsec: number | null): number | null {
  const start = entry.metadata.start_usec;
  const end = entry.metadata.end_usec;
  if (start === null || end === null) {
    return cursorUsec;
  }

  return Math.min(Math.max(cursorUsec ?? start, start), end);
}

function telemetryStateFromSnapshot(snapshot: TelemetrySnapshot | null) {
  if (!snapshot) {
    return {
      available: true,
      complete: true,
      provenance: "playback",
      value: {
        flight: { altitude_m: null, speed_mps: null, climb_rate_mps: null, throttle_pct: null, airspeed_mps: null },
        navigation: { latitude_deg: null, longitude_deg: null, heading_deg: null, wp_dist_m: null, nav_bearing_deg: null, target_bearing_deg: null, xtrack_error_m: null },
        attitude: { roll_deg: null, pitch_deg: null, yaw_deg: null },
        power: { battery_pct: null, battery_voltage_v: null, battery_current_a: null, battery_voltage_cells: null, energy_consumed_wh: null, battery_time_remaining_s: null },
        gps: { fix_type: null, satellites: null, hdop: null },
        terrain: { terrain_height_m: null, height_above_terrain_m: null },
        radio: { rc_channels: null, rc_rssi: null, servo_outputs: null },
      },
    };
  }

  return {
    available: true,
    complete: true,
    provenance: "playback",
    value: {
      flight: {
        altitude_m: snapshot.altitude_m ?? null,
        speed_mps: snapshot.speed_mps ?? null,
        climb_rate_mps: snapshot.climb_rate_mps ?? null,
        throttle_pct: snapshot.throttle_pct ?? null,
        airspeed_mps: snapshot.airspeed_mps ?? null,
      },
      navigation: {
        latitude_deg: snapshot.latitude_deg ?? null,
        longitude_deg: snapshot.longitude_deg ?? null,
        heading_deg: snapshot.heading_deg ?? null,
        wp_dist_m: snapshot.wp_dist_m ?? null,
        nav_bearing_deg: snapshot.nav_bearing_deg ?? null,
        target_bearing_deg: snapshot.target_bearing_deg ?? null,
        xtrack_error_m: snapshot.xtrack_error_m ?? null,
      },
      attitude: {
        roll_deg: snapshot.roll_deg ?? null,
        pitch_deg: snapshot.pitch_deg ?? null,
        yaw_deg: snapshot.yaw_deg ?? null,
      },
      power: {
        battery_pct: snapshot.battery_pct ?? null,
        battery_voltage_v: snapshot.battery_voltage_v ?? null,
        battery_current_a: snapshot.battery_current_a ?? null,
        battery_voltage_cells: null,
        energy_consumed_wh: snapshot.energy_consumed_wh ?? null,
        battery_time_remaining_s: null,
      },
      gps: {
        fix_type: snapshot.gps_fix_type ?? null,
        satellites: snapshot.gps_satellites ?? null,
        hdop: snapshot.gps_hdop ?? null,
      },
      terrain: {
        terrain_height_m: null,
        height_above_terrain_m: null,
      },
      radio: {
        rc_channels: snapshot.rc_channels ?? null,
        rc_rssi: snapshot.rc_rssi ?? null,
        servo_outputs: snapshot.servo_outputs ?? null,
      },
    },
  };
}

function snapshotForCursor(track: TelemetrySnapshot[], cursorUsec: number | null): TelemetrySnapshot | null {
  if (!track.length || cursorUsec === null) {
    return null;
  }

  let current = track[0];
  for (const snapshot of track) {
    if (snapshot.timestamp_usec > cursorUsec) {
        break;
    }
    current = snapshot;
  }
  return current;
}

export function resetLogsMockState() {
  mutateLogsState(defaultLogsState());
}

export function getLogFormatAdapters(): LogFormatAdapter[] {
  return clone(LOG_FORMAT_ADAPTERS);
}

export function getLogLibraryCatalog(): LogLibraryCatalog {
  return clone(logsState.catalog);
}

function defaultEntryForPath(path: string): LogLibraryEntry {
  const known = seededEntryForPath(path);
  if (known) {
    return clone(known);
  }

  const format = path.endsWith(".bin") ? "bin" : "tlog";
  const importedAt = 1778260000000;
  const sizeBytes = format === "bin" ? 2097152 : 1048576;
  const totalMessages = format === "bin" ? 3600 : 2400;
  const endUsec = format === "bin" ? 125000000 : 61000000;
  const builtAt = importedAt + 1000;

  return {
    entry_id: `mock-${Math.abs(Array.from(path).reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) | 0, 0))}`,
    status: "ready",
    imported_at_unix_msec: importedAt,
    source: {
      original_path: path,
      fingerprint: { size_bytes: sizeBytes, modified_unix_msec: importedAt - 1000 },
      status: {
        kind: "available",
        current_fingerprint: { size_bytes: sizeBytes, modified_unix_msec: importedAt - 1000 },
      },
    },
    metadata: {
      display_name: fileNameFromPath(path),
      format,
      start_usec: format === "bin" ? 5000000 : 1000000,
      end_usec: endUsec,
      duration_secs: format === "bin" ? 120 : 60,
      total_messages: totalMessages,
      message_types: format === "bin"
        ? { ATT: 900, BAT: 260, BARO: 240, CTUN: 320, GPS: 400, MODE: 40, NKF1: 300 }
        : { ATTITUDE: 600, GLOBAL_POSITION_INT: 300, HEARTBEAT: 60, SYS_STATUS: 120, VFR_HUD: 180 },
      vehicle_type: "quadrotor",
      autopilot: "ardupilotmega",
    },
    diagnostics: [],
    index: {
      index_id: `idx-${Math.abs(Array.from(path).reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) | 0, 0))}`,
      relative_path: `logs/indexes/${fileNameFromPath(path)}.json`,
      format,
      index_version: 1,
      built_at_unix_msec: builtAt,
      message_count: totalMessages,
      covers_start_usec: format === "bin" ? 5000000 : 1000000,
      covers_end_usec: endUsec,
    },
  };
}

function libraryProgressEvent(
  operation_id: LogProgress["operation_id"],
  phase: LogProgress["phase"],
  entry_id: string | null,
  completed_items = 0,
  total_items: number | null = null,
  message: string | null = null,
): MockPlatformEvent {
  return emitProgressEvent({
    operation_id,
    phase,
    completed_items,
    total_items,
    percent: total_items && total_items > 0 ? (completed_items / total_items) * 100 : null,
    entry_id,
    instance_id: null,
    message,
  });
}

export function listLogLibrary(): LogLibraryCatalog {
  return getLogLibraryCatalog();
}

export function registerLogLibraryEntry(path: string): { entry: LogLibraryEntry; events: MockPlatformEvent[] } {
  const entry = defaultEntryForPath(path);
  logsState.catalog.entries = [
    ...logsState.catalog.entries.filter((existing) => existing.entry_id !== entry.entry_id),
    entry,
  ];
  return {
    entry: clone(entry),
    events: [
      libraryProgressEvent("log_library_register", "queued", null),
      libraryProgressEvent("log_library_register", "reading_metadata", null),
      libraryProgressEvent("log_library_register", "parsing", entry.entry_id, 0),
      libraryProgressEvent("log_library_register", "parsing", entry.entry_id, entry.metadata.total_messages, entry.metadata.total_messages),
      libraryProgressEvent("log_library_register", "indexing", entry.entry_id, entry.metadata.total_messages, entry.metadata.total_messages),
      libraryProgressEvent("log_library_register", "writing_catalog", entry.entry_id, 1, 1),
      libraryProgressEvent("log_library_register", "completed", entry.entry_id, 1, 1),
    ],
  };
}

export async function registerLogLibraryEntryFromPicker(): Promise<{ entry: LogLibraryEntry; events: MockPlatformEvent[] } | null> {
  const browserWindow = window as BrowserFilePickerWindow;
  if (typeof browserWindow.showOpenFilePicker !== "function") {
    throw new Error("This browser cannot choose log files right now.");
  }

  try {
    const handles = await browserWindow.showOpenFilePicker({
      multiple: false,
      excludeAcceptAllOption: false,
      types: [{
        description: "Telemetry logs",
        accept: {
          "application/octet-stream": [".tlog", ".bin"],
          "text/plain": [".tlog", ".bin"],
        },
      }],
    });
    const selected = await handles[0]?.getFile();
    if (!selected) {
      return null;
    }

    return registerLogLibraryEntry(`/mock/picker/${selected.name}`);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return null;
    }

    throw error;
  }
}

export function removeLogLibraryEntry(entryId: string): LogLibraryCatalog {
  logsState.catalog.entries = logsState.catalog.entries.filter((entry) => entry.entry_id !== entryId);
  if (logsState.activeEntryId === entryId) {
    closeMockLog();
  }
  return getLogLibraryCatalog();
}

export function relinkLogLibraryEntry(entryId: string, path: string): { entry: LogLibraryEntry; events: MockPlatformEvent[] } {
  const existing = logsState.catalog.entries.find((entry) => entry.entry_id === entryId) ?? null;
  if (!existing) {
    throw new Error(`unknown mock log entry: ${entryId}`);
  }

  const relinked: LogLibraryEntry = {
    ...clone(existing),
    status: "stale",
    source: {
      original_path: path,
      fingerprint: { size_bytes: existing.source.fingerprint.size_bytes, modified_unix_msec: existing.imported_at_unix_msec + 1 },
      status: {
        kind: "available",
        current_fingerprint: { size_bytes: existing.source.fingerprint.size_bytes, modified_unix_msec: existing.imported_at_unix_msec + 1 },
      },
    },
    diagnostics: [
      ...existing.diagnostics.filter((diagnostic) => !["referenced_file_missing", "referenced_file_stale", "relink_requires_reindex"].includes(diagnostic.code)),
      {
        severity: "warning",
        source: "catalog",
        code: "relink_requires_reindex",
        message: "relinked log path is available, but metadata and index remain stale until you reindex explicitly",
        recoverable: true,
        timestamp_usec: null,
      },
    ],
  };

  logsState.catalog.entries = logsState.catalog.entries.map((entry) => entry.entry_id === entryId ? relinked : entry);
  return {
    entry: clone(relinked),
    events: [
      libraryProgressEvent("log_library_relink", "queued", entryId),
      libraryProgressEvent("log_library_relink", "reading_metadata", entryId),
      libraryProgressEvent("log_library_relink", "writing_catalog", entryId, 1, 1, "relinked log path; reindex explicitly to refresh metadata"),
      libraryProgressEvent("log_library_relink", "completed", entryId, 1, 1),
    ],
  };
}

export function reindexLogLibraryEntry(entryId: string): { entry: LogLibraryEntry; events: MockPlatformEvent[] } {
  const existing = logsState.catalog.entries.find((entry) => entry.entry_id === entryId) ?? null;
  if (!existing) {
    throw new Error(`unknown mock log entry: ${entryId}`);
  }

  if (existing.source.original_path.includes("/mock/missing/")) {
    const missing: LogLibraryEntry = {
      ...clone(existing),
      status: "missing",
      source: {
        ...clone(existing.source),
        status: { kind: "missing" },
      },
      diagnostics: [
        ...existing.diagnostics.filter((diagnostic) => diagnostic.code !== "referenced_file_missing"),
        {
          severity: "warning",
          source: "file_system",
          code: "referenced_file_missing",
          message: "referenced log file is missing; relink or remove the catalog entry explicitly",
          recoverable: true,
          timestamp_usec: null,
        },
      ],
    };
    logsState.catalog.entries = logsState.catalog.entries.map((entry) => entry.entry_id === entryId ? missing : entry);
    return {
      entry: clone(missing),
      events: [
        libraryProgressEvent("log_library_reindex", "queued", entryId),
        libraryProgressEvent("log_library_reindex", "reading_metadata", entryId),
        libraryProgressEvent("log_library_reindex", "writing_catalog", entryId, 1, 1, "referenced log file is missing"),
        libraryProgressEvent("log_library_reindex", "completed", entryId, 1, 1),
      ],
    };
  }

  const template = defaultEntryForPath(existing.source.original_path);
  const reindexed: LogLibraryEntry = {
    ...template,
    entry_id: existing.entry_id,
    imported_at_unix_msec: existing.imported_at_unix_msec,
    source: clone(template.source),
  };
  logsState.catalog.entries = logsState.catalog.entries.map((entry) => entry.entry_id === entryId ? reindexed : entry);
  return {
    entry: clone(reindexed),
    events: [
      libraryProgressEvent("log_library_reindex", "queued", entryId),
      libraryProgressEvent("log_library_reindex", "reading_metadata", entryId),
      libraryProgressEvent("log_library_reindex", "parsing", entryId, 0),
      libraryProgressEvent("log_library_reindex", "parsing", entryId, reindexed.metadata.total_messages, reindexed.metadata.total_messages),
      libraryProgressEvent("log_library_reindex", "indexing", entryId, reindexed.metadata.total_messages, reindexed.metadata.total_messages),
      libraryProgressEvent("log_library_reindex", "writing_catalog", entryId, 1, 1),
      libraryProgressEvent("log_library_reindex", "completed", entryId, 1, 1),
    ],
  };
}

export function cancelLogLibraryOperation(): boolean {
  return false;
}

export function setLogLibraryCatalog(catalog: LogLibraryCatalog): LogLibraryCatalog {
  logsState.catalog = clone(catalog);
  const active = activeEntry();
  if (!active) {
    logsState.activeEntryId = null;
    logsState.replayState = baseReplayState();
  }
  return getLogLibraryCatalog();
}

export function seedLogLibrary(presets: MockLogSeedPreset[] = DEFAULT_LIBRARY_PRESETS): LogLibraryCatalog {
  return setLogLibraryCatalog(buildCatalog(presets));
}

export function getSeededLogEntry(preset: MockLogSeedPreset): LogLibraryEntry {
  return clone(buildLogEntry(preset));
}

export function getSeededLogPickerFile(preset: Extract<MockLogSeedPreset, "ready_tlog" | "ready_bin" | "corrupt_tlog" | "corrupt_bin">): {
  name: string;
  type: string;
  bytes: number[];
} {
  const entry = buildLogEntry(preset);
  const base = fileNameFromPath(entry.source.original_path);
  const bytes = preset.endsWith("tlog")
    ? [0xfe, 0x09, 0x00, 0x01, 0x01, 0x00, 0x4d, 0x41, 0x56, 0x31]
    : [0xa3, 0x95, 0x80, 0x80, 0x02, 0x01, 0x42, 0x49, 0x4e, 0x31];
  return {
    name: base,
    type: "application/octet-stream",
    bytes: bytes.concat(preset.startsWith("corrupt") ? [0xff, 0x00, 0xff] : [0x10, 0x20, 0x30]),
  };
}

export function openMockLog(args: CommandArgs): LogSummary {
  const path = typeof args?.path === "string" ? args.path : null;
  if (!path) {
    throw new Error("missing or invalid log_open.path");
  }

  const entry = resolveEntryFromPath(path);
  if (!entry) {
    throw new Error(`no seeded mock log matches path: ${path}`);
  }
  if (entry.status === "missing") {
    throw new Error(`mock log is missing: ${path}`);
  }
  if (entry.status === "corrupt") {
    throw new Error(`mock log is corrupt: ${path}`);
  }
  if (entry.status !== "ready") {
    throw new Error(`mock log is not ready: ${path}`);
  }

  activateEntry(entry);
  return clone(fixtureForEntry(entry).summary);
}

export function openMockLogWithProgress(args: CommandArgs): { summary: LogSummary; events: MockPlatformEvent[] } {
  const path = typeof args?.path === "string" ? args.path : null;
  const summary = openMockLog(args);
  const entry = path ? resolveEntryFromPath(path) : null;
  return {
    summary,
    events: [
      emitProgressEvent({
        operation_id: "log_open",
        phase: "queued",
        completed_items: 0,
        total_items: null,
        percent: null,
        entry_id: entry?.entry_id ?? null,
        instance_id: null,
        message: null,
      }),
      emitProgressEvent({
        operation_id: "log_open",
        phase: "parsing",
        completed_items: 0,
        total_items: null,
        percent: null,
        entry_id: entry?.entry_id ?? null,
        instance_id: null,
        message: null,
      }),
      emitProgressEvent({
        operation_id: "log_open",
        phase: "parsing",
        completed_items: summary.total_entries,
        total_items: null,
        percent: null,
        entry_id: entry?.entry_id ?? null,
        instance_id: null,
        message: null,
      }),
      emitProgressEvent({
        operation_id: "log_open",
        phase: "indexing",
        completed_items: summary.total_entries,
        total_items: null,
        percent: null,
        entry_id: entry?.entry_id ?? null,
        instance_id: null,
        message: null,
      }),
      emitProgressEvent({
        operation_id: "log_open",
        phase: "completed",
        completed_items: summary.total_entries,
        total_items: null,
        percent: null,
        entry_id: entry?.entry_id ?? null,
        instance_id: null,
        message: null,
      }),
    ],
  };
}

export function closeMockLog() {
  logsState.activeEntryId = null;
  logsState.replayState = baseReplayState();
  return getReplayState();
}

export function getActiveLogSummary(): LogSummary | null {
  const entry = activeEntry();
  return entry ? clone(fixtureForEntry(entry).summary) : null;
}

export function getReplayState(): PlaybackStateSnapshot {
  return clone(logsState.replayState);
}

export function setReplayState(replayState: PlaybackStateSnapshot): PlaybackStateSnapshot {
  logsState.replayState = clone(replayState);
  if (replayState.entry_id) {
    logsState.activeEntryId = replayState.entry_id;
  }
  return getReplayState();
}

export function updateReplayStateForSeek(cursorUsec: number | null): PlaybackStateSnapshot {
  const entry = activeEntry();
  if (!entry) {
    throw new Error("no active mock log entry for replay");
  }
  const resolvedCursorUsec = clampCursorUsec(entry, cursorUsec);

  logsState.replayState = {
    ...logsState.replayState,
    status: "seeking",
    entry_id: entry.entry_id,
    operation_id: "replay_seek",
    cursor_usec: resolvedCursorUsec,
    start_usec: entry.metadata.start_usec,
    end_usec: entry.metadata.end_usec,
    duration_secs: entry.metadata.duration_secs,
    speed: logsState.replayState.speed,
    available_speeds: AVAILABLE_SPEEDS.slice(),
    barrier_ready: true,
    readonly: true,
  };
  return getReplayState();
}

function requirePlaybackSpeed(speed: number) {
  if (!AVAILABLE_SPEEDS.includes(speed)) {
    throw new Error(`unsupported playback speed ${speed}; expected one of ${AVAILABLE_SPEEDS.join(", ")}`);
  }
}

export function updateReplayStateForPlay(): PlaybackStateSnapshot {
  const entry = activeEntry();
  if (!entry) {
    throw new Error("no active mock log entry for replay");
  }

  const cursor_usec = clampCursorUsec(entry, logsState.replayState.cursor_usec);
  logsState.replayState = {
    ...logsState.replayState,
    status: cursor_usec !== null && cursor_usec >= (entry.metadata.end_usec ?? cursor_usec) ? "ended" : "playing",
    entry_id: entry.entry_id,
    operation_id: "replay_play",
    cursor_usec,
    start_usec: entry.metadata.start_usec,
    end_usec: entry.metadata.end_usec,
    duration_secs: entry.metadata.duration_secs,
    available_speeds: AVAILABLE_SPEEDS.slice(),
    barrier_ready: true,
    readonly: true,
  };
  return getReplayState();
}

export function updateReplayStateForPause(): PlaybackStateSnapshot {
  const entry = activeEntry();
  if (!entry) {
    throw new Error("no active mock log entry for replay");
  }

  logsState.replayState = {
    ...logsState.replayState,
    status: "paused",
    entry_id: entry.entry_id,
    operation_id: "replay_pause",
    cursor_usec: clampCursorUsec(entry, logsState.replayState.cursor_usec),
    start_usec: entry.metadata.start_usec,
    end_usec: entry.metadata.end_usec,
    duration_secs: entry.metadata.duration_secs,
    available_speeds: AVAILABLE_SPEEDS.slice(),
    barrier_ready: true,
    readonly: true,
  };
  return getReplayState();
}

export function updateReplayStateForSpeed(speed: number): PlaybackStateSnapshot {
  requirePlaybackSpeed(speed);
  const entry = activeEntry();
  if (!entry) {
    throw new Error("no active mock log entry for replay");
  }

  logsState.replayState = {
    ...logsState.replayState,
    entry_id: entry.entry_id,
    operation_id: "replay_set_speed",
    cursor_usec: clampCursorUsec(entry, logsState.replayState.cursor_usec),
    start_usec: entry.metadata.start_usec,
    end_usec: entry.metadata.end_usec,
    duration_secs: entry.metadata.duration_secs,
    speed,
    available_speeds: AVAILABLE_SPEEDS.slice(),
    barrier_ready: true,
    readonly: true,
  };
  return getReplayState();
}

export function getResolvedReplayCursorUsec(): number | null {
  return logsState.replayState.cursor_usec;
}

export function playbackTelemetryDomain() {
  const entry = activeEntry();
  if (!entry || entry.status !== "ready") {
    return telemetryStateFromSnapshot(null);
  }

  const snapshot = snapshotForCursor(fixtureForEntry(entry).telemetryTrack, logsState.replayState.cursor_usec);
  return telemetryStateFromSnapshot(snapshot);
}

export function playbackStateEvent(envelope: { session_id: string; source_kind: "live" | "playback"; seek_epoch: number; reset_revision: number; }) {
  return {
    event: "playback://state",
    payload: {
      envelope,
      value: getReplayState(),
    },
  } satisfies MockPlatformEvent;
}

export function emitProgressEvent(progress: LogProgress): MockPlatformEvent {
  return { event: "log://progress", payload: clone(progress) };
}

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function fieldFilterMatches(
  fields: Record<string, unknown>,
  filter: RawMessageFieldFilter,
): boolean {
  if (!(filter.field in fields)) {
    return false;
  }
  const needle = normalizeText(filter.value_text);
  if (!needle) {
    return true;
  }
  return JSON.stringify(fields[filter.field] ?? null).toLowerCase().includes(needle);
}

function rawMessageMatches(
  item: RawMessagePage["items"][number],
  request: {
    start_usec?: number | null;
    end_usec?: number | null;
    message_types?: string[];
    text?: string | null;
    field_filters?: RawMessageFieldFilter[];
  },
): boolean {
  if (typeof request.start_usec === "number" && item.timestamp_usec < request.start_usec) {
    return false;
  }
  if (typeof request.end_usec === "number" && item.timestamp_usec > request.end_usec) {
    return false;
  }
  if (Array.isArray(request.message_types) && request.message_types.length > 0 && !request.message_types.includes(item.message_type)) {
    return false;
  }
  const text = normalizeText(request.text);
  if (text) {
    const haystack = JSON.stringify({ message_type: item.message_type, fields: item.fields, detail: item.detail }).toLowerCase();
    if (!haystack.includes(text)) {
      return false;
    }
  }
  return (request.field_filters ?? []).every((filter) => fieldFilterMatches(item.fields, filter));
}

function sliceRawMessagePage(
  page: RawMessagePage,
  request: {
    cursor?: string | null;
    limit?: number;
    include_detail?: boolean;
    include_hex?: boolean;
    start_usec?: number | null;
    end_usec?: number | null;
    message_types?: string[];
    text?: string | null;
    field_filters?: RawMessageFieldFilter[];
  },
): RawMessagePage {
  const filtered = page.items.filter((item) => rawMessageMatches(item, request));
  const startIndex = request.cursor ? Number.parseInt(request.cursor, 16) || 0 : 0;
  const limit = typeof request.limit === "number" && request.limit > 0 ? Math.min(request.limit, 500) : 100;
  const items = filtered.slice(startIndex, startIndex + limit).map((item) => ({
    ...clone(item),
    detail: request.include_detail ? clone(item.detail) : null,
    hex_payload: request.include_hex ? item.hex_payload : null,
  }));
  const nextIndex = startIndex + items.length;
  return {
    entry_id: page.entry_id,
    items,
    next_cursor: nextIndex < filtered.length ? nextIndex.toString(16).padStart(16, "0") : null,
    total_available: filtered.length,
  };
}

function downsamplePoints<T>(points: T[], maxPoints: number): T[] {
  if (maxPoints <= 0 || points.length <= maxPoints) {
    return points;
  }
  const step = points.length / maxPoints;
  const sampled: T[] = [];
  for (let cursor = 0; sampled.length < maxPoints && Math.floor(cursor) < points.length; cursor += step) {
    sampled.push(points[Math.floor(cursor)] as T);
  }
  return sampled;
}

function hasFilteredExportRequest(request: Partial<LogExportRequest>): boolean {
  return typeof request.start_usec === "number"
    || typeof request.end_usec === "number"
    || Boolean(request.text)
    || Boolean(request.field_filters?.length)
    || Boolean(request.message_types?.length);
}

export function queryLogMessages(args: CommandArgs): LogDataPoint[] {
  const msgType = typeof args?.msgType === "string" ? args.msgType : null;
  if (!msgType) {
    throw new Error("missing or invalid log_query.msgType");
  }
  const entry = activeEntry();
  if (!entry || entry.status !== "ready") {
    return [];
  }
  return clone(fixtureForEntry(entry).dataPoints[msgType] ?? []);
}

export function queryRawMessages(args: CommandArgs): RawMessagePage {
  const request = args?.request;
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new Error("missing or invalid log_raw_messages_query.request");
  }
  const entryId = typeof (request as { entry_id?: unknown }).entry_id === "string"
    ? (request as { entry_id: string }).entry_id
    : null;
  if (!entryId) {
    throw new Error("missing or invalid log_raw_messages_query.request.entry_id");
  }
  const entry = assertReadyEntry(entryId);
  const typedRequest = request as Partial<{
    cursor: string | null;
    limit: number;
    include_detail: boolean;
    include_hex: boolean;
    start_usec: number | null;
    end_usec: number | null;
    message_types: string[];
    text: string | null;
    field_filters: RawMessageFieldFilter[];
  }>;
  return sliceRawMessagePage(clone(fixtureForEntry(entry).rawPage), typedRequest);
}

export function queryChartSeries(args: CommandArgs): ChartSeriesPage {
  const request = args?.request;
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new Error("missing or invalid log_chart_series_query.request");
  }
  const entryId = typeof (request as { entry_id?: unknown }).entry_id === "string"
    ? (request as { entry_id: string }).entry_id
    : null;
  if (!entryId) {
    throw new Error("missing or invalid log_chart_series_query.request.entry_id");
  }
  const entry = assertReadyEntry(entryId);
  const typedRequest = request as Partial<{
    selectors: Array<{ message_type: string; field: string; label: string; unit: string | null }>;
    start_usec: number | null;
    end_usec: number | null;
    max_points: number | null;
  }>;
  const page = clone(fixtureForEntry(entry).chartPage);
  const selectorRequests = Array.isArray(typedRequest.selectors) ? typedRequest.selectors : [];
  const dataPointsByType = fixtureForEntry(entry).dataPoints;
  const maxPoints = typeof typedRequest.max_points === "number" && typedRequest.max_points > 0
    ? Math.min(typedRequest.max_points, 5000)
    : 1000;
  return {
    ...page,
    start_usec: typedRequest.start_usec ?? page.start_usec,
    end_usec: typedRequest.end_usec ?? page.end_usec,
    series: selectorRequests.map((selector) => ({
      selector: clone(selector),
      points: downsamplePoints(
        (dataPointsByType[selector.message_type] ?? []).flatMap((point) => {
          const value = point.fields[selector.field];
          if (typeof value !== "number") {
            return [];
          }
          if (typeof typedRequest.start_usec === "number" && point.timestamp_usec < typedRequest.start_usec) {
            return [];
          }
          if (typeof typedRequest.end_usec === "number" && point.timestamp_usec > typedRequest.end_usec) {
            return [];
          }
          return [{ timestamp_usec: point.timestamp_usec, value }];
        }),
        maxPoints,
      ),
    })),
  };
}

export function getFlightPath(args: CommandArgs): FlightPathPoint[] {
  const maxPoints = typeof args?.maxPoints === "number" && args.maxPoints > 0 ? Math.min(args.maxPoints, 5000) : 1000;
  const entryId = typeof args?.entryId === "string" ? args.entryId : null;
  const startUsec = typeof args?.startUsec === "number" ? args.startUsec : null;
  const endUsec = typeof args?.endUsec === "number" ? args.endUsec : null;
  const entry = entryId ? assertReadyEntry(entryId) : activeEntry() ?? selectReadyEntryByFormat("tlog");
  const points = fixtureForEntry(entry).flightPath;
  return clone(downsamplePoints(points.filter((point) => {
    if (typeof startUsec === "number" && point.timestamp_usec < startUsec) {
      return false;
    }
    if (typeof endUsec === "number" && point.timestamp_usec > endUsec) {
      return false;
    }
    return true;
  }), maxPoints));
}

export function getTelemetryTrack(args: CommandArgs): TelemetrySnapshot[] {
  const maxPoints = typeof args?.maxPoints === "number" ? args.maxPoints : null;
  const entry = activeEntry() ?? selectReadyEntryByFormat("tlog");
  const track = fixtureForEntry(entry).telemetryTrack;
  return clone(maxPoints === null ? track : track.slice(0, Math.max(0, maxPoints)));
}

export function getFlightSummary(): FlightSummary {
  const entry = activeEntry() ?? selectReadyEntryByFormat("tlog");
  return clone(fixtureForEntry(entry).flightSummary);
}

export function exportLog(args: CommandArgs): { result: LogExportResult; events: MockPlatformEvent[] } {
  const request = args?.request;
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new Error("missing or invalid log_export.request");
  }
  const typedRequest = request as Partial<LogExportRequest>;
  if (typeof typedRequest.entry_id !== "string") {
    throw new Error("missing or invalid log_export.request.entry_id");
  }
  if (typeof typedRequest.instance_id !== "string") {
    throw new Error("missing or invalid log_export.request.instance_id");
  }
  if (typeof typedRequest.destination_path !== "string") {
    throw new Error("missing or invalid log_export.request.destination_path");
  }
  if (typedRequest.format !== "csv") {
    throw new Error(`log export format ${String(typedRequest.format)} is not implemented yet`);
  }
  const entry = assertReadyEntry(typedRequest.entry_id);
  const filtered = hasFilteredExportRequest(typedRequest)
    ? sliceRawMessagePage(clone(fixtureForEntry(entry).rawPage), {
        start_usec: typedRequest.start_usec ?? null,
        end_usec: typedRequest.end_usec ?? null,
        message_types: typedRequest.message_types ?? [],
        text: typedRequest.text ?? null,
        field_filters: typedRequest.field_filters ?? [],
        limit: Number.MAX_SAFE_INTEGER,
        include_detail: false,
        include_hex: false,
      })
    : null;
  const result: LogExportResult = {
    operation_id: "log_export",
    destination_path: typedRequest.destination_path,
    bytes_written: filtered
      ? Math.max(1, filtered.items.length) * (entry.metadata.format === "tlog" ? 128 : 160)
      : entry.metadata.format === "tlog" ? 4096 : 6144,
    rows_written: filtered
      ? filtered.items.length
      : entry.metadata.format === "tlog" ? 42 : 64,
    diagnostics: [],
  };
  return {
    result,
    events: [
      emitProgressEvent({
        operation_id: "log_export",
        phase: "exporting",
        completed_items: 1,
        total_items: 2,
        percent: 50,
        entry_id: entry.entry_id,
        instance_id: typedRequest.instance_id,
        message: `exporting ${entry.metadata.display_name}`,
      }),
      emitProgressEvent({
        operation_id: "log_export",
        phase: "completed",
        completed_items: 2,
        total_items: 2,
        percent: 100,
        entry_id: entry.entry_id,
        instance_id: typedRequest.instance_id,
        message: `exported ${fileNameFromPath(typedRequest.destination_path)}`,
      }),
    ],
  };
}

export function exportLogCsv(args: CommandArgs): { rowsWritten: number; events: MockPlatformEvent[] } {
  const path = typeof args?.path === "string" ? args.path : null;
  if (!path) {
    throw new Error("missing or invalid log_export_csv.path");
  }
  const entry = activeEntry() ?? selectReadyEntryByFormat("tlog");
  const hasRange = typeof args?.startUsec === "number" || typeof args?.endUsec === "number";
  const filtered = hasRange
    ? sliceRawMessagePage(clone(fixtureForEntry(entry).rawPage), {
        start_usec: typeof args?.startUsec === "number" ? args.startUsec : null,
        end_usec: typeof args?.endUsec === "number" ? args.endUsec : null,
        limit: Number.MAX_SAFE_INTEGER,
        include_detail: false,
        include_hex: false,
      })
    : null;
  return {
    rowsWritten: filtered ? filtered.items.length : entry.metadata.total_messages,
    events: [
      emitProgressEvent({
        operation_id: "log_export",
        phase: "completed",
        completed_items: filtered ? filtered.items.length : entry.metadata.total_messages,
        total_items: filtered ? filtered.items.length : entry.metadata.total_messages,
        percent: 100,
        entry_id: entry.entry_id,
        instance_id: null,
        message: `exported ${fileNameFromPath(path)}`,
      }),
    ],
  };
}

export function getRecordingSettings(): {
  operation_id: "recording_settings_read";
  settings: RecordingSettings;
} {
  return {
    operation_id: "recording_settings_read",
    settings: clone(logsState.recordingSettings),
  };
}

export function setRecordingSettings(settings: RecordingSettings): {
  operation_id: "recording_settings_write";
  settings: RecordingSettings;
} {
  if (!isRecordingSettings(settings)) {
    throw new Error("missing or invalid recording_settings_write.settings");
  }
  logsState.recordingSettings = {
    ...clone(DEFAULT_RECORDING_SETTINGS),
    auto_record_on_connect: settings.auto_record_on_connect,
  };
  return {
    operation_id: "recording_settings_write",
    settings: clone(logsState.recordingSettings),
  };
}

export function getRecordingStatus(): RecordingStatus {
  return clone(logsState.recordingStatus);
}

export function setRecordingStatus(status: RecordingStatus): RecordingStatus {
  logsState.recordingStatus = clone(status);
  return getRecordingStatus();
}

export function startRecording(args: CommandArgs): string {
  const request = args?.request;
  const path = typeof args?.path === "string"
    ? args.path
    : request && typeof request === "object" && !Array.isArray(request) && typeof (request as { destination_path?: unknown }).destination_path === "string"
      ? (request as { destination_path: string }).destination_path
      : null;
  const requestedMode = request
    && typeof request === "object"
    && !Array.isArray(request)
    && (request as { mode?: unknown }).mode === "auto_on_connect"
    ? "auto_on_connect"
    : "manual";
  if (!path) {
    throw new Error("missing or invalid recording_start.path");
  }
  logsState.recordingStatus = {
    kind: "recording",
    operation_id: "recording_start",
    mode: requestedMode,
    file_name: fileNameFromPath(path),
    destination_path: path,
    bytes_written: 2048,
    started_at_unix_msec: 1778246400000,
  };
  return path;
}

export function stopRecording(): { addedEntry: LogLibraryEntry | null } {
  if (logsState.recordingStatus.kind !== "recording") {
    return { addedEntry: null };
  }

  const completed = clone(logsState.recordingStatus);
  let addedEntry: LogLibraryEntry | null = null;
  if (logsState.recordingSettings.add_completed_recordings_to_library) {
    addedEntry = {
      entry_id: `recording-${logsState.catalog.entries.length + 1}`,
      status: "ready",
      imported_at_unix_msec: completed.started_at_unix_msec,
      source: {
        original_path: completed.destination_path,
        fingerprint: {
          size_bytes: completed.bytes_written,
          modified_unix_msec: completed.started_at_unix_msec,
        },
        status: {
          kind: "available",
          current_fingerprint: {
            size_bytes: completed.bytes_written,
            modified_unix_msec: completed.started_at_unix_msec,
          },
        },
      },
      metadata: {
        display_name: completed.file_name,
        format: "tlog",
        start_usec: null,
        end_usec: null,
        duration_secs: null,
        total_messages: 0,
        message_types: {},
        vehicle_type: null,
        autopilot: null,
      },
      diagnostics: [
        {
          severity: "info",
          source: "recording",
          code: "recording_completed",
          message: "completed recording added to mock library",
          recoverable: true,
          timestamp_usec: null,
        },
      ],
      index: null,
    };
    logsState.catalog.entries = [...logsState.catalog.entries, addedEntry];
  }

  logsState.recordingStatus = { kind: "idle" };
  return { addedEntry };
}
