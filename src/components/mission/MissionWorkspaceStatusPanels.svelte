<script lang="ts">
import type {
  MissionPlannerMode,
  MissionPlannerStoreState,
} from "../../lib/stores/mission-planner";
import type { MissionPlannerView } from "../../lib/stores/mission-planner-view";
import type { ReplayMapOverlayState } from "../../lib/replay-map-overlay";
import type { Warning } from "../../lib/warnings/warning-model";
import {
  exportReviewChoiceTestId,
  importReviewChoiceTestId,
  replayOverlayDetail,
  replacePromptBody,
  replacePromptConfirmLabel,
  replacePromptDismissLabel,
  replacePromptTitle,
  statusClass,
  type MissionWorkspaceInlineCopy,
} from "./mission-workspace-helpers";
import { StickyWarningStack } from "../ui";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

type Props = {
  view: MissionPlannerView;
  planner: MissionPlannerStoreState;
  inlineCopy: MissionWorkspaceInlineCopy | null;
  sharedWarnings: Warning[];
  replayMapOverlay?: ReplayMapOverlayState | null;
  onSetImportReviewChoice: (domain: MissionPlannerMode, replace: boolean) => void;
  onConfirmImportReview: () => void | Promise<unknown>;
  onDismissImportReview: () => void;
  onSetExportReviewChoice: (domain: MissionPlannerMode, selected: boolean) => void;
  onConfirmExportReview: () => void | Promise<unknown>;
  onDismissExportReview: () => void;
  onConfirmPrompt: () => void | Promise<unknown>;
  onDismissPrompt: () => void;
  onDismissReplayMapOverlay: () => void;
};

let {
  view,
  planner,
  inlineCopy,
  sharedWarnings,
  replayMapOverlay = null,
  onSetImportReviewChoice,
  onConfirmImportReview,
  onDismissImportReview,
  onSetExportReviewChoice,
  onConfirmExportReview,
  onDismissExportReview,
  onConfirmPrompt,
  onDismissPrompt,
  onDismissReplayMapOverlay,
}: Props = $props();

function readCheckboxChecked(event: Event): boolean {
  return (event.currentTarget as HTMLInputElement).checked;
}
</script>

