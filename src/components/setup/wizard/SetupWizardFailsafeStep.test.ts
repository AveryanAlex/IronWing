// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { get, writable } from "svelte/store";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ParamsService, ParamsServiceEventHandlers } from "../../../lib/platform/params";
import { createParamsStore } from "../../../lib/stores/params";
import type { SessionStore, SessionStoreState } from "../../../lib/stores/session";
import {
  createSetupWorkspaceStore,
  type SetupWorkspaceCheckpointState,
  type SetupWorkspaceStoreState,
} from "../../../lib/stores/setup-workspace";
import type { SectionStatus, SetupSectionId } from "../../../lib/setup-sections";
import { SECTION_IDS } from "../../../lib/setup-sections";
import { missingDomainValue } from "../../../lib/domain-status";
import type { ParamMetadataMap } from "../../../param-metadata";
import type { ParamStore } from "../../../params";
import { withShellContexts } from "../../../test/context-harnesses";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";
import SetupWizardFailsafeStep from "./SetupWizardFailsafeStep.svelte";

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
    selectedSectionId: "failsafe",
    sections: [],
    sectionGroups: [],
    sectionStatuses: createSectionStatuses(),
    sectionConfirmations: createSectionConfirmations(),
    confirmationScopeKey: "session-1:live:0:0",
    checkpoint: createIdleCheckpoint(),
    statusNotices: [],
    rcReceiver: {
      signalState: "waiting",
      statusText: "Waiting",
      detailText: "",
      rssi: null,
      rssiText: "RSSI --",
      channels: [],
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

function createFailsafeMetadata(): ParamMetadataMap {
  const valueEnum = (label: string) => [
    { code: 0, label: "Disabled" },
    { code: 1, label },
    { code: 2, label: "RTL" },
  ];
  return new Map([
    [
      "FS_THR_ENABLE",
      {
        humanName: "Throttle failsafe",
        description: "Radio failsafe action.",
        values: valueEnum("Enabled/RTL"),
        rebootRequired: false,
      },
    ],
    [
      "FS_EKF_ACTION",
      {
        humanName: "EKF failsafe",
        description: "EKF failsafe action.",
        values: valueEnum("Land"),
        rebootRequired: false,
      },
    ],
    [
      "BATT_FS_LOW_ACT",
      {
        humanName: "Low battery action",
        description: "Low battery action.",
        values: valueEnum("Land"),
        rebootRequired: false,
      },
    ],
    [
      "BATT_FS_CRT_ACT",
      {
        humanName: "Critical battery action",
        description: "Critical battery action.",
        values: valueEnum("Land"),
        rebootRequired: false,
      },
    ],
    [
      "FS_CRASH_CHECK",
      {
        humanName: "Crash check",
        description: "Crash detection.",
        values: valueEnum("Enabled"),
        rebootRequired: false,
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

async function renderFailsafeStep(options: RenderOptions = {}) {
  // Start with all safety defaults at zero so every field must change.
  const paramStore = options.paramStore ?? createParamStoreFromEntries({
    FS_THR_ENABLE: 0,
    FS_EKF_ACTION: 0,
    BATT_FS_LOW_ACT: 0,
    BATT_FS_CRT_ACT: 0,
    FS_CRASH_CHECK: 0,
  });
  const metadata = options.metadata === undefined ? createFailsafeMetadata() : options.metadata;
  const sessionStore = writable(createSessionState(paramStore));
  const harness = createMockParamsService(metadata, options.paramsService);
  const parameterStore = createParamsStore(sessionStore, harness.service);
  await parameterStore.initialize();

  const sessionReadable = sessionStore as unknown as SessionStore;
  const setupWorkspaceStore = createSetupWorkspaceStore(sessionReadable, parameterStore);
  const onAdvance = options.onAdvance ?? vi.fn();
  const view = options.view ?? makeView();

  const applySpy = vi.spyOn(parameterStore, "applyStagedEdits");
  const confirmSpy = vi.spyOn(setupWorkspaceStore, "confirmSection");

  render(
    withShellContexts(sessionReadable, parameterStore, SetupWizardFailsafeStep, {
      setupWorkspaceStore,
    }),
    {
      view,
      onAdvance,
    },
  );

  return {
    parameterStore,
    applySpy,
    confirmSpy,
    onAdvance,
    harness,
    setupWorkspaceStore,
    view,
  };
}

afterEach(() => {
  cleanup();
});

describe("SetupWizardFailsafeStep", () => {
  it("renders a summary of the recommended failsafe defaults", async () => {
    await renderFailsafeStep();

    const summary = await waitFor(() =>
      screen.getByTestId(setupWorkspaceTestIds.wizardStepFailsafeSummary),
    );

    expect(summary.textContent).toContain("FS_THR_ENABLE");
  });

  it("stages the recommended defaults and confirms the section on Apply", async () => {
    const { applySpy, confirmSpy, parameterStore, onAdvance } = await renderFailsafeStep();

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStepFailsafeApply));

    await waitFor(() => {
      expect(applySpy).toHaveBeenCalled();
    });

    const args = applySpy.mock.calls[0]?.[0] as string[] | undefined;
    expect(args).toBeDefined();
    expect(args).toContain("FS_THR_ENABLE");
    expect(args).toContain("BATT_FS_LOW_ACT");
    expect(args).toContain("BATT_FS_CRT_ACT");

    const snapshot = get(parameterStore);
    expect(snapshot.paramStore?.params.FS_THR_ENABLE?.value).toBe(1);
    expect(snapshot.paramStore?.params.BATT_FS_LOW_ACT?.value).toBe(2);

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith("failsafe");
    });
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it("confirms the section without staging when the user clicks Mark as reviewed", async () => {
    const { applySpy, confirmSpy, onAdvance } = await renderFailsafeStep();

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStepFailsafeConfirm));

    expect(confirmSpy).toHaveBeenCalledWith("failsafe");
    expect(onAdvance).toHaveBeenCalledTimes(1);
    expect(applySpy).not.toHaveBeenCalled();
  });

  it("does not advance or confirm when the apply is rejected", async () => {
    const failingWriteBatch = vi.fn(async (entries: [string, number][]) => entries.map(([name, value]) => ({
      name,
      requested_value: value,
      confirmed_value: 0,
      success: false,
    })));

    const { confirmSpy, onAdvance } = await renderFailsafeStep({
      paramsService: { writeBatch: failingWriteBatch },
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStepFailsafeApply));

    await waitFor(() => {
      expect(failingWriteBatch).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(
        screen.getByTestId(setupWorkspaceTestIds.wizardStepFailsafeSummary).textContent,
      ).toContain("Apply failed");
    });
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onAdvance).not.toHaveBeenCalled();
  });
});
