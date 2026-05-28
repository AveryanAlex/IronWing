<script lang="ts">
import type { SetupWizardStore } from "../../../lib/stores/setup-wizard";
import type { SetupWorkspaceStoreState } from "../../../lib/stores/setup-workspace";
import SetupWizardArmingStep from "../wizard/SetupWizardArmingStep.svelte";
import SetupWizardBatteryStep from "../wizard/SetupWizardBatteryStep.svelte";
import SetupWizardCalibrationStep from "../wizard/SetupWizardCalibrationStep.svelte";
import SetupWizardFailsafeStep from "../wizard/SetupWizardFailsafeStep.svelte";
import SetupWizardFlightModesStep from "../wizard/SetupWizardFlightModesStep.svelte";
import SetupWizardFrameStep from "../wizard/SetupWizardFrameStep.svelte";
import SetupWizardGpsStep from "../wizard/SetupWizardGpsStep.svelte";
import SetupWizardInitialParamsStep from "../wizard/SetupWizardInitialParamsStep.svelte";
import SetupWizardRcStep from "../wizard/SetupWizardRcStep.svelte";
import SetupWizardShell from "../wizard/SetupWizardShell.svelte";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";
import SetupContentPanel from "../shared/SetupContentPanel.svelte";
import SetupIntroCard from "../shared/SetupIntroCard.svelte";

let {
  view,
  wizardStore,
  onSelectSection,
}: {
  view: SetupWorkspaceStoreState;
  wizardStore: SetupWizardStore;
  onSelectSection: (sectionId: string) => void;
} = $props();

// Closing the wizard from its header simply routes back to the overview
// section; the workspace store owns the actual navigation so nav-rail
// listeners see a normal section change.
function handleClose() {
  onSelectSection("overview");
}
</script>

<section class="space-y-4" data-testid={setupWorkspaceTestIds.beginnerWizardSection}>
  <SetupIntroCard
    sectionId="beginner_wizard"
    title="Beginner Wizard"
    description="Follow a guided path through the critical setup steps. Expert sections stay available whenever you need to inspect or adjust details directly."
  />

  <SetupContentPanel>
  <SetupWizardShell
    store={wizardStore}
    {view}
    onSelectSection={(sectionId) => onSelectSection(sectionId)}
    onClose={handleClose}
  >
    {#snippet children({ step, advance })}
      <div data-testid={`${setupWorkspaceTestIds.wizardStepBodyPrefix}-${step.id}`}>
        {#if step.id === "frame_orientation"}
          <SetupWizardFrameStep {view} onAdvance={advance} />
        {:else if step.id === "calibration"}
          <SetupWizardCalibrationStep {view} onAdvance={advance} />
        {:else if step.id === "rc_receiver"}
          <SetupWizardRcStep {view} onAdvance={advance} />
        {:else if step.id === "arming"}
          <SetupWizardArmingStep {view} onAdvance={advance} />
        {:else if step.id === "gps"}
          <SetupWizardGpsStep {view} onAdvance={advance} />
        {:else if step.id === "battery_monitor"}
          <SetupWizardBatteryStep {view} onAdvance={advance} />
        {:else if step.id === "failsafe"}
          <SetupWizardFailsafeStep {view} onAdvance={advance} />
        {:else if step.id === "flight_modes"}
          <SetupWizardFlightModesStep {view} onAdvance={advance} />
        {:else if step.id === "initial_params"}
          <SetupWizardInitialParamsStep {view} onAdvance={advance} />
        {/if}
      </div>
    {/snippet}
  </SetupWizardShell>
  </SetupContentPanel>
</section>
