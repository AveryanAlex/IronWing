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

<section class="flex flex-col gap-[var(--space-2)]" data-testid={testId} style="--ui-metric-columns: {columns};">
  {#if label}
    <header class="text-[0.72rem] font-bold tracking-[0.16em] text-[var(--color-text-muted)] uppercase">{label}</header>
  {/if}
  <div class="grid grid-cols-[repeat(var(--ui-metric-columns,4),minmax(0,1fr))] gap-[var(--space-3)] max-[1024px]:grid-cols-2 max-[480px]:grid-cols-1">
    {@render children()}
  </div>
</section>
