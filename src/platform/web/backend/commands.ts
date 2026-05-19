import { ensureWasmRuntime } from "../wasm";
import { createWebBluetoothTransport, isWebBluetoothAvailable } from "../transports/web-bluetooth";
import { createWebSerialTransport, isWebSerialAvailable } from "../transports/web-serial";
import { createWebSocketTransport } from "../transports/websocket";
import { resetActiveConnection, webBackendRuntime } from "./runtime";
import { unsupported } from "./unsupported";
import type {
  DfuRecoveryResult,
  FirmwareSessionStatus,
  SerialFlowResult,
  SerialPreflightInfo,
  SerialReadinessRequest,
  SerialReadinessResponse,
} from "../../../firmware";
import type { LogFormatAdapter, LogLibraryCatalog } from "../../../logs";
import type { RecordingSettings, RecordingSettingsResult, RecordingStatus } from "../../../recording";
import type { TransportDescriptor } from "../../../transport";

type Capability =
  | { kind: "supported" }
  | { kind: "maybe"; reason: string }
  | { kind: "unsupported"; reason: string };

type RuntimeCapabilities = {
  transports: TransportDescriptor[];
  firmware_flash: Capability;
  log_library_filesystem: Capability;
  recording_filesystem: Capability;
  mission_transfer: Capability;
  parameter_transfer: Capability;
};

const DEFAULT_WEB_RECORDING_SETTINGS: RecordingSettings = {
  auto_record_on_connect: false,
  auto_record_directory: "",
  filename_template: "YYYY-MM-DD_HH-MM-SS_{vehicle-or-sysid-or-unknown}.tlog",
  add_completed_recordings_to_library: false,
};

const EMPTY_WEB_LOG_LIBRARY: LogLibraryCatalog = {
  schema_version: 1,
  storage: {
    kind: "app_data",
    catalog_path: "browser-unavailable/logs/catalog.json",
    indexes_dir: "browser-unavailable/logs/indexes",
    recordings_dir: "browser-unavailable/logs/recordings",
  },
  migrated_from_schema_version: null,
  entries: [],
};

const WEB_LOG_FORMAT_ADAPTERS: LogFormatAdapter[] = [
  {
    format: "tlog",
    label: "MAVLink telemetry log",
    file_extensions: ["tlog"],
    supports_replay: false,
    supports_raw_messages: false,
    supports_chart_series: false,
  },
  {
    format: "bin",
    label: "ArduPilot dataflash log",
    file_extensions: ["bin"],
    supports_replay: false,
    supports_raw_messages: false,
    supports_chart_series: false,
  },
];

const IDLE_FIRMWARE_STATUS: FirmwareSessionStatus = { kind: "idle" };

const WEB_SERIAL_FLASH_UNSUPPORTED_RESULT = {
  result: "failed",
  reason: "Firmware flashing is not available in the browser-only web runtime.",
} satisfies SerialFlowResult;

const WEB_DFU_RECOVERY_UNSUPPORTED_RESULT = {
  result: "platform_unsupported",
} satisfies DfuRecoveryResult;

const WEB_MESSAGE_RATES = [
  { id: 33, name: "Global Position", default_rate_hz: 4.0 },
  { id: 30, name: "Attitude", default_rate_hz: 4.0 },
  { id: 24, name: "GPS Raw", default_rate_hz: 2.0 },
  { id: 1, name: "System Status", default_rate_hz: 1.0 },
  { id: 65, name: "RC Channels", default_rate_hz: 2.0 },
  { id: 36, name: "Servo Output", default_rate_hz: 2.0 },
  { id: 74, name: "VFR HUD", default_rate_hz: 4.0 },
  { id: 62, name: "Nav Controller", default_rate_hz: 2.0 },
];

const maybe = (reason: string): Capability => ({ kind: "maybe", reason });
const unsupportedCapability = (reason: string): Capability => ({ kind: "unsupported", reason });

function webTransportDescriptors(): TransportDescriptor[] {
  return [
    {
      kind: "websocket",
      label: "WebSocket",
      available: typeof WebSocket !== "undefined",
      validation: { url_required: true },
      discovery_error:
        typeof WebSocket === "undefined" ? "WebSocket is not available in this browser" : undefined,
    },
    {
      kind: "web_serial",
      label: "Web Serial",
      available: isWebSerialAvailable(),
      validation: { chooser_required: true, baud_required: true },
      default_baud: 57600,
      discovery_error: isWebSerialAvailable()
        ? undefined
        : "Web Serial is not available in this browser",
    },
    {
      kind: "web_bluetooth",
      label: "Web Bluetooth (NUS)",
      available: isWebBluetoothAvailable(),
      validation: { chooser_required: true },
      profile: "nordic_uart",
      discovery_error: isWebBluetoothAvailable()
        ? undefined
        : "Web Bluetooth is not available in this browser",
    },
  ];
}

