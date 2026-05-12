<script lang="ts">
import type { Snippet } from "svelte";

type Props = { ariaLabel?: string; testId?: string; children: Snippet };

let { ariaLabel, testId, children }: Props = $props();
</script>

<div class="ui-toolbar" role="toolbar" aria-label={ariaLabel} data-testid={testId}>{@render children()}</div>

<style>
.ui-toolbar { display: flex; align-items: center; gap: var(--space-2); flex-wrap: nowrap; min-width: 0; }
.ui-toolbar > * { flex-shrink: 0; }
</style>
