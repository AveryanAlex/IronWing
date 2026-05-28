<script lang="ts">
import type { Snippet } from "svelte";
import { Button, Card, Eyebrow, MonoValue, SelectableCard } from "../../../components/ui";

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

<Card.Root surface="default" density="compact" tone="info" appearance="solid">
  <Eyebrow class="mb-3">
    {resolvedHeader}
  </Eyebrow>

  <div class="flex min-w-0 flex-col gap-1">
    {#each rows as row (row.key)}
      <SelectableCard
        density="compact"
        variant="ghost"
        class={`flex min-w-0 items-start gap-2 rounded-lg px-2 py-2 text-left text-xs transition-colors ${row.willChange ? onRowClick ? "cursor-pointer text-text-primary hover:bg-accent/10" : "text-text-primary" : "cursor-default text-text-muted"}`}
        disabled={!row.willChange || !onRowClick}
        onSelect={() => onRowClick?.(row)}
      >
        <span
          class={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${row.willChange ? "bg-accent" : "bg-text-muted/30"}`}
        ></span>
        <span class="grid min-w-0 flex-1 gap-1 sm:grid-cols-[minmax(7rem,1fr)_minmax(6rem,auto)_auto] sm:items-start">
          <span class="min-w-0 break-words font-medium">{row.label}</span>
          {#if row.detail}
            <span class="min-w-0 break-words text-text-secondary">{row.detail}</span>
          {/if}
          {#if row.paramName}
            <MonoValue class="min-w-0" size="xs" tone="muted" wrap>{row.paramName}</MonoValue>
          {/if}
          {#if !row.willChange}
            <span class="text-xs text-text-muted/70 sm:justify-self-end">already set</span>
          {/if}
        </span>
      </SelectableCard>
    {/each}
  </div>

  {#if footer}
    <div class="mt-3">
      {@render footer()}
    </div>
  {/if}

  <div class="mt-4 flex items-center gap-2">
    <Button
      size="sm"
      tone="accent"
      variant="soft"
      disabled={resolvedStageDisabled}
      onclick={onStage}
    >
      {resolvedStageLabel}
    </Button>
    <Button
      variant="ghost"
      size="sm"
      tone="neutral"
      onclick={onCancel}
    >
      Cancel
    </Button>
  </div>
</Card.Root>
