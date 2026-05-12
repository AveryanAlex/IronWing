import { get } from "svelte/store";
import { describe, expect, it } from "vitest";

import type { SectionStatus, SetupSectionId } from "../setup-sections";
import { SECTION_IDS } from "../setup-sections";
import {
  createSetupWizardStore,
  type WorkspaceSnapshot,
} from "./setup-wizard";

function createFakeStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> & {
  dump(): Record<string, string>;
} {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    dump: () => Object.fromEntries(map.entries()),
  };
}

function createEmptySectionStatuses(): Record<SetupSectionId, SectionStatus> {
  const record = {} as Record<SetupSectionId, SectionStatus>;
  for (const id of SECTION_IDS) {
    record[id] = "unknown";
  }
  return record;
}

function createSnapshot(
  overrides: Partial<WorkspaceSnapshot> = {},
): WorkspaceSnapshot {
  return {
    sectionStatuses: createEmptySectionStatuses(),
    activeEnvelope: {
      session_id: "session-1",
      source_kind: "live",
      seek_epoch: 0,
      reset_revision: 0,
    },
    gpsConfigured: null,
    batteryConfigured: null,
    checkpointPhase: "idle",
    ...overrides,
  };
}

describe("createSetupWizardStore — initial state", () => {
  it("starts idle with no current step and no steps", () => {
    const store = createSetupWizardStore();
    const state = get(store);
    expect(state.phase).toBe("idle");
    expect(state.currentStepId).toBeNull();
    expect(state.steps).toEqual([]);
    expect(state.requiredRemaining).toBe(0);
    expect(state.recommendedRemaining).toBe(0);
    expect(state.handoffSummary).toBeNull();
  });

  it("start() is a no-op before any updateFromWorkspace", () => {
    const store = createSetupWizardStore();
    store.start();
    const state = get(store);
    expect(state.phase).toBe("idle");
    expect(state.currentStepId).toBeNull();
    expect(state.steps).toEqual([]);
  });
});

describe("createSetupWizardStore — basic flow", () => {
  it("start() after updateFromWorkspace activates the first step", () => {
    const store = createSetupWizardStore();
    store.updateFromWorkspace(createSnapshot());
    store.start();

    const state = get(store);
    expect(state.phase).toBe("active");
    expect(state.currentStepId).toBe("frame_orientation");
    expect(state.steps[0].status).toBe("current");
    for (const step of state.steps.slice(1)) {
      expect(step.status).toBe("pending");
    }
    expect(state.requiredRemaining).toBe(4);
    expect(state.recommendedRemaining).toBe(5);
  });

  it("advance() marks the current step done_by_wizard and moves forward", () => {
    const store = createSetupWizardStore();
    store.updateFromWorkspace(createSnapshot());
    store.start();
    store.advance();

    const state = get(store);
    expect(state.phase).toBe("active");
    expect(state.currentStepId).toBe("calibration");
    const frame = state.steps.find((step) => step.id === "frame_orientation");
    const calibration = state.steps.find((step) => step.id === "calibration");
    expect(frame?.status).toBe("done_by_wizard");
    expect(calibration?.status).toBe("current");
    expect(state.requiredRemaining).toBe(3);
    expect(state.recommendedRemaining).toBe(5);
  });

  it("skip() on a required step is a no-op", () => {
    const store = createSetupWizardStore();
    store.updateFromWorkspace(createSnapshot());
    store.start();
    store.skip();

    const state = get(store);
    expect(state.phase).toBe("active");
    expect(state.currentStepId).toBe("frame_orientation");
    expect(state.steps[0].status).toBe("current");
    expect(state.requiredRemaining).toBe(4);
  });

  it("skip() on a recommended step marks it skipped and advances", () => {
    const store = createSetupWizardStore();
    store.updateFromWorkspace(createSnapshot());
    store.start();
    // Advance past all 4 required steps.
    store.advance();
    store.advance();
    store.advance();
    store.advance();

    let state = get(store);
    expect(state.currentStepId).toBe("gps");
    store.skip();
    state = get(store);
    const gps = state.steps.find((step) => step.id === "gps");
    expect(gps?.status).toBe("skipped");
    expect(state.currentStepId).toBe("battery_monitor");
  });

  it("advances through every step and completes with a handoff summary", () => {
    const store = createSetupWizardStore();
    store.updateFromWorkspace(createSnapshot());
    store.start();
    for (let i = 0; i < 9; i += 1) {
      store.advance();
    }

    const state = get(store);
    expect(state.phase).toBe("complete");
    expect(state.currentStepId).toBeNull();
    expect(state.handoffSummary).not.toBeNull();
    expect(state.handoffSummary?.configuredSteps.length).toBe(9);
    expect(state.handoffSummary?.skippedSteps).toEqual([]);
    expect(state.handoffSummary?.remainingRequired).toEqual([]);
  });

  it("completes with recommended steps skipped when the user skips each one", () => {
    const store = createSetupWizardStore();
    store.updateFromWorkspace(createSnapshot());
    store.start();
    // Advance all required steps.
    store.advance();
    store.advance();
    store.advance();
    store.advance();
    // Skip all recommended steps.
    store.skip();
    store.skip();
    store.skip();
    store.skip();
    store.skip();

    const state = get(store);
    expect(state.phase).toBe("complete");
    expect(state.handoffSummary?.configuredSteps.length).toBe(4);
    expect(state.handoffSummary?.skippedSteps.length).toBe(5);
    expect(state.handoffSummary?.remainingRequired).toEqual([]);
  });
});

