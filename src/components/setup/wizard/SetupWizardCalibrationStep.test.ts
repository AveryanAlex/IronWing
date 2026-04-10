// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const calibrationMocks = vi.hoisted(() => ({
  calibrateAccel: vi.fn(async () => undefined),
  calibrateCompassStart: vi.fn(async () => undefined),
}));

vi.mock("../../../calibration", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../calibration")>();
  return {
    ...actual,
    ...calibrationMocks,
  };
});

import type {
  SetupWorkspaceCalibrationCard,
  SetupWorkspaceCheckpointState,
  SetupWorkspaceStoreState,
} from "../../../lib/stores/setup-workspace";
import type { SectionStatus, SetupSectionId } from "../../../lib/setup-sections";
import { SECTION_IDS } from "../../../lib/setup-sections";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";
import SetupWizardCalibrationStep from "./SetupWizardCalibrationStep.svelte";

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

function makeCalibrationCard(
  id: SetupWorkspaceCalibrationCard["id"],
  overrides: Partial<SetupWorkspaceCalibrationCard> = {},
): SetupWorkspaceCalibrationCard {
  return {
    id,
    title: id === "accel" ? "Accelerometer" : id === "compass" ? "Compass" : id,
    lifecycle: "not_started",
    statusText: "Not started",
    detailText: "",
    actionLabel: null,
    actionAvailability: "blocked",
    ...overrides,
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
    selectedSectionId: "calibration",
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
    calibrationSummary: {
      cards: [
        makeCalibrationCard("accel", { statusText: "Accel waiting" }),
        makeCalibrationCard("compass", { statusText: "Compass waiting" }),
      ],
    },
    canOpenFullParameters: true,
  };

  return { ...base, ...overrides };
}

afterEach(() => {
  cleanup();
  calibrationMocks.calibrateAccel.mockClear();
  calibrationMocks.calibrateCompassStart.mockClear();
});

describe("SetupWizardCalibrationStep", () => {
  it("renders accel and compass cards from the view's calibration summary", async () => {
    render(SetupWizardCalibrationStep, {
      view: makeView(),
      onAdvance: vi.fn(),
    });

    const summary = screen.getByTestId(setupWorkspaceTestIds.wizardStepCalibSummary);
    expect(summary.textContent).toContain("Accelerometer");
    expect(summary.textContent).toContain("Accel waiting");
    expect(summary.textContent).toContain("Compass");
    expect(summary.textContent).toContain("Compass waiting");
  });

  it("invokes calibrateAccel when the accelerometer button is clicked", async () => {
    render(SetupWizardCalibrationStep, {
      view: makeView(),
      onAdvance: vi.fn(),
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStepCalibAccel));

    expect(calibrationMocks.calibrateAccel).toHaveBeenCalledTimes(1);
  });

  it("invokes calibrateCompassStart with mask 0 when the compass button is clicked", async () => {
    render(SetupWizardCalibrationStep, {
      view: makeView(),
      onAdvance: vi.fn(),
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStepCalibCompass));

    expect(calibrationMocks.calibrateCompassStart).toHaveBeenCalledTimes(1);
    expect(calibrationMocks.calibrateCompassStart).toHaveBeenCalledWith(0);
  });

  it("disables the Continue button until both cards report complete", async () => {
    const onAdvance = vi.fn();
    const partialView = makeView({
      calibrationSummary: {
        cards: [
          makeCalibrationCard("accel", { lifecycle: "complete" }),
          makeCalibrationCard("compass", { lifecycle: "running" }),
        ],
      },
    });

    render(SetupWizardCalibrationStep, {
      view: partialView,
      onAdvance,
    });

    const continueBtn = screen.getByTestId(
      setupWorkspaceTestIds.wizardStepCalibContinue,
    ) as HTMLButtonElement;
    expect(continueBtn.disabled).toBe(true);
  });

  it("enables Continue when both cards are complete and advances when clicked", async () => {
    const onAdvance = vi.fn();
    const readyView = makeView({
      calibrationSummary: {
        cards: [
          makeCalibrationCard("accel", { lifecycle: "complete" }),
          makeCalibrationCard("compass", { lifecycle: "complete" }),
        ],
      },
    });

    render(SetupWizardCalibrationStep, {
      view: readyView,
      onAdvance,
    });

    const continueBtn = screen.getByTestId(
      setupWorkspaceTestIds.wizardStepCalibContinue,
    ) as HTMLButtonElement;
    expect(continueBtn.disabled).toBe(false);

    await fireEvent.click(continueBtn);
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });
});
