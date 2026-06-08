import type { InvokeCommandName } from "../generated/commands";
import type { SourceKind } from "../generated/ironwing";
import type { RcOverrideChannel } from "../../calibration";
import type {
  BootloaderInstallationResult,
  BootloaderInstallationSource,
  DfuDeviceInfo,
  DfuScanResult,
  FirmwareBootloaderBoardInfo,
  FirmwareInstallOptions,
  FirmwareInstallPreflightInfo,
  FirmwareInstallReadinessRequest,
  FirmwareInstallReadinessResponse,
  FirmwareInstallResult,
  FirmwareInstallSource,
  FirmwareRebootToBootloaderResult,
  FirmwareSessionStatus,
} from "../../firmware";
import type { GuidedCommandResult, StartGuidedSessionRequest, UpdateGuidedSessionRequest } from "../../guided";
import type {
  ChartSeriesPage,
  ChartSeriesRequest,
  FlightSummary,
  LogDataPoint,
  LogExportRequest,
  LogExportResult,
  LogFormatAdapter,
  LogLibraryCatalog,
  LogLibraryEntry,
  LogSummary,
  RawMessagePage,
  RawMessageQuery,
} from "../../logs";
import type { MissionDownload, MissionIssue } from "../../mission";
import type { FencePlan, RallyPlan, WireMissionPlan } from "../../lib/mavkit-types";
import type { Param, ParamStore, ParamWriteResult } from "../../params";
import type { FlightPathPoint, PlaybackSeekResult, PlaybackStateSnapshot, TelemetrySnapshot } from "../../playback";
import type { RecordingSettings, RecordingSettingsResult, RecordingStartRequest, RecordingStatus } from "../../recording";
import type { SerialPortInfo, SerialPortInventoryResult } from "../../serial-ports";
import type { AckSessionSnapshotResult, OpenSessionSnapshot } from "../../session";
import type { BluetoothDevice, FlightModeEntry, MessageRateInfo } from "../../telemetry";
import type { BluetoothProfile, ConnectRequest, DisconnectRequest, TransportDescriptor } from "../../transport";

export type NoArgs = undefined;

export type CommandSpec<Args, Result> = {
  args: Args;
  result: Result;
};

type ConnectLinkRequest = ConnectRequest & {
  auto_record_on_connect: boolean;
};

type LogFlightPathArgs =
  | { maxPoints: number | null }
  | {
      entryId: string;
      startUsec: number | null;
      endUsec: number | null;
      maxPoints: number | null;
    };

