// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { writable } from "svelte/store";
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
import SetupWizardBatteryStep from "./SetupWizardBatteryStep.svelte";

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
    selectedSectionId: "battery_monitor",
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

function createBatteryMetadata(): ParamMetadataMap {
  return new Map([
    [
      "BATT_MONITOR",
      {
        humanName: "Battery monitor",
        description: "Battery monitor backend.",
        values: [
          { code: 0, label: "Disabled" },
          { code: 3, label: "Analog Voltage Only" },
          { code: 4, label: "Analog Voltage and Current" },
        ],
        rebootRequired: true,
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

async function renderBatteryStep(options: RenderOptions = {}) {
  const paramStore = options.paramStore ?? createParamStoreFromEntries({
    BATT_MONITOR: 0,
  });
  const metadata = options.metadata === undefined ? createBatteryMetadata() : options.metadata;
  const sessionStore = writable(createSessionState(paramStore));
  const harness = createMockParamsService(metadata, options.paramsService);
  const parameterStore = createParamsStore(sessionStore, harness.service);
  await parameterStore.initialize();

  const sessionReadable = sessionStore as unknown as SessionStore;
  const onAdvance = options.onAdvance ?? vi.fn();
  const view = options.view ?? makeView();

  const applySpy = vi.spyOn(parameterStore, "applyStagedEdits");

  render(
    withShellContexts(sessionReadable, parameterStore, SetupWizardBatteryStep),
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
    view,
  };
}

afterEach(() => {
  cleanup();
});

describe("SetupWizardBatteryStep", () => {
  it("renders a summary of current battery monitor state", async () => {
    await renderBatteryStep();

    const summary = await waitFor(() =>
      screen.getByTestId(setupWorkspaceTestIds.wizardStepBatterySummary),
    );

    expect(summary.textContent).toContain("Disabled");
    expect(summary.textContent).toContain("BATT_MONITOR");
  });

  it("stages the selected preset and calls applyStagedEdits on Apply click", async () => {
    const { applySpy, parameterStore } = await renderBatteryStep();

    const select = await waitFor(() =>
      screen.getByTestId(setupWorkspaceTestIds.wizardStepBatteryPreset) as HTMLSelectElement,
    );

    await fireEvent.change(select, { target: { value: "4" } });
    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStepBatteryApply));

    await waitFor(() => {
      expect(applySpy).toHaveBeenCalled();
    });

    const args = applySpy.mock.calls[0]?.[0] as string[] | undefined;
    expect(args).toBeDefined();
    expect(args).toContain("BATT_MONITOR");

    const snapshot = (await import("svelte/store")).get(parameterStore);
    expect(snapshot.paramStore?.params.BATT_MONITOR?.value).toBe(4);
  });

  it("calls onAdvance after a successful apply", async () => {
    const onAdvance = vi.fn();
    await renderBatteryStep({ onAdvance });

    const select = await waitFor(() =>
      screen.getByTestId(setupWorkspaceTestIds.wizardStepBatteryPreset) as HTMLSelectElement,
    );
    await fireEvent.change(select, { target: { value: "4" } });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStepBatteryApply));

    await waitFor(() => {
      expect(onAdvance).toHaveBeenCalledTimes(1);
    });
  });

  it("does not advance and shows a failure notice when the apply is rejected", async () => {
    const onAdvance = vi.fn();
    const failingWriteBatch = vi.fn(async (entries: [string, number][]) => entries.map(([name, value]) => ({
      name,
      requested_value: value,
      confirmed_value: 0,
      success: false,
    })));

    await renderBatteryStep({
      onAdvance,
      paramsService: { writeBatch: failingWriteBatch },
    });

    const select = await waitFor(() =>
      screen.getByTestId(setupWorkspaceTestIds.wizardStepBatteryPreset) as HTMLSelectElement,
    );
    await fireEvent.change(select, { target: { value: "4" } });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStepBatteryApply));

    await waitFor(() => {
      expect(failingWriteBatch).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(
        screen.getByTestId(setupWorkspaceTestIds.wizardStepBatterySummary).textContent,
      ).toContain("Apply failed");
    });
    expect(onAdvance).not.toHaveBeenCalled();
  });
});
