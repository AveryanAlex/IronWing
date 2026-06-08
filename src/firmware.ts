import { EVENT_NAMES } from "./lib/generated/events";
import type * as Generated from "./lib/generated/ironwing";
import type * as GeneratedJson from "./lib/generated/ironwing-json";
import { typedInvoke, typedListen, type UnlistenFn } from "./lib/ipc/client";

export type FirmwareInstallUpdatePhase = Generated.SerialFlashPhase;
export type BootloaderInstallationPhase = Generated.DfuRecoveryPhase;

export type FirmwareInstallUpdateOutcome = Generated.SerialFlashOutcome;
export type BootloaderInstallationOutcome = Generated.DfuRecoveryOutcome;
export type FirmwareSessionPath = Generated.FirmwareSessionPath;
export type FirmwareOutcome = GeneratedJson.FirmwareOutcome;
export type FirmwareSessionStatus = GeneratedJson.FirmwareSessionStatus;

export type FirmwareProgress = GeneratedJson.FirmwareProgress;

export type PortInfo = GeneratedJson.PortInfo;
export type DfuDeviceInfo = GeneratedJson.DfuDeviceInfo;
export type DfuScanResult = Exclude<GeneratedJson.DfuScanResult, { kind: "unsupported" }> | {
  kind: "unsupported";
  reason?: string;
};

export type FirmwareInstallPreflightInfo = Omit<GeneratedJson.SerialPreflightInfo, "available_ports"> & {
  available_ports: PortInfo[];
};

export type FirmwareInstallSource = GeneratedJson.SerialFlashSource;
export type FirmwareInstallOptions = GeneratedJson.SerialFlashOptions;
export type FirmwareInstallUpdateSource = GeneratedJson.SerialFlashSource;
export type FirmwareInstallUpdateOptions = GeneratedJson.SerialFlashOptions;

export type FirmwareInstallReadinessRequest = Omit<GeneratedJson.SerialReadinessRequest, "options"> & {
  options?: FirmwareInstallOptions | null;
};
export type FirmwareInstallReadinessBlockedReason = Generated.SerialReadinessBlockedReason;
export type FirmwareInstallReadiness = Generated.SerialReadiness;
export type FirmwareInstallBootloaderStatus = Generated.FirmwareInstallBootloaderStatus;
export type FirmwareInstallReadinessResponse = GeneratedJson.SerialReadinessResponse;
export type FirmwareRebootToBootloaderResult = GeneratedJson.FirmwareRebootToBootloaderResult;
export type FirmwareBootloaderBoardInfo = GeneratedJson.FirmwareBootloaderBoardInfo;

export type BootloaderInstallationSource = GeneratedJson.DfuRecoverySource;
export type FirmwareInstallResult = GeneratedJson.SerialFlowResult;
export type FirmwareInstallUpdateResult = GeneratedJson.SerialFlowResult;
export type BootloaderInstallationResult = Exclude<GeneratedJson.DfuRecoveryResult, { result: "platform_unsupported" }> | {
  result: "platform_unsupported";
  reason?: string;
};

export type CatalogEntry = GeneratedJson.CatalogEntry;
export type CatalogTargetSummary = GeneratedJson.CatalogTargetSummary;

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
  return typedListen(EVENT_NAMES.FIRMWARE_PROGRESS, (event) => cb(event.payload));
}