function webRuntimeCapabilities(): RuntimeCapabilities {
  return {
    transports: webTransportDescriptors(),
    firmware_flash: unsupportedCapability("Firmware flashing is not available in pure web mode."),
    log_library_filesystem: unsupportedCapability("Native log-library filesystem access is not available in pure web mode."),
    recording_filesystem: unsupportedCapability("Native recording filesystem access is not available in pure web mode."),
    mission_transfer: maybe("Mission transfer depends on the connected MAVLink browser transport."),
    parameter_transfer: maybe("Parameter transfer depends on the connected MAVLink browser transport."),
  };
}

function computeSerialReadinessToken(request: SerialReadinessRequest): string {
  const encoder = new TextEncoder();
  const sourceIdentity = request.source.kind === "catalog_url"
    ? `${request.source.url.length}-${fnv1a64Digest([...encoder.encode(request.source.url)])}`
    : `${request.source.data.length}-${fnv1a64Digest(request.source.data)}`;

  return `serial-readiness:port=${request.port}:source_kind=${request.source.kind}:source_identity=${sourceIdentity}:full_chip_erase=${request.options?.full_chip_erase ? 1 : 0}`;
}

function fnv1a64Digest(bytes: number[]): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }

  return hash.toString(16).padStart(16, "0");
}

