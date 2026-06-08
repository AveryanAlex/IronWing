import {
  wasmDisconnectLink,
  wasmRebootToBootloader,
  wasmWebSerialDetectBootloaderBoard,
  wasmWebSerialFirmwareInstallUpdate,
  wasmWebUsbBootloaderInstallation,
} from "../wasm";
import { emitWebEvent } from "../event";
import {
  isWebSerialGrantAvailable,
  listGrantedWebSerialPorts,
  openWebSerialPort,
} from "../serial/web-serial";
import { IDLE_WEB_FIRMWARE_STATUS, resetActiveConnection, webBackendRuntime } from "./runtime";
import { handled, WEB_COMMAND_UNHANDLED } from "./command-handler";
import type { WebCommandArgs, WebCommandResult } from "./command-handler";
import type {
  BootloaderInstallationResult,
  BootloaderInstallationSource,
  CatalogEntry,
  CatalogTargetSummary,
  DfuDeviceInfo,
  DfuScanResult,
  FirmwareBootloaderBoardInfo,
  FirmwareInstallOptions,
  FirmwareInstallPreflightInfo,
  FirmwareInstallReadinessRequest,
  FirmwareInstallReadinessResponse,
  FirmwareInstallResult,
  FirmwareInstallSource,
  FirmwareInstallBootloaderStatus,
  FirmwareProgress,
  FirmwareRebootToBootloaderResult,
  FirmwareSessionStatus,
  PortInfo,
} from "../../../firmware";
import type { WebActiveLinkTarget } from "./runtime";
import { ardupilotFirmwareUrl } from "../../../lib/ardupilot-urls";
import {
  BOOTLOADER_INSTALLATION_WEB_UNSUPPORTED_GUIDANCE,
  WEB_SERIAL_FLASH_UNSUPPORTED_REASON,
  WEB_BOOTLOADER_INSTALLATION_UNSUPPORTED_REASON,
} from "../../../lib/firmware/platform-guidance";
import {
  firmwareBootloaderCatalogTargetsFromRemote,
  firmwareCatalogEntriesFromRemote,
  firmwareCatalogTargetsFromRemote,
  resetFirmwareCatalogCacheForTests,
} from "../../../lib/firmware/catalog-client";
import { EVENT_NAMES } from "../../../lib/generated/events";

export const WEB_SERIAL_FLASH_UNSUPPORTED_RESULT = {
  result: "failed",
  reason: WEB_SERIAL_FLASH_UNSUPPORTED_REASON,
} satisfies FirmwareInstallResult;

export const WEB_BOOTLOADER_INSTALLATION_UNSUPPORTED_RESULT = {
  result: "platform_unsupported",
  reason: WEB_BOOTLOADER_INSTALLATION_UNSUPPORTED_REASON,
} satisfies BootloaderInstallationResult;

const STM32_DFU_VID = 0x0483;
const STM32_DFU_PID = 0xdf11;
const webDfuDeviceHandles = new Map<string, WebUsbDevice>();

type WebUsbDevice = {
  vendorId: number;
  productId: number;
  serialNumber?: string;
  manufacturerName?: string;
  productName?: string;
};

type WebUsb = {
  getDevices(): Promise<WebUsbDevice[]>;
  requestDevice(options: { filters: Array<{ vendorId?: number; productId?: number }> }): Promise<WebUsbDevice>;
};

type WebUsbNavigator = Navigator & { usb?: WebUsb };

