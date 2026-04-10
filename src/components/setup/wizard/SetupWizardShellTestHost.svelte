<!-- Test-only wrapper for SetupWizardShell. -->
<script lang="ts">
import type { SetupWizardStore } from "../../../lib/stores/setup-wizard";
import type { SetupWorkspaceStoreState } from "../../../lib/stores/setup-workspace";
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
      <button data-testid="wizard-test-advance" onclick={advance} type="button">test-advance</button>
      <button data-testid="wizard-test-skip" onclick={skip} type="button">test-skip</button>
    </div>
  {/snippet}
</SetupWizardShell>