export async function invokeWebCommand<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    case "available_transports":
      return webTransportDescriptors() as T;
    case "runtime_capabilities":
      return webRuntimeCapabilities() as T;
    case "list_serial_ports_cmd":
      return [] as T;
    case "bt_request_permissions":
    case "bt_stop_scan_ble":
      return undefined as T;
    case "bt_scan_ble":
    case "bt_get_bonded_devices":
      return [] as T;
    case "connect_link": {
      const request = args?.request as {
        transport?: { kind?: string; url?: string; baud?: number; profile?: "nordic_uart" };
      } | undefined;
      if (!request?.transport) {
        throw new Error("connect_link requires a transport request");
      }
      if (
        request.transport.kind !== "websocket"
        && request.transport.kind !== "web_serial"
        && request.transport.kind !== "web_bluetooth"
      ) {
        unsupported(cmd, "Use a browser-owned WebSocket, Web Serial, or Web Bluetooth transport.");
      }

      const runtime = await ensureWasmRuntime();
      webBackendRuntime.runtimeLoaded = true;
      await resetActiveConnection();

      const bridge = runtime.beginConnect();
      const connectAbort = new AbortController();
      const transport = (() => {
        switch (request.transport.kind) {
          case "websocket":
            return createWebSocketTransport(
              { kind: "websocket", url: String(request.transport.url ?? "") },
              bridge,
              connectAbort.signal,
            );
          case "web_serial":
            return createWebSerialTransport(
              { kind: "web_serial", baud: Number(request.transport.baud ?? 57600) },
              bridge,
              connectAbort.signal,
            );
          case "web_bluetooth":
            return createWebBluetoothTransport(
              { kind: "web_bluetooth", profile: request.transport.profile ?? "nordic_uart" },
              bridge,
              connectAbort.signal,
            );
          default:
            unsupported(cmd, "Use a browser-owned WebSocket, Web Serial, or Web Bluetooth transport.");
        }
      })();

      webBackendRuntime.connectAbort = connectAbort;
      webBackendRuntime.activeTransport = transport;

      try {
        await transport.start();
        await runtime.waitConnect();
        return undefined as T;
      } catch (error) {
        await transport.close();
        webBackendRuntime.activeTransport = null;
        webBackendRuntime.connectAbort = null;
        throw error;
      }
    }
    case "open_session_snapshot": {
      const runtime = await ensureWasmRuntime();
      webBackendRuntime.runtimeLoaded = true;
      return runtime.openSessionSnapshot(String(args?.sourceKind ?? "live")) as T;
    }
    case "ack_session_snapshot": {
      const runtime = await ensureWasmRuntime();
      webBackendRuntime.runtimeLoaded = true;
      return runtime.ackSessionSnapshot(
        String(args?.sessionId ?? ""),
        Number(args?.seekEpoch ?? 0),
        Number(args?.resetRevision ?? 0),
      ) as T;
    }
    case "disconnect_link": {
      await resetActiveConnection();
      if (webBackendRuntime.runtimeLoaded) {
        const runtime = await ensureWasmRuntime();
        await runtime.disconnectLink();
      }
      return undefined as T;
    }
    case "get_available_modes": {
      const runtime = await ensureWasmRuntime();
      webBackendRuntime.runtimeLoaded = true;
      return runtime.getAvailableModes() as T;
    }
    case "set_flight_mode": {
      const runtime = await ensureWasmRuntime();
      webBackendRuntime.runtimeLoaded = true;
      await runtime.setFlightMode(Number(args?.customMode ?? 0));
      return undefined as T;
    }
    case "arm_vehicle": {
      const runtime = await ensureWasmRuntime();
      webBackendRuntime.runtimeLoaded = true;
      await runtime.armVehicle(Boolean(args?.force));
      return undefined as T;
    }
    case "disarm_vehicle": {
      const runtime = await ensureWasmRuntime();
      webBackendRuntime.runtimeLoaded = true;
      await runtime.disarmVehicle(Boolean(args?.force));
      return undefined as T;
    }
    case "vehicle_takeoff": {
      const runtime = await ensureWasmRuntime();
      webBackendRuntime.runtimeLoaded = true;
      await runtime.vehicleTakeoff(Number(args?.altitudeM ?? 0));
      return undefined as T;
    }
    case "set_message_rate": {
      const runtime = await ensureWasmRuntime();
      webBackendRuntime.runtimeLoaded = true;
      await runtime.setMessageRate(Number(args?.messageId ?? 0), Number(args?.rateHz ?? 0));
      return undefined as T;
    }
    case "get_available_message_rates":
      return WEB_MESSAGE_RATES as T;
    case "set_telemetry_rate": {
      const runtime = await ensureWasmRuntime();
      webBackendRuntime.runtimeLoaded = true;
      runtime.setTelemetryRate(Number(args?.rateHz ?? 0));
      return undefined as T;
    }
    case "log_format_adapters":
      return WEB_LOG_FORMAT_ADAPTERS as T;
    case "log_library_list":
      return EMPTY_WEB_LOG_LIBRARY as T;
    case "recording_status":
      return { kind: "idle" } satisfies RecordingStatus as T;
    case "recording_settings_read":
      return {
        operation_id: "recording_settings_read",
        settings: DEFAULT_WEB_RECORDING_SETTINGS,
      } satisfies RecordingSettingsResult as T;
    case "recording_settings_write":
      return {
        operation_id: "recording_settings_write",
        settings: {
          ...DEFAULT_WEB_RECORDING_SETTINGS,
          ...((args?.settings ?? {}) as Partial<RecordingSettings>),
        },
      } as T;
    case "log_library_register_open_file":
      return null as T;
    case "log_library_cancel":
      return false as T;
    case "firmware_session_status":
      return IDLE_FIRMWARE_STATUS as T;
    case "firmware_session_cancel":
    case "firmware_session_clear_completed":
      return undefined as T;
    case "firmware_list_ports":
      return { kind: "unsupported" } as T;
    case "firmware_list_dfu_devices":
      return { kind: "unsupported" } as T;
    case "firmware_serial_preflight":
      return {
        vehicle_connected: false,
        param_count: 0,
        has_params_to_backup: false,
        available_ports: [],
        detected_board_id: null,
        session_ready: false,
        session_status: IDLE_FIRMWARE_STATUS,
      } satisfies SerialPreflightInfo as T;
    case "firmware_catalog_targets":
    case "firmware_recovery_catalog_targets":
    case "firmware_catalog_entries":
      return [] as T;
    case "firmware_serial_readiness": {
      const readinessRequest = args?.request as SerialReadinessRequest | undefined;
      return {
        request_token: readinessRequest
          ? computeSerialReadinessToken(readinessRequest)
          : "web-runtime-firmware-out-of-scope",
        session_status: IDLE_FIRMWARE_STATUS,
        readiness: { kind: "blocked", reason: "port_unselected" },
        target_hint: null,
        validation_pending: false,
        bootloader_transition: { kind: "manual_bootloader_entry_required" },
      } satisfies SerialReadinessResponse as T;
    }
    case "firmware_flash_serial":
      return WEB_SERIAL_FLASH_UNSUPPORTED_RESULT as T;
    case "firmware_flash_dfu_recovery":
      return WEB_DFU_RECOVERY_UNSUPPORTED_RESULT as T;
    default:
      unsupported(cmd, "This feature is not supported in pure web mode.");
  }
}
