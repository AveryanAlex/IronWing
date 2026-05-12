<script lang="ts">
import type { Snippet } from "svelte";

type Props = { testId?: string; children: Snippet };

let { testId, children }: Props = $props();
</script>

<div class="ui-toolbar-group" data-testid={testId}>{@render children()}</div>

<style>
.ui-toolbar-group { display: inline-flex; align-items: center; gap: var(--space-1); padding: 2px; border: 1px solid var(--color-border-light); border-radius: var(--radius-sm); background: var(--color-bg-primary); }
</style>
