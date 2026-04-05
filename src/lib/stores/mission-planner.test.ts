// @vitest-environment jsdom

import { get } from "svelte/store";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { HomePosition, MissionPlan, TransferProgress, MissionState } from "../../mission";
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
import { createMissionPlannerViewStore, createMissionPlannerStore } from "./mission-planner";
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
        command: { Nav: "ReturnToLaunch" },
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
    expect(state.activeEnvelope?.session_id).toBe("session-2");
    expect(state.home).toBeNull();
    expect(state.recoverableWorkspace?.active.home).toEqual({
      latitude_deg: 47.5,
      longitude_deg: 8.6,
      altitude_m: 500,
    });
    expect(state.recoverableWorkspace?.active.survey.surveyRegionOrder).toHaveLength(1);

    await sessionStore.bootstrapSource("live");
    await flush();

    state = get(plannerStore);
    expect(state.activeEnvelope?.session_id).toBe("session-1");
    expect(state.replacePrompt?.kind).toBe("recoverable");

    plannerStore.confirmReplacePrompt();

    state = get(plannerStore);
    expect(state.home).toEqual({ latitude_deg: 47.5, longitude_deg: 8.6, altitude_m: 500 });
    expect(state.survey.surveyRegionOrder).toHaveLength(1);
    expect(state.recoverableWorkspace).toBeNull();

    const view = get(createMissionPlannerViewStore(plannerStore));
    expect(view.replacePrompt).toBeNull();
    expect(view.dirty).toBe(true);
    expect(view.surveyRegionCount).toBe(1);
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
    expect(state.replacePrompt).toMatchObject({ kind: "replace-active", action: "import" });
    expect(state.home).toEqual({ latitude_deg: 47.5, longitude_deg: 8.6, altitude_m: 500 });
    expect(state.survey.surveyRegionOrder).toHaveLength(0);

    plannerStore.confirmReplacePrompt();

    state = get(plannerStore);
    const view = get(createMissionPlannerViewStore(plannerStore));

    expect(state.home).toEqual({ latitude_deg: 47.39, longitude_deg: 8.53, altitude_m: 488 });
    expect(state.survey.surveyRegionOrder).toHaveLength(1);
    expect(state.fileWarnings).toEqual(["Imported survey region preserved."]);
    expect(view.fileWarningCount).toBe(1);
    expect(view.surveyRegionCount).toBe(1);
    expect(view.dirty).toBe(false);
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

    await plannerStore.downloadFromVehicle();

    const state = get(plannerStore);
    expect(state.lastError).toContain("malformed mission download");
    expect(state.home).toEqual({ latitude_deg: 47.5, longitude_deg: 8.6, altitude_m: 500 });
    expect(state.draftState.active.mission.document.items).toHaveLength(1);
  });
});
