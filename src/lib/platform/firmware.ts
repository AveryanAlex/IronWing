import {
  firmwareBootloaderCatalogTargets,
  firmwareCatalogEntries,
  firmwareCatalogTargets,
  firmwareBootloaderInstallation,
  firmwareInstallPreflight,
  firmwareInstallReadiness,
  firmwareInstallUpdate,
  firmwareListDfuDevices,
  firmwareListPorts,
  firmwareRequestSerialPort,
  firmwareSessionCancel,
  firmwareSessionClearCompleted,
  firmwareSessionStatus,
  subscribeFirmwareProgress,
  type BootloaderInstallationOutcome,
  type BootloaderInstallationPhase,
  type BootloaderInstallationResult,
  type BootloaderInstallationSource,
  type CatalogEntry,
  type CatalogTargetSummary,
  type DfuDeviceInfo,
  type DfuScanResult,
  type FirmwareInstallBootloaderTransition,
  type FirmwareInstallOptions,
  type FirmwareInstallPreflightInfo,
  type FirmwareInstallReadiness,
  type FirmwareInstallReadinessBlockedReason,
  type FirmwareInstallReadinessRequest,
  type FirmwareInstallReadinessResponse,
  type FirmwareInstallResult,
  type FirmwareInstallSource,
  type FirmwareInstallUpdateOutcome,
  type FirmwareInstallUpdatePhase,
  type FirmwareOutcome,
  type FirmwareProgress,
  type FirmwareSessionStatus,
  type FirmwareSessionPath,
  type InventoryResult,
  type PortInfo,
} from "../../firmware";
import { formatUnknownError } from "../error-format";

const MALFORMED_SESSION_STATUS_MESSAGE = "Firmware session status returned an unexpected payload.";
const MALFORMED_PROGRESS_MESSAGE = "Firmware progress update returned an unexpected payload.";
const MALFORMED_INSTALL_RESULT_MESSAGE = "Firmware install/update returned an unexpected payload.";
const MALFORMED_BOOTLOADER_RESULT_MESSAGE = "Bootloader installation returned an unexpected payload.";
const MALFORMED_READINESS_MESSAGE = "Firmware install/update readiness returned an unexpected payload.";
const MALFORMED_PREFLIGHT_MESSAGE = "Firmware install/update preflight returned an unexpected payload.";
const MALFORMED_PORT_INVENTORY_MESSAGE = "Firmware port inventory returned an unexpected payload.";
const MALFORMED_DFU_INVENTORY_MESSAGE = "Firmware DFU inventory returned an unexpected payload.";
const MALFORMED_CATALOG_ENTRY_MESSAGE = "Firmware catalog entries returned an unexpected payload.";
const MALFORMED_CATALOG_TARGET_MESSAGE = "Firmware catalog targets returned an unexpected payload.";

const FIRMWARE_INSTALL_UPDATE_PHASES = new Set<FirmwareInstallUpdatePhase>([
  "idle",
  "probing",
  "erasing",
  "programming",
  "verifying",
  "rebooting",
]);

const BOOTLOADER_INSTALLATION_PHASES = new Set<BootloaderInstallationPhase>([
  "idle",
  "detecting",
  "downloading",
  "erasing",
  "verifying",
  "manifesting_or_resetting",
]);

const FIRMWARE_INSTALL_READINESS_BLOCKED_REASONS = new Set<FirmwareInstallReadinessBlockedReason>([
  "session_busy",
  "port_unselected",
  "port_unavailable",
  "source_missing",
]);

const FIRMWARE_INSTALL_BOOTLOADER_TRANSITIONS = new Set<FirmwareInstallBootloaderTransition["kind"]>([
  "auto_reboot_supported",
  "already_in_bootloader",
  "auto_reboot_attemptable",
  "manual_bootloader_entry_required",
  "target_mismatch",
]);

const FIRMWARE_INSTALL_OUTCOME_RESULTS = new Set<FirmwareInstallUpdateOutcome["result"]>([
  "cancelled",
  "verified",
  "flashed_but_unverified",
  "reconnect_verified",
  "reconnect_failed",
  "failed",
  "board_detection_failed",
  "extf_capacity_insufficient",
]);

const BOOTLOADER_OUTCOME_RESULTS = new Set<BootloaderInstallationOutcome["result"]>([
  "verified",
  "cancelled",
  "reset_unconfirmed",
  "failed",
  "unsupported_bootloader_installation_path",
]);

