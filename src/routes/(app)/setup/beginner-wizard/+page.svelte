<script lang="ts">
import { fromStore } from "svelte/store";
import type { SetupWizardStore } from "../../../../lib/stores/setup-wizard";
import type { SetupWorkspaceStoreState } from "../../../../lib/stores/setup-workspace";
import SetupWizardArmingStep from "../../../../features/setup/wizard/SetupWizardArmingStep.svelte";
import SetupWizardBatteryStep from "../../../../features/setup/wizard/SetupWizardBatteryStep.svelte";
import SetupWizardCalibrationStep from "../../../../features/setup/wizard/SetupWizardCalibrationStep.svelte";
import SetupWizardFailsafeStep from "../../../../features/setup/wizard/SetupWizardFailsafeStep.svelte";
import SetupWizardFlightModesStep from "../../../../features/setup/wizard/SetupWizardFlightModesStep.svelte";
import SetupWizardFrameStep from "../../../../features/setup/wizard/SetupWizardFrameStep.svelte";
import SetupWizardNavigationStep from "../../../../features/setup/wizard/SetupWizardNavigationStep.svelte";
import SetupWizardInitialParamsStep from "../../../../features/setup/wizard/SetupWizardInitialParamsStep.svelte";
import SetupWizardRcStep from "../../../../features/setup/wizard/SetupWizardRcStep.svelte";
import SetupWizardShell from "../../../../features/setup/wizard/SetupWizardShell.svelte";
import { setupWorkspaceTestIds } from "../../../../features/setup/setup-workspace-test-ids";
import SetupContentPanel from "../../../../features/setup/shared/SetupContentPanel.svelte";
import SetupIntroCard from "../../../../features/setup/shared/SetupIntroCard.svelte";
import { getSetupWorkspaceRouteContext } from "../../../../features/setup/components/setup-workspace-route-context";

const route = getSetupWorkspaceRouteContext();
const viewStore = fromStore(route.viewStore);

let view = $derived(viewStore.current);
const wizardStore = route.wizardStore;
const onSelectSection = route.selectSection;

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
        {:else if step.id === "navigation"}
          <SetupWizardNavigationStep {view} onAdvance={advance} />
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
