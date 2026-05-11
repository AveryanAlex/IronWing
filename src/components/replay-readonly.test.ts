// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { writable } from "svelte/store";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ParamsStore, ParamsStoreState } from "../lib/stores/params";
import type { SessionStoreState } from "../lib/stores/session-state";
import { missingDomainValue } from "../lib/domain-status";
import { withParameterWorkspaceContext, withSessionContext } from "../test/context-harnesses";
import ParameterWorkspace from "./params/ParameterWorkspace.svelte";
import { parameterWorkspaceTestIds } from "./params/parameter-workspace-test-ids";
import FlightControlsPanel from "./flight/FlightControlsPanel.svelte";
import ArmSlider from "./flight/ArmSlider.svelte";
import { guidedTakeoff } from "../guided";
import { setFlightMode } from "../telemetry";

vi.mock("../telemetry", async () => {
  const actual = await vi.importActual<typeof import("../telemetry")>("../telemetry");
  return {
    ...actual,
    getAvailableModes: vi.fn(async () => [
      { custom_mode: 4, name: "GUIDED" },
      { custom_mode: 5, name: "LOITER" },
      { custom_mode: 6, name: "RTL" },
      { custom_mode: 9, name: "LAND" },
    ]),
    setFlightMode: vi.fn(async () => undefined),
    armVehicle: vi.fn(async () => undefined),
    disarmVehicle: vi.fn(async () => undefined),
  };
});

vi.mock("../guided", () => ({
  guidedTakeoff: vi.fn(async () => undefined),
}));

function createPlaybackParamsState(): ParamsStoreState {
  return {
    hydrated: true,
    phase: "ready",
    streamReady: true,
    streamError: null,
    sessionHydrated: true,
    sessionPhase: "ready",
    activeEnvelope: {
      session_id: "playback-1",
      source_kind: "playback",
      seek_epoch: 0,
      reset_revision: 0,
    },
    activeSource: "playback",
    liveSessionConnected: false,
    vehicleType: "quadrotor",
    paramStore: {
      expected_count: 1,
      params: {
        ARMING_CHECK: { name: "ARMING_CHECK", value: 1, param_type: "uint8", index: 0 },
      },
    },
    paramProgress: "completed",
    metadata: new Map(),
    metadataState: "ready",
    metadataError: null,
    stagedEdits: {},
    retainedFailures: {},
    applyPhase: "idle",
    applyError: null,
    applyProgress: null,
    scopeClearWarning: null,
    lastNotice: null,
  };
}

function createParamsHarness(state: ParamsStoreState): ParamsStore {
  const backing = writable(state);
  return {
    subscribe: backing.subscribe,
    initialize: async () => undefined,
    reset: () => undefined,
    stageParameterEdit: vi.fn(),
    discardStagedEdit: vi.fn(),
    clearStagedEdits: vi.fn(),
    applyStagedEdits: vi.fn(async () => undefined),
    downloadAll: vi.fn(async () => undefined),
  } as unknown as ParamsStore;
}

function createSessionState(activeSource: "live" | "playback"): SessionStoreState {
  const connected = activeSource === "live";
  return {
    hydrated: true,
    lastPhase: "ready",
    lastError: null,
    activeEnvelope: {
      session_id: `${activeSource}-session`,
      source_kind: activeSource,
      seek_epoch: 0,
      reset_revision: 0,
    },
    activeSource,
    sessionDomain: {
      available: true,
      complete: true,
      provenance: "bootstrap",
      value: {
        status: "active",
        connection: connected ? { kind: "connected" } : { kind: "disconnected" },
        vehicle_state: {
          armed: true,
          custom_mode: 4,
          mode_name: "GUIDED",
          system_status: "active",
          vehicle_type: "quadrotor",
          autopilot: "ardupilotmega",
          system_id: 1,
          component_id: 1,
          heartbeat_received: true,
        },
        home_position: null,
      },
    },
    telemetryDomain: missingDomainValue("bootstrap"),
    support: missingDomainValue("bootstrap"),
    sensorHealth: missingDomainValue("bootstrap"),
    configurationFacts: missingDomainValue("bootstrap"),
    calibration: missingDomainValue("bootstrap"),
    guided: missingDomainValue("bootstrap"),
    statusText: missingDomainValue("bootstrap"),
    bootstrap: {
      missionState: null,
      paramStore: null,
      paramProgress: null,
      playbackCursorUsec: null,
    },
    connectionForm: {
      mode: "udp",
      udpBind: "0.0.0.0:14550",
      tcpAddress: "127.0.0.1:5760",
      serialPort: "",
      baud: 57600,
      selectedBtDevice: "",
      takeoffAlt: "10",
      followVehicle: true,
    },
    transportDescriptors: [],
    serialPorts: [],
    availableModes: [],
    btDevices: [],
    btScanning: false,
    optimisticConnection: null,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("replay-readonly active command surfaces", () => {
  it("replay-readonly disables parameter staging surfaces with a visible banner", () => {
    render(withParameterWorkspaceContext(createParamsHarness(createPlaybackParamsState()), ParameterWorkspace));

    expect(screen.getByTestId("parameter-replay-readonly-banner").textContent).toContain("Replay is read-only");
    expect(screen.getByTestId(parameterWorkspaceTestIds.advancedButton)).toHaveProperty("disabled", true);
  });

  it("replay-readonly disables flight mode, guided takeoff, and arm controls with visible copy", async () => {
    const sessionStore = { subscribe: writable(createSessionState("playback")).subscribe } as any;

    render(withSessionContext(sessionStore, FlightControlsPanel));
    render(withSessionContext(sessionStore, ArmSlider));

    await waitFor(() => {
      expect(screen.getByTestId("flight-replay-readonly-banner")).toBeTruthy();
    });

    expect(screen.getByLabelText("Flight mode")).toHaveProperty("disabled", true);
    expect(screen.getByText("Takeoff")).toHaveProperty("disabled", true);
    expect(screen.getByText("Arm")).toHaveProperty("disabled", true);
    expect(screen.getByTestId("arm-replay-readonly-banner").textContent).toContain("Replay is read-only");
  });

  it("keeps live flight controls interactive and hides replay-only copy", async () => {
    const sessionStore = { subscribe: writable(createSessionState("live")).subscribe } as any;

    render(withSessionContext(sessionStore, FlightControlsPanel));
    render(withSessionContext(sessionStore, ArmSlider));

    await waitFor(() => {
      expect(screen.getByLabelText("Flight mode")).toBeTruthy();
    });

    expect(screen.queryByTestId("flight-replay-readonly-banner")).toBeNull();
    expect(screen.queryByTestId("arm-replay-readonly-banner")).toBeNull();

    const modeSelect = screen.getByLabelText("Flight mode") as HTMLSelectElement;
    expect(modeSelect.disabled).toBe(false);
    await modeSelect.focus();
    await waitFor(() => {
      expect(modeSelect.options.length).toBeGreaterThan(1);
    });
    await waitFor(() => {
      expect(screen.getByText("Takeoff")).toBeTruthy();
    });

    await fireEvent.click(screen.getByText("Takeoff"));
    expect(vi.mocked(guidedTakeoff)).toHaveBeenCalledTimes(1);

    await fireEvent.change(modeSelect, { target: { value: "5" } });
    expect(vi.mocked(setFlightMode)).toHaveBeenCalledWith(5);
  });
});
