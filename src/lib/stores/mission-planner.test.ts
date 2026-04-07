// @vitest-environment jsdom

import { get } from "svelte/store";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HomePosition, MissionPlan, TransferProgress, MissionState } from "../../mission";
import { defaultGeoPoint3d, type MissionItem } from "../mavkit-types";
import type { OpenSessionSnapshot, SessionEnvelope } from "../../session";
import type { TransportDescriptor } from "../../transport";
import type {
  SessionConnectionFormState,
  SessionService,
  SessionServiceEventHandlers,
} from "../platform/session";
import type {
  MissionPlannerService,
  MissionPlannerServiceEventHandlers,
  MissionPlannerWorkspaceTransfer,
} from "../platform/mission-planner";
import type {
  MissionPlanFileExportResult,
  MissionPlanFileImportResult,
  MissionPlanFileIo,
} from "../mission-plan-file-io";
import type { SurveyDraftExtension } from "../survey-region";
import { createSurveyDraftExtension, hydrateSurveyRegion } from "../survey-region";
import { getBuiltinCameras } from "../survey-camera-catalog";
import type { CorridorResult } from "../corridor-scan";
import type { StructureScanResult } from "../structure-scan";
import type { SurveyResult } from "../survey-grid";
import { createEmptyMissionPlannerWorkspace, createMissionPlannerViewStore, createMissionPlannerStore } from "./mission-planner";
import { createSessionStore } from "./session";

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

