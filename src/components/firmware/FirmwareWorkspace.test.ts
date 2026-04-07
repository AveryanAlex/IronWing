// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writable, type Writable } from "svelte/store";

import type {
  CatalogEntry,
  CatalogTargetSummary,
  FirmwareSessionStatus,
  PortInfo,
  SerialFlashSource,
  SerialReadinessBlockedReason,
  SerialReadinessRequest,
  SerialReadinessResponse,
} from "../../firmware";
import { createShellChromeState, type ShellChromeState } from "../../app/shell/chrome-state";
import type { FirmwareFileIo } from "../../lib/firmware-file-io";
import {
  computeSerialReadinessToken,
  type FirmwareService,
} from "../../lib/platform/firmware";
import { createFirmwareWorkspaceStore } from "../../lib/stores/firmware-workspace";
import FirmwareWorkspace from "./FirmwareWorkspace.svelte";
import { firmwareWorkspaceTestIds } from "./firmware-workspace-test-ids";

const DEFAULT_PORTS: PortInfo[] = [
  {
    port_name: "/dev/ttyACM0",
    vid: null,
    pid: null,
    serial_number: null,
    manufacturer: "Hex",
    product: "CubeOrange Bootloader",
    location: null,
  },
];

const DEFAULT_TARGETS: CatalogTargetSummary[] = [
  {
    board_id: 140,
    platform: "CubeOrange",
    brand_name: "Cube Orange",
    manufacturer: "Hex",
    vehicle_types: ["Copter", "Plane"],
    latest_version: "4.5.0",
  },
  {
    board_id: 201,
    platform: "MatekH743",
    brand_name: "Matek H743",
    manufacturer: "Matek",
    vehicle_types: ["Copter"],
    latest_version: "4.5.1",
  },
];

const DEFAULT_ENTRIES: Record<string, CatalogEntry[]> = {
  CubeOrange: [
    {
      board_id: 140,
      platform: "CubeOrange",
      vehicle_type: "Copter",
      version: "4.5.0",
      version_type: "stable",
      format: "apj",
      url: "https://example.com/cubeorange.apj",
      image_size: 123_456,
      latest: true,
      git_sha: "abc123",
      brand_name: "Cube Orange",
      manufacturer: "Hex",
    },
  ],
  MatekH743: [
    {
      board_id: 201,
      platform: "MatekH743",
      vehicle_type: "Copter",
      version: "4.5.1",
      version_type: "stable",
      format: "apj",
      url: "https://example.com/matek.apj",
      image_size: 98_765,
      latest: true,
      git_sha: "def456",
      brand_name: "Matek H743",
      manufacturer: "Matek",
    },
  ],
};

