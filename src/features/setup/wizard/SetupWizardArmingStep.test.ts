// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const calibrationMocks = vi.hoisted(() => ({
  requestPrearmChecks: vi.fn(async () => undefined),
}));

vi.mock("../../../calibration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../calibration")>();
  return {
    ...actual,
    ...calibrationMocks,
  };
});

import type {
  SetupWorkspaceCheckpointState,
  SetupWorkspaceStoreState,
} from "../../../lib/stores/setup-workspace";
import type { SectionStatus, SetupSectionId } from "../../../lib/setup-sections";
import { SECTION_IDS } from "../../../lib/setup-sections";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";
import SetupWizardArmingStep from "./SetupWizardArmingStep.svelte";

function createSectionStatuses(
  armingStatus: SectionStatus = "unknown",
): Record<SetupSectionId, SectionStatus> {
  const record = {} as Record<SetupSectionId, SectionStatus>;
  for (const id of SECTION_IDS) {
    record[id] = "unknown";
  }
  record.arming = armingStatus;
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
    selectedSectionId: "arming",
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

afterEach(() => {
  cleanup();
  calibrationMocks.requestPrearmChecks.mockClear();
});

describe("SetupWizardArmingStep", () => {
  it("surfaces the arming section status text", async () => {
    render(SetupWizardArmingStep, {
      view: makeView({ sectionStatuses: createSectionStatuses("failed") }),
      onAdvance: vi.fn(),
    });

    expect(screen.getByText(/Pre-arm checks are failing/)).toBeTruthy();
  });

  it("invokes requestPrearmChecks when the Refresh button is clicked", async () => {
    render(SetupWizardArmingStep, {
      view: makeView(),
      onAdvance: vi.fn(),
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStepArmingRefresh));

    expect(calibrationMocks.requestPrearmChecks).toHaveBeenCalledTimes(1);
  });

  it("disables Continue when arming status is not complete", async () => {
    render(SetupWizardArmingStep, {
      view: makeView({ sectionStatuses: createSectionStatuses("not_started") }),
      onAdvance: vi.fn(),
    });

    const continueBtn = screen.getByTestId(
      setupWorkspaceTestIds.wizardStepArmingContinue,
    ) as HTMLButtonElement;
    expect(continueBtn.disabled).toBe(true);
  });

  it("enables Continue when arming status is complete and advances on click", async () => {
    const onAdvance = vi.fn();

    render(SetupWizardArmingStep, {
      view: makeView({ sectionStatuses: createSectionStatuses("complete") }),
      onAdvance,
    });

    const continueBtn = screen.getByTestId(
      setupWorkspaceTestIds.wizardStepArmingContinue,
    ) as HTMLButtonElement;
    expect(continueBtn.disabled).toBe(false);

    await fireEvent.click(continueBtn);
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });
});
