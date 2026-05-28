// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { readable } from "svelte/store";
import { afterEach, describe, expect, it } from "vitest";

import {
  setOperatorWorkspaceViewStoreContext,
  setSessionViewStoreContext,
} from "../../../app/shell/runtime-context";
import { missingDomainValue } from "../../../lib/domain-status";
import { createOperatorWorkspaceViewStore } from "../../../lib/stores/operator-workspace-view";
import {
  createSessionViewStore,
  type SessionStore,
  type SessionStoreState,
} from "../../../lib/stores/session";
import TelemetryWorkspace from "../../../routes/(app)/telemetry/+page.svelte";

const envelope = {
  session_id: "telemetry-workspace",
  source_kind: "live" as const,
  seek_epoch: 0,
  reset_revision: 0,
};

function createSessionState(): SessionStoreState {
  return {
    hydrated: true,
    lastPhase: "ready",
    lastError: null,
    activeEnvelope: envelope,
    activeSource: "live",
    sessionDomain: {
      available: true,
      complete: true,
      provenance: "bootstrap",
      value: {
        status: "active",
        connection: { kind: "connected" },
        vehicle_state: null,
        home_position: null,
      },
    },
    telemetryDomain: {
      available: true,
      complete: true,
      provenance: "stream",
      value: {
        flight: {
          altitude_m: 60,
          speed_mps: 0,
          airspeed_mps: 0,
          climb_rate_mps: 0,
          throttle_pct: 0,
        },
        navigation: {
          latitude_deg: 42.3898,
          longitude_deg: -71.1476,
          heading_deg: 0,
          wp_dist_m: 0,
          nav_bearing_deg: 0,
          target_bearing_deg: 0,
          xtrack_error_m: 0,
        },
        power: { battery_pct: 76, battery_voltage_v: 15.8, battery_current_a: 2.1 },
        gps: { fix_type: "fix_3d", satellites: 12, hdop: 0.8 },
        radio: { rc_channels: [], servo_outputs: [] },
      },
    },
    support: missingDomainValue("bootstrap"),
    sensorHealth: missingDomainValue("bootstrap"),
    configurationFacts: missingDomainValue("bootstrap"),
    calibration: missingDomainValue("bootstrap"),
    guided: missingDomainValue("bootstrap"),
    statusText: { available: true, complete: true, provenance: "bootstrap", value: { entries: [] } },
    bootstrap: {
      missionState: null,
      paramStore: null,
      paramProgress: null,
      playbackCursorUsec: null,
    },
    connectionForm: {
      mode: "demo",
      udpBind: "0.0.0.0:14550",
      tcpAddress: "127.0.0.1:5760",
      websocketUrl: "ws://127.0.0.1:14560",
      serialPort: "",
      webSerialPortId: "",
      webBluetoothDeviceId: "",
      baud: 57600,
      selectedBtDevice: "",
      demoVehiclePreset: "quadcopter",
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

function TelemetryHarness(...args: any[]) {
  const sessionStore = readable(createSessionState()) as SessionStore;

  setSessionViewStoreContext(createSessionViewStore(sessionStore));
  setOperatorWorkspaceViewStoreContext(createOperatorWorkspaceViewStore(sessionStore));

  return (TelemetryWorkspace as (...args: any[]) => unknown)(...args);
}

afterEach(() => {
  cleanup();
});

describe("TelemetryWorkspace", () => {
  it("keeps compact telemetry cards dense and lets long coordinates truncate", () => {
    render(TelemetryHarness);

    const longitudeValue = screen.getByTitle("-71.1476000°");

    expect(longitudeValue.className).toContain("truncate");
    expect(longitudeValue.className).toContain("text-sm");
    expect(longitudeValue.closest('[data-density="compact"]')).toBeTruthy();
    expect(screen.getByTitle("42.3898000°").closest('[data-density="compact"]')).toBeTruthy();
  });
});
