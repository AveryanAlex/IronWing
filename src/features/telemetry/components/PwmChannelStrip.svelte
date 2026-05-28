<script lang="ts">
import { Alert, Badge, Card, Eyebrow } from "../../../components/ui";
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

<Card.Root as="section" class="min-w-0" density="compact" gap="none" surface="primary">
  {#if title}
    <div class="mb-3 flex items-center justify-between gap-2">
      <Eyebrow tracking="widest">{title}</Eyebrow>
      <Badge variant="muted" size="sm">
        {normalizedItems.length} shown
      </Badge>
    </div>
  {/if}

  {#if normalizedItems.length === 0}
    <Alert variant="info" density="compact" description={emptyText} />
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
</Card.Root>
