// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { get } from "svelte/store";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SectionStatus, SetupSectionId } from "../../../lib/setup-sections";
import { SECTION_IDS } from "../../../lib/setup-sections";
import {
  createSetupWizardStore,
  type SetupWizardStore,
  type WorkspaceSnapshot,
} from "../../../lib/stores/setup-wizard";
import type {
  SetupWorkspaceCheckpointState,
  SetupWorkspaceStoreState,
} from "../../../lib/stores/setup-workspace";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";
import SetupWizardShellTestHost from "./SetupWizardShellTestHost.svelte";

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
    canOpenFullParameters: true,
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

afterEach(() => {
  cleanup();
});

describe("SetupWizardShell", () => {
  it("phase idle shows the start button and activates the wizard when clicked", async () => {
    const store = primeActiveStore();
    const view = makeView();

    render(SetupWizardShellTestHost, { store, view });

    expect(screen.getByTestId(setupWorkspaceTestIds.wizardStart)).toBeTruthy();
    expect(screen.queryByTestId(setupWorkspaceTestIds.wizardStepFrame)).toBeNull();

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStart));

    expect(screen.getByTestId(setupWorkspaceTestIds.wizardStepFrame)).toBeTruthy();
    expect(get(store).phase).toBe("active");
  });

  it("active phase renders 'Active' in the phase pill", async () => {
    const store = primeActiveStore();
    render(SetupWizardShellTestHost, { store, view: makeView() });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStart));

    expect(screen.getByTestId(setupWorkspaceTestIds.wizardPhase).textContent?.trim()).toBe("Active");
  });

  it("renders a fresh progress summary after start", async () => {
    const store = primeActiveStore();
    render(SetupWizardShellTestHost, { store, view: makeView() });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStart));

    expect(screen.getByTestId(setupWorkspaceTestIds.wizardProgress).textContent?.trim()).toBe(
      "0 of 4 required, 5 recommended remaining",
    );
  });

  it("renders all nine step items with tier and status attributes", async () => {
    const store = primeActiveStore();
    const { container } = render(SetupWizardShellTestHost, { store, view: makeView() });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStart));

    const items = container.querySelectorAll(
      `[data-testid^="${setupWorkspaceTestIds.wizardStepItemPrefix}-"]`,
    );
    expect(items.length).toBe(9);
    for (const item of Array.from(items)) {
      expect(item.getAttribute("data-status")).toBeTruthy();
      expect(item.getAttribute("data-tier")).toBeTruthy();
    }
  });

  it("clicking the snippet's test-advance button advances the store", async () => {
    const store = primeActiveStore();
    render(SetupWizardShellTestHost, { store, view: makeView() });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStart));
    expect(screen.getByTestId("wizard-test-step").textContent).toBe("frame_orientation");

    await fireEvent.click(screen.getByTestId("wizard-test-advance"));

    expect(screen.getByTestId("wizard-test-step").textContent).toBe("calibration");
  });

  it("omits the skip button on required steps and renders it for the first recommended step", async () => {
    const store = primeActiveStore();
    render(SetupWizardShellTestHost, { store, view: makeView() });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStart));
    expect(screen.queryByTestId(setupWorkspaceTestIds.wizardStepSkip)).toBeNull();

    // Advance past all four required steps.
    store.advance();
    store.advance();
    store.advance();
    store.advance();

    expect(get(store).currentStepId).toBe("gps");
    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.wizardStepSkip)).toBeTruthy();
    });
  });

  it("clicking the detour button pauses the store and calls onSelectSection with the step's sectionId", async () => {
    const store = primeActiveStore();
    const onSelectSection = vi.fn();
    render(SetupWizardShellTestHost, { store, view: makeView(), onSelectSection });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStart));
    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStepDetour));

    expect(get(store).phase).toBe("paused_detour");
    expect(onSelectSection).toHaveBeenCalledWith("frame_orientation");
  });

  it("disables advance and skip when the view blocks actions but leaves detour enabled", async () => {
    const store = primeActiveStore();
    const view = makeView({
      checkpoint: {
        ...createIdleCheckpoint(),
        phase: "resume_pending",
        blocksActions: true,
      },
    });
    render(SetupWizardShellTestHost, { store, view });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStart));
    // Advance past required steps so the skip button renders for gps.
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

  it("phase paused_checkpoint renders the reboot banner and hides the step frame", async () => {
    const store = primeActiveStore();
    render(SetupWizardShellTestHost, { store, view: makeView() });
    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStart));

    store.updateFromWorkspace(createSnapshot({ checkpointPhase: "resume_pending" }));

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.wizardPausedCheckpoint)).toBeTruthy();
    });
    expect(screen.queryByTestId(setupWorkspaceTestIds.wizardStepFrame)).toBeNull();
    expect(screen.queryByTestId(setupWorkspaceTestIds.wizardResume)).toBeNull();
  });

  it("phase paused_detour renders the detour banner and the resume button calls store.resume()", async () => {
    const store = primeActiveStore();
    render(SetupWizardShellTestHost, { store, view: makeView() });
    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStart));

    store.pause("detour");

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.wizardPausedDetour)).toBeTruthy();
    });
    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardResume));
    expect(get(store).phase).toBe("active");
  });

  it("phase paused_scope_change renders the restart button that wipes progress", async () => {
    const store = primeActiveStore();
    render(SetupWizardShellTestHost, { store, view: makeView() });
    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStart));

    store.updateFromWorkspace(
      createSnapshot({
        activeEnvelope: {
          session_id: "session-2",
          source_kind: "live",
          seek_epoch: 0,
          reset_revision: 0,
        },
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.wizardPausedScope)).toBeTruthy();
    });
    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardRestart));
    expect(get(store).phase).toBe("idle");
  });

  it("phase complete renders the handoff summary and acknowledge closes", async () => {
    const store = primeActiveStore();
    const onClose = vi.fn();
    render(SetupWizardShellTestHost, { store, view: makeView(), onClose });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStart));
    store.advance();
    store.advance();
    store.advance();
    store.advance();
    store.skip();
    store.skip();
    store.skip();
    store.skip();
    store.skip();

    expect(get(store).phase).toBe("complete");
    const handoff = await waitFor(() => screen.getByTestId(setupWorkspaceTestIds.wizardHandoff));

    const handoffRows = handoff.querySelectorAll(
      `[data-testid^="${setupWorkspaceTestIds.wizardHandoffRowPrefix}-"]`,
    );
    expect(handoffRows.length).toBe(9);

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardHandoffAcknowledge));
    expect(get(store).phase).toBe("idle");
    expect(onClose).toHaveBeenCalled();
  });

  it("the header close button invokes the onClose prop", async () => {
    const store = primeActiveStore();
    const onClose = vi.fn();
    render(SetupWizardShellTestHost, { store, view: makeView(), onClose });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardClose));
    expect(onClose).toHaveBeenCalled();
  });

  it("scope-change restart wipes the persisted blob for the previous family", async () => {
    const storage = createMemoryStorage();
    const store = createSetupWizardStore({ storage });
    store.updateFromWorkspace(createSnapshot());
    render(SetupWizardShellTestHost, { store, view: makeView() });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStart));
    const oldFamilyKey = get(store).scopeFamilyKey;
    expect(oldFamilyKey).toBe("session-1:live:0");
    expect(storage.data.get("mpng_setup_wizard_session-1:live:0")).toBeTruthy();

    store.updateFromWorkspace(
      createSnapshot({
        activeEnvelope: {
          session_id: "session-2",
          source_kind: "live",
          seek_epoch: 0,
          reset_revision: 0,
        },
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId(setupWorkspaceTestIds.wizardPausedScope)).toBeTruthy();
    });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardRestart));

    expect(get(store).phase).toBe("idle");
    expect(storage.data.has("mpng_setup_wizard_session-1:live:0")).toBe(false);
  });

  it("checkpoint pause transitions back to active when the workspace reports resume_complete", async () => {
    const store = primeActiveStore();
    render(SetupWizardShellTestHost, { store, view: makeView() });

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

  it("paused_detour banner names the current step in the resume hint", async () => {
    const store = primeActiveStore();
    render(SetupWizardShellTestHost, { store, view: makeView() });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStart));
    store.pause("detour");

    const banner = await waitFor(() =>
      screen.getByTestId(setupWorkspaceTestIds.wizardPausedDetour),
    );
    expect(banner.textContent).toContain("Frame & orientation");
    expect(banner.textContent).toContain("Resume");
  });

  it("handoff summary lists configured, skipped, and still-required steps with titles", async () => {
    const store = primeActiveStore();
    render(SetupWizardShellTestHost, { store, view: makeView() });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStart));

    // Mix of statuses:
    // - frame_orientation advances via wizard (done_by_wizard)
    // - calibration completes out-of-band (done_by_detour)
    // - rc_receiver advances via wizard (done_by_wizard)
    // - arming advances via wizard (done_by_wizard)
    // - gps (recommended) skipped
    // - battery_monitor advances (done_by_wizard)
    // - failsafe skipped
    // - flight_modes skipped
    // - initial_params skipped
    store.markStepComplete("calibration");
    store.advance(); // frame_orientation -> done_by_wizard, advances past calibration (already done_by_detour)
    // After advance, the next pending step is rc_receiver (calibration was not pending).
    store.advance(); // rc_receiver -> done_by_wizard
    store.advance(); // arming -> done_by_wizard
    store.skip(); // gps -> skipped
    store.advance(); // battery_monitor -> done_by_wizard
    store.skip(); // failsafe -> skipped
    store.skip(); // flight_modes -> skipped
    store.skip(); // initial_params -> skipped

    expect(get(store).phase).toBe("complete");
    const handoff = await waitFor(() => screen.getByTestId(setupWorkspaceTestIds.wizardHandoff));

    // Text from all three sub-lists; assertions below target individual rows.
    const handoffText = handoff.textContent ?? "";
    expect(handoffText).toContain("Frame & orientation");
    expect(handoffText).toContain("Sensor calibration");
    expect(handoffText).toContain("RC receiver");
    expect(handoffText).toContain("Arming checks");
    expect(handoffText).toContain("Battery monitor");
    expect(handoffText).toContain("GPS");
    expect(handoffText).toContain("Failsafe");
    expect(handoffText).toContain("Flight modes");
    expect(handoffText).toContain("Initial parameters");

    // Each row has a matching title span with a known test id.
    const frameTitle = screen.getByTestId(
      `${setupWorkspaceTestIds.wizardStepTitlePrefix}-frame_orientation`,
    );
    expect(frameTitle.textContent?.trim()).toBe("Frame & orientation");
    const calTitle = screen.getByTestId(
      `${setupWorkspaceTestIds.wizardStepTitlePrefix}-calibration`,
    );
    expect(calTitle.textContent?.trim()).toBe("Sensor calibration");
    const gpsTitle = screen.getByTestId(
      `${setupWorkspaceTestIds.wizardStepTitlePrefix}-gps`,
    );
    expect(gpsTitle.textContent?.trim()).toBe("GPS");
  });

  it("handoff jump button calls onSelectSection and onClose for the clicked step", async () => {
    const store = primeActiveStore();
    const onSelectSection = vi.fn();
    const onClose = vi.fn();
    render(SetupWizardShellTestHost, { store, view: makeView(), onSelectSection, onClose });

    await fireEvent.click(screen.getByTestId(setupWorkspaceTestIds.wizardStart));
    store.advance();
    store.advance();
    store.advance();
    store.advance();
    store.skip();
    store.skip();
    store.skip();
    store.skip();
    store.skip();

    expect(get(store).phase).toBe("complete");
    await waitFor(() =>
      screen.getByTestId(setupWorkspaceTestIds.wizardHandoff),
    );

    await fireEvent.click(
      screen.getByTestId(
        `${setupWorkspaceTestIds.wizardHandoffJumpPrefix}-frame_orientation`,
      ),
    );

    expect(onSelectSection).toHaveBeenCalledWith("frame_orientation");
    expect(onClose).toHaveBeenCalled();
    const selectOrder = onSelectSection.mock.invocationCallOrder[0] ?? 0;
    const closeOrder = onClose.mock.invocationCallOrder[0] ?? 0;
    expect(selectOrder).toBeLessThan(closeOrder);
  });
});

function createMemoryStorage(): {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  data: Map<string, string>;
} {
  const data = new Map<string, string>();
  return {
    data,
    getItem(key) {
      return data.has(key) ? data.get(key)! : null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}
