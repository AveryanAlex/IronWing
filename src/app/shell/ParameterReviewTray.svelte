<script lang="ts">
import { ChevronDown, RotateCw, Trash2, Upload, X } from "lucide-svelte";
import { fromStore } from "svelte/store";

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

{#if view.stagedCount > 0}
  <section
    class="shrink-0 border-t border-warning/30 bg-warning/5"
    data-surface-kind="setup-bottom-menu"
    data-testid={appShellTestIds.parameterReviewTray}
  >
    <button
      aria-expanded={expanded}
      class="flex w-full items-center gap-2 border-none bg-transparent px-3 py-2 text-left text-xs text-warning transition-colors hover:bg-warning/10"
      data-testid={appShellTestIds.parameterReviewToggle}
      onclick={() => (expanded = !expanded)}
      type="button"
    >
      <ChevronDown
        aria-hidden="true"
        class={`shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        size={12}
      />
      <span class="font-medium" data-testid={appShellTestIds.parameterReviewCount}>
        {view.stagedCount} parameter{view.stagedCount === 1 ? "" : "s"} staged
      </span>
      {#if hasRebootFlaggedEdit}
        <RotateCw aria-hidden="true" class="shrink-0 text-warning/70" size={10} />
      {/if}
      <span class="ml-auto text-[11px] text-text-muted">{expanded ? "Collapse" : "Expand"}</span>
    </button>

    <span class="sr-only" data-testid={appShellTestIds.parameterReviewState}>{expanded ? "open" : "closed"}</span>

    <div
      aria-hidden={!expanded}
      class={`grid transition-[grid-template-rows] duration-200 ease-out ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      data-testid={appShellTestIds.parameterReviewSurface}
    >
      <div class="min-h-0 overflow-hidden">
        <div class="px-3 pb-3 pt-1">
          {#if hasRebootFlaggedEdit}
            <div class="mb-2 flex items-center gap-1.5 rounded bg-warning/10 px-2 py-1 text-[10px] text-warning">
              <RotateCw aria-hidden="true" class="shrink-0" size={10} />
              Some changes require a vehicle reboot to take effect
            </div>
          {/if}
          {#if view.noticeText}
            <p class="mb-2 text-xs text-warning" data-testid={appShellTestIds.parameterReviewWarning}>
              {view.noticeText}
            </p>
          {/if}
          {#if replayReadonly}
            <p class="mb-2 text-xs text-warning" data-testid={appShellTestIds.parameterReviewReplayReadonly}>
              <span class="font-semibold">{REPLAY_READONLY_TITLE}</span> · {REPLAY_READONLY_COPY}
            </p>
          {/if}
          {#if view.applyProgressText}
            <p class="mb-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted" data-testid={appShellTestIds.parameterReviewProgress}>
              {view.applyProgressText}
            </p>
          {/if}

          <div class="mb-2 flex max-h-40 flex-col gap-0.5 overflow-y-auto">
            {#each view.stagedEdits as edit (edit.name)}
              <div
                class="flex items-center gap-2 text-[11px] font-mono"
                data-param-name={edit.name}
                data-testid={`${appShellTestIds.parameterReviewRowPrefix}-${edit.name}`}
              >
                <span class="w-56 truncate text-text-primary sm:w-72" title={`${edit.label} (${edit.rawName})`}>
                  {edit.label}
                  {#if edit.label !== edit.rawName}
                    <span class="font-mono text-text-muted">({edit.rawName})</span>
                  {/if}
                </span>
                <span class="text-text-muted">{edit.currentDisplayText}</span>
                <span class="text-text-muted">→</span>
                <span class="font-semibold text-warning">{edit.nextDisplayText}</span>
                {#if edit.rebootRequired}
                  <RotateCw aria-label="reboot required" class="shrink-0 text-warning" size={8} />
                  <span class="sr-only">reboot required</span>
                {/if}
                {#if edit.isWriting}
                  <span class="text-accent">writing</span>
                {/if}
                {#if edit.failureMessage}
                  <button
                    class="ml-auto rounded px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent transition hover:bg-accent/10 disabled:opacity-60"
                    data-testid={`${appShellTestIds.parameterReviewRetryPrefix}-${edit.name}`}
                    disabled={isApplying || replayReadonly}
                    onclick={() => retryEdit(edit.name)}
                    type="button"
                  >
                    Retry
                  </button>
                {/if}
                <button
                  aria-label={`Discard ${edit.rawName}`}
                  class={edit.failureMessage ? "p-0.5 text-text-muted transition hover:text-danger disabled:opacity-60" : "ml-auto p-0.5 text-text-muted transition hover:text-danger disabled:opacity-60"}
                  data-testid={`${appShellTestIds.parameterReviewDiscardPrefix}-${edit.name}`}
                  disabled={isApplying}
                  onclick={() => discardQueuedEdit(edit.name)}
                  title="Discard"
                  type="button"
                >
                  <X aria-hidden="true" size={10} />
                </button>
                {#if edit.failureMessage}
                  <span
                    class="text-danger"
                    data-testid={`${appShellTestIds.parameterReviewFailurePrefix}-${edit.name}`}
                  >
                    {edit.failureMessage}{edit.confirmedValueText ? ` · confirmed: ${edit.confirmedValueText}${edit.units ? ` ${edit.units}` : ""}` : ""}
                  </span>
                {/if}
              </div>
            {/each}
          </div>

          <div class="flex items-center gap-2">
            <button
              class="flex items-center gap-1.5 rounded-md bg-success px-3 py-1.5 text-xs font-medium text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              data-testid={appShellTestIds.parameterReviewApply}
              disabled={isApplying || replayReadonly}
              onclick={applyQueuedEdits}
              type="button"
            >
              <Upload aria-hidden="true" class={isApplying ? "animate-pulse" : ""} size={12} />
              {isApplying ? "Applying..." : "Apply all"}
            </button>
            <button
              class="flex items-center gap-1.5 rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-primary transition hover:border-border-light disabled:cursor-not-allowed disabled:opacity-40"
              data-testid={appShellTestIds.parameterReviewClear}
              disabled={isApplying}
              onclick={discardAllQueuedEdits}
              type="button"
            >
              <Trash2 aria-hidden="true" size={12} />
              Discard all
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
{/if}
