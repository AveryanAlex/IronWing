<script lang="ts">
import type { Snippet } from "svelte";

export type SetupPreviewStageRow = {
  key: string;
  label: string;
  paramName?: string;
  detail?: string;
  willChange: boolean;
};

let {
  rows,
  headerLabel,
  stageLabel,
  onStage,
  onCancel,
  onRowClick,
  footer,
  stageDisabled = false,
}: {
  rows: SetupPreviewStageRow[];
  headerLabel?: string;
  stageLabel?: string;
  onStage: () => void;
  onCancel: () => void;
  onRowClick?: (row: SetupPreviewStageRow) => void;
  footer?: Snippet;
  stageDisabled?: boolean;
} = $props();

let changeCount = $derived(rows.filter((row) => row.willChange).length);
let resolvedHeader = $derived(headerLabel ?? `Preview: ${changeCount} of ${rows.length} will change`);
let resolvedStageLabel = $derived(stageLabel ?? `Stage ${changeCount} Change${changeCount === 1 ? "" : "s"}`);
let resolvedStageDisabled = $derived(stageDisabled || changeCount === 0);
</script>

<div class="rounded-2xl border border-accent/20 bg-accent/5 p-4">
  <div class="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
    {resolvedHeader}
  </div>

  <div class="flex flex-col gap-1">
    {#each rows as row (row.key)}
      <button
        class={`flex items-center gap-2 rounded-xl px-2 py-2 text-left text-xs transition-colors ${row.willChange ? onRowClick ? "cursor-pointer text-text-primary hover:bg-accent/10" : "text-text-primary" : "cursor-default text-text-muted"}`}
        disabled={!row.willChange || !onRowClick}
        onclick={() => onRowClick?.(row)}
        type="button"
      >
        <span
          class={`h-1.5 w-1.5 shrink-0 rounded-full ${row.willChange ? "bg-accent" : "bg-text-muted/30"}`}
        ></span>
        <span class="font-medium">{row.label}</span>
        {#if row.detail}
          <span class="text-text-secondary">{row.detail}</span>
        {/if}
        {#if row.paramName}
          <span class="font-mono text-[10px] text-text-muted">{row.paramName}</span>
        {/if}
        {#if !row.willChange}
          <span class="ml-auto text-[10px] text-text-muted/70">already set</span>
        {/if}
      </button>
    {/each}
  </div>

  {#if footer}
    <div class="mt-3">
      {@render footer()}
    </div>
  {/if}

  <div class="mt-4 flex items-center gap-2">
    <button
      class="rounded-full bg-accent/15 px-4 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
      disabled={resolvedStageDisabled}
      onclick={onStage}
      type="button"
    >
      {resolvedStageLabel}
    </button>
    <button
      class="rounded-full px-4 py-2 text-xs font-medium text-text-muted transition-colors hover:text-text-secondary"
      onclick={onCancel}
      type="button"
    >
      Cancel
    </button>
  </div>
</div>
