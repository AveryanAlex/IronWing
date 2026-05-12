// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { queryFlightPathMock } = vi.hoisted(() => ({
  queryFlightPathMock: vi.fn(),
}));

vi.mock("svelte-sonner", () => ({
  Toaster: () => null,
}));

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

vi.mock("../../logs", async (importActual) => ({
  ...(await importActual<typeof import("../../logs")>()),
  queryFlightPath: queryFlightPathMock,
}));

vi.mock("../../components/logs/LogsWorkspace.svelte", async () => await import("../../test/mocks/LogsWorkspaceHandoffMock.svelte"));

vi.mock("../../components/mission/MissionWorkspace.svelte", async () => await import("../../test/mocks/MissionWorkspaceReplayOverlayMock.svelte"));

import AppShellContent from "./AppShellContent.svelte";
import { appShellTestIds } from "./chrome-state";
import { createParamsStore } from "../../lib/stores/params";
import { markRuntimeReady, resetRuntimeState } from "../../lib/stores/runtime";
import { createSessionStore } from "../../lib/stores/session";
import { withShellContexts } from "../../test/context-harnesses";
import type { OpenSessionSnapshot } from "../../session";
import type { ParamsService, ParamsServiceEventHandlers } from "../../lib/platform/params";
import type { SessionConnectionFormState, SessionService, SessionServiceEventHandlers } from "../../lib/platform/session";

function createSnapshot(): OpenSessionSnapshot {
  return {
    envelope: {
      session_id: "session-1",
      source_kind: "live",
      seek_epoch: 0,
      reset_revision: 0,
    },
    session: { available: true, complete: true, provenance: "bootstrap", value: { status: "pending", connection: { kind: "disconnected" }, vehicle_state: { armed: false, custom_mode: 0, mode_name: "Stabilize", system_status: "standby", vehicle_type: "quadrotor", autopilot: "ardu_pilot_mega", system_id: 1, component_id: 1, heartbeat_received: true }, home_position: null } },
    telemetry: { available: false, complete: false, provenance: "bootstrap", value: null },
    mission_state: null,
    param_store: null,
    param_progress: null,
    support: { available: false, complete: false, provenance: "bootstrap", value: null },
    sensor_health: { available: false, complete: false, provenance: "bootstrap", value: null },
    configuration_facts: { available: false, complete: false, provenance: "bootstrap", value: null },
    calibration: { available: false, complete: false, provenance: "bootstrap", value: null },
    guided: { available: false, complete: false, provenance: "bootstrap", value: null },
    status_text: { available: true, complete: true, provenance: "bootstrap", value: { entries: [] } },
    playback: { cursor_usec: null },
  };
}

function createSessionService(): SessionService {
  let handlers: SessionServiceEventHandlers | null = null;
  const connectionForm: SessionConnectionFormState = { mode: "udp", udpBind: "0.0.0.0:14550", tcpAddress: "127.0.0.1:5760", serialPort: "", baud: 57600, selectedBtDevice: "", takeoffAlt: "10", followVehicle: true };

  return {
    loadConnectionForm: vi.fn(() => ({ ...connectionForm })),
    persistConnectionForm: vi.fn(),
    openSessionSnapshot: vi.fn(async () => createSnapshot()),
    ackSessionSnapshot: vi.fn(async () => ({ result: "accepted" as const })),
    subscribeAll: vi.fn(async (nextHandlers: SessionServiceEventHandlers) => {
      handlers = nextHandlers;
      return () => {
        handlers = null;
      };
    }),
    availableTransportDescriptors: vi.fn(async () => []),
    describeTransportAvailability: vi.fn(() => "available"),
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
  } satisfies SessionService;
}

function createParamsService(): ParamsService {
  let handlers: ParamsServiceEventHandlers | null = null;

  return {
    subscribeAll: vi.fn(async (nextHandlers: ParamsServiceEventHandlers) => {
      handlers = nextHandlers;
      return () => {
        handlers = null;
      };
    }),
    fetchMetadata: vi.fn(async () => null),
    downloadAll: vi.fn(async () => undefined),
    writeBatch: vi.fn(async () => []),
    parseFile: vi.fn(async () => ({})),
    formatFile: vi.fn(async () => ""),
    formatError: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
  } satisfies ParamsService;
}

afterEach(() => {
  cleanup();
  resetRuntimeState();
});

describe("AppShellContent log replay handoff", () => {
  beforeEach(() => {
    queryFlightPathMock.mockReset();
  });

  it("queries the flight path, switches to mission, and forwards replay overlay state", async () => {
    queryFlightPathMock.mockResolvedValue([
      { timestamp_usec: 100, lat: 47.397742, lon: 8.545594, alt: 488, heading: 90 },
      { timestamp_usec: 200, lat: 47.398142, lon: 8.546094, alt: 490, heading: 92 },
    ]);

    const sessionStore = createSessionStore(createSessionService());
    const paramsStore = createParamsStore(sessionStore, createParamsService());
    await sessionStore.initialize();
    await paramsStore.initialize();
    markRuntimeReady("2026-04-03T12:34:56.000Z");

    render(withShellContexts(sessionStore, paramsStore, AppShellContent));

    await fireEvent.click(screen.getByRole("button", { name: "Logs" }));
    await fireEvent.click(screen.getByTestId("mock-logs-path-handoff"));

    await waitFor(() => {
      expect(queryFlightPathMock).toHaveBeenCalledWith({
        entry_id: "entry-1",
        start_usec: 100,
        end_usec: 200,
        max_points: 2000,
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId(appShellTestIds.activeWorkspace).textContent?.trim()).toBe("mission");
      expect(screen.getByTestId("mock-mission-overlay-phase").textContent).toBe("ready");
      expect(screen.getByTestId("mock-mission-overlay-path-count").textContent).toBe("2");
    });
  });
});