function resolveBlockedReason(request: SerialReadinessRequest): SerialReadinessBlockedReason | null {
  if (request.port.trim().length === 0) {
    return "port_unselected";
  }

  if (!DEFAULT_PORTS.some((port) => port.port_name === request.port)) {
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

function defaultReadiness(
  request: SerialReadinessRequest,
  detectedBoardId: number | null,
): SerialReadinessResponse {
  const blockedReason = resolveBlockedReason(request);

  return {
    request_token: computeSerialReadinessToken(request),
    session_status: { kind: "idle" },
    readiness: blockedReason ? { kind: "blocked", reason: blockedReason } : { kind: "advisory" },
    target_hint: { detected_board_id: detectedBoardId },
    validation_pending: blockedReason === null,
    bootloader_transition: detectedBoardId === null
      ? { kind: "manual_bootloader_entry_required" }
      : { kind: "auto_reboot_attemptable" },
  };
}

function createResponsiveChromeState(width: number, height: number, tierOverride?: string) {
  return createShellChromeState(
    {
      sm: width >= 640,
      md: width >= 768,
      lg: width >= 1024,
      xl: width >= 1280,
    },
    { width, height },
    tierOverride,
  );
}

function createResponsiveChromeStore(width: number, height: number, tierOverride?: string): Writable<ShellChromeState> {
  return writable(createResponsiveChromeState(width, height, tierOverride));
}

function createFileIo(overrides: Partial<FirmwareFileIo> = {}): FirmwareFileIo {
  return {
    pickApjFile: vi.fn(async () => ({ status: "cancelled" as const })),
    pickBinFile: vi.fn(async () => ({ status: "cancelled" as const })),
    ...overrides,
  } satisfies FirmwareFileIo;
}

function createService(
  overrides: Partial<FirmwareService> = {},
  config: {
    detectedBoardId?: number | null;
    hasParamsToBackup?: boolean;
    paramCount?: number;
    entries?: Record<string, CatalogEntry[]>;
    targets?: CatalogTargetSummary[];
  } = {},
): FirmwareService {
  const detectedBoardId = config.detectedBoardId ?? null;
  const entries = config.entries ?? DEFAULT_ENTRIES;
  const targets = config.targets ?? DEFAULT_TARGETS;

  return {
    sessionStatus: vi.fn(async () => ({ kind: "idle" } satisfies FirmwareSessionStatus)),
    sessionCancel: vi.fn(async () => undefined),
    sessionClearCompleted: vi.fn(async () => undefined),
    serialPreflight: vi.fn(async () => ({
      vehicle_connected: false,
      param_count: config.paramCount ?? 12,
      has_params_to_backup: config.hasParamsToBackup ?? true,
      available_ports: DEFAULT_PORTS,
      detected_board_id: null,
      session_ready: true,
      session_status: { kind: "idle" },
    })),
    listPorts: vi.fn(async () => ({ kind: "available", ports: DEFAULT_PORTS })),
    listDfuDevices: vi.fn(async () => ({ kind: "available", devices: [] })),
    catalogTargets: vi.fn(async () => targets),
    recoveryCatalogTargets: vi.fn(async () => []),
    catalogEntries: vi.fn(async (_boardId: number, platform?: string) => entries[platform ?? ""] ?? []),
    serialReadiness: vi.fn(async (request: SerialReadinessRequest) => defaultReadiness(request, detectedBoardId)),
    flashSerial: vi.fn(async (_port: string, _baud: number, _source: SerialFlashSource) => ({
      result: "verified",
      board_id: 140,
      bootloader_rev: 5,
      port: "/dev/ttyACM0",
    })),
    flashDfuRecovery: vi.fn(async () => ({ result: "verified" })),
    subscribeProgress: vi.fn(async () => () => undefined),
    formatError: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
    ...overrides,
  } satisfies FirmwareService;
}

async function renderWorkspace(options: {
  service?: FirmwareService;
  fileIo?: FirmwareFileIo;
  chromeStore?: Writable<ShellChromeState>;
} = {}) {
  const service = options.service ?? createService();
  const fileIo = options.fileIo ?? createFileIo();
  const chromeStore = options.chromeStore ?? createResponsiveChromeStore(1440, 900, "wide");
  const store = createFirmwareWorkspaceStore(service, { sessionPollMs: 0 });

  render(FirmwareWorkspace, {
    props: {
      store,
      service,
      fileIo,
      chromeStore,
    },
  });

  await waitFor(() => {
    expect(screen.getByTestId(firmwareWorkspaceTestIds.root)).toBeTruthy();
  });

  return { service, fileIo, chromeStore, store };
}

async function chooseManualTarget(name: string | RegExp) {
  await waitFor(() => {
    expect(screen.getByTestId(firmwareWorkspaceTestIds.manualTargetResults)).toBeTruthy();
  });

  await fireEvent.click(screen.getByRole("button", { name }));
}

describe("FirmwareWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps install catalog-first, requires an explicit manual target when proof is missing, and lets a local APJ replace the catalog source", async () => {
    const fileIo = createFileIo({
      pickApjFile: vi.fn(async () => ({
        status: "success",
        selection: {
          kind: "local_apj_bytes",
          data: [1, 2, 3, 4],
          fileName: "cube-custom.apj",
          byteLength: 4,
          digest: "beefbeefbeefbeef",
        },
      })),
    });

    await renderWorkspace({ fileIo });

    await waitFor(() => {
      expect(screen.getByTestId(firmwareWorkspaceTestIds.manualTargetRequired).textContent).toContain("No board hint is available");
      expect((screen.getByTestId(firmwareWorkspaceTestIds.startSerial) as HTMLButtonElement).disabled).toBe(true);
    });

    await fireEvent.input(screen.getByTestId(firmwareWorkspaceTestIds.manualTargetSearch), {
      target: { value: "cube" },
    });
    await chooseManualTarget(/Cube Orange/i);

    await waitFor(() => {
      expect(screen.getByTestId(firmwareWorkspaceTestIds.catalogEntrySelect)).toBeTruthy();
      expect(screen.getByTestId(firmwareWorkspaceTestIds.selectedTargetState).textContent).toContain("manual");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.selectedSourceState).textContent).toContain("catalog_url");
      expect((screen.getByTestId(firmwareWorkspaceTestIds.startSerial) as HTMLButtonElement).disabled).toBe(false);
    });

    await fireEvent.click(screen.getByTestId(firmwareWorkspaceTestIds.sourceBrowse));

    await waitFor(() => {
      expect(screen.getByTestId(firmwareWorkspaceTestIds.selectedSourceState).textContent).toContain("local_apj_bytes");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.selectedSourceState).textContent).toContain("cube-custom.apj");
      expect((screen.getByTestId(firmwareWorkspaceTestIds.startSerial) as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it("disables start when the selected manual target is hidden by the current search filter", async () => {
    await renderWorkspace();

    await chooseManualTarget(/Cube Orange/i);

    await waitFor(() => {
      expect((screen.getByTestId(firmwareWorkspaceTestIds.startSerial) as HTMLButtonElement).disabled).toBe(false);
    });

    await fireEvent.input(screen.getByTestId(firmwareWorkspaceTestIds.manualTargetSearch), {
      target: { value: "matek" },
    });

    await waitFor(() => {
      expect(screen.getByTestId(firmwareWorkspaceTestIds.manualTargetHidden)).toBeTruthy();
      expect((screen.getByTestId(firmwareWorkspaceTestIds.startSerial) as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it("renders the parameter backup reminder when preflight reports a backup-worthy parameter set", async () => {
    await renderWorkspace({
      service: createService({}, { hasParamsToBackup: true, paramCount: 42 }),
    });

    await waitFor(() => {
      expect(screen.getByTestId(firmwareWorkspaceTestIds.paramBackup)).toBeTruthy();
      expect(screen.getByTestId(firmwareWorkspaceTestIds.paramBackupState).textContent).toContain("42 parameters are currently available");
    });
  });

  it("keeps the backup surface truthful when preflight reports no parameter backup context", async () => {
    await renderWorkspace({
      service: createService({}, { hasParamsToBackup: false, paramCount: 0 }),
    });

    await waitFor(() => {
      expect(screen.queryByTestId(firmwareWorkspaceTestIds.paramBackup)).toBeNull();
      expect(screen.getByTestId(firmwareWorkspaceTestIds.paramBackupState).textContent).toContain("No backed-up parameter set is currently reported");
    });
  });

  it("keeps the workspace browseable on radiomaster and phone layouts while blocking actual install actions", async () => {
    const chromeStore = createResponsiveChromeStore(1440, 900, "wide");
    await renderWorkspace({ chromeStore });

    await chooseManualTarget(/Cube Orange/i);

    await waitFor(() => {
      expect((screen.getByTestId(firmwareWorkspaceTestIds.startSerial) as HTMLButtonElement).disabled).toBe(false);
    });

    chromeStore.set(createResponsiveChromeState(1280, 680, "wide"));

    await waitFor(() => {
      expect(screen.getByTestId(firmwareWorkspaceTestIds.layoutMode).textContent).toContain("browse-radiomaster");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.blockedReason).textContent).toContain("constrained widths");
      expect((screen.getByTestId(firmwareWorkspaceTestIds.startSerial) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByTestId(firmwareWorkspaceTestIds.manualTargetSearch)).toBeTruthy();
      expect(screen.getByTestId(firmwareWorkspaceTestIds.outcomePanel)).toBeTruthy();
    });

    chromeStore.set(createResponsiveChromeState(390, 844, "phone"));

    await waitFor(() => {
      expect(screen.getByTestId(firmwareWorkspaceTestIds.layoutMode).textContent).toContain("browse-phone");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.blockedReason).textContent).toContain("phone widths");
      expect((screen.getByTestId(firmwareWorkspaceTestIds.startSerial) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByTestId(firmwareWorkspaceTestIds.manualTargetSearch)).toBeTruthy();
    });
  });

  it("retains target and source context after a rejected serial start and renders the failure outcome inline", async () => {
    const service = createService({
      flashSerial: vi.fn(async () => {
        throw new Error("serial bootloader handshake failed");
      }),
    });

    await renderWorkspace({ service });
    await chooseManualTarget(/Cube Orange/i);

    await waitFor(() => {
      expect((screen.getByTestId(firmwareWorkspaceTestIds.startSerial) as HTMLButtonElement).disabled).toBe(false);
    });

    await fireEvent.click(screen.getByTestId(firmwareWorkspaceTestIds.startSerial));

    await waitFor(() => {
      expect(screen.getByTestId(firmwareWorkspaceTestIds.outcomeResult).textContent).toContain("Failed");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.outcomeSummary).textContent).toContain("serial bootloader handshake failed");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.selectedTargetState).textContent).toContain("Cube Orange");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.selectedSourceState).textContent).toContain("catalog_url");
    });
  });

  it("retains cancelled serial outcomes without clearing the retryable selection context", async () => {
    const service = createService({
      flashSerial: vi.fn(async () => ({ result: "cancelled" })),
    });

    await renderWorkspace({ service });
    await chooseManualTarget(/Cube Orange/i);
    await waitFor(() => {
      expect((screen.getByTestId(firmwareWorkspaceTestIds.startSerial) as HTMLButtonElement).disabled).toBe(false);
    });

    await fireEvent.click(screen.getByTestId(firmwareWorkspaceTestIds.startSerial));

    await waitFor(() => {
      expect(screen.getByTestId(firmwareWorkspaceTestIds.outcomeResult).textContent).toContain("Cancelled");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.outcomeSummary).textContent).toContain("cancelled before completion");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.selectedTargetState).textContent).toContain("Cube Orange");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.selectedSourceState).textContent).toContain("catalog_url");
    });
  });

  it("renders detailed outcome facts for reconnect verification failures instead of collapsing them into a generic error", async () => {
    const service = createService({
      flashSerial: vi.fn(async () => ({
        result: "reconnect_failed",
        board_id: 140,
        bootloader_rev: 6,
        flash_verified: true,
        reconnect_error: "timeout waiting for heartbeat",
      })),
    });

    await renderWorkspace({ service });
    await chooseManualTarget(/Cube Orange/i);
    await waitFor(() => {
      expect((screen.getByTestId(firmwareWorkspaceTestIds.startSerial) as HTMLButtonElement).disabled).toBe(false);
    });

    await fireEvent.click(screen.getByTestId(firmwareWorkspaceTestIds.startSerial));

    await waitFor(() => {
      expect(screen.getByTestId(firmwareWorkspaceTestIds.outcomeResult).textContent).toContain("Reconnect failed");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.outcomePanel).textContent).toContain("Bootloader rev");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.outcomePanel).textContent).toContain("6");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.outcomePanel).textContent).toContain("Reconnect error");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.outcomePanel).textContent).toContain("timeout waiting for heartbeat");
    });
  });
});
