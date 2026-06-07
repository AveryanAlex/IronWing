// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writable, type Writable } from "svelte/store";

import type {
  CatalogEntry,
  CatalogTargetSummary,
  DfuDeviceInfo,
  FirmwareInstallBootloaderStatus,
  FirmwareInstallReadinessBlockedReason,
  FirmwareInstallReadinessRequest,
  FirmwareInstallReadinessResponse,
  FirmwareInstallSource,
  FirmwareSessionStatus,
  PortInfo,
} from "../../firmware";
import { createShellChromeState, type ShellChromeState } from "../../app/shell/chrome-state";
import type { FirmwareFileIo } from "../../lib/firmware-file-io";
import { availableDomainValue, missingDomainValue } from "../../lib/domain-status";
import {
  computeFirmwareInstallReadinessToken,
  type FirmwareService,
} from "../../lib/platform/firmware";
import { createFirmwareWorkspaceStore } from "../../lib/stores/firmware-workspace";
import { createSerialPortInventoryStore, type SerialPortInventoryStore } from "../../lib/stores/serial-port-inventory";
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
  bootloaderStatus: FirmwareInstallBootloaderStatus = { kind: "unknown" },
): FirmwareInstallReadinessResponse {
  const blockedReason = resolveBlockedReason(request);

  return {
    request_token: computeFirmwareInstallReadinessToken(request),
    session_status: { kind: "idle" },
    readiness: blockedReason ? { kind: "blocked", reason: blockedReason } : { kind: "advisory" },
    bootloader_status: bootloaderStatus,
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
    bootloaderStatus?: FirmwareInstallBootloaderStatus;
  } = {},
): FirmwareService {
  const detectedBoardId = config.detectedBoardId ?? null;
  const entries = config.entries ?? DEFAULT_ENTRIES;
  const targets = config.targets ?? DEFAULT_TARGETS;
  const recoveryTargets = config.recoveryTargets ?? DEFAULT_RECOVERY_TARGETS;
  const dfuDevices = config.dfuDevices ?? DEFAULT_DFU_DEVICES;
  const bootloaderStatus = config.bootloaderStatus ?? { kind: "unknown" };

  return {
    sessionStatus: vi.fn(async () => ({ kind: "idle" } satisfies FirmwareSessionStatus)),
    sessionCancel: vi.fn(async () => undefined),
    sessionClearCompleted: vi.fn(async () => undefined),
    installPreflight: vi.fn(async () => ({
      vehicle_connected: false,
      param_count: 12,
      has_params_to_backup: true,
      available_ports: DEFAULT_PORTS,
      session_ready: true,
      session_status: { kind: "idle" },
    })),
    listDfuDevices: vi.fn(async () => ({ kind: "available", devices: dfuDevices })),
    catalogTargets: vi.fn(async () => targets),
    bootloaderCatalogTargets: vi.fn(async () => recoveryTargets),
    catalogEntries: vi.fn(async (_boardId: number, platform?: string) => entries[platform ?? ""] ?? []),
    installReadiness: vi.fn(async (request: FirmwareInstallReadinessRequest) => defaultReadiness(request, bootloaderStatus)),
    rebootToBootloader: vi.fn(async () => ({ result: "unsupported", reason: "not connected" })),
    detectBootloaderBoard: vi.fn(async (port: string) => ({ port, board_id: detectedBoardId ?? 140, board_rev: 1, bootloader_rev: 5, flash_size: 2_097_152, extf_size: null })),
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
  serialInventory?: SerialPortInventoryStore;
  expectedInitialSerialPort?: string;
} = {}) {
  const service = options.service ?? createService();
  const fileIo = options.fileIo ?? createFileIo();
  const chromeStore = options.chromeStore ?? createResponsiveChromeStore(1440, 900, "wide");
  const store = createFirmwareWorkspaceStore(service, { sessionPollMs: 0 });
  const serialInventory = options.serialInventory ?? createSerialPortInventoryStore({
    listPorts: vi.fn(async () => ({ kind: "available", ports: DEFAULT_PORTS, can_request_web_serial: false })),
    requestWebSerialPort: vi.fn(async () => null),
    formatError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  });
  const sessionState = writable({
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
      websocketUrl: "ws://127.0.0.1:14560",
      serialPort: "",
      webSerialPortId: "",
      webBluetoothDeviceId: "",
      baud: 57600,
      selectedBtDevice: "",
      demoVehiclePreset: "quadcopter",
      takeoffAlt: "10",
      followVehicle: true,
    },
    transportDescriptors: [],
    availableModes: [],
    btDevices: [],
    btScanning: false,
    optimisticConnection: null,
    connectionRequestPhase: "idle",
  });
  const sessionStore = {
    subscribe: sessionState.subscribe,
    updateConnectionForm: vi.fn(),
    connect: vi.fn(async () => undefined),
  } as any;

  render(withSessionContext(sessionStore, FirmwareWorkspace), {
    props: {
      store,
      service,
      fileIo,
      chromeStore,
      serialInventory,
    },
  });

  await waitFor(() => {
    expect(screen.getByTestId(firmwareWorkspaceTestIds.root)).toBeTruthy();
  });

  await waitFor(() => {
    expect((screen.getByTestId(firmwareWorkspaceTestIds.serialPort) as HTMLSelectElement).value).toBe(options.expectedInitialSerialPort ?? "/dev/ttyACM0");
  });

  return { service, fileIo, chromeStore, store, sessionState, sessionStore, serialInventory };
}

