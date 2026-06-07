// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
import { readable } from "svelte/store";
import { afterEach, describe, expect, it, vi } from "vitest";

import { missingDomainValue } from "../../lib/domain-status";
import { settingsDefaults } from "../../lib/stores/settings";
import {
  createSessionViewStore,
  type SessionStore,
  type SessionStoreState,
} from "../../lib/stores/session";
import type { LiveSettingsStore, LiveSettingsStoreState } from "../../lib/stores/live-settings";
import VehicleSidebarTelemetry from "./VehicleSidebarTelemetry.svelte";
import {
  setLiveSettingsStoreContext,
  setSessionViewStoreContext,
  setTelemetrySettingsDialogLauncherContext,
} from "./runtime-context";

const envelope = {
  session_id: "live-sidebar",
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
        flight: { altitude_m: 12.4, speed_mps: 4.8 },
        power: { battery_pct: 87.2 },
        gps: { fix_type: "fix_3d", satellites: 14 },
      },
    },
    support: missingDomainValue("bootstrap"),
    sensorHealth: missingDomainValue("bootstrap"),
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
    availableModes: [],
    btDevices: [],
    btScanning: false,
    optimisticConnection: null,
  };
}

function createLiveSettingsState(): LiveSettingsStoreState {
  return {
    hydrated: true,
    sessionHydrated: true,
    activeEnvelope: envelope,
    activeSource: "live",
    liveVehicleConnected: true,
    confirmedSettings: {
      ...settingsDefaults,
      telemetryRateHz: 5,
      messageRates: { 33: 4 },
    },
    draft: {
      telemetryRateHz: 5,
      messageRates: { 33: 4 },
    },
    messageRateCatalog: [],
    catalogPhase: "ready",
    catalogError: null,
    applyPhase: "idle",
    applyTarget: null,
    lastApplyError: null,
    telemetryRateError: null,
    messageRateErrors: {},
    reconnectPhase: "idle",
    reconnectError: null,
  };
}

function SidebarHarness(...args: any[]) {
  const sessionStore = readable(createSessionState()) as SessionStore;
  const liveSettingsStore = readable(createLiveSettingsState()) as LiveSettingsStore;

  setSessionViewStoreContext(createSessionViewStore(sessionStore));
  setLiveSettingsStoreContext(liveSettingsStore);
  setTelemetrySettingsDialogLauncherContext({ open: vi.fn() });

  return (VehicleSidebarTelemetry as (...args: any[]) => unknown)(...args);
}

afterEach(() => {
  cleanup();
});

describe("VehicleSidebarTelemetry", () => {
  it("renders essential telemetry as dense rows instead of card tiles", () => {
    render(SidebarHarness);

    const altitudeRow = screen.getByTestId("sidebar-telemetry-altitude");
    const speedRow = screen.getByTestId("sidebar-telemetry-speed");
    const batteryRow = screen.getByTestId("sidebar-telemetry-battery");
    const gpsRow = screen.getByTestId("sidebar-telemetry-gps");

    expect(altitudeRow.closest("dl")).toBeTruthy();
    expect(altitudeRow.querySelector("dt")?.textContent).toContain("Alt");
    expect(altitudeRow.querySelector("dd")?.textContent).toContain("12.4 m");
    expect(speedRow.querySelector("dd")?.textContent).toContain("4.8 m/s");
    expect(batteryRow.querySelector("dd")?.textContent).toContain("87.2%");
    expect(gpsRow.querySelector("dd")?.textContent).toContain("3D fix · 14 sats");
    expect(altitudeRow.querySelector("[data-density]")).toBeNull();
  });
});
