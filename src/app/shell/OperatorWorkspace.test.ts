// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// maplibre-gl requires WebGL which is unavailable in jsdom. Stub the entire
// module so OverviewMap (mounted inside OperatorWorkspace) does not crash.
vi.mock("maplibre-gl", () => {
  const mockMap = {
    addControl: vi.fn(),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    getSource: vi.fn(() => null),
    removeLayer: vi.fn(),
    removeSource: vi.fn(),
    setCenter: vi.fn(),
    on: vi.fn(),
    remove: vi.fn(),
  };
  const markerElement = document.createElement("div");
  const mockMarker = {
    setLngLat: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
    setRotation: vi.fn().mockReturnThis(),
    remove: vi.fn(),
    getElement: vi.fn(() => markerElement),
  };
  // Regular functions (not arrow functions) are required for `new` to work.
  function MockMap() { return mockMap; }
  function MockMarker() { return mockMarker; }
  function MockNavigationControl() { return {}; }
  return {
    default: {
      Map: MockMap,
      NavigationControl: MockNavigationControl,
      Marker: MockMarker,
    },
  };
});

import OperatorWorkspace from "./OperatorWorkspace.svelte";
import { appShellTestIds } from "./chrome-state";
import { createParamsStore } from "../../lib/stores/params";
import { missingDomainValue } from "../../lib/domain-status";
import { resetRuntimeState } from "../../lib/stores/runtime";
import {
  createSessionStore,
  type SessionStore,
} from "../../lib/stores/session";
import type { ParamsService, ParamsServiceEventHandlers } from "../../lib/platform/params";
import type {
  SessionConnectionFormState,
  SessionService,
  SessionServiceEventHandlers,
} from "../../lib/platform/session";
import type { OpenSessionSnapshot } from "../../session";
import type { ParamMetadataMap } from "../../param-metadata";
import { withShellContexts } from "../../test/context-harnesses";
import type { TransportDescriptor } from "../../transport";

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
      provenance: "stream",
      value: {
        status: "active",
        connection: { kind: "connected" },
        vehicle_state: {
          armed: false,
          custom_mode: 5,
          mode_name: "LOITER",
          system_status: "ACTIVE",
          vehicle_type: "quadrotor",
          autopilot: "ardupilot",
          system_id: 1,
          component_id: 1,
          heartbeat_received: true,
        },
        home_position: null,
      },
    },
    telemetry: {
      available: true,
      complete: true,
      provenance: "stream",
      value: {
        flight: { altitude_m: 123, speed_mps: 12.3, climb_rate_mps: 1.8 },
        navigation: { heading_deg: 186 },
        power: { battery_pct: 18, battery_voltage_v: 22.7 },
        gps: { fix_type: "fix_2d", satellites: 8 },
      },
    },
    mission_state: null,
    param_store: null,
    param_progress: null,
    support: {
      available: true,
      complete: true,
      provenance: "stream",
      value: {
        can_request_prearm_checks: true,
        can_calibrate_accel: true,
        can_calibrate_compass: true,
        can_calibrate_radio: false,
      },
    },
    sensor_health: missingDomainValue("stream"),
    configuration_facts: missingDomainValue("stream"),
    calibration: missingDomainValue("stream"),
    guided: missingDomainValue("stream"),
    status_text: {
      available: true,
      complete: true,
      provenance: "stream",
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
    describeTransportAvailability: vi.fn((descriptor: TransportDescriptor) => descriptor.label),
    validateTransportDescriptor: vi.fn(() => []),
    buildConnectRequest: vi.fn((descriptor: TransportDescriptor, value) => ({
      transport:
        descriptor.kind === "udp"
          ? { kind: "udp" as const, bind_addr: value.bind_addr ?? "" }
          : { kind: "tcp" as const, address: value.address ?? "" },
    })),
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

function createMockParamsService(
  metadata: ParamMetadataMap | null = null,
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
    downloadAll: vi.fn(async () => {}),
    writeBatch: vi.fn(async (params: [string, number][]) => params.map(([name, value]) => ({
      name,
      requested_value: value,
      confirmed_value: value,
      success: true,
    }))),
    parseFile: vi.fn(async () => ({})),
    formatFile: vi.fn(async () => ""),
    formatError: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
    ...overrides,
  } satisfies ParamsService;

  return {
    service,
    hasHandlers() {
      return handlers !== null;
    },
  };
}

async function renderWorkspace(snapshot = createSnapshot()) {
  const sessionHarness = createMockService({
    openSessionSnapshot: vi.fn(async () => snapshot),
  });
  const paramsHarness = createMockParamsService();
  const store = createSessionStore(sessionHarness.service);
  const parameterStore = createParamsStore(store, paramsHarness.service);

  await store.initialize();
  await parameterStore.initialize();

  render(withShellContexts(store, parameterStore, OperatorWorkspace));

  await waitFor(() => {
    expect(screen.getByTestId(appShellTestIds.operatorWorkspace)).toBeTruthy();
  });

  return {
    store,
    sessionHarness,
  } satisfies {
    store: SessionStore;
    sessionHarness: ReturnType<typeof createMockService>;
  };
}

