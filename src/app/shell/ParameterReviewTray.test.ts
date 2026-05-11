// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/svelte";
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
      expected_count: 1,
      params: {
        BATT_LOW_VOLT: { name: "BATT_LOW_VOLT", value: 12.1, param_type: "real32", index: 0 },
      },
    },
    paramProgress: "completed",
    metadata: new Map([
      ["BATT_LOW_VOLT", { humanName: "Low voltage", description: "Battery warning threshold.", unitText: "V" }],
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
  } as unknown as ParamsStore;
}

afterEach(() => {
  cleanup();
});

describe("ParameterReviewTray", () => {
  it("disables apply surfaces and shows replay read-only guidance during playback", () => {
    const sessionStore = { subscribe: writable(createSessionState()).subscribe } as any;
    const paramsStore = createParamsStore(createParamsState());

    render(withShellContexts(sessionStore, paramsStore, ParameterReviewTray), {
      open: true,
      onToggle: () => {},
    });

    expect(screen.getByTestId(appShellTestIds.parameterReviewReplayReadonly).textContent).toContain("Replay is read-only");
    expect((screen.getByTestId(appShellTestIds.parameterReviewApply) as HTMLButtonElement).disabled).toBe(true);
  });
});
