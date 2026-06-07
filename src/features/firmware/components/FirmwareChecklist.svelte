<script lang="ts">
import type { FirmwareChecklistItem } from "../firmware-flow";
import { checklistMarker, checklistStateLabel, checklistToneClass } from "../firmware-flow";

type Props = {
  items: FirmwareChecklistItem[];
  testId?: string;
};

let { items, testId }: Props = $props();
</script>

<div class="grid gap-2" data-testid={testId}>
  {#each items as item (`${item.label}:${item.state}:${item.detail ?? ""}`)}
    <div class="flex gap-3 rounded-lg border border-border bg-bg-secondary p-3">
      <span class={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${checklistToneClass(item.state)}`} aria-hidden="true">
        {checklistMarker(item.state)}
      </span>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <p class="m-0 text-sm font-semibold text-text-primary">{item.label}</p>
          <span class="rounded-full border border-border bg-surface-card px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wide text-text-muted">
            {checklistStateLabel(item.state)}
          </span>
        </div>
        {#if item.detail}
          <p class="m-0 mt-1 text-xs leading-5 text-text-secondary">{item.detail}</p>
        {/if}
        {#if item.actionLabel}
          <p class="m-0 mt-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Next: {item.actionLabel}</p>
        {/if}
      </div>
    </div>
  {/each}
</div>
