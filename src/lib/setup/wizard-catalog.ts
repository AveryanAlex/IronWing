import type { SetupSectionId } from "../setup-sections";

export type WizardStepId =
  | "frame_orientation"
  | "calibration"
  | "rc_receiver"
  | "arming"
  | "gps"
  | "battery_monitor"
  | "failsafe"
  | "flight_modes"
  | "initial_params";

export type WizardStepTier = "required" | "recommended";

export type WizardStepDefinition = {
  id: WizardStepId;
  title: string;
  description: string;
  tier: WizardStepTier;
  sectionId: SetupSectionId;
  autoUpgradeWhen?: "gps_unconfigured" | "battery_unconfigured";
};

/**
 * Ordered beginner wizard step catalog.
 *
 * The order is: all required steps first in dependency-friendly order (frame,
 * calibration, RC, arming), then the recommended steps in the order most
 * beginners want to address them. Each step id is also the target setup
 * section id so detour inference can look up `sectionStatuses[step.sectionId]`
 * directly without a side table.
 */
export const WIZARD_STEP_CATALOG: ReadonlyArray<WizardStepDefinition> = [
  {
    id: "frame_orientation",
    title: "Frame & orientation",
    description: "Pick your airframe and confirm the board is mounted the way ArduPilot expects.",
    tier: "required",
    sectionId: "frame_orientation",
  },
  {
    id: "calibration",
    title: "Sensor calibration",
    description: "Calibrate the accelerometer and compass so the flight controller knows which way is up.",
    tier: "required",
    sectionId: "calibration",
  },
  {
    id: "rc_receiver",
    title: "RC receiver",
    description: "Bind your radio and make sure every channel moves in the expected direction.",
    tier: "required",
    sectionId: "rc_receiver",
  },
  {
    id: "arming",
    title: "Arming checks",
    description: "Clear any pre-arm blockers so the vehicle can arm safely on the first try.",
    tier: "required",
    sectionId: "arming",
  },
  {
    id: "gps",
    title: "GPS",
    description: "Pick the right GPS receiver type so autonomous modes have a reliable position fix.",
    tier: "recommended",
    sectionId: "gps",
    autoUpgradeWhen: "gps_unconfigured",
  },
  {
    id: "battery_monitor",
    title: "Battery monitor",
    description: "Configure the battery sensor so voltage and current readings match your pack.",
    tier: "recommended",
    sectionId: "battery_monitor",
    autoUpgradeWhen: "battery_unconfigured",
  },
  {
    id: "failsafe",
    title: "Failsafe",
    description: "Decide how the vehicle behaves when the radio link or battery drops out.",
    tier: "recommended",
    sectionId: "failsafe",
  },
  {
    id: "flight_modes",
    title: "Flight modes",
    description: "Assign beginner-friendly flight modes to your transmitter's mode switch.",
    tier: "recommended",
    sectionId: "flight_modes",
  },
  {
    id: "initial_params",
    title: "Initial parameters",
    description: "Apply a safe baseline of tuning parameters before the very first flight.",
    tier: "recommended",
    sectionId: "initial_params",
  },
];

export type WizardFactsView = {
  gpsConfigured: boolean | null;
  batteryConfigured: boolean | null;
};

/**
 * Returns the effective tier of a wizard step given the current configuration
 * facts. Steps only upgrade from recommended to required when their
 * autoUpgradeWhen rule matches and the relevant fact is explicitly `false`;
 * `null` (unknown) is treated as "no evidence" and does NOT upgrade.
 */
export function resolveStepTier(
  step: WizardStepDefinition,
  facts: WizardFactsView,
): WizardStepTier {
  if (step.autoUpgradeWhen === "gps_unconfigured" && facts.gpsConfigured === false) {
    return "required";
  }
  if (step.autoUpgradeWhen === "battery_unconfigured" && facts.batteryConfigured === false) {
    return "required";
  }
  return step.tier;
}

type WizardScopeEnvelope = {
  session_id: string;
  source_kind: string;
  seek_epoch: number;
  reset_revision: number;
};

/**
 * Returns the persistence-friendly "scope family" for a session envelope.
 *
 * A forward `reset_revision` bump inside the same (session, source, epoch)
 * triple counts as the same family, so the wizard auto-resumes across
 * reboots triggered by parameter writes. Differences in any of the three
 * included fields produce a distinct family and require the user to
 * explicitly restart the wizard.
 */
export function scopeFamilyKey(envelope: WizardScopeEnvelope | null): string | null {
  if (!envelope) {
    return null;
  }
  return `${envelope.session_id}:${envelope.source_kind}:${envelope.seek_epoch}`;
}