const BOOTLOADER_RESULT_RESULTS = new Set<BootloaderInstallationResult["result"]>([
  "verified",
  "cancelled",
  "reset_unconfirmed",
  "failed",
  "driver_guidance",
  "platform_unsupported",
]);

export type FirmwareService = {
  sessionStatus(): Promise<unknown>;
  sessionCancel(): Promise<void>;
  sessionClearCompleted(): Promise<void>;
  installPreflight(): Promise<unknown>;
  requestFirmwareInstallPort(): Promise<unknown>;
  listPorts(): Promise<unknown>;
  listDfuDevices(): Promise<unknown>;
  catalogTargets(): Promise<unknown>;
  bootloaderCatalogTargets(): Promise<unknown>;
  catalogEntries(boardId: number, platform?: string): Promise<unknown>;
  installReadiness(request: FirmwareInstallReadinessRequest): Promise<unknown>;
  startFirmwareInstallUpdate(
    port: string,
    baud: number,
    source: FirmwareInstallSource,
    options?: FirmwareInstallOptions,
  ): Promise<unknown>;
  startBootloaderInstallation(device: DfuDeviceInfo, source: BootloaderInstallationSource): Promise<unknown>;
  subscribeProgress(cb: (progress: FirmwareProgress) => void): Promise<() => void>;
  formatError(error: unknown): string;
};

export function createFirmwareService(): FirmwareService {
  return {
    sessionStatus: firmwareSessionStatus,
    sessionCancel: firmwareSessionCancel,
    sessionClearCompleted: firmwareSessionClearCompleted,
    installPreflight: firmwareInstallPreflight,
    requestFirmwareInstallPort: firmwareRequestSerialPort,
    listPorts: firmwareListPorts,
    listDfuDevices: firmwareListDfuDevices,
    catalogTargets: firmwareCatalogTargets,
    bootloaderCatalogTargets: firmwareBootloaderCatalogTargets,
    catalogEntries: firmwareCatalogEntries,
    installReadiness: firmwareInstallReadiness,
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
            guidance: "Bootloader installation is not supported on this platform.",
          },
        },
      };
  }
}

export function normalizeFirmwareSessionStatus(value: unknown): FirmwareSessionStatus {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(MALFORMED_SESSION_STATUS_MESSAGE);
  }

  const candidate = value as Record<string, unknown>;
  switch (candidate.kind) {
    case "idle":
      return { kind: "idle" };
    case "firmware_install_update": {
      const phase = requireEnumValue(candidate.phase, FIRMWARE_INSTALL_UPDATE_PHASES, MALFORMED_SESSION_STATUS_MESSAGE);
      return { kind: "firmware_install_update", phase };
    }
    case "bootloader_installation": {
      const phase = requireEnumValue(candidate.phase, BOOTLOADER_INSTALLATION_PHASES, MALFORMED_SESSION_STATUS_MESSAGE);
      return { kind: "bootloader_installation", phase };
    }
    case "cancelling": {
      const path = requireSessionPath(candidate.path, MALFORMED_SESSION_STATUS_MESSAGE);
      return { kind: "cancelling", path };
    }
    case "completed":
      return {
        kind: "completed",
        outcome: normalizeFirmwareOutcome(candidate.outcome, MALFORMED_SESSION_STATUS_MESSAGE),
      };
    default:
      throw new Error(MALFORMED_SESSION_STATUS_MESSAGE);
  }
}

export function normalizeFirmwareProgress(value: unknown): FirmwareProgress {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(MALFORMED_PROGRESS_MESSAGE);
  }

  const candidate = value as Record<string, unknown>;
  return {
    phase_label: requireString(candidate.phase_label, MALFORMED_PROGRESS_MESSAGE),
    bytes_written: requireFiniteNumber(candidate.bytes_written, MALFORMED_PROGRESS_MESSAGE),
    bytes_total: requireFiniteNumber(candidate.bytes_total, MALFORMED_PROGRESS_MESSAGE),
    pct: requireFiniteNumber(candidate.pct, MALFORMED_PROGRESS_MESSAGE),
  };
}

export function normalizeFirmwareInstallResult(value: unknown): FirmwareInstallResult {
  return normalizeFirmwareInstallOutcome(value, MALFORMED_INSTALL_RESULT_MESSAGE);
}

