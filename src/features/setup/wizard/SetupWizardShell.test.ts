// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import type { Snippet } from "svelte";
import { get } from "svelte/store";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SectionStatus, SetupSectionId } from "../../../lib/setup-sections";
import { SECTION_IDS } from "../../../lib/setup-sections";
import {
  createSetupWizardStore,
  type SetupWizardStore,
  type WizardStepSnapshot,
  type WorkspaceSnapshot,
} from "../../../lib/stores/setup-wizard";
import type {
  SetupWorkspaceCheckpointState,
  SetupWorkspaceStoreState,
} from "../../../lib/stores/setup-workspace";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";
import SetupWizardShell from "./SetupWizardShell.svelte";

type WizardSlot = {
  step: WizardStepSnapshot;
  advance: () => void;
  skip: () => void;
};

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
    sessionPhase: "ready",
    liveSessionConnected: true,
    scopeText: "session-1 · live · rev 0",
    metadataState: "ready",
    metadataText: "Metadata ready",
    noticeText: null,
    progress: { completed: 0, total: 0, percentage: 0 },
    progressText: "0 of 0 complete",
    selectedSectionId: "overview",
    sections: [],
    sectionGroups: [],
    sectionStatuses: createSectionStatuses(),
    sectionConfirmations: createSectionConfirmations(),
    confirmationScopeKey: "session-1:live:0:0",
    checkpoint: createIdleCheckpoint(),
    statusNotices: [],
    rcReceiver: {
      signalState: "waiting",
      statusText: "Waiting for RC signal",
      detailText: "",
      rssi: null,
      rssiText: "RSSI --",
      channels: [],
      hasMalformedChannels: false,
    },
    calibrationSummary: { cards: [] },
  };

  return { ...base, ...overrides };
}

function createSnapshot(overrides: Partial<WorkspaceSnapshot> = {}): WorkspaceSnapshot {
  return {
    sectionStatuses: createSectionStatuses(),
    activeEnvelope: {
      session_id: "session-1",
      source_kind: "live",
      seek_epoch: 0,
      reset_revision: 0,
    },
    gpsConfigured: true,
    batteryConfigured: true,
    checkpointPhase: "idle",
    ...overrides,
  };
}

function primeActiveStore(): SetupWizardStore {
  const store = createSetupWizardStore();
  store.updateFromWorkspace(createSnapshot());
  return store;
}

function wizardChildrenSnippet(): Snippet<[WizardSlot]> {
  return createRawSnippet<[WizardSlot]>((getSlot) => ({
    render: () => `
      <div>
        <button type="button" data-action="advance">Snippet advance</button>
        <button type="button" data-action="skip">Snippet skip</button>
      </div>
    `,
    setup(element) {
      const advanceButton = element.querySelector<HTMLButtonElement>('[data-action="advance"]');
      const skipButton = element.querySelector<HTMLButtonElement>('[data-action="skip"]');

      if (!advanceButton || !skipButton) {
        throw new Error("Setup wizard test snippet failed to render expected controls.");
      }

      const handleAdvance = () => getSlot().advance();
      const handleSkip = () => getSlot().skip();

      advanceButton.addEventListener("click", handleAdvance);
      skipButton.addEventListener("click", handleSkip);

      return () => {
        advanceButton.removeEventListener("click", handleAdvance);
        skipButton.removeEventListener("click", handleSkip);
      };
    },
  }));
}

function renderWizardShell(
  options: {
    store?: SetupWizardStore;
    view?: SetupWorkspaceStoreState;
    onSelectSection?: (sectionId: string) => void;
    onClose?: () => void;
  } = {},
) {
  const store = options.store ?? primeActiveStore();
  const view = options.view ?? makeView();
  const onSelectSection = options.onSelectSection ?? vi.fn();
  const onClose = options.onClose ?? vi.fn();

  render(SetupWizardShell, {
    props: {
      store,
      view,
      onSelectSection,
      onClose,
      children: wizardChildrenSnippet(),
    },
  });

  return { store, view, onSelectSection, onClose };
}

function expectCurrentStep(stepId: string) {
  expect(screen.getByTestId(setupWorkspaceTestIds.wizardStepFrame).getAttribute("data-step")).toBe(
    stepId,
  );
}

function completeWizard(store: SetupWizardStore) {
  store.advance();
  store.advance();
  store.advance();
  store.advance();
  store.skip();
  store.skip();
  store.skip();
  store.skip();
  store.skip();
}

afterEach(() => {
  cleanup();
});

