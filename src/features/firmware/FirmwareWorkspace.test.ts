// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writable, type Writable } from "svelte/store";

import type {
  CatalogEntry,
  CatalogTargetSummary,
  DfuDeviceInfo,
  FirmwareInstallReadinessBlockedReason,
  FirmwareInstallReadinessRequest,
  FirmwareInstallReadinessResponse,
  FirmwareInstallSource,
  FirmwareSessionStatus,
  PortInfo,
} from "../../firmware";
import { createShellChromeState, type ShellChromeState } from "../../app/shell/chrome-state";
import type { FirmwareFileIo } from "../../lib/firmware-file-io";
import { missingDomainValue } from "../../lib/domain-status";
import {
  computeFirmwareInstallReadinessToken,
  type FirmwareService,
} from "../../lib/platform/firmware";
import { createFirmwareWorkspaceStore } from "../../lib/stores/firmware-workspace";
import { withSessionContext } from "../../test/context-harnesses";
import FirmwareWorkspace from "../../routes/(app)/firmware/+page.svelte";
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

const DEFAULT_RECOVERY_TARGETS: CatalogTargetSummary[] = [DEFAULT_TARGETS[0]];

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

const DEFAULT_DFU_DEVICES: DfuDeviceInfo[] = [
  {
    vid: 0x0483,
    pid: 0xdf11,
    unique_id: "dfu-1",
    serial_number: "DFU1",
    manufacturer: "ST",
    product: "STM32 DFU",
  },
];

function resolveBlockedReason(request: FirmwareInstallReadinessRequest): FirmwareInstallReadinessBlockedReason | null {
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
  request: FirmwareInstallReadinessRequest,
  detectedBoardId: number | null,
): FirmwareInstallReadinessResponse {
  const blockedReason = resolveBlockedReason(request);

  return {
    request_token: computeFirmwareInstallReadinessToken(request),
    session_status: { kind: "idle" },
    readiness: blockedReason ? { kind: "blocked", reason: blockedReason } : { kind: "advisory" },
    target_hint: { detected_board_id: detectedBoardId },
    validation_pending: blockedReason === null,
    bootloader_transition: detectedBoardId === null
      ? { kind: "manual_bootloader_entry_required" }
      : { kind: "auto_reboot_attemptable" },
  };
}

function createResponsiveChromeStore(width: number, height: number, tierOverride?: string): Writable<ShellChromeState> {
  return writable(
    createShellChromeState(
      {
        sm: width >= 640,
        md: width >= 768,
        lg: width >= 1024,
        xl: width >= 1280,
      },
      { width, height },
      tierOverride,
    ),
  );
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
    entries?: Record<string, CatalogEntry[]>;
    targets?: CatalogTargetSummary[];
    recoveryTargets?: CatalogTargetSummary[];
    dfuDevices?: DfuDeviceInfo[];
  } = {},
): FirmwareService {
  const detectedBoardId = config.detectedBoardId ?? null;
  const entries = config.entries ?? DEFAULT_ENTRIES;
  const targets = config.targets ?? DEFAULT_TARGETS;
  const recoveryTargets = config.recoveryTargets ?? DEFAULT_RECOVERY_TARGETS;
  const dfuDevices = config.dfuDevices ?? DEFAULT_DFU_DEVICES;

  return {
    sessionStatus: vi.fn(async () => ({ kind: "idle" } satisfies FirmwareSessionStatus)),
    sessionCancel: vi.fn(async () => undefined),
    sessionClearCompleted: vi.fn(async () => undefined),
    installPreflight: vi.fn(async () => ({
      vehicle_connected: false,
      param_count: 12,
      has_params_to_backup: true,
      available_ports: DEFAULT_PORTS,
      detected_board_id: null,
      session_ready: true,
      session_status: { kind: "idle" },
    })),
    listPorts: vi.fn(async () => ({ kind: "available", ports: DEFAULT_PORTS })),
    requestFirmwareInstallPort: vi.fn(async () => null),
    listDfuDevices: vi.fn(async () => ({ kind: "available", devices: dfuDevices })),
    catalogTargets: vi.fn(async () => targets),
    bootloaderCatalogTargets: vi.fn(async () => recoveryTargets),
    catalogEntries: vi.fn(async (_boardId: number, platform?: string) => entries[platform ?? ""] ?? []),
    installReadiness: vi.fn(async (request: FirmwareInstallReadinessRequest) => defaultReadiness(request, detectedBoardId)),
    startFirmwareInstallUpdate: vi.fn(async (_port: string, _baud: number, _source: FirmwareInstallSource) => ({
      result: "verified",
      board_id: 140,
      bootloader_rev: 5,
      port: "/dev/ttyACM0",
    })),
    startBootloaderInstallation: vi.fn(async () => ({ result: "verified" })),
    subscribeProgress: vi.fn(async () => () => undefined),
    formatError: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
    ...overrides,
  } satisfies FirmwareService;
}