export function normalizeBootloaderInstallationResult(value: unknown): BootloaderInstallationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(MALFORMED_BOOTLOADER_RESULT_MESSAGE);
  }

  const candidate = value as Record<string, unknown>;
  const result = requireEnumValue(candidate.result, BOOTLOADER_RESULT_RESULTS, MALFORMED_BOOTLOADER_RESULT_MESSAGE);

  switch (result) {
    case "verified":
    case "cancelled":
    case "reset_unconfirmed":
    case "platform_unsupported":
      return { result };
    case "failed":
      return {
        result,
        reason: requireString(candidate.reason, MALFORMED_BOOTLOADER_RESULT_MESSAGE),
      };
    case "driver_guidance":
      return {
        result,
        guidance: requireString(candidate.guidance, MALFORMED_BOOTLOADER_RESULT_MESSAGE),
      };
  }
}

export function normalizeFirmwareInstallReadinessResponse(value: unknown): FirmwareInstallReadinessResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(MALFORMED_READINESS_MESSAGE);
  }

  const candidate = value as Record<string, unknown>;
  return {
    request_token: requireString(candidate.request_token, MALFORMED_READINESS_MESSAGE),
    session_status: normalizeFirmwareSessionStatus(candidate.session_status),
    readiness: normalizeFirmwareInstallReadiness(candidate.readiness),
    target_hint: normalizeFirmwareInstallTargetHint(candidate.target_hint),
    validation_pending: requireBoolean(candidate.validation_pending, MALFORMED_READINESS_MESSAGE),
    bootloader_transition: normalizeFirmwareInstallBootloaderTransition(candidate.bootloader_transition),
  };
}

export function normalizeFirmwareInstallPreflightInfo(value: unknown): FirmwareInstallPreflightInfo {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(MALFORMED_PREFLIGHT_MESSAGE);
  }

  const candidate = value as Record<string, unknown>;
  return {
    vehicle_connected: requireBoolean(candidate.vehicle_connected, MALFORMED_PREFLIGHT_MESSAGE),
    param_count: requireNonNegativeInteger(candidate.param_count, MALFORMED_PREFLIGHT_MESSAGE),
    has_params_to_backup: requireBoolean(candidate.has_params_to_backup, MALFORMED_PREFLIGHT_MESSAGE),
    available_ports: normalizePortInfoList(candidate.available_ports, MALFORMED_PREFLIGHT_MESSAGE),
    detected_board_id: normalizeNullableInteger(candidate.detected_board_id, MALFORMED_PREFLIGHT_MESSAGE),
    session_ready: requireBoolean(candidate.session_ready, MALFORMED_PREFLIGHT_MESSAGE),
    session_status: normalizeFirmwareSessionStatus(candidate.session_status),
  };
}

export function normalizeInventoryResult(value: unknown): InventoryResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(MALFORMED_PORT_INVENTORY_MESSAGE);
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.kind === "unsupported") {
    return { kind: "unsupported" };
  }

  if (candidate.kind === "available") {
    return {
      kind: "available",
      ports: normalizePortInfoList(candidate.ports, MALFORMED_PORT_INVENTORY_MESSAGE),
    };
  }

  throw new Error(MALFORMED_PORT_INVENTORY_MESSAGE);
}

export function normalizeDfuScanResult(value: unknown): DfuScanResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(MALFORMED_DFU_INVENTORY_MESSAGE);
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.kind === "unsupported") {
    return { kind: "unsupported" };
  }

  if (candidate.kind === "available") {
    return {
      kind: "available",
      devices: normalizeDfuDeviceInfoList(candidate.devices, MALFORMED_DFU_INVENTORY_MESSAGE),
    };
  }

  throw new Error(MALFORMED_DFU_INVENTORY_MESSAGE);
}

export function normalizeCatalogEntryList(value: unknown): CatalogEntry[] {
  if (!Array.isArray(value)) {
    throw new Error(MALFORMED_CATALOG_ENTRY_MESSAGE);
  }

  return value.map((entry) => normalizeCatalogEntry(entry, MALFORMED_CATALOG_ENTRY_MESSAGE));
}

export function normalizeCatalogTargetSummaryList(value: unknown): CatalogTargetSummary[] {
  if (!Array.isArray(value)) {
    throw new Error(MALFORMED_CATALOG_TARGET_MESSAGE);
  }

  return value.map((entry) => normalizeCatalogTargetSummary(entry, MALFORMED_CATALOG_TARGET_MESSAGE));
}

