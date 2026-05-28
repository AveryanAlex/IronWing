// @vitest-environment jsdom

import { get } from "svelte/store";
import { cleanup, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as typeof ResizeObserver;
  }

  if (typeof globalThis.IntersectionObserver === "undefined") {
    globalThis.IntersectionObserver = class IntersectionObserverMock {
      root = null;
      rootMargin = "0px";
      thresholds = [];
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    } as typeof IntersectionObserver;
  }

  const elementPrototype = globalThis.Element?.prototype as (Element & {
    getAnimations?: () => Animation[];
    animate?: Element["animate"];
  }) | undefined;

  if (elementPrototype && typeof elementPrototype.getAnimations !== "function") {
    elementPrototype.getAnimations = () => [];
  }
  if (elementPrototype && typeof elementPrototype.animate !== "function") {
    elementPrototype.animate = () => ({
      cancel() {},
      finished: Promise.resolve(),
    }) as unknown as Animation;
  }
});

const {
  resetTerrainStateMock,
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
      for (const subscriber of subscribers) {
        subscriber(currentTerrainState);
      }
    }),
  };

  return {
    terrainControllerMock,
    resetTerrainStateMock() {
      currentTerrainState = createInitialTerrainState();
      terrainControllerMock.load.mockReset();
      terrainControllerMock.retry.mockReset();
      terrainControllerMock.reset.mockReset();
      for (const subscriber of subscribers) {
        subscriber(currentTerrainState);
      }
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

const {
  maplibreMock,
  maplibreMapCtor,
  resetMaplibreMock,
  setMaplibreCtorFailure,
} = vi.hoisted(() => {
  const eventHandlers = new Map<string, Array<(payload?: unknown) => void>>();
  const maplibreMock = {
    addControl: vi.fn(),
    addLayer: vi.fn(),
    addSource: vi.fn(),
    easeTo: vi.fn(),
    fitBounds: vi.fn(),
    getLayer: vi.fn(() => null),
    getSource: vi.fn(() => null),
    getStyle: vi.fn(() => ({
      layers: [
        { id: "background", type: "background" },
        { id: "land", type: "fill" },
        { id: "roads", type: "line" },
        { id: "labels", type: "symbol" },
      ],
    })),
    getZoom: vi.fn(() => 14),
    on: vi.fn((event: string, handler: (payload?: unknown) => void) => {
      const handlers = eventHandlers.get(event) ?? [];
      handlers.push(handler);
      eventHandlers.set(event, handlers);
      if (event === "load") {
        handler();
      }
    }),
    project: vi.fn(([lng, lat]: [number, number]) => ({ x: lng * 10, y: lat * 10 })),
    remove: vi.fn(),
    resize: vi.fn(),
    setLayoutProperty: vi.fn(),
    setTerrain: vi.fn(),
    unproject: vi.fn(([x, y]: [number, number]) => ({ lat: y / 10, lng: x / 10 })),
  };

  let throwOnConstruct = false;
  const maplibreMapCtor = vi.fn(() => {
    if (throwOnConstruct) {
      throw new Error("map init failed");
    }
    return maplibreMock;
  });

  return {
    maplibreMock,
    maplibreMapCtor,
    resetMaplibreMock() {
      throwOnConstruct = false;
      eventHandlers.clear();
      maplibreMapCtor.mockClear();
    },
    setMaplibreCtorFailure(next: boolean) {
      throwOnConstruct = next;
    },
  };
});

vi.mock("maplibre-gl", () => {
  function MockMap() {
    return maplibreMapCtor();
  }

  function MockMarker(options?: { element?: HTMLElement }) {
    const element = options?.element ?? document.createElement("div");
    return {
      addTo: vi.fn().mockReturnThis(),
      getElement: vi.fn(() => element),
      remove: vi.fn(),
      setLngLat: vi.fn().mockReturnThis(),
      setRotation: vi.fn().mockReturnThis(),
    };
  }

  function MockNavigationControl() {
    return {};
  }

  return {
    Map: MockMap,
    Marker: MockMarker,
    NavigationControl: MockNavigationControl,
    setWorkerUrl: vi.fn(),
  };
});

import MissionWorkspace from "../../routes/(app)/mission/+page.svelte";
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
import { createSurveyDraftExtension, type SurveyDraftExtension } from "../../lib/survey-region";
import {
  createMissionPlannerStore,
  createMissionPlannerViewStore,
  type MissionPlannerStore,
  type MissionPlannerWorkspace,
} from "../../lib/stores/mission-planner";
import { settings } from "../../lib/stores/settings";
import { createSessionStore } from "../../lib/stores/session";
import { createStaticShellChromeStore } from "../../test/context-harnesses";

type RenderableComponent = (...args: any[]) => unknown;

function asRenderable(component: unknown): RenderableComponent {
  return component as RenderableComponent;
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
    websocketUrl: "ws://127.0.0.1:14550",
    webSerialPortId: "",
    webBluetoothDeviceId: "",
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

  return { service, handlers };
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
  }> = {},
): MissionPlannerWorkspace {
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
    cruiseSpeed: 15,
    hoverSpeed: 5,
  };
}

