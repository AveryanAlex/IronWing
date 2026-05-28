import { get } from "svelte/store";
import { describe, expect, it } from "vitest";

import type { SectionStatus, SetupSectionId } from "../../../lib/setup-sections";
import { SECTION_IDS } from "../../../lib/setup-sections";
import {
  createSetupWizardStore,
  type WorkspaceSnapshot,
  type WizardStoreState,
} from "../../../lib/stores/setup-wizard";
import { phaseLabel, progressSummary } from "./setup-wizard-view";

function createSectionStatuses(): Record<SetupSectionId, SectionStatus> {
  const record = {} as Record<SetupSectionId, SectionStatus>;
  for (const id of SECTION_IDS) {
    record[id] = "unknown";
  }
  return record;
}

function createSnapshot(): WorkspaceSnapshot {
  return {
    sectionStatuses: createSectionStatuses(),
    activeEnvelope: {
      session_id: "session-1",
      source_kind: "live",
      seek_epoch: 0,
      reset_revision: 0,
    },
    gpsConfigured: null,
    batteryConfigured: null,
    checkpointPhase: "idle",
  };
}

describe("phaseLabel", () => {
  const cases: Array<{ phase: WizardStoreState["phase"]; label: string }> = [
    { phase: "idle", label: "Not started" },
    { phase: "active", label: "Active" },
    { phase: "paused_detour", label: "Paused — detour" },
    { phase: "paused_checkpoint", label: "Paused — reboot" },
    { phase: "paused_scope_change", label: "Paused — new vehicle" },
    { phase: "complete", label: "Complete" },
  ];

  for (const { phase, label } of cases) {
    it(`returns "${label}" for phase "${phase}"`, () => {
      const state = { phase } as WizardStoreState;
      expect(phaseLabel(state)).toBe(label);
    });
  }
});

describe("progressSummary", () => {
  it("reports freshly started wizard as zero required done", () => {
    const store = createSetupWizardStore();
    store.updateFromWorkspace(createSnapshot());
    store.start();

    expect(progressSummary(get(store))).toBe("0 of 4 required, 5 recommended remaining");
  });

  it("counts one required done after the first advance", () => {
    const store = createSetupWizardStore();
    store.updateFromWorkspace(createSnapshot());
    store.start();
    store.advance();

    expect(progressSummary(get(store))).toBe("1 of 4 required, 5 recommended remaining");
  });

  it("reports all required done and no recommended remaining when everything is complete", () => {
    const store = createSetupWizardStore();
    store.updateFromWorkspace(createSnapshot());
    store.start();
    for (let i = 0; i < 9; i += 1) {
      store.advance();
    }

    expect(progressSummary(get(store))).toBe("4 of 4 required, 0 recommended remaining");
  });
});
