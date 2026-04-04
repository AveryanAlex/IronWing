// @vitest-environment jsdom

import { get } from "svelte/store";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ParamMetadataMap } from "../../param-metadata";
import type { ParamProgress, ParamStore } from "../../params";
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
    expect(state.lastNotice).toContain("Dropped stale parameter store event");
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
    expect(view.metadataText).toContain("metadata unavailable");
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
});