describe("createSetupWizardStore — detour inference", () => {
  it("markStepComplete flips a pending step to done_by_detour without moving current", () => {
    const store = createSetupWizardStore();
    store.updateFromWorkspace(createSnapshot());
    store.start();
    store.markStepComplete("gps");

    const state = get(store);
    expect(state.currentStepId).toBe("frame_orientation");
    const gps = state.steps.find((step) => step.id === "gps");
    expect(gps?.status).toBe("done_by_detour");
  });

  it("pause('detour') records the current step's sectionId as resumeSectionId", () => {
    const store = createSetupWizardStore();
    store.updateFromWorkspace(createSnapshot());
    store.start();
    store.pause("detour");

    const state = get(store);
    expect(state.phase).toBe("paused_detour");
    expect(state.resumeSectionId).toBe("frame_orientation");
  });

  it("resume() after a detour auto-advances if the current step's section is complete", () => {
    const store = createSetupWizardStore();
    store.updateFromWorkspace(createSnapshot());
    store.start();
    store.pause("detour");

    const nextSnapshot = createSnapshot();
    nextSnapshot.sectionStatuses.frame_orientation = "complete";
    store.updateFromWorkspace(nextSnapshot);
    store.resume();

    const state = get(store);
    expect(state.phase).toBe("active");
    expect(state.currentStepId).toBe("calibration");
    const frame = state.steps.find((step) => step.id === "frame_orientation");
    expect(frame?.status).toBe("done_by_detour");
  });
});

describe("createSetupWizardStore — scope changes and checkpoints", () => {
  it("transitions to paused_scope_change when the family key changes", () => {
    const store = createSetupWizardStore();
    store.updateFromWorkspace(createSnapshot());
    store.start();

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

    const state = get(store);
    expect(state.phase).toBe("paused_scope_change");
  });

  it("resume() is a no-op while in paused_scope_change", () => {
    const store = createSetupWizardStore();
    store.updateFromWorkspace(createSnapshot());
    store.start();
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
    store.resume();

    const state = get(store);
    expect(state.phase).toBe("paused_scope_change");
  });

  it("restart() from paused_scope_change resets statuses and removes the old family blob", () => {
    const storage = createFakeStorage();
    const store = createSetupWizardStore({ storage });
    store.updateFromWorkspace(createSnapshot());
    store.start();
    const oldKey = "ironwing.setup_wizard.session-1:live:0";
    expect(storage.dump()[oldKey]).toBeDefined();

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
    store.restart();

    const state = get(store);
    expect(state.phase).toBe("idle");
    expect(state.currentStepId).toBeNull();
    for (const step of state.steps) {
      expect(step.status).toBe("pending");
    }
    expect(storage.dump()[oldKey]).toBeUndefined();
  });

  it("transitions to paused_checkpoint on checkpointPhase resume_pending", () => {
    const store = createSetupWizardStore();
    store.updateFromWorkspace(createSnapshot());
    store.start();
    store.updateFromWorkspace(
      createSnapshot({ checkpointPhase: "resume_pending" }),
    );

    const state = get(store);
    expect(state.phase).toBe("paused_checkpoint");
    expect(state.resumeSectionId).toBe("frame_orientation");
  });

  it("returns to active on checkpointPhase resume_complete without advancing", () => {
    const store = createSetupWizardStore();
    store.updateFromWorkspace(createSnapshot());
    store.start();
    store.updateFromWorkspace(
      createSnapshot({ checkpointPhase: "resume_pending" }),
    );
    store.updateFromWorkspace(
      createSnapshot({ checkpointPhase: "resume_complete" }),
    );

    const state = get(store);
    expect(state.phase).toBe("active");
    expect(state.currentStepId).toBe("frame_orientation");
  });
});

