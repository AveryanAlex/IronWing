<script lang="ts">
import { Alert, Badge, BalancedGrid, Card, Eyebrow } from "../../../components/ui";
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

let normalizedItems = $derived.by<PwmChannelItem[]>(() => {
  if (items) return items.slice(0, maxVisible);
  if (!values?.length) return [];

  return values.slice(0, maxVisible).map((value, index) => ({
    index: index + 1,
    value: typeof value === "number" && Number.isFinite(value) ? value : null,
    state: typeof value === "number" && Number.isFinite(value) ? "live" : "malformed",
  }));
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
    <BalancedGrid
      minItemWidth={`${MIN_COLUMN_WIDTH_PX}px`}
      minItemWidthPx={MIN_COLUMN_WIDTH_PX}
      gapPx={GRID_GAP_PX}
      itemCount={normalizedItems.length}
      class="gap-1.5"
    >
      {#each normalizedItems as item (item.index)}
        <PwmVerticalBar
          label={`${labelPrefix}${item.index}`}
          value={item.value}
          state={item.stale ? "stale" : item.state ?? "live"}
          testId={testIdPrefix ? `${testIdPrefix}-${item.index}` : undefined}
        />
      {/each}
    </BalancedGrid>
  {/if}
</Card.Root>
