// @vitest-environment jsdom

import { get, writable, type Writable } from "svelte/store";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  resetTerrainStateMock,
  setTerrainStateMock,
  terrainControllerMock,
} = vi.hoisted(() => {
  const createInitialTerrainState = () => ({
    status: "idle",
    profile: null,
    warningsByIndex: new Map<number, string>(),
    warningSummary: {
      total: 0,
      belowTerrain: 0,
      nearTerrain: 0,
      noData: 0,
      actionable: 0,
    },
    detail: "Terrain profile is idle. Add positional mission items to sample the route.",
    lastError: null,
    isStale: false,
    canRetry: false,
    requestedPathPointCount: 0,
    sampledPathPointCount: 0,
    tileSummary: {
      okTiles: 0,
      errorTiles: 0,
      noDataTiles: 0,
    },
  });

  let currentTerrainState = createInitialTerrainState();
  const subscribers = new Set<(value: typeof currentTerrainState) => void>();

  const emit = () => {
    for (const subscriber of subscribers) {
      subscriber(currentTerrainState);
    }
  };

  const terrainControllerMock = {
    subscribe(run: (value: typeof currentTerrainState) => void) {
      run(currentTerrainState);
      subscribers.add(run);
      return () => {
        subscribers.delete(run);
      };
    },
    load: vi.fn(async () => undefined),
    retry: vi.fn(async () => undefined),
    reset: vi.fn(() => {
      currentTerrainState = createInitialTerrainState();
      emit();
    }),
  };

  return {
    terrainControllerMock,
    setTerrainStateMock(next: Partial<typeof currentTerrainState>) {
      currentTerrainState = {
        ...currentTerrainState,
        ...next,
        warningsByIndex: next.warningsByIndex ?? currentTerrainState.warningsByIndex,
        warningSummary: next.warningSummary ?? currentTerrainState.warningSummary,
        tileSummary: next.tileSummary ?? currentTerrainState.tileSummary,
      };
      emit();
    },
    resetTerrainStateMock() {
      currentTerrainState = createInitialTerrainState();
      terrainControllerMock.load.mockReset();
      terrainControllerMock.retry.mockReset();
      terrainControllerMock.reset.mockReset();
      emit();
    },
  };
});

vi.mock("../../lib/mission-terrain-state", () => ({
  createMissionTerrainState: vi.fn(() => terrainControllerMock),
}));

vi.mock("uplot", () => ({
  default: class UPlotMock {
    data: unknown;
    select = { left: 0, top: 0, width: 0, height: 0 };

    constructor(_options: unknown, data: unknown) {
      this.data = data;
    }

    destroy() {}
    setCursor() {}
    setData(data: unknown) {
      this.data = data;
    }
    setSelect(selection: { left: number; top: number; width: number; height: number }) {
      this.select = selection;
    }
    setSize() {}
    posToVal(value: number) {
      return value;
    }
    valToPos(value: number) {
      return value;
    }
  },
}));

import MissionWorkspace from "./MissionWorkspace.svelte";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";
import {
  setMissionPlannerStoreContext,
  setMissionPlannerViewStoreContext,
  setShellChromeStoreContext,
} from "../../app/shell/runtime-context";
import type { HomePosition, MissionPlan, MissionState, TransferProgress } from "../../mission";
import type { OpenSessionSnapshot, SessionEnvelope } from "../../session";
import type { TransportDescriptor } from "../../transport";
import type {
  SessionConnectionFormState,
  SessionService,
  SessionServiceEventHandlers,
} from "../../lib/platform/session";
import type {
  MissionPlannerService,
  MissionPlannerServiceEventHandlers,
  MissionPlannerWorkspaceTransfer,
} from "../../lib/platform/mission-planner";
import type {
  MissionPlanFileExportResult,
  MissionPlanFileImportResult,
  MissionPlanFileIo,
} from "../../lib/mission-plan-file-io";
import type { SurveyDraftExtension } from "../../lib/survey-region";
import { createSurveyDraftExtension, hydrateSurveyRegion } from "../../lib/survey-region";
import { getBuiltinCameras } from "../../lib/survey-camera-catalog";
import { commandPosition, geoPoint3dAltitude, geoPoint3dLatLon, type FenceRegion } from "../../lib/mavkit-types";
import {
  createMissionPlannerStore,
  createMissionPlannerViewStore,
} from "../../lib/stores/mission-planner";
import { createSessionStore } from "../../lib/stores/session";
import { createShellChromeState } from "../../app/shell/chrome-state";
import { createStaticShellChromeStore } from "../../test/context-harnesses";

type RenderableComponent = (...args: any[]) => unknown;

function asRenderable(component: unknown): RenderableComponent {
  return component as RenderableComponent;
}

const BUILTIN_CAMERA = getBuiltinCameras().find((camera) => camera.canonicalName === "DJI Mavic 3E") ?? getBuiltinCameras()[0]!;

function deferred<T>() {
  let resolve: (value: T) => void;
  let reject: (reason?: unknown) => void;

  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    resolve: resolve!,
    reject: reject!,
  };
}

function createEnvelope(
  sessionId: string,
  overrides: Partial<SessionEnvelope> = {},
): SessionEnvelope {
  return {
    session_id: sessionId,
    source_kind: "live",
    seek_epoch: 0,
    reset_revision: 0,
    ...overrides,
  };
}

function createSnapshot(overrides: Partial<OpenSessionSnapshot> = {}): OpenSessionSnapshot {
  return {
    envelope: createEnvelope("session-1"),
    session: {
      available: true,
      complete: true,
      provenance: "bootstrap",
      value: {
        status: "active",
        connection: { kind: "connected" },
        vehicle_state: {
          armed: false,
          custom_mode: 0,
          mode_name: "Stabilize",
          system_status: "standby",
          vehicle_type: "quadrotor",
          autopilot: "ardu_pilot_mega",
          system_id: 1,
          component_id: 1,
          heartbeat_received: true,
        },
        home_position: null,
      },
    },
    telemetry: {
      available: false,
      complete: false,
      provenance: "bootstrap",
      value: null,
    },
    mission_state: {
      plan: null,
      current_index: null,
      sync: "current",
      active_op: null,
    },
    param_store: null,
    param_progress: null,
    support: {
      available: false,
      complete: false,
      provenance: "bootstrap",
      value: null,
    },
    sensor_health: {
      available: false,
      complete: false,
      provenance: "bootstrap",
      value: null,
    },
    configuration_facts: {
      available: false,
      complete: false,
      provenance: "bootstrap",
      value: null,
    },
    calibration: {
      available: false,
      complete: false,
      provenance: "bootstrap",
      value: null,
    },
    guided: {
      available: false,
      complete: false,
      provenance: "bootstrap",
      value: null,
    },
    status_text: {
      available: true,
      complete: true,
      provenance: "bootstrap",
      value: { entries: [] },
    },
    playback: { cursor_usec: null },
    ...overrides,
  };
}

function createTransportDescriptors(): TransportDescriptor[] {
  return [
    {
      kind: "udp",
      label: "UDP",
      available: true,
      validation: { bind_addr_required: true },
    },
  ];
}

function createSessionHarness(
  snapshots: OpenSessionSnapshot[],
  overrides: Partial<SessionService> = {},
) {
  let handlers: SessionServiceEventHandlers | null = null;
  const queue = [...snapshots];
  const defaultConnectionForm: SessionConnectionFormState = {
    mode: "udp",
    udpBind: "0.0.0.0:14550",
    tcpAddress: "127.0.0.1:5760",
    serialPort: "",
    baud: 57600,
    selectedBtDevice: "",
    takeoffAlt: "10",
    followVehicle: true,
  };

  const service = {
    loadConnectionForm: vi.fn(() => ({ ...defaultConnectionForm })),
    persistConnectionForm: vi.fn(),
    openSessionSnapshot: vi.fn(async () => queue.shift() ?? snapshots[snapshots.length - 1]),
    ackSessionSnapshot: vi.fn(async () => ({ result: "accepted" as const })),
    subscribeAll: vi.fn(async (nextHandlers: SessionServiceEventHandlers) => {
      handlers = nextHandlers;
      return () => {
        handlers = null;
      };
    }),
    availableTransportDescriptors: vi.fn(async () => createTransportDescriptors()),
    describeTransportAvailability: vi.fn(() => "UDP available"),
    validateTransportDescriptor: vi.fn(() => []),
    buildConnectRequest: vi.fn(() => ({ transport: { kind: "udp" as const, bind_addr: "0.0.0.0:14550" } })),
    connectSession: vi.fn(async () => undefined),
    disconnectSession: vi.fn(async () => undefined),
    listSerialPorts: vi.fn(async () => []),
    btRequestPermissions: vi.fn(async () => undefined),
    btScanBle: vi.fn(async () => []),
    btGetBondedDevices: vi.fn(async () => []),
    getAvailableModes: vi.fn(async () => []),
    formatError: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
    ...overrides,
  } satisfies SessionService;

  return {
    service,
    emit<K extends keyof SessionServiceEventHandlers>(
      event: K,
      payload: Parameters<SessionServiceEventHandlers[K]>[0],
    ) {
      if (!handlers) {
        throw new Error("session handlers are not registered");
      }

      handlers[event](payload as never);
    },
  };
}

