<script lang="ts">
import PwmVerticalBar, { type PwmBarState } from "./PwmVerticalBar.svelte";

const MIN_COLUMN_WIDTH_PX = 42;
const GRID_GAP_PX = 6;

export type PwmChannelItem = {
  index: number;
  value: number | null;
  stale?: boolean;
  state?: PwmBarState;
};

type Props = {
  title?: string;
  values?: number[] | null;
  items?: PwmChannelItem[];
  labelPrefix?: string;
  maxVisible?: number;
  emptyText?: string;
  testIdPrefix?: string;
};

let {
  title,
  values = null,
  items,
  labelPrefix = "CH",
  maxVisible = 18,
  emptyText = "No PWM samples available.",
  testIdPrefix,
}: Props = $props();

let gridWidth = $state(0);

let normalizedItems = $derived.by<PwmChannelItem[]>(() => {
  if (items) return items.slice(0, maxVisible);
  if (!values?.length) return [];

  return values.slice(0, maxVisible).map((value, index) => ({
    index: index + 1,
    value: typeof value === "number" && Number.isFinite(value) ? value : null,
    state: typeof value === "number" && Number.isFinite(value) ? "live" : "malformed",
  }));
});

let columnCount = $derived.by(() => {
  const itemCount = normalizedItems.length;
  if (itemCount === 0) return 1;

  const maxColumnsByWidth = gridWidth > 0
    ? Math.max(1, Math.floor((gridWidth + GRID_GAP_PX) / (MIN_COLUMN_WIDTH_PX + GRID_GAP_PX)))
    : itemCount;
  const maxColumns = Math.min(itemCount, maxColumnsByWidth);
  const rowCount = Math.ceil(itemCount / maxColumns);

  return Math.ceil(itemCount / rowCount);
});
</script>

<section class="min-w-0 rounded-lg border border-border bg-bg-primary/80 p-3">
  {#if title}
    <div class="mb-3 flex items-center justify-between gap-2">
      <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">{title}</p>
      <span class="rounded-full border border-border bg-bg-secondary px-2 py-1 text-xs font-semibold uppercase tracking-widest text-text-secondary">
        {normalizedItems.length} shown
      </span>
    </div>
  {/if}

  {#if normalizedItems.length === 0}
    <div class="rounded-md border border-border bg-bg-secondary/70 px-3 py-3 text-sm text-text-secondary">{emptyText}</div>
  {:else}
    <div
      bind:clientWidth={gridWidth}
      class="grid gap-1.5"
      style:grid-template-columns={`repeat(${columnCount}, minmax(${MIN_COLUMN_WIDTH_PX}px, 1fr))`}
    >
      {#each normalizedItems as item (item.index)}
        <PwmVerticalBar
          label={`${labelPrefix}${item.index}`}
          value={item.value}
          state={item.stale ? "stale" : item.state ?? "live"}
          testId={testIdPrefix ? `${testIdPrefix}-${item.index}` : undefined}
        />
      {/each}
    </div>
  {/if}
</section>
