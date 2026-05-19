import { invoke } from "@platform/core";
import { listen, type UnlistenFn } from "@platform/event";

// ── Session status (mirrors Rust FirmwareSessionStatus) ──

export type FirmwareInstallUpdatePhase =
  | "idle"
  | "probing"
  | "erasing"
  | "programming"
  | "verifying"
  | "rebooting";

export type BootloaderInstallationPhase =
  | "idle"
  | "detecting"
  | "downloading"
  | "erasing"
  | "verifying"
  | "manifesting_or_resetting";

type SerialCancelledResult = { result: "cancelled" };
type SerialVerifiedFields = { board_id: number; bootloader_rev: number; port: string };
type SerialReconnectFields = {
  board_id: number;
  bootloader_rev: number;
  flash_verified: boolean;
};
type SerialReconnectFailedFields = SerialReconnectFields & { reconnect_error: string };
type SerialFailureFields = { reason: string };

type FirmwareInstallUpdateOutcomeVerified = { result: "verified" } & SerialVerifiedFields;
type FirmwareInstallUpdateOutcomeFlashedButUnverified = {
  result: "flashed_but_unverified";
} & SerialVerifiedFields;
type FirmwareInstallUpdateOutcomeReconnectVerified = { result: "reconnect_verified" } & SerialReconnectFields;
type FirmwareInstallUpdateOutcomeReconnectFailed = { result: "reconnect_failed" } & SerialReconnectFailedFields;
type FirmwareInstallUpdateOutcomeFailed = { result: "failed" } & SerialFailureFields;
type FirmwareInstallUpdateOutcomeBoardDetectionFailed = { result: "board_detection_failed" } & SerialFailureFields;
type FirmwareInstallUpdateOutcomeExtfCapacityInsufficient = { result: "extf_capacity_insufficient" } & SerialFailureFields;

export type FirmwareInstallUpdateOutcome =
  | SerialCancelledResult
  | FirmwareInstallUpdateOutcomeVerified
  | FirmwareInstallUpdateOutcomeFlashedButUnverified
  | FirmwareInstallUpdateOutcomeReconnectVerified
  | FirmwareInstallUpdateOutcomeReconnectFailed
  | FirmwareInstallUpdateOutcomeFailed
  | FirmwareInstallUpdateOutcomeBoardDetectionFailed
  | FirmwareInstallUpdateOutcomeExtfCapacityInsufficient;

export type BootloaderInstallationOutcome =
  | { result: "verified" }
  | { result: "cancelled" }
  | { result: "reset_unconfirmed" }
  | { result: "failed"; reason: string }
  | { result: "unsupported_bootloader_installation_path"; guidance: string };

export type FirmwareSessionPath = "firmware_install_update" | "bootloader_installation";

export type FirmwareOutcome =
  | { path: "firmware_install_update"; outcome: FirmwareInstallUpdateOutcome }
  | { path: "bootloader_installation"; outcome: BootloaderInstallationOutcome };

export type FirmwareSessionStatus =
  | { kind: "idle" }
  | { kind: "firmware_install_update"; phase: FirmwareInstallUpdatePhase }
  | { kind: "bootloader_installation"; phase: BootloaderInstallationPhase }
  | { kind: "cancelling"; path: FirmwareSessionPath }
  | { kind: "completed"; outcome: FirmwareOutcome };

// ── Progress (mirrors Rust FirmwareProgress) ──

export type FirmwareProgress = {
  phase_label: string;
  bytes_written: number;
  bytes_total: number;
  pct: number;
};

// ── Port / device inventory ──

export type PortInfo = {
  port_name: string;
  vid: number | null;
  pid: number | null;
  serial_number: string | null;
  manufacturer: string | null;
  product: string | null;
  location: string | null;
};

export type InventoryResult =
  | { kind: "available"; ports: PortInfo[] }
  | { kind: "unsupported" };

export type DfuDeviceInfo = {
  vid: number;
  pid: number;
  unique_id: string;
  serial_number: string | null;
  manufacturer: string | null;
  product: string | null;
};

export type DfuScanResult =
  | { kind: "available"; devices: DfuDeviceInfo[] }
  | { kind: "unsupported" };

// ── Preflight (firmware install/update path) ──

export type FirmwareInstallPreflightInfo = {
  vehicle_connected: boolean;
  param_count: number;
  has_params_to_backup: boolean;
  available_ports: PortInfo[];
  detected_board_id: number | null;
  session_ready: boolean;
  session_status: FirmwareSessionStatus;
};

// ── Firmware install/update source / result ──

export type FirmwareInstallSource =
  | { kind: "catalog_url"; url: string }
  | { kind: "local_apj_bytes"; data: number[] };

export type FirmwareInstallOptions = {
  full_chip_erase: boolean;
};

export type FirmwareInstallReadinessRequest = {
  port: string;
  source: FirmwareInstallSource;
  options?: FirmwareInstallOptions;
};

export type FirmwareInstallReadinessBlockedReason =
  | "session_busy"
  | "port_unselected"
  | "port_unavailable"
  | "source_missing";

export type FirmwareInstallReadiness =
  | { kind: "advisory" }
  | { kind: "blocked"; reason: FirmwareInstallReadinessBlockedReason };

export type FirmwareInstallReadinessTargetHint = {
  detected_board_id: number | null;
};