function createPlannerServiceHarness(overrides: Partial<MissionPlannerService> = {}) {
  let handlers: MissionPlannerServiceEventHandlers | null = null;

  const service = {
    subscribeAll: vi.fn(async (nextHandlers: MissionPlannerServiceEventHandlers) => {
      handlers = nextHandlers;
      return () => {
        handlers = null;
      };
    }),
    downloadWorkspace: vi.fn(async (): Promise<MissionPlannerWorkspaceTransfer> => ({
      mission: { items: [] },
      fence: { return_point: null, regions: [] },
      rally: { points: [] },
      home: null,
    })),
    uploadWorkspace: vi.fn(async () => undefined),
    clearWorkspace: vi.fn(async () => undefined),
    validateMission: vi.fn(async () => []),
    cancelTransfer: vi.fn(async () => undefined),
    formatError: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
    ...overrides,
  } satisfies MissionPlannerService;

  return {
    service,
    emitMissionState(envelope: SessionEnvelope, value: MissionState) {
      if (!handlers) {
        throw new Error("planner handlers are not registered");
      }

      handlers.onMissionState({ envelope, value });
    },
    emitMissionProgress(envelope: SessionEnvelope, value: TransferProgress) {
      if (!handlers) {
        throw new Error("planner handlers are not registered");
      }

      handlers.onMissionProgress({ envelope, value });
    },
  };
}

function createFileIoHarness(overrides: Partial<MissionPlanFileIo> = {}) {
  const fileIo = {
    importFromPicker: vi.fn(async (): Promise<MissionPlanFileImportResult> => ({ status: "cancelled" })),
    exportToPicker: vi.fn(async (): Promise<MissionPlanFileExportResult> => ({ status: "cancelled" })),
    ...overrides,
  } satisfies MissionPlanFileIo;

  return { fileIo };
}

function makeWorkspace(
  overrides: Partial<{
    mission: MissionPlan;
    home: HomePosition | null;
    survey: SurveyDraftExtension;
    cruiseSpeed: number;
    hoverSpeed: number;
  }> = {},
) {
  return {
    mission: overrides.mission ?? {
      items: [
        {
          command: {
            Nav: {
              Waypoint: {
                position: {
                  RelHome: {
                    latitude_deg: 47.4,
                    longitude_deg: 8.55,
                    relative_alt_m: 25,
                  },
                },
                hold_time_s: 0,
                acceptance_radius_m: 1,
                pass_radius_m: 0,
                yaw_deg: 0,
              },
            },
          },
          current: true,
          autocontinue: true,
        },
      ],
    },
    fence: { return_point: null, regions: [] },
    rally: { points: [] },
    home: overrides.home ?? null,
    survey: overrides.survey ?? createSurveyDraftExtension(),
    cruiseSpeed: overrides.cruiseSpeed ?? 15,
    hoverSpeed: overrides.hoverSpeed ?? 5,
  };
}

function makeFencePolygonRegion(inclusion = true): FenceRegion {
  return inclusion
    ? {
      inclusion_polygon: {
        vertices: [
          { latitude_deg: 47.401, longitude_deg: 8.551 },
          { latitude_deg: 47.403, longitude_deg: 8.551 },
          { latitude_deg: 47.403, longitude_deg: 8.553 },
          { latitude_deg: 47.401, longitude_deg: 8.553 },
        ],
        inclusion_group: 0,
      },
    }
    : {
      exclusion_polygon: {
        vertices: [
          { latitude_deg: 47.404, longitude_deg: 8.554 },
          { latitude_deg: 47.4055, longitude_deg: 8.554 },
          { latitude_deg: 47.4055, longitude_deg: 8.556 },
          { latitude_deg: 47.404, longitude_deg: 8.556 },
        ],
      },
    };
}

function makeFenceCircleRegion(inclusion = false): FenceRegion {
  return inclusion
    ? {
      inclusion_circle: {
        center: { latitude_deg: 47.4062, longitude_deg: 8.5572 },
        radius_m: 90,
        inclusion_group: 0,
      },
    }
    : {
      exclusion_circle: {
        center: { latitude_deg: 47.4062, longitude_deg: 8.5572 },
        radius_m: 90,
      },
    };
}

function makeFenceWorkspace() {
  return {
    ...makeWorkspace({
      home: { latitude_deg: 47.4, longitude_deg: 8.55, altitude_m: 500 },
    }),
    fence: {
      return_point: { latitude_deg: 47.4075, longitude_deg: 8.5581 },
      regions: [makeFencePolygonRegion(true), makeFenceCircleRegion(false)],
    },
  };
}

function makePlaybackFenceWorkspace() {
  return {
    ...makeWorkspace({
      home: { latitude_deg: 47.4, longitude_deg: 8.55, altitude_m: 500 },
    }),
    fence: {
      return_point: { latitude_deg: 47.4075, longitude_deg: 8.5581 },
      regions: [makeFencePolygonRegion(true)],
    },
  };
}

function makeRallyWorkspace() {
  return {
    ...makeWorkspace({
      home: { latitude_deg: 47.4, longitude_deg: 8.55, altitude_m: 500 },
    }),
    rally: {
      points: [
        {
          RelHome: {
            latitude_deg: 47.4012,
            longitude_deg: 8.5512,
            relative_alt_m: 25,
          },
        },
        {
          Msl: {
            latitude_deg: 47.4024,
            longitude_deg: 8.5528,
            altitude_msl_m: 530,
          },
        },
      ],
    },
  };
}

function makeImportedSurveyExtension(): SurveyDraftExtension {
  const extension = createSurveyDraftExtension();
  const parsed = {
    patternType: "grid" as const,
    position: 0,
    polygon: [
      { latitude_deg: 47.3981, longitude_deg: 8.5451 },
      { latitude_deg: 47.3984, longitude_deg: 8.5463 },
      { latitude_deg: 47.3977, longitude_deg: 8.5468 },
    ],
    polyline: [],
    camera: null,
    params: {
      altitude_m: 55,
      sideOverlap_pct: 65,
      frontOverlap_pct: 80,
    },
    embeddedItems: [
      {
        command: { Nav: "ReturnToLaunch" as const },
        current: false,
        autocontinue: true,
      },
    ],
    qgcPassthrough: {},
    warnings: ["Preserved survey metadata from import."],
  };
  const region = hydrateSurveyRegion(parsed);

  extension.surveyRegions.set(region.id, region);
  extension.surveyRegionOrder.push({ regionId: region.id, position: 0 });
  return extension;
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

function createResponsiveChromeStore(width: number, height: number, tierOverride?: string) {
  return writable(createResponsiveChromeState(width, height, tierOverride));
}

function withMissionPlannerContexts(
  store: ReturnType<typeof createMissionPlannerStore>,
  component: unknown,
  options: {
    chromeStore?: ReturnType<typeof createStaticShellChromeStore> | Writable<ReturnType<typeof createShellChromeState>>;
    includeShellChromeContext?: boolean;
  } = {},
) {
  const renderable = asRenderable(component);

  return function MissionPlannerHarness(...args: any[]) {
    setMissionPlannerStoreContext(store);
    setMissionPlannerViewStoreContext(createMissionPlannerViewStore(store));
    if (options.includeShellChromeContext !== false) {
      setShellChromeStoreContext(options.chromeStore ?? createStaticShellChromeStore("wide"));
    }
    return renderable(...args);
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

function setMissionMapSurfaceRect() {
  const surface = screen.getByTestId(missionWorkspaceTestIds.mapSurface);
  Object.defineProperty(surface, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 900,
      bottom: 600,
      width: 900,
      height: 600,
      toJSON: () => ({}),
    }),
  });
  return surface;
}

function readMissionMapDebug() {
  return JSON.parse(screen.getByTestId(missionWorkspaceTestIds.mapDebug).textContent ?? "{}");
}

async function renderWorkspace(options: {
  snapshots?: OpenSessionSnapshot[];
  plannerServiceOverrides?: Partial<MissionPlannerService>;
  fileIoOverrides?: Partial<MissionPlanFileIo>;
  chromeStore?: ReturnType<typeof createStaticShellChromeStore> | Writable<ReturnType<typeof createShellChromeState>>;
  includeShellChromeContext?: boolean;
  setup?: (context: {
    plannerStore: ReturnType<typeof createMissionPlannerStore>;
    sessionStore: ReturnType<typeof createSessionStore>;
  }) => Promise<void> | void;
} = {}) {
  const sessionHarness = createSessionHarness(options.snapshots ?? [createSnapshot()]);
  const plannerHarness = createPlannerServiceHarness(options.plannerServiceOverrides);
  const fileHarness = createFileIoHarness(options.fileIoOverrides);
  const sessionStore = createSessionStore(sessionHarness.service);
  const plannerStore = createMissionPlannerStore(sessionStore, plannerHarness.service, fileHarness.fileIo);

  await sessionStore.initialize();
  await plannerStore.initialize();

  if (options.setup) {
    await options.setup({ plannerStore, sessionStore });
    await flush();
  }

  render(withMissionPlannerContexts(plannerStore, MissionWorkspace, {
    chromeStore: options.chromeStore,
    includeShellChromeContext: options.includeShellChromeContext,
  }));

  return {
    sessionStore,
    plannerStore,
    plannerHarness,
    fileHarness,
    sessionHarness,
  };
}

