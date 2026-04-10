<script lang="ts">
import { requestPrearmChecks } from "../../../calibration";
import type { SetupWorkspaceStoreState } from "../../../lib/stores/setup-workspace";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";

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
  <p class="text-sm text-text-secondary">
    Request fresh pre-arm checks from the vehicle and clear any blockers before moving on. We only
    advance once the arming section reports complete.
  </p>

  <div class="rounded-2xl border border-border bg-bg-primary/80 p-4">
    <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Arming readiness</p>
    <p class="mt-2 text-sm font-semibold text-text-primary">{armingStatusText}</p>
    <p class="mt-1 text-[11px] uppercase tracking-[0.16em] text-text-muted">status · {armingStatus}</p>
  </div>

  <div
    class="rounded-2xl border border-border bg-bg-primary/60 p-4"
    data-testid={setupWorkspaceTestIds.wizardStepArmingBlockers}
  >
    <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Recent status text</p>
    {#if blockerNotices.length === 0}
      <p class="mt-2 text-sm text-text-secondary">
        No recent status-text notices. Request pre-arm checks to refresh the blocker list.
      </p>
    {:else}
      <ul class="mt-2 space-y-1 text-sm text-text-secondary">
        {#each blockerNotices as notice (notice.id)}
          <li class="rounded-xl border border-border bg-bg-secondary/60 px-3 py-2">
            {notice.text}
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  {#if commandError}
    <div class="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
      {commandError}
    </div>
  {/if}

  <div class="flex flex-wrap gap-2">
    <button
      class="rounded-full border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={setupWorkspaceTestIds.wizardStepArmingRefresh}
      disabled={view.checkpoint.blocksActions || requestPending}
      onclick={handleRefresh}
      type="button"
    >
      {requestPending ? "Requesting…" : "Refresh prearm checks"}
    </button>
    <button
      class="rounded-full border border-accent bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:border-border disabled:bg-bg-primary disabled:text-text-muted"
      data-testid={setupWorkspaceTestIds.wizardStepArmingContinue}
      disabled={continueDisabled}
      onclick={handleContinue}
      type="button"
    >
      Continue
    </button>
  </div>
</div>
