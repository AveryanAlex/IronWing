import { invoke } from "@platform/core";
import { listen, type UnlistenFn } from "@platform/event";

// ── Session status (mirrors Rust FirmwareSessionStatus) ──

export type SerialFlashPhase =
  | "idle"
  | "probing"
  | "erasing"
  | "programming"
  | "verifying"
  | "rebooting";

export type DfuRecoveryPhase =
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

type SerialFlashOutcomeVerified = { result: "verified" } & SerialVerifiedFields;
type SerialFlashOutcomeFlashedButUnverified = {
  result: "flashed_but_unverified";
} & SerialVerifiedFields;
type SerialFlashOutcomeReconnectVerified = { result: "reconnect_verified" } & SerialReconnectFields;
type SerialFlashOutcomeReconnectFailed = { result: "reconnect_failed" } & SerialReconnectFailedFields;
type SerialFlashOutcomeFailed = { result: "failed" } & SerialFailureFields;
type SerialFlashOutcomeBoardDetectionFailed = { result: "board_detection_failed" } & SerialFailureFields;
type SerialFlashOutcomeExtfCapacityInsufficient = { result: "extf_capacity_insufficient" } & SerialFailureFields;

export type SerialFlashOutcome =
  | SerialCancelledResult
  | SerialFlashOutcomeVerified
  | SerialFlashOutcomeFlashedButUnverified
  | SerialFlashOutcomeReconnectVerified
  | SerialFlashOutcomeReconnectFailed
  | SerialFlashOutcomeFailed
  | SerialFlashOutcomeBoardDetectionFailed
  | SerialFlashOutcomeExtfCapacityInsufficient;

export type DfuRecoveryOutcome =
  | { result: "verified" }
  | { result: "cancelled" }
  | { result: "reset_unconfirmed" }
  | { result: "failed"; reason: string }
  | { result: "unsupported_recovery_path"; guidance: string };

export type FirmwareOutcome =
  | { path: "serial_primary"; outcome: SerialFlashOutcome }
  | { path: "dfu_recovery"; outcome: DfuRecoveryOutcome };

export type FirmwareSessionStatus =
  | { kind: "idle" }
  | { kind: "serial_primary"; phase: SerialFlashPhase }
  | { kind: "dfu_recovery"; phase: DfuRecoveryPhase }
  | { kind: "cancelling"; path: "serial_primary" | "dfu_recovery" }
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

// ── Preflight (serial path) ──

export type SerialPreflightInfo = {
  vehicle_connected: boolean;
  param_count: number;
  has_params_to_backup: boolean;
  available_ports: PortInfo[];
  detected_board_id: number | null;
  session_ready: boolean;
  session_status: FirmwareSessionStatus;
};

// ── Serial flash source / result ──

export type SerialFlashSource =
  | { kind: "catalog_url"; url: string }
  | { kind: "local_apj_bytes"; data: number[] };

export type SerialFlashOptions = {
  full_chip_erase: boolean;
};

export type SerialReadinessRequest = {
  port: string;
  source: SerialFlashSource;
  options?: SerialFlashOptions;
};

export type SerialReadinessBlockedReason =
  | "session_busy"
  | "port_unselected"
  | "port_unavailable"
  | "source_missing";

export type SerialReadiness =
  | { kind: "advisory" }
  | { kind: "blocked"; reason: SerialReadinessBlockedReason };

export type SerialReadinessTargetHint = {
  detected_board_id: number | null;
};

export type SerialBootloaderTransition =
  | { kind: "auto_reboot_supported" }
  | { kind: "already_in_bootloader" }
  | { kind: "manual_bootloader_entry_required" }
  | { kind: "target_mismatch" };

export type SerialReadinessResponse = {
  request_token: string;
  session_status: FirmwareSessionStatus;
  readiness: SerialReadiness;
  target_hint: SerialReadinessTargetHint | null;
  validation_pending: boolean;
  bootloader_transition: SerialBootloaderTransition;
};

export type DfuRecoverySource =
  | { kind: "official_bootloader"; board_target: string }
  | { kind: "local_apj_bytes"; data: number[] }
  | { kind: "local_bin_bytes"; data: number[] };

export type SerialFlowResult =
  | SerialCancelledResult
  | ({ result: "verified" } & SerialVerifiedFields)
  | ({ result: "flashed_but_unverified" } & SerialVerifiedFields)
  | ({ result: "reconnect_verified" } & SerialReconnectFields)
  | ({ result: "reconnect_failed" } & SerialReconnectFailedFields)
  | ({ result: "failed" } & SerialFailureFields)
  | ({ result: "board_detection_failed" } & SerialFailureFields)
  | ({ result: "extf_capacity_insufficient" } & SerialFailureFields);

// ── DFU recovery result ──

export type DfuRecoveryResult =
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

export async function firmwareRecoveryCatalogTargets(): Promise<CatalogTargetSummary[]> {
  return invoke<CatalogTargetSummary[]>("firmware_recovery_catalog_targets");
}

// ── Serial primary commands ──

export async function firmwareSerialPreflight(): Promise<SerialPreflightInfo> {
  return invoke<SerialPreflightInfo>("firmware_serial_preflight");
}

export async function firmwareFlashSerial(
  port: string,
  baud: number,
  source: SerialFlashSource,
  options?: SerialFlashOptions,
): Promise<SerialFlowResult> {
  return invoke<SerialFlowResult>("firmware_flash_serial", {
    request: { port, baud, source, options: options ?? null },
  });
}

export async function firmwareSerialReadiness(
  request: SerialReadinessRequest,
): Promise<SerialReadinessResponse> {
  return invoke<SerialReadinessResponse>("firmware_serial_readiness", { request });
}

// ── DFU recovery commands ──

export async function firmwareFlashDfuRecovery(
  device: DfuDeviceInfo,
  source: DfuRecoverySource,
): Promise<DfuRecoveryResult> {
  return invoke<DfuRecoveryResult>("firmware_flash_dfu_recovery", {
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

export async function firmwareListDfuDevices(): Promise<DfuScanResult> {
  return invoke<DfuScanResult>("firmware_list_dfu_devices");
}

// ── Event subscriptions ──

export async function subscribeFirmwareProgress(
  cb: (progress: FirmwareProgress) => void,
): Promise<UnlistenFn> {
  return listen<FirmwareProgress>("firmware://progress", (event) => cb(event.payload));
}