describe("MissionWorkspace", () => {
  beforeEach(() => {
    resetTerrainStateMock();
    if (typeof localStorage?.clear === "function") {
      localStorage.clear();
    }
  });

  afterEach(() => {
    cleanup();
  });

  it("shows entry actions first and mounts the real editor after starting a blank mission", async () => {
    const { plannerStore } = await renderWorkspace();

    expect(screen.getByTestId(missionWorkspaceTestIds.root)).toBeTruthy();
    expect(screen.getByTestId(missionWorkspaceTestIds.empty)).toBeTruthy();
    expect(screen.getByTestId(missionWorkspaceTestIds.entryRead)).toBeTruthy();
    expect(screen.getByTestId(missionWorkspaceTestIds.entryImport)).toBeTruthy();
    expect(screen.getByTestId(missionWorkspaceTestIds.entryImportKml)).toBeTruthy();
    expect(screen.getByTestId(missionWorkspaceTestIds.entryNew)).toBeTruthy();
    expect(screen.getByTestId(missionWorkspaceTestIds.layoutMode).textContent).toContain("wide");
    expect(screen.getByTestId(missionWorkspaceTestIds.layoutTier).textContent).toContain("1440×900");
    expect(screen.getByTestId(missionWorkspaceTestIds.phoneSegmentState).textContent).toContain("all-visible");

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.entryNew));

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.ready)).toBeTruthy();
      expect(screen.getByTestId(missionWorkspaceTestIds.localNote).textContent).toContain("Blank mission draft ready");
    });

    expect(screen.getByTestId(missionWorkspaceTestIds.homeCard)).toBeTruthy();
    expect(screen.getByTestId(missionWorkspaceTestIds.map)).toBeTruthy();
    expect(screen.getByTestId(missionWorkspaceTestIds.mapPane).getAttribute("data-visible")).toBe("true");
    expect(screen.getByTestId(missionWorkspaceTestIds.planPane).getAttribute("data-visible")).toBe("true");
    expect(screen.queryByTestId(missionWorkspaceTestIds.phoneSegmentBar)).toBeNull();
    expect(screen.getByTestId(missionWorkspaceTestIds.mapStatus).textContent).toContain("empty");
    expect(screen.getByTestId(missionWorkspaceTestIds.mapEmpty)).toBeTruthy();
    expect(screen.getByTestId(missionWorkspaceTestIds.draftList)).toBeTruthy();
    expect(screen.getByTestId(missionWorkspaceTestIds.listEmpty)).toBeTruthy();
    expect(screen.getByTestId(missionWorkspaceTestIds.inspectorSelectionKind).textContent).toContain("home");
    expect(get(plannerStore).workspaceMounted).toBe(true);
  });

  it("falls back to a desktop-style mission layout when shell chrome context is missing", async () => {
    await renderWorkspace({ includeShellChromeContext: false });

    expect(screen.getByTestId(missionWorkspaceTestIds.root)).toBeTruthy();
    expect(screen.getByTestId(missionWorkspaceTestIds.layoutMode).textContent).toContain("wide");
    expect(screen.getByTestId(missionWorkspaceTestIds.layoutTier).textContent).toContain("1440×900");
    expect(screen.getByTestId(missionWorkspaceTestIds.layoutTierMismatch).textContent).toContain("match");
    expect(screen.getByTestId(missionWorkspaceTestIds.phoneSegmentState).textContent).toContain("all-visible");
  });

  it("derives wide, compact-wide, and phone-segmented mission shells from shell chrome context", async () => {
    const chromeStore = createResponsiveChromeStore(1440, 900, "wide");

    await renderWorkspace({
      chromeStore,
      plannerServiceOverrides: {
        validateMission: vi.fn(async () => [{
          code: "waypoint_alt_low",
          message: "Waypoint altitude is below the safety margin.",
          severity: "warning" as const,
        }]),
      },
      setup: ({ plannerStore }) => {
        plannerStore.replaceWorkspace(makeWorkspace());
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.ready)).toBeTruthy();
      expect(screen.getByTestId(missionWorkspaceTestIds.layoutMode).textContent).toContain("wide");
      expect(screen.getByTestId(missionWorkspaceTestIds.detailColumns).textContent).toContain("split");
    });
    expect(screen.queryByTestId(missionWorkspaceTestIds.phoneSegmentBar)).toBeNull();
    expect(screen.getByTestId(missionWorkspaceTestIds.mapPane).getAttribute("data-visible")).toBe("true");
    expect(screen.getByTestId(missionWorkspaceTestIds.planPane).getAttribute("data-visible")).toBe("true");

    chromeStore.set(createResponsiveChromeState(1280, 720, "wide"));

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.layoutMode).textContent).toContain("compact-wide");
      expect(screen.getByTestId(missionWorkspaceTestIds.detailColumns).textContent).toContain("stacked");
      expect(screen.getByTestId(missionWorkspaceTestIds.supportPlacement).textContent).toContain("below");
    });
    expect(screen.queryByTestId(missionWorkspaceTestIds.phoneSegmentBar)).toBeNull();

    chromeStore.set(createResponsiveChromeState(390, 844, "phone"));

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.layoutMode).textContent).toContain("phone-segmented");
      expect(screen.getByTestId(missionWorkspaceTestIds.phoneSegmentBar)).toBeTruthy();
      expect(screen.getByTestId(missionWorkspaceTestIds.phoneSegmentState).textContent).toContain("plan");
    });
    expect(screen.getByTestId(missionWorkspaceTestIds.mapPane).getAttribute("data-visible")).toBe("false");
    expect(screen.getByTestId(missionWorkspaceTestIds.planPane).getAttribute("data-visible")).toBe("true");

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.phoneSegmentMap));

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.phoneSegmentState).textContent).toContain("map");
      expect(screen.getByTestId(missionWorkspaceTestIds.mapPane).getAttribute("data-visible")).toBe("true");
      expect(screen.getByTestId(missionWorkspaceTestIds.planPane).getAttribute("data-visible")).toBe("false");
    });

    chromeStore.set(createResponsiveChromeState(1440, 900, "wide"));
    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.layoutMode).textContent).toContain("wide");
    });

    chromeStore.set(createResponsiveChromeState(390, 844, "phone"));
    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.phoneSegmentState).textContent).toContain("map");
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.toolbarValidate));
    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.warningValidation).textContent).toContain("Waypoint altitude is below the safety margin.");
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.phoneSegmentPlan));
    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.phoneSegmentState).textContent).toContain("plan");
      expect(screen.getByTestId(missionWorkspaceTestIds.planPane).getAttribute("data-visible")).toBe("true");
    });
    expect(screen.getByTestId(missionWorkspaceTestIds.warningValidation)).toBeTruthy();
  });

  it("keeps fence editors reachable on phone without reviving mission-only segment controls", async () => {
    const chromeStore = createResponsiveChromeStore(390, 844, "phone");

    await renderWorkspace({
      chromeStore,
      setup: ({ plannerStore }) => {
        plannerStore.replaceWorkspace(makeFenceWorkspace());
        plannerStore.setMode("fence");
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.layoutMode).textContent).toContain("phone-stack");
      expect(screen.getByTestId(missionWorkspaceTestIds.fenceList)).toBeTruthy();
      expect(screen.getByTestId(missionWorkspaceTestIds.phoneSegmentState).textContent).toContain("all-visible");
    });
    expect(screen.queryByTestId(missionWorkspaceTestIds.phoneSegmentBar)).toBeNull();
  });

  it("keeps the terrain support panel mounted across wide, compact-wide, and phone mission layouts", async () => {
    const chromeStore = createResponsiveChromeStore(1440, 900, "wide");

    setTerrainStateMock({
      detail: "Sampled terrain across 3 points. 1 near terrain.",
      canRetry: true,
      warningSummary: {
        total: 1,
        belowTerrain: 0,
        nearTerrain: 1,
        noData: 0,
        actionable: 1,
      },
      warningsByIndex: new Map([[0, "near_terrain"]]),
    });

    await renderWorkspace({
      chromeStore,
      setup: ({ plannerStore }) => {
        plannerStore.replaceWorkspace(makeWorkspace());
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.ready)).toBeTruthy();
      expect(screen.getByTestId(missionWorkspaceTestIds.terrainPanel)).toBeTruthy();
      expect(screen.getByTestId(missionWorkspaceTestIds.terrainWarningCount).textContent).toContain("1 warning");
      expect(screen.getByTestId(missionWorkspaceTestIds.terrainRetry)).toBeTruthy();
    });

    chromeStore.set(createResponsiveChromeState(1280, 720, "wide"));
    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.layoutMode).textContent).toContain("compact-wide");
      expect(screen.getByTestId(missionWorkspaceTestIds.terrainPanel)).toBeTruthy();
    });

    chromeStore.set(createResponsiveChromeState(390, 844, "phone"));
    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.layoutMode).textContent).toContain("phone-segmented");
      expect(screen.getByTestId(missionWorkspaceTestIds.planPane).getAttribute("data-visible")).toBe("true");
      expect(screen.getByTestId(missionWorkspaceTestIds.terrainPanel)).toBeTruthy();
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.phoneSegmentMap));
    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.planPane).getAttribute("data-visible")).toBe("false");
      expect(screen.getByTestId(missionWorkspaceTestIds.terrainPanel)).toBeTruthy();
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.phoneSegmentPlan));
    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.planPane).getAttribute("data-visible")).toBe("true");
      expect(screen.getByTestId(missionWorkspaceTestIds.terrainPanel)).toBeTruthy();
    });
  });

  it("jumps terrain warnings to the targeted mission item and refuses stale warning indexes", async () => {
    const mission: MissionPlan = {
      items: [
        {
          command: {
            Nav: {
              Waypoint: {
                position: {
                  RelHome: {
                    latitude_deg: 47.41,
                    longitude_deg: 8.55,
                    relative_alt_m: 20,
                  },
                },
                hold_time_s: 0,
                acceptance_radius_m: 1,
                pass_radius_m: 0,
                yaw_deg: 0,
              },
            },
          },
          current: true,
          autocontinue: true,
        },
        {
          command: {
            Nav: {
              Waypoint: {
                position: {
                  RelHome: {
                    latitude_deg: 47.42,
                    longitude_deg: 8.57,
                    relative_alt_m: 12,
                  },
                },
                hold_time_s: 0,
                acceptance_radius_m: 1,
                pass_radius_m: 0,
                yaw_deg: 0,
              },
            },
          },
          current: false,
          autocontinue: true,
        },
      ],
    };

    setTerrainStateMock({
      status: "ready",
      detail: "Sampled terrain across 5 points. 1 below terrain.",
      canRetry: true,
      warningSummary: {
        total: 1,
        belowTerrain: 1,
        nearTerrain: 0,
        noData: 0,
        actionable: 1,
      },
      warningsByIndex: new Map([[1, "below_terrain"]]),
    });

    const { plannerStore } = await renderWorkspace({
      setup: ({ plannerStore }) => {
        plannerStore.replaceWorkspace(makeWorkspace({ mission }));
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.terrainPanel)).toBeTruthy();
      expect(screen.getByTestId(`${missionWorkspaceTestIds.terrainWarningActionPrefix}-1`)).toBeTruthy();
    });

    const targetUiId = get(plannerStore).draftState.active.mission.draftItems[1]?.uiId;
    expect(targetUiId).toBeTypeOf("number");

    await fireEvent.click(screen.getByTestId(`${missionWorkspaceTestIds.terrainWarningActionPrefix}-1`));

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.inspectorSelectionKind).textContent).toContain("mission-item");
      expect(get(plannerStore).draftState.active.mission.primarySelectedUiId).toBe(targetUiId);
      expect(screen.getByTestId(`${missionWorkspaceTestIds.itemPrefix}-${targetUiId}`).getAttribute("data-selected")).toBe("true");
      expect(screen.getByTestId(`${missionWorkspaceTestIds.mapMarkerPrefix}-${targetUiId}`).getAttribute("data-selected")).toBe("true");
    });

    plannerStore.deleteMissionItem(1);
    plannerStore.selectHome();
    await flush();

    await fireEvent.click(screen.getByTestId(`${missionWorkspaceTestIds.terrainWarningActionPrefix}-1`));

    await waitFor(() => {
      expect(get(plannerStore).selection.kind).toBe("home");
      expect(screen.getByTestId(missionWorkspaceTestIds.localNote).textContent).toContain("no longer active");
    });
  });

  it("selects map surfaces and drags Home plus waypoints through the planner store", async () => {
    const initialHome = { latitude_deg: 47.48, longitude_deg: 8.61, altitude_m: 502 };
    const { plannerStore } = await renderWorkspace({
      setup: ({ plannerStore }) => {
        plannerStore.replaceWorkspace(makeWorkspace({ home: initialHome }));
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.mapSurface)).toBeTruthy();
    });
    setMissionMapSurfaceRect();

    const missionUiId = get(plannerStore).draftState.active.mission.draftItems[0]?.uiId;
    expect(missionUiId).toBeTypeOf("number");

    const waypointMarker = screen.getByTestId(`${missionWorkspaceTestIds.mapMarkerPrefix}-${missionUiId}`);
    await fireEvent.click(waypointMarker);
    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.inspectorSelectionKind).textContent).toContain("mission-item");
    });

    const originalWaypoint = get(plannerStore).draftState.active.mission.draftItems[0]?.preview;
    expect(originalWaypoint?.latitude_deg).toBeTypeOf("number");
    expect(originalWaypoint?.longitude_deg).toBeTypeOf("number");

    await fireEvent.pointerDown(waypointMarker, { clientX: 220, clientY: 360 });
    await fireEvent.pointerMove(window, { clientX: 700, clientY: 220 });
    await fireEvent.pointerMove(window, { clientX: 780, clientY: 180 });
    await fireEvent.pointerUp(window);

    await waitFor(() => {
      const moved = get(plannerStore).draftState.active.mission.draftItems.find((item) => item.uiId === missionUiId);
      expect(moved?.preview.latitude_deg).not.toBe(originalWaypoint?.latitude_deg);
      expect(moved?.preview.longitude_deg).not.toBe(originalWaypoint?.longitude_deg);
    });

    const homeMarker = screen.getByTestId(`${missionWorkspaceTestIds.mapMarkerPrefix}-home`);
    const originalHome = get(plannerStore).home;
    expect(originalHome).toEqual(initialHome);

    await fireEvent.pointerDown(homeMarker, { clientX: 120, clientY: 440 });
    await fireEvent.pointerMove(window, { clientX: 260, clientY: 420 });
    await fireEvent.pointerUp(window);

    await waitFor(() => {
      expect(get(plannerStore).home).not.toEqual(originalHome);
      expect(get(plannerStore).selection.kind).toBe("home");
    });
  });

  it("keeps the selected waypoint stable across list reorders while the map stays mounted", async () => {
    const mission: MissionPlan = {
      items: [
        {
          command: {
            Nav: {
              Waypoint: {
                position: {
                  RelHome: {
                    latitude_deg: 47.41,
                    longitude_deg: 8.55,
                    relative_alt_m: 20,
                  },
                },
                hold_time_s: 0,
                acceptance_radius_m: 1,
                pass_radius_m: 0,
                yaw_deg: 0,
              },
            },
          },
          current: true,
          autocontinue: true,
        },
        {
          command: {
            Nav: {
              Waypoint: {
                position: {
                  RelHome: {
                    latitude_deg: 47.42,
                    longitude_deg: 8.57,
                    relative_alt_m: 24,
                  },
                },
                hold_time_s: 0,
                acceptance_radius_m: 1,
                pass_radius_m: 0,
                yaw_deg: 0,
              },
            },
          },
          current: false,
          autocontinue: true,
        },
      ],
    };

    const { plannerStore } = await renderWorkspace({
      setup: ({ plannerStore }) => {
        plannerStore.replaceWorkspace(makeWorkspace({ mission }));
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.mapSurface)).toBeTruthy();
    });

    const secondUiId = get(plannerStore).draftState.active.mission.draftItems[1]?.uiId;
    expect(secondUiId).toBeTypeOf("number");

    await fireEvent.click(screen.getByTestId(`${missionWorkspaceTestIds.mapMarkerPrefix}-${secondUiId}`));
    await waitFor(() => {
      expect(get(plannerStore).draftState.active.mission.primarySelectedUiId).toBe(secondUiId);
    });

    await fireEvent.click(screen.getByTestId(`${missionWorkspaceTestIds.itemMoveUpPrefix}-${secondUiId}`));

    await waitFor(() => {
      expect(get(plannerStore).draftState.active.mission.draftItems[0]?.uiId).toBe(secondUiId);
      expect(get(plannerStore).draftState.active.mission.primarySelectedUiId).toBe(secondUiId);
      expect(screen.getByTestId(`${missionWorkspaceTestIds.mapMarkerPrefix}-${secondUiId}`).getAttribute("data-selected")).toBe("true");
    });
  });

  it("adds, edits, reorders, and deletes manual mission items through the mounted workspace", async () => {
    const { plannerStore } = await renderWorkspace();

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.entryNew));
    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.ready)).toBeTruthy();
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.listAdd));
    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.inspectorSelectionKind).textContent).toContain("mission-item");
    });

    await fireEvent.change(screen.getByTestId(`${missionWorkspaceTestIds.inspectorFieldPrefix}-hold_time_s`), {
      target: { value: "12" },
    });
    await fireEvent.change(screen.getByTestId(missionWorkspaceTestIds.inspectorLatitude), {
      target: { value: "47.55" },
    });
    await fireEvent.change(screen.getByTestId(missionWorkspaceTestIds.inspectorLongitude), {
      target: { value: "8.66" },
    });
    await fireEvent.change(screen.getByTestId(missionWorkspaceTestIds.inspectorAltitude), {
      target: { value: "120" },
    });

    await waitFor(() => {
      const state = get(plannerStore);
      const edited = state.draftState.active.mission.document.items[0];
      expect("Nav" in edited.command).toBe(true);
      if ("Nav" in edited.command) {
        const waypoint = edited.command.Nav;
        expect(typeof waypoint).toBe("object");
        if (typeof waypoint === "object" && waypoint && "Waypoint" in waypoint) {
          const position = waypoint.Waypoint.position;
          expect(waypoint.Waypoint.hold_time_s).toBe(12);
          expect(geoPoint3dLatLon(position).latitude_deg).toBe(47.55);
          expect(geoPoint3dLatLon(position).longitude_deg).toBe(8.66);
          expect(geoPoint3dAltitude(position).value).toBe(120);
        }
      }
    });

    await fireEvent.change(screen.getByTestId(missionWorkspaceTestIds.inspectorCommandSelect), {
      target: { value: "Nav:ReturnToLaunch" },
    });
    await waitFor(() => {
      expect(screen.queryByTestId(missionWorkspaceTestIds.inspectorLatitude)).toBeNull();
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.listAdd));
    await waitFor(() => {
      expect(get(plannerStore).draftState.active.mission.draftItems).toHaveLength(2);
    });

    const stateAfterSecondAdd = get(plannerStore);
    const firstUiId = stateAfterSecondAdd.draftState.active.mission.draftItems[0]?.uiId;
    const secondUiId = stateAfterSecondAdd.draftState.active.mission.draftItems[1]?.uiId;
    expect(firstUiId).toBeTypeOf("number");
    expect(secondUiId).toBeTypeOf("number");

    await fireEvent.click(screen.getByTestId(`${missionWorkspaceTestIds.itemMoveUpPrefix}-${secondUiId}`));
    await waitFor(() => {
      expect(get(plannerStore).draftState.active.mission.draftItems[0]?.uiId).toBe(secondUiId);
    });

    await fireEvent.click(screen.getByTestId(`${missionWorkspaceTestIds.itemDeletePrefix}-${secondUiId}`));
    await waitFor(() => {
      expect(get(plannerStore).draftState.active.mission.draftItems).toHaveLength(1);
      expect(get(plannerStore).selection.kind).toBe("mission-item");
    });

    await fireEvent.click(screen.getByTestId(`${missionWorkspaceTestIds.itemDeletePrefix}-${firstUiId}`));
    await waitFor(() => {
      expect(get(plannerStore).draftState.active.mission.draftItems).toHaveLength(0);
      expect(get(plannerStore).selection.kind).toBe("home");
    });
  });

  it("creates grid, corridor, and structure survey regions after the current selection inside the shared list", async () => {
    const { plannerStore } = await renderWorkspace({
      setup: ({ plannerStore }) => {
        plannerStore.replaceWorkspace(makeWorkspace({
          home: { latitude_deg: 47.5, longitude_deg: 8.6, altitude_m: 500 },
        }));
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.ready)).toBeTruthy();
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.listAddSurveyGrid));
    await waitFor(() => {
      expect(get(plannerStore).survey.surveyRegionOrder).toHaveLength(1);
      expect(get(plannerStore).selection.kind).toBe("survey-block");
    });

    const firstRegionId = get(plannerStore).survey.surveyRegionOrder[0]?.regionId ?? "";
    const missionUiId = get(plannerStore).draftState.active.mission.draftItems[0]?.uiId ?? -1;

    await fireEvent.click(screen.getByTestId(`${missionWorkspaceTestIds.itemPrefix}-${missionUiId}`));
    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.listAddSurveyCorridor));

    await waitFor(() => {
      expect(get(plannerStore).survey.surveyRegionOrder).toHaveLength(2);
      expect(get(plannerStore).survey.surveyRegionOrder[1]?.position).toBe(1);
    });

    await fireEvent.click(screen.getByTestId(`${missionWorkspaceTestIds.surveyPrefix}-${firstRegionId}`));
    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.listAddSurveyStructure));

    await waitFor(() => {
      const state = get(plannerStore);
      expect(state.survey.surveyRegionOrder).toHaveLength(3);
      expect(state.survey.surveyRegionOrder[0]?.position).toBe(0);
      expect(state.survey.surveyRegionOrder[1]?.position).toBe(0);
      expect(state.survey.surveyRegionOrder[2]?.position).toBe(1);

      const orderedPatterns = state.survey.surveyRegionOrder.map((block) => state.survey.surveyRegions.get(block.regionId)?.patternType);
      expect(orderedPatterns).toEqual(["grid", "structure", "corridor"]);
    });

    expect(screen.getByTestId(missionWorkspaceTestIds.inspectorSelectionKind).textContent).toContain("survey-block");
  });

  it("draws survey regions directly on the blank planner surface and cancels unfinished map sessions safely", async () => {
    const { plannerStore } = await renderWorkspace({
      setup: ({ plannerStore }) => {
        plannerStore.replaceWorkspace(makeWorkspace({
          home: { latitude_deg: 47.5, longitude_deg: 8.6, altitude_m: 500 },
          mission: { items: [] },
        }));
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.ready)).toBeTruthy();
    });

    setMissionMapSurfaceRect();

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.mapDrawStartGrid));
    await waitFor(() => {
      expect(get(plannerStore).selection.kind).toBe("survey-block");
      expect(get(plannerStore).survey.surveyRegionOrder).toHaveLength(1);
    });

    const gridRegionId = get(plannerStore).survey.surveyRegionOrder[0]?.regionId ?? "";
    expect(gridRegionId).not.toBe("");

    let drawSurface = screen.getByRole("button", { name: /add survey point on planner map/i });
    await fireEvent.click(drawSurface, { clientX: 160, clientY: 440 });
    await fireEvent.click(drawSurface, { clientX: 700, clientY: 420 });
    await fireEvent.click(drawSurface, { clientX: 620, clientY: 180 });

    await waitFor(() => {
      const region = get(plannerStore).survey.surveyRegions.get(gridRegionId);
      expect(region?.polygon).toHaveLength(3);
      expect(readMissionMapDebug().drawMode).toBe("draw");
      expect(readMissionMapDebug().drawPointCount).toBe(3);
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.mapDrawFinish));

    await waitFor(() => {
      expect(readMissionMapDebug().drawMode).toBe("idle");
      expect(get(plannerStore).selection).toEqual({ kind: "survey-block", regionId: gridRegionId });
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.mapDrawStartCorridor));
    await waitFor(() => {
      expect(get(plannerStore).survey.surveyRegionOrder).toHaveLength(2);
    });

    const corridorRegionId = get(plannerStore).survey.surveyRegionOrder[1]?.regionId ?? "";
    drawSurface = screen.getByRole("button", { name: /add survey point on planner map/i });
    await fireEvent.click(drawSurface, { clientX: 280, clientY: 260 });
    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.mapDrawCancel));

    await waitFor(() => {
      expect(get(plannerStore).survey.surveyRegions.has(corridorRegionId)).toBe(false);
      expect(get(plannerStore).survey.surveyRegionOrder).toHaveLength(1);
      expect(readMissionMapDebug().drawMode).toBe("idle");
    });
  });

  it("edits selected survey vertices on the map and rejects stale vertex drags after deletion", async () => {
    const { plannerStore } = await renderWorkspace({
      setup: ({ plannerStore }) => {
        plannerStore.replaceWorkspace(makeWorkspace({
          home: { latitude_deg: 47.5, longitude_deg: 8.6, altitude_m: 500 },
        }));
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.ready)).toBeTruthy();
    });

    const surface = setMissionMapSurfaceRect();
    expect(surface).toBeTruthy();

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.listAddSurveyGrid));
    const regionId = get(plannerStore).survey.surveyRegionOrder[0]?.regionId ?? "";
    expect(regionId).not.toBe("");

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.mapDrawEdit));

    const firstHandle = screen.getByTestId(`${missionWorkspaceTestIds.mapVertexPrefix}-${regionId}-polygon-0`);
    const originalPoint = get(plannerStore).survey.surveyRegions.get(regionId)?.polygon[0];

    await fireEvent.pointerDown(firstHandle, { clientX: 220, clientY: 360 });
    await fireEvent.pointerMove(window, { clientX: 780, clientY: 220 });
    await fireEvent.pointerUp(window);

    await waitFor(() => {
      const updatedPoint = get(plannerStore).survey.surveyRegions.get(regionId)?.polygon[0];
      expect(updatedPoint?.latitude_deg).not.toBe(originalPoint?.latitude_deg);
      expect(updatedPoint?.longitude_deg).not.toBe(originalPoint?.longitude_deg);
    });

    const staleHandle = screen.getByTestId(`${missionWorkspaceTestIds.mapVertexPrefix}-${regionId}-polygon-0`);
    await fireEvent.pointerDown(staleHandle, { clientX: 300, clientY: 300 });
    plannerStore.deleteSurveyRegionById(regionId);
    await flush();
    await fireEvent.pointerMove(window, { clientX: 540, clientY: 160 });

    await waitFor(() => {
      expect(get(plannerStore).survey.surveyRegions.has(regionId)).toBe(false);
      expect(readMissionMapDebug().warnings.some((warning: string) => warning.includes("stale survey-handle drag"))).toBe(true);
      expect(get(plannerStore).selection.kind).toBe("home");
    });
  });

  it("edits survey parameters, generates nested items, and gates regenerate or dissolve behind explicit prompts", async () => {
    const { plannerStore } = await renderWorkspace({
      setup: ({ plannerStore }) => {
        plannerStore.replaceWorkspace(makeWorkspace({
          home: { latitude_deg: 47.5, longitude_deg: 8.6, altitude_m: 500 },
        }));
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.ready)).toBeTruthy();
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.listAddSurveyGrid));

    const regionId = get(plannerStore).survey.surveyRegionOrder[0]?.regionId ?? "";
    expect(regionId).not.toBe("");

    await fireEvent.change(screen.getByTestId(missionWorkspaceTestIds.cameraSearch), {
      target: { value: BUILTIN_CAMERA.canonicalName },
    });
    await fireEvent.click(screen.getByRole("button", { name: new RegExp(`Use ${BUILTIN_CAMERA.canonicalName}`) }));
    await fireEvent.change(screen.getByTestId(`${missionWorkspaceTestIds.surveyParamPrefix}-altitude_m`), {
      target: { value: "60" },
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.surveyGenerate));

    await waitFor(() => {
      const region = get(plannerStore).survey.surveyRegions.get(regionId);
      expect(region?.camera?.canonicalName).toBe(BUILTIN_CAMERA.canonicalName);
      expect(region?.params.altitude_m).toBe(60);
      expect(region?.generatedItems.length ?? 0).toBeGreaterThan(0);
      expect(screen.getByTestId(`${missionWorkspaceTestIds.surveyGeneratedItemPrefix}-${regionId}-0`)).toBeTruthy();
    });

    const editableGeneratedIndex = get(plannerStore).survey.surveyRegions.get(regionId)?.generatedItems.findIndex((item) => commandPosition(item.command)) ?? -1;
    expect(editableGeneratedIndex).toBeGreaterThanOrEqual(0);

    await fireEvent.click(screen.getByTestId(`${missionWorkspaceTestIds.surveyGeneratedItemPrefix}-${editableGeneratedIndex}`));
    await fireEvent.change(screen.getByTestId(missionWorkspaceTestIds.surveyGeneratedAltitude), {
      target: { value: "80" },
    });

    await waitFor(() => {
      const region = get(plannerStore).survey.surveyRegions.get(regionId);
      expect(region?.manualEdits.size).toBe(1);
      expect(screen.getByTestId(`${missionWorkspaceTestIds.surveyGeneratedEditedPrefix}-${editableGeneratedIndex}`).textContent).toContain("Manual edit");
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.surveyGenerate));
    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.surveyPromptKind).textContent).toContain("confirm-regenerate");
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.surveyPromptDismiss));
    await waitFor(() => {
      expect(screen.queryByTestId(missionWorkspaceTestIds.surveyPrompt)).toBeNull();
      expect(get(plannerStore).survey.surveyRegions.get(regionId)?.manualEdits.size).toBe(1);
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.surveyDissolve));
    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.surveyPromptKind).textContent).toContain("confirm-dissolve");
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.surveyPromptConfirm));
    await waitFor(() => {
      expect(get(plannerStore).survey.surveyRegions.has(regionId)).toBe(false);
      expect(get(plannerStore).draftState.active.mission.document.items.length).toBeGreaterThan(1);
    });
  });

  it("falls back to home when the selected survey region is deleted", async () => {
    const { plannerStore } = await renderWorkspace({
      setup: ({ plannerStore }) => {
        plannerStore.replaceWorkspace(makeWorkspace({
          home: { latitude_deg: 47.5, longitude_deg: 8.6, altitude_m: 500 },
        }));
      },
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.listAddSurveyStructure));

    const regionId = get(plannerStore).survey.surveyRegionOrder[0]?.regionId ?? "";
    expect(regionId).not.toBe("");

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.surveyDelete));

    await waitFor(() => {
      expect(get(plannerStore).survey.surveyRegions.has(regionId)).toBe(false);
      expect(get(plannerStore).selection.kind).toBe("home");
      expect(screen.queryByTestId(`${missionWorkspaceTestIds.surveyPrefix}-${regionId}`)).toBeNull();
    });
  });

  it("keeps incomplete home edits local until all three values are valid", async () => {
    const { plannerStore } = await renderWorkspace();

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.entryNew));
    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.homeCard)).toBeTruthy();
    });

    const latitudeInput = screen.getByTestId(missionWorkspaceTestIds.homeLatitude);
    const longitudeInput = screen.getByTestId(missionWorkspaceTestIds.homeLongitude);
    const altitudeInput = screen.getByTestId(missionWorkspaceTestIds.homeAltitude);

    await fireEvent.input(latitudeInput, { target: { value: "47.51" } });
    await fireEvent.blur(latitudeInput);
    expect(get(plannerStore).home).toBeNull();
    expect(screen.getByTestId(missionWorkspaceTestIds.homeValidation).textContent).toContain("Enter latitude");

    await fireEvent.input(longitudeInput, { target: { value: "8.61" } });
    await fireEvent.blur(longitudeInput);
    expect(get(plannerStore).home).toBeNull();

    await fireEvent.input(altitudeInput, { target: { value: "510" } });
    await fireEvent.blur(altitudeInput);

    await waitFor(() => {
      expect(get(plannerStore).home).toEqual({ latitude_deg: 47.51, longitude_deg: 8.61, altitude_m: 510 });
    });
  });

  it("shows playback read-only truth and keeps validation warnings visible across mode switches", async () => {
    const { plannerStore, sessionStore } = await renderWorkspace({
      snapshots: [
        createSnapshot({ envelope: createEnvelope("session-1", { source_kind: "playback", seek_epoch: 1, reset_revision: 1 }) }),
        createSnapshot({ envelope: createEnvelope("session-1", { source_kind: "live", seek_epoch: 2, reset_revision: 2 }) }),
      ],
      plannerServiceOverrides: {
        validateMission: vi.fn(async () => [{ code: "geom_warn", message: "Survey path drifts outside the lane.", severity: "warning" as const }]),
      },
      setup: ({ plannerStore }) => {
        plannerStore.replaceWorkspace(makeWorkspace({
          home: { latitude_deg: 47.5, longitude_deg: 8.6, altitude_m: 500 },
        }));
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.attachment).textContent).toContain("Playback read-only");
    });
    expect((screen.getByTestId(missionWorkspaceTestIds.toolbarValidate) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId(missionWorkspaceTestIds.homeLatitude) as HTMLInputElement).disabled).toBe(true);

    const playbackWarning = screen.getByTestId(`${missionWorkspaceTestIds.warningItemPrefix}-0`);
    expect(playbackWarning.textContent).toContain("Playback read-only");

    await sessionStore.bootstrapSource("live");
    await flush();
    plannerStore.replaceWorkspace(makeWorkspace());
    await flush();

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.modeMission));
    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.toolbarValidate));

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.warningValidation).textContent).toContain("Survey path drifts outside the lane.");
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.modeFence));
    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.fenceList)).toBeTruthy();
      expect(screen.getByTestId(missionWorkspaceTestIds.fenceInspectorSelectionKind).textContent).toContain("none");
      expect(screen.getByTestId(missionWorkspaceTestIds.warningValidation).textContent).toContain("Survey path drifts outside the lane.");
    });
  });

  it("switches into fence mode, edits region type/radius, and keeps map/list/inspector selection synchronized", async () => {
    const { plannerStore } = await renderWorkspace({
      setup: ({ plannerStore }) => {
        plannerStore.replaceWorkspace(makeFenceWorkspace());
      },
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.modeFence));
    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.fenceList)).toBeTruthy();
      expect(screen.getByTestId(missionWorkspaceTestIds.mapFenceCount).textContent).toContain("3");
    });

    setMissionMapSurfaceRect();

    const firstFenceUiId = get(plannerStore).draftState.active.fence.draftItems[0]?.uiId;
    expect(firstFenceUiId).toBeTypeOf("number");

    await fireEvent.click(screen.getByTestId(`${missionWorkspaceTestIds.fenceRegionPrefix}-${firstFenceUiId}`));
    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.fenceInspectorSelectionKind).textContent).toContain("fence-region");
      expect(readMissionMapDebug().fenceSelection).toEqual({ kind: "region", regionUiId: firstFenceUiId });
    });

    await fireEvent.change(screen.getByTestId(missionWorkspaceTestIds.fenceInspectorType), {
      target: { value: "exclusion_circle" },
    });

    await waitFor(() => {
      const region = get(plannerStore).draftState.active.fence.draftItems.find((item) => item.uiId === firstFenceUiId)?.document;
      expect(region && "exclusion_circle" in region).toBe(true);
      expect(screen.getByTestId(`${missionWorkspaceTestIds.mapFenceRadiusPrefix}-${firstFenceUiId}`)).toBeTruthy();
    });

    const radiusHandle = screen.getByTestId(`${missionWorkspaceTestIds.mapFenceRadiusPrefix}-${firstFenceUiId}`);
    await fireEvent.pointerDown(radiusHandle, { clientX: 620, clientY: 280 });
    await fireEvent.pointerMove(window, { clientX: 860, clientY: 120 });
    await fireEvent.pointerUp(window);

    await waitFor(() => {
      const region = get(plannerStore).draftState.active.fence.draftItems.find((item) => item.uiId === firstFenceUiId)?.document as FenceRegion | undefined;
      expect(region && "exclusion_circle" in region ? region.exclusion_circle.radius_m : 0).toBeGreaterThan(50);
      expect(readMissionMapDebug().counts.fenceRadiusHandles).toBe(1);
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.fenceReturnPointCard));
    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.fenceInspectorSelectionKind).textContent).toContain("return-point");
      expect(readMissionMapDebug().fenceSelection).toEqual({ kind: "return-point" });
    });

    const returnLatitude = screen.getByTestId(missionWorkspaceTestIds.fenceReturnLatitude);
    await fireEvent.focus(returnLatitude);
    await fireEvent.input(returnLatitude, { target: { value: "47.408" } });
    await fireEvent.blur(returnLatitude);

    await waitFor(() => {
      expect(get(plannerStore).draftState.active.fence.document.return_point).toEqual({ latitude_deg: 47.408, longitude_deg: 8.5581 });
    });

    await fireEvent.click(screen.getByTestId(`${missionWorkspaceTestIds.mapFenceRegionPrefix}-${firstFenceUiId}`));
    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.fenceInspectorSelectionKind).textContent).toContain("fence-region");
    });
  });

  it("reopens the targeted fence region from warning actions and rejects stale or read-only fence edits truthfully", async () => {
    const { plannerStore } = await renderWorkspace({
      setup: ({ plannerStore }) => {
        plannerStore.replaceWorkspace(makeFenceWorkspace());
      },
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.modeFence));
    const firstFenceUiId = get(plannerStore).draftState.active.fence.draftItems[0]?.uiId;
    expect(firstFenceUiId).toBeTypeOf("number");

    await fireEvent.click(screen.getByTestId(`${missionWorkspaceTestIds.fenceRegionPrefix}-${firstFenceUiId}`));
    await fireEvent.change(screen.getByTestId(missionWorkspaceTestIds.fenceInspectorType), {
      target: { value: "inclusion_circle" },
    });

    await waitFor(() => {
      const region = get(plannerStore).draftState.active.fence.draftItems.find((item) => item.uiId === firstFenceUiId)?.document;
      expect(region && "inclusion_circle" in region).toBe(true);
    });

    await fireEvent.change(screen.getByTestId(missionWorkspaceTestIds.fenceCircleRadius), {
      target: { value: "-10" },
    });

    await waitFor(() => {
      expect(screen.getByTestId(`${missionWorkspaceTestIds.warningItemPrefix}-0`).textContent).toContain("Blocked action");
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.modeMission));
    await fireEvent.click(screen.getByRole("button", { name: /open fence mode/i }));

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.fenceList)).toBeTruthy();
      expect(screen.getByTestId(missionWorkspaceTestIds.fenceInspectorSelectionKind).textContent).toContain("fence-region");
    });

    const deleted = plannerStore.deleteFenceRegionByUiId(firstFenceUiId!);
    expect(deleted.status).toBe("applied");
    const staleSelection = plannerStore.selectFenceRegionByUiId(firstFenceUiId!);
    expect(staleSelection).toMatchObject({
      status: "rejected",
      reason: "region-not-found",
    });
  });

  it("keeps fence mode visible but blocks destructive edits truthfully during playback", async () => {
    const { plannerStore } = await renderWorkspace({
      snapshots: [
        createSnapshot({ envelope: createEnvelope("session-1", { source_kind: "playback", seek_epoch: 1, reset_revision: 1 }) }),
      ],
      setup: ({ plannerStore }) => {
        plannerStore.replaceWorkspace(makePlaybackFenceWorkspace());
      },
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.modeFence));
    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.fenceList)).toBeTruthy();
      expect((screen.getByTestId(missionWorkspaceTestIds.fenceAddInclusionPolygon) as HTMLButtonElement).disabled).toBe(true);
      expect((screen.getByTestId(missionWorkspaceTestIds.fenceReturnPointClear) as HTMLButtonElement).disabled).toBe(true);
    });

    const playbackFenceUiId = get(plannerStore).draftState.active.fence.draftItems[0]?.uiId;
    const readOnlyDelete = plannerStore.deleteFenceRegionByUiId(playbackFenceUiId!);
    expect(readOnlyDelete).toMatchObject({
      status: "rejected",
      reason: "read-only",
    });
    expect(get(plannerStore).blockedReason).toContain("playback");
  });

  it("switches into rally mode, edits altitude frames and coordinates, and keeps map/list/inspector selection synchronized", async () => {
    const { plannerStore } = await renderWorkspace({
      setup: ({ plannerStore }) => {
        plannerStore.replaceWorkspace(makeRallyWorkspace());
      },
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.modeRally));
    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.rallyList)).toBeTruthy();
      expect(screen.getByTestId(missionWorkspaceTestIds.mapRallyCount).textContent).toContain("2");
      expect(screen.getByTestId(missionWorkspaceTestIds.homeSync).textContent).toContain("Live mission reads can refresh Home");
    });

    const firstRallyUiId = get(plannerStore).draftState.active.rally.draftItems[0]?.uiId;
    expect(firstRallyUiId).toBeTypeOf("number");

    await fireEvent.click(screen.getByTestId(`${missionWorkspaceTestIds.rallyPointPrefix}-${firstRallyUiId}`));
    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.rallyInspectorSelectionKind).textContent).toContain("rally-point");
      expect(readMissionMapDebug().selectedRallyPointUiId).toBe(firstRallyUiId);
    });

    await fireEvent.change(screen.getByTestId(missionWorkspaceTestIds.rallyAltitudeFrame), {
      target: { value: "terrain" },
    });

    await waitFor(() => {
      const point = get(plannerStore).draftState.active.rally.draftItems.find((item) => item.uiId === firstRallyUiId)?.document;
      expect(point && "Terrain" in point).toBe(true);
      if (point && "Terrain" in point) {
        expect(point.Terrain.altitude_terrain_m).toBe(0);
      }
    });

    await fireEvent.change(screen.getByTestId(missionWorkspaceTestIds.rallyLatitude), {
      target: { value: "47.405" },
    });
    await fireEvent.change(screen.getByTestId(missionWorkspaceTestIds.rallyLongitude), {
      target: { value: "8.559" },
    });
    await fireEvent.change(screen.getByTestId(missionWorkspaceTestIds.rallyAltitude), {
      target: { value: "42" },
    });

    await waitFor(() => {
      const point = get(plannerStore).draftState.active.rally.draftItems.find((item) => item.uiId === firstRallyUiId)?.document;
      expect(point && "Terrain" in point).toBe(true);
      if (point && "Terrain" in point) {
        expect(point.Terrain.latitude_deg).toBe(47.405);
        expect(point.Terrain.longitude_deg).toBe(8.559);
        expect(point.Terrain.altitude_terrain_m).toBe(42);
      }
    });

    setMissionMapSurfaceRect();
    const marker = screen.getByTestId(`${missionWorkspaceTestIds.mapMarkerPrefix}-${firstRallyUiId}`);
    const beforeDrag = get(plannerStore).draftState.active.rally.draftItems.find((item) => item.uiId === firstRallyUiId)?.preview;

    await fireEvent.pointerDown(marker, { clientX: 300, clientY: 360 });
    await fireEvent.pointerMove(window, { clientX: 780, clientY: 180 });
    await fireEvent.pointerUp(window);

    await waitFor(() => {
      const afterDrag = get(plannerStore).draftState.active.rally.draftItems.find((item) => item.uiId === firstRallyUiId)?.preview;
      expect(afterDrag?.latitude_deg).not.toBe(beforeDrag?.latitude_deg);
      expect(afterDrag?.longitude_deg).not.toBe(beforeDrag?.longitude_deg);
      expect(readMissionMapDebug().rallyMarkerCount).toBe(2);
    });
  });

  it("reopens the targeted rally point from warning actions and keeps stale drags fail-closed", async () => {
    const { plannerStore } = await renderWorkspace({
      setup: ({ plannerStore }) => {
        plannerStore.replaceWorkspace(makeRallyWorkspace());
      },
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.modeRally));
    const firstRallyUiId = get(plannerStore).draftState.active.rally.draftItems[0]?.uiId;
    expect(firstRallyUiId).toBeTypeOf("number");

    await fireEvent.click(screen.getByTestId(`${missionWorkspaceTestIds.rallyPointPrefix}-${firstRallyUiId}`));
    plannerStore.updateRallyPointAltitudeFrameByUiId(firstRallyUiId!, "unsupported-frame");
    await flush();

    await waitFor(() => {
      expect(screen.getByTestId(`${missionWorkspaceTestIds.warningItemPrefix}-0`).textContent).toContain("Blocked action");
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.modeMission));
    await fireEvent.click(screen.getByRole("button", { name: /open rally mode/i }));

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.rallyList)).toBeTruthy();
      expect(screen.getByTestId(missionWorkspaceTestIds.rallyInspectorSelectionKind).textContent).toContain("rally-point");
      expect(readMissionMapDebug().selectedRallyPointUiId).toBe(firstRallyUiId);
    });

    setMissionMapSurfaceRect();
    const marker = screen.getByTestId(`${missionWorkspaceTestIds.mapMarkerPrefix}-${firstRallyUiId}`);
    await fireEvent.pointerDown(marker, { clientX: 240, clientY: 340 });
    plannerStore.deleteRallyPointByUiId(firstRallyUiId!);
    await flush();
    await fireEvent.pointerMove(window, { clientX: 640, clientY: 180 });

    await waitFor(() => {
      expect(get(plannerStore).draftState.active.rally.draftItems.some((item) => item.uiId === firstRallyUiId)).toBe(false);
      expect(readMissionMapDebug().warnings.some((warning: string) => warning.includes("stale rally drag"))).toBe(true);
    });
  });

  it("keeps rally mode mounted but blocks edits truthfully during playback while Home copy stays explicit", async () => {
    const { plannerStore } = await renderWorkspace({
      snapshots: [
        createSnapshot({ envelope: createEnvelope("session-1", { source_kind: "playback", seek_epoch: 1, reset_revision: 1 }) }),
      ],
      setup: ({ plannerStore }) => {
        plannerStore.replaceWorkspace(makeRallyWorkspace());
      },
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.modeRally));
    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.rallyList)).toBeTruthy();
      expect((screen.getByTestId(missionWorkspaceTestIds.rallyAdd) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByTestId(missionWorkspaceTestIds.homeSync).textContent).toContain("Playback keeps the last known Home visible");
    });

    const playbackRallyUiId = get(plannerStore).draftState.active.rally.draftItems[0]?.uiId;
    await fireEvent.click(screen.getByTestId(`${missionWorkspaceTestIds.rallyPointPrefix}-${playbackRallyUiId}`));
    await waitFor(() => {
      expect((screen.getByTestId(missionWorkspaceTestIds.rallyAltitudeFrame) as HTMLSelectElement).disabled).toBe(true);
    });

    const readOnlyFrameChange = plannerStore.updateRallyPointAltitudeFrameByUiId(playbackRallyUiId!, "terrain");
    expect(readOnlyFrameChange).toMatchObject({
      status: "rejected",
      reason: "read-only",
    });
    expect(get(plannerStore).blockedReason).toContain("playback");
  });

  it("requires an explicit replace prompt before importing over a dirty draft and keeps camera-missing survey regions editable", async () => {
    const survey = makeImportedSurveyExtension();
    const importedHome = { latitude_deg: 47.39, longitude_deg: 8.53, altitude_m: 488 };

    const { plannerStore } = await renderWorkspace({
      fileIoOverrides: {
        importFromPicker: vi.fn(async (): Promise<MissionPlanFileImportResult> => ({
          status: "success",
          fileName: "survey.plan",
          missionItemCount: 0,
          surveyRegionCount: 1,
          fenceRegionCount: 0,
          rallyPointCount: 0,
          warningCount: 1,
          warnings: ["Imported survey region preserved."],
          data: {
            mission: { items: [] },
            fence: { return_point: null, regions: [] },
            rally: { points: [] },
            home: importedHome,
            surveyRegions: Array.from(survey.surveyRegions.values()).map((region) => ({
              patternType: region.patternType,
              position: 0,
              polygon: region.polygon,
              polyline: region.polyline,
              camera: region.camera,
              params: region.params,
              embeddedItems: region.generatedItems,
              qgcPassthrough: region.qgcPassthrough ?? {},
              warnings: region.importWarnings ?? ["Imported survey region preserved."],
            })),
            cruiseSpeed: 19,
            hoverSpeed: 6,
          },
        })),
      },
      setup: ({ plannerStore }) => {
        plannerStore.replaceWorkspace(makeWorkspace());
        plannerStore.setHome({ latitude_deg: 47.5, longitude_deg: 8.6, altitude_m: 500 });
      },
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.toolbarImport));

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.importReviewTitle).textContent).toContain("survey.plan");
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.importReviewDismiss));
    await waitFor(() => {
      expect(screen.queryByTestId(missionWorkspaceTestIds.importReview)).toBeNull();
    });
    expect(get(plannerStore).home).toEqual({ latitude_deg: 47.5, longitude_deg: 8.6, altitude_m: 500 });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.toolbarImport));
    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.importReview)).toBeTruthy();
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.importReviewConfirm));
    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.countsSurvey).textContent).toContain("1");
    });

    const regionId = get(plannerStore).survey.surveyRegionOrder[0]?.regionId;
    expect(regionId).toBeTruthy();

    await fireEvent.click(screen.getByTestId(`${missionWorkspaceTestIds.mapSurveyPrefix}-${regionId}`));

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.inspectorSelectionKind).textContent).toContain("survey-block");
      expect(screen.getByTestId(missionWorkspaceTestIds.inspectorSurvey)).toBeTruthy();
      expect((screen.getByTestId(missionWorkspaceTestIds.surveyGenerate) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByTestId(missionWorkspaceTestIds.cameraCurrent).textContent).toContain("Choose a valid camera");
    });

    await fireEvent.change(screen.getByTestId(missionWorkspaceTestIds.cameraSearch), {
      target: { value: BUILTIN_CAMERA.canonicalName },
    });
    await fireEvent.click(screen.getByRole("button", { name: new RegExp(`Use ${BUILTIN_CAMERA.canonicalName}`) }));

    await waitFor(() => {
      const region = get(plannerStore).survey.surveyRegions.get(regionId!);
      expect(region?.camera?.canonicalName).toBe(BUILTIN_CAMERA.canonicalName);
      expect((screen.getByTestId(missionWorkspaceTestIds.surveyGenerate) as HTMLButtonElement).disabled).toBe(false);
    });

    expect(get(plannerStore).home).toEqual(importedHome);
    expect(screen.getByTestId(missionWorkspaceTestIds.warningFile).textContent).toContain(
      "Imported survey region preserved.",
    );
  });

  it("opens the mixed-domain export chooser and blocks empty chooser submissions", async () => {
    const { fileHarness } = await renderWorkspace({
      fileIoOverrides: {
        exportToPicker: vi.fn(async (): Promise<MissionPlanFileExportResult> => ({
          status: "success",
          fileName: "mixed.plan",
          warningCount: 0,
          warnings: [],
          contents: "{}\n",
        })),
      },
      setup: ({ plannerStore }) => {
        plannerStore.replaceWorkspace({
          ...makeWorkspace({
            home: { latitude_deg: 47.5, longitude_deg: 8.6, altitude_m: 500 },
          }),
          fence: {
            return_point: null,
            regions: [
              {
                inclusion_polygon: {
                  inclusion_group: 0,
                  vertices: [
                    { latitude_deg: 47.4, longitude_deg: 8.5 },
                    { latitude_deg: 47.41, longitude_deg: 8.5 },
                    { latitude_deg: 47.41, longitude_deg: 8.51 },
                  ],
                },
              },
            ],
          },
          rally: {
            points: [
              {
                RelHome: {
                  latitude_deg: 47.42,
                  longitude_deg: 8.52,
                  relative_alt_m: 20,
                },
              },
            ],
          },
        });
      },
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.toolbarExport));

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.exportReviewTitle).textContent).toContain("Choose which planner domains");
    });
    expect(screen.getByTestId(`${missionWorkspaceTestIds.exportReviewChoicePrefix}-mission`).textContent).toContain("Mission + Home + Survey");
    expect(screen.getByTestId(`${missionWorkspaceTestIds.exportReviewChoicePrefix}-mission`).textContent).toContain("Home");
    expect(screen.queryByText(/^Home$/)).toBeNull();
    expect(fileHarness.fileIo.exportToPicker).not.toHaveBeenCalled();

    for (const domain of ["mission", "fence", "rally"] as const) {
      const input = screen.getByTestId(`${missionWorkspaceTestIds.exportReviewChoicePrefix}-${domain}`).querySelector("input") as HTMLInputElement;
      await fireEvent.click(input);
    }

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.exportReviewConfirm));
    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.warningRegister).textContent).toContain("Choose at least one planning domain");
      expect(screen.getByTestId(missionWorkspaceTestIds.exportReview)).toBeTruthy();
    });

    const fenceOnlyInput = screen.getByTestId(`${missionWorkspaceTestIds.exportReviewChoicePrefix}-fence`).querySelector("input") as HTMLInputElement;
    await fireEvent.click(fenceOnlyInput);
    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.exportReviewConfirm));

    await waitFor(() => {
      expect(fileHarness.fileIo.exportToPicker).toHaveBeenCalledTimes(1);
    });
    expect(fileHarness.fileIo.exportToPicker).toHaveBeenCalledWith(expect.objectContaining({
      excludeDomains: ["mission", "rally"],
    }));
  });

  it("renders preserved raw mission commands as read-only instead of exposing broken typed editors", async () => {
    const rawMission: MissionPlan = {
      items: [
        {
          command: {
            Other: {
              command: 31000,
              frame: "Mission",
              param1: 1,
              param2: 2,
              param3: 3,
              param4: 4,
              x: 5,
              y: 6,
              z: 7,
            },
          },
          current: true,
          autocontinue: true,
        },
      ],
    };

    const { plannerStore } = await renderWorkspace({
      setup: ({ plannerStore }) => {
        plannerStore.replaceWorkspace(makeWorkspace({ mission: rawMission }));
        plannerStore.selectMissionItem(0);
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.inspectorReadonly).textContent).toContain("read-only");
    });

    expect(screen.queryByTestId(missionWorkspaceTestIds.inspectorCommandPicker)).toBeNull();
    expect(get(plannerStore).draftState.active.mission.draftItems[0]?.readOnly).toBe(true);
  });

  it("keeps repeated read clicks from dispatching while a download is already active and surfaces failures inline", async () => {
    const pendingDownload = deferred<MissionPlannerWorkspaceTransfer>();

    const { plannerHarness } = await renderWorkspace({
      plannerServiceOverrides: {
        downloadWorkspace: vi.fn(() => pendingDownload.promise),
      },
    });

    const readButton = screen.getByTestId(missionWorkspaceTestIds.entryRead) as HTMLButtonElement;
    await fireEvent.click(readButton);

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.inlineStatusMessage).textContent).toContain("Reading planning state");
    });
    expect(readButton.disabled).toBe(true);
    expect(plannerHarness.service.downloadWorkspace).toHaveBeenCalledTimes(1);

    readButton.click();
    expect(plannerHarness.service.downloadWorkspace).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId(missionWorkspaceTestIds.toolbarCancel)).toBeTruthy();

    pendingDownload.reject(new Error("mission download failed"));

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.error).textContent).toContain("mission download failed");
    });
  });

  it("shows a same-scope recoverable-draft prompt when returning to a scope and restores it explicitly", async () => {
    const { plannerStore, sessionStore } = await renderWorkspace({
      snapshots: [
        createSnapshot({ envelope: createEnvelope("session-1") }),
        createSnapshot({ envelope: createEnvelope("session-2", { reset_revision: 1 }) }),
        createSnapshot({ envelope: createEnvelope("session-1", { reset_revision: 2 }) }),
      ],
      setup: ({ plannerStore }) => {
        plannerStore.replaceWorkspace(makeWorkspace());
        plannerStore.setHome({ latitude_deg: 47.5, longitude_deg: 8.6, altitude_m: 500 });
      },
    });

    await sessionStore.bootstrapSource("live");
    await flush();
    await sessionStore.bootstrapSource("live");
    await flush();

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.promptKind).textContent).toContain("recoverable-draft");
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.promptConfirm));

    await waitFor(() => {
      expect(screen.queryByTestId(missionWorkspaceTestIds.prompt)).toBeNull();
    });
    expect(get(plannerStore).home).toEqual({ latitude_deg: 47.5, longitude_deg: 8.6, altitude_m: 500 });
  });
});
