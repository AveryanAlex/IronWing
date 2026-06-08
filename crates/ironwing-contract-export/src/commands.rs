use std::error::Error;

#[derive(Clone, Copy)]
pub enum PlatformSupport {
    Native,
    Web,
    Remote,
    Mock,
}

impl PlatformSupport {
    const fn as_str(self) -> &'static str {
        match self {
            PlatformSupport::Native => "native",
            PlatformSupport::Web => "web",
            PlatformSupport::Remote => "remote",
            PlatformSupport::Mock => "mock",
        }
    }
}

pub struct CommandSpec {
    pub name: &'static str,
    pub args_ts: &'static str,
    pub result_ts: &'static str,
    pub platforms: &'static [PlatformSupport],
}

const fn command(
    name: &'static str,
    args_ts: &'static str,
    result_ts: &'static str,
    platforms: &'static [PlatformSupport],
) -> CommandSpec {
    CommandSpec {
        name,
        args_ts,
        result_ts,
        platforms,
    }
}

pub const ALL_PLATFORMS: &[PlatformSupport] = &[
    PlatformSupport::Native,
    PlatformSupport::Web,
    PlatformSupport::Remote,
    PlatformSupport::Mock,
];
pub const NATIVE_REMOTE_MOCK: &[PlatformSupport] = &[
    PlatformSupport::Native,
    PlatformSupport::Remote,
    PlatformSupport::Mock,
];
pub const WEB_MOCK: &[PlatformSupport] = &[PlatformSupport::Web, PlatformSupport::Mock];

pub const COMMAND_NAMES: &[&str] = &[
    "ack_session_snapshot",
    "arm_vehicle",
    "available_transports",
    "bt_get_bonded_devices",
    "bt_request_permissions",
    "bt_scan_ble",
    "bt_stop_scan_ble",
    "calibrate_accel",
    "calibrate_compass_accept",
    "calibrate_compass_cancel",
    "calibrate_compass_start",
    "calibrate_gyro",
    "connect_link",
    "disconnect_link",
    "disarm_vehicle",
    "fence_clear",
    "fence_download",
    "fence_upload",
    "firmware_bootloader_installation",
    "firmware_detect_bootloader_board",
    "firmware_install_update",
    "firmware_install_update_preflight",
    "firmware_install_update_readiness",
    "firmware_list_dfu_devices",
    "firmware_reboot_to_bootloader",
    "firmware_session_cancel",
    "firmware_session_clear_completed",
    "firmware_session_status",
    "get_available_message_rates",
    "get_available_modes",
    "list_serial_port_inventory",
    "log_chart_series_query",
    "log_close",
    "log_export",
    "log_export_csv",
    "log_format_adapters",
    "log_get_flight_path",
    "log_get_flight_summary",
    "log_get_summary",
    "log_get_telemetry_track",
    "log_library_cancel",
    "log_library_list",
    "log_library_register",
    "log_library_register_open_file",
    "log_library_reindex",
    "log_library_relink",
    "log_library_remove",
    "log_open",
    "log_query",
    "log_raw_messages_query",
    "mission_cancel",
    "mission_clear",
    "mission_download",
    "mission_set_current",
    "mission_upload",
    "mission_validate",
    "motor_test",
    "open_session_snapshot",
    "param_cancel",
    "param_download_all",
    "param_format_file",
    "param_parse_file",
    "param_write",
    "param_write_batch",
    "playback_pause",
    "playback_play",
    "playback_seek",
    "playback_set_speed",
    "playback_stop",
    "rally_clear",
    "rally_download",
    "rally_upload",
    "rc_override",
    "reboot_vehicle",
    "recording_settings_read",
    "recording_settings_write",
    "recording_start",
    "recording_status",
    "recording_stop",
    "request_prearm_checks",
    "request_web_serial_port",
    "set_flight_mode",
    "set_message_rate",
    "set_servo",
    "set_telemetry_rate",
    "start_guided_session",
    "stop_guided_session",
    "update_guided_session",
    "vehicle_takeoff",
];

