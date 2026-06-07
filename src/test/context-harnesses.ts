import { readable } from "svelte/store";

import type { FirmwareFileIo } from "../lib/firmware-file-io";
import type { FirmwareInstallReadinessRequest } from "../firmware";
import { createFirmwareFileIo } from "../lib/firmware-file-io";
import {
  computeFirmwareInstallReadinessToken,
  type FirmwareService,
} from "../lib/platform/firmware";
import {
  createFirmwareWorkspaceStore,
  type FirmwareWorkspaceStore,
} from "../lib/stores/firmware-workspace";
import { createSerialPortInventoryStore, type SerialPortInventoryStore } from "../lib/stores/serial-port-inventory";
import { createOperatorWorkspaceViewStore } from "../lib/stores/operator-workspace-view";
import {
  createParameterWorkspaceViewStore,
  type ParamsStore,
} from "../lib/stores/params";
import {
  createSetupWorkspaceStore,
  createSetupWorkspaceViewStore,
  type SetupWorkspaceStore,
  type SetupWorkspaceViewStore,
} from "../lib/stores/setup-workspace";
import { runtime } from "../lib/stores/runtime";
import {
  createSessionViewStore,
  type SessionStore,
} from "../lib/stores/session";
import {
  createLiveSettingsStore,
  type LiveSettingsStore,
} from "../lib/stores/live-settings";
import {
  createMissionPlannerStore,
  createMissionPlannerViewStore,
  type MissionPlannerStore,
  type MissionPlannerViewStore,
} from "../lib/stores/mission-planner";
import type { MissionPlannerService } from "../lib/platform/mission-planner";
import type { MissionPlanFileIo } from "../lib/mission-plan-file-io";
import type { LiveSettingsService } from "../lib/platform/live-settings";
import {
  createShellChromeState,
  createShellChromeStore,
  type ShellTier,
} from "../app/shell/chrome-state";
import {
  setFirmwareWorkspaceContext,
  setLiveSettingsStoreContext,
  setMissionPlannerStoreContext,
  setMissionPlannerViewStoreContext,
  setOperatorWorkspaceViewStoreContext,
  setParamsStoreContext,
  setParameterWorkspaceViewStoreContext,
  setRuntimeStoreContext,
  setSerialPortInventoryContext,
  setSessionStoreContext,
  setSessionViewStoreContext,
  setSetupWorkspaceStoreContext,
  setSetupWorkspaceViewStoreContext,
  setShellChromeStoreContext,
  type FirmwareWorkspaceContext,
  type ShellChromeStore,
} from "../app/shell/runtime-context";

type RenderableComponent = (...args: any[]) => unknown;

function asRenderable(component: unknown): RenderableComponent {
  return component as RenderableComponent;
}

function createHarnessLiveSettingsService(): LiveSettingsService {
  return {
    loadMessageRateCatalog: async () => [
      { id: 33, name: "Global Position", default_rate_hz: 4 },
      { id: 30, name: "Attitude", default_rate_hz: 4 },
    ],
    applyTelemetryRate: async () => undefined,
    applyMessageRate: async () => undefined,
    formatError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  } satisfies LiveSettingsService;
}

function createHarnessLiveSettingsStore(sessionStore: SessionStore): LiveSettingsStore {
  return createLiveSettingsStore(sessionStore, createHarnessLiveSettingsService(), null);
}

function createHarnessMissionPlannerService(): MissionPlannerService {
  return {
    subscribeAll: async () => () => {},
    downloadWorkspace: async () => ({
      mission: { items: [] },
      fence: { return_point: null, regions: [] },
      rally: { points: [] },
      home: null,
    }),
    uploadWorkspace: async () => undefined,
    clearWorkspace: async () => undefined,
    validateMission: async () => [],
    cancelTransfer: async () => undefined,
    formatError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  } satisfies MissionPlannerService;
}

function createHarnessMissionPlanFileIo(): MissionPlanFileIo {
  return {
    importFromPicker: async () => ({ status: "cancelled" }),
    exportToPicker: async () => ({ status: "cancelled" }),
  } satisfies MissionPlanFileIo;
}