export async function tryHandleFirmwareCommand(cmd: string, args?: WebCommandArgs): Promise<WebCommandResult> {
  switch (cmd) {
    case "firmware_session_status":
      return handled(webBackendRuntime.firmwareSessionStatus);
    case "firmware_session_cancel":
      webBackendRuntime.firmwareInstallAbort?.abort();
      if (webBackendRuntime.firmwareSessionStatus.kind === "firmware_install_update") {
        webBackendRuntime.firmwareSessionStatus = { kind: "cancelling", path: "firmware_install_update" };
      } else if (webBackendRuntime.firmwareSessionStatus.kind === "bootloader_installation") {
        webBackendRuntime.firmwareSessionStatus = { kind: "cancelling", path: "bootloader_installation" };
      }
      return handled(undefined);
    case "firmware_session_clear_completed":
      if (webBackendRuntime.firmwareSessionStatus.kind === "completed") {
        webBackendRuntime.firmwareSessionStatus = IDLE_WEB_FIRMWARE_STATUS;
      }
      return handled(undefined);
    case "firmware_list_dfu_devices":
      return handled(await webDfuDevices());
    case "firmware_install_update_preflight": {
      const availablePorts = await webFirmwarePorts();
      return handled({
        vehicle_connected: false,
        param_count: 0,
        has_params_to_backup: false,
        available_ports: availablePorts,
        session_ready: isWebSerialGrantAvailable() && isFirmwareSessionReady(webBackendRuntime.firmwareSessionStatus),
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
    case "firmware_reboot_to_bootloader":
      return handled(await firmwareRebootToBootloader(args));
    case "firmware_detect_bootloader_board":
      return handled(await firmwareDetectBootloaderBoard(args));
    case "firmware_install_update":
      return handled(await firmwareInstallUpdate(args));
    case "firmware_bootloader_installation":
      return handled(await firmwareBootloaderInstallation(args));
    default:
      return WEB_COMMAND_UNHANDLED;
  }
}

export function isFirmwareSessionReady(status: FirmwareSessionStatus): boolean {
  return status.kind === "idle" || status.kind === "completed";
}

export function resetWebFirmwareCatalogCacheForTests(): void {
  resetFirmwareCatalogCacheForTests();
}

export function setFirmwareInstallPhase(phase: "probing" | "erasing" | "programming" | "verifying" | "rebooting"): void {
  webBackendRuntime.firmwareSessionStatus = { kind: "firmware_install_update", phase };
}

export function setBootloaderInstallationPhase(phase: "detecting" | "downloading" | "erasing" | "verifying" | "manifesting_or_resetting"): void {
  webBackendRuntime.firmwareSessionStatus = { kind: "bootloader_installation", phase };
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

export function completeBootloaderInstallation(result: BootloaderInstallationResult): void {
  const outcome = result.result === "driver_guidance"
    ? { result: "unsupported_bootloader_installation_path" as const, guidance: result.guidance }
    : result.result === "platform_unsupported"
      ? { result: "unsupported_bootloader_installation_path" as const, guidance: result.reason ?? BOOTLOADER_INSTALLATION_WEB_UNSUPPORTED_GUIDANCE }
      : result;
  webBackendRuntime.firmwareSessionStatus = {
    kind: "completed",
    outcome: {
      path: "bootloader_installation",
      outcome,
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

export function webBootloaderPhaseFromProgress(phase: string): "detecting" | "downloading" | "erasing" | "verifying" | "manifesting_or_resetting" | null {
  if (phase === "detecting" || phase === "downloading" || phase === "erasing" || phase === "verifying" || phase === "manifesting_or_resetting") {
    return phase;
  }
  return null;
}

export function emitWebFirmwareProgress(phase: string, written: number, total: number): void {
  const mappedPhase = webFirmwarePhaseFromProgress(phase);
  if (mappedPhase) {
    setFirmwareInstallPhase(mappedPhase);
  } else {
    const mappedBootloaderPhase = webBootloaderPhaseFromProgress(phase);
    if (mappedBootloaderPhase) {
      setBootloaderInstallationPhase(mappedBootloaderPhase);
    }
  }
  const progress = {
    phase_label: phase,
    bytes_written: written,
    bytes_total: total,
    pct: total > 0 ? (written / total) * 100 : 0,
  } satisfies FirmwareProgress;
  emitWebEvent(EVENT_NAMES.FIRMWARE_PROGRESS, progress);
}

export async function webFirmwarePorts(): Promise<PortInfo[]> {
  return isWebSerialGrantAvailable() ? await listGrantedWebSerialPorts() : [];
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

async function resolveWebBootloaderSource(source: BootloaderInstallationSource, signal: AbortSignal): Promise<BootloaderInstallationSource> {
  if (source.kind === "local_bin_bytes" || source.kind === "local_apj_bytes") {
    return source;
  }

  const boardTarget = source.board_target.trim();
  if (boardTarget.length === 0 || boardTarget.includes("/") || boardTarget.includes("\\")) {
    throw new Error("official bootloader target is missing or invalid");
  }

  return {
    kind: "local_bin_bytes",
    data: Array.from(await fetchBytes(ardupilotFirmwareUrl(`Tools/Bootloaders/${boardTarget}_bl.bin`), "official bootloader artifact", signal)),
  };
}

function browserWebUsb(): WebUsb | null {
  if (typeof navigator === "undefined") {
    return null;
  }
  return (navigator as WebUsbNavigator).usb ?? null;
}

function webDfuUniqueId(device: WebUsbDevice, fallbackIndex: number): string {
  const serial = device.serialNumber?.trim() || device.productName?.trim() || `index-${fallbackIndex}`;
  return `webusb:${device.vendorId.toString(16).padStart(4, "0")}:${device.productId.toString(16).padStart(4, "0")}:${serial}`;
}

function webDfuDeviceInfo(device: WebUsbDevice, fallbackIndex: number): DfuDeviceInfo {
  return {
    vid: device.vendorId,
    pid: device.productId,
    unique_id: webDfuUniqueId(device, fallbackIndex),
    serial_number: device.serialNumber ?? null,
    manufacturer: device.manufacturerName ?? null,
    product: device.productName ?? null,
  };
}

function isStm32DfuWebUsbDevice(device: WebUsbDevice): boolean {
  return device.vendorId === STM32_DFU_VID && device.productId === STM32_DFU_PID;
}

async function webDfuDevices(): Promise<DfuScanResult> {
  const usb = browserWebUsb();
  if (!usb) {
    return {
      kind: "unsupported",
      reason: WEB_BOOTLOADER_INSTALLATION_UNSUPPORTED_REASON,
    };
  }

  const devices = await usb.getDevices();
  if (!devices.some(isStm32DfuWebUsbDevice)) {
    try {
      devices.push(await usb.requestDevice({ filters: [{ vendorId: STM32_DFU_VID, productId: STM32_DFU_PID }] }));
    } catch (error) {
      if (!isWebUsbChooserDismissal(error)) {
        throw error;
      }
    }
  }

  webDfuDeviceHandles.clear();
  const infos = devices
    .filter(isStm32DfuWebUsbDevice)
    .map((device, index) => {
      const info = webDfuDeviceInfo(device, index);
      webDfuDeviceHandles.set(info.unique_id, device);
      return info;
    });

  return { kind: "available", devices: infos };
}

function isWebUsbChooserDismissal(error: unknown): boolean {
  return typeof DOMException !== "undefined" && error instanceof DOMException && (error.name === "NotFoundError" || error.name === "SecurityError");
}

async function resolveWebDfuDeviceHandle(device: DfuDeviceInfo): Promise<WebUsbDevice | null> {
  const cached = webDfuDeviceHandles.get(device.unique_id);
  if (cached) {
    return cached;
  }

  const scan = await webDfuDevices();
  if (scan.kind === "unsupported") {
    return null;
  }
  return webDfuDeviceHandles.get(device.unique_id) ?? null;
}

async function firmwareCatalogTargets(): Promise<CatalogTargetSummary[]> {
  return firmwareCatalogTargetsFromRemote();
}

async function firmwareBootloaderCatalogTargets(): Promise<CatalogTargetSummary[]> {
  return firmwareBootloaderCatalogTargetsFromRemote();
}

async function firmwareCatalogEntries(args?: WebCommandArgs): Promise<CatalogEntry[]> {
  const boardId = Number(args?.boardId ?? 0);
  if (!Number.isFinite(boardId) || boardId <= 0) {
    throw new Error("firmware catalog boardId is required");
  }

  const platform = typeof args?.platform === "string" && args.platform.trim().length > 0
    ? args.platform.trim()
    : null;
  return firmwareCatalogEntriesFromRemote(boardId, platform);
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

function selectedPortHasActiveWebSerialLink(activeLinkTarget: WebActiveLinkTarget | null, selectedPort: string): boolean {
  return activeLinkTarget?.kind === "web_serial" && activeLinkTarget.port_id === selectedPort;
}

function webFirmwareBootloaderStatus(
  selectedPort: string,
  activeLinkTarget: WebActiveLinkTarget | null,
): FirmwareInstallBootloaderStatus {
  if (selectedPortHasActiveWebSerialLink(activeLinkTarget, selectedPort)) {
    return { kind: "not_in_bootloader", can_reboot: true };
  }

  return { kind: "unknown" };
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
    bootloader_status: readinessRequest
      ? webFirmwareBootloaderStatus(readinessRequest.port, webBackendRuntime.activeLinkTarget)
      : { kind: "unknown" },
  };
}

async function firmwareRebootToBootloader(args?: WebCommandArgs): Promise<FirmwareRebootToBootloaderResult> {
  const port = String(args?.port ?? "").trim();
  if (port.length === 0) {
    return {
      result: "unsupported",
      reason: "Choose the active WebSerial MAVLink port before requesting bootloader reboot.",
    };
  }

  if (!selectedPortHasActiveWebSerialLink(webBackendRuntime.activeLinkTarget, port)) {
    return {
      result: "unsupported",
      reason: [
        "Browser bootloader reboot is only available for the active WebSerial MAVLink link on the selected port.",
        "Connect MAVLink to this port first, or enter bootloader manually and grant/select the bootloader WebSerial port.",
      ].join(" "),
    };
  }

  try {
    await wasmRebootToBootloader();
  } catch (error) {
    return {
      result: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }

  await disconnectAfterWebBootloaderReboot();
  return { result: "requested" };
}

async function disconnectAfterWebBootloaderReboot(): Promise<void> {
  await resetActiveConnection().catch(() => undefined);
  if (webBackendRuntime.runtimeLoaded) {
    await wasmDisconnectLink().catch(() => undefined);
  }
}

async function firmwareDetectBootloaderBoard(args?: WebCommandArgs): Promise<FirmwareBootloaderBoardInfo> {
  if (!isWebSerialGrantAvailable()) {
    throw new Error(WEB_SERIAL_FLASH_UNSUPPORTED_REASON);
  }

  const port = String(args?.port ?? "");
  if (port.trim().length === 0) {
    throw new Error("serial port not selected");
  }
  if (selectedPortHasActiveWebSerialLink(webBackendRuntime.activeLinkTarget, port)) {
    throw new Error("selected serial port has an active MAVLink connection; reboot to bootloader before autodetecting the board");
  }

  const abort = new AbortController();
  let adapter: { close(): Promise<void> } | null = null;
  try {
    adapter = await openWebSerialPort(port, 115200, abort.signal);
    return await wasmWebSerialDetectBootloaderBoard({
      portName: port,
      serialAdapter: adapter,
      isCancelled: () => abort.signal.aborted,
    });
  } finally {
    await adapter?.close().catch(() => undefined);
  }
}

async function firmwareInstallUpdate(args?: WebCommandArgs): Promise<FirmwareInstallResult> {
  if (!isWebSerialGrantAvailable()) {
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
  if (selectedPortHasActiveWebSerialLink(webBackendRuntime.activeLinkTarget, port)) {
    throw new Error("selected serial port has an active MAVLink connection; reboot to bootloader before starting install");
  }

  await resetActiveConnection();
  const abort = new AbortController();
  webBackendRuntime.firmwareInstallAbort = abort;
  setFirmwareInstallPhase("probing");
  let adapter: { close(): Promise<void> } | null = null;

  try {
    const resolvedSource = await resolveWebFirmwareSource(source, abort.signal);
    adapter = await openWebSerialPort(port, Number(request?.baud ?? 115200), abort.signal);
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

async function firmwareBootloaderInstallation(args?: WebCommandArgs): Promise<BootloaderInstallationResult> {
  if (!browserWebUsb()) {
    return WEB_BOOTLOADER_INSTALLATION_UNSUPPORTED_RESULT;
  }
  if (!isFirmwareSessionReady(webBackendRuntime.firmwareSessionStatus)) {
    throw new Error("firmware session already active: firmware_bootloader_installation");
  }

  const request = args?.request as {
    device?: DfuDeviceInfo;
    source?: BootloaderInstallationSource;
  } | undefined;
  const device = request?.device;
  const source = request?.source;
  if (!device) {
    throw new Error("DFU device missing");
  }
  if (!source) {
    throw new Error("bootloader source missing");
  }

  const usbDevice = await resolveWebDfuDeviceHandle(device);
  if (!usbDevice) {
    return {
      result: "failed",
      reason: "selected WebUSB DFU device is no longer available; scan DFU devices again",
    };
  }

  const abort = new AbortController();
  webBackendRuntime.firmwareInstallAbort = abort;
  setBootloaderInstallationPhase("detecting");

  try {
    const resolvedSource = await resolveWebBootloaderSource(source, abort.signal);
    const result = await wasmWebUsbBootloaderInstallation({
      usbDevice,
      deviceInfo: device,
      source: resolvedSource,
      onProgress: emitWebFirmwareProgress,
      isCancelled: () => abort.signal.aborted,
    });
    completeBootloaderInstallation(result);
    return result;
  } catch (error) {
    if (abort.signal.aborted) {
      const result = { result: "cancelled" } satisfies BootloaderInstallationResult;
      completeBootloaderInstallation(result);
      return result;
    }
    const reason = error instanceof Error ? error.message : String(error);
    const result = { result: "failed", reason } satisfies BootloaderInstallationResult;
    completeBootloaderInstallation(result);
    return result;
  } finally {
    webBackendRuntime.firmwareInstallAbort = null;
  }
}
