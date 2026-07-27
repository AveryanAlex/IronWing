// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { writable } from "svelte/store";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ParamsStore, ParamsStoreState } from "../../lib/stores/params";
import type { SessionStoreState } from "../../lib/stores/session-state";
import { missingDomainValue } from "../../lib/domain-status";
import { withShellContexts } from "../../test/context-harnesses";
import { appShellTestIds } from "./chrome-state";
import ParameterReviewTray from "./ParameterReviewTray.svelte";

const notificationMocks = vi.hoisted(() => ({
  notifyError: vi.fn(),
  notifyUnknownError: vi.fn(),
}));

vi.mock("../../lib/notifications", () => notificationMocks);

function createSessionState(source: "live" | "playback" = "playback"): SessionStoreState {
  return {
    hydrated: true,
    lastPhase: "ready",
    lastError: null,
    activeEnvelope: {
      session_id: `${source}-1`,
      source_kind: source,
      seek_epoch: 1,
      reset_revision: 1,
    },
    activeSource: source,
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

function createParamsState(source: "live" | "playback" = "playback"): ParamsStoreState {
  return {
    hydrated: true,
    phase: "ready",
    streamReady: true,
    streamError: null,
    sessionHydrated: true,
    sessionPhase: "ready",
    activeEnvelope: {
      session_id: `${source}-1`,
      source_kind: source,
      seek_epoch: 1,
      reset_revision: 1,
    },
    activeSource: source,
    liveSessionConnected: source === "live",
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

function createParamsStore(state: ParamsStoreState, failApply = false): ParamsStore {
  const backing = writable(state);
  return {
    subscribe: backing.subscribe,
    initialize: async () => undefined,
    reset: () => undefined,
    stageParameterEdit: () => undefined,
    discardStagedEdit: () => undefined,
    clearStagedEdits: () => undefined,
    applyStagedEdits: async () => {
      if (!failApply) {
        return;
      }

      backing.update((current) => ({
        ...current,
        applyPhase: "failed",
        retainedFailures: {
          BATT_LOW_VOLT: {
            name: "BATT_LOW_VOLT",
            requestedValue: 14.4,
            message: "Vehicle rejected the requested voltage.",
            confirmedValue: 12.1,
          },
        },
      }));
    },
    downloadAll: async () => undefined,
    cancelDownload: async () => undefined,
  } as unknown as ParamsStore;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ParameterReviewTray", () => {
  it("disables apply surfaces without duplicating shell-owned replay guidance during playback", async () => {
    const sessionStore = { subscribe: writable(createSessionState()).subscribe } as any;
    const paramsStore = createParamsStore(createParamsState());

    render(withShellContexts(sessionStore, paramsStore, ParameterReviewTray));

    await fireEvent.click(screen.getByTestId(appShellTestIds.parameterReviewToggle));

    expect(screen.queryByTestId(appShellTestIds.parameterReviewReplayReadonly)).toBeNull();
    expect(screen.queryByTestId(appShellTestIds.parameterReviewWarning)).toBeNull();
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

  it("reports failed writes through one toast while keeping retry state in the tray", async () => {
    const sessionStore = { subscribe: writable(createSessionState("live")).subscribe } as any;
    const paramsStore = createParamsStore(createParamsState("live"), true);

    render(withShellContexts(sessionStore, paramsStore, ParameterReviewTray));

    await fireEvent.click(screen.getByTestId(appShellTestIds.parameterReviewToggle));
    await fireEvent.click(screen.getByTestId(appShellTestIds.parameterReviewApply));

    await waitFor(() => {
      expect(notificationMocks.notifyError).toHaveBeenCalledWith("1 parameter change failed", {
        description: "BATT_LOW_VOLT: Vehicle rejected the requested voltage.",
        id: "parameter-apply",
      });
    });
    expect(screen.getByText("failed")).toBeTruthy();
    expect(screen.getByTestId(`${appShellTestIds.parameterReviewRetryPrefix}-BATT_LOW_VOLT`)).toBeTruthy();
    expect(screen.queryByText("Vehicle rejected the requested voltage.")).toBeNull();
  });
});
