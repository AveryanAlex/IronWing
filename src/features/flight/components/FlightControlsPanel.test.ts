// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { writable } from "svelte/store";
import { afterEach, describe, expect, it, vi } from "vitest";

import { missingDomainValue } from "../../../lib/domain-status";
import type { SessionStoreState } from "../../../lib/stores/session-state";
import { withSessionContext } from "../../../test/context-harnesses";
import { setFlightMode } from "../../../telemetry";
import FlightControlsPanel from "./FlightControlsPanel.svelte";

vi.mock("../../../telemetry", async () => {
  const actual = await vi.importActual<typeof import("../../../telemetry")>("../../../telemetry");

  return {
    ...actual,
    getAvailableModes: vi.fn(async () => [
      { custom_mode: 0, name: "Stabilize" },
      { custom_mode: 2, name: "AltHold" },
    ]),
    setFlightMode: vi.fn(async () => undefined),
  };
});

vi.mock("../../../guided", () => ({
  guidedTakeoff: vi.fn(async () => undefined),
}));

function createSessionState(customMode: number, modeName: string): SessionStoreState {
  return {
    hydrated: true,
    lastPhase: "ready",
    lastError: null,
    activeEnvelope: {
      session_id: "live-session",
      source_kind: "live",
      seek_epoch: 0,
      reset_revision: 0,
    },
    activeSource: "live",
    sessionDomain: {
      available: true,
      complete: true,
      provenance: "bootstrap",
      value: {
        status: "active",
        connection: { kind: "connected" },
        vehicle_state: {
          armed: false,
          custom_mode: customMode,
          mode_name: modeName,
          system_status: "standby",
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
      websocketUrl: "ws://127.0.0.1:14560",
      serialPort: "",
      webSerialPortId: "",
      webBluetoothDeviceId: "",
      baud: 57600,
      selectedBtDevice: "",
      takeoffAlt: "10",
      followVehicle: true,
    },
    transportDescriptors: [],
    availableModes: [],
    btDevices: [],
    btScanning: false,
    optimisticConnection: null,
    connectionRequestPhase: "idle",
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("FlightControlsPanel", () => {
  it("keeps the current flight mode selected by custom mode after connection and mode updates", async () => {
    const backing = writable(createSessionState(0, "Mode 0"));
    const sessionStore = { subscribe: backing.subscribe } as any;

    render(withSessionContext(sessionStore, FlightControlsPanel));

    const modeSelect = screen.getByLabelText("Flight mode") as HTMLSelectElement;

    await waitFor(() => {
      expect(modeSelect.options.length).toBe(2);
    });
    expect(modeSelect.value).toBe("0");
    expect(modeSelect.selectedOptions[0]?.textContent).toBe("Stabilize");

    await fireEvent.change(modeSelect, { target: { value: "2" } });
    expect(vi.mocked(setFlightMode)).toHaveBeenCalledWith(2);

    backing.set(createSessionState(2, "Mode 2"));

    await waitFor(() => {
      expect(modeSelect.value).toBe("2");
    });
    expect(modeSelect.selectedOptions[0]?.textContent).toBe("AltHold");
  });
});
