import {
  ensureWasmRuntime,
  wasmAvailableMessageRates,
  wasmWebSerialFirmwareInstallUpdate,
  wasmWebTransportDescriptors,
} from "../wasm";
import { emitWebEvent } from "../event";
import {
  isWebSerialFirmwareAvailable,
  listGrantedWebSerialFirmwarePorts,
  openWebSerialFirmwarePort,
  requestWebSerialFirmwarePort,
} from "../firmware/web-serial";
import { createWebBluetoothTransport, isWebBluetoothAvailable } from "../transports/web-bluetooth";
import { createWebSerialTransport, isWebSerialAvailable } from "../transports/web-serial";
import { createWebSocketTransport } from "../transports/websocket";
import { IDLE_WEB_FIRMWARE_STATUS, resetActiveConnection, webBackendRuntime } from "./runtime";
import { unsupported } from "./unsupported";
import type {
  BootloaderInstallationResult,
  FirmwareInstallOptions,
  FirmwareInstallPreflightInfo,
  FirmwareInstallReadinessRequest,
  FirmwareInstallReadinessResponse,
  FirmwareInstallResult,
  FirmwareInstallSource,
  FirmwareProgress,
  FirmwareSessionStatus,
  InventoryResult,
  PortInfo,
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
  firmware_install_update: Capability;
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

const WEB_SERIAL_FLASH_UNSUPPORTED_RESULT = {
  result: "failed",
  reason: "Firmware install/update requires WebSerial in the browser-only web runtime.",
} satisfies FirmwareInstallResult;

const WEB_BOOTLOADER_INSTALLATION_UNSUPPORTED_RESULT = {
  result: "platform_unsupported",
} satisfies BootloaderInstallationResult;

const maybe = (reason: string): Capability => ({ kind: "maybe", reason });
const unsupportedCapability = (reason: string): Capability => ({ kind: "unsupported", reason });

function webTransportDescriptors(): Promise<TransportDescriptor[]> {
  return wasmWebTransportDescriptors({
    websocketAvailable: typeof WebSocket !== "undefined",
    webSerialAvailable: isWebSerialAvailable(),
    webBluetoothAvailable: isWebBluetoothAvailable(),
  });
}

async function webRuntimeCapabilities(): Promise<RuntimeCapabilities> {
  const webSerialFirmwareAvailable = isWebSerialFirmwareAvailable();
  return {
    transports: await webTransportDescriptors(),
    firmware_install_update: webSerialFirmwareAvailable
      ? { kind: "supported" }
      : unsupportedCapability("Firmware install/update requires WebSerial in pure web mode."),
    log_library_filesystem: unsupportedCapability("Native log-library filesystem access is not available in pure web mode."),
    recording_filesystem: unsupportedCapability("Native recording filesystem access is not available in pure web mode."),
    mission_transfer: maybe("Mission transfer depends on the connected MAVLink browser transport."),
    parameter_transfer: maybe("Parameter transfer depends on the connected MAVLink browser transport."),
  };
}

function isFirmwareSessionReady(status: FirmwareSessionStatus): boolean {
  return status.kind === "idle" || status.kind === "completed";
}

function setFirmwareInstallPhase(phase: "probing" | "erasing" | "programming" | "verifying" | "rebooting"): void {
  webBackendRuntime.firmwareSessionStatus = { kind: "firmware_install_update", phase };
}

function completeFirmwareInstall(result: FirmwareInstallResult): void {
  webBackendRuntime.firmwareSessionStatus = {
    kind: "completed",
    outcome: {
      path: "firmware_install_update",
      outcome: result,
    },
  };
}

function webFirmwarePhaseFromProgress(phase: string): "erasing" | "programming" | "verifying" | "rebooting" | null {
  if (phase === "erasing" || phase === "extf_erasing") {
    return "erasing";
  }
  if (phase === "programming" || phase === "extf_programming") {
    return "programming";
  }
  if (phase === "verifying" || phase === "extf_verifying") {
    return "verifying";
  }
  if (phase === "rebooting") {
    return "rebooting";
  }
  return null;
}

function emitWebFirmwareProgress(phase: string, written: number, total: number): void {
  const mappedPhase = webFirmwarePhaseFromProgress(phase);
  if (mappedPhase) {
    setFirmwareInstallPhase(mappedPhase);
  }
  const progress = {
    phase_label: phase,
    bytes_written: written,
    bytes_total: total,
    pct: total > 0 ? (written / total) * 100 : 0,
  } satisfies FirmwareProgress;
  emitWebEvent("firmware://progress", progress);
}

async function webFirmwarePorts(): Promise<PortInfo[]> {
  return isWebSerialFirmwareAvailable() ? await listGrantedWebSerialFirmwarePorts() : [];
}

async function resolveWebFirmwareSource(source: FirmwareInstallSource, signal: AbortSignal): Promise<FirmwareInstallSource> {
  if (source.kind === "local_apj_bytes") {
    return source;
  }
  const url = source.url.trim();
  if (url.length === 0) {
    return source;
  }

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Firmware catalog download failed: HTTP ${response.status}`);
  }
  return {
    kind: "local_apj_bytes",
    data: [...new Uint8Array(await response.arrayBuffer())],
  };
}

function webFirmwareInstallReadinessBlockedReason(
  request: FirmwareInstallReadinessRequest,
  availablePorts: PortInfo[],
  sessionStatus: FirmwareSessionStatus,
): "session_busy" | "port_unselected" | "port_unavailable" | "source_missing" | null {
  if (!isFirmwareSessionReady(sessionStatus)) {
    return "session_busy";
  }
  if (request.port.trim().length === 0) {
    return "port_unselected";
  }
  if (!availablePorts.some((port) => port.port_name === request.port)) {
    return "port_unavailable";
  }
  if (request.source.kind === "catalog_url" ? request.source.url.trim().length === 0 : request.source.data.length === 0) {
    return "source_missing";
  }
  return null;
}

function computeFirmwareInstallReadinessToken(request: FirmwareInstallReadinessRequest): string {
  const encoder = new TextEncoder();
  const sourceIdentity = request.source.kind === "catalog_url"
    ? `${request.source.url.length}-${fnv1a64Digest([...encoder.encode(request.source.url)])}`
    : `${request.source.data.length}-${fnv1a64Digest(request.source.data)}`;

  return `firmware-install-readiness:port=${request.port}:source_kind=${request.source.kind}:source_identity=${sourceIdentity}:full_chip_erase=${request.options?.full_chip_erase ? 1 : 0}`;
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
      return await webTransportDescriptors() as T;
    case "runtime_capabilities":
      return await webRuntimeCapabilities() as T;
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
      return await wasmAvailableMessageRates() as T;
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
      return webBackendRuntime.firmwareSessionStatus as T;
    case "firmware_session_cancel":
      webBackendRuntime.firmwareInstallAbort?.abort();
      if (webBackendRuntime.firmwareSessionStatus.kind === "firmware_install_update") {
        webBackendRuntime.firmwareSessionStatus = { kind: "cancelling", path: "firmware_install_update" };
      }
      return undefined as T;
    case "firmware_session_clear_completed":
      if (webBackendRuntime.firmwareSessionStatus.kind === "completed") {
        webBackendRuntime.firmwareSessionStatus = IDLE_WEB_FIRMWARE_STATUS;
      }
      return undefined as T;
    case "firmware_request_serial_port":
      return isWebSerialFirmwareAvailable() ? await requestWebSerialFirmwarePort() as T : null as T;
    case "firmware_list_ports": {
      if (!isWebSerialFirmwareAvailable()) {
        return { kind: "unsupported" } satisfies InventoryResult as T;
      }
      return { kind: "available", ports: await webFirmwarePorts() } satisfies InventoryResult as T;
    }
    case "firmware_list_dfu_devices":
      return { kind: "unsupported" } as T;
    case "firmware_install_update_preflight": {
      const availablePorts = await webFirmwarePorts();
      return {
        vehicle_connected: false,
        param_count: 0,
        has_params_to_backup: false,
        available_ports: availablePorts,
        detected_board_id: null,
        session_ready: isWebSerialFirmwareAvailable() && isFirmwareSessionReady(webBackendRuntime.firmwareSessionStatus),
        session_status: webBackendRuntime.firmwareSessionStatus,
      } satisfies FirmwareInstallPreflightInfo as T;
    }
    case "firmware_catalog_targets":
    case "firmware_bootloader_catalog_targets":
    case "firmware_catalog_entries":
      return [] as T;
    case "firmware_install_update_readiness": {
      const readinessRequest = args?.request as FirmwareInstallReadinessRequest | undefined;
      const availablePorts = await webFirmwarePorts();
      const blockedReason = readinessRequest
        ? webFirmwareInstallReadinessBlockedReason(readinessRequest, availablePorts, webBackendRuntime.firmwareSessionStatus)
        : "port_unselected";
      return {
        request_token: readinessRequest
          ? computeFirmwareInstallReadinessToken(readinessRequest)
          : "web-runtime-firmware-out-of-scope",
        session_status: webBackendRuntime.firmwareSessionStatus,
        readiness: blockedReason === null ? { kind: "advisory" } : { kind: "blocked", reason: blockedReason },
        target_hint: { detected_board_id: null },
        validation_pending: blockedReason === null,
        bootloader_transition: { kind: "manual_bootloader_entry_required" },
      } satisfies FirmwareInstallReadinessResponse as T;
    }
    case "firmware_install_update": {
      if (!isWebSerialFirmwareAvailable()) {
        return WEB_SERIAL_FLASH_UNSUPPORTED_RESULT as T;
      }
      if (!isFirmwareSessionReady(webBackendRuntime.firmwareSessionStatus)) {
        throw new Error("firmware session already active: firmware_install_update");
      }

      const request = args?.request as {
        port?: string;
        baud?: number;
        source?: FirmwareInstallSource;
        options?: FirmwareInstallOptions | null;
      } | undefined;
      const port = String(request?.port ?? "");
      const source = request?.source;
      const options = request?.options ?? null;
      const availablePorts = await webFirmwarePorts();
      if (!source) {
        throw new Error("firmware source missing");
      }
      const blockedReason = webFirmwareInstallReadinessBlockedReason(
        { port, source, options: options ?? undefined },
        availablePorts,
        webBackendRuntime.firmwareSessionStatus,
      );
      if (blockedReason === "port_unselected") {
        throw new Error("serial port not selected");
      }
      if (blockedReason === "port_unavailable") {
        throw new Error("serial port not found");
      }
      if (blockedReason === "source_missing") {
        throw new Error("firmware source missing");
      }

      await resetActiveConnection();
      const abort = new AbortController();
      webBackendRuntime.firmwareInstallAbort = abort;
      setFirmwareInstallPhase("probing");
      let adapter: { close(): Promise<void> } | null = null;

      try {
        const resolvedSource = await resolveWebFirmwareSource(source, abort.signal);
        adapter = await openWebSerialFirmwarePort(port, Number(request?.baud ?? 115200), abort.signal);
        const result = await wasmWebSerialFirmwareInstallUpdate({
          portName: port,
          serialAdapter: adapter,
          source: resolvedSource,
          installOptions: options,
          onProgress: emitWebFirmwareProgress,
          isCancelled: () => abort.signal.aborted,
        });
        completeFirmwareInstall(result);
        return result as T;
      } catch (error) {
        if (abort.signal.aborted) {
          const result = { result: "cancelled" } satisfies FirmwareInstallResult;
          completeFirmwareInstall(result);
          return result as T;
        }
        const reason = error instanceof Error ? error.message : String(error);
        const result = { result: "failed", reason } satisfies FirmwareInstallResult;
        completeFirmwareInstall(result);
        return result as T;
      } finally {
        webBackendRuntime.firmwareInstallAbort = null;
        await adapter?.close().catch(() => undefined);
      }
    }
    case "firmware_bootloader_installation":
      return WEB_BOOTLOADER_INSTALLATION_UNSUPPORTED_RESULT as T;
    default:
      unsupported(cmd, "This feature is not supported in pure web mode.");
  }
}