export type FirmwareInstallBootloaderTransition =
  | { kind: "auto_reboot_supported" }
  | { kind: "already_in_bootloader" }
  | { kind: "auto_reboot_attemptable" }
  | { kind: "manual_bootloader_entry_required" }
  | { kind: "target_mismatch" };

export type FirmwareInstallReadinessResponse = {
  request_token: string;
  session_status: FirmwareSessionStatus;
  readiness: FirmwareInstallReadiness;
  target_hint: FirmwareInstallReadinessTargetHint | null;
  validation_pending: boolean;
  bootloader_transition: FirmwareInstallBootloaderTransition;
};

export type BootloaderInstallationSource =
  | { kind: "official_bootloader"; board_target: string }
  | { kind: "local_apj_bytes"; data: number[] }
  | { kind: "local_bin_bytes"; data: number[] };

export type FirmwareInstallResult =
  | SerialCancelledResult
  | ({ result: "verified" } & SerialVerifiedFields)
  | ({ result: "flashed_but_unverified" } & SerialVerifiedFields)
  | ({ result: "reconnect_verified" } & SerialReconnectFields)
  | ({ result: "reconnect_failed" } & SerialReconnectFailedFields)
  | ({ result: "failed" } & SerialFailureFields)
  | ({ result: "board_detection_failed" } & SerialFailureFields)
  | ({ result: "extf_capacity_insufficient" } & SerialFailureFields);

// ── Bootloader installation result ──

export type BootloaderInstallationResult =
  | { result: "verified" }
  | { result: "cancelled" }
  | { result: "reset_unconfirmed" }
  | { result: "failed"; reason: string }
  | { result: "driver_guidance"; guidance: string }
  | { result: "platform_unsupported" };

// ── Catalog ──

export type CatalogEntry = {
  board_id: number;
  platform: string;
  vehicle_type: string;
  version: string;
  version_type: string;
  format: string;
  url: string;
  image_size: number;
  latest: boolean;
  git_sha: string;
  brand_name: string | null;
  manufacturer: string | null;
};

export type CatalogTargetSummary = {
  board_id: number;
  platform: string;
  brand_name: string | null;
  manufacturer: string | null;
  vehicle_types: string[];
  latest_version: string | null;
};

export async function firmwareCatalogEntries(
  boardId: number,
  platform?: string,
): Promise<CatalogEntry[]> {
  return invoke<CatalogEntry[]>("firmware_catalog_entries", { boardId, platform: platform ?? null });
}

export async function firmwareCatalogTargets(): Promise<CatalogTargetSummary[]> {
  return invoke<CatalogTargetSummary[]>("firmware_catalog_targets");
}

export async function firmwareBootloaderCatalogTargets(): Promise<CatalogTargetSummary[]> {
  return invoke<CatalogTargetSummary[]>("firmware_bootloader_catalog_targets");
}

function isUnsupportedFirmwareCommandError(error: unknown, command: string): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return message.includes(command)
    && (normalized.includes("unmocked command")
      || normalized.includes("unknown command")
      || normalized.includes("command not found")
      || normalized.includes("not found"));
}

// ── Firmware install/update commands ──

export async function firmwareInstallPreflight(): Promise<FirmwareInstallPreflightInfo> {
  return invoke<FirmwareInstallPreflightInfo>("firmware_install_update_preflight");
}

export async function firmwareInstallUpdate(
  port: string,
  baud: number,
  source: FirmwareInstallSource,
  options?: FirmwareInstallOptions,
): Promise<FirmwareInstallResult> {
  return invoke<FirmwareInstallResult>("firmware_install_update", {
    request: { port, baud, source, options: options ?? null },
  });
}

export async function firmwareInstallReadiness(
  request: FirmwareInstallReadinessRequest,
): Promise<FirmwareInstallReadinessResponse> {
  return invoke<FirmwareInstallReadinessResponse>("firmware_install_update_readiness", { request });
}

// ── Bootloader installation commands ──

export async function firmwareBootloaderInstallation(
  device: DfuDeviceInfo,
  source: BootloaderInstallationSource,
): Promise<BootloaderInstallationResult> {
  return invoke<BootloaderInstallationResult>("firmware_bootloader_installation", {
    request: { device, source },
  });
}

// ── Shared session commands ──

export async function firmwareSessionStatus(): Promise<FirmwareSessionStatus> {
  return invoke<FirmwareSessionStatus>("firmware_session_status");
}

export async function firmwareSessionCancel(): Promise<void> {
  return invoke<void>("firmware_session_cancel");
}

export async function firmwareSessionClearCompleted(): Promise<void> {
  return invoke<void>("firmware_session_clear_completed");
}

// ── Port / device inventory commands ──

export async function firmwareListPorts(): Promise<InventoryResult> {
  return invoke<InventoryResult>("firmware_list_ports");
}

export async function firmwareRequestSerialPort(): Promise<PortInfo | null> {
  try {
    return await invoke<PortInfo | null>("firmware_request_serial_port");
  } catch (error) {
    if (isUnsupportedFirmwareCommandError(error, "firmware_request_serial_port")) {
      return null;
    }
    throw error;
  }
}

export async function firmwareListDfuDevices(): Promise<DfuScanResult> {
  return invoke<DfuScanResult>("firmware_list_dfu_devices");
}

// ── Event subscriptions ──

export async function subscribeFirmwareProgress(
  cb: (progress: FirmwareProgress) => void,
): Promise<UnlistenFn> {
  return listen<FirmwareProgress>("firmware://progress", (event) => cb(event.payload));
}
