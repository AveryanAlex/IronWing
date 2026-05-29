<script lang="ts">
import type {
  MissionPlannerMode,
  MissionPlannerStoreState,
} from "../../../lib/stores/mission-planner";
import type { MissionPlannerView } from "../../../lib/stores/mission-planner-view";
import type { ReplayMapOverlayState } from "../../../lib/replay-map-overlay";
import type { Warning } from "../../../lib/warnings/warning-model";
import {
  exportReviewChoiceTestId,
  importReviewChoiceTestId,
  replayOverlayDetail,
  replacePromptBody,
  replacePromptConfirmLabel,
  replacePromptDismissLabel,
  replacePromptTitle,
  type MissionWorkspaceInlineCopy,
} from "../mission-workspace-helpers";
import { ActionRow, Alert, Button, ButtonGroup, Card, Checkbox, Eyebrow, HelperText, StickyWarningStack } from "../../../components/ui";
import { missionWorkspaceTestIds } from "../mission-workspace-test-ids";

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

function replayOverlayVariant(phase: ReplayMapOverlayState["phase"]): "danger" | "info" | "warning" {
  return phase === "failed" ? "danger" : phase === "loading" ? "warning" : "info";
}
</script>

{#if view.importReview}
  <Alert
    class="mx-[var(--workspace-gutter-split)] mt-4"
    layout="stacked"
    testId={missionWorkspaceTestIds.importReview}
    variant="warning"
  >
    <Eyebrow tone="warning">Import review</Eyebrow>
    <h3 class="mt-1 text-base font-semibold text-warning" data-testid={missionWorkspaceTestIds.importReviewTitle}>
      Review {view.importReview.fileName ?? `.${view.importReview.source}`} before replacing planner domains
    </h3>
    <HelperText class="mt-2" tone="warning">
      Keep or replace the incoming Mission + Home + Survey, Fence, and Rally buckets independently. Nothing changes until you apply this review.
    </HelperText>

    {#if view.importReview.warnings.length > 0}
      <ul class="mt-3 list-inside list-disc space-y-1 text-xs">
        {#each view.importReview.warnings as warning, index (`${warning}-${index}`)}
          <li>{warning}</li>
        {/each}
      </ul>
    {/if}

    <div class="mt-4 grid gap-3 lg:grid-cols-3">
      {#each view.importReview.choices as choice (choice.domain)}
        <Card.Root as="article" density="compact" surface="primary" tone="warning" testId={importReviewChoiceTestId(choice.domain)}>
          <Eyebrow>{choice.label}</Eyebrow>
          <HelperText class="mt-2" size="xs">Existing · {choice.currentSummary}</HelperText>
          <HelperText class="mt-1" size="xs">Incoming · {choice.incomingSummary}</HelperText>
          <ButtonGroup class="mt-3 flex-wrap">
            <Button
              class="h-7 text-xs"
              testId={`${missionWorkspaceTestIds.importReviewKeepPrefix}-${choice.domain}`}
              onclick={() => onSetImportReviewChoice(choice.domain, false)}
              tone="success"
              variant={!choice.replace ? "soft" : "outline"}
            >
              Keep current
            </Button>
            <Button
              class="h-7 text-xs"
              testId={`${missionWorkspaceTestIds.importReviewReplacePrefix}-${choice.domain}`}
              onclick={() => onSetImportReviewChoice(choice.domain, true)}
              tone="warning"
              variant={choice.replace ? "soft" : "outline"}
            >
              Replace with incoming
            </Button>
          </ButtonGroup>
        </Card.Root>
      {/each}
    </div>

    <ActionRow align="start" class="mt-4">
      <Button
        testId={missionWorkspaceTestIds.importReviewConfirm}
        onclick={onConfirmImportReview}
        tone="warning"
        variant="soft"
      >
        Apply review
      </Button>
      <Button
        testId={missionWorkspaceTestIds.importReviewDismiss}
        onclick={onDismissImportReview}
        variant="secondary"
      >
        Dismiss review
      </Button>
    </ActionRow>
  </Alert>
{/if}

{#if view.exportReview}
  <Alert
    class="mx-[var(--workspace-gutter-split)] mt-4"
    layout="stacked"
    testId={missionWorkspaceTestIds.exportReview}
    variant="info"
  >
    <Eyebrow tone="accent">Export chooser</Eyebrow>
    <h3 class="mt-1 text-base font-semibold" data-testid={missionWorkspaceTestIds.exportReviewTitle}>
      Choose which planner domains to include in the exported .plan file
    </h3>
    <HelperText class="mt-2">
      Mission includes Home and Survey because QGroundControl stores those inside the mission bucket. Fence and Rally stay independent export buckets.
    </HelperText>

    <div class="mt-4 grid gap-3 lg:grid-cols-3">
      {#each view.exportReview.choices as choice (choice.domain)}
        <Card.Root density="compact" surface="primary" testId={exportReviewChoiceTestId(choice.domain)}>
          <Checkbox
            checked={choice.selected}
            description={choice.summary}
            label={choice.label}
            onCheckedChange={(checked) => onSetExportReviewChoice(choice.domain, checked)}
          />
        </Card.Root>
      {/each}
    </div>

    <ActionRow align="start" class="mt-4">
      <Button
        testId={missionWorkspaceTestIds.exportReviewConfirm}
        onclick={onConfirmExportReview}
        tone="accent"
        variant="soft"
      >
        Save .plan
      </Button>
      <Button
        testId={missionWorkspaceTestIds.exportReviewDismiss}
        onclick={onDismissExportReview}
        variant="secondary"
      >
        Close chooser
      </Button>
    </ActionRow>
  </Alert>
{/if}

{#if planner.replacePrompt}
  <Alert
    class="mx-[var(--workspace-gutter-split)] mt-4"
    layout="stacked"
    testId={missionWorkspaceTestIds.prompt}
    variant="warning"
  >
    <Eyebrow tone="warning" testId={missionWorkspaceTestIds.promptKind}>
      {planner.replacePrompt.kind === "recoverable" ? "recoverable-draft" : `${planner.replacePrompt.action}-replace`}
    </Eyebrow>
    <h3 class="mt-1 text-base font-semibold text-warning">{replacePromptTitle(planner)}</h3>
    <HelperText class="mt-2" tone="warning">{replacePromptBody(planner)}</HelperText>
    <ActionRow align="start" class="mt-3">
      <Button
        testId={missionWorkspaceTestIds.promptConfirm}
        onclick={onConfirmPrompt}
        tone="warning"
        variant="soft"
      >
        {replacePromptConfirmLabel(planner)}
      </Button>
      <Button
        testId={missionWorkspaceTestIds.promptDismiss}
        onclick={onDismissPrompt}
        variant="secondary"
      >
        {replacePromptDismissLabel(planner)}
      </Button>
    </ActionRow>
  </Alert>
{/if}

{#if inlineCopy}
  <Alert
    class="mx-[var(--workspace-gutter-split)] mt-4"
    title={inlineCopy.title}
    description={inlineCopy.detail}
    titleTestId={missionWorkspaceTestIds.inlineStatusMessage}
    descriptionTestId={missionWorkspaceTestIds.inlineStatusDetail}
    testId={missionWorkspaceTestIds.inlineStatus}
    variant={inlineCopy.tone}
  />
{/if}

{#if view.lastError}
  <Alert
    class="mx-[var(--workspace-gutter-split)] mt-4"
    title="Planner action failed"
    description={view.lastError}
    testId={missionWorkspaceTestIds.error}
    variant="danger"
  />
{/if}

{#if sharedWarnings.length > 0}
  <div class="mx-[var(--workspace-gutter-split)] mt-4">
    <StickyWarningStack warnings={sharedWarnings} testId={missionWorkspaceTestIds.warningRegister} />
  </div>
{/if}

{#if replayMapOverlay}
  <Alert
    class="mx-[var(--workspace-gutter-split)] mt-4"
    testId={missionWorkspaceTestIds.replayOverlayBanner}
    variant={replayOverlayVariant(replayMapOverlay.phase)}
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <Eyebrow testId={missionWorkspaceTestIds.replayOverlayState}>
          Replay map overlay · {replayMapOverlay.phase}
        </Eyebrow>
        <p class="mt-1 font-semibold">Replay map overlay</p>
        <HelperText class="mt-1" testId={missionWorkspaceTestIds.replayOverlayDetail}>{replayOverlayDetail(replayMapOverlay)}</HelperText>
      </div>

      <Button
        size="sm"
        testId={missionWorkspaceTestIds.replayOverlayDismiss}
        onclick={onDismissReplayMapOverlay}
        variant="secondary"
      >
        Dismiss overlay
      </Button>
    </div>
  </Alert>
{/if}
