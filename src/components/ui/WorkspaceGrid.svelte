<script lang="ts">
import type { Snippet } from "svelte";

type Props = { columns?: number; testId?: string; children: Snippet };

let { columns = 2, testId, children }: Props = $props();
</script>

<div class="ui-workspace-grid" data-testid={testId} style="--ui-grid-columns: {columns};">{@render children()}</div>

<style>
.ui-workspace-grid { display: grid; gap: var(--space-4); grid-template-columns: repeat(var(--ui-grid-columns, 2), minmax(0, 1fr)); }
@media (max-width: 900px) { .ui-workspace-grid { grid-template-columns: 1fr; } }
</style>