function makeCompositeWorkspace() {
  return {
    ...makeWorkspace({
      home: { latitude_deg: 47.52, longitude_deg: 8.61, altitude_m: 505 },
    }),
    fence: {
      return_point: { latitude_deg: 47.521, longitude_deg: 8.611 },
      regions: [{
        inclusion_polygon: {
          vertices: [
            { latitude_deg: 47.5205, longitude_deg: 8.6105 },
            { latitude_deg: 47.5215, longitude_deg: 8.6105 },
            { latitude_deg: 47.5215, longitude_deg: 8.6115 },
          ],
          inclusion_group: 0,
        },
      }],
    },
    rally: {
      points: [defaultGeoPoint3d(47.523, 8.612, 45)],
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
    embeddedItems: [makeManualWaypoint(47.3982, 8.5454, 55)],
    qgcPassthrough: {},
    warnings: ["Preserved survey metadata from import."],
  };
  const region = hydrateSurveyRegion(parsed);

  extension.surveyRegions.set(region.id, region);
  extension.surveyRegionOrder.push({ regionId: region.id, position: 0 });
  return extension;
}

const BUILTIN_CAMERA = getBuiltinCameras()[0]!;
const SURVEY_POLYGON = [
  { latitude_deg: 47.3981, longitude_deg: 8.5451 },
  { latitude_deg: 47.3984, longitude_deg: 8.5463 },
  { latitude_deg: 47.3977, longitude_deg: 8.5468 },
];
const SURVEY_POLYLINE = [
  { latitude_deg: 47.3981, longitude_deg: 8.5451 },
  { latitude_deg: 47.3984, longitude_deg: 8.5463 },
];

function makeManualWaypoint(lat: number, lon: number, alt: number): MissionItem {
  return {
    command: {
      Nav: {
        Waypoint: {
          position: defaultGeoPoint3d(lat, lon, alt),
          hold_time_s: 0,
          acceptance_radius_m: 1,
          pass_radius_m: 0,
          yaw_deg: 0,
        },
      },
    },
    current: false,
    autocontinue: true,
  };
}

function makeManualCameraImportExtension(): SurveyDraftExtension {
  const extension = createSurveyDraftExtension();
  const region = hydrateSurveyRegion({
    patternType: "grid",
    position: 0,
    polygon: SURVEY_POLYGON,
    polyline: [],
    camera: null,
    params: {
      altitude_m: 55,
      sideOverlap_pct: 65,
      frontOverlap_pct: 80,
    },
    embeddedItems: [makeManualWaypoint(47.3982, 8.5454, 55)],
    qgcPassthrough: {
      TransectStyleComplexItem: {
        CameraCalc: {
          CameraName: "Manual (no camera specs)",
          DistanceToSurface: 55,
          SideOverlap: 65,
          FrontalOverlap: 80,
        },
      },
    },
    warnings: ["Imported survey camera metadata is preserved for export only."],
  });

  extension.surveyRegions.set(region.id, region);
  extension.surveyRegionOrder.push({ regionId: region.id, position: 0 });
  return extension;
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("createMissionPlannerStore", () => {
  beforeEach(() => {
    if (typeof localStorage?.clear === "function") {
      localStorage.clear();
    }
  });

  it("moves dirty home and survey blocks into recoverable storage across scope changes and restores them on return", async () => {
    const survey = makeImportedSurveyExtension();
    const sessionHarness = createSessionHarness([
      createSnapshot({ envelope: createEnvelope("session-1") }),
      createSnapshot({ envelope: createEnvelope("session-2", { reset_revision: 1 }) }),
      createSnapshot({ envelope: createEnvelope("session-1", { reset_revision: 2 }) }),
    ]);
    const plannerHarness = createPlannerServiceHarness();
    const fileHarness = createFileIoHarness();
    const sessionStore = createSessionStore(sessionHarness.service);
    const plannerStore = createMissionPlannerStore(sessionStore, plannerHarness.service, fileHarness.fileIo);

    await sessionStore.initialize();
    await plannerStore.initialize();

    plannerStore.replaceWorkspace(makeWorkspace({ survey }));
    plannerStore.setHome({ latitude_deg: 47.5, longitude_deg: 8.6, altitude_m: 500 });

    await sessionStore.bootstrapSource("live");
    await flush();

    let state = get(plannerStore);
    let view = get(createMissionPlannerViewStore(plannerStore));
    expect(state.activeEnvelope?.session_id).toBe("session-2");
    expect(state.home).toEqual({
      latitude_deg: 47.5,
      longitude_deg: 8.6,
      altitude_m: 500,
    });
    expect(state.recoverableWorkspace?.active.home).toEqual({
      latitude_deg: 47.5,
      longitude_deg: 8.6,
      altitude_m: 500,
    });
    expect(state.recoverableWorkspace?.active.survey.surveyRegionOrder).toHaveLength(1);
    expect(view.attachment.kind).toBe("detached-local");
    expect(view.canEdit).toBe(true);
    expect(view.canUseVehicleActions).toBe(false);

    plannerStore.addMissionItem();
    state = get(plannerStore);
    view = get(createMissionPlannerViewStore(plannerStore));
    expect(state.draftState.active.mission.document.items).toHaveLength(2);
    expect(view.undoCount).toBeGreaterThan(0);

    await sessionStore.bootstrapSource("live");
    await flush();

    state = get(plannerStore);
    view = get(createMissionPlannerViewStore(plannerStore));
    expect(state.activeEnvelope?.session_id).toBe("session-1");
    expect(state.replacePrompt?.kind).toBe("recoverable");
    expect(state.home).toEqual({ latitude_deg: 47.5, longitude_deg: 8.6, altitude_m: 500 });
    expect(state.survey.surveyRegionOrder).toHaveLength(1);
    await plannerStore.confirmReplacePrompt();
    state = get(plannerStore);
    view = get(createMissionPlannerViewStore(plannerStore));
    expect(view.replacePrompt).toBeNull();
    expect(view.attachment.kind).toBe("live-attached");
    expect(view.dirty).toBe(true);
    expect(view.surveyRegionCount).toBe(1);

    plannerStore.undo("mission");
    state = get(plannerStore);
    view = get(createMissionPlannerViewStore(plannerStore));
    expect(view.attachment.kind).toBe("detached-local");
    expect(view.canEdit).toBe(true);
    expect(view.canUseVehicleActions).toBe(false);
    expect(state.draftState.active.mission.document.items).toHaveLength(2);

    plannerStore.redo("mission");
    view = get(createMissionPlannerViewStore(plannerStore));
    expect(view.attachment.kind).toBe("live-attached");
  });

  it("keeps per-domain history independent and undoes workspace replacement atomically", async () => {
    const sessionHarness = createSessionHarness([createSnapshot({ envelope: createEnvelope("session-1") })]);
    const plannerHarness = createPlannerServiceHarness();
    const fileHarness = createFileIoHarness();
    const sessionStore = createSessionStore(sessionHarness.service);
    const plannerStore = createMissionPlannerStore(sessionStore, plannerHarness.service, fileHarness.fileIo);
    const viewStore = createMissionPlannerViewStore(plannerStore);

    await sessionStore.initialize();
    await plannerStore.initialize();

    plannerStore.replaceWorkspace(makeCompositeWorkspace());

    let state = get(plannerStore);
    const rallyUiId = state.draftState.active.rally.draftItems[0]?.uiId;
    expect(rallyUiId).toBeTypeOf("number");

    plannerStore.setHome({ latitude_deg: 47.6, longitude_deg: 8.7, altitude_m: 510 });
    plannerStore.setFenceReturnPoint({ latitude_deg: 47.61, longitude_deg: 8.71 });
    plannerStore.updateRallyPointAltitudeByUiId(rallyUiId!, 80);

    let view = get(viewStore);
    expect(view.mode).toBe("mission");
    expect(view.undoCount).toBe(2);
    expect(view.canRedo).toBe(false);

    plannerStore.setMode("fence");
    view = get(viewStore);
    expect(view.undoCount).toBe(2);
    expect(view.canRedo).toBe(false);

    plannerStore.setMode("rally");
    view = get(viewStore);
    expect(view.undoCount).toBe(2);
    expect(view.canRedo).toBe(false);

    plannerStore.replaceWorkspace(createEmptyMissionPlannerWorkspace());

    state = get(plannerStore);
    expect(state.home).toBeNull();
    expect(state.draftState.active.mission.document.items).toHaveLength(0);
    expect(state.draftState.active.fence.document.regions).toHaveLength(0);
    expect(state.draftState.active.rally.document.points).toHaveLength(0);

    plannerStore.undo("fence");

    state = get(plannerStore);
    expect(state.home).toEqual({ latitude_deg: 47.6, longitude_deg: 8.7, altitude_m: 510 });
    expect(state.draftState.active.mission.document.items).toHaveLength(1);
    expect(state.draftState.active.fence.document.regions).toHaveLength(1);
    expect(state.draftState.active.fence.document.return_point).toEqual({ latitude_deg: 47.61, longitude_deg: 8.71 });
    expect(state.draftState.active.rally.document.points).toHaveLength(1);

    plannerStore.setMode("mission");
    view = get(viewStore);
    expect(view.canRedo).toBe(true);
    expect(view.redoCount).toBe(1);

    plannerStore.redo("rally");

    state = get(plannerStore);
    expect(state.home).toBeNull();
    expect(state.draftState.active.mission.document.items).toHaveLength(0);
    expect(state.draftState.active.fence.document.regions).toHaveLength(0);
    expect(state.draftState.active.rally.document.points).toHaveLength(0);
  });

  it("invalidates redo after a new edit and caps mission history at 50 entries", async () => {
    const sessionHarness = createSessionHarness([createSnapshot({ envelope: createEnvelope("session-1") })]);
    const plannerHarness = createPlannerServiceHarness();
    const fileHarness = createFileIoHarness();
    const sessionStore = createSessionStore(sessionHarness.service);
    const plannerStore = createMissionPlannerStore(sessionStore, plannerHarness.service, fileHarness.fileIo);
    const viewStore = createMissionPlannerViewStore(plannerStore);

    await sessionStore.initialize();
    await plannerStore.initialize();

    plannerStore.replaceWorkspace(createEmptyMissionPlannerWorkspace());
    plannerStore.addMissionItem();
    plannerStore.addMissionItem();
    plannerStore.undo("mission");

    let view = get(viewStore);
    expect(view.canRedo).toBe(true);
    expect(view.redoCount).toBe(1);

    plannerStore.addMissionItem();
    view = get(viewStore);
    expect(view.canRedo).toBe(false);
    expect(view.redoCount).toBe(0);

    for (let index = 0; index < 55; index += 1) {
      plannerStore.addMissionItem();
    }

    view = get(viewStore);
    expect(view.undoCount).toBe(50);
  });

  it("drops stale async downloads when the session scope changes mid-flight", async () => {
    const pendingDownload = deferred<MissionPlannerWorkspaceTransfer>();
    const sessionHarness = createSessionHarness([
      createSnapshot({ envelope: createEnvelope("session-1") }),
      createSnapshot({ envelope: createEnvelope("session-2", { reset_revision: 1 }) }),
    ]);
    const plannerHarness = createPlannerServiceHarness({
      downloadWorkspace: vi.fn(() => pendingDownload.promise),
    });
    const fileHarness = createFileIoHarness();
    const sessionStore = createSessionStore(sessionHarness.service);
    const plannerStore = createMissionPlannerStore(sessionStore, plannerHarness.service, fileHarness.fileIo);

    await sessionStore.initialize();
    await plannerStore.initialize();

    const downloadPromise = plannerStore.downloadFromVehicle();
    await flush();
    await sessionStore.bootstrapSource("live");
    await flush();

    pendingDownload.resolve({
      mission: {
        items: [
          {
            command: { Nav: "ReturnToLaunch" },
            current: true,
            autocontinue: true,
          },
        ],
      },
      fence: { return_point: null, regions: [] },
      rally: { points: [] },
      home: { latitude_deg: 48, longitude_deg: 9, altitude_m: 550 },
    });
    await downloadPromise;
    await flush();

    const state = get(plannerStore);
    const view = get(createMissionPlannerViewStore(plannerStore));

    expect(state.activeEnvelope?.session_id).toBe("session-2");
    expect(state.home).toBeNull();
    expect(state.draftState.active.mission.document.items).toHaveLength(0);
    expect(view.activeTransfer).toBeNull();
  });

  it("prompts before replacing a dirty same-scope draft with an imported survey workspace", async () => {
    const survey = makeImportedSurveyExtension();
    const sessionHarness = createSessionHarness([createSnapshot({ envelope: createEnvelope("session-1") })]);
    const plannerHarness = createPlannerServiceHarness();
    const fileHarness = createFileIoHarness({
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
          home: { latitude_deg: 47.39, longitude_deg: 8.53, altitude_m: 488 },
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
    });
    const sessionStore = createSessionStore(sessionHarness.service);
    const plannerStore = createMissionPlannerStore(sessionStore, plannerHarness.service, fileHarness.fileIo);

    await sessionStore.initialize();
    await plannerStore.initialize();

    plannerStore.replaceWorkspace(makeWorkspace());
    plannerStore.setHome({ latitude_deg: 47.5, longitude_deg: 8.6, altitude_m: 500 });

    await plannerStore.importFromPicker();

    let state = get(plannerStore);
    expect(state.pendingImportReview).not.toBeNull();
    expect(state.pendingImportReview?.choices.map((choice) => choice.domain)).toEqual(["mission"]);
    expect(state.home).toEqual({ latitude_deg: 47.5, longitude_deg: 8.6, altitude_m: 500 });
    expect(state.survey.surveyRegionOrder).toHaveLength(0);

    await plannerStore.confirmImportReview();

    state = get(plannerStore);
    let view = get(createMissionPlannerViewStore(plannerStore));

    expect(state.pendingImportReview).toBeNull();
    expect(state.home).toEqual({ latitude_deg: 47.39, longitude_deg: 8.53, altitude_m: 488 });
    expect(state.survey.surveyRegionOrder).toHaveLength(1);
    expect(state.fileWarnings).toEqual(["Imported survey region preserved."]);
    expect(view.fileWarningCount).toBe(1);
    expect(view.surveyRegionCount).toBe(1);
    expect(view.dirty).toBe(false);
    expect(view.canUndo).toBe(true);

    plannerStore.undo("mission");

    state = get(plannerStore);
    view = get(createMissionPlannerViewStore(plannerStore));
    expect(state.home).toEqual({ latitude_deg: 47.5, longitude_deg: 8.6, altitude_m: 500 });
    expect(state.survey.surveyRegionOrder).toHaveLength(0);
    expect(state.draftState.active.mission.document.items).toHaveLength(1);
    expect(view.canRedo).toBe(true);

    plannerStore.redo("mission");
    expect(get(createMissionPlannerViewStore(plannerStore)).surveyRegionCount).toBe(1);
  });

  it("keeps the current draft untouched when a download fails", async () => {
    const sessionHarness = createSessionHarness([createSnapshot({ envelope: createEnvelope("session-1") })]);
    const plannerHarness = createPlannerServiceHarness({
      downloadWorkspace: vi.fn(async () => {
        throw new Error("malformed mission download");
      }),
    });
    const fileHarness = createFileIoHarness();
    const sessionStore = createSessionStore(sessionHarness.service);
    const plannerStore = createMissionPlannerStore(sessionStore, plannerHarness.service, fileHarness.fileIo);

    await sessionStore.initialize();
    await plannerStore.initialize();

    plannerStore.replaceWorkspace(makeWorkspace({
      home: { latitude_deg: 47.5, longitude_deg: 8.6, altitude_m: 500 },
    }));
    const beforeView = get(createMissionPlannerViewStore(plannerStore));

    await plannerStore.downloadFromVehicle();

    const state = get(plannerStore);
    const view = get(createMissionPlannerViewStore(plannerStore));
    expect(state.lastError).toContain("malformed mission download");
    expect(state.home).toEqual({ latitude_deg: 47.5, longitude_deg: 8.6, altitude_m: 500 });
    expect(state.draftState.active.mission.document.items).toHaveLength(1);
    expect(view.undoCount).toBe(beforeView.undoCount);
    expect(view.canRedo).toBe(beforeView.canRedo);
  });

  it("marks playback scopes read-only and blocks mounted draft edits while preserving the current workspace", async () => {
    const sessionHarness = createSessionHarness([
      createSnapshot({ envelope: createEnvelope("session-1", { source_kind: "playback", seek_epoch: 1, reset_revision: 1 }) }),
    ]);
    const plannerHarness = createPlannerServiceHarness();
    const fileHarness = createFileIoHarness();
    const sessionStore = createSessionStore(sessionHarness.service);
    const plannerStore = createMissionPlannerStore(sessionStore, plannerHarness.service, fileHarness.fileIo);

    await sessionStore.initialize("playback");
    await plannerStore.initialize();

    plannerStore.replaceWorkspace(makeWorkspace({
      home: { latitude_deg: 47.5, longitude_deg: 8.6, altitude_m: 500 },
    }));
    const before = get(plannerStore).home;

    plannerStore.setHome({ latitude_deg: 48, longitude_deg: 9, altitude_m: 550 });

    const state = get(plannerStore);
    const view = get(createMissionPlannerViewStore(plannerStore));

    expect(view.attachment.kind).toBe("playback-readonly");
    expect(view.canEdit).toBe(false);
    expect(view.canUseVehicleActions).toBe(false);
    expect(state.home).toEqual(before);
    expect(state.blockedReason).toContain("playback");
  });

  it("creates survey blocks after home, manual items, and survey blocks with deterministic ordering", async () => {
    const sessionHarness = createSessionHarness([createSnapshot({ envelope: createEnvelope("session-1") })]);
    const plannerHarness = createPlannerServiceHarness();
    const fileHarness = createFileIoHarness();
    const sessionStore = createSessionStore(sessionHarness.service);
    const plannerStore = createMissionPlannerStore(sessionStore, plannerHarness.service, fileHarness.fileIo);

    await sessionStore.initialize();
    await plannerStore.initialize();

    plannerStore.replaceWorkspace(makeWorkspace());

    const firstRegionId = plannerStore.createSurveyBlock("grid", SURVEY_POLYGON);
    plannerStore.selectMissionItem(0);
    const manualAnchorRegionId = plannerStore.createSurveyBlock("corridor", SURVEY_POLYLINE);
    plannerStore.selectSurveyRegion(firstRegionId);
    const surveyAnchorRegionId = plannerStore.createSurveyBlock("structure", SURVEY_POLYGON);

    const state = get(plannerStore);
    const view = get(createMissionPlannerViewStore(plannerStore));

    expect(state.survey.surveyRegionOrder).toEqual([
      { regionId: firstRegionId, position: 0 },
      { regionId: surveyAnchorRegionId, position: 0 },
      { regionId: manualAnchorRegionId, position: 1 },
    ]);
    expect(view.surveyOrder).toEqual([
      { regionId: firstRegionId, position: 0 },
      { regionId: surveyAnchorRegionId, position: 0 },
      { regionId: manualAnchorRegionId, position: 1 },
    ]);
    expect(view.selectedSurvey).toMatchObject({
      regionId: surveyAnchorRegionId,
      patternType: "structure",
      position: 0,
      generationState: "blocked",
    });
  });

  it("blocks generation for imported camera-less survey regions while preserving their embedded items", async () => {
    const sessionHarness = createSessionHarness([createSnapshot({ envelope: createEnvelope("session-1") })]);
    const plannerHarness = createPlannerServiceHarness();
    const fileHarness = createFileIoHarness();
    const sessionStore = createSessionStore(sessionHarness.service);
    const plannerStore = createMissionPlannerStore(sessionStore, plannerHarness.service, fileHarness.fileIo);

    await sessionStore.initialize();
    await plannerStore.initialize();

    const survey = makeManualCameraImportExtension();
    const regionId = survey.surveyRegionOrder[0]?.regionId ?? "";
    plannerStore.replaceWorkspace(makeWorkspace({ survey }));
    plannerStore.selectSurveyRegion(regionId);

    const result = await plannerStore.generateSurveyRegion(regionId);

    const state = get(plannerStore);
    const region = state.survey.surveyRegions.get(regionId);
    const view = get(createMissionPlannerViewStore(plannerStore));

    expect(result).toMatchObject({ status: "blocked" });
    expect(region?.generatedItems).toHaveLength(1);
    expect(region?.generationState).toBe("blocked");
    expect(region?.generationMessage).toContain("Choose a valid camera");
    expect(view.selectedSurvey).toMatchObject({
      regionId,
      generationState: "blocked",
    });
  });

  it("prompts before regenerate when survey blocks have manual edits and preserves them on dismissal", async () => {
    const sessionHarness = createSessionHarness([createSnapshot({ envelope: createEnvelope("session-1") })]);
    const plannerHarness = createPlannerServiceHarness();
    const fileHarness = createFileIoHarness();
    const sessionStore = createSessionStore(sessionHarness.service);
    const plannerStore = createMissionPlannerStore(sessionStore, plannerHarness.service, fileHarness.fileIo);

    await sessionStore.initialize();
    await plannerStore.initialize();

    plannerStore.replaceWorkspace(makeWorkspace());
    const regionId = plannerStore.createSurveyBlock("grid", SURVEY_POLYGON);
    plannerStore.updateAuthoredSurveyRegion(regionId, (region) => ({
      ...region,
      cameraId: BUILTIN_CAMERA.canonicalName,
      camera: BUILTIN_CAMERA,
      generatedItems: [makeManualWaypoint(47.399, 8.547, 55)],
    }));
    plannerStore.markSurveyRegionItemAsEdited(regionId, 0, makeManualWaypoint(47.3995, 8.5475, 60));

    const result = await plannerStore.generateSurveyRegion(regionId);

    let state = get(plannerStore);
    expect(result).toMatchObject({ status: "prompted" });
    expect(state.surveyPrompt).toMatchObject({ kind: "confirm-regenerate", regionId });
    expect(state.survey.surveyRegions.get(regionId)?.manualEdits.size).toBe(1);

    plannerStore.dismissSurveyPrompt();
    state = get(plannerStore);
    expect(state.surveyPrompt).toBeNull();
    expect(state.survey.surveyRegions.get(regionId)?.manualEdits.size).toBe(1);
  });

  it("dismisses and confirms dissolve prompts while preserving mixed ordering when blocks become manual items", async () => {
    const sessionHarness = createSessionHarness([createSnapshot({ envelope: createEnvelope("session-1") })]);
    const plannerHarness = createPlannerServiceHarness();
    const fileHarness = createFileIoHarness();
    const sessionStore = createSessionStore(sessionHarness.service);
    const plannerStore = createMissionPlannerStore(sessionStore, plannerHarness.service, fileHarness.fileIo);

    await sessionStore.initialize();
    await plannerStore.initialize();

    plannerStore.replaceWorkspace(makeWorkspace());
    const firstRegionId = plannerStore.createSurveyBlock("grid", SURVEY_POLYGON);
    plannerStore.updateAuthoredSurveyRegion(firstRegionId, (region) => ({
      ...region,
      cameraId: BUILTIN_CAMERA.canonicalName,
      camera: BUILTIN_CAMERA,
      generatedItems: [makeManualWaypoint(47.3982, 8.5454, 50)],
    }));
    plannerStore.selectSurveyRegion(firstRegionId);
    const secondRegionId = plannerStore.createSurveyBlock("corridor", SURVEY_POLYLINE);
    plannerStore.updateAuthoredSurveyRegion(secondRegionId, (region) => ({
      ...region,
      cameraId: BUILTIN_CAMERA.canonicalName,
      camera: BUILTIN_CAMERA,
      generatedItems: [makeManualWaypoint(47.3986, 8.5459, 52)],
    }));

    expect(plannerStore.promptDissolveSurveyRegion(firstRegionId)).toMatchObject({ status: "prompted" });
    let state = get(plannerStore);
    expect(state.surveyPrompt).toMatchObject({ kind: "confirm-dissolve", regionId: firstRegionId });

    plannerStore.dismissSurveyPrompt();
    state = get(plannerStore);
    expect(state.surveyPrompt).toBeNull();
    expect(state.survey.surveyRegionOrder).toEqual([
      { regionId: firstRegionId, position: 0 },
      { regionId: secondRegionId, position: 0 },
    ]);

    plannerStore.promptDissolveSurveyRegion(firstRegionId);
    expect(await plannerStore.confirmSurveyPrompt()).toMatchObject({ status: "dissolved", itemCount: 1 });

    state = get(plannerStore);
    const transferMission = state.draftState.active.mission.document.items;
    const effectiveMission = get(createMissionPlannerViewStore(plannerStore)).effectiveMissionItemCount;

    expect(state.survey.surveyRegionOrder).toEqual([{ regionId: secondRegionId, position: 1 }]);
    expect(transferMission).toHaveLength(2);
    expect(transferMission[0]).toMatchObject({
      command: makeManualWaypoint(47.3982, 8.5454, 50).command,
    });
    expect(effectiveMission).toBe(3);
  });

  it("preserves the last generated output when regeneration fails validation", async () => {
    const sessionHarness = createSessionHarness([createSnapshot({ envelope: createEnvelope("session-1") })]);
    const plannerHarness = createPlannerServiceHarness();
    const fileHarness = createFileIoHarness();
    const sessionStore = createSessionStore(sessionHarness.service);
    const plannerStore = createMissionPlannerStore(sessionStore, plannerHarness.service, fileHarness.fileIo);

    await sessionStore.initialize();
    await plannerStore.initialize();

    plannerStore.replaceWorkspace(makeWorkspace());
    const regionId = plannerStore.createSurveyBlock("grid", SURVEY_POLYGON);
    const previousItem = makeManualWaypoint(47.3982, 8.5454, 50);
    plannerStore.updateAuthoredSurveyRegion(regionId, (region) => ({
      ...region,
      cameraId: BUILTIN_CAMERA.canonicalName,
      camera: {
        ...BUILTIN_CAMERA,
        focalLength_mm: 0,
      } as typeof BUILTIN_CAMERA,
      generatedItems: [previousItem],
    }));

    const result = await plannerStore.generateSurveyRegion(regionId, true);
    const state = get(plannerStore);
    const region = state.survey.surveyRegions.get(regionId);

    expect(result).toMatchObject({ status: "generated", ok: false });
    expect(region?.generatedItems).toEqual([previousItem]);
    expect(region?.errors[0]?.code).toBe("invalid_camera");
    expect(region?.generationState).toBe("idle");
    expect(region?.generationMessage).toContain("greater than zero");
  });

  it("preserves the last generated output when survey generation times out", async () => {
    const sessionHarness = createSessionHarness([createSnapshot({ envelope: createEnvelope("session-1") })]);
    const plannerHarness = createPlannerServiceHarness();
    const fileHarness = createFileIoHarness();
    const sessionStore = createSessionStore(sessionHarness.service);
    const plannerStore = createMissionPlannerStore(sessionStore, plannerHarness.service, fileHarness.fileIo, {
      surveyGenerationTimeoutMs: 1,
      surveyEngines: {
        grid: vi.fn((): Promise<SurveyResult> => new Promise(() => { })),
        corridor: vi.fn(async (): Promise<CorridorResult> => ({ ok: false, errors: [] })),
        structure: vi.fn(async (): Promise<StructureScanResult> => ({ ok: false, errors: [] })),
      },
    });

    await sessionStore.initialize();
    await plannerStore.initialize();

    plannerStore.replaceWorkspace(makeWorkspace());
    const regionId = plannerStore.createSurveyBlock("grid", SURVEY_POLYGON);
    const previousItem = makeManualWaypoint(47.3982, 8.5454, 50);
    plannerStore.updateAuthoredSurveyRegion(regionId, (region) => ({
      ...region,
      cameraId: BUILTIN_CAMERA.canonicalName,
      camera: BUILTIN_CAMERA,
      generatedItems: [previousItem],
    }));

    const result = await plannerStore.generateSurveyRegion(regionId, true);
    const state = get(plannerStore);
    const region = state.survey.surveyRegions.get(regionId);

    expect(result).toMatchObject({ status: "error" });
    expect(region?.generatedItems).toEqual([previousItem]);
    expect(region?.generationState).toBe("blocked");
    expect(region?.generationMessage).toContain("timed out");
    expect(state.lastError).toContain("timed out");
  });
});
