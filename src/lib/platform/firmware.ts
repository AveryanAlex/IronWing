import {
  firmwareBootloaderInstallation,
  firmwareDetectBootloaderBoard,
  firmwareInstallPreflight,
  firmwareInstallReadiness,
  firmwareInstallUpdate,
  firmwareListDfuDevices,
  firmwareRebootToBootloader,
  firmwareSessionCancel,
  firmwareSessionClearCompleted,
  firmwareSessionStatus,
  subscribeFirmwareProgress,
  type BootloaderInstallationResult,
  type BootloaderInstallationSource,
  type CatalogEntry,
  type CatalogTargetSummary,
  type DfuDeviceInfo,
  type DfuScanResult,
  type FirmwareBootloaderBoardInfo,
  type FirmwareInstallOptions,
  type FirmwareInstallPreflightInfo,
  type FirmwareInstallReadinessRequest,
  type FirmwareInstallReadinessResponse,
  type FirmwareInstallResult,
  type FirmwareInstallSource,
  type FirmwareProgress,
  type FirmwareRebootToBootloaderResult,
  type FirmwareSessionStatus,
  type FirmwareSessionPath,
} from "../../firmware";
import { formatUnknownError } from "../error-format";
import {
  firmwareBootloaderCatalogTargetsFromRemote,
  firmwareCatalogEntriesFromRemote,
  firmwareCatalogTargetsFromRemote,
} from "../firmware/catalog-client";
import { bootloaderInstallationPlatformUnsupportedGuidance } from "../firmware/platform-guidance";

export type FirmwareService = {
  sessionStatus(): Promise<FirmwareSessionStatus>;
  sessionCancel(): Promise<void>;
  sessionClearCompleted(): Promise<void>;
  installPreflight(): Promise<FirmwareInstallPreflightInfo>;
  listDfuDevices(): Promise<DfuScanResult>;
  catalogTargets(): Promise<CatalogTargetSummary[]>;
  bootloaderCatalogTargets(): Promise<CatalogTargetSummary[]>;
  catalogEntries(boardId: number, platform?: string): Promise<CatalogEntry[]>;
  installReadiness(request: FirmwareInstallReadinessRequest): Promise<FirmwareInstallReadinessResponse>;
  rebootToBootloader(port: string): Promise<FirmwareRebootToBootloaderResult>;
  detectBootloaderBoard(port: string): Promise<FirmwareBootloaderBoardInfo>;
  startFirmwareInstallUpdate(
    port: string,
    baud: number,
    source: FirmwareInstallSource,
    options?: FirmwareInstallOptions,
  ): Promise<FirmwareInstallResult>;
  startBootloaderInstallation(device: DfuDeviceInfo, source: BootloaderInstallationSource): Promise<BootloaderInstallationResult>;
  subscribeProgress(cb: (progress: FirmwareProgress) => void): Promise<() => void>;
  formatError(error: unknown): string;
};

export function createFirmwareService(): FirmwareService {
  return {
    sessionStatus: firmwareSessionStatus,
    sessionCancel: firmwareSessionCancel,
    sessionClearCompleted: firmwareSessionClearCompleted,
    installPreflight: firmwareInstallPreflight,
    listDfuDevices: firmwareListDfuDevices,
    catalogTargets: firmwareCatalogTargetsFromRemote,
    bootloaderCatalogTargets: firmwareBootloaderCatalogTargetsFromRemote,
    catalogEntries: firmwareCatalogEntriesFromRemote,
    installReadiness: firmwareInstallReadiness,
    rebootToBootloader: firmwareRebootToBootloader,
    detectBootloaderBoard: firmwareDetectBootloaderBoard,
    startFirmwareInstallUpdate: firmwareInstallUpdate,
    startBootloaderInstallation: firmwareBootloaderInstallation,
    subscribeProgress: subscribeFirmwareProgress,
    formatError: formatUnknownError,
  };
}

export function isFirmwareSessionActive(status: FirmwareSessionStatus): boolean {
  return status.kind === "firmware_install_update" || status.kind === "bootloader_installation" || status.kind === "cancelling";
}

export function deriveFirmwareSessionPath(status: FirmwareSessionStatus): FirmwareSessionPath | null {
  if (status.kind === "firmware_install_update") {
    return "firmware_install_update";
  }

  if (status.kind === "bootloader_installation") {
    return "bootloader_installation";
  }

  if (status.kind === "cancelling") {
    return status.path;
  }

  if (status.kind === "completed") {
    return status.outcome.path;
  }

  return null;
}

export function deriveFirmwareSessionPhase(status: FirmwareSessionStatus): string | null {
  if (status.kind === "firmware_install_update" || status.kind === "bootloader_installation") {
    return status.phase;
  }

  if (status.kind === "cancelling") {
    return "cancelling";
  }

  if (status.kind === "completed") {
    return status.outcome.outcome.result;
  }

  return null;
}

export function buildFirmwareInstallFailureStatus(error: unknown): FirmwareSessionStatus {
  return {
    kind: "completed",
    outcome: {
      path: "firmware_install_update",
      outcome: {
        result: "failed",
        reason: formatUnknownError(error),
      },
    },
  };
}

export function buildBootloaderInstallationFailureStatus(error: unknown): FirmwareSessionStatus {
  return {
    kind: "completed",
    outcome: {
      path: "bootloader_installation",
      outcome: {
        result: "failed",
        reason: formatUnknownError(error),
      },
    },
  };
}

export function firmwareInstallResultToStatus(result: FirmwareInstallResult): FirmwareSessionStatus {
  switch (result.result) {
    case "cancelled":
      return {
        kind: "completed",
        outcome: {
          path: "firmware_install_update",
          outcome: { result: "cancelled" },
        },
      };
    case "verified":
    case "flashed_but_unverified":
    case "reconnect_verified":
    case "reconnect_failed":
    case "failed":
    case "board_detection_failed":
    case "extf_capacity_insufficient":
      return {
        kind: "completed",
        outcome: {
          path: "firmware_install_update",
          outcome: result,
        },
      };
  }
}

export function bootloaderInstallationResultToStatus(result: BootloaderInstallationResult): FirmwareSessionStatus {
  switch (result.result) {
    case "verified":
    case "cancelled":
    case "reset_unconfirmed":
    case "failed":
      return {
        kind: "completed",
        outcome: {
          path: "bootloader_installation",
          outcome: result,
        },
      };
    case "driver_guidance":
      return {
        kind: "completed",
        outcome: {
          path: "bootloader_installation",
          outcome: {
            result: "unsupported_bootloader_installation_path",
            guidance: result.guidance,
          },
        },
      };
    case "platform_unsupported":
      return {
        kind: "completed",
        outcome: {
          path: "bootloader_installation",
          outcome: {
            result: "unsupported_bootloader_installation_path",
            guidance: bootloaderInstallationPlatformUnsupportedGuidance(),
          },
        },
      };
  }
}

export function computeFirmwareInstallReadinessToken(request: FirmwareInstallReadinessRequest): string {
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