function createHarnessMissionPlannerStore(sessionStore: SessionStore): MissionPlannerStore {
  return createMissionPlannerStore(
    sessionStore,
    createHarnessMissionPlannerService(),
    createHarnessMissionPlanFileIo(),
  );
}

function createHarnessFirmwareService(): FirmwareService {
  return {
    sessionStatus: async () => ({ kind: "idle" }),
    sessionCancel: async () => undefined,
    sessionClearCompleted: async () => undefined,
    installPreflight: async () => ({
      vehicle_connected: false,
      param_count: 0,
      has_params_to_backup: false,
      available_ports: [
        {
          port_name: "/dev/ttyACM0",
          vid: null,
          pid: null,
          serial_number: null,
          manufacturer: "Hex",
          product: "CubeOrange Bootloader",
          location: null,
        },
      ],
      session_ready: true,
      session_status: { kind: "idle" },
    }),
    listDfuDevices: async () => ({
      kind: "available",
      devices: [
        {
          vid: 0x0483,
          pid: 0xdf11,
          unique_id: "dfu-1",
          serial_number: "DFU1",
          manufacturer: "ST",
          product: "STM32 DFU",
        },
      ],
    }),
    catalogTargets: async () => [
      {
        board_id: 140,
        platform: "CubeOrange",
        brand_name: "Cube Orange",
        manufacturer: "Hex",
        vehicle_types: ["Copter", "Plane"],
        latest_version: "4.5.0",
      },
    ],
    bootloaderCatalogTargets: async () => [
      {
        board_id: 140,
        platform: "CubeOrange",
        brand_name: "Cube Orange",
        manufacturer: "Hex",
        vehicle_types: ["Copter", "Plane"],
        latest_version: "4.5.0",
      },
    ],
    catalogEntries: async () => [
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
    installReadiness: async (request: FirmwareInstallReadinessRequest) => ({
      request_token: computeFirmwareInstallReadinessToken(request),
      session_status: { kind: "idle" },
      readiness: request.source.kind === "catalog_url" && request.source.url.trim().length === 0
        ? { kind: "blocked", reason: "source_missing" }
        : request.port.trim().length === 0
          ? { kind: "blocked", reason: "port_unselected" }
          : { kind: "advisory" },
      bootloader_status: { kind: "unknown" },
    }),
    rebootToBootloader: async () => ({ result: "unsupported", reason: "not connected" }),
    detectBootloaderBoard: async (port: string) => ({ port, board_id: 140, board_rev: 1, bootloader_rev: 5, flash_size: 2_097_152, extf_size: null }),
    startFirmwareInstallUpdate: async () => ({ result: "verified", board_id: 140, bootloader_rev: 5, port: "/dev/ttyACM0" }),
    startBootloaderInstallation: async () => ({ result: "verified" }),
    subscribeProgress: async () => () => undefined,
    formatError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  } satisfies FirmwareService;
}

function createHarnessSerialPortInventoryStore(): SerialPortInventoryStore {
  return createSerialPortInventoryStore({
    listPorts: async () => ({
      kind: "available",
      ports: [
        {
          port_name: "/dev/ttyACM0",
          vid: null,
          pid: null,
          serial_number: null,
          manufacturer: "Hex",
          product: "CubeOrange Bootloader",
          location: null,
        },
      ],
      can_request_web_serial: false,
    }),
    requestWebSerialPort: async () => null,
    formatError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  });
}

function createHarnessFirmwareFileIo(): FirmwareFileIo {
  return createFirmwareFileIo({
    openBinaryFile: async () => null,
  });
}

function createHarnessFirmwareWorkspaceContext(options: {
  store?: FirmwareWorkspaceStore;
  service?: FirmwareService;
  fileIo?: FirmwareFileIo;
} = {}): FirmwareWorkspaceContext {
  const service = options.service ?? createHarnessFirmwareService();
  const fileIo = options.fileIo ?? createHarnessFirmwareFileIo();
  const store = options.store ?? createFirmwareWorkspaceStore(service, { sessionPollMs: 0 });

  return {
    store,
    service,
    fileIo,
  } satisfies FirmwareWorkspaceContext;
}

export function createStaticShellChromeStore(tier: ShellTier): ShellChromeStore {
  switch (tier) {
    case "phone":
      return readable(createShellChromeState({}, { width: 390, height: 844 }, tier));
    case "tablet":
      return readable(createShellChromeState({ sm: true, md: true }, { width: 834, height: 720 }, tier));
    case "desktop":
      return readable(
        createShellChromeState(
          { sm: true, md: true, lg: true },
          { width: 1180, height: 720 },
          tier,
        ),
      );
    default:
      return readable(
        createShellChromeState(
          { sm: true, md: true, lg: true, xl: true },
          { width: 1440, height: 900 },
          "wide",
        ),
      );
  }
}

export function withSessionContext(
  store: SessionStore,
  component: unknown,
  options: { serialInventory?: SerialPortInventoryStore } = {},
) {
  const renderable = asRenderable(component);

  return function SessionHarness(...args: any[]) {
    const sessionView = createSessionViewStore(store);
    const serialInventory = options.serialInventory ?? createHarnessSerialPortInventoryStore();

    setSessionStoreContext(store);
    setSessionViewStoreContext(sessionView);
    setSerialPortInventoryContext(serialInventory);

    return renderable(...args);
  };
}

export function withParameterWorkspaceContext(store: ParamsStore, component: unknown) {
  const renderable = asRenderable(component);

  return function ParameterWorkspaceHarness(...args: any[]) {
    const parameterView = createParameterWorkspaceViewStore(store);

    setParamsStoreContext(store);
    setParameterWorkspaceViewStoreContext(parameterView);

    return renderable(...args);
  };
}

export function withShellContexts(
  store: SessionStore,
  parameterStore: ParamsStore,
  component: unknown,
  options: {
    setupWorkspaceStore?: SetupWorkspaceStore;
    chromeStore?: ShellChromeStore;
  } = {},
) {
  const renderable = asRenderable(component);

  return function AppShellHarness(...args: any[]) {
    const chrome = options.chromeStore ?? createShellChromeStore();
    const sessionView = createSessionViewStore(store);
    const operatorWorkspaceView = createOperatorWorkspaceViewStore(store);
    const parameterWorkspaceView = createParameterWorkspaceViewStore(parameterStore);
    const setupWorkspaceStore = options.setupWorkspaceStore ?? createSetupWorkspaceStore(store, parameterStore);
    const setupWorkspaceViewStore = createSetupWorkspaceViewStore(setupWorkspaceStore);
    const liveSettingsStore = createHarnessLiveSettingsStore(store);
    const missionPlannerStore = createHarnessMissionPlannerStore(store);
    const missionPlannerViewStore = createMissionPlannerViewStore(missionPlannerStore);
    const firmwareWorkspaceContext = createHarnessFirmwareWorkspaceContext();
    const serialInventory = createHarnessSerialPortInventoryStore();

    setSessionStoreContext(store);
    setSessionViewStoreContext(sessionView);
    setSerialPortInventoryContext(serialInventory);
    setOperatorWorkspaceViewStoreContext(operatorWorkspaceView);
    setParamsStoreContext(parameterStore);
    setParameterWorkspaceViewStoreContext(parameterWorkspaceView);
    setSetupWorkspaceStoreContext(setupWorkspaceStore);
    setSetupWorkspaceViewStoreContext(setupWorkspaceViewStore);
    setMissionPlannerStoreContext(missionPlannerStore);
    setMissionPlannerViewStoreContext(missionPlannerViewStore);
    setRuntimeStoreContext(runtime);
    setShellChromeStoreContext(chrome);
    setLiveSettingsStoreContext(liveSettingsStore);
    setFirmwareWorkspaceContext(firmwareWorkspaceContext);

    return renderable(...args);
  };
}

export function withLiveSettingsContext(
  store: LiveSettingsStore,
  component: unknown,
  options: {
    chromeStore?: ShellChromeStore;
    tier?: ShellTier;
  } = {},
) {
  const renderable = asRenderable(component);

  return function LiveSettingsHarness(...args: any[]) {
    const chromeStore = options.chromeStore ?? createStaticShellChromeStore(options.tier ?? "wide");

    setShellChromeStoreContext(chromeStore);
    setLiveSettingsStoreContext(store);

    return renderable(...args);
  };
}
