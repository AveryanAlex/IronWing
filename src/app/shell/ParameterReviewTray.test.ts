// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { writable } from "svelte/store";
import { afterEach, describe, expect, it } from "vitest";

import type { ParamsStore, ParamsStoreState } from "../../lib/stores/params";
import type { SessionStoreState } from "../../lib/stores/session-state";
import { missingDomainValue } from "../../lib/domain-status";
import { withShellContexts } from "../../test/context-harnesses";
import { appShellTestIds } from "./chrome-state";
import ParameterReviewTray from "./ParameterReviewTray.svelte";

function createSessionState(): SessionStoreState {
  return {
    hydrated: true,
    lastPhase: "ready",
    lastError: null,
    activeEnvelope: {
      session_id: "playback-1",
      source_kind: "playback",
      seek_epoch: 1,
      reset_revision: 1,
    },
    activeSource: "playback",
    sessionDomain: missingDomainValue("bootstrap"),
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
      websocketUrl: "ws://127.0.0.1:14550",
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
  };
}

function createParamsState(): ParamsStoreState {
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
      seek_epoch: 1,
      reset_revision: 1,
    },
    activeSource: "playback",
    liveSessionConnected: false,
    vehicleType: "quadrotor",
    paramStore: {
      expected_count: 2,
      params: {
        BATT_LOW_VOLT: { name: "BATT_LOW_VOLT", value: 12.1, param_type: "real32", index: 0 },
        FS_THR_ENABLE: { name: "FS_THR_ENABLE", value: 0, param_type: "uint8", index: 1 },
      },
    },
    paramProgress: "completed",
    metadata: new Map([
      ["BATT_LOW_VOLT", { humanName: "Low voltage", description: "Battery warning threshold.", unitText: "V" }],
      [
        "FS_THR_ENABLE",
        {
          humanName: "Throttle failsafe",
          description: "Throttle failsafe behavior.",
          values: [
            { code: 0, label: "Disabled" },
            { code: 1, label: "Enabled always RTL" },
          ],
        },
      ],
    ]),
    metadataState: "ready",
    metadataError: null,
    stagedEdits: {
      BATT_LOW_VOLT: {
        name: "BATT_LOW_VOLT",
        label: "Low voltage",
        rawName: "BATT_LOW_VOLT",
        description: "Battery warning threshold.",
        currentValue: 12.1,
        currentValueText: "12.1",
        nextValue: 14.4,
        nextValueText: "14.4",
        units: "V",
        rebootRequired: false,
        order: 0,
      },
      FS_THR_ENABLE: {
        name: "FS_THR_ENABLE",
        label: "Throttle failsafe",
        rawName: "FS_THR_ENABLE",
        description: "Throttle failsafe behavior.",
        currentValue: 0,
        currentValueText: "0",
        nextValue: 1,
        nextValueText: "1",
        units: null,
        rebootRequired: false,
        order: 1,
      },
    },
    retainedFailures: {},
    applyPhase: "idle",
    applyError: null,
    applyProgress: null,
    scopeClearWarning: null,
    lastNotice: null,
  };
}

function createParamsStore(state: ParamsStoreState): ParamsStore {
  const backing = writable(state);
  return {
    subscribe: backing.subscribe,
    initialize: async () => undefined,
    reset: () => undefined,
    stageParameterEdit: () => undefined,
    discardStagedEdit: () => undefined,
    clearStagedEdits: () => undefined,
    applyStagedEdits: async () => undefined,
    downloadAll: async () => undefined,
    cancelDownload: async () => undefined,
  } as unknown as ParamsStore;
}

afterEach(() => {
  cleanup();
});

describe("ParameterReviewTray", () => {
  it("disables apply surfaces and shows replay read-only guidance during playback", async () => {
    const sessionStore = { subscribe: writable(createSessionState()).subscribe } as any;
    const paramsStore = createParamsStore(createParamsState());

    render(withShellContexts(sessionStore, paramsStore, ParameterReviewTray));

    await fireEvent.click(screen.getByTestId(appShellTestIds.parameterReviewToggle));

    expect(screen.getByTestId(appShellTestIds.parameterReviewReplayReadonly).textContent).toContain("Replay is read-only");
    expect((screen.getByTestId(appShellTestIds.parameterReviewApply) as HTMLButtonElement).disabled).toBe(true);
    const row = screen.getByTestId(`${appShellTestIds.parameterReviewRowPrefix}-BATT_LOW_VOLT`);
    expect(row.textContent).toContain("Low voltage");
    expect(row.textContent).toContain("BATT_LOW_VOLT");
    expect(row.textContent).toContain("12.1 V");
    expect(row.textContent).toContain("14.4 V");
    const enumRow = screen.getByTestId(`${appShellTestIds.parameterReviewRowPrefix}-FS_THR_ENABLE`);
    expect(enumRow.textContent).toContain("Throttle failsafe");
    expect(enumRow.textContent).toContain("FS_THR_ENABLE");
    expect(enumRow.textContent).toContain("Disabled");
    expect(enumRow.textContent).toContain("Enabled always RTL");
  });
});
