// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { writable, get } from "svelte/store";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ParamsService, ParamsServiceEventHandlers } from "../../../lib/platform/params";
import { createParamsStore } from "../../../lib/stores/params";
import type { SessionStore, SessionStoreState } from "../../../lib/stores/session";
import type {
  SetupWorkspaceCheckpointState,
  SetupWorkspaceStoreState,
} from "../../../lib/stores/setup-workspace";
import type { SectionStatus, SetupSectionId } from "../../../lib/setup-sections";
import { SECTION_IDS } from "../../../lib/setup-sections";
import { missingDomainValue } from "../../../lib/domain-status";
import type { ParamMetadataMap } from "../../../param-metadata";
import type { ParamStore } from "../../../params";
import { withShellContexts } from "../../../test/context-harnesses";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";
import SetupWizardRcStep from "./SetupWizardRcStep.svelte";

function createSectionStatuses(): Record<SetupSectionId, SectionStatus> {
  const record = {} as Record<SetupSectionId, SectionStatus>;
  for (const id of SECTION_IDS) {
    record[id] = "unknown";
  }
  return record;
}

function createSectionConfirmations(): Record<SetupSectionId, boolean> {
  const record = {} as Record<SetupSectionId, boolean>;
  for (const id of SECTION_IDS) {
    record[id] = false;
  }
  return record;
}

function createIdleCheckpoint(): SetupWorkspaceCheckpointState {
  return {
    phase: "idle",
    resumeSectionId: null,
    scopeKey: null,
    scopeFamilyKey: null,
    resumeRevision: null,
    reason: null,
    title: null,
    detailText: null,
    blocksActions: false,
  };
}

function makeView(
  overrides: Partial<SetupWorkspaceStoreState> = {},
): SetupWorkspaceStoreState {
  const base: SetupWorkspaceStoreState = {
    readiness: "ready",
    stateText: "Setup ready",
    activeEnvelope: {
      session_id: "session-1",
      source_kind: "live",
      seek_epoch: 0,
      reset_revision: 0,
    },
    activeSource: "live",
    activeScopeKey: "session-1:live:0:0",
    lastAcceptedScopeKey: "session-1:live:0:0",
    sessionPhase: "connected",
    liveSessionConnected: true,
    scopeText: "session-1 · live · rev 0",
    metadataState: "ready",
    metadataText: "Metadata ready",
    metadataGateActive: false,
    metadataGateText: null,
    noticeText: null,
    progress: { completed: 0, total: 0, percentage: 0 },
    progressText: "0 of 0 complete",
    selectedSectionId: "rc_receiver",
    sections: [],
    sectionGroups: [],
    sectionStatuses: createSectionStatuses(),
    sectionConfirmations: createSectionConfirmations(),
    confirmationScopeKey: "session-1:live:0:0",
    checkpoint: createIdleCheckpoint(),
    statusNotices: [],
    rcReceiver: {
      signalState: "live",
      statusText: "4 live",
      detailText: "Live RC input is visible.",
      rssi: 212,
      rssiText: "RSSI 83%",
      channels: [
        { channel: 1, pwm: 1500, percent: 50, stale: false },
        { channel: 2, pwm: 1490, percent: 49, stale: false },
        { channel: 3, pwm: 1100, percent: 10, stale: false },
        { channel: 4, pwm: 1500, percent: 50, stale: false },
      ],
      hasMalformedChannels: false,
    },
    calibrationSummary: { cards: [] },
    canOpenFullParameters: true,
  };

  return { ...base, ...overrides };
}

function createParamStoreFromEntries(entries: Record<string, number>): ParamStore {
  const params: ParamStore["params"] = {};
  let index = 0;

  for (const [name, value] of Object.entries(entries)) {
    params[name] = {
      name,
      value,
      param_type: Number.isInteger(value) ? "uint8" : "real32",
      index: index++,
    };
  }

  return {
    expected_count: index,
    params,
  };
}

function createRcMetadata(): ParamMetadataMap {
  return new Map([
    [
      "RCMAP_ROLL",
      {
        humanName: "Roll channel",
        description: "Channel mapped to roll input.",
      },
    ],
    [
      "RCMAP_PITCH",
      {
        humanName: "Pitch channel",
        description: "Channel mapped to pitch input.",
      },
    ],
    [
      "RCMAP_THROTTLE",
      {
        humanName: "Throttle channel",
        description: "Channel mapped to throttle input.",
      },
    ],
    [
      "RCMAP_YAW",
      {
        humanName: "Yaw channel",
        description: "Channel mapped to yaw input.",
      },
    ],
  ]) as unknown as ParamMetadataMap;
}

