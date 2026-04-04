// @vitest-environment jsdom

import { get } from "svelte/store";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSessionLifecycleView, type SessionConnectionFormState, type SessionService, type SessionServiceEventHandlers } from "../platform/session";
import { createSessionStore } from "./session";
import { selectTelemetryView } from "../telemetry-selectors";
import type { OpenSessionSnapshot } from "../../session";
import type { TransportDescriptor } from "../../transport";

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

function createSnapshot(overrides: Partial<OpenSessionSnapshot> = {}): OpenSessionSnapshot {
  return {
    envelope: {
      session_id: "session-1",
      source_kind: "live",
      seek_epoch: 0,
      reset_revision: 0,
    },
    session: {
      available: true,
      complete: true,
      provenance: "bootstrap",
      value: {
        status: "active",
        connection: { kind: "disconnected" },
        vehicle_state: {
          armed: false,
          custom_mode: 0,
          mode_name: "Stabilize",
          system_status: "standby",
          vehicle_type: "quad",
          autopilot: "ardu_pilot_mega",
          system_id: 1,
          component_id: 1,
          heartbeat_received: true,
        },
        home_position: {
          latitude_deg: 47.1,
          longitude_deg: 8.5,
          altitude_m: 500,
        },
      },
    },
    telemetry: {
      available: true,
      complete: true,
      provenance: "bootstrap",
      value: {
        flight: { altitude_m: 10, speed_mps: 4 },
        navigation: { latitude_deg: 47.1, longitude_deg: 8.5, heading_deg: 90 },
        gps: { fix_type: "fix_3d" },
      },
    },
    mission_state: { plan: null, current_index: 2, sync: "current", active_op: null },
    param_store: {
      params: {
        CRUISE_SPEED: {
          name: "CRUISE_SPEED",
          value: 12,
          param_type: "real32",
          index: 0,
        },
      },
      expected_count: 1,
    },
    param_progress: "completed",
    support: {
      available: true,
      complete: true,
      provenance: "bootstrap",
      value: {
        can_request_prearm_checks: true,
        can_calibrate_accel: true,
        can_calibrate_compass: true,
        can_calibrate_radio: false,
      },
    },
    sensor_health: {
      available: true,
      complete: true,
      provenance: "bootstrap",
      value: {
        gyro: "healthy",
        accel: "healthy",
        mag: "healthy",
        baro: "healthy",
        gps: "healthy",
        airspeed: "not_present",
        rc_receiver: "healthy",
        battery: "healthy",
        terrain: "not_present",
        geofence: "not_present",
      },
    },
    configuration_facts: {
      available: true,
      complete: false,
      provenance: "bootstrap",
      value: { frame: null, gps: null, battery_monitor: null, motors_esc: null },
    },
    calibration: {
      available: true,
      complete: false,
      provenance: "bootstrap",
      value: { accel: null, compass: null, radio: null },
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
    {
      kind: "tcp",
      label: "TCP",
      available: true,
      validation: { address_required: true },
    },
  ];
}

function createMockService(overrides: Partial<SessionService> = {}) {
  let handlers: SessionServiceEventHandlers | null = null;
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
    openSessionSnapshot: vi.fn(async () => createSnapshot()),
    ackSessionSnapshot: vi.fn(async () => ({ result: "accepted" as const })),
    subscribeAll: vi.fn(async (nextHandlers: SessionServiceEventHandlers) => {
      handlers = nextHandlers;
      return () => {
        handlers = null;
      };
    }),
    availableTransportDescriptors: vi.fn(async () => createTransportDescriptors()),
    describeTransportAvailability: vi.fn((descriptor: TransportDescriptor) =>
      descriptor.available ? `${descriptor.label} available` : `${descriptor.label} unavailable`,
    ),
    validateTransportDescriptor: vi.fn((descriptor: TransportDescriptor, value) => {
      if (descriptor.kind === "tcp" && !value.address) {
        return ["address is required"];
      }
      if (descriptor.kind === "udp" && !value.bind_addr) {
        return ["bind_addr is required"];
      }
      return [];
    }),
    buildConnectRequest: vi.fn((descriptor: TransportDescriptor, value) => ({
      transport:
        descriptor.kind === "udp"
          ? { kind: "udp" as const, bind_addr: value.bind_addr ?? "" }
          : { kind: "tcp" as const, address: value.address ?? "" },
    })),
    connectSession: vi.fn(async () => undefined),
    disconnectSession: vi.fn(async () => undefined),
    listSerialPorts: vi.fn(async () => ["/dev/ttyUSB0"]),
    btRequestPermissions: vi.fn(async () => undefined),
    btScanBle: vi.fn(async () => []),
    btGetBondedDevices: vi.fn(async () => []),
    getAvailableModes: vi.fn(async () => []),
    formatError: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
    ...overrides,
  } satisfies SessionService;

  return {
    service,
    emit(event: keyof SessionServiceEventHandlers, payload: Parameters<SessionServiceEventHandlers[typeof event]>[0]) {
      if (!handlers) {
        throw new Error("session handlers are not registered");
      }

      handlers[event](payload as never);
    },
  };
}

