<!-- Test-only wrapper for SetupWizardShell. -->
<script lang="ts">
import type { SetupWizardStore } from "../../../lib/stores/setup-wizard";
import type { SetupWorkspaceStoreState } from "../../../lib/stores/setup-workspace";
import { Button } from "../../../components/ui";
import SetupWizardShell from "./SetupWizardShell.svelte";

let {
  store,
  view,
  onSelectSection = () => {},
  onClose = () => {},
}: {
  store: SetupWizardStore;
  view: SetupWorkspaceStoreState;
  onSelectSection?: (sectionId: string) => void;
  onClose?: () => void;
} = $props();
</script>

<SetupWizardShell {store} {view} {onSelectSection} {onClose}>
  {#snippet children({ step, advance, skip })}
    <div>
      <span data-testid="wizard-test-step">{step.id}</span>
      <Button testId="wizard-test-advance" onclick={advance}>test-advance</Button>
      <Button testId="wizard-test-skip" onclick={skip}>test-skip</Button>
    </div>
  {/snippet}
</SetupWizardShell>