describe("SetupWizardShell", () => {
  it("starts from idle and opens the first required step", async () => {
    const { store } = renderWizardShell();

    expect(screen.getByTestId(setupWorkspaceTestIds.wizardStart)).toBeTruthy();
    expect(screen.queryByTestId(setupWorkspaceTestIds.wizardStepFrame)).toBeNull();

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStart));

    expect(screen.getByTestId(setupWorkspaceTestIds.wizardStepFrame)).toBeTruthy();
    expect(get(store).phase).toBe("active");
    expectCurrentStep("frame_orientation");
  });

  it("advances through the children snippet contract", async () => {
    renderWizardShell();

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStart));
    expectCurrentStep("frame_orientation");

    await fireEvent.click(screen.getByRole("button", { name: "Snippet advance" }));

    expectCurrentStep("calibration");
  });

  it("shows skip only on recommended steps", async () => {
    const { store } = renderWizardShell();

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStart));
    expect(screen.queryByTestId(setupWorkspaceTestIds.wizardStepSkip)).toBeNull();

    store.advance();
    store.advance();
    store.advance();
    store.advance();

    expect(get(store).currentStepId).toBe("gps");
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.wizardStepSkip)).toBeTruthy();
    });
  });

  it("detour opens the current expert section", async () => {
    const onSelectSection = vi.fn();
    const { store } = renderWizardShell({ onSelectSection });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStart));
    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStepDetour));

    expect(get(store).phase).toBe("paused_detour");
    expect(onSelectSection).toHaveBeenCalledWith("frame_orientation");
  });

  it("blocks advance and skip when the workspace is not ready", async () => {
    const view = makeView({
      checkpoint: {
        ...createIdleCheckpoint(),
        phase: "resume_pending",
        blocksActions: true,
      },
    });
    const { store } = renderWizardShell({ view });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStart));
    store.advance();
    store.advance();
    store.advance();
    store.advance();

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.wizardStepSkip)).toBeTruthy();
    });
    expect(screen.getByTestId(setupWorkspaceTestIds.wizardStepAdvance).hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId(setupWorkspaceTestIds.wizardStepSkip).hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId(setupWorkspaceTestIds.wizardStepDetour).hasAttribute("disabled")).toBe(false);
  });

  it("shows the checkpoint banner until resume completes", async () => {
    const { store } = renderWizardShell();
    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStart));

    store.updateFromWorkspace(createSnapshot({ checkpointPhase: "resume_pending" }));

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.wizardPausedCheckpoint)).toBeTruthy();
    });
    expect(screen.queryByTestId(setupWorkspaceTestIds.wizardStepFrame)).toBeNull();
    store.updateFromWorkspace(createSnapshot({ checkpointPhase: "resume_complete" }));
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.wizardStepFrame)).toBeTruthy();
    });
    expect(get(store).phase).toBe("active");
    expect(screen.queryByTestId(setupWorkspaceTestIds.wizardPausedCheckpoint)).toBeNull();
  });

  it("acknowledges the handoff and closes the shell", async () => {
    const onClose = vi.fn();
    const { store } = renderWizardShell({ onClose });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStart));
    completeWizard(store);

    expect(get(store).phase).toBe("complete");
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.wizardHandoff)).toBeTruthy();
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardHandoffAcknowledge));
    expect(get(store).phase).toBe("idle");
    expect(onClose).toHaveBeenCalled();
  });

  it("jumps from a handoff row back into the matching expert section", async () => {
    const onSelectSection = vi.fn();
    const onClose = vi.fn();
    const { store } = renderWizardShell({ onSelectSection, onClose });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStart));
    completeWizard(store);

    expect(get(store).phase).toBe("complete");
    await waitFor(() =>
      screen.getByTestId(setupWorkspaceTestIds.wizardHandoff),
    );

    const frameRow = screen.getByTestId(
      `${setupWorkspaceTestIds.wizardHandoffRowPrefix}-frame_orientation`,
    );
    await fireEvent.click(within(frameRow).getByRole("button", { name: "Jump to expert" }));

    expect(onSelectSection).toHaveBeenCalledWith("frame_orientation");
    expect(onClose).toHaveBeenCalled();
    const selectOrder = onSelectSection.mock.invocationCallOrder[0] ?? 0;
    const closeOrder = onClose.mock.invocationCallOrder[0] ?? 0;
    expect(selectOrder).toBeLessThan(closeOrder);
  });

  it("wires the header close button to onClose", async () => {
    const onClose = vi.fn();
    renderWizardShell({ onClose });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardClose));
    expect(onClose).toHaveBeenCalled();
  });
});