pub const COMMAND_SPECS: &[CommandSpec] = &[
    command(
        "ack_session_snapshot",
        "{ sessionId: string; seekEpoch: number; resetRevision: number }",
        "AckSessionSnapshotResult",
        ALL_PLATFORMS,
    ),
    command("arm_vehicle", "{ force: boolean }", "void", ALL_PLATFORMS),
    command("available_transports", "NoArgs", "TransportDescriptor[]", ALL_PLATFORMS),
    command("bt_get_bonded_devices", "NoArgs", "BluetoothDevice[]", ALL_PLATFORMS),
    command("bt_request_permissions", "NoArgs", "void", ALL_PLATFORMS),
    command(
        "bt_scan_ble",
        "{ timeoutMs?: number; profile?: BluetoothProfile }",
        "BluetoothDevice[]",
        ALL_PLATFORMS,
    ),
    command("bt_stop_scan_ble", "NoArgs", "void", ALL_PLATFORMS),
    command("calibrate_accel", "NoArgs", "void", ALL_PLATFORMS),
    command("calibrate_compass_accept", "{ compassMask: number }", "void", ALL_PLATFORMS),
    command("calibrate_compass_cancel", "{ compassMask: number }", "void", ALL_PLATFORMS),
    command("calibrate_compass_start", "{ compassMask: number }", "void", ALL_PLATFORMS),
    command("calibrate_gyro", "NoArgs", "void", ALL_PLATFORMS),
    command("connect_link", "{ request: ConnectLinkRequest }", "void", ALL_PLATFORMS),
    command("disconnect_link", "{ request?: DisconnectRequest }", "void", ALL_PLATFORMS),
    command("disarm_vehicle", "{ force: boolean }", "void", ALL_PLATFORMS),
    command("fence_clear", "NoArgs", "void", ALL_PLATFORMS),
    command("fence_download", "NoArgs", "FencePlan", ALL_PLATFORMS),
    command("fence_upload", "{ plan: FencePlan }", "void", ALL_PLATFORMS),
    command(
        "firmware_bootloader_installation",
        "{ request: { device: DfuDeviceInfo; source: BootloaderInstallationSource } }",
        "BootloaderInstallationResult",
        ALL_PLATFORMS,
    ),
    command(
        "firmware_detect_bootloader_board",
        "{ port: string }",
        "FirmwareBootloaderBoardInfo",
        ALL_PLATFORMS,
    ),
    command(
        "firmware_install_update",
        "{ request: { port: string; baud: number; source: FirmwareInstallSource; options: FirmwareInstallOptions | null } }",
        "FirmwareInstallResult",
        ALL_PLATFORMS,
    ),
    command(
        "firmware_install_update_preflight",
        "NoArgs",
        "FirmwareInstallPreflightInfo",
        ALL_PLATFORMS,
    ),
    command(
        "firmware_install_update_readiness",
        "{ request: FirmwareInstallReadinessRequest }",
        "FirmwareInstallReadinessResponse",
        ALL_PLATFORMS,
    ),
    command("firmware_list_dfu_devices", "NoArgs", "DfuScanResult", ALL_PLATFORMS),
    command(
        "firmware_reboot_to_bootloader",
        "{ port: string }",
        "FirmwareRebootToBootloaderResult",
        ALL_PLATFORMS,
    ),
    command("firmware_session_cancel", "NoArgs", "void", ALL_PLATFORMS),
    command("firmware_session_clear_completed", "NoArgs", "void", ALL_PLATFORMS),
    command("firmware_session_status", "NoArgs", "FirmwareSessionStatus", ALL_PLATFORMS),
    command("get_available_message_rates", "NoArgs", "MessageRateInfo[]", ALL_PLATFORMS),
    command("get_available_modes", "NoArgs", "FlightModeEntry[]", ALL_PLATFORMS),
    command("list_serial_port_inventory", "NoArgs", "SerialPortInventoryResult", ALL_PLATFORMS),
    command("log_chart_series_query", "{ request: ChartSeriesRequest }", "ChartSeriesPage", ALL_PLATFORMS),
    command("log_close", "NoArgs", "void", ALL_PLATFORMS),
    command("log_export", "{ request: LogExportRequest }", "LogExportResult", ALL_PLATFORMS),
    command(
        "log_export_csv",
        "{ path: string; startUsec: number | null; endUsec: number | null }",
        "number",
        ALL_PLATFORMS,
    ),
    command("log_format_adapters", "NoArgs", "LogFormatAdapter[]", ALL_PLATFORMS),
    command("log_get_flight_path", "LogFlightPathArgs", "FlightPathPoint[]", ALL_PLATFORMS),
    command("log_get_flight_summary", "NoArgs", "FlightSummary", ALL_PLATFORMS),
    command("log_get_summary", "NoArgs", "LogSummary | null", ALL_PLATFORMS),
    command(
        "log_get_telemetry_track",
        "{ maxPoints: number | null }",
        "TelemetrySnapshot[]",
        ALL_PLATFORMS,
    ),
    command("log_library_cancel", "NoArgs", "boolean", ALL_PLATFORMS),
    command("log_library_list", "NoArgs", "LogLibraryCatalog", ALL_PLATFORMS),
    command("log_library_register", "{ path: string }", "LogLibraryEntry", ALL_PLATFORMS),
    command(
        "log_library_register_open_file",
        "NoArgs",
        "LogLibraryEntry | null",
        ALL_PLATFORMS,
    ),
    command("log_library_reindex", "{ entryId: string }", "LogLibraryEntry", ALL_PLATFORMS),
    command(
        "log_library_relink",
        "{ entryId: string; path: string }",
        "LogLibraryEntry",
        ALL_PLATFORMS,
    ),
    command("log_library_remove", "{ entryId: string }", "LogLibraryCatalog", ALL_PLATFORMS),
    command("log_open", "{ path: string }", "LogSummary", ALL_PLATFORMS),
    command(
        "log_query",
        "{ msgType: string; startUsec: number | null; endUsec: number | null; maxPoints: number | null }",
        "LogDataPoint[]",
        ALL_PLATFORMS,
    ),
    command("log_raw_messages_query", "{ request: RawMessageQuery }", "RawMessagePage", ALL_PLATFORMS),
    command("mission_cancel", "NoArgs", "void", ALL_PLATFORMS),
    command("mission_clear", "NoArgs", "void", ALL_PLATFORMS),
    command("mission_download", "NoArgs", "MissionDownload", ALL_PLATFORMS),
    command("mission_set_current", "{ seq: number }", "void", ALL_PLATFORMS),
    command("mission_upload", "{ plan: WireMissionPlan }", "void", ALL_PLATFORMS),
    command("mission_validate", "{ plan: WireMissionPlan }", "MissionIssue[]", ALL_PLATFORMS),
    command(
        "motor_test",
        "{ motorInstance: number; throttlePct: number; durationS: number }",
        "void",
        ALL_PLATFORMS,
    ),
    command("open_session_snapshot", "{ sourceKind: SourceKind }", "OpenSessionSnapshot", ALL_PLATFORMS),
    command("param_cancel", "NoArgs", "void", ALL_PLATFORMS),
    command("param_download_all", "NoArgs", "void", ALL_PLATFORMS),
    command("param_format_file", "{ store: ParamStore }", "string", ALL_PLATFORMS),
    command("param_parse_file", "{ contents: string }", "Record<string, number>", ALL_PLATFORMS),
    command("param_write", "{ name: string; value: number }", "Param", ALL_PLATFORMS),
    command("param_write_batch", "{ params: [string, number][] }", "ParamWriteResult[]", ALL_PLATFORMS),
    command("playback_pause", "NoArgs", "PlaybackStateSnapshot", ALL_PLATFORMS),
    command("playback_play", "NoArgs", "PlaybackStateSnapshot", ALL_PLATFORMS),
    command("playback_seek", "{ cursorUsec: number | null }", "PlaybackSeekResult", ALL_PLATFORMS),
    command("playback_set_speed", "{ speed: number }", "PlaybackStateSnapshot", ALL_PLATFORMS),
    command("playback_stop", "NoArgs", "PlaybackStateSnapshot", ALL_PLATFORMS),
    command("rally_clear", "NoArgs", "void", ALL_PLATFORMS),
    command("rally_download", "NoArgs", "RallyPlan", ALL_PLATFORMS),
    command("rally_upload", "{ plan: RallyPlan }", "void", ALL_PLATFORMS),
    command("rc_override", "{ channels: RcOverrideChannel[] }", "void", ALL_PLATFORMS),
    command("reboot_vehicle", "NoArgs", "void", ALL_PLATFORMS),
    command("recording_settings_read", "NoArgs", "RecordingSettingsResult", ALL_PLATFORMS),
    command(
        "recording_settings_write",
        "{ settings: RecordingSettings }",
        "RecordingSettingsResult",
        ALL_PLATFORMS,
    ),
    command("recording_start", "{ request: RecordingStartRequest }", "string", ALL_PLATFORMS),
    command("recording_status", "NoArgs", "RecordingStatus", ALL_PLATFORMS),
    command("recording_stop", "NoArgs", "void", ALL_PLATFORMS),
    command("request_prearm_checks", "NoArgs", "void", ALL_PLATFORMS),
    command("request_web_serial_port", "NoArgs", "SerialPortInfo | null", WEB_MOCK),
    command("set_flight_mode", "{ customMode: number }", "void", ALL_PLATFORMS),
    command("set_message_rate", "{ messageId: number; rateHz: number }", "void", ALL_PLATFORMS),
    command("set_servo", "{ instance: number; pwmUs: number }", "void", ALL_PLATFORMS),
    command("set_telemetry_rate", "{ rateHz: number }", "void", ALL_PLATFORMS),
    command(
        "start_guided_session",
        "{ request: StartGuidedSessionRequest }",
        "GuidedCommandResult",
        ALL_PLATFORMS,
    ),
    command("stop_guided_session", "NoArgs", "GuidedCommandResult", ALL_PLATFORMS),
    command(
        "update_guided_session",
        "{ request: UpdateGuidedSessionRequest }",
        "GuidedCommandResult",
        ALL_PLATFORMS,
    ),
    command("vehicle_takeoff", "{ altitudeM: number }", "void", ALL_PLATFORMS),
];

