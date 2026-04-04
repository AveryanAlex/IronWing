import type {
  CatalogEntry,
  CatalogTargetSummary,
  DfuDeviceInfo,
  DfuRecoveryResult,
  DfuScanResult,
  InventoryResult,
  PortInfo,
  SerialFlowResult,
  SerialPreflightInfo,
  SerialReadinessBlockedReason,
  SerialReadinessRequest,
  SerialReadinessResponse,
} from "../../../firmware";
import { mockState } from "./runtime";
import type { CommandArgs } from "./types";

const DEFAULT_FIRMWARE_PORTS: PortInfo[] = [
  {
    port_name: "/dev/ttyACM0",
    vid: null,
    pid: null,
    serial_number: null,
    manufacturer: "Hex",
    product: null,
    location: null,
  },
];

const DEFAULT_DFU_DEVICES: DfuDeviceInfo[] = [
  {
    vid: 0x0483,
    pid: 0xdf11,
    unique_id: "mock-dfu-1",
    serial_number: "DFU0001",
    manufacturer: "STMicroelectronics",
    product: "STM32 BOOTLOADER",
  },
];

const DEFAULT_FIRMWARE_CATALOG_ENTRIES: CatalogEntry[] = [
  {
    board_id: 140,
    platform: "CubeOrange",
    vehicle_type: "Copter",
    version: "4.5.0",
    version_type: "stable",
    format: "apj",
    url: "https://example.com/cubeorange-copter.apj",
    image_size: 123_456,
    latest: true,
    git_sha: "abc1234",
    brand_name: "Cube Orange",
    manufacturer: "Hex",
  },
  {
    board_id: 140,
    platform: "CubeOrange",
    vehicle_type: "Plane",
    version: "4.5.0",
    version_type: "stable",
    format: "apj",
    url: "https://example.com/cubeorange-plane.apj",
    image_size: 123_400,
    latest: false,
    git_sha: "abc5678",
    brand_name: "Cube Orange",
    manufacturer: "Hex",
  },
  {
    board_id: 9,
    platform: "fmuv2",
    vehicle_type: "Plane",
    version: "4.4.0",
    version_type: "stable",
    format: "apj",
    url: "https://example.com/fmuv2-plane.apj",
    image_size: 119_500,
    latest: true,
    git_sha: "def1234",
    brand_name: null,
    manufacturer: null,
  },
];

