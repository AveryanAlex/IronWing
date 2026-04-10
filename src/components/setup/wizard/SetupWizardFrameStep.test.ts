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
import SetupWizardFrameStep from "./SetupWizardFrameStep.svelte";

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
    selectedSectionId: "frame_orientation",
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

function createFrameMetadata(): ParamMetadataMap {
  return new Map([
    [
      "FRAME_CLASS",
      {
        humanName: "Frame class",
        description: "Frame family.",
        values: [
          { code: 1, label: "Quad" },
          { code: 2, label: "Hexa" },
        ],
        rebootRequired: true,
      },
    ],
    [
      "AHRS_ORIENTATION",
      {
        humanName: "Board orientation",
        description: "Board mounting orientation.",
        values: [
          { code: 0, label: "None" },
          { code: 2, label: "Yaw 90" },
        ],
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

async function renderFrameStep(options: RenderOptions = {}) {
  const paramStore = options.paramStore ?? createParamStoreFromEntries({
    FRAME_CLASS: 1,
    AHRS_ORIENTATION: 0,
  });
  const metadata = options.metadata === undefined ? createFrameMetadata() : options.metadata;
  const sessionStore = writable(createSessionState(paramStore));
  const harness = createMockParamsService(metadata, options.paramsService);
  const parameterStore = createParamsStore(sessionStore, harness.service);
  await parameterStore.initialize();

  const sessionReadable = sessionStore as unknown as SessionStore;
  const onAdvance = options.onAdvance ?? vi.fn();
  const view = options.view ?? makeView();

  const applySpy = vi.spyOn(parameterStore, "applyStagedEdits");

  render(
    withShellContexts(sessionReadable, parameterStore, SetupWizardFrameStep),
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

describe("SetupWizardFrameStep", () => {
  it("renders a summary of current frame class and orientation", async () => {
    await renderFrameStep();

    const summary = await waitFor(() =>
      screen.getByTestId(setupWorkspaceTestIds.wizardStepFrameSummary),
    );

    expect(summary.textContent).toContain("Quad");
    expect(summary.textContent).toContain("AHRS_ORIENTATION");
  });

  it("stages frame class + orientation edits and calls applyStagedEdits on Apply click", async () => {
    const { applySpy, parameterStore } = await renderFrameStep();

    const frameSelect = await waitFor(() =>
      screen.getByTestId(
        `${setupWorkspaceTestIds.wizardStepBodyPrefix}-frame_orientation-frame-class`,
      ) as HTMLSelectElement,
    );

    await fireEvent.change(frameSelect, { target: { value: "2" } });
    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStepFrameApply));

    await waitFor(() => {
      expect(applySpy).toHaveBeenCalled();
    });

    const args = applySpy.mock.calls[0]?.[0] as string[] | undefined;
    expect(args).toBeDefined();
    expect(args).toContain("FRAME_CLASS");
    // No orientation change — the step should not include it.
    expect(args).not.toContain("AHRS_ORIENTATION");

    // Staged value should have been written through the params store.
    const snapshot = (await import("svelte/store")).get(parameterStore);
    expect(snapshot.paramStore?.params.FRAME_CLASS?.value).toBe(2);
  });

  it("calls onAdvance after a successful apply", async () => {
    const onAdvance = vi.fn();
    await renderFrameStep({ onAdvance });

    const frameSelect = await waitFor(() =>
      screen.getByTestId(
        `${setupWorkspaceTestIds.wizardStepBodyPrefix}-frame_orientation-frame-class`,
      ) as HTMLSelectElement,
    );
    await fireEvent.change(frameSelect, { target: { value: "2" } });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStepFrameApply));

    await waitFor(() => {
      expect(onAdvance).toHaveBeenCalledTimes(1);
    });
  });

  it("does not advance and shows a failure notice when the apply is rejected", async () => {
    const onAdvance = vi.fn();
    const failingWriteBatch = vi.fn(async (entries: [string, number][]) => entries.map(([name, value]) => ({
      name,
      requested_value: value,
      confirmed_value: value === 2 ? 1 : value,
      success: false,
    })));

    await renderFrameStep({
      onAdvance,
      paramsService: { writeBatch: failingWriteBatch },
    });

    const frameSelect = await waitFor(() =>
      screen.getByTestId(
        `${setupWorkspaceTestIds.wizardStepBodyPrefix}-frame_orientation-frame-class`,
      ) as HTMLSelectElement,
    );
    await fireEvent.change(frameSelect, { target: { value: "2" } });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStepFrameApply));

    await waitFor(() => {
      expect(failingWriteBatch).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(
        screen.getByTestId(setupWorkspaceTestIds.wizardStepFrameSummary).textContent,
      ).toContain("Apply failed");
    });
    expect(onAdvance).not.toHaveBeenCalled();
  });
});
