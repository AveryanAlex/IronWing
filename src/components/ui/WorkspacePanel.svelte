<script lang="ts">
import type { Snippet } from "svelte";

type Props = { testId?: string; children: Snippet };

let { testId, children }: Props = $props();
</script>

<section class="ui-workspace-panel" data-testid={testId}>{@render children()}</section>

<style>
.ui-workspace-panel { display: flex; flex-direction: column; gap: var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--surface-panel); padding: var(--space-4); min-height: 0; }
</style>