describe("OperatorWorkspace", () => {
  beforeEach(() => {
    resetRuntimeState();
    if (typeof localStorage.clear === "function") {
      localStorage.clear();
    }
  });

  afterEach(() => {
    cleanup();
    resetRuntimeState();
  });

  it("renders primary state, secondary metrics, and a compact keyed notice strip", async () => {
    await renderWorkspace(createSnapshot({
      status_text: {
        available: true,
        complete: true,
        provenance: "stream",
        value: {
          entries: [
            { sequence: 1, text: "Boot complete", severity: "info", timestamp_usec: 100 },
            { sequence: 2, text: "GPS weak", severity: "warning", timestamp_usec: 200 },
            { sequence: 3, text: "SD card present", severity: "notice", timestamp_usec: 300 },
            { sequence: 4, text: "Battery failsafe", severity: "critical", timestamp_usec: 400 },
            { sequence: 5, text: "Motor fault", severity: "emergency", timestamp_usec: 500 },
          ],
        },
      },
    }));

    expect(screen.getByTestId("telemetry-state-value").textContent).toContain("DISARMED");
    expect(screen.getByTestId("telemetry-alt-value").textContent).toContain("123.0 m");
    expect(screen.getByTestId("telemetry-battery-value").textContent).toContain("18.0%");
    expect(screen.getByTestId("telemetry-heading-value").textContent).toContain("186°");
    expect(screen.getByTestId("operator-workspace-readiness").textContent).toContain("Pre-arm checks available");
    expect(screen.getByTestId("operator-workspace-notice-count").textContent?.trim()).toBe("3 shown");
    expect(screen.getByText("GPS weak")).toBeTruthy();
    expect(screen.getByText("Battery failsafe")).toBeTruthy();
    expect(screen.getByText("Motor fault")).toBeTruthy();
    expect(screen.queryByText("Boot complete")).toBeNull();
    expect(screen.queryByText("SD card present")).toBeNull();
  });

  it("renders explicit degraded badges and per-card placeholders for partial bootstrap data", async () => {
    await renderWorkspace(createSnapshot({
      telemetry: {
        available: true,
        complete: false,
        provenance: "bootstrap",
        value: {
          flight: { altitude_m: 55 },
          gps: {},
        },
      },
      support: missingDomainValue("bootstrap"),
      status_text: missingDomainValue("bootstrap"),
    }));

    expect(screen.getByTestId("operator-workspace-degraded-telemetry")).toBeTruthy();
    expect(screen.getByTestId("operator-workspace-degraded-support")).toBeTruthy();
    expect(screen.getByTestId("operator-workspace-degraded-notices")).toBeTruthy();
    expect(screen.getByTestId("operator-workspace-readiness").textContent).toContain("Support unavailable");
    expect(screen.getByTestId("telemetry-alt-value").textContent).toContain("55.0 m");
    expect(screen.getByTestId("telemetry-speed-value").textContent).toContain("-- m/s");
    expect(screen.getAllByText("degraded").length).toBeGreaterThan(0);
    expect(screen.getByTestId("operator-workspace-notices-empty").textContent).toContain("No active notices");
  });

  it("keeps the last accepted metrics visible with a stale cue after disconnect", async () => {
    const { sessionHarness } = await renderWorkspace();

    sessionHarness.emit("onSession", {
      envelope: {
        session_id: "session-1",
        source_kind: "live",
        seek_epoch: 0,
        reset_revision: 0,
      },
      value: {
        available: true,
        complete: true,
        provenance: "stream",
        value: {
          status: "active",
          connection: { kind: "disconnected" },
          vehicle_state: {
            armed: false,
            custom_mode: 5,
            mode_name: "LOITER",
            system_status: "ACTIVE",
            vehicle_type: "quadrotor",
            autopilot: "ardupilot",
            system_id: 1,
            component_id: 1,
            heartbeat_received: true,
          },
          home_position: null,
        },
      },
    });
    sessionHarness.emit("onTelemetry", {
      envelope: {
        session_id: "session-1",
        source_kind: "live",
        seek_epoch: 0,
        reset_revision: 0,
      },
      value: missingDomainValue("stream") as never,
    });
    sessionHarness.emit("onSupport", {
      envelope: {
        session_id: "session-1",
        source_kind: "live",
        seek_epoch: 0,
        reset_revision: 0,
      },
      value: missingDomainValue("stream") as never,
    });

    await waitFor(() => {
      expect(screen.getByTestId("operator-workspace-stale")).toBeTruthy();
    });

    expect(screen.getByTestId("operator-workspace-disconnected")).toBeTruthy();
    expect(screen.getByTestId("telemetry-alt-value").textContent).toContain("123.0 m");
    expect(screen.getByTestId("telemetry-battery-value").textContent).toContain("18.0%");
    expect(screen.getByTestId("telemetry-state-value").textContent).toContain("--");
  });
});