{#if view.importReview}
  <section
    class="mx-[var(--workspace-gutter-split)] mt-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-4 text-sm text-warning"
    data-testid={missionWorkspaceTestIds.importReview}
  >
    <p class="text-xs font-semibold uppercase tracking-wide text-warning/80">Import review</p>
    <h3 class="mt-1 text-base font-semibold text-warning" data-testid={missionWorkspaceTestIds.importReviewTitle}>
      Review {view.importReview.fileName ?? `.${view.importReview.source}`} before replacing planner domains
    </h3>
    <p class="mt-2 text-warning/90">
      Keep or replace the incoming Mission + Home + Survey, Fence, and Rally buckets independently. Nothing changes until you apply this review.
    </p>

    {#if view.importReview.warnings.length > 0}
      <ul class="mt-3 list-inside list-disc space-y-1 text-xs">
        {#each view.importReview.warnings as warning, index (`${warning}-${index}`)}
          <li>{warning}</li>
        {/each}
      </ul>
    {/if}

    <div class="mt-4 grid gap-3 lg:grid-cols-3">
      {#each view.importReview.choices as choice (choice.domain)}
        <article
          class="rounded-lg border border-warning/30 bg-bg-primary/90 p-3 text-text-primary"
          data-testid={importReviewChoiceTestId(choice.domain)}
        >
          <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">{choice.label}</p>
          <p class="mt-2 text-xs text-text-secondary">Current · {choice.currentSummary}</p>
          <p class="mt-1 text-xs text-text-secondary">Incoming · {choice.incomingSummary}</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <button
              class={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${!choice.replace
                ? "border-success/30 bg-success/10 text-success"
                : "border-border bg-bg-secondary text-text-primary hover:border-success hover:text-success"}`}
              data-testid={`${missionWorkspaceTestIds.importReviewKeepPrefix}-${choice.domain}`}
              onclick={() => onSetImportReviewChoice(choice.domain, false)}
              type="button"
            >
              Keep current
            </button>
            <button
              class={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${choice.replace
                ? "border-warning/40 bg-warning/10 text-warning"
                : "border-border bg-bg-secondary text-text-primary hover:border-warning hover:text-warning"}`}
              data-testid={`${missionWorkspaceTestIds.importReviewReplacePrefix}-${choice.domain}`}
              onclick={() => onSetImportReviewChoice(choice.domain, true)}
              type="button"
            >
              Replace with incoming
            </button>
          </div>
        </article>
      {/each}
    </div>

    <div class="mt-4 flex flex-wrap gap-2">
      <button
        class="rounded-md border border-warning/40 bg-bg-primary px-4 py-2 text-sm font-semibold text-warning transition hover:brightness-105"
        data-testid={missionWorkspaceTestIds.importReviewConfirm}
        onclick={onConfirmImportReview}
        type="button"
      >
        Apply review
      </button>
      <button
        class="rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        data-testid={missionWorkspaceTestIds.importReviewDismiss}
        onclick={onDismissImportReview}
        type="button"
      >
        Dismiss review
      </button>
    </div>
  </section>
{/if}

{#if view.exportReview}
  <section
    class="mx-[var(--workspace-gutter-split)] mt-4 rounded-lg border border-accent/30 bg-accent/10 px-4 py-4 text-sm text-text-primary"
    data-testid={missionWorkspaceTestIds.exportReview}
  >
    <p class="text-xs font-semibold uppercase tracking-wide text-accent/80">Export chooser</p>
    <h3 class="mt-1 text-base font-semibold" data-testid={missionWorkspaceTestIds.exportReviewTitle}>
      Choose which planner domains to include in the exported .plan file
    </h3>
    <p class="mt-2 text-text-secondary">
      Mission includes Home and Survey because QGroundControl stores those inside the mission bucket. Fence and Rally stay independent export buckets.
    </p>

    <div class="mt-4 grid gap-3 lg:grid-cols-3">
      {#each view.exportReview.choices as choice (choice.domain)}
        <label
          class="flex items-start gap-3 rounded-lg border border-border bg-bg-primary/90 p-3"
          data-testid={exportReviewChoiceTestId(choice.domain)}
        >
          <input
            checked={choice.selected}
            onchange={(event) => onSetExportReviewChoice(choice.domain, readCheckboxChecked(event))}
            type="checkbox"
          />
          <span>
            <span class="block text-xs font-semibold uppercase tracking-wide text-text-muted">{choice.label}</span>
            <span class="mt-2 block text-xs text-text-secondary">{choice.summary}</span>
          </span>
        </label>
      {/each}
    </div>

    <div class="mt-4 flex flex-wrap gap-2">
      <button
        class="rounded-md border border-accent/40 bg-bg-primary px-4 py-2 text-sm font-semibold text-accent transition hover:brightness-105"
        data-testid={missionWorkspaceTestIds.exportReviewConfirm}
        onclick={onConfirmExportReview}
        type="button"
      >
        Save .plan
      </button>
      <button
        class="rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        data-testid={missionWorkspaceTestIds.exportReviewDismiss}
        onclick={onDismissExportReview}
        type="button"
      >
        Close chooser
      </button>
    </div>
  </section>
{/if}

{#if planner.replacePrompt}
  <section
    class="mx-[var(--workspace-gutter-split)] mt-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-4 text-sm text-warning"
    data-testid={missionWorkspaceTestIds.prompt}
  >
    <p class="text-xs font-semibold uppercase tracking-wide text-warning/80" data-testid={missionWorkspaceTestIds.promptKind}>
      {planner.replacePrompt.kind === "recoverable" ? "recoverable-draft" : `${planner.replacePrompt.action}-replace`}
    </p>
    <h3 class="mt-1 text-base font-semibold text-warning">{replacePromptTitle(planner)}</h3>
    <p class="mt-2">{replacePromptBody(planner)}</p>
    <div class="mt-3 flex flex-wrap gap-2">
      <button
        class="rounded-md border border-warning/40 bg-bg-primary px-4 py-2 text-sm font-semibold text-warning transition hover:brightness-105"
        data-testid={missionWorkspaceTestIds.promptConfirm}
        onclick={onConfirmPrompt}
        type="button"
      >
        {replacePromptConfirmLabel(planner)}
      </button>
      <button
        class="rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        data-testid={missionWorkspaceTestIds.promptDismiss}
        onclick={onDismissPrompt}
        type="button"
      >
        {replacePromptDismissLabel(planner)}
      </button>
    </div>
  </section>
{/if}

{#if inlineCopy}
  <div
    class={`mx-[var(--workspace-gutter-split)] mt-4 rounded-lg border px-4 py-3 text-sm ${statusClass(inlineCopy.tone)}`}
    data-testid={missionWorkspaceTestIds.inlineStatus}
  >
    <p class="font-semibold" data-testid={missionWorkspaceTestIds.inlineStatusMessage}>{inlineCopy.title}</p>
    <p class="mt-1" data-testid={missionWorkspaceTestIds.inlineStatusDetail}>{inlineCopy.detail}</p>
  </div>
{/if}

{#if view.lastError}
  <div
    class="mx-[var(--workspace-gutter-split)] mt-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
    data-testid={missionWorkspaceTestIds.error}
  >
    <p class="font-semibold">Planner action failed</p>
    <p class="mt-1">{view.lastError}</p>
  </div>
{/if}

{#if sharedWarnings.length > 0}
  <div class="mx-[var(--workspace-gutter-split)] mt-4">
    <StickyWarningStack warnings={sharedWarnings} testId={missionWorkspaceTestIds.warningRegister} />
  </div>
{/if}

{#if replayMapOverlay}
  <section
    class={`mx-[var(--workspace-gutter-split)] mt-4 rounded-lg border px-4 py-3 text-sm ${replayMapOverlay.phase === "failed"
      ? "border-danger/40 bg-danger/10 text-danger"
      : replayMapOverlay.phase === "loading"
        ? "border-warning/40 bg-warning/10 text-warning"
        : "border-accent/30 bg-accent/10 text-text-primary"}`}
    data-testid={missionWorkspaceTestIds.replayOverlayBanner}
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide" data-testid={missionWorkspaceTestIds.replayOverlayState}>
          Replay map overlay · {replayMapOverlay.phase}
        </p>
        <p class="mt-1 font-semibold">Replay map overlay</p>
        <p class="mt-1" data-testid={missionWorkspaceTestIds.replayOverlayDetail}>{replayOverlayDetail(replayMapOverlay)}</p>
      </div>

      <button
        class="rounded-md border border-border bg-bg-primary px-3 py-1.5 text-xs font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        data-testid={missionWorkspaceTestIds.replayOverlayDismiss}
        onclick={onDismissReplayMapOverlay}
        type="button"
      >
        Dismiss overlay
      </button>
    </div>
  </section>
{/if}
