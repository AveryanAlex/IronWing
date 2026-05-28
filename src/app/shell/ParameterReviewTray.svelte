<script lang="ts">
import { ChevronDown, RotateCw, Trash2, Upload, X } from "lucide-svelte";
import { fromStore } from "svelte/store";

import {
  ActionRow,
  Alert,
  Badge,
  Button,
  Collapsible,
  Eyebrow,
  HelperText,
  IconButton,
  MonoValue,
} from "../../components/ui";
import { REPLAY_READONLY_COPY, REPLAY_READONLY_TITLE, isReplayReadonly } from "../../lib/replay-readonly";
import { appShellTestIds } from "./chrome-state";
import { getParamsStoreContext, getParameterWorkspaceViewStoreContext } from "./runtime-context";

const store = getParamsStoreContext();
const parameterView = fromStore(getParameterWorkspaceViewStoreContext());

let expanded = $state(false);

let view = $derived(parameterView.current);
let hasRebootFlaggedEdit = $derived(view.stagedEdits.some((edit) => edit.rebootRequired));
let isApplying = $derived(view.applyPhase === "applying");
let replayReadonly = $derived(isReplayReadonly(view.activeEnvelope?.source_kind ?? null));

async function applyQueuedEdits() {
  await store.applyStagedEdits();
  if (parameterView.current.stagedCount === 0) {
    expanded = false;
  }
}

function retryEdit(name: string) {
  void store.applyStagedEdits([name]);
}

function discardQueuedEdit(name: string) {
  if (view.stagedCount <= 1) {
    expanded = false;
  }

  store.discardStagedEdit(name);
}

function discardAllQueuedEdits() {
  expanded = false;
  store.clearStagedEdits();
}
</script>