function firmwareCatalogTargetsFromEntries(entries: CatalogEntry[]): CatalogTargetSummary[] {
  const grouped = new Map<string, CatalogTargetSummary>();

  for (const entry of entries) {
    const key = `${entry.board_id}:${entry.platform}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        board_id: entry.board_id,
        platform: entry.platform,
        brand_name: entry.brand_name,
        manufacturer: entry.manufacturer,
        vehicle_types: [entry.vehicle_type],
        latest_version: entry.latest ? entry.version : entry.version ?? null,
      });
      continue;
    }

    if (!existing.vehicle_types.includes(entry.vehicle_type)) {
      existing.vehicle_types.push(entry.vehicle_type);
      existing.vehicle_types.sort((left, right) => left.localeCompare(right));
    }
    if (entry.latest) {
      existing.latest_version = entry.version;
    }
    if (existing.brand_name === null && entry.brand_name !== null) {
      existing.brand_name = entry.brand_name;
    }
    if (existing.manufacturer === null && entry.manufacturer !== null) {
      existing.manufacturer = entry.manufacturer;
    }
  }

  return Array.from(grouped.values()).sort((left, right) => left.platform.localeCompare(right.platform));
}

const DEFAULT_FIRMWARE_CATALOG_TARGETS = firmwareCatalogTargetsFromEntries(DEFAULT_FIRMWARE_CATALOG_ENTRIES);
const DEFAULT_RECOVERY_CATALOG_TARGETS = DEFAULT_FIRMWARE_CATALOG_TARGETS.filter((target) => target.platform === "CubeOrange");

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function defaultFirmwarePorts(): PortInfo[] {
  return cloneValue(DEFAULT_FIRMWARE_PORTS);
}

function defaultDfuDevices(): DfuDeviceInfo[] {
  return cloneValue(DEFAULT_DFU_DEVICES);
}

function defaultFirmwareCatalogEntries(): CatalogEntry[] {
  return cloneValue(DEFAULT_FIRMWARE_CATALOG_ENTRIES);
}

export function defaultFirmwareCatalogTargets(): CatalogTargetSummary[] {
  return cloneValue(DEFAULT_FIRMWARE_CATALOG_TARGETS);
}

export function defaultRecoveryCatalogTargets(): CatalogTargetSummary[] {
  return cloneValue(DEFAULT_RECOVERY_CATALOG_TARGETS);
}

function requireFiniteInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`missing or invalid ${label}`);
  }

  return value;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`missing or invalid ${label}`);
  }

  return value as Record<string, unknown>;
}

function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`missing or invalid ${label}`);
  }

  return value;
}

function requireByteArray(value: unknown, label: string): number[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry) || !Number.isInteger(entry))) {
    throw new Error(`missing or invalid ${label}`);
  }

  return value as number[];
}

export function mockSerialPreflightInfo(): SerialPreflightInfo {
  const availablePorts = defaultFirmwarePorts();
  const paramCount = mockState.liveParamStore
    ? Object.keys(mockState.liveParamStore.params).length
    : 0;

  return {
    vehicle_connected: mockState.liveVehicleAvailable,
    param_count: paramCount,
    has_params_to_backup: paramCount > 0,
    available_ports: availablePorts,
    detected_board_id: null,
    session_ready: true,
    session_status: { kind: "idle" },
  };
}

export function mockInventoryResult(): InventoryResult {
  return { kind: "available", ports: defaultFirmwarePorts() };
}

export function mockDfuScanResult(): DfuScanResult {
  return { kind: "available", devices: defaultDfuDevices() };
}

export function validateFirmwareCatalogEntriesArgs(args: CommandArgs): { boardId: number; platform: string | undefined } {
  const boardId = requireFiniteInteger(args?.boardId, "firmware_catalog_entries.boardId");
  if (boardId <= 0) {
    throw new Error("firmware_catalog_entries.boardId must be greater than 0");
  }

  const rawPlatform = args?.platform;
  if (rawPlatform !== undefined && rawPlatform !== null && typeof rawPlatform !== "string") {
    throw new Error("missing or invalid firmware_catalog_entries.platform");
  }

  return { boardId, platform: rawPlatform ?? undefined };
}

export function validateSerialReadinessRequest(args: CommandArgs): SerialReadinessRequest {
  const request = requireRecord(args?.request, "firmware_serial_readiness.request");
  if (typeof request.port !== "string") {
    throw new Error("missing or invalid firmware_serial_readiness.request.port");
  }
  const source = requireRecord(request.source, "firmware_serial_readiness.request.source");
  const kind = requireNonEmptyString(source.kind, "firmware_serial_readiness.request.source.kind");

  let normalizedSource: SerialReadinessRequest["source"];
  if (kind === "catalog_url") {
    if (typeof source.url !== "string") {
      throw new Error("missing or invalid firmware_serial_readiness.request.source.url");
    }
    normalizedSource = {
      kind,
      url: source.url,
    };
  } else if (kind === "local_apj_bytes") {
    normalizedSource = {
      kind,
      data: requireByteArray(source.data, "firmware_serial_readiness.request.source.data"),
    };
  } else {
    throw new Error("missing or invalid firmware_serial_readiness.request.source.kind");
  }

  const rawOptions = request.options;
  let options: SerialReadinessRequest["options"] | undefined;
  if (rawOptions !== undefined && rawOptions !== null) {
    const optionsRecord = requireRecord(rawOptions, "firmware_serial_readiness.request.options");
    if (typeof optionsRecord.full_chip_erase !== "boolean") {
      throw new Error("missing or invalid firmware_serial_readiness.request.options.full_chip_erase");
    }
    options = { full_chip_erase: optionsRecord.full_chip_erase };
  }

  return { port: request.port, source: normalizedSource, options };
}

export function validateFirmwareFlashSerialArgs(args: CommandArgs): {
  port: string;
  baud: number;
  source: { kind: "catalog_url"; url: string } | { kind: "local_apj_bytes"; data: number[] };
  options: { full_chip_erase: boolean } | null;
} {
  const request = requireRecord(args?.request, "firmware_flash_serial.request");
  const port = requireNonEmptyString(request.port, "firmware_flash_serial.request.port");
  const baud = requireFiniteInteger(request.baud, "firmware_flash_serial.request.baud");
  if (baud <= 0) {
    throw new Error("firmware_flash_serial.request.baud must be greater than 0");
  }

  const source = requireRecord(request.source, "firmware_flash_serial.request.source");
  const kind = requireNonEmptyString(source.kind, "firmware_flash_serial.request.source.kind");
  let normalizedSource: { kind: "catalog_url"; url: string } | { kind: "local_apj_bytes"; data: number[] };
  if (kind === "catalog_url") {
    normalizedSource = {
      kind: "catalog_url",
      url: requireNonEmptyString(source.url, "firmware_flash_serial.request.source.url"),
    };
  } else if (kind === "local_apj_bytes") {
    normalizedSource = {
      kind: "local_apj_bytes",
      data: requireByteArray(source.data, "firmware_flash_serial.request.source.data"),
    };
  } else {
    throw new Error("missing or invalid firmware_flash_serial.request.source.kind");
  }

  let options: { full_chip_erase: boolean } | null = null;
  if (request.options !== undefined && request.options !== null) {
    const optionsRecord = requireRecord(request.options, "firmware_flash_serial.request.options");
    if (typeof optionsRecord.full_chip_erase !== "boolean") {
      throw new Error("missing or invalid firmware_flash_serial.request.options.full_chip_erase");
    }
    options = { full_chip_erase: optionsRecord.full_chip_erase };
  }

  return { port, baud, source: normalizedSource, options };
}

export function validateFirmwareFlashDfuRecoveryArgs(args: CommandArgs): {
  device: DfuDeviceInfo;
  source:
    | { kind: "official_bootloader"; board_target: string }
    | { kind: "local_apj_bytes"; data: number[] }
    | { kind: "local_bin_bytes"; data: number[] };
} {
  const request = requireRecord(args?.request, "firmware_flash_dfu_recovery.request");
  const deviceRecord = requireRecord(request.device, "firmware_flash_dfu_recovery.request.device");
  const device: DfuDeviceInfo = {
    vid: requireFiniteInteger(deviceRecord.vid, "firmware_flash_dfu_recovery.request.device.vid"),
    pid: requireFiniteInteger(deviceRecord.pid, "firmware_flash_dfu_recovery.request.device.pid"),
    unique_id: requireNonEmptyString(deviceRecord.unique_id, "firmware_flash_dfu_recovery.request.device.unique_id"),
    serial_number: deviceRecord.serial_number === null || typeof deviceRecord.serial_number === "string"
      ? (deviceRecord.serial_number as string | null)
      : (() => { throw new Error("missing or invalid firmware_flash_dfu_recovery.request.device.serial_number"); })(),
    manufacturer: deviceRecord.manufacturer === null || typeof deviceRecord.manufacturer === "string"
      ? (deviceRecord.manufacturer as string | null)
      : (() => { throw new Error("missing or invalid firmware_flash_dfu_recovery.request.device.manufacturer"); })(),
    product: deviceRecord.product === null || typeof deviceRecord.product === "string"
      ? (deviceRecord.product as string | null)
      : (() => { throw new Error("missing or invalid firmware_flash_dfu_recovery.request.device.product"); })(),
  };

  const sourceRecord = requireRecord(request.source, "firmware_flash_dfu_recovery.request.source");
  const kind = requireNonEmptyString(sourceRecord.kind, "firmware_flash_dfu_recovery.request.source.kind");
  let source:
    | { kind: "official_bootloader"; board_target: string }
    | { kind: "local_apj_bytes"; data: number[] }
    | { kind: "local_bin_bytes"; data: number[] };
  if (kind === "official_bootloader") {
    source = {
      kind: "official_bootloader",
      board_target: requireNonEmptyString(sourceRecord.board_target, "firmware_flash_dfu_recovery.request.source.board_target"),
    };
  } else if (kind === "local_apj_bytes") {
    source = {
      kind: "local_apj_bytes",
      data: requireByteArray(sourceRecord.data, "firmware_flash_dfu_recovery.request.source.data"),
    };
  } else if (kind === "local_bin_bytes") {
    source = {
      kind: "local_bin_bytes",
      data: requireByteArray(sourceRecord.data, "firmware_flash_dfu_recovery.request.source.data"),
    };
  } else {
    throw new Error("missing or invalid firmware_flash_dfu_recovery.request.source.kind");
  }

  return { device, source };
}

function fnv1a64Digest(bytes: number[]): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function mockSerialReadinessRequestToken(request: SerialReadinessRequest): string {
  const encoder = new TextEncoder();
  const sourceIdentity = request.source.kind === "catalog_url"
    ? `${request.source.url.length}-${fnv1a64Digest([...encoder.encode(request.source.url)])}`
    : `${request.source.data.length}-${fnv1a64Digest(request.source.data)}`;

  return `serial-readiness:port=${request.port}:source_kind=${request.source.kind}:source_identity=${sourceIdentity}:full_chip_erase=${request.options?.full_chip_erase ? 1 : 0}`;
}

function mockSerialReadinessBlockedReason(
  request: SerialReadinessRequest,
  ports: PortInfo[],
): SerialReadinessBlockedReason | null {
  if (request.port.trim().length === 0) {
    return "port_unselected";
  }
  if (!ports.some((port) => port.port_name === request.port)) {
    return "port_unavailable";
  }
  if (request.source.kind === "catalog_url" && request.source.url.trim().length === 0) {
    return "source_missing";
  }
  if (request.source.kind === "local_apj_bytes" && request.source.data.length === 0) {
    return "source_missing";
  }
  return null;
}

export function mockSerialReadinessResponse(request: SerialReadinessRequest): SerialReadinessResponse {
  const ports = defaultFirmwarePorts();
  const blockedReason = mockSerialReadinessBlockedReason(request, ports);

  return {
    request_token: mockSerialReadinessRequestToken(request),
    session_status: { kind: "idle" },
    readiness: blockedReason === null ? { kind: "advisory" } : { kind: "blocked", reason: blockedReason },
    target_hint: null,
    validation_pending: blockedReason === null,
    bootloader_transition: { kind: "manual_bootloader_entry_required" },
  };
}

export function mockFirmwareCatalogEntries(boardId: number, platform?: string): CatalogEntry[] {
  return defaultFirmwareCatalogEntries().filter((entry) => entry.board_id === boardId && (platform === undefined || entry.platform === platform));
}

export function mockFirmwareFlashSerialResult(args: ReturnType<typeof validateFirmwareFlashSerialArgs>): SerialFlowResult {
  const sourceUrl = (args.source as { url?: string }).url ?? null;
  const matchedEntry = sourceUrl === null
    ? null
    : defaultFirmwareCatalogEntries().find((entry) => entry.url === sourceUrl) ?? null;

  return {
    result: "verified",
    board_id: matchedEntry?.board_id ?? 140,
    bootloader_rev: 5,
    port: args.port,
  };
}

export function mockFirmwareFlashDfuRecoveryResult(_args: ReturnType<typeof validateFirmwareFlashDfuRecoveryArgs>): DfuRecoveryResult {
  return { result: "verified" };
}