async function chooseManualTarget(name: string | RegExp) {
  await waitFor(() => {
    expect(screen.getByTestId(firmwareWorkspaceTestIds.manualTargetResults)).toBeTruthy();
  });

  await fireEvent.click(screen.getByRole("button", { name }));
}

async function chooseCatalogRelease(vehicleType = "Copter", versionUrl = "https://example.com/cubeorange.apj") {
  await waitFor(() => {
    expect(screen.getByTestId(firmwareWorkspaceTestIds.catalogVehicleTypeSelect)).toBeTruthy();
  });

  await fireEvent.change(screen.getByTestId(firmwareWorkspaceTestIds.catalogVehicleTypeSelect), {
    target: { value: vehicleType },
  });

  await waitFor(() => {
    expect((screen.getByTestId(firmwareWorkspaceTestIds.catalogEntrySelect) as HTMLSelectElement).disabled).toBe(false);
  });

  await fireEvent.change(screen.getByTestId(firmwareWorkspaceTestIds.catalogEntrySelect), {
    target: { value: versionUrl },
  });
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

  it("requires catalog board, vehicle type, and version choices, and lets a custom APJ override then return to the catalog source", async () => {
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
      expect(screen.getByText(/not sure whether the selected serial port is already a bootloader/i)).toBeTruthy();
      expect(screen.getByText(/Two safe paths/i)).toBeTruthy();
      expect(screen.getByRole("button", { name: /Connect MAVLink to this port/i })).toBeTruthy();
      expect(screen.getByTestId(firmwareWorkspaceTestIds.manualTargetRequired).textContent).toContain("Autodetect board");
      expect((screen.getByTestId(firmwareWorkspaceTestIds.startSerial) as HTMLButtonElement).disabled).toBe(true);
    });

    await fireEvent.input(screen.getByTestId(firmwareWorkspaceTestIds.manualTargetSearch), {
      target: { value: "cube" },
    });
    await chooseManualTarget(/Cube Orange/i);

    await waitFor(() => {
      expect(screen.getByTestId(firmwareWorkspaceTestIds.selectedTargetState).textContent).toContain("selected");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.catalogVehicleTypeSelect)).toBeTruthy();
      expect(screen.getByTestId(firmwareWorkspaceTestIds.selectedSourceState).textContent).toContain("choose a vehicle type");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.sourceBrowse).textContent).toContain("Use custom file");
      expect((screen.getByTestId(firmwareWorkspaceTestIds.startSerial) as HTMLButtonElement).disabled).toBe(true);
    });

    await chooseCatalogRelease();

    await waitFor(() => {
      expect(screen.getByTestId(firmwareWorkspaceTestIds.selectedSourceState).textContent).toContain("catalog_url");
      expect((screen.getByTestId(firmwareWorkspaceTestIds.startSerial) as HTMLButtonElement).disabled).toBe(false);
    });

    await fireEvent.click(screen.getByTestId(firmwareWorkspaceTestIds.sourceBrowse));

    await waitFor(() => {
      expect(screen.getByTestId(firmwareWorkspaceTestIds.selectedSourceState).textContent).toContain("local_apj_bytes");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.selectedSourceState).textContent).toContain("cube-custom.apj");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.sourceBrowse).textContent).toContain("Change custom file");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.sourceRemove)).toBeTruthy();
      expect((screen.getByTestId(firmwareWorkspaceTestIds.startSerial) as HTMLButtonElement).disabled).toBe(false);
    });

    await fireEvent.click(screen.getByTestId(firmwareWorkspaceTestIds.sourceRemove));

    await waitFor(() => {
      expect(screen.getByTestId(firmwareWorkspaceTestIds.selectedSourceState).textContent).toContain("catalog_url");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.sourceBrowse).textContent).toContain("Use custom file");
      expect(screen.queryByTestId(firmwareWorkspaceTestIds.sourceRemove)).toBeNull();
      expect((screen.getByTestId(firmwareWorkspaceTestIds.startSerial) as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it("autodetects bootloader board id and filters the catalog target chooser", async () => {
    const service = createService({}, { detectedBoardId: 201 });
    await renderWorkspace({ service });

    await fireEvent.click(screen.getByRole("button", { name: /autodetect board/i }));

    await waitFor(() => {
      expect(service.detectBootloaderBoard).toHaveBeenCalledWith("/dev/ttyACM0");
      expect(screen.getByText(/Filtering by Board ID 201/i)).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Matek H743/i })).toBeTruthy();
      expect(screen.queryByRole("button", { name: /Cube Orange/i })).toBeNull();
    });
  });

  it("prompts to reboot into bootloader when autodetect sees bootloader sync mismatch", async () => {
    const syncMismatch = "no ArduPilot bootloader responded on /dev/ttyACM1: bootloader sync mismatch: got 0x1F";
    const service = createService({
      detectBootloaderBoard: vi.fn(async () => {
        throw new Error(syncMismatch);
      }),
    });
    await renderWorkspace({ service });

    await fireEvent.click(screen.getByRole("button", { name: /autodetect board/i }));

    await waitFor(() => {
      expect(service.detectBootloaderBoard).toHaveBeenCalledWith("/dev/ttyACM0");
      expect(screen.getAllByText(/Reboot the controller into bootloader mode/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/select\/grant the bootloader serial port/i).length).toBeGreaterThan(0);
    });
  });

  it("offers quick MAVLink connection to the selected serial port from unknown bootloader status", async () => {
    const { sessionStore } = await renderWorkspace();

    await fireEvent.click(screen.getByTestId(firmwareWorkspaceTestIds.serialQuickMavlinkConnect));

    await waitFor(() => {
      expect(sessionStore.updateConnectionForm).toHaveBeenCalledWith({
        mode: "serial",
        serialPort: "/dev/ttyACM0",
        webSerialPortId: "",
        baud: 115200,
      });
      expect(sessionStore.connect).toHaveBeenCalledTimes(1);
    });
  });

  it("refreshes bootloader status when the live MAVLink session connects or disconnects", async () => {
    let readinessCall = 0;
    const statuses: FirmwareInstallBootloaderStatus[] = [
      { kind: "unknown" },
      { kind: "unknown" },
      { kind: "not_in_bootloader", can_reboot: true },
      { kind: "unknown" },
    ];
    const service = createService({
      installReadiness: vi.fn(async (request: FirmwareInstallReadinessRequest) => {
        const status = statuses[Math.min(readinessCall, statuses.length - 1)];
        readinessCall += 1;
        return defaultReadiness(request, status);
      }),
    });
    const { sessionState } = await renderWorkspace({ service });

    await waitFor(() => {
      expect(screen.getByTestId(firmwareWorkspaceTestIds.serialBootloaderTransition).textContent).toContain("unknown");
    });

    sessionState.update((state: any) => ({
      ...state,
      activeEnvelope: {
        session_id: "live-connected-session",
        source_kind: "live",
        seek_epoch: 0,
        reset_revision: 0,
      },
      activeSource: "live",
      sessionDomain: availableDomainValue({
        status: "active",
        connection: { kind: "connected" },
        vehicle_state: null,
        home_position: null,
      }, "stream"),
    }));

    await waitFor(() => {
      expect(service.installReadiness).toHaveBeenCalledTimes(3);
      expect(screen.getByTestId(firmwareWorkspaceTestIds.serialBootloaderTransition).textContent).toContain("not_in_bootloader");
    });

    sessionState.update((state: any) => ({
      ...state,
      activeEnvelope: {
        session_id: "live-disconnected-session",
        source_kind: "live",
        seek_epoch: 0,
        reset_revision: 0,
      },
      activeSource: "live",
      sessionDomain: availableDomainValue({
        status: "active",
        connection: { kind: "disconnected" },
        vehicle_state: null,
        home_position: null,
      }, "stream"),
    }));

    await waitFor(() => {
      expect(service.installReadiness).toHaveBeenCalledTimes(4);
      expect(screen.getByTestId(firmwareWorkspaceTestIds.serialBootloaderTransition).textContent).toContain("unknown");
    });
  });

  it("refreshes bootloader status when selected port metadata changes in the serial inventory", async () => {
    const bootloaderPort: PortInfo = {
      ...DEFAULT_PORTS[0]!,
      product: "MatekF405-TE-BL",
      manufacturer: "ArduPilot",
      serial_number: "36001D001647333",
    };
    const applicationPort: PortInfo = {
      ...bootloaderPort,
      product: "MatekF405-TE-bdshot",
    };
    let inventoryPorts = [bootloaderPort];
    let bootloaderStatus: FirmwareInstallBootloaderStatus = { kind: "already_in_bootloader" };
    const serialInventory = createSerialPortInventoryStore({
      listPorts: vi.fn(async () => ({ kind: "available", ports: inventoryPorts, can_request_web_serial: false })),
      requestWebSerialPort: vi.fn(async () => null),
      formatError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
    });
    const service = createService({
      installReadiness: vi.fn(async (request: FirmwareInstallReadinessRequest) => defaultReadiness(request, bootloaderStatus)),
    });
    await renderWorkspace({ service, serialInventory });

    await waitFor(() => {
      expect(screen.getByTestId(firmwareWorkspaceTestIds.serialBootloaderTransition).textContent).toContain("already_in_bootloader");
      expect((screen.getByTestId(firmwareWorkspaceTestIds.serialPort) as HTMLSelectElement).selectedOptions[0]?.textContent).toContain("MatekF405-TE-BL");
    });

    inventoryPorts = [applicationPort];
    bootloaderStatus = { kind: "unknown" };
    await fireEvent.click(screen.getByTestId(firmwareWorkspaceTestIds.serialPortRefresh));

    await waitFor(() => {
      expect((screen.getByTestId(firmwareWorkspaceTestIds.serialPort) as HTMLSelectElement).selectedOptions[0]?.textContent).toContain("MatekF405-TE-bdshot");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.serialBootloaderTransition).textContent).toContain("unknown");
    });
  });

  it("requires explicit reboot before starting when the selected serial port is the active live link", async () => {
    const service = createService({}, {
      bootloaderStatus: { kind: "not_in_bootloader", can_reboot: true },
    });
    await renderWorkspace({ service });

    await waitFor(() => {
      expect(screen.getByTestId(firmwareWorkspaceTestIds.serialBootloaderTransition).textContent).toContain("not_in_bootloader");
      expect((screen.getByTestId(firmwareWorkspaceTestIds.startSerial) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByText(/Autodetect is disabled because this port is currently the active MAVLink link/i)).toBeTruthy();
    });

    const autodetectButton = screen.getByRole("button", { name: /autodetect board/i }) as HTMLButtonElement;
    expect(autodetectButton.disabled).toBe(true);
    await fireEvent.click(autodetectButton);
    expect(service.detectBootloaderBoard).not.toHaveBeenCalled();

    await fireEvent.click(screen.getByRole("button", { name: /reboot to bootloader/i }));

    await waitFor(() => {
      expect(service.rebootToBootloader).toHaveBeenCalledWith("/dev/ttyACM0");
      expect(screen.getByText(/not connected/i)).toBeTruthy();
    });
  });

  it("prompts to grant and select the bootloader WebSerial port after reboot is requested", async () => {
    const applicationPort: PortInfo = {
      port_name: "webserial:1",
      vid: 0x2dae,
      pid: 0x1058,
      serial_number: "APP1",
      manufacturer: "Hex",
      product: "CubeOrange",
      location: "webserial:1",
    };
    const bootloaderPort: PortInfo = {
      port_name: "webserial:2",
      vid: 0x2dae,
      pid: 0x1059,
      serial_number: "BL1",
      manufacturer: "Hex",
      product: "CubeOrange Bootloader",
      location: "webserial:2",
    };
    let inventoryPorts = [applicationPort];
    const requestWebSerialPort = vi.fn(async () => bootloaderPort);
    const serialInventory = createSerialPortInventoryStore({
      listPorts: vi.fn(async () => ({ kind: "available", ports: inventoryPorts, can_request_web_serial: true })),
      requestWebSerialPort,
      formatError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
    });
    const service = createService({
      rebootToBootloader: vi.fn(async () => ({ result: "requested" })),
    }, {
      bootloaderStatus: { kind: "not_in_bootloader", can_reboot: true },
    });
    await renderWorkspace({ service, serialInventory, expectedInitialSerialPort: "webserial:1" });

    await fireEvent.click(screen.getByRole("button", { name: /reboot to bootloader/i }));

    await waitFor(() => {
      expect(service.rebootToBootloader).toHaveBeenCalledWith("webserial:1");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.serialBootloaderGrant)).toBeTruthy();
      expect(screen.getByText(/reappears as a new WebSerial device/i)).toBeTruthy();
    });

    inventoryPorts = [bootloaderPort];
    await fireEvent.click(screen.getByRole("button", { name: /grant\/select bootloader port/i }));

    await waitFor(() => {
      expect(requestWebSerialPort).toHaveBeenCalledTimes(1);
      expect((screen.getByTestId(firmwareWorkspaceTestIds.serialPort) as HTMLSelectElement).value).toBe("webserial:2");
      expect(screen.queryByTestId(firmwareWorkspaceTestIds.serialBootloaderGrant)).toBeNull();
    });
  });

  it("sorts catalog firmware versions by descending semver", async () => {
    const cubeEntry = DEFAULT_ENTRIES.CubeOrange[0];
    const entries: Record<string, CatalogEntry[]> = {
      ...DEFAULT_ENTRIES,
      CubeOrange: [
        { ...cubeEntry, version: "4.7.0", version_type: "beta", url: "https://example.com/cubeorange-4.7.0.apj", latest: false },
        { ...cubeEntry, version: "4.10.0", version_type: "stable", url: "https://example.com/cubeorange-4.10.0.apj", latest: false },
        { ...cubeEntry, version: "4.6.3", version_type: "official", url: "https://example.com/cubeorange-4.6.3.apj", latest: false },
        { ...cubeEntry, version: "4.8.0-rc.1", version_type: "beta", url: "https://example.com/cubeorange-4.8.0-rc.1.apj", latest: false },
        { ...cubeEntry, version: "4.9.0", version_type: "stable", url: "https://example.com/cubeorange-4.9.0.apj", latest: false },
      ],
    };

    await renderWorkspace({ service: createService({}, { entries }) });
    await chooseManualTarget(/Cube Orange/i);

    await waitFor(() => {
      expect(screen.getByTestId(firmwareWorkspaceTestIds.catalogVehicleTypeSelect)).toBeTruthy();
    });

    await fireEvent.change(screen.getByTestId(firmwareWorkspaceTestIds.catalogVehicleTypeSelect), {
      target: { value: "Copter" },
    });

    const versionSelect = screen.getByTestId(firmwareWorkspaceTestIds.catalogEntrySelect) as HTMLSelectElement;
    const optionLabels = Array.from(versionSelect.options)
      .filter((option) => option.value.length > 0)
      .map((option) => option.textContent?.trim());

    expect(optionLabels).toEqual([
      "4.10.0 · stable",
      "4.9.0 · stable",
      "4.8.0-rc.1 · beta",
      "4.7.0 · beta",
      "4.6.3 · official",
    ]);
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
    await chooseCatalogRelease();

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

  it("prompts to reboot into bootloader when flash board detection sees bootloader sync mismatch", async () => {
    const syncMismatch = "no ArduPilot bootloader responded on /dev/ttyACM1: bootloader sync mismatch: got 0x1F";
    const service = createService({
      startFirmwareInstallUpdate: vi.fn(async () => ({
        result: "board_detection_failed" as const,
        reason: syncMismatch,
      })),
    });

    await renderWorkspace({ service });
    await chooseManualTarget(/Cube Orange/i);
    await chooseCatalogRelease();

    await waitFor(() => {
      expect((screen.getByTestId(firmwareWorkspaceTestIds.startSerial) as HTMLButtonElement).disabled).toBe(false);
    });

    await fireEvent.click(screen.getByTestId(firmwareWorkspaceTestIds.startSerial));

    await waitFor(() => {
      expect(screen.getByTestId(firmwareWorkspaceTestIds.outcomeResult).textContent).toContain("Board detection failed");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.outcomeSummary).textContent).toContain("Reboot the controller into bootloader mode");
      expect(screen.getByTestId(firmwareWorkspaceTestIds.outcomeSummary).textContent).toContain("select/grant the bootloader serial port");
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
