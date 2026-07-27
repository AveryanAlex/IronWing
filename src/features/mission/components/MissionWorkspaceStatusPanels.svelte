<script lang="ts">
import type {
  MissionPlannerMode,
  MissionPlannerStoreState,
} from "../../../lib/stores/mission-planner";
import type { MissionPlannerView } from "../../../lib/stores/mission-planner-view";
import { sortBySeverity, type Warning } from "../../../lib/warnings/warning-model";
import {
  exportReviewChoiceTestId,
  importReviewChoiceTestId,
  replacePromptBody,
  replacePromptConfirmLabel,
  replacePromptDismissLabel,
  replacePromptTitle,
} from "../mission-workspace-helpers";
import {
  Banner,
  Button,
  ButtonGroup,
  Card,
  Checkbox,
  Dialog,
  Eyebrow,
  HelperText,
  Sheet,
} from "../../../components/ui";
import { missionWorkspaceTestIds } from "../mission-workspace-test-ids";

type Props = {
  view: MissionPlannerView;
  planner: MissionPlannerStoreState;
  sharedWarnings: Warning[];
  issuesOpen: boolean;
  onIssuesOpenChange: (open: boolean) => void;
  onSetImportReviewChoice: (domain: MissionPlannerMode, replace: boolean) => void;
  onConfirmImportReview: () => void | Promise<unknown>;
  onDismissImportReview: () => void;
  onSetExportReviewChoice: (domain: MissionPlannerMode, selected: boolean) => void;
  onConfirmExportReview: () => void | Promise<unknown>;
  onDismissExportReview: () => void;
  onConfirmPrompt: () => void | Promise<unknown>;
  onDismissPrompt: () => void;
};

let {
  view,
  planner,
  sharedWarnings,
  issuesOpen,
  onIssuesOpenChange,
  onSetImportReviewChoice,
  onConfirmImportReview,
  onDismissImportReview,
  onSetExportReviewChoice,
  onConfirmExportReview,
  onDismissExportReview,
  onConfirmPrompt,
  onDismissPrompt,
}: Props = $props();

let sortedWarnings = $derived(sortBySeverity(sharedWarnings));
</script>

<Dialog.Root
  open={view.importReview !== null}
  onOpenChange={(open) => {
    if (!open) onDismissImportReview();
  }}
