// @vitest-environment jsdom

import { get } from "svelte/store";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ParamMetadataMap } from "../../param-metadata";
import type { ParamProgress, ParamStore, ParamWriteResult } from "../../params";
import type { SessionEnvelope, OpenSessionSnapshot } from "../../session";
import type { TransportDescriptor } from "../../transport";
import type {
  SessionConnectionFormState,
  SessionService,
  SessionServiceEventHandlers,
} from "../platform/session";
import type { ParamsService, ParamsServiceEventHandlers } from "../platform/params";
import {
  createParameterWorkspaceViewStore,
  createParamsStore,
} from "./params";
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

function createParamStore(overrides: Partial<ParamStore> = {}): ParamStore {
  return {
    params: {
      ARMING_CHECK: { name: "ARMING_CHECK", value: 1, param_type: "uint8", index: 0 },
      FS_THR_ENABLE: { name: "FS_THR_ENABLE", value: 2, param_type: "uint8", index: 1 },
      CRUISE_SPEED: { name: "CRUISE_SPEED", value: 12, param_type: "real32", index: 2 },
      ...overrides.params,
    },
    expected_count: 3,
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
    mission_state: null,
    param_store: createParamStore(),
    param_progress: { downloading: { received: 2, expected: 3 } },
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

function createSessionDomain(vehicleType: string | null) {
  const session = createSnapshot().session;
  return {
    ...session,
    value: session.value
      ? {
          ...session.value,
          vehicle_state: vehicleType
            ? {
                ...session.value.vehicle_state!,
                vehicle_type: vehicleType,
              }
            : null,
        }
      : null,
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

function createSessionService(
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

function createParamsService(
  metadata: ParamMetadataMap | null,
  overrides: Partial<ParamsService> = {},
) {
  let handlers: ParamsServiceEventHandlers | null = null;

  const service = {
    subscribeAll: vi.fn(async (nextHandlers: ParamsServiceEventHandlers) => {
      handlers = nextHandlers;
      return () => {
        handlers = null;
      };
    }),
    fetchMetadata: vi.fn(async () => metadata),
    writeBatch: vi.fn(async (params: [string, number][]) => params.map(([name, value]) => ({
      name,
      requested_value: value,
      confirmed_value: value,
      success: true,
    }))),
    formatError: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
    ...overrides,
  } satisfies ParamsService;

  return {
    service,
    emitStore(envelope: SessionEnvelope, value: ParamStore) {
      if (!handlers) {
        throw new Error("param handlers are not registered");
      }

      handlers.onStore({ envelope, value });
    },
    emitProgress(envelope: SessionEnvelope, value: ParamProgress) {
      if (!handlers) {
        throw new Error("param handlers are not registered");
      }

      handlers.onProgress({ envelope, value });
    },
  };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

async function waitForMetadata(store: ReturnType<typeof createParamsStore>) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const state = get(store);
    if (state.metadataState !== "loading") {
      return state;
    }

    await flush();
  }

  return get(store);
}

describe("createParamsStore", () => {
  beforeEach(() => {
    if (typeof localStorage?.clear === "function") {
      localStorage.clear();
    }
  });

  it("hydrates from the scoped session bootstrap and enriches the starter workspace when metadata is available", async () => {
    const metadata = new Map([
      [
        "ARMING_CHECK",
        {
          humanName: "Arming checks",
          description: "Controls pre-arm validation.",
          rebootRequired: true,
        },
      ],
    ]);
    const { service: sessionService } = createSessionService([createSnapshot()]);
    const { service: paramsService } = createParamsService(metadata);
    const sessionStore = createSessionStore(sessionService);
    const paramStore = createParamsStore(sessionStore, paramsService);

    await sessionStore.initialize();
    await paramStore.initialize();
    await waitForMetadata(paramStore);

    const state = get(paramStore);
    const view = get(createParameterWorkspaceViewStore(paramStore));

    expect(state.activeEnvelope?.session_id).toBe("session-1");
    expect(state.paramStore?.params.ARMING_CHECK?.value).toBe(1);
    expect(state.paramProgress).toEqual({ downloading: { received: 2, expected: 3 } });
    expect(state.metadataState).toBe("ready");
    expect(view.status).toBe("ready");
    expect(view.sections[0]?.items[0]).toMatchObject({
      name: "ARMING_CHECK",
      label: "Arming checks",
      rebootRequired: true,
    });
  });

  it("drops stale scoped stream events after the session envelope changes", async () => {
    const firstSnapshot = createSnapshot({
      envelope: createEnvelope("session-1"),
      param_store: createParamStore(),
    });
    const secondSnapshot = createSnapshot({
      envelope: createEnvelope("session-2", { reset_revision: 1 }),
      param_store: createParamStore({
        params: {
          ARMING_CHECK: { name: "ARMING_CHECK", value: 5, param_type: "uint8", index: 0 },
        },
        expected_count: 1,
      }),
    });
    const { service: sessionService } = createSessionService([firstSnapshot, secondSnapshot]);
    const paramsHarness = createParamsService(null);
    const sessionStore = createSessionStore(sessionService);
    const paramStore = createParamsStore(sessionStore, paramsHarness.service);

    await sessionStore.initialize();
    await paramStore.initialize();
    await sessionStore.bootstrapSource("live");
    await flush();

    paramsHarness.emitStore(firstSnapshot.envelope, createParamStore({
      params: {
        ARMING_CHECK: { name: "ARMING_CHECK", value: 99, param_type: "uint8", index: 0 },
      },
      expected_count: 1,
    }));

    const state = get(paramStore);

    expect(state.activeEnvelope?.session_id).toBe("session-2");
    expect(state.paramStore?.params.ARMING_CHECK?.value).toBe(5);
    expect(state.lastNotice).toBeNull();
  });

  it("keeps raw parameter visibility when metadata is unavailable", async () => {
    const { service: sessionService } = createSessionService([createSnapshot()]);
    const { service: paramsService } = createParamsService(null);
    const sessionStore = createSessionStore(sessionService);
    const paramStore = createParamsStore(sessionStore, paramsService);

    await sessionStore.initialize();
    await paramStore.initialize();
    await waitForMetadata(paramStore);

    const state = get(paramStore);
    const view = get(createParameterWorkspaceViewStore(paramStore));

    expect(state.metadataState).toBe("unavailable");
    expect(view.sections[0]?.items[0]).toMatchObject({
      name: "ARMING_CHECK",
      label: "ARMING_CHECK",
    });
    expect(view.metadataText).toContain("Parameter info unavailable");
  });

  it("loads metadata when a vehicle type arrives later on the same session envelope", async () => {
    const metadata = new Map([
      ["FS_THR_ENABLE", { humanName: "Throttle failsafe", description: "late metadata" }],
    ]) as ParamMetadataMap;
    const snapshot = createSnapshot({
      session: createSessionDomain(null),
    });
    const sessionHarness = createSessionService([snapshot]);
    const paramsHarness = createParamsService(null, {
      fetchMetadata: vi.fn().mockResolvedValueOnce(metadata),
    });
    const sessionStore = createSessionStore(sessionHarness.service);
    const paramStore = createParamsStore(sessionStore, paramsHarness.service);

    await sessionStore.initialize();
    await paramStore.initialize();

    let state = get(paramStore);
    expect(state.vehicleType).toBeNull();
    expect(state.metadataState).toBe("idle");

    sessionHarness.emit("onSession", {
      envelope: snapshot.envelope,
      value: createSessionDomain("fixed_wing"),
    });

    state = await waitForMetadata(paramStore);

    expect(state.vehicleType).toBe("fixed_wing");
    expect(state.metadataState).toBe("ready");
    expect(state.metadata?.get("FS_THR_ENABLE")?.humanName).toBe("Throttle failsafe");
    expect(paramsHarness.service.fetchMetadata).toHaveBeenCalledWith("fixed_wing");
  });

  it("invalidates stale same-envelope metadata requests when vehicle type changes again", async () => {
    const firstMetadata = deferred<ParamMetadataMap | null>();
    const secondMetadata = deferred<ParamMetadataMap | null>();
    const snapshot = createSnapshot({
      session: createSessionDomain(null),
    });
    const sessionHarness = createSessionService([snapshot]);
    const paramsHarness = createParamsService(null, {
      fetchMetadata: vi
        .fn()
        .mockReturnValueOnce(firstMetadata.promise)
        .mockReturnValueOnce(secondMetadata.promise),
    });
    const sessionStore = createSessionStore(sessionHarness.service);
    const paramStore = createParamsStore(sessionStore, paramsHarness.service);

    await sessionStore.initialize();
    await paramStore.initialize();

    sessionHarness.emit("onSession", {
      envelope: snapshot.envelope,
      value: createSessionDomain("quadrotor"),
    });
    await flush();

    expect(get(paramStore).metadataState).toBe("loading");

    sessionHarness.emit("onSession", {
      envelope: snapshot.envelope,
      value: createSessionDomain("fixed_wing"),
    });

    const newest = new Map([
      ["FS_THR_ENABLE", { humanName: "Newest metadata", description: "latest" }],
    ]) as ParamMetadataMap;
    secondMetadata.resolve(newest);
    let state = await waitForMetadata(paramStore);

    expect(state.vehicleType).toBe("fixed_wing");
    expect(state.metadata?.get("FS_THR_ENABLE")?.humanName).toBe("Newest metadata");
    expect(paramsHarness.service.fetchMetadata).toHaveBeenNthCalledWith(1, "quadrotor");
    expect(paramsHarness.service.fetchMetadata).toHaveBeenNthCalledWith(2, "fixed_wing");

    const stale = new Map([
      ["ARMING_CHECK", { humanName: "Stale metadata", description: "old" }],
    ]) as ParamMetadataMap;
    firstMetadata.resolve(stale);
    await flush();

    state = get(paramStore);
    expect(state.metadata?.get("FS_THR_ENABLE")?.humanName).toBe("Newest metadata");
    expect(state.metadata?.get("ARMING_CHECK")?.humanName).toBeUndefined();
  });

  it("keeps raw values and staged edits usable when a same-envelope metadata reload fails", async () => {
    const readyMetadata = new Map([
      ["ARMING_CHECK", { humanName: "Arming checks", description: "ready metadata" }],
    ]) as ParamMetadataMap;
    const snapshot = createSnapshot({
      session: createSessionDomain("quadrotor"),
    });
    const sessionHarness = createSessionService([snapshot]);
    const paramsHarness = createParamsService(null, {
      fetchMetadata: vi
        .fn()
        .mockResolvedValueOnce(readyMetadata)
        .mockRejectedValueOnce(new Error("metadata rejected")),
    });
    const sessionStore = createSessionStore(sessionHarness.service);
    const paramStore = createParamsStore(sessionStore, paramsHarness.service);

    await sessionStore.initialize();
    await paramStore.initialize();
    await waitForMetadata(paramStore);

    const item = get(createParameterWorkspaceViewStore(paramStore)).sections[0]?.items.find(
      (entry) => entry.name === "ARMING_CHECK",
    );
    expect(item?.label).toBe("Arming checks");

    paramStore.stageParameterEdit(item!, 7);

    sessionHarness.emit("onSession", {
      envelope: snapshot.envelope,
      value: createSessionDomain("fixed_wing"),
    });

    const state = await waitForMetadata(paramStore);
    const view = get(createParameterWorkspaceViewStore(paramStore));
    const stagedItem = view.sections[0]?.items.find((entry) => entry.name === "ARMING_CHECK");

    expect(state.metadata).toBeNull();
    expect(state.metadataState).toBe("unavailable");
    expect(state.metadataError).toBe("metadata rejected");
    expect(state.paramStore?.params.ARMING_CHECK?.value).toBe(1);
    expect(state.stagedEdits.ARMING_CHECK?.nextValue).toBe(7);
    expect(stagedItem).toMatchObject({
      label: "ARMING_CHECK",
      isStaged: true,
      stagedValue: 7,
    });
  });

  it("filters malformed bootstrap entries instead of poisoning the scoped snapshot", async () => {
    const malformedSnapshot = createSnapshot({
      param_store: {
        expected_count: 2,
        params: {
          ARMING_CHECK: { name: "ARMING_CHECK", value: 1, param_type: "uint8", index: 0 },
          BROKEN: { name: "BROKEN", value: "nope", param_type: "uint8", index: 1 },
        },
      } as unknown as ParamStore,
    });
    const { service: sessionService } = createSessionService([malformedSnapshot]);
    const { service: paramsService } = createParamsService(null);
    const sessionStore = createSessionStore(sessionService);
    const paramStore = createParamsStore(sessionStore, paramsService);

    await sessionStore.initialize();
    await paramStore.initialize();
    await waitForMetadata(paramStore);

    const state = get(paramStore);

    expect(state.paramStore?.params.ARMING_CHECK?.value).toBe(1);
    expect(state.paramStore?.params.BROKEN).toBeUndefined();
  });

  it("applies metadata fetches with last-write-wins semantics across scope changes", async () => {
    const firstMetadata = deferred<ParamMetadataMap | null>();
    const secondMetadata = deferred<ParamMetadataMap | null>();
    const firstSnapshot = createSnapshot({
      envelope: createEnvelope("session-1"),
      session: {
        ...createSnapshot().session,
        value: {
          ...createSnapshot().session.value!,
          vehicle_state: {
            ...createSnapshot().session.value!.vehicle_state!,
            vehicle_type: "quadrotor",
          },
        },
      },
    });
    const secondSnapshot = createSnapshot({
      envelope: createEnvelope("session-2", { reset_revision: 1 }),
      session: {
        ...createSnapshot().session,
        value: {
          ...createSnapshot().session.value!,
          vehicle_state: {
            ...createSnapshot().session.value!.vehicle_state!,
            vehicle_type: "fixed_wing",
          },
        },
      },
    });
    const { service: sessionService } = createSessionService([firstSnapshot, secondSnapshot]);
    const { service: paramsService } = createParamsService(null, {
      fetchMetadata: vi
        .fn()
        .mockReturnValueOnce(firstMetadata.promise)
        .mockReturnValueOnce(secondMetadata.promise),
    });
    const sessionStore = createSessionStore(sessionService);
    const paramStore = createParamsStore(sessionStore, paramsService);

    await sessionStore.initialize();
    await paramStore.initialize();
    await sessionStore.bootstrapSource("live");

    const newest = new Map([
      ["FS_THR_ENABLE", { humanName: "Newest metadata", description: "latest" }],
    ]);
    secondMetadata.resolve(newest);
    await waitForMetadata(paramStore);

    let state = get(paramStore);
    expect(state.activeEnvelope?.session_id).toBe("session-2");
    expect(state.metadata?.get("FS_THR_ENABLE")?.humanName).toBe("Newest metadata");

    const stale = new Map([
      ["ARMING_CHECK", { humanName: "Stale metadata", description: "old" }],
    ]);
    firstMetadata.resolve(stale);
    await flush();

    state = get(paramStore);
    expect(state.metadata?.get("FS_THR_ENABLE")?.humanName).toBe("Newest metadata");
    expect(state.metadata?.get("ARMING_CHECK")?.humanName).toBeUndefined();
  });

  it("does not allow pre-reset metadata responses to overwrite post-reset state", async () => {
    const staleMetadata = deferred<ParamMetadataMap | null>();
    const freshMetadata = deferred<ParamMetadataMap | null>();
    const { service: sessionService } = createSessionService([createSnapshot()]);
    const { service: paramsService } = createParamsService(null, {
      fetchMetadata: vi
        .fn()
        .mockReturnValueOnce(staleMetadata.promise)
        .mockReturnValueOnce(freshMetadata.promise),
    });
    const sessionStore = createSessionStore(sessionService);
    const paramStore = createParamsStore(sessionStore, paramsService);

    await sessionStore.initialize();
    await paramStore.initialize();

    paramStore.reset();
    await paramStore.initialize();

    const newest = new Map([
      ["FS_THR_ENABLE", { humanName: "Fresh metadata", description: "new" }],
    ]);
    freshMetadata.resolve(newest);
    await waitForMetadata(paramStore);

    let state = get(paramStore);
    expect(state.metadata?.get("FS_THR_ENABLE")?.humanName).toBe("Fresh metadata");

    const old = new Map([
      ["ARMING_CHECK", { humanName: "Stale metadata", description: "old" }],
    ]);
    staleMetadata.resolve(old);
    await flush();

    state = get(paramStore);
    expect(state.metadata?.get("FS_THR_ENABLE")?.humanName).toBe("Fresh metadata");
    expect(state.metadata?.get("ARMING_CHECK")?.humanName).toBeUndefined();
  });

  it("ignores in-flight metadata responses after vehicle type becomes unavailable", async () => {
    const pendingMetadata = deferred<ParamMetadataMap | null>();
    const firstSnapshot = createSnapshot({
      envelope: createEnvelope("session-1"),
    });
    const secondSnapshot = createSnapshot({
      envelope: createEnvelope("session-2", { reset_revision: 1 }),
      session: {
        ...createSnapshot().session,
        value: {
          ...createSnapshot().session.value!,
          vehicle_state: null,
        },
      },
    });
    const { service: sessionService } = createSessionService([firstSnapshot, secondSnapshot]);
    const { service: paramsService } = createParamsService(null, {
      fetchMetadata: vi.fn().mockReturnValueOnce(pendingMetadata.promise),
    });
    const sessionStore = createSessionStore(sessionService);
    const paramStore = createParamsStore(sessionStore, paramsService);

    await sessionStore.initialize();
    await paramStore.initialize();
    await sessionStore.bootstrapSource("live");
    await flush();

    let state = get(paramStore);
    expect(state.activeEnvelope?.session_id).toBe("session-2");
    expect(state.vehicleType).toBeNull();
    expect(state.metadata).toBeNull();
    expect(state.metadataState).toBe("idle");

    pendingMetadata.resolve(new Map([
      ["ARMING_CHECK", { humanName: "Stale metadata", description: "old" }],
    ]));
    await flush();

    state = get(paramStore);
    expect(state.vehicleType).toBeNull();
    expect(state.metadata).toBeNull();
    expect(state.metadataState).toBe("idle");
    expect(state.metadataError).toBeNull();
  });

  it("prunes staged edits only when the live backend value matches the staged value", async () => {
    const snapshot = createSnapshot();
    const { service: sessionService } = createSessionService([snapshot]);
    const paramsHarness = createParamsService(null);
    const sessionStore = createSessionStore(sessionService);
    const paramStore = createParamsStore(sessionStore, paramsHarness.service);

    await sessionStore.initialize();
    await paramStore.initialize();
    await waitForMetadata(paramStore);

    const item = get(createParameterWorkspaceViewStore(paramStore)).sections[0]?.items.find(
      (entry) => entry.name === "ARMING_CHECK",
    );
    expect(item).toBeDefined();
    paramStore.stageParameterEdit(item!, 7);
    expect(get(paramStore).stagedEdits.ARMING_CHECK?.nextValue).toBe(7);

    paramsHarness.emitStore(snapshot.envelope, createParamStore({
      params: {
        ARMING_CHECK: { name: "ARMING_CHECK", value: 5, param_type: "uint8", index: 0 },
      },
      expected_count: 1,
    }));
    expect(get(paramStore).stagedEdits.ARMING_CHECK?.nextValue).toBe(7);

    paramsHarness.emitStore(snapshot.envelope, createParamStore({
      params: {
        ARMING_CHECK: { name: "ARMING_CHECK", value: 7, param_type: "uint8", index: 0 },
      },
      expected_count: 1,
    }));
    expect(get(paramStore).stagedEdits.ARMING_CHECK).toBeUndefined();
  });

  it("clears successful writes, retains failed rows, and records inline failure detail", async () => {
    const snapshot = createSnapshot();
    const { service: sessionService } = createSessionService([snapshot]);
    const paramsHarness = createParamsService(null, {
      writeBatch: vi.fn(async () => [
        { name: "ARMING_CHECK", requested_value: 3, confirmed_value: 3, success: true },
        { name: "FS_THR_ENABLE", requested_value: 4, confirmed_value: 2, success: false },
      ]),
    });
    const sessionStore = createSessionStore(sessionService);
    const paramStore = createParamsStore(sessionStore, paramsHarness.service);

    await sessionStore.initialize();
    await paramStore.initialize();
    await waitForMetadata(paramStore);

    const items = get(createParameterWorkspaceViewStore(paramStore)).sections[0]?.items ?? [];
    paramStore.stageParameterEdit(items.find((entry) => entry.name === "ARMING_CHECK")!, 3);
    paramStore.stageParameterEdit(items.find((entry) => entry.name === "FS_THR_ENABLE")!, 4);

    await paramStore.applyStagedEdits();

    const state = get(paramStore);
    expect(state.stagedEdits.ARMING_CHECK).toBeUndefined();
    expect(state.stagedEdits.FS_THR_ENABLE?.nextValue).toBe(4);
    expect(state.retainedFailures.FS_THR_ENABLE?.message).toBe("Vehicle kept 2 instead of 4.");
    expect(state.paramStore?.params.ARMING_CHECK?.value).toBe(3);
    expect(state.paramStore?.params.FS_THR_ENABLE?.value).toBe(2);
    expect(state.applyPhase).toBe("partial-failure");
    expect(state.applyProgress).toEqual({ completed: 1, total: 2, activeName: null });
  });

  it("treats missing or unexpected batch rows as retained failures without discarding valid successes", async () => {
    const snapshot = createSnapshot();
    const { service: sessionService } = createSessionService([snapshot]);
    const paramsHarness = createParamsService(null, {
      writeBatch: vi.fn(async () => [
        { name: "ARMING_CHECK", requested_value: 3, confirmed_value: 3, success: true },
        { name: "UNKNOWN_PARAM", requested_value: 4, confirmed_value: 4, success: true },
      ]),
    });
    const sessionStore = createSessionStore(sessionService);
    const paramStore = createParamsStore(sessionStore, paramsHarness.service);

    await sessionStore.initialize();
    await paramStore.initialize();
    await waitForMetadata(paramStore);

    const items = get(createParameterWorkspaceViewStore(paramStore)).sections[0]?.items ?? [];
    paramStore.stageParameterEdit(items.find((entry) => entry.name === "ARMING_CHECK")!, 3);
    paramStore.stageParameterEdit(items.find((entry) => entry.name === "FS_THR_ENABLE")!, 4);

    await paramStore.applyStagedEdits();

    const state = get(paramStore);
    expect(state.stagedEdits.ARMING_CHECK).toBeUndefined();
    expect(state.stagedEdits.FS_THR_ENABLE?.nextValue).toBe(4);
    expect(state.retainedFailures.FS_THR_ENABLE?.message).toBe("The vehicle returned an unexpected batch result.");
    expect(state.applyPhase).toBe("partial-failure");
  });

  it("keeps pending writes staged when the batch request rejects", async () => {
    const snapshot = createSnapshot();
    const { service: sessionService } = createSessionService([snapshot]);
    const paramsHarness = createParamsService(null, {
      writeBatch: vi.fn(async () => {
        throw new Error("mock batch rejected");
      }),
    });
    const sessionStore = createSessionStore(sessionService);
    const paramStore = createParamsStore(sessionStore, paramsHarness.service);

    await sessionStore.initialize();
    await paramStore.initialize();
    await waitForMetadata(paramStore);

    const item = get(createParameterWorkspaceViewStore(paramStore)).sections[0]?.items.find(
      (entry) => entry.name === "ARMING_CHECK",
    );
    paramStore.stageParameterEdit(item!, 3);

    await paramStore.applyStagedEdits();

    const state = get(paramStore);
    expect(state.stagedEdits.ARMING_CHECK?.nextValue).toBe(3);
    expect(state.retainedFailures.ARMING_CHECK?.message).toBe("mock batch rejected");
    expect(state.applyPhase).toBe("failed");
  });

  it("clears staged work and ignores stale apply results after a scope reset", async () => {
    const pendingBatch = deferred<ParamWriteResult[]>();
    const firstSnapshot = createSnapshot({
      envelope: createEnvelope("session-1"),
    });
    const secondSnapshot = createSnapshot({
      envelope: createEnvelope("session-2", { reset_revision: 1 }),
      param_store: createParamStore({
        params: {
          ARMING_CHECK: { name: "ARMING_CHECK", value: 6, param_type: "uint8", index: 0 },
        },
        expected_count: 1,
      }),
    });
    const { service: sessionService } = createSessionService([firstSnapshot, secondSnapshot]);
    const paramsHarness = createParamsService(null, {
      writeBatch: vi.fn(() => pendingBatch.promise),
    });
    const sessionStore = createSessionStore(sessionService);
    const paramStore = createParamsStore(sessionStore, paramsHarness.service);

    await sessionStore.initialize();
    await paramStore.initialize();
    await waitForMetadata(paramStore);

    const item = get(createParameterWorkspaceViewStore(paramStore)).sections[0]?.items.find(
      (entry) => entry.name === "ARMING_CHECK",
    );
    paramStore.stageParameterEdit(item!, 3);

    const applyPromise = paramStore.applyStagedEdits();
    await flush();
    await sessionStore.bootstrapSource("live");
    await flush();

    let state = get(paramStore);
    expect(state.activeEnvelope?.session_id).toBe("session-2");
    expect(state.stagedEdits.ARMING_CHECK).toBeUndefined();
    expect(state.scopeClearWarning).toContain("Staged edits were cleared");

    pendingBatch.resolve([{ name: "ARMING_CHECK", requested_value: 3, confirmed_value: 3, success: true }]);
    await applyPromise;
    await flush();

    state = get(paramStore);
    expect(state.activeEnvelope?.session_id).toBe("session-2");
    expect(state.paramStore?.params.ARMING_CHECK?.value).toBe(6);
    expect(state.retainedFailures.ARMING_CHECK).toBeUndefined();
  });

  it("clears staged edits and warns when switching from live to playback scope", async () => {
    const liveSnapshot = createSnapshot({
      envelope: createEnvelope("session-1", { source_kind: "live" }),
    });
    const playbackSnapshot = createSnapshot({
      envelope: createEnvelope("session-1", { source_kind: "playback", seek_epoch: 1, reset_revision: 1 }),
      session: {
        available: true,
        complete: true,
        provenance: "playback",
        value: {
          status: "active",
          connection: { kind: "disconnected" },
          vehicle_state: null,
          home_position: null,
        },
      },
      param_store: null,
      param_progress: null,
    });
    const { service: sessionService } = createSessionService([liveSnapshot, playbackSnapshot]);
    const paramsHarness = createParamsService(null);
    const sessionStore = createSessionStore(sessionService);
    const paramStore = createParamsStore(sessionStore, paramsHarness.service);

    await sessionStore.initialize();
    await paramStore.initialize();
    await waitForMetadata(paramStore);

    const item = get(createParameterWorkspaceViewStore(paramStore)).sections[0]?.items.find(
      (entry) => entry.name === "ARMING_CHECK",
    );
    paramStore.stageParameterEdit(item!, 5);

    await sessionStore.bootstrapSource("playback");
    await flush();

    const state = get(paramStore);
    expect(state.activeEnvelope?.source_kind).toBe("playback");
    expect(state.stagedEdits.ARMING_CHECK).toBeUndefined();
    expect(state.scopeClearWarning).toContain("active session");
  });
});
