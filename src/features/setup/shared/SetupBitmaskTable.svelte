<script lang="ts">
import { CheckSquare, Square } from "lucide-svelte";

import { Badge, Button, Card, Checkbox, Eyebrow, HelperText } from "../../../components/ui";

export type SetupBitmaskTableItem = {
  key: string;
  label: string;
  description?: string;
  checked: boolean;
  supported?: boolean;
  hint?: string;
};

type Props = {
  title?: string;
  description?: string;
  items: SetupBitmaskTableItem[];
  disabled?: boolean;
  embedded?: boolean;
  selectAllLabel?: string;
  clearAllLabel?: string;
  onToggle?: (item: SetupBitmaskTableItem, checked: boolean) => void;
  onSetAll?: (checked: boolean) => void;
};

let {
  title,
  description,
  items,
  disabled = false,
  embedded = false,
  selectAllLabel = "Select all",
  clearAllLabel = "Clear all",
  onToggle,
  onSetAll,
}: Props = $props();

let supportedItems = $derived(items.filter((item) => item.supported !== false));
let hasSupportedItems = $derived(supportedItems.length > 0);
let canEdit = $derived(Boolean(onToggle) && !disabled);
let canBulkEdit = $derived(Boolean(onSetAll) && !disabled && hasSupportedItems);
let selectedCount = $derived(supportedItems.filter((item) => item.checked).length);
let allSelected = $derived(hasSupportedItems && selectedCount === supportedItems.length);
let noneSelected = $derived(selectedCount === 0);

function badgeVariant(item: SetupBitmaskTableItem): "accent" | "muted" | "warning" {
  if (item.supported === false) {
    return "warning";
  }

  return item.checked ? "accent" : "muted";
}
</script>

{#snippet content()}
  {#if title || description || onSetAll}
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0">
        {#if title}
          <Eyebrow tracking="widest">{title}</Eyebrow>
        {/if}
        {#if description}
          <HelperText class={title ? "mt-1" : ""}>{description}</HelperText>
        {/if}
      </div>

      {#if onSetAll}
        <div class="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" variant="soft" tone="accent" disabled={!canBulkEdit || allSelected} onclick={() => onSetAll?.(true)}>
            <CheckSquare size={14} aria-hidden="true" />
            {selectAllLabel}
          </Button>
          <Button size="sm" variant="soft" tone="neutral" disabled={!canBulkEdit || noneSelected} onclick={() => onSetAll?.(false)}>
            <Square size={14} aria-hidden="true" />
            {clearAllLabel}
          </Button>
        </div>
      {/if}
    </div>
  {/if}

  <div class="overflow-hidden rounded-lg border border-border">
    <div class="hidden grid-cols-[minmax(7rem,0.9fr)_minmax(12rem,1.7fr)_auto] gap-3 border-b border-border bg-bg-secondary px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-muted md:grid">
      <span>Setting</span>
      <span>What it controls</span>
      <span class="text-right">State</span>
    </div>

    <div class="divide-y divide-border/70">
      {#each items as item (item.key)}
        <div class="grid gap-3 bg-bg-primary/70 p-3 md:grid-cols-[minmax(7rem,0.9fr)_minmax(12rem,1.7fr)_auto] md:items-start">
          <Checkbox
            checked={item.checked}
            disabled={!canEdit || item.supported === false}
            label={item.label}
            onCheckedChange={(checked) => onToggle?.(item, checked)}
          />

          <div class="text-sm leading-5 text-text-secondary">
            {#if item.description}
              <p>{item.description}</p>
            {/if}
            {#if item.hint}
              <p class={`mt-1 text-xs leading-5 ${item.supported === false ? "text-warning" : "text-text-muted"}`}>{item.hint}</p>
            {/if}
          </div>

          <div class="flex md:justify-end">
            <Badge variant={badgeVariant(item)} size="sm" case="normal" shape="pill">
              {#if item.supported === false}
                unavailable
              {:else if item.checked}
                enabled
              {:else}
                disabled
              {/if}
            </Badge>
          </div>
        </div>
      {/each}
    </div>
  </div>
{/snippet}

{#if embedded}
  <div class="flex flex-col gap-3">
    {@render content()}
  </div>
{:else}
  <Card.Root surface="elevated" density="compact" gap="compact">
    {@render content()}
  </Card.Root>
{/if}
