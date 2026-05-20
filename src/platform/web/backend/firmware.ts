import {
  wasmFirmwareBootloaderCatalogTargetsFromManifest,
  wasmFirmwareCatalogEntriesFromManifest,
  wasmFirmwareCatalogTargetsFromManifest,
  wasmWebSerialFirmwareInstallUpdate,
} from "../wasm";
import { emitWebEvent } from "../event";
import {
  isWebSerialFirmwareAvailable,
  listGrantedWebSerialFirmwarePorts,
  openWebSerialFirmwarePort,
  requestWebSerialFirmwarePort,
} from "../firmware/web-serial";
import { IDLE_WEB_FIRMWARE_STATUS, resetActiveConnection, webBackendRuntime } from "./runtime";
import { handled, WEB_COMMAND_UNHANDLED } from "./command-handler";
import type { WebCommandArgs, WebCommandResult } from "./command-handler";
import type {
  BootloaderInstallationResult,
  CatalogEntry,
  CatalogTargetSummary,
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

const FIRMWARE_MANIFEST_URL = "https://firmware.ardupilot.org/manifest.json.gz";
const BOOTLOADER_INDEX_URL = "https://firmware.ardupilot.org/Tools/Bootloaders/";

let manifestCache: Promise<Uint8Array> | null = null;
let bootloaderIndexCache: Promise<string> | null = null;

export const WEB_SERIAL_FLASH_UNSUPPORTED_RESULT = {
  result: "failed",
  reason: "Firmware install/update requires WebSerial in the browser-only web runtime.",
} satisfies FirmwareInstallResult;

// WebUSB DFU needs a browser USB discovery/claiming layer plus a WASM DFU executor.
export const WEB_BOOTLOADER_INSTALLATION_UNSUPPORTED_RESULT = {
  result: "platform_unsupported",
  reason: "Browser WebUSB/DFU flashing is not wired yet; use native desktop DFU recovery or serial WebSerial firmware install/update.",
} satisfies BootloaderInstallationResult;

export async function tryHandleFirmwareCommand(cmd: string, args?: WebCommandArgs): Promise<WebCommandResult> {
  switch (cmd) {
    case "firmware_session_status":
      return handled(webBackendRuntime.firmwareSessionStatus);
    case "firmware_session_cancel":
      webBackendRuntime.firmwareInstallAbort?.abort();
      if (webBackendRuntime.firmwareSessionStatus.kind === "firmware_install_update") {
        webBackendRuntime.firmwareSessionStatus = { kind: "cancelling", path: "firmware_install_update" };
      }
      return handled(undefined);
    case "firmware_session_clear_completed":
      if (webBackendRuntime.firmwareSessionStatus.kind === "completed") {
        webBackendRuntime.firmwareSessionStatus = IDLE_WEB_FIRMWARE_STATUS;
      }
      return handled(undefined);
    case "firmware_request_serial_port":
      return handled(isWebSerialFirmwareAvailable() ? await requestWebSerialFirmwarePort() : null);
    case "firmware_list_ports": {
      if (!isWebSerialFirmwareAvailable()) {
        return handled({ kind: "unsupported" } satisfies InventoryResult);
      }
      return handled({ kind: "available", ports: await webFirmwarePorts() } satisfies InventoryResult);
    }
    case "firmware_list_dfu_devices":
      return handled({
        kind: "unsupported",
        reason: "Browser WebUSB/DFU discovery is not implemented in the pure web backend.",
      });
    case "firmware_install_update_preflight": {
      const availablePorts = await webFirmwarePorts();
      return handled({
        vehicle_connected: false,
        param_count: 0,
        has_params_to_backup: false,
        available_ports: availablePorts,
        detected_board_id: null,
        session_ready: isWebSerialFirmwareAvailable() && isFirmwareSessionReady(webBackendRuntime.firmwareSessionStatus),
        session_status: webBackendRuntime.firmwareSessionStatus,
      } satisfies FirmwareInstallPreflightInfo);
    }
    case "firmware_catalog_targets":
      return handled(await firmwareCatalogTargets());
    case "firmware_bootloader_catalog_targets":
      return handled(await firmwareBootloaderCatalogTargets());
    case "firmware_catalog_entries":
      return handled(await firmwareCatalogEntries(args));
    case "firmware_install_update_readiness":
      return handled(await firmwareInstallUpdateReadiness(args));
    case "firmware_install_update":
      return handled(await firmwareInstallUpdate(args));
    case "firmware_bootloader_installation":
      return handled(WEB_BOOTLOADER_INSTALLATION_UNSUPPORTED_RESULT);
    default:
      return WEB_COMMAND_UNHANDLED;
  }
}

export function isFirmwareSessionReady(status: FirmwareSessionStatus): boolean {
  return status.kind === "idle" || status.kind === "completed";
}

export function resetWebFirmwareCatalogCacheForTests(): void {
  manifestCache = null;
  bootloaderIndexCache = null;
}

export function setFirmwareInstallPhase(phase: "probing" | "erasing" | "programming" | "verifying" | "rebooting"): void {
  webBackendRuntime.firmwareSessionStatus = { kind: "firmware_install_update", phase };
}

export function completeFirmwareInstall(result: FirmwareInstallResult): void {
  webBackendRuntime.firmwareSessionStatus = {
    kind: "completed",
    outcome: {
      path: "firmware_install_update",
      outcome: result,
    },
  };
}

export function webFirmwarePhaseFromProgress(phase: string): "erasing" | "programming" | "verifying" | "rebooting" | null {
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

export function emitWebFirmwareProgress(phase: string, written: number, total: number): void {
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

export async function webFirmwarePorts(): Promise<PortInfo[]> {
  return isWebSerialFirmwareAvailable() ? await listGrantedWebSerialFirmwarePorts() : [];
}

export async function resolveWebFirmwareSource(source: FirmwareInstallSource, signal: AbortSignal): Promise<FirmwareInstallSource> {
  if (source.kind === "local_apj_bytes") {
    return source;
  }
  const url = source.url.trim();
  if (url.length === 0) {
    return source;
  }

  return {
    kind: "local_apj_bytes",
    data: Array.from(await fetchBytes(url, "firmware artifact", signal)),
  };
}

async function firmwareCatalogTargets(): Promise<CatalogTargetSummary[]> {
  return wasmFirmwareCatalogTargetsFromManifest(await fetchFirmwareManifest());
}

async function firmwareBootloaderCatalogTargets(): Promise<CatalogTargetSummary[]> {
  const [manifest, bootloaderIndex] = await Promise.all([
    fetchFirmwareManifest(),
    fetchBootloaderIndex(),
  ]);
  return wasmFirmwareBootloaderCatalogTargetsFromManifest(manifest, bootloaderIndex);
}

async function firmwareCatalogEntries(args?: WebCommandArgs): Promise<CatalogEntry[]> {
  const boardId = Number(args?.boardId ?? 0);
  if (!Number.isFinite(boardId) || boardId <= 0) {
    throw new Error("firmware catalog boardId is required");
  }

  const platform = typeof args?.platform === "string" && args.platform.trim().length > 0
    ? args.platform.trim()
    : null;
  return wasmFirmwareCatalogEntriesFromManifest(await fetchFirmwareManifest(), boardId, platform);
}

async function fetchFirmwareManifest(): Promise<Uint8Array> {
  manifestCache ??= fetchBytes(FIRMWARE_MANIFEST_URL, "firmware catalog manifest");
  return manifestCache;
}

async function fetchBootloaderIndex(): Promise<string> {
  bootloaderIndexCache ??= fetchText(BOOTLOADER_INDEX_URL, "firmware bootloader index");
  return bootloaderIndexCache;
}

async function fetchBytes(url: string, label: string, signal?: AbortSignal): Promise<Uint8Array> {
  return new Uint8Array(await fetchArrayBuffer(url, label, signal));
}

async function fetchText(url: string, label: string, signal?: AbortSignal): Promise<string> {
  const response = await fetchChecked(url, label, signal);
  return response.text();
}

async function fetchArrayBuffer(url: string, label: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetchChecked(url, label, signal);
  return response.arrayBuffer();
}

async function fetchChecked(url: string, label: string, signal?: AbortSignal): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} fetch failed. Browser fetch may be blocked by network or CORS: ${detail}`);
  }
  if (!response.ok) {
    throw new Error(`${label} fetch failed: HTTP ${response.status}`);
  }
  return response;
}

export function webFirmwareInstallReadinessBlockedReason(
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

export function computeFirmwareInstallReadinessToken(request: FirmwareInstallReadinessRequest): string {
  const encoder = new TextEncoder();
  const sourceIdentity = request.source.kind === "catalog_url"
    ? `${request.source.url.length}-${fnv1a64Digest([...encoder.encode(request.source.url)])}`
    : `${request.source.data.length}-${fnv1a64Digest(request.source.data)}`;

  return `firmware-install-readiness:port=${request.port}:source_kind=${request.source.kind}:source_identity=${sourceIdentity}:full_chip_erase=${request.options?.full_chip_erase ? 1 : 0}`;
}

export function fnv1a64Digest(bytes: number[]): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }

  return hash.toString(16).padStart(16, "0");
}

async function firmwareInstallUpdateReadiness(args?: WebCommandArgs): Promise<FirmwareInstallReadinessResponse> {
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
  };
}

async function firmwareInstallUpdate(args?: WebCommandArgs): Promise<FirmwareInstallResult> {
  if (!isWebSerialFirmwareAvailable()) {
    return WEB_SERIAL_FLASH_UNSUPPORTED_RESULT;
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
    return result;
  } catch (error) {
    if (abort.signal.aborted) {
      const result = { result: "cancelled" } satisfies FirmwareInstallResult;
      completeFirmwareInstall(result);
      return result;
    }
    const reason = error instanceof Error ? error.message : String(error);
    const result = { result: "failed", reason } satisfies FirmwareInstallResult;
    completeFirmwareInstall(result);
    return result;
  } finally {
    webBackendRuntime.firmwareInstallAbort = null;
    await adapter?.close().catch(() => undefined);
  }
}
