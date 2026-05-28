<script lang="ts">
import { Badge, Card, Eyebrow, HelperText, SelectableCard } from "../../../components/ui";

export type SetupBitmaskChecklistItem = {
  key: string;
  label: string;
  description?: string;
  checked: boolean;
  supported?: boolean;
  hint?: string;
};

let {
  title,
  items,
  onToggle,
  disabled = false,
}: {
  title?: string;
  items: SetupBitmaskChecklistItem[];
  onToggle?: (item: SetupBitmaskChecklistItem) => void;
  disabled?: boolean;
} = $props();

function itemTone(item: SetupBitmaskChecklistItem): string {
  if (item.supported === false) {
    return "border-warning/30 bg-warning/10";
  }

  if (item.checked) {
    return "border-accent/40 bg-accent/10";
  }

  return "border-border bg-bg-primary/80";
}

function itemBadgeVariant(item: SetupBitmaskChecklistItem): "accent" | "muted" | "warning" {
  if (item.supported === false) {
    return "warning";
  }

  return item.checked ? "accent" : "muted";
}
</script>

<Card.Root surface="elevated" density="compact" gap="compact">
  {#if title}
    <div>
      <Eyebrow tracking="widest">{title}</Eyebrow>
      <HelperText class="mt-1">Selected capabilities stay explicit even when some flags are unavailable.</HelperText>
    </div>
  {/if}

  <div class="grid gap-2 md:grid-cols-2">
    {#each items as item (item.key)}
      <SelectableCard
        density="compact"
        selected={item.checked}
        class={`${itemTone(item)} ${onToggle && !disabled && item.supported !== false ? "hover:border-accent hover:text-text-primary" : "cursor-default"}`}
        disabled={!onToggle || disabled || item.supported === false}
        onSelect={() => onToggle?.(item)}
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-text-primary">{item.label}</p>
            {#if item.description}
              <p class="mt-1 text-xs leading-5 text-text-secondary">{item.description}</p>
            {/if}
          </div>
          <Badge variant={itemBadgeVariant(item)} size="sm" case="normal" shape="pill">
            {#if item.supported === false}
              unsupported
            {:else if item.checked}
              enabled
            {:else}
              disabled
            {/if}
          </Badge>
        </div>

        {#if item.hint}
          <p class={`mt-3 text-xs leading-5 ${item.supported === false ? "text-warning" : "text-text-muted"}`}>
            {item.hint}
          </p>
        {/if}
      </SelectableCard>
    {/each}
  </div>
</Card.Root>