describe("session store", () => {
  beforeEach(() => {
    if (typeof localStorage.clear === "function") {
      localStorage.clear();
    }
  });

  it("hydrates from a live bootstrap snapshot and exposes bootstrap inspectability", async () => {
    const { service } = createMockService();
    const store = createSessionStore(service);

    await store.initialize();

    const state = get(store);
    const lifecycle = createSessionLifecycleView(state.activeEnvelope, state.sessionDomain, state.optimisticConnection);
    const telemetry = selectTelemetryView(state.telemetryDomain);

    expect(state.hydrated).toBe(true);
    expect(state.lastPhase).toBe("ready");
    expect(state.activeSource).toBe("live");
    expect(state.bootstrap.missionState?.current_index).toBe(2);
    expect(state.bootstrap.paramStore?.params.CRUISE_SPEED?.value).toBe(12);
    expect(state.bootstrap.paramProgress).toBe("completed");
    expect(telemetry.altitude_m).toBe(10);
    expect(lifecycle.linkState).toBe("disconnected");
    expect(lifecycle.session?.home_position?.latitude_deg).toBe(47.1);
    expect(state.transportDescriptors).toHaveLength(2);

    store.updateConnectionForm({ mode: "tcp", tcpAddress: "127.0.0.1:5770" });

    expect(service.persistConnectionForm).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "tcp", tcpAddress: "127.0.0.1:5770" }),
    );
  });

  it("preserves buffered same-envelope stream updates while snapshot ack is pending", async () => {
    const ack = deferred<{ result: "accepted" }>();
    const ackRequested = deferred<void>();
    const { service, emit } = createMockService({
      ackSessionSnapshot: vi.fn(() => {
        ackRequested.resolve();
        return ack.promise;
      }),
    });
    const store = createSessionStore(service);

    const initializePromise = store.initialize();
    await ackRequested.promise;

    emit("onTelemetry", {
      envelope: { session_id: "session-1", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
      value: {
        available: true,
        complete: true,
        provenance: "stream",
        value: {
          flight: { altitude_m: 50 },
          navigation: { latitude_deg: 47.2, longitude_deg: 8.6, heading_deg: 91 },
          gps: { fix_type: "rtk_fixed" },
        },
      },
    });

    emit("onSession", {
      envelope: { session_id: "session-1", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
      value: {
        available: true,
        complete: true,
        provenance: "stream",
        value: {
          status: "active",
          connection: { kind: "connected" },
          vehicle_state: createSnapshot().session.value?.vehicle_state ?? null,
          home_position: createSnapshot().session.value?.home_position ?? null,
        },
      },
    });

    ack.resolve({ result: "accepted" });
    await initializePromise;

    const state = get(store);
    const lifecycle = createSessionLifecycleView(state.activeEnvelope, state.sessionDomain, state.optimisticConnection);
    const telemetry = selectTelemetryView(state.telemetryDomain);

    expect(telemetry.altitude_m).toBe(50);
    expect(telemetry.gps_fix_type).toBe("rtk_fixed");
    expect(lifecycle.linkState).toBe("connected");
  });

  it("does not let a stale bootstrap snapshot rewrite the active scoped state", async () => {
    const staleAck = deferred<{ result: "accepted" }>();
    const staleAckRequested = deferred<void>();
    const snapshots = [
      createSnapshot({
        envelope: { session_id: "session-1", source_kind: "live", seek_epoch: 0, reset_revision: 2 },
        telemetry: {
          available: true,
          complete: true,
          provenance: "bootstrap",
          value: {
            flight: { altitude_m: 42 },
            navigation: { latitude_deg: 47.1, longitude_deg: 8.5, heading_deg: 90 },
            gps: { fix_type: "fix_3d" },
          },
        },
      }),
      createSnapshot({
        envelope: { session_id: "session-1", source_kind: "live", seek_epoch: 0, reset_revision: 1 },
        telemetry: {
          available: true,
          complete: true,
          provenance: "bootstrap",
          value: {
            flight: { altitude_m: 5 },
            navigation: { latitude_deg: 47.1, longitude_deg: 8.5, heading_deg: 90 },
            gps: { fix_type: "fix_3d" },
          },
        },
      }),
    ];
    let ackCalls = 0;
    const { service, emit } = createMockService({
      openSessionSnapshot: vi.fn(async () => snapshots.shift() ?? createSnapshot()),
      ackSessionSnapshot: vi.fn(async () => {
        ackCalls += 1;
        if (ackCalls === 2) {
          staleAckRequested.resolve();
          return staleAck.promise;
        }

        return { result: "accepted" as const };
      }),
    });
    const store = createSessionStore(service);

    await store.initialize();
    const staleBootstrap = store.bootstrapSource("live");
    await staleAckRequested.promise;

    emit("onTelemetry", {
      envelope: { session_id: "session-1", source_kind: "live", seek_epoch: 0, reset_revision: 1 },
      value: {
        available: true,
        complete: true,
        provenance: "stream",
        value: {
          flight: { altitude_m: 99 },
          navigation: { latitude_deg: 47.1, longitude_deg: 8.5, heading_deg: 90 },
          gps: { fix_type: "rtk_fixed" },
        },
      },
    });

    staleAck.resolve({ result: "accepted" });
    await staleBootstrap;

    const state = get(store);
    const telemetry = selectTelemetryView(state.telemetryDomain);
    expect(state.activeEnvelope?.reset_revision).toBe(2);
    expect(state.activeSource).toBe("live");
    expect(telemetry.altitude_m).toBe(42);
    expect(telemetry.gps_fix_type).toBe("fix_3d");
  });

  it("ignores stale events from previous session scopes", async () => {
    const { service, emit } = createMockService({
      openSessionSnapshot: vi.fn(async () =>
        createSnapshot({
          envelope: {
            session_id: "session-2",
            source_kind: "live",
            seek_epoch: 1,
            reset_revision: 3,
          },
          telemetry: {
            available: true,
            complete: true,
            provenance: "bootstrap",
            value: { flight: { altitude_m: 12 }, navigation: {}, gps: {} },
          },
        }),
      ),
    });
    const store = createSessionStore(service);

    await store.initialize();

    emit("onTelemetry", {
      envelope: { session_id: "session-1", source_kind: "live", seek_epoch: 1, reset_revision: 3 },
      value: {
        available: true,
        complete: true,
        provenance: "stream",
        value: { flight: { altitude_m: 99 }, navigation: {}, gps: {} },
      },
    });
    emit("onTelemetry", {
      envelope: { session_id: "session-2", source_kind: "live", seek_epoch: 1, reset_revision: 2 },
      value: {
        available: true,
        complete: true,
        provenance: "stream",
        value: { flight: { altitude_m: 100 }, navigation: {}, gps: {} },
      },
    });

    const telemetry = selectTelemetryView(get(store).telemetryDomain);
    expect(telemetry.altitude_m).toBe(12);
  });

  it("surfaces connect validation failures through phase and lastError without invoking transport IPC", async () => {
    const { service } = createMockService();
    const store = createSessionStore(service);

    await store.initialize();
    store.updateConnectionForm({ mode: "tcp", tcpAddress: "" });

    await store.connect();

    const state = get(store);
    expect(state.lastPhase).toBe("ready");
    expect(state.lastError).toBe("address is required");
    expect(state.optimisticConnection).toBeNull();
    expect(state.activeSource).toBe("live");
    expect(service.connectSession).not.toHaveBeenCalled();
  });

  it("ignores late available-modes responses after disconnect", async () => {
    const modesRequest = deferred<Array<{ custom_mode: number; name: string }>>();
    const { service, emit } = createMockService({
      getAvailableModes: vi.fn(() => modesRequest.promise),
    });
    const store = createSessionStore(service);

    await store.initialize();

    emit("onSession", {
      envelope: { session_id: "session-1", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
      value: {
        available: true,
        complete: true,
        provenance: "stream",
        value: {
          status: "active",
          connection: { kind: "connected" },
          vehicle_state: createSnapshot().session.value?.vehicle_state ?? null,
          home_position: createSnapshot().session.value?.home_position ?? null,
        },
      },
    });

    emit("onSession", {
      envelope: { session_id: "session-1", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
      value: {
        available: true,
        complete: true,
        provenance: "stream",
        value: {
          status: "active",
          connection: { kind: "disconnected" },
          vehicle_state: createSnapshot().session.value?.vehicle_state ?? null,
          home_position: createSnapshot().session.value?.home_position ?? null,
        },
      },
    });

    modesRequest.resolve([{ custom_mode: 4, name: "GUIDED" }]);
    await Promise.resolve();

    expect(get(store).availableModes).toEqual([]);
  });

  it("falls back to an available transport mode and persists it when refresh removes the current mode", async () => {
    const { service } = createMockService({
      loadConnectionForm: vi.fn((): SessionConnectionFormState => ({
        mode: "tcp",
        udpBind: "0.0.0.0:14550",
        tcpAddress: "127.0.0.1:5760",
        serialPort: "",
        baud: 57600,
        selectedBtDevice: "",
        takeoffAlt: "10",
        followVehicle: true,
      })),
      availableTransportDescriptors: vi
        .fn()
        .mockResolvedValueOnce(createTransportDescriptors())
        .mockResolvedValueOnce([createTransportDescriptors()[0]!]),
    });
    const store = createSessionStore(service);

    await store.initialize();
    vi.mocked(service.persistConnectionForm).mockClear();

    await store.refreshTransportDescriptors();

    const state = get(store);
    expect(state.connectionForm.mode).toBe("udp");
    expect(service.persistConnectionForm).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "udp" }),
    );
  });

  it("auto-selects serial and bluetooth choices only when those fields are empty", async () => {
    const { service } = createMockService({
      listSerialPorts: vi
        .fn()
        .mockResolvedValueOnce(["/dev/ttyUSB0", "/dev/ttyUSB1"])
        .mockResolvedValueOnce(["/dev/ttyUSB0", "/dev/ttyUSB1"]),
      btGetBondedDevices: vi
        .fn()
        .mockResolvedValueOnce([{ name: "FC-A", address: "AA:BB", device_type: "classic" as const }])
        .mockResolvedValueOnce([{ name: "FC-B", address: "CC:DD", device_type: "classic" as const }]),
    });
    const store = createSessionStore(service);

    await store.initialize();

    await store.refreshSerialPorts();
    let state = get(store);
    expect(state.connectionForm.serialPort).toBe("/dev/ttyUSB0");

    store.updateConnectionForm({ serialPort: "/dev/ttyUSB1" });
    vi.mocked(service.persistConnectionForm).mockClear();
    await store.refreshSerialPorts();
    state = get(store);
    expect(state.connectionForm.serialPort).toBe("/dev/ttyUSB1");
    expect(service.persistConnectionForm).not.toHaveBeenCalled();

    store.updateConnectionForm({ selectedBtDevice: "" });
    await store.refreshBondedDevices();
    state = get(store);
    expect(state.connectionForm.selectedBtDevice).toBe("AA:BB");

    store.updateConnectionForm({ selectedBtDevice: "CC:DD" });
    vi.mocked(service.persistConnectionForm).mockClear();
    await store.refreshBondedDevices();
    state = get(store);
    expect(state.connectionForm.selectedBtDevice).toBe("CC:DD");
    expect(service.persistConnectionForm).not.toHaveBeenCalled();
  });
});