export function computeFirmwareInstallReadinessToken(request: FirmwareInstallReadinessRequest): string {
  const encoder = new TextEncoder();
  const sourceIdentity = request.source.kind === "catalog_url"
    ? `${request.source.url.length}-${fnv1a64Digest([...encoder.encode(request.source.url)])}`
    : `${request.source.data.length}-${fnv1a64Digest(request.source.data)}`;

  return `firmware-install-readiness:port=${request.port}:source_kind=${request.source.kind}:source_identity=${sourceIdentity}:full_chip_erase=${request.options?.full_chip_erase ? 1 : 0}`;
}

function normalizeFirmwareOutcome(value: unknown, message: string): FirmwareOutcome {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }

  const candidate = value as Record<string, unknown>;
  const path = requireSessionPath(candidate.path, message);

  if (path === "firmware_install_update") {
    return {
      path,
      outcome: normalizeFirmwareInstallOutcome(candidate.outcome, message),
    };
  }

  return {
    path,
    outcome: normalizeBootloaderInstallationOutcome(candidate.outcome, message),
  };
}

function normalizeFirmwareInstallOutcome(value: unknown, message: string): FirmwareInstallUpdateOutcome {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }

  const candidate = value as Record<string, unknown>;
  const result = requireEnumValue(candidate.result, FIRMWARE_INSTALL_OUTCOME_RESULTS, message);

  switch (result) {
    case "cancelled":
      return { result };
    case "verified":
    case "flashed_but_unverified":
      return {
        result,
        board_id: requireNonNegativeInteger(candidate.board_id, message),
        bootloader_rev: requireNonNegativeInteger(candidate.bootloader_rev, message),
        port: requireString(candidate.port, message),
      };
    case "reconnect_verified":
      return {
        result,
        board_id: requireNonNegativeInteger(candidate.board_id, message),
        bootloader_rev: requireNonNegativeInteger(candidate.bootloader_rev, message),
        flash_verified: requireBoolean(candidate.flash_verified, message),
      };
    case "reconnect_failed":
      return {
        result,
        board_id: requireNonNegativeInteger(candidate.board_id, message),
        bootloader_rev: requireNonNegativeInteger(candidate.bootloader_rev, message),
        flash_verified: requireBoolean(candidate.flash_verified, message),
        reconnect_error: requireString(candidate.reconnect_error, message),
      };
    case "failed":
    case "board_detection_failed":
    case "extf_capacity_insufficient":
      return {
        result,
        reason: requireString(candidate.reason, message),
      };
  }
}

function normalizeBootloaderInstallationOutcome(value: unknown, message: string): BootloaderInstallationOutcome {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }

  const candidate = value as Record<string, unknown>;
  const result = requireEnumValue(candidate.result, BOOTLOADER_OUTCOME_RESULTS, message);

  switch (result) {
    case "verified":
    case "cancelled":
    case "reset_unconfirmed":
      return { result };
    case "failed":
      return {
        result,
        reason: requireString(candidate.reason, message),
      };
    case "unsupported_bootloader_installation_path":
      return {
        result: "unsupported_bootloader_installation_path",
        guidance: requireString(candidate.guidance, message),
      };
  }
}

function normalizeFirmwareInstallReadiness(value: unknown): FirmwareInstallReadiness {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(MALFORMED_READINESS_MESSAGE);
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.kind === "advisory") {
    return { kind: "advisory" };
  }

  if (candidate.kind === "blocked") {
    return {
      kind: "blocked",
      reason: requireEnumValue(candidate.reason, FIRMWARE_INSTALL_READINESS_BLOCKED_REASONS, MALFORMED_READINESS_MESSAGE),
    };
  }

  throw new Error(MALFORMED_READINESS_MESSAGE);
}

function normalizeFirmwareInstallTargetHint(value: unknown): FirmwareInstallReadinessResponse["target_hint"] {
  if (value == null) {
    return null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(MALFORMED_READINESS_MESSAGE);
  }

  const candidate = value as Record<string, unknown>;
  return {
    detected_board_id: normalizeNullableInteger(candidate.detected_board_id, MALFORMED_READINESS_MESSAGE),
  };
}

function normalizeFirmwareInstallBootloaderTransition(value: unknown): FirmwareInstallBootloaderTransition {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(MALFORMED_READINESS_MESSAGE);
  }

  const candidate = value as Record<string, unknown>;
  return {
    kind: requireEnumValue(candidate.kind, FIRMWARE_INSTALL_BOOTLOADER_TRANSITIONS, MALFORMED_READINESS_MESSAGE),
  };
}