{#snippet reviewTrigger()}
  <span
    class="flex w-full items-center gap-2"
    data-testid={appShellTestIds.parameterReviewToggle}
  >
    <ChevronDown
      aria-hidden="true"
      class={`shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
      size={12}
    />
    <Badge variant="warning" size="sm" case="normal" shape="rounded" testId={appShellTestIds.parameterReviewCount}>
      {view.stagedCount} parameter{view.stagedCount === 1 ? "" : "s"} staged
    </Badge>
    {#if hasRebootFlaggedEdit}
      <RotateCw aria-hidden="true" class="shrink-0 text-warning/70" size={10} />
    {/if}
    <HelperText as="span" size="xs" tone="muted" class="ml-auto">{expanded ? "Collapse" : "Expand"}</HelperText>
  </span>
{/snippet}

{#snippet reviewContent()}
  <div class="px-3 pb-3 pt-1" data-testid={appShellTestIds.parameterReviewSurface}>
    {#if hasRebootFlaggedEdit}
      <Alert
        class="mb-2"
        density="compact"
        description="Some changes require a vehicle reboot to take effect"
        icon={rebootIcon}
        variant="warning"
      />
    {/if}
    {#if view.noticeText}
      <Alert
        class="mb-2"
        density="compact"
        description={view.noticeText}
        testId={appShellTestIds.parameterReviewWarning}
        variant="warning"
      />
    {/if}
    {#if replayReadonly}
      <Alert
        class="mb-2"
        density="compact"
        description={REPLAY_READONLY_COPY}
        testId={appShellTestIds.parameterReviewReplayReadonly}
        title={REPLAY_READONLY_TITLE}
        variant="warning"
      />
    {/if}
    {#if view.applyProgressText}
      <Eyebrow class="mb-2" testId={appShellTestIds.parameterReviewProgress}>
        {view.applyProgressText}
      </Eyebrow>
    {/if}

    <div class="mb-2 flex max-h-40 flex-col gap-0.5 overflow-y-auto">
      {#each view.stagedEdits as edit (edit.name)}
        <div
          class="flex items-center gap-2 text-xs"
          data-param-name={edit.name}
          data-testid={`${appShellTestIds.parameterReviewRowPrefix}-${edit.name}`}
        >
          <MonoValue as="span" class="w-56 truncate sm:w-72" title={`${edit.label} (${edit.rawName})`}>
            {edit.label}
            {#if edit.label !== edit.rawName}
              <MonoValue as="span" tone="muted">({edit.rawName})</MonoValue>
            {/if}
          </MonoValue>
          <MonoValue as="span" tone="muted">{edit.currentDisplayText}</MonoValue>
          <HelperText as="span" size="xs" tone="muted">→</HelperText>
          <MonoValue as="span" tone="warning" class="font-semibold">{edit.nextDisplayText}</MonoValue>
          {#if edit.rebootRequired}
            <RotateCw aria-label="reboot required" class="shrink-0 text-warning" size={8} />
            <span class="sr-only">reboot required</span>
          {/if}
          {#if edit.isWriting}
            <Badge variant="accent" size="sm" case="normal" shape="rounded">writing</Badge>
          {/if}
          {#if edit.failureMessage}
            <Button
              class="ml-auto h-6 px-2 text-xs uppercase tracking-wide"
              disabled={isApplying || replayReadonly}
              onclick={() => retryEdit(edit.name)}
              size="sm"
              testId={`${appShellTestIds.parameterReviewRetryPrefix}-${edit.name}`}
              variant="ghost"
            >
              Retry
            </Button>
          {/if}
          <IconButton
            ariaLabel={`Discard ${edit.rawName}`}
            class={edit.failureMessage ? "size-6" : "ml-auto size-6"}
            disabled={isApplying}
            onclick={() => discardQueuedEdit(edit.name)}
            size="icon-sm"
            testId={`${appShellTestIds.parameterReviewDiscardPrefix}-${edit.name}`}
            title="Discard"
            tone="danger"
            variant="ghost"
          >
            <X aria-hidden="true" size={10} />
          </IconButton>
          {#if edit.failureMessage}
            <MonoValue
              as="span"
              tone="danger"
              data-testid={`${appShellTestIds.parameterReviewFailurePrefix}-${edit.name}`}
            >
              {edit.failureMessage}{edit.confirmedValueText ? ` · confirmed: ${edit.confirmedValueText}${edit.units ? ` ${edit.units}` : ""}` : ""}
            </MonoValue>
          {/if}
        </div>
      {/each}
    </div>

    <ActionRow align="start" direction="row">
      <Button
        disabled={isApplying || replayReadonly}
        onclick={() => void applyQueuedEdits()}
        size="sm"
        testId={appShellTestIds.parameterReviewApply}
        tone="success"
        variant="solid"
      >
        <Upload aria-hidden="true" class={isApplying ? "animate-pulse" : ""} size={12} />
        {isApplying ? "Applying..." : "Apply all"}
      </Button>
      <Button
        disabled={isApplying}
        onclick={discardAllQueuedEdits}
        size="sm"
        testId={appShellTestIds.parameterReviewClear}
        variant="outline"
      >
        <Trash2 aria-hidden="true" size={12} />
        Discard all
      </Button>
    </ActionRow>
  </div>
{/snippet}

{#snippet rebootIcon()}
  <RotateCw aria-hidden="true" class="shrink-0" size={10} />
{/snippet}

{#if view.stagedCount > 0}
  <section
    class="shrink-0 border-t border-warning/30 bg-warning/5"
    data-surface-kind="setup-bottom-menu"
    data-testid={appShellTestIds.parameterReviewTray}
  >
    <Collapsible
      bind:open={expanded}
      class="gap-0"
      content={reviewContent}
      contentClass="min-h-0 overflow-hidden text-xs text-text-secondary"
      trigger={reviewTrigger}
      triggerClass="w-full border-none bg-transparent px-3 py-2 text-xs text-warning transition-colors hover:bg-warning/10"
    />
  </section>
{/if}