function createSessionState(
  paramStore: ParamStore,
  overrides: Partial<SessionStoreState> = {},
): SessionStoreState {
  return {
    hydrated: true,
    lastPhase: "ready",
    lastError: null,
    activeEnvelope: {
      session_id: "session-1",
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
    telemetryDomain: missingDomainValue("bootstrap"),
    support: missingDomainValue("bootstrap"),
    sensorHealth: missingDomainValue("bootstrap"),
    configurationFacts: missingDomainValue("bootstrap"),
    calibration: missingDomainValue("bootstrap"),
    guided: missingDomainValue("bootstrap"),
    statusText: missingDomainValue("bootstrap"),
    bootstrap: {
      missionState: null,
      paramStore,
      paramProgress: "completed",
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
    ...overrides,
  };
}

function createMockParamsService(
  metadata: ParamMetadataMap | null,
  overrides: Partial<ParamsService> = {},
) {
  let handlers: ParamsServiceEventHandlers | null = null;
  const writeBatchSpy = vi.fn(async (entries: [string, number][]) => entries.map(([name, value]) => ({
    name,
    requested_value: value,
    confirmed_value: value,
    success: true,
  })));

  const service = {
    subscribeAll: vi.fn(async (next: ParamsServiceEventHandlers) => {
      handlers = next;
      return () => {
        handlers = null;
      };
    }),
    fetchMetadata: vi.fn(async () => metadata),
    downloadAll: vi.fn(async () => undefined),
    writeBatch: writeBatchSpy,
    parseFile: vi.fn(async () => ({})),
    formatFile: vi.fn(async (_store: ParamStore) => ""),
    formatError: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
    ...overrides,
  } satisfies ParamsService;

  return { service, writeBatchSpy };
}

type RenderOptions = {
  paramStore?: ParamStore;
  metadata?: ParamMetadataMap | null;
  paramsService?: Partial<ParamsService>;
  view?: SetupWorkspaceStoreState;
  onAdvance?: () => void;
};

async function renderRcStep(options: RenderOptions = {}) {
  // Start with a "wrong" mapping so the Mode 2 preset triggers staging.
  const paramStore = options.paramStore ?? createParamStoreFromEntries({
    RCMAP_ROLL: 2,
    RCMAP_PITCH: 1,
    RCMAP_THROTTLE: 3,
    RCMAP_YAW: 4,
  });
  const metadata = options.metadata === undefined ? createRcMetadata() : options.metadata;
  const sessionStore = writable(createSessionState(paramStore));
  const harness = createMockParamsService(metadata, options.paramsService);
  const parameterStore = createParamsStore(sessionStore, harness.service);
  await parameterStore.initialize();

  const sessionReadable = sessionStore as unknown as SessionStore;
  const onAdvance = options.onAdvance ?? vi.fn();
  const view = options.view ?? makeView();

  const applySpy = vi.spyOn(parameterStore, "applyStagedEdits");

  render(
    withShellContexts(sessionReadable, parameterStore, SetupWizardRcStep),
    {
      view,
      onAdvance,
    },
  );

  return {
    parameterStore,
    applySpy,
    onAdvance,
    harness,
  };
}

afterEach(() => {
  cleanup();
});

describe("SetupWizardRcStep", () => {
  it("renders the RCMAP summary from the param store", async () => {
    await renderRcStep();

    const summary = await waitFor(() =>
      screen.getByTestId(setupWorkspaceTestIds.wizardStepRcSummary),
    );
    expect(summary.textContent).toContain("ROLL=2");
    expect(summary.textContent).toContain("PITCH=1");
    expect(summary.textContent).toContain("THROTTLE=3");
    expect(summary.textContent).toContain("YAW=4");
  });

  it("stages the four RCMAP edits and calls applyStagedEdits with RCMAP names on preset click", async () => {
    const { applySpy, parameterStore } = await renderRcStep();

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStepRcPreset));

    await waitFor(() => {
      expect(applySpy).toHaveBeenCalled();
    });

    const args = applySpy.mock.calls[0]?.[0] as string[] | undefined;
    expect(args).toEqual(["RCMAP_ROLL", "RCMAP_PITCH", "RCMAP_THROTTLE", "RCMAP_YAW"]);

    // Confirm the final preset landed in the store.
    const snapshot = get(parameterStore);
    expect(snapshot.paramStore?.params.RCMAP_ROLL?.value).toBe(1);
    expect(snapshot.paramStore?.params.RCMAP_PITCH?.value).toBe(2);
  });

  it("disables Continue and surfaces a warning when signalState is not live", async () => {
    const onAdvance = vi.fn();
    const notLiveView = makeView({
      rcReceiver: {
        signalState: "waiting",
        statusText: "Waiting",
        detailText: "",
        rssi: null,
        rssiText: "RSSI --",
        channels: [],
        hasMalformedChannels: false,
      },
    });

    await renderRcStep({ view: notLiveView, onAdvance });

    const continueBtn = await waitFor(() =>
      screen.getByTestId(setupWorkspaceTestIds.wizardStepRcContinue) as HTMLButtonElement,
    );
    expect(continueBtn.disabled).toBe(true);
    expect(screen.getByTestId(setupWorkspaceTestIds.wizardStepRcWarning)).toBeTruthy();
  });

  it("enables Continue when signalState is live and advances on click", async () => {
    const onAdvance = vi.fn();

    await renderRcStep({ onAdvance });

    const continueBtn = await waitFor(() =>
      screen.getByTestId(setupWorkspaceTestIds.wizardStepRcContinue) as HTMLButtonElement,
    );
    expect(continueBtn.disabled).toBe(false);
    expect(screen.queryByTestId(setupWorkspaceTestIds.wizardStepRcWarning)).toBeNull();

    await fireEvent.click(continueBtn);
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });
});
