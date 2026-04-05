// @vitest-environment jsdom

import { get } from "svelte/store";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import MissionWorkspace from "./MissionWorkspace.svelte";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";
import {
  setMissionPlannerStoreContext,
  setMissionPlannerViewStoreContext,
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
import {
  createMissionPlannerStore,
  createMissionPlannerViewStore,
} from "../../lib/stores/mission-planner";
import { createSessionStore } from "../../lib/stores/session";

type RenderableComponent = (...args: any[]) => unknown;

function asRenderable(component: unknown): RenderableComponent {
  return component as RenderableComponent;
}

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

function withMissionPlannerContexts(store: ReturnType<typeof createMissionPlannerStore>, component: unknown) {
  const renderable = asRenderable(component);

  return function MissionPlannerHarness(...args: any[]) {
    setMissionPlannerStoreContext(store);
    setMissionPlannerViewStoreContext(createMissionPlannerViewStore(store));
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

async function renderWorkspace(options: {
  snapshots?: OpenSessionSnapshot[];
  plannerServiceOverrides?: Partial<MissionPlannerService>;
  fileIoOverrides?: Partial<MissionPlanFileIo>;
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

  render(withMissionPlannerContexts(plannerStore, MissionWorkspace));

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
    expect(screen.getByTestId(missionWorkspaceTestIds.entryNew)).toBeTruthy();

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.entryNew));

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.ready)).toBeTruthy();
      expect(screen.getByTestId(missionWorkspaceTestIds.localNote).textContent).toContain("Blank mission draft ready");
    });

    expect(screen.getByTestId(missionWorkspaceTestIds.homeCard)).toBeTruthy();
    expect(screen.getByTestId(missionWorkspaceTestIds.map)).toBeTruthy();
    expect(screen.getByTestId(missionWorkspaceTestIds.mapStatus).textContent).toContain("empty");
    expect(screen.getByTestId(missionWorkspaceTestIds.mapEmpty)).toBeTruthy();
    expect(screen.getByTestId(missionWorkspaceTestIds.draftList)).toBeTruthy();
    expect(screen.getByTestId(missionWorkspaceTestIds.listEmpty)).toBeTruthy();
    expect(screen.getByTestId(missionWorkspaceTestIds.inspectorSelectionKind).textContent).toContain("home");
    expect(get(plannerStore).workspaceMounted).toBe(true);
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
          expect(waypoint.Waypoint.hold_time_s).toBe(12);
          expect(waypoint.Waypoint.position.RelHome.latitude_deg).toBe(47.55);
          expect(waypoint.Waypoint.position.RelHome.longitude_deg).toBe(8.66);
          expect(waypoint.Waypoint.position.RelHome.relative_alt_m).toBe(120);
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

  it("requires an explicit replace prompt before importing over a dirty draft and keeps the survey block selectable", async () => {
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
      expect(screen.getByTestId(missionWorkspaceTestIds.promptKind).textContent).toContain("import-replace");
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.promptDismiss));
    await waitFor(() => {
      expect(screen.queryByTestId(missionWorkspaceTestIds.prompt)).toBeNull();
    });
    expect(get(plannerStore).home).toEqual({ latitude_deg: 47.5, longitude_deg: 8.6, altitude_m: 500 });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.toolbarImport));
    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.prompt)).toBeTruthy();
    });

    await fireEvent.click(screen.getByTestId(missionWorkspaceTestIds.promptConfirm));
    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.countsSurvey).textContent).toContain("1");
    });

    const regionId = get(plannerStore).survey.surveyRegionOrder[0]?.regionId;
    expect(regionId).toBeTruthy();

    await fireEvent.click(screen.getByTestId(`${missionWorkspaceTestIds.mapSurveyPrefix}-${regionId}`));

    await waitFor(() => {
      expect(screen.getByTestId(missionWorkspaceTestIds.inspectorSelectionKind).textContent).toContain("survey-block");
      expect(screen.getByTestId(missionWorkspaceTestIds.inspectorReadonly).textContent).toContain("Imported survey block selected");
    });

    expect(get(plannerStore).home).toEqual(importedHome);
    expect(screen.getByTestId(`${missionWorkspaceTestIds.warningPrefix}-file`).textContent).toContain(
      "Imported survey region preserved.",
    );
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
      expect(screen.getByTestId(missionWorkspaceTestIds.inlineStatusMessage).textContent).toContain("Reading mission");
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
