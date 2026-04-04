<script lang="ts">
import { fromStore } from "svelte/store";

import { appShellTestIds } from "./chrome-state";
import {
  getParamsStoreContext,
  getParameterWorkspaceViewStoreContext,
  getShellChromeStoreContext,
} from "./runtime-context";

type Props = {
  open?: boolean;
  onToggle?: () => void;
};

const store = getParamsStoreContext();
const chrome = fromStore(getShellChromeStoreContext());
const parameterView = fromStore(getParameterWorkspaceViewStoreContext());

let { open = false, onToggle = () => {} }: Props = $props();

let view = $derived(parameterView.current);
let surface = $derived(chrome.current.tier === "phone" ? "sheet" : "tray");
let hasRebootFlaggedEdit = $derived(view.stagedEdits.some((edit) => edit.rebootRequired));
</script>

{#if view.stagedCount > 0}
  <section
    class={`pointer-events-auto fixed inset-x-0 bottom-0 z-30 px-3 pb-3 sm:px-4 ${surface === "sheet" ? "" : "md:left-auto md:right-6 md:max-w-2xl"}`}
    data-surface-kind={surface}
    data-testid={appShellTestIds.parameterReviewTray}
  >
    <div class="mx-auto max-w-5xl rounded-[26px] border border-border bg-bg-secondary/95 shadow-[0_-24px_80px_rgba(0,0,0,0.28)] backdrop-blur">
      <div class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div class="min-w-0">
          <p class="runtime-eyebrow">Parameter changes</p>
          <div class="mt-1 flex flex-wrap items-center gap-2">
            <h2 class="text-base font-semibold tracking-[-0.03em] text-text-primary sm:text-lg">
              {view.stagedCount} pending change{view.stagedCount === 1 ? "" : "s"}
            </h2>
            <span
              class="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.16em] text-accent"
              data-testid={appShellTestIds.parameterReviewCount}
            >
              {view.stagedCount} queued
            </span>
            {#if hasRebootFlaggedEdit}
              <span class="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.16em] text-warning">
                reboot needed
              </span>
            {/if}
          </div>
          <p class="mt-1 text-sm text-text-secondary">
            Review your staged parameter edits before applying them.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted" data-testid={appShellTestIds.parameterReviewState}>
            {open ? "open" : "closed"}
          </span>
          <button
            class="rounded-full border border-border bg-bg-primary/70 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-border-light"
            data-testid={appShellTestIds.parameterReviewToggle}
            onclick={onToggle}
            type="button"
          >
            {open ? "Hide changes" : "Review changes"}
          </button>
          <button
            class="rounded-full border border-border bg-bg-primary/70 px-4 py-2 text-sm font-semibold text-text-secondary transition hover:border-danger/40 hover:text-danger"
            data-testid={appShellTestIds.parameterReviewClear}
            onclick={() => store.clearStagedEdits()}
            type="button"
          >
            Clear all
          </button>
        </div>
      </div>

      {#if open}
        <div
          class={`border-t border-border/80 px-4 py-3 sm:px-5 ${surface === "sheet" ? "max-h-[60vh] overflow-y-auto" : "max-h-[22rem] overflow-y-auto"}`}
          data-testid={appShellTestIds.parameterReviewSurface}
        >
          <div class="space-y-3">
            {#each view.stagedEdits as edit (edit.name)}
              <article
                class="rounded-[22px] border border-border bg-bg-primary/80 p-4"
                data-param-name={edit.name}
                data-testid={`${appShellTestIds.parameterReviewRowPrefix}-${edit.name}`}
              >
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-sm font-semibold text-text-primary">{edit.label}</p>
                    <p class="mt-1 font-mono text-xs text-text-muted">{edit.rawName}</p>
                    {#if edit.description}
                      <p class="mt-2 text-sm leading-6 text-text-secondary">{edit.description}</p>
                    {/if}
                  </div>

                  <div class="flex items-start gap-2">
                    {#if edit.rebootRequired}
                      <span class="rounded-full border border-warning/40 bg-warning/10 px-2 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-warning">
                        reboot required
                      </span>
                    {/if}
                    <button
                      class="rounded-full border border-border bg-bg-secondary/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary transition hover:border-danger/40 hover:text-danger"
                      data-testid={`${appShellTestIds.parameterReviewDiscardPrefix}-${edit.name}`}
                      onclick={() => store.discardStagedEdit(edit.name)}
                      type="button"
                    >
                      Discard
                    </button>
                  </div>
                </div>

                <div class="mt-4 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
                  <span class="rounded-full border border-border bg-bg-secondary/70 px-3 py-1 font-mono text-xs text-text-muted">
                    {edit.currentValueText}{edit.units ? ` ${edit.units}` : ""}
                  </span>
                  <span class="text-text-muted">→</span>
                  <span class="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 font-mono text-xs font-semibold text-accent">
                    {edit.nextValueText}{edit.units ? ` ${edit.units}` : ""}
                  </span>
                </div>
              </article>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </section>
{/if}