function normalizePortInfoList(value: unknown, message: string): PortInfo[] {
  if (!Array.isArray(value)) {
    throw new Error(message);
  }

  return value.map((entry) => normalizePortInfo(entry, message));
}

function normalizePortInfo(value: unknown, message: string): PortInfo {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }

  const candidate = value as Record<string, unknown>;
  return {
    port_name: requireString(candidate.port_name, message),
    vid: normalizeNullableInteger(candidate.vid, message),
    pid: normalizeNullableInteger(candidate.pid, message),
    serial_number: normalizeNullableString(candidate.serial_number, message),
    manufacturer: normalizeNullableString(candidate.manufacturer, message),
    product: normalizeNullableString(candidate.product, message),
    location: normalizeNullableString(candidate.location, message),
  };
}

function normalizeDfuDeviceInfoList(value: unknown, message: string): DfuDeviceInfo[] {
  if (!Array.isArray(value)) {
    throw new Error(message);
  }

  return value.map((entry) => normalizeDfuDeviceInfo(entry, message));
}

function normalizeDfuDeviceInfo(value: unknown, message: string): DfuDeviceInfo {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }

  const candidate = value as Record<string, unknown>;
  return {
    vid: requireNonNegativeInteger(candidate.vid, message),
    pid: requireNonNegativeInteger(candidate.pid, message),
    unique_id: requireString(candidate.unique_id, message),
    serial_number: normalizeNullableString(candidate.serial_number, message),
    manufacturer: normalizeNullableString(candidate.manufacturer, message),
    product: normalizeNullableString(candidate.product, message),
  };
}

function normalizeCatalogEntry(value: unknown, message: string): CatalogEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }

  const candidate = value as Record<string, unknown>;
  return {
    board_id: requirePositiveInteger(candidate.board_id, message),
    platform: requireString(candidate.platform, message),
    vehicle_type: requireString(candidate.vehicle_type, message),
    version: requireString(candidate.version, message),
    version_type: requireString(candidate.version_type, message),
    format: requireString(candidate.format, message),
    url: requireString(candidate.url, message),
    image_size: requireNonNegativeInteger(candidate.image_size, message),
    latest: requireBoolean(candidate.latest, message),
    git_sha: requireString(candidate.git_sha, message),
    brand_name: normalizeNullableString(candidate.brand_name, message),
    manufacturer: normalizeNullableString(candidate.manufacturer, message),
  };
}

function normalizeCatalogTargetSummary(value: unknown, message: string): CatalogTargetSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }

  const candidate = value as Record<string, unknown>;
  const vehicleTypes = candidate.vehicle_types;
  if (!Array.isArray(vehicleTypes) || vehicleTypes.some((entry) => typeof entry !== "string")) {
    throw new Error(message);
  }

  return {
    board_id: requirePositiveInteger(candidate.board_id, message),
    platform: requireString(candidate.platform, message),
    brand_name: normalizeNullableString(candidate.brand_name, message),
    manufacturer: normalizeNullableString(candidate.manufacturer, message),
    vehicle_types: [...vehicleTypes],
    latest_version: normalizeNullableString(candidate.latest_version, message),
  };
}

function requireBoolean(value: unknown, message: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(message);
  }

  return value;
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== "string") {
    throw new Error(message);
  }

  return value;
}

function normalizeNullableString(value: unknown, message: string): string | null {
  if (value == null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(message);
  }

  return value;
}

function requireFiniteNumber(value: unknown, message: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(message);
  }

  return value;
}

function requireNonNegativeInteger(value: unknown, message: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(message);
  }

  return value;
}

function requirePositiveInteger(value: unknown, message: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(message);
  }

  return value;
}

function normalizeNullableInteger(value: unknown, message: string): number | null {
  if (value == null) {
    return null;
  }

  return requireNonNegativeInteger(value, message);
}

function requireEnumValue<T extends string>(value: unknown, allowed: Set<T>, message: string): T {
  if (typeof value !== "string" || !allowed.has(value as T)) {
    throw new Error(message);
  }

  return value as T;
}

function requireSessionPath(value: unknown, message: string): FirmwareSessionPath {
  if (value === "firmware_install_update") {
    return "firmware_install_update";
  }

  if (value === "bootloader_installation") {
    return "bootloader_installation";
  }

  throw new Error(message);
}

function fnv1a64Digest(bytes: number[]): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }

  return hash.toString(16).padStart(16, "0");
}
