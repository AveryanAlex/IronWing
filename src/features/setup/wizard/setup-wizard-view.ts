import type { WizardStoreState } from "../../../lib/stores/setup-wizard";

/**
 * Returns a user-facing label for the wizard phase. Kept separate from the
 * shell component so tests can pin the phrasing without rendering Svelte.
 */
export function phaseLabel(state: WizardStoreState): string {
  switch (state.phase) {
    case "idle":
      return "Not started";
    case "active":
      return "Active";
    case "paused_detour":
      return "Paused — detour";
    case "paused_checkpoint":
      return "Paused — reboot";
    case "paused_scope_change":
      return "Paused — new vehicle";
    case "complete":
      return "Complete";
  }
}

/**
 * Single-line progress summary rendered above the step list. Done counts
 * intentionally include both `done_by_wizard` and `done_by_detour` so detour
 * inference shows up immediately; recommended counts come straight from the
 * store's running total.
 */
export function progressSummary(state: WizardStoreState): string {
  const requiredDone = state.steps.filter(
    (step) =>
      step.tier === "required" &&
      (step.status === "done_by_wizard" || step.status === "done_by_detour"),
  ).length;
  const requiredTotal = state.steps.filter((step) => step.tier === "required").length;
  return `${requiredDone} of ${requiredTotal} required, ${state.recommendedRemaining} recommended remaining`;
}
