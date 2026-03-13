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
  | "verifying";

export type SerialFlashOutcome =
  | { result: "verified" }
  | { result: "flashed_but_unverified" }
  | { result: "failed"; reason: string }
  | { result: "recovery_needed"; reason: string };

export type DfuRecoveryOutcome =
  | { result: "verified" }
  | { result: "failed"; reason: string }
  | { result: "unsupported_recovery_path"; guidance: string };

export type FirmwareOutcome =
  | { path: "serial_primary"; outcome: SerialFlashOutcome }
  | { path: "dfu_recovery"; outcome: DfuRecoveryOutcome };

export type FirmwareSessionStatus =
  | { kind: "idle" }
  | { kind: "serial_primary"; phase: SerialFlashPhase }
  | { kind: "dfu_recovery"; phase: DfuRecoveryPhase }
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

export type DfuRecoverySource =
  | { kind: "catalog_url"; url: string }
  | { kind: "local_apj_bytes"; data: number[] }
  | { kind: "local_bin_bytes"; data: number[] };

export type SerialFlowResult =
  | { result: "verified"; board_id: number; bootloader_rev: number; port: string }
  | { result: "flashed_but_unverified"; board_id: number; bootloader_rev: number; port: string }
  | { result: "reconnect_verified"; board_id: number; bootloader_rev: number; flash_verified: boolean }
  | { result: "reconnect_failed"; board_id: number; bootloader_rev: number; flash_verified: boolean; reconnect_error: string }
  | { result: "failed"; reason: string }
  | { result: "board_detection_failed"; reason: string }
  | { result: "extf_capacity_insufficient"; reason: string };

// ── DFU recovery result ──

export type DfuRecoveryResult =
  | { result: "verified" }
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

// ── DFU source inspection ──

export type DfuSourceCheck = {
  has_extf: boolean;
};

export async function firmwareCheckDfuSource(url: string): Promise<DfuSourceCheck> {
  return invoke<DfuSourceCheck>("firmware_check_dfu_source", { url });
}

// ── Serial primary commands ──

export async function firmwareSerialPreflight(): Promise<SerialPreflightInfo> {
  return invoke<SerialPreflightInfo>("firmware_serial_preflight");
}

export async function firmwareFlashSerial(
  port: string,
  baud: number,
  source: SerialFlashSource,
): Promise<SerialFlowResult> {
  return invoke<SerialFlowResult>("firmware_flash_serial", {
    request: { port, baud, source },
  });
}

export async function firmwareRebootToBootloader(): Promise<void> {
  return invoke<void>("firmware_reboot_to_bootloader");
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