describe("createSetupWizardStore — fact-driven tier upgrade", () => {
  it("upgrades gps tier to required when facts say gpsConfigured is false", () => {
    const store = createSetupWizardStore();
    store.updateFromWorkspace(createSnapshot());
    store.start();

    const beforeState = get(store);
    expect(beforeState.requiredRemaining).toBe(4);

    store.updateFromWorkspace(createSnapshot({ gpsConfigured: false }));
    const state = get(store);
    const gps = state.steps.find((step) => step.id === "gps");
    expect(gps?.tier).toBe("required");
    expect(state.requiredRemaining).toBe(5);
  });
});

describe("createSetupWizardStore — persistence", () => {
  it("hydrates the second store from the same family key's persisted blob", () => {
    const storage = createFakeStorage();
    const first = createSetupWizardStore({ storage });
    first.updateFromWorkspace(createSnapshot());
    first.start();
    first.advance();

    const second = createSetupWizardStore({ storage });
    second.updateFromWorkspace(createSnapshot());

    const state = get(second);
    expect(state.phase).toBe("active");
    expect(state.currentStepId).toBe("calibration");
    const frame = state.steps.find((step) => step.id === "frame_orientation");
    expect(frame?.status).toBe("done_by_wizard");
  });

  it("does not hydrate when the new family key differs from the stored blob", () => {
    const storage = createFakeStorage();
    const first = createSetupWizardStore({ storage });
    first.updateFromWorkspace(createSnapshot());
    first.start();
    first.advance();

    const storedKey = "ironwing.setup_wizard.session-1:live:0";
    expect(storage.dump()[storedKey]).toBeDefined();

    const second = createSetupWizardStore({ storage });
    second.updateFromWorkspace(
      createSnapshot({
        activeEnvelope: {
          session_id: "session-2",
          source_kind: "live",
          seek_epoch: 0,
          reset_revision: 0,
        },
      }),
    );

    const state = get(second);
    expect(state.phase).toBe("idle");
    expect(state.currentStepId).toBeNull();
    expect(state.steps).toEqual([]);
    // The old blob is left intact for the original family key.
    expect(storage.dump()[storedKey]).toBeDefined();
  });

  it("restart() removes the blob for the current family and start() writes a fresh one", () => {
    const storage = createFakeStorage();
    const store = createSetupWizardStore({ storage });
    store.updateFromWorkspace(createSnapshot());
    store.start();
    store.advance();

    const key = "ironwing.setup_wizard.session-1:live:0";
    expect(storage.dump()[key]).toBeDefined();

    store.restart();
    expect(storage.dump()[key]).toBeUndefined();

    store.updateFromWorkspace(createSnapshot());
    store.start();
    const fresh = storage.dump()[key];
    expect(fresh).toBeDefined();
    const parsed = JSON.parse(fresh);
    expect(parsed.version).toBe(1);
    expect(parsed.familyKey).toBe("session-1:live:0");
    expect(parsed.phase).toBe("active");
    expect(parsed.currentStepId).toBe("frame_orientation");
  });
});