export type InvokeCommandMap = {
  ack_session_snapshot: CommandSpec<
    { sessionId: string; seekEpoch: number; resetRevision: number },
    AckSessionSnapshotResult
  >;
  arm_vehicle: CommandSpec<{ force: boolean }, void>;
  available_transports: CommandSpec<NoArgs, TransportDescriptor[]>;
  bt_get_bonded_devices: CommandSpec<NoArgs, BluetoothDevice[]>;
  bt_request_permissions: CommandSpec<NoArgs, void>;
  bt_scan_ble: CommandSpec<{ timeoutMs?: number; profile?: BluetoothProfile }, BluetoothDevice[]>;
  bt_stop_scan_ble: CommandSpec<NoArgs, void>;
  calibrate_accel: CommandSpec<NoArgs, void>;
  calibrate_compass_accept: CommandSpec<{ compassMask: number }, void>;
  calibrate_compass_cancel: CommandSpec<{ compassMask: number }, void>;
  calibrate_compass_start: CommandSpec<{ compassMask: number }, void>;
  calibrate_gyro: CommandSpec<NoArgs, void>;
  connect_link: CommandSpec<{ request: ConnectLinkRequest }, void>;
  disconnect_link: CommandSpec<{ request?: DisconnectRequest }, void>;
  disarm_vehicle: CommandSpec<{ force: boolean }, void>;
  fence_clear: CommandSpec<NoArgs, void>;
  fence_download: CommandSpec<NoArgs, FencePlan>;
  fence_upload: CommandSpec<{ plan: FencePlan }, void>;
  firmware_bootloader_installation: CommandSpec<
    { request: { device: DfuDeviceInfo; source: BootloaderInstallationSource } },
    BootloaderInstallationResult
  >;
  firmware_detect_bootloader_board: CommandSpec<{ port: string }, FirmwareBootloaderBoardInfo>;
  firmware_install_update: CommandSpec<
    {
      request: {
        port: string;
        baud: number;
        source: FirmwareInstallSource;
        options: FirmwareInstallOptions | null;
      };
    },
    FirmwareInstallResult
  >;
  firmware_install_update_preflight: CommandSpec<NoArgs, FirmwareInstallPreflightInfo>;
  firmware_install_update_readiness: CommandSpec<
    { request: FirmwareInstallReadinessRequest },
    FirmwareInstallReadinessResponse
  >;
  firmware_list_dfu_devices: CommandSpec<NoArgs, DfuScanResult>;
  firmware_reboot_to_bootloader: CommandSpec<{ port: string }, FirmwareRebootToBootloaderResult>;
  firmware_session_cancel: CommandSpec<NoArgs, void>;
  firmware_session_clear_completed: CommandSpec<NoArgs, void>;
  firmware_session_status: CommandSpec<NoArgs, FirmwareSessionStatus>;
  get_available_message_rates: CommandSpec<NoArgs, MessageRateInfo[]>;
  get_available_modes: CommandSpec<NoArgs, FlightModeEntry[]>;
  list_serial_port_inventory: CommandSpec<NoArgs, SerialPortInventoryResult>;
  log_chart_series_query: CommandSpec<{ request: ChartSeriesRequest }, ChartSeriesPage>;
  log_close: CommandSpec<NoArgs, void>;
  log_export: CommandSpec<{ request: LogExportRequest }, LogExportResult>;
  log_export_csv: CommandSpec<
    { path: string; startUsec: number | null; endUsec: number | null },
    number
  >;
  log_format_adapters: CommandSpec<NoArgs, LogFormatAdapter[]>;
  log_get_flight_path: CommandSpec<LogFlightPathArgs, FlightPathPoint[]>;
  log_get_flight_summary: CommandSpec<NoArgs, FlightSummary>;
  log_get_summary: CommandSpec<NoArgs, LogSummary | null>;
  log_get_telemetry_track: CommandSpec<{ maxPoints: number | null }, TelemetrySnapshot[]>;
  log_library_cancel: CommandSpec<NoArgs, boolean>;
  log_library_list: CommandSpec<NoArgs, LogLibraryCatalog>;
  log_library_register: CommandSpec<{ path: string }, LogLibraryEntry>;
  log_library_register_open_file: CommandSpec<NoArgs, LogLibraryEntry | null>;
  log_library_reindex: CommandSpec<{ entryId: string }, LogLibraryEntry>;
  log_library_relink: CommandSpec<{ entryId: string; path: string }, LogLibraryEntry>;
  log_library_remove: CommandSpec<{ entryId: string }, LogLibraryCatalog>;
  log_open: CommandSpec<{ path: string }, LogSummary>;
  log_query: CommandSpec<
    { msgType: string; startUsec: number | null; endUsec: number | null; maxPoints: number | null },
    LogDataPoint[]
  >;
  log_raw_messages_query: CommandSpec<{ request: RawMessageQuery }, RawMessagePage>;
  mission_cancel: CommandSpec<NoArgs, void>;
  mission_clear: CommandSpec<NoArgs, void>;
  mission_download: CommandSpec<NoArgs, MissionDownload>;
  mission_set_current: CommandSpec<{ seq: number }, void>;
  mission_upload: CommandSpec<{ plan: WireMissionPlan }, void>;
  mission_validate: CommandSpec<{ plan: WireMissionPlan }, MissionIssue[]>;
  motor_test: CommandSpec<{ motorInstance: number; throttlePct: number; durationS: number }, void>;
  open_session_snapshot: CommandSpec<{ sourceKind: SourceKind }, OpenSessionSnapshot>;
  param_cancel: CommandSpec<NoArgs, void>;
  param_download_all: CommandSpec<NoArgs, void>;
  param_format_file: CommandSpec<{ store: ParamStore }, string>;
  param_parse_file: CommandSpec<{ contents: string }, Record<string, number>>;
  param_write: CommandSpec<{ name: string; value: number }, Param>;
  param_write_batch: CommandSpec<{ params: [string, number][] }, ParamWriteResult[]>;
  playback_pause: CommandSpec<NoArgs, PlaybackStateSnapshot>;
  playback_play: CommandSpec<NoArgs, PlaybackStateSnapshot>;
  playback_seek: CommandSpec<{ cursorUsec: number | null }, PlaybackSeekResult>;
  playback_set_speed: CommandSpec<{ speed: number }, PlaybackStateSnapshot>;
  playback_stop: CommandSpec<NoArgs, PlaybackStateSnapshot>;
  rally_clear: CommandSpec<NoArgs, void>;
  rally_download: CommandSpec<NoArgs, RallyPlan>;
  rally_upload: CommandSpec<{ plan: RallyPlan }, void>;
  rc_override: CommandSpec<{ channels: RcOverrideChannel[] }, void>;
  reboot_vehicle: CommandSpec<NoArgs, void>;
  recording_settings_read: CommandSpec<NoArgs, RecordingSettingsResult>;
  recording_settings_write: CommandSpec<{ settings: RecordingSettings }, RecordingSettingsResult>;
  recording_start: CommandSpec<{ request: RecordingStartRequest }, string>;
  recording_status: CommandSpec<NoArgs, RecordingStatus>;
  recording_stop: CommandSpec<NoArgs, void>;
  request_prearm_checks: CommandSpec<NoArgs, void>;
  request_web_serial_port: CommandSpec<NoArgs, SerialPortInfo | null>;
  set_flight_mode: CommandSpec<{ customMode: number }, void>;
  set_message_rate: CommandSpec<{ messageId: number; rateHz: number }, void>;
  set_servo: CommandSpec<{ instance: number; pwmUs: number }, void>;
  set_telemetry_rate: CommandSpec<{ rateHz: number }, void>;
  start_guided_session: CommandSpec<{ request: StartGuidedSessionRequest }, GuidedCommandResult>;
  stop_guided_session: CommandSpec<NoArgs, GuidedCommandResult>;
  update_guided_session: CommandSpec<{ request: UpdateGuidedSessionRequest }, GuidedCommandResult>;
  vehicle_takeoff: CommandSpec<{ altitudeM: number }, void>;
};

export type KnownInvokeCommandName = keyof InvokeCommandMap & InvokeCommandName;
export type UnlistedMappedCommand = Exclude<keyof InvokeCommandMap, InvokeCommandName>;
export type UnmappedGeneratedCommand = Exclude<InvokeCommandName, keyof InvokeCommandMap>;
export type InvokeResult<C extends keyof InvokeCommandMap> = InvokeCommandMap[C]["result"];
export type NoArgCommandName = {
  [C in keyof InvokeCommandMap]: InvokeCommandMap[C]["args"] extends NoArgs ? C : never;
}[keyof InvokeCommandMap];
export type ArgCommandName = Exclude<keyof InvokeCommandMap, NoArgCommandName>;
export type InvokeArg<C extends ArgCommandName> = InvokeCommandMap[C]["args"];

const commandMapUsesGeneratedCatalog: UnlistedMappedCommand extends never ? true : never = true;
const commandMapCoversGeneratedCatalog: UnmappedGeneratedCommand extends never ? true : never = true;

export { commandMapCoversGeneratedCatalog, commandMapUsesGeneratedCatalog };
