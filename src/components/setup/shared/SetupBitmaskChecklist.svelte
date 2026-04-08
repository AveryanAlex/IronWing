<script lang="ts">
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
</script>

<div class="space-y-3 rounded-2xl border border-border bg-bg-primary/80 p-4">
  {#if title}
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">{title}</p>
      <p class="mt-1 text-sm text-text-secondary">Selected capabilities stay explicit even when some flags are unavailable.</p>
    </div>
  {/if}

  <div class="grid gap-2 md:grid-cols-2">
    {#each items as item (item.key)}
      <button
        class={`rounded-2xl border px-3 py-3 text-left transition ${itemTone(item)} ${onToggle && !disabled && item.supported !== false ? "hover:border-accent hover:text-text-primary" : "cursor-default"}`}
        disabled={!onToggle || disabled || item.supported === false}
        onclick={() => onToggle?.(item)}
        type="button"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-text-primary">{item.label}</p>
            {#if item.description}
              <p class="mt-1 text-xs leading-5 text-text-secondary">{item.description}</p>
            {/if}
          </div>
          <span class="rounded-full border border-border bg-bg-secondary px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary">
            {#if item.supported === false}
              unsupported
            {:else if item.checked}
              enabled
            {:else}
              disabled
            {/if}
          </span>
        </div>

        {#if item.hint}
          <p class={`mt-3 text-xs leading-5 ${item.supported === false ? "text-warning" : "text-text-muted"}`}>
            {item.hint}
          </p>
        {/if}
      </button>
    {/each}
  </div>
</div>