pub fn command_names_ts() -> Result<String, Box<dyn Error>> {
    ensure_specs_match_command_names()?;
    let mut body = String::from(imports_ts());
    body.push('\n');
    body.push_str("export const INVOKE_COMMAND_NAMES = [\n");
    for name in COMMAND_NAMES {
        body.push_str("  ");
        body.push_str(&serde_json::to_string(name)?);
        body.push_str(",\n");
    }
    body.push_str("] as const;\n\n");
    body.push_str("export type InvokeCommandName = (typeof INVOKE_COMMAND_NAMES)[number];\n");
    body.push('\n');
    body.push_str(&command_map_ts()?);

    Ok(body)
}

fn command_map_ts() -> Result<String, Box<dyn Error>> {
    let mut body = String::new();
    body.push_str("export type NoArgs = undefined;\n\n");
    body.push_str("export type CommandSpec<Args, Result> = {\n");
    body.push_str("  args: Args;\n");
    body.push_str("  result: Result;\n");
    body.push_str("};\n\n");
    body.push_str("type ConnectLinkRequest = ConnectRequest & {\n");
    body.push_str("  auto_record_on_connect: boolean;\n");
    body.push_str("};\n\n");
    body.push_str("type LogFlightPathArgs =\n");
    body.push_str("  | { maxPoints: number | null }\n");
    body.push_str("  | {\n");
    body.push_str("      entryId: string;\n");
    body.push_str("      startUsec: number | null;\n");
    body.push_str("      endUsec: number | null;\n");
    body.push_str("      maxPoints: number | null;\n");
    body.push_str("    };\n\n");
    body.push_str("export type InvokeCommandMap = {\n");
    for spec in COMMAND_SPECS {
        body.push_str("  ");
        body.push_str(spec.name);
        body.push_str(": CommandSpec<");
        body.push_str(spec.args_ts);
        body.push_str(", ");
        body.push_str(spec.result_ts);
        body.push_str(">;\n");
    }
    body.push_str("};\n\n");
    body.push_str("export type KnownInvokeCommandName = keyof InvokeCommandMap & InvokeCommandName;\n");
    body.push_str("export type UnlistedMappedCommand = Exclude<keyof InvokeCommandMap, InvokeCommandName>;\n");
    body.push_str("export type UnmappedGeneratedCommand = Exclude<InvokeCommandName, keyof InvokeCommandMap>;\n");
    body.push_str("export type InvokeResult<C extends keyof InvokeCommandMap> = InvokeCommandMap[C][\"result\"];\n");
    body.push_str("export type NoArgCommandName = {\n");
    body.push_str("  [C in keyof InvokeCommandMap]: InvokeCommandMap[C][\"args\"] extends NoArgs ? C : never;\n");
    body.push_str("}[keyof InvokeCommandMap];\n");
    body.push_str("export type ArgCommandName = Exclude<keyof InvokeCommandMap, NoArgCommandName>;\n");
    body.push_str("export type InvokeArg<C extends ArgCommandName> = InvokeCommandMap[C][\"args\"];\n\n");
    body.push_str("export type PlatformSupport = \"native\" | \"web\" | \"remote\" | \"mock\";\n\n");
    body.push_str("export const COMMAND_PLATFORM_SUPPORT = {\n");
    for spec in COMMAND_SPECS {
        body.push_str("  ");
        body.push_str(spec.name);
        body.push_str(": ");
        body.push_str(&platforms_ts(spec.platforms)?);
        body.push_str(",\n");
    }
    body.push_str("} as const satisfies Record<InvokeCommandName, readonly PlatformSupport[]>;\n\n");
    body.push_str("const commandMapUsesGeneratedCatalog: UnlistedMappedCommand extends never ? true : never = true;\n");
    body.push_str("const commandMapCoversGeneratedCatalog: UnmappedGeneratedCommand extends never ? true : never = true;\n\n");
    body.push_str("export { commandMapCoversGeneratedCatalog, commandMapUsesGeneratedCatalog };\n");

    Ok(body)
}