>
  {#if view.importReview}
    <Dialog.Content
      aria-label="Import review"
      class="max-h-[calc(100dvh-2rem)] gap-4 p-4 sm:p-5"
      data-testid={missionWorkspaceTestIds.importReview}
      showClose={false}
      size="xl"
    >
      <Dialog.Header>
        <Eyebrow tone="warning">Import review</Eyebrow>
        <Dialog.Title data-testid={missionWorkspaceTestIds.importReviewTitle}>
          Review {view.importReview.fileName ?? `.${view.importReview.source}`} before replacing planner domains
        </Dialog.Title>
        <Dialog.Description>
          Keep or replace Mission + Home + Survey, Fence, and Rally independently. Nothing changes until you apply this review.
        </Dialog.Description>
      </Dialog.Header>

      <div class="min-h-0 space-y-4 overflow-y-auto pr-1">
        {#if view.importReview.warnings.length > 0}
          <div class="rounded-lg border border-warning/30 bg-warning/10 p-3">
            <p class="text-xs font-semibold uppercase tracking-wide text-warning">
              {view.importReview.warnings.length} import warning{view.importReview.warnings.length === 1 ? "" : "s"}
            </p>
            <ul class="mt-2 list-disc space-y-1 pl-4 text-xs text-text-secondary">
              {#each view.importReview.warnings as warning, index (`${warning}-${index}`)}
                <li>{warning}</li>
              {/each}
            </ul>
          </div>
        {/if}

        <div class="grid gap-3 lg:grid-cols-3">
          {#each view.importReview.choices as choice (choice.domain)}
            <Card.Root
              as="article"
              density="compact"
              surface="primary"
              tone="warning"
              testId={importReviewChoiceTestId(choice.domain)}
            >
              <Eyebrow>{choice.label}</Eyebrow>
              <HelperText class="mt-2" size="xs">Existing · {choice.currentSummary}</HelperText>
              <HelperText class="mt-1" size="xs">Incoming · {choice.incomingSummary}</HelperText>
              <ButtonGroup class="mt-3 flex-wrap">
                <Button
                  class="h-8 text-xs"
                  testId={`${missionWorkspaceTestIds.importReviewKeepPrefix}-${choice.domain}`}
                  onclick={() => onSetImportReviewChoice(choice.domain, false)}
                  tone="success"
                  variant={!choice.replace ? "soft" : "outline"}
                >
                  Keep current
                </Button>
                <Button
                  class="h-8 text-xs"
                  testId={`${missionWorkspaceTestIds.importReviewReplacePrefix}-${choice.domain}`}
                  onclick={() => onSetImportReviewChoice(choice.domain, true)}
                  tone="warning"
                  variant={choice.replace ? "soft" : "outline"}
                >
                  Replace incoming
                </Button>
              </ButtonGroup>
            </Card.Root>
          {/each}
        </div>
      </div>

      <Dialog.Footer>
        <Button testId={missionWorkspaceTestIds.importReviewDismiss} onclick={onDismissImportReview} variant="secondary">
          Dismiss review
        </Button>
        <Button
          testId={missionWorkspaceTestIds.importReviewConfirm}
          onclick={onConfirmImportReview}
          tone="warning"
          variant="soft"
        >
          Apply review
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  {/if}
</Dialog.Root>

<Dialog.Root
  open={view.exportReview !== null}
  onOpenChange={(open) => {
    if (!open) onDismissExportReview();
  }}
>
  {#if view.exportReview}
    <Dialog.Content
      aria-label="Export chooser"
      class="max-h-[calc(100dvh-2rem)] gap-4 p-4 sm:p-5"
      data-testid={missionWorkspaceTestIds.exportReview}
      showClose={false}
      size="lg"
    >
      <Dialog.Header>
        <Eyebrow tone="accent">Export chooser</Eyebrow>
        <Dialog.Title data-testid={missionWorkspaceTestIds.exportReviewTitle}>
          Choose planner domains for the .plan file
        </Dialog.Title>
        <Dialog.Description>
          Mission includes Home and Survey. Fence and Rally remain independent export buckets.
        </Dialog.Description>
      </Dialog.Header>

      <div class="grid min-h-0 gap-3 overflow-y-auto sm:grid-cols-3">
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

      <Dialog.Footer>
        <Button testId={missionWorkspaceTestIds.exportReviewDismiss} onclick={onDismissExportReview} variant="secondary">
          Close chooser
        </Button>
        <Button testId={missionWorkspaceTestIds.exportReviewConfirm} onclick={onConfirmExportReview} tone="accent" variant="soft">
          Save .plan
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  {/if}
</Dialog.Root>

<Dialog.Root
  open={planner.replacePrompt !== null}
  onOpenChange={(open) => {
    if (!open) onDismissPrompt();
  }}
>
  {#if planner.replacePrompt}
    <Dialog.Content
      aria-label={replacePromptTitle(planner)}
      class="max-h-[calc(100dvh-2rem)]"
      data-testid={missionWorkspaceTestIds.prompt}
      showClose={false}
      size="sm"
    >
      <Dialog.Header>
        <Eyebrow tone="warning" testId={missionWorkspaceTestIds.promptKind}>
          {planner.replacePrompt.kind === "recoverable" ? "recoverable-draft" : `${planner.replacePrompt.action}-replace`}
        </Eyebrow>
        <Dialog.Title>{replacePromptTitle(planner)}</Dialog.Title>
        <Dialog.Description>{replacePromptBody(planner)}</Dialog.Description>
      </Dialog.Header>
      <Dialog.Footer>
        <Button testId={missionWorkspaceTestIds.promptDismiss} onclick={onDismissPrompt} variant="secondary">
          {replacePromptDismissLabel(planner)}
        </Button>
        <Button testId={missionWorkspaceTestIds.promptConfirm} onclick={onConfirmPrompt} tone="warning" variant="soft">
          {replacePromptConfirmLabel(planner)}
        </Button>
      </Dialog.Footer>
    </Dialog.Content>
  {/if}
</Dialog.Root>

<Sheet.Root open={issuesOpen} onOpenChange={onIssuesOpenChange}>
  {#if issuesOpen}
    <Sheet.Content
      aria-label="Mission issues"
      class="w-[min(100vw,30rem)] gap-4 p-4"
      data-testid={missionWorkspaceTestIds.warningRegister}
      showClose={false}
      side="right"
    >
      <Sheet.Header class="flex-row items-start justify-between gap-3 pr-0">
        <div>
          <Eyebrow tone={sharedWarnings.length > 0 ? "warning" : undefined}>Planner health</Eyebrow>
          <Sheet.Title class="mt-1">Mission issues · {sharedWarnings.length}</Sheet.Title>
          <Sheet.Description class="mt-1">
            Review validation, transfer, and file warnings without moving the planner canvas.
          </Sheet.Description>
        </div>
        <Sheet.Close ariaLabel="Close mission issues" class="shrink-0">Close</Sheet.Close>
      </Sheet.Header>

      <div class="min-h-0 flex-1 space-y-3 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
        {#if sharedWarnings.length === 0}
          <Card.Root density="compact" surface="muted">
            <p class="text-sm font-medium text-text-primary">No active planner issues</p>
            <HelperText class="mt-1">New issues will be counted in the mission toolbar.</HelperText>
          </Card.Root>
        {:else}
          {#each sortedWarnings as warning (warning.id)}
            <Banner
              title={warning.title}
              message={warning.message}
              severity={warning.severity}
              source={warning.source}
              actionLabel={warning.actionLabel}
              onAction={warning.onAction
                ? () => {
                    warning.onAction?.();
                    onIssuesOpenChange(false);
                  }
                : undefined}
              dismissible={warning.dismissible}
              onDismiss={warning.onDismiss}
              details={warning.details}
              testId={warning.testId}
              actionTestId={warning.actionTestId}
              dismissTestId={warning.dismissTestId}
            />
          {/each}
        {/if}
      </div>
    </Sheet.Content>
  {/if}
</Sheet.Root>
