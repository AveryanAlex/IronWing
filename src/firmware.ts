import { listen, type UnlistenFn } from "@platform/event";
import { EVENT_NAMES } from "./lib/generated/events";
import type * as Generated from "./lib/generated/ironwing";
import { typedInvoke } from "./lib/ipc/client";

export type FirmwareInstallUpdatePhase = Generated.SerialFlashPhase;
export type BootloaderInstallationPhase = Generated.DfuRecoveryPhase;

export type FirmwareInstallUpdateOutcome = Generated.SerialFlashOutcome;
export type BootloaderInstallationOutcome = Generated.DfuRecoveryOutcome;
export type FirmwareSessionPath = Generated.FirmwareSessionPath;
export type FirmwareOutcome = Generated.FirmwareOutcome;
export type FirmwareSessionStatus = Generated.FirmwareSessionStatus;

export type FirmwareProgress = Omit<Generated.FirmwareProgress, "bytes_written" | "bytes_total" | "pct"> & {
  bytes_written: number;
  bytes_total: number;
  pct: number;
};

export type PortInfo = Generated.PortInfo;
export type DfuDeviceInfo = Generated.DfuDeviceInfo;
export type DfuScanResult = Exclude<Generated.DfuScanResult, { kind: "unsupported" }> | {
  kind: "unsupported";
  reason?: string;
};

export type FirmwareInstallPreflightInfo = Omit<Generated.SerialPreflightInfo, "available_ports"> & {
  available_ports: PortInfo[];
};

export type FirmwareInstallSource = Generated.SerialFlashSource;
export type FirmwareInstallOptions = Generated.SerialFlashOptions;
export type FirmwareInstallUpdateSource = Generated.SerialFlashSource;
export type FirmwareInstallUpdateOptions = Generated.SerialFlashOptions;

export type FirmwareInstallReadinessRequest = Omit<Generated.SerialReadinessRequest, "options"> & {
  options?: FirmwareInstallOptions | null;
};
export type FirmwareInstallReadinessBlockedReason = Generated.SerialReadinessBlockedReason;
export type FirmwareInstallReadiness = Generated.SerialReadiness;
export type FirmwareInstallBootloaderStatus = Generated.FirmwareInstallBootloaderStatus;
export type FirmwareInstallReadinessResponse = Generated.SerialReadinessResponse;
export type FirmwareRebootToBootloaderResult = Generated.FirmwareRebootToBootloaderResult;
export type FirmwareBootloaderBoardInfo = Generated.FirmwareBootloaderBoardInfo;

export type BootloaderInstallationSource = Generated.DfuRecoverySource;
export type FirmwareInstallResult = Generated.SerialFlowResult;
export type FirmwareInstallUpdateResult = Generated.SerialFlowResult;
export type BootloaderInstallationResult = Exclude<Generated.DfuRecoveryResult, { result: "platform_unsupported" }> | {
  result: "platform_unsupported";
  reason?: string;
};

export type CatalogEntry = Omit<Generated.CatalogEntry, "image_size"> & {
  image_size: number;
};
export type CatalogTargetSummary = Generated.CatalogTargetSummary;

export async function firmwareInstallPreflight(): Promise<FirmwareInstallPreflightInfo> {
  return typedInvoke("firmware_install_update_preflight");
}

export async function firmwareInstallUpdate(
  port: string,
  baud: number,
  source: FirmwareInstallSource,
  options?: FirmwareInstallOptions,
): Promise<FirmwareInstallResult> {
  return typedInvoke("firmware_install_update", {
    request: { port, baud, source, options: options ?? null },
  });
}

export async function firmwareInstallReadiness(
  request: FirmwareInstallReadinessRequest,
): Promise<FirmwareInstallReadinessResponse> {
  return typedInvoke("firmware_install_update_readiness", { request });
}

export async function firmwareRebootToBootloader(port: string): Promise<FirmwareRebootToBootloaderResult> {
  return typedInvoke("firmware_reboot_to_bootloader", { port });
}

export async function firmwareDetectBootloaderBoard(port: string): Promise<FirmwareBootloaderBoardInfo> {
  return typedInvoke("firmware_detect_bootloader_board", { port });
}

export async function firmwareBootloaderInstallation(
  device: DfuDeviceInfo,
  source: BootloaderInstallationSource,
): Promise<BootloaderInstallationResult> {
  return typedInvoke("firmware_bootloader_installation", {
    request: { device, source },
  });
}

export async function firmwareSessionStatus(): Promise<FirmwareSessionStatus> {
  return typedInvoke("firmware_session_status");
}

export async function firmwareSessionCancel(): Promise<void> {
  return typedInvoke("firmware_session_cancel");
}

export async function firmwareSessionClearCompleted(): Promise<void> {
  return typedInvoke("firmware_session_clear_completed");
}

export async function firmwareListDfuDevices(): Promise<DfuScanResult> {
  return typedInvoke("firmware_list_dfu_devices");
}

export async function subscribeFirmwareProgress(
  cb: (progress: FirmwareProgress) => void,
): Promise<UnlistenFn> {
  return listen<FirmwareProgress>(EVENT_NAMES.FIRMWARE_PROGRESS, (event) => cb(event.payload));
}