async function renderWorkspace(options: {
  service?: FirmwareService;
  fileIo?: FirmwareFileIo;
  chromeStore?: Writable<ShellChromeState>;
  activeSource?: "live" | "playback";
} = {}) {
  const service = options.service ?? createService();
  const fileIo = options.fileIo ?? createFileIo();
  const chromeStore = options.chromeStore ?? createResponsiveChromeStore(1440, 900, "wide");
  const store = createFirmwareWorkspaceStore(service, { sessionPollMs: 0 });
  const sessionStore = {
    subscribe: writable({
      hydrated: true,
      lastPhase: "ready",
      lastError: null,
      activeEnvelope: {
        session_id: `${options.activeSource ?? "live"}-session`,
        source_kind: options.activeSource ?? "live",
        seek_epoch: 0,
        reset_revision: 0,
      },
      activeSource: options.activeSource ?? "live",
      sessionDomain: missingDomainValue("bootstrap"),
      telemetryDomain: missingDomainValue("bootstrap"),
      support: missingDomainValue("bootstrap"),
      sensorHealth: missingDomainValue("bootstrap"),
      configurationFacts: missingDomainValue("bootstrap"),
      calibration: missingDomainValue("bootstrap"),
      guided: missingDomainValue("bootstrap"),
      statusText: missingDomainValue("bootstrap"),
      bootstrap: {
        missionState: null,
        paramStore: null,
        paramProgress: null,
        playbackCursorUsec: null,
      },
      connectionForm: {
        mode: "udp",
        udpBind: "0.0.0.0:14550",
        tcpAddress: "127.0.0.1:5760",
        serialPort: "",
        baud: 57600,
        selectedBtDevice: "",
        takeoffAlt: "10",
        followVehicle: true,
      },
      transportDescriptors: [],
      serialPorts: [],
      availableModes: [],
      btDevices: [],
      btScanning: false,
      optimisticConnection: null,
    }).subscribe,
  } as any;

  render(withSessionContext(sessionStore, FirmwareWorkspace), {
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

async function openRecoveryMode() {
  await fireEvent.click(screen.getByTestId(firmwareWorkspaceTestIds.modeRecovery));

  await waitFor(() => {
    expect(screen.getByTestId(firmwareWorkspaceTestIds.recoveryPanel)).toBeTruthy();
  });
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
        status: "success" as const,
        selection: {
          kind: "local_apj_bytes" as const,
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

  it("replay-readonly disables firmware start surfaces and shows the read-only banner", async () => {
    await renderWorkspace({ activeSource: "playback" });

    await waitFor(() => {
      expect(screen.getByTestId("firmware-replay-readonly-banner").textContent).toContain("Replay is read-only");
    });

    expect((screen.getByTestId(firmwareWorkspaceTestIds.startSerial) as HTMLButtonElement).disabled).toBe(true);

    await openRecoveryMode();
    expect((screen.getByTestId(firmwareWorkspaceTestIds.startRecovery) as HTMLButtonElement).disabled).toBe(true);
  });

  it("retains target and source context after a rejected serial start and renders the failure outcome inline", async () => {
    const service = createService({
      startFirmwareInstallUpdate: vi.fn(async () => {
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

  it("keeps bootloader installation separate from firmware install/update and gates dangerous manual bootloader images behind explicit confirmation", async () => {
    const fileIo = createFileIo({
      pickBinFile: vi.fn(async () => ({
        status: "success" as const,
        selection: {
          kind: "local_bin_bytes" as const,
          data: [9, 8, 7, 6],
          fileName: "rescue.bin",
          byteLength: 4,
          digest: "cafe0000cafe0000",
        },
      })),
    });

    await renderWorkspace({ fileIo });
    await openRecoveryMode();

    expect(screen.queryByTestId(firmwareWorkspaceTestIds.recoveryManualPanel)).toBeNull();

    await fireEvent.click(screen.getByTestId(firmwareWorkspaceTestIds.recoveryAdvancedToggle));
    expect(screen.getByTestId(firmwareWorkspaceTestIds.recoveryManualPanel)).toBeTruthy();
    expect(screen.getByTestId(firmwareWorkspaceTestIds.recoveryManualWarning).textContent).toContain("non-bootable");

    await fireEvent.click(screen.getByTestId(firmwareWorkspaceTestIds.recoveryManualBin));
    await fireEvent.click(screen.getByTestId(firmwareWorkspaceTestIds.recoveryBrowse));

    await waitFor(() => {
      expect(screen.getByTestId(firmwareWorkspaceTestIds.recoverySourceState).textContent).toContain("local_bin_bytes");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.recoverySourceState).textContent).toContain("rescue.bin");
    });

    await fireEvent.click(screen.getByTestId(firmwareWorkspaceTestIds.recoverySafetyConfirm));

    await waitFor(() => {
      expect((screen.getByTestId(firmwareWorkspaceTestIds.startRecovery) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByTestId(firmwareWorkspaceTestIds.recoveryManualConfirm)).toBeTruthy();
    });

    await fireEvent.click(screen.getByTestId(firmwareWorkspaceTestIds.recoveryManualConfirm));

    await waitFor(() => {
      expect((screen.getByTestId(firmwareWorkspaceTestIds.startRecovery) as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it("requires an explicit official recovery target choice when multiple bootloader targets exist", async () => {
    await renderWorkspace({
      service: createService({}, {
        recoveryTargets: DEFAULT_TARGETS,
      }),
    });

    await openRecoveryMode();
    await fireEvent.click(screen.getByTestId(firmwareWorkspaceTestIds.recoverySafetyConfirm));

    await waitFor(() => {
      expect((screen.getByTestId(firmwareWorkspaceTestIds.recoveryTargetSelect) as HTMLSelectElement).value).toBe("");
      expect((screen.getByTestId(firmwareWorkspaceTestIds.startRecovery) as HTMLButtonElement).disabled).toBe(true);
    });

    await fireEvent.change(screen.getByTestId(firmwareWorkspaceTestIds.recoveryTargetSelect), {
      target: { value: `${DEFAULT_TARGETS[0].board_id}:${DEFAULT_TARGETS[0].platform}` },
    });

    await waitFor(() => {
      expect(screen.getByTestId(firmwareWorkspaceTestIds.recoverySourceState).textContent).toContain("official_bootloader");
      expect((screen.getByTestId(firmwareWorkspaceTestIds.startRecovery) as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it("keeps retryable recovery guidance outcomes in the recovery mode instead of auto-returning", async () => {
    const service = createService({
      startBootloaderInstallation: vi.fn(async () => ({
        result: "driver_guidance",
        guidance: "Install the STM32 DFU driver, reconnect the board in DFU mode, and retry recovery.",
      })),
    });

    await renderWorkspace({ service });
    await openRecoveryMode();
    await fireEvent.click(screen.getByTestId(firmwareWorkspaceTestIds.recoverySafetyConfirm));

    await waitFor(() => {
      expect((screen.getByTestId(firmwareWorkspaceTestIds.startRecovery) as HTMLButtonElement).disabled).toBe(false);
    });

    await fireEvent.click(screen.getByTestId(firmwareWorkspaceTestIds.startRecovery));

    await waitFor(() => {
      expect(screen.getByTestId(firmwareWorkspaceTestIds.mode).textContent).toContain("bootloader-installation");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.recoveryPanel)).toBeTruthy();
      expect(screen.getByTestId(firmwareWorkspaceTestIds.outcomeResult).textContent).toContain("Bootloader installation guidance");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.outcomeSummary).textContent).toContain("STM32 DFU driver");
    });
  });

  it("auto-returns a verified recovery outcome to install/update with follow-up guidance while retaining the DFU facts", async () => {
    await renderWorkspace();
    await openRecoveryMode();
    await fireEvent.click(screen.getByTestId(firmwareWorkspaceTestIds.recoverySafetyConfirm));

    await waitFor(() => {
      expect((screen.getByTestId(firmwareWorkspaceTestIds.startRecovery) as HTMLButtonElement).disabled).toBe(false);
    });

    await fireEvent.click(screen.getByTestId(firmwareWorkspaceTestIds.startRecovery));

    await waitFor(() => {
      expect(screen.getByTestId(firmwareWorkspaceTestIds.mode).textContent).toContain("firmware-install-update");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.serialPanel)).toBeTruthy();
      expect(screen.getByTestId(firmwareWorkspaceTestIds.returnGuidance).textContent).toContain("Return to firmware install/update now");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.outcomeResult).textContent).toContain("Bootloader installation verified");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.outcomeSummary).textContent).toContain("Return to firmware install/update");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.outcomePanel).textContent).toContain("STM32 DFU");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.outcomePanel).textContent).toContain("Next step");
    });
  });
});
