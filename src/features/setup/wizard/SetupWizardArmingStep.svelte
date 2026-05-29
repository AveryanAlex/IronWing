<script lang="ts">
import { requestPrearmChecks } from "../../../calibration";
import type { SetupWorkspaceStoreState } from "../../../lib/stores/setup-workspace";
import { Card, EmptyState, Eyebrow, HelperText } from "../../../components/ui";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";
import SetupWizardActions from "../shared/SetupWizardActions.svelte";
import SetupWizardApplyError from "../shared/SetupWizardApplyError.svelte";

let {
  view,
  onAdvance,
}: {
  view: SetupWorkspaceStoreState;
  onAdvance: () => void;
} = $props();

let requestPending = $state(false);
let commandError = $state<string | null>(null);

let armingStatus = $derived(view.sectionStatuses.arming);
let armingStatusText = $derived(formatStatusText(armingStatus));
let continueDisabled = $derived(
  armingStatus !== "complete" || view.checkpoint.blocksActions,
);

// Surface the most recent pre-arm status-text notices as beginner-focused blockers.
let blockerNotices = $derived(view.statusNotices);

function formatStatusText(status: typeof armingStatus): string {
  switch (status) {
    case "complete":
      return "Pre-arm checks are passing.";
    case "in_progress":
      return "Pre-arm checks are still resolving. Wait for the next scoped update.";
    case "failed":
      return "Pre-arm checks are failing. Review blockers before continuing.";
    case "not_started":
      return "Pre-arm checks have not been requested yet.";
    case "unknown":
    default:
      return "Pre-arm status is unknown.";
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function handleRefresh() {
  if (requestPending) {
    return;
  }

  commandError = null;
  requestPending = true;
  try {
    await requestPrearmChecks();
  } catch (error) {
    commandError = `Pre-arm check request failed: ${formatError(error)}`;
  } finally {
    requestPending = false;
  }
}

function handleContinue() {
  if (continueDisabled) {
    return;
  }

  onAdvance();
}
</script>

<div class="space-y-4">
  <HelperText>
    Request fresh pre-arm checks from the vehicle and clear any blockers before moving on. We only
    advance once the arming section reports complete.
  </HelperText>

  <Card.Root surface="primary" density="compact">
    <Eyebrow tracking="widest">Arming readiness</Eyebrow>
    <p class="mt-2 text-sm font-semibold text-text-primary">{armingStatusText}</p>
    <Eyebrow class="mt-1" tracking="widest">status · {armingStatus}</Eyebrow>
  </Card.Root>

  <Card.Root surface="primary" density="compact" testId={setupWorkspaceTestIds.wizardStepArmingBlockers}>
    <Eyebrow tracking="widest">Recent status text</Eyebrow>
    {#if blockerNotices.length === 0}
      <EmptyState class="mt-2" title="No recent notices" description="No recent status-text notices. Request pre-arm checks to refresh the blocker list." />
    {:else}
      <ul class="mt-2 space-y-1 text-sm text-text-secondary">
        {#each blockerNotices as notice (notice.id)}
          <li>
            <Card.Root surface="secondary" density="compact">
              {notice.text}
            </Card.Root>
          </li>
        {/each}
      </ul>
    {/if}
  </Card.Root>

  <SetupWizardApplyError message={commandError} prefix="" />

  <SetupWizardActions
    primaryLabel="Continue"
    primaryDisabled={continueDisabled}
    primaryTestId={setupWorkspaceTestIds.wizardStepArmingContinue}
    onPrimary={handleContinue}
    secondaryLabel="Refresh prearm checks"
    secondaryPendingLabel="Requesting…"
    secondaryPending={requestPending}
    secondaryDisabled={view.checkpoint.blocksActions}
    secondaryTestId={setupWorkspaceTestIds.wizardStepArmingRefresh}
    secondaryPosition="before"
    onSecondary={handleRefresh}
  />
</div>
