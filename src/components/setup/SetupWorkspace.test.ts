// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ParamMetadataMap } from "../../param-metadata";
import type { ParamStore } from "../../params";
import type { ParamsService, ParamsServiceEventHandlers } from "../../lib/platform/params";
import type {
  SessionConnectionFormState,
  SessionService,
  SessionServiceEventHandlers,
} from "../../lib/platform/session";
import type { OpenSessionSnapshot } from "../../session";
import type { TransportDescriptor } from "../../transport";
import { createParamsStore } from "../../lib/stores/params";
import { createSessionStore } from "../../lib/stores/session";
import { withShellContexts } from "../../test/context-harnesses";
import { parameterWorkspaceTestIds } from "../params/parameter-workspace-test-ids";
import SetupWorkspace from "./SetupWorkspace.svelte";
import { setupWorkspaceTestIds } from "./setup-workspace-test-ids";

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
        status: "pending",
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
    param_store: {
      expected_count: 2,
      params: {
        ARMING_CHECK: { name: "ARMING_CHECK", value: 1, param_type: "uint8", index: 0 },
        FS_THR_ENABLE: { name: "FS_THR_ENABLE", value: 1, param_type: "uint8", index: 1 },
      },
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
        can_calibrate_radio: true,
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
      value: {
        frame: null,
        gps: { configured: true },
        battery_monitor: null,
        motors_esc: null,
      },
    },
    calibration: {
      available: true,
      complete: false,
      provenance: "bootstrap",
      value: {
        accel: { lifecycle: "not_started", progress: null, report: null },
        compass: null,
        radio: null,
      },
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
      value: {
        entries: [
          {
            sequence: 1,
            text: "Compass not calibrated",
            severity: "warning",
          },
        ],
      },
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
    subscribeAll: vi.fn(async (_nextHandlers: SessionServiceEventHandlers) => {
      return () => {};
    }),
    availableTransportDescriptors: vi.fn(async () => createTransportDescriptors()),
    describeTransportAvailability: vi.fn((descriptor: TransportDescriptor) =>
      descriptor.available ? `${descriptor.label} available` : `${descriptor.label} unavailable`,
    ),
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

  return { service };
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
    downloadAll: vi.fn(async () => undefined),
    writeBatch: vi.fn(async (params: [string, number][]) => params.map(([name, value]) => ({
      name,
      requested_value: value,
      confirmed_value: value,
      success: true,
    }))),
    parseFile: vi.fn(async () => ({})),
    formatFile: vi.fn(async (_store: ParamStore) => ""),
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

async function renderSetupWorkspace(options: {
  snapshot?: OpenSessionSnapshot;
  metadata?: ParamMetadataMap | null;
} = {}) {
  const { service } = createMockService({
    openSessionSnapshot: vi.fn(async () => options.snapshot ?? createSnapshot()),
  });
  const paramsHarness = createMockParamsService(options.metadata ?? null);
  const sessionStore = createSessionStore(service);
  const parameterStore = createParamsStore(sessionStore, paramsHarness.service);
  await sessionStore.initialize();
  await parameterStore.initialize();

  render(withShellContexts(sessionStore, parameterStore, SetupWorkspace));

  await waitFor(() => {
    expect(screen.getByTestId(setupWorkspaceTestIds.root)).toBeTruthy();
  });
}

describe("SetupWorkspace", () => {
  beforeEach(() => {
    if (typeof localStorage.clear === "function") {
      localStorage.clear();
    }
  });

  afterEach(() => {
    cleanup();
  });

  it("shows unknown and unconfirmed guided-section truth when facts are partial", async () => {
    await renderSetupWorkspace({
      metadata: new Map([
        [
          "ARMING_CHECK",
          {
            humanName: "Arming checks",
            description: "Controls pre-arm validation.",
          },
        ],
      ]),
    });

    expect(screen.getByTestId(setupWorkspaceTestIds.state).textContent?.trim()).toBe("Setup ready");
    expect(screen.getByTestId(`${setupWorkspaceTestIds.sectionStatusPrefix}-frame_orientation`).textContent?.trim()).toBe("Unknown");
    expect(screen.getByTestId(`${setupWorkspaceTestIds.sectionConfidencePrefix}-frame_orientation`).textContent?.trim()).toBe("Unconfirmed");
    expect(screen.getByTestId(setupWorkspaceTestIds.notices).textContent).toContain("Compass not calibrated");
  });

  it("keeps full parameters as the explicit recovery surface when metadata is unavailable", async () => {
    await renderSetupWorkspace();

    expect(screen.getByTestId(setupWorkspaceTestIds.notice).textContent).toContain(
      "Full Parameters is the recovery path",
    );
    expect(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-frame_orientation`).getAttribute("disabled")).not.toBeNull();

    await fireEvent.click(screen.getByTestId(`${setupWorkspaceTestIds.navPrefix}-full_parameters`));

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.selectedSection).textContent?.trim()).toBe("full_parameters");
      expect(screen.getByTestId(parameterWorkspaceTestIds.root)).toBeTruthy();
    });
  });
});
