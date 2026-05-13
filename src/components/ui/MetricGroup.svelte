<script lang="ts">
import type { Snippet } from "svelte";

type Props = {
  label?: string;
  columns?: number;
  testId?: string;
  children: Snippet;
};

let { label, columns = 4, testId, children }: Props = $props();
</script>

<section class="flex flex-col gap-2" data-testid={testId} style="--ui-metric-columns: {columns};">
  {#if label}
    <header class="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</header>
  {/if}
  <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[repeat(var(--ui-metric-columns,4),minmax(0,1fr))]">
    {@render children()}
  </div>
</section>
