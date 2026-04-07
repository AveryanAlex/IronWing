import { readable } from "svelte/store";

import type { FirmwareFileIo } from "../lib/firmware-file-io";
import { createFirmwareFileIo } from "../lib/firmware-file-io";
import {
  computeSerialReadinessToken,
  type FirmwareService,
} from "../lib/platform/firmware";
import {
  createFirmwareWorkspaceStore,
  type FirmwareWorkspaceStore,
} from "../lib/stores/firmware-workspace";
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
    serialPreflight: async () => ({
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
      detected_board_id: null,
      session_ready: true,
      session_status: { kind: "idle" },
    }),
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
    recoveryCatalogTargets: async () => [
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
    serialReadiness: async (request) => ({
      request_token: computeSerialReadinessToken(request),
      session_status: { kind: "idle" },
      readiness: request.source.kind === "catalog_url" && request.source.url.trim().length === 0
        ? { kind: "blocked", reason: "source_missing" }
        : request.port.trim().length === 0
          ? { kind: "blocked", reason: "port_unselected" }
          : { kind: "advisory" },
      target_hint: { detected_board_id: null },
      validation_pending: false,
      bootloader_transition: { kind: "manual_bootloader_entry_required" },
    }),
    flashSerial: async () => ({ result: "verified", board_id: 140, bootloader_rev: 5, port: "/dev/ttyACM0" }),
    flashDfuRecovery: async () => ({ result: "verified" }),
    subscribeProgress: async () => () => undefined,
    formatError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  } satisfies FirmwareService;
}

function createHarnessFirmwareFileIo(): FirmwareFileIo {
  return createFirmwareFileIo({
    openBinaryFile: async () => null,
  });
}

export function createHarnessFirmwareWorkspaceContext(options: {
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

export function withSessionContext(store: SessionStore, component: unknown) {
  const renderable = asRenderable(component);

  return function SessionHarness(...args: any[]) {
    const sessionView = createSessionViewStore(store);

    setSessionStoreContext(store);
    setSessionViewStoreContext(sessionView);

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

export function withSetupWorkspaceContext(
  sessionStore: SessionStore,
  parameterStore: ParamsStore,
  component: unknown,
) {
  const renderable = asRenderable(component);

  return function SetupWorkspaceHarness(...args: any[]) {
    const parameterWorkspaceView = createParameterWorkspaceViewStore(parameterStore);
    const setupWorkspaceStore = createSetupWorkspaceStore(sessionStore, parameterStore);
    const setupWorkspaceViewStore = createSetupWorkspaceViewStore(setupWorkspaceStore);

    setSessionStoreContext(sessionStore);
    setParamsStoreContext(parameterStore);
    setParameterWorkspaceViewStoreContext(parameterWorkspaceView);
    setSetupWorkspaceStoreContext(setupWorkspaceStore);
    setSetupWorkspaceViewStoreContext(setupWorkspaceViewStore);

    return renderable(...args);
  };
}

export function withShellContexts(
  store: SessionStore,
  parameterStore: ParamsStore,
  component: unknown,
  options: {
    liveSettingsStore?: LiveSettingsStore;
    missionPlannerStore?: MissionPlannerStore;
    missionPlannerViewStore?: MissionPlannerViewStore;
    setupWorkspaceStore?: SetupWorkspaceStore;
    setupWorkspaceViewStore?: SetupWorkspaceViewStore;
    firmwareWorkspaceContext?: FirmwareWorkspaceContext;
  } = {},
) {
  const renderable = asRenderable(component);

  return function AppShellHarness(...args: any[]) {
    const chrome = createShellChromeStore();
    const sessionView = createSessionViewStore(store);
    const operatorWorkspaceView = createOperatorWorkspaceViewStore(store);
    const parameterWorkspaceView = createParameterWorkspaceViewStore(parameterStore);
    const setupWorkspaceStore = options.setupWorkspaceStore ?? createSetupWorkspaceStore(store, parameterStore);
    const setupWorkspaceViewStore = options.setupWorkspaceViewStore ?? createSetupWorkspaceViewStore(setupWorkspaceStore);
    const liveSettingsStore = options.liveSettingsStore ?? createHarnessLiveSettingsStore(store);
    const missionPlannerStore = options.missionPlannerStore ?? createHarnessMissionPlannerStore(store);
    const missionPlannerViewStore = options.missionPlannerViewStore ?? createMissionPlannerViewStore(missionPlannerStore);
    const firmwareWorkspaceContext = options.firmwareWorkspaceContext ?? createHarnessFirmwareWorkspaceContext();

    setSessionStoreContext(store);
    setSessionViewStoreContext(sessionView);
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
