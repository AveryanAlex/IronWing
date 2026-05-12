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

<section class="ui-metric-group" data-testid={testId} style="--ui-metric-columns: {columns};">
  {#if label}<header class="ui-metric-group__label">{label}</header>{/if}
  <div class="ui-metric-group__grid">{@render children()}</div>
</section>

<style>
.ui-metric-group { display: flex; flex-direction: column; gap: var(--space-2); }
.ui-metric-group__label { color: var(--color-text-muted); font-size: 0.72rem; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; }
.ui-metric-group__grid {
  display: grid;
  gap: var(--space-3);
  grid-template-columns: repeat(var(--ui-metric-columns, 4), minmax(0, 1fr));
}
@media (max-width: 1024px) { .ui-metric-group__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 480px)  { .ui-metric-group__grid { grid-template-columns: 1fr; } }
</style>
