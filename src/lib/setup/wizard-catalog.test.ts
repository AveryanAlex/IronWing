import { describe, expect, it } from "vitest";

import type { SetupSectionId } from "../setup-sections";
import { SECTION_IDS } from "../setup-sections";
import {
  WIZARD_STEP_CATALOG,
  resolveStepTier,
  scopeFamilyKey,
  wizardSectionStatusFromPhase,
  type WizardStepDefinition,
  type WizardStepId,
} from "./wizard-catalog";

function stepById(id: WizardStepId): WizardStepDefinition {
  const found = WIZARD_STEP_CATALOG.find((step) => step.id === id);
  if (!found) {
    throw new Error(`step ${id} not found in catalog`);
  }
  return found;
}

describe("WIZARD_STEP_CATALOG", () => {
  it("contains exactly 9 steps in the declared order, each mapped to a real SetupSectionId", () => {
    const expectedOrder: WizardStepId[] = [
      "frame_orientation",
      "calibration",
      "rc_receiver",
      "arming",
      "navigation",
      "battery_monitor",
      "failsafe",
      "flight_modes",
      "initial_params",
    ];

    expect(WIZARD_STEP_CATALOG.length).toBe(9);
    expect(WIZARD_STEP_CATALOG.map((step) => step.id)).toEqual(expectedOrder);

    const knownSectionIds = new Set<SetupSectionId>(SECTION_IDS);
    for (const step of WIZARD_STEP_CATALOG) {
      expect(knownSectionIds.has(step.sectionId)).toBe(true);
      expect(step.sectionId).toBe(step.id);
    }
  });

  it("required steps are exactly frame_orientation, calibration, rc_receiver, arming", () => {
    const required = WIZARD_STEP_CATALOG.filter((step) => step.tier === "required").map(
      (step) => step.id,
    );
    expect(required).toEqual(["frame_orientation", "calibration", "rc_receiver", "arming"]);
  });

  it("recommended steps include navigation, battery_monitor, failsafe, flight_modes, initial_params", () => {
    const recommended = WIZARD_STEP_CATALOG.filter((step) => step.tier === "recommended").map(
      (step) => step.id,
    );
    expect(recommended).toEqual([
      "navigation",
      "battery_monitor",
      "failsafe",
      "flight_modes",
      "initial_params",
    ]);
  });
});

describe("resolveStepTier", () => {
  it("upgrades navigation to required when navigationConfigured is false", () => {
    const tier = resolveStepTier(stepById("navigation"), {
      navigationConfigured: false,
      batteryConfigured: true,
    });
    expect(tier).toBe("required");
  });

  it("keeps navigation as recommended when navigationConfigured is true", () => {
    const tier = resolveStepTier(stepById("navigation"), {
      navigationConfigured: true,
      batteryConfigured: true,
    });
    expect(tier).toBe("recommended");
  });

  it("keeps navigation as recommended when navigationConfigured is unknown (null)", () => {
    const tier = resolveStepTier(stepById("navigation"), {
      navigationConfigured: null,
      batteryConfigured: null,
    });
    expect(tier).toBe("recommended");
  });

  it("upgrades battery_monitor to required when batteryConfigured is false", () => {
    const tier = resolveStepTier(stepById("battery_monitor"), {
      navigationConfigured: true,
      batteryConfigured: false,
    });
    expect(tier).toBe("required");
  });

  it("always returns recommended for failsafe regardless of facts", () => {
    expect(
      resolveStepTier(stepById("failsafe"), { navigationConfigured: false, batteryConfigured: false }),
    ).toBe("recommended");
    expect(
      resolveStepTier(stepById("failsafe"), { navigationConfigured: true, batteryConfigured: true }),
    ).toBe("recommended");
    expect(
      resolveStepTier(stepById("failsafe"), { navigationConfigured: null, batteryConfigured: null }),
    ).toBe("recommended");
  });
});

describe("wizardSectionStatusFromPhase", () => {
  it("returns not_started when the phase is null", () => {
    expect(wizardSectionStatusFromPhase(null)).toBe("not_started");
  });

  it("returns not_started when the phase is undefined", () => {
    expect(wizardSectionStatusFromPhase(undefined)).toBe("not_started");
  });

  it("returns not_started when the wizard phase is idle", () => {
    expect(wizardSectionStatusFromPhase("idle")).toBe("not_started");
  });

  it("returns in_progress when the wizard phase is active", () => {
    expect(wizardSectionStatusFromPhase("active")).toBe("in_progress");
  });

  it("returns in_progress when the wizard phase is paused_detour", () => {
    expect(wizardSectionStatusFromPhase("paused_detour")).toBe("in_progress");
  });

  it("returns in_progress when the wizard phase is paused_checkpoint", () => {
    expect(wizardSectionStatusFromPhase("paused_checkpoint")).toBe("in_progress");
  });

  it("returns in_progress when the wizard phase is paused_scope_change", () => {
    expect(wizardSectionStatusFromPhase("paused_scope_change")).toBe("in_progress");
  });

  it("returns complete when the wizard phase is complete", () => {
    expect(wizardSectionStatusFromPhase("complete")).toBe("complete");
  });
});

describe("scopeFamilyKey", () => {
  it("returns null when the envelope is null", () => {
    expect(scopeFamilyKey(null)).toBeNull();
  });

  it("joins session_id, source_kind, and seek_epoch (excluding reset_revision)", () => {
    const key = scopeFamilyKey({
      session_id: "abc",
      source_kind: "live",
      seek_epoch: 0,
      reset_revision: 5,
    });
    expect(key).toBe("abc:live:0");
  });
});