fn imports_ts() -> &'static str {
    r#"import type { SourceKind } from "./ironwing";
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
import type { FencePlan, RallyPlan, WireMissionPlan } from "../mavkit-types";
import type { Param, ParamStore, ParamWriteResult } from "../../params";
import type { FlightPathPoint, PlaybackSeekResult, PlaybackStateSnapshot, TelemetrySnapshot } from "../../playback";
import type { RecordingSettings, RecordingSettingsResult, RecordingStartRequest, RecordingStatus } from "../../recording";
import type { SerialPortInfo, SerialPortInventoryResult } from "../../serial-ports";
import type { AckSessionSnapshotResult, OpenSessionSnapshot } from "../../session";
import type { BluetoothDevice, FlightModeEntry, MessageRateInfo } from "../../telemetry";
import type { BluetoothProfile, ConnectRequest, DisconnectRequest, TransportDescriptor } from "../../transport";
"#
}

fn platforms_ts(platforms: &[PlatformSupport]) -> Result<String, Box<dyn Error>> {
    let names = platforms
        .iter()
        .map(|platform| platform.as_str())
        .collect::<Vec<_>>();
    Ok(format!("{} as const", serde_json::to_string(&names)?))
}

fn ensure_specs_match_command_names() -> Result<(), Box<dyn Error>> {
    for platforms in [ALL_PLATFORMS, NATIVE_REMOTE_MOCK, WEB_MOCK] {
        if platforms.is_empty() {
            return Err("command platform support set must not be empty".into());
        }
    }

    if COMMAND_SPECS.len() != COMMAND_NAMES.len() {
        return Err(format!(
            "command spec count {} does not match command name count {}",
            COMMAND_SPECS.len(),
            COMMAND_NAMES.len()
        )
        .into());
    }

    for (index, (spec, name)) in COMMAND_SPECS.iter().zip(COMMAND_NAMES).enumerate() {
        if spec.name != *name {
            return Err(format!(
                "command spec at index {index} is {}, expected {name}",
                spec.name
            )
            .into());
        }
    }

    Ok(())
}
