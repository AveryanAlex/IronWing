<script lang="ts">
import {
  calibrateCompassAccept,
  calibrateCompassCancel,
  calibrateCompassStart,
} from "../../calibration";
import { REPLAY_READONLY_COPY, REPLAY_READONLY_TITLE, isReplayReadonly } from "../../lib/replay-readonly";
import type { SetupWorkspaceStoreState, SetupWorkspaceCalibrationCard } from "../../lib/stores/setup-workspace";
import { Banner } from "../ui";
import SetupSectionShell from "./SetupSectionShell.svelte";
import { setupWorkspaceTestIds } from "./setup-workspace-test-ids";

let { view }: { view: SetupWorkspaceStoreState } = $props();

let actionError = $state<string | null>(null);
let pendingCardId = $state<SetupWorkspaceCalibrationCard["id"] | null>(null);
let replayReadonly = $derived(isReplayReadonly(view.activeSource));

async function runCompassAction(card: SetupWorkspaceCalibrationCard) {
  if (replayReadonly || card.id !== "compass" || card.actionAvailability !== "available" || !card.actionLabel) {
    return;
  }

  actionError = null;
  pendingCardId = card.id;

  try {
    if (card.lifecycle === "running") {
      await calibrateCompassCancel();
    } else if (card.lifecycle === "complete") {
      await calibrateCompassAccept();
    } else {
      await calibrateCompassStart();
    }
  } catch (error) {
    actionError = error instanceof Error ? error.message : String(error);
  } finally {
    pendingCardId = null;
  }
}

function cardTone(card: SetupWorkspaceCalibrationCard): string {
  switch (card.lifecycle) {
    case "complete":
      return "border-success/30 bg-success/10";
    case "running":
      return "border-accent/30 bg-accent/10";
    case "failed":
    case "unavailable":
      return "border-warning/40 bg-warning/10";
    case "not_started":
    default:
      return "border-border bg-bg-primary/80";
  }
}
</script>

<SetupSectionShell
  eyebrow="Calibration"
  title="Broad cards, honest lifecycle truth"
  description="Accelerometer, gyroscope, compass, and radio remain visible together, but this slice only treats the compass lifecycle as a fully actionable setup path."
  testId={setupWorkspaceTestIds.calibrationSection}
>
  {#snippet body()}
    <div class="setup-calibration-body">
      {#if actionError}
        <Banner severity="danger" title={actionError} />
      {/if}

      {#if replayReadonly}
        <Banner
          severity="warning"
          title={REPLAY_READONLY_TITLE}
          message={REPLAY_READONLY_COPY}
          testId={setupWorkspaceTestIds.calibrationReplayReadonly}
        />
      {/if}

      {#if view.statusNotices.length > 0}
        <div
          class="rounded-lg border border-border bg-bg-primary/80 p-3"
          data-testid={setupWorkspaceTestIds.calibrationNotices}
        >
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Lifecycle status text</p>
          <ul class="mt-3 space-y-2">
            {#each view.statusNotices as notice (notice.id)}
              <li class="rounded-xl border border-border bg-bg-secondary/70 px-3 py-2 text-sm text-text-secondary">
                {notice.text}
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      <div class="grid gap-3 xl:grid-cols-2">
        {#each view.calibrationSummary.cards as card (card.id)}
          <article
            class={`rounded-lg border p-3 ${cardTone(card)}`}
            data-testid={`${setupWorkspaceTestIds.calibrationCardPrefix}-${card.id}`}
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="text-sm font-semibold text-text-primary">{card.title}</p>
                <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={`${setupWorkspaceTestIds.calibrationStatusPrefix}-${card.id}`}>
                  {card.statusText}
                </p>
              </div>

              <span class="rounded-full border border-border bg-bg-primary/80 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
                {card.lifecycle}
              </span>
            </div>

            <p class="mt-3 text-sm leading-6 text-text-secondary">{card.detailText}</p>

            {#if card.actionLabel}
              <button
                class="mt-4 rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
                data-testid={`${setupWorkspaceTestIds.calibrationActionPrefix}-${card.id}`}
                disabled={replayReadonly || card.actionAvailability !== "available" || pendingCardId === card.id}
                onclick={() => runCompassAction(card)}
                type="button"
              >
                {pendingCardId === card.id ? "Working…" : card.actionLabel}
              </button>
            {/if}
          </article>
        {/each}
      </div>
    </div>
  {/snippet}
</SetupSectionShell>

<style>
.setup-calibration-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
</style>