function withMissionPlannerContexts(store: MissionPlannerStore, component: unknown) {
  const renderable = asRenderable(component);

  return function MissionPlannerHarness(...args: any[]) {
    setMissionPlannerStoreContext(store);
    setMissionPlannerViewStoreContext(createMissionPlannerViewStore(store));
    setShellChromeStoreContext(createStaticShellChromeStore("wide"));
    return renderable(...args);
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

async function renderWorkspace(options: {
  snapshots?: OpenSessionSnapshot[];
  plannerServiceOverrides?: Partial<MissionPlannerService>;
  fileIoOverrides?: Partial<MissionPlanFileIo>;
  setup?: (context: {
    plannerStore: ReturnType<typeof createMissionPlannerStore>;
  }) => Promise<void> | void;
} = {}) {
  settings.reload();
  const sessionHarness = createSessionHarness(options.snapshots ?? [createSnapshot()]);
  const plannerHarness = createPlannerServiceHarness(options.plannerServiceOverrides);
  const fileHarness = createFileIoHarness(options.fileIoOverrides);
  const sessionStore = createSessionStore(sessionHarness.service);
  const plannerStore = createMissionPlannerStore(sessionStore, plannerHarness.service, fileHarness.fileIo);

  await sessionStore.initialize();
  await plannerStore.initialize();

  if (options.setup) {
    await options.setup({ plannerStore });
    await flush();
  }

  render(withMissionPlannerContexts(plannerStore, MissionWorkspace));

  return {
    plannerStore,
    plannerHarness,
    fileHarness,
    sessionHarness,
  };
}

describe("MissionWorkspace", () => {
  beforeEach(() => {
    resetTerrainStateMock();
    resetMaplibreMock();
    maplibreMock.fitBounds.mockReset();
    maplibreMock.on.mockClear();
    maplibreMock.remove.mockReset();
    maplibreMock.resize.mockReset();
    if (typeof localStorage?.clear === "function") {
      localStorage.clear();
    }
  });

  afterEach(() => {
    cleanup();
  });

  it("mounts the ready empty mission workspace", async () => {
    const { plannerStore } = await renderWorkspace();

    const root = screen.getByTestId(missionWorkspaceTestIds.root);
    expect(root).toBeTruthy();
    expect(screen.getByTestId(missionWorkspaceTestIds.header)).toBeTruthy();
    expect(root.querySelector(".mission-workspace")?.getAttribute("data-mission-state")).toBe("empty");

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.ready)).toBeTruthy();
    });

    expect(screen.getByTestId(missionWorkspaceTestIds.homeCard)).toBeTruthy();
    expect(screen.getByTestId(missionWorkspaceTestIds.map)).toBeTruthy();
    expect(screen.getByTestId(missionWorkspaceTestIds.mapSurface)).toBeTruthy();
    expect(screen.getByTestId(missionWorkspaceTestIds.draftList)).toBeTruthy();
    expect(screen.getByTestId(missionWorkspaceTestIds.listEmpty)).toBeTruthy();
    expect(screen.getByTestId(missionWorkspaceTestIds.inspectorSelectionKind).textContent).toContain("home");
    expect(get(plannerStore).workspaceMounted).toBe(true);
  });

  it("keeps the planner surface mounted when basemap initialization fails", async () => {
    setMaplibreCtorFailure(true);

    await renderWorkspace();

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.mapSurface)).toBeTruthy();
      expect(screen.getAllByText(/Basemap initialization failed/i).length).toBeGreaterThan(0);
    });
  });

  it("mounts playback workspaces as read-only", async () => {
    await renderWorkspace({
      snapshots: [
        createSnapshot({
          envelope: createEnvelope("session-1", { source_kind: "playback", seek_epoch: 1, reset_revision: 1 }),
        }),
      ],
      setup: ({ plannerStore }) => {
        plannerStore.replaceWorkspace(makeWorkspace({
          home: { latitude_deg: 47.5, longitude_deg: 8.6, altitude_m: 500 },
        }));
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.root).querySelector(".mission-workspace")?.getAttribute("data-mission-attachment")).toContain("Playback read-only");
    });

    expect(screen.getByTestId(missionWorkspaceTestIds.headerReplayReadonly).textContent).toContain("Replay is read-only");
    expect((screen.getByTestId(missionWorkspaceTestIds.toolbarUpload) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId(missionWorkspaceTestIds.homeLatitude) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByTestId(missionWorkspaceTestIds.homeReadOnly).textContent).toContain("Playback");
  });
});
