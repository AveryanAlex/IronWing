<script lang="ts">
import type { Snippet } from "svelte";

type Props = { testId?: string; children: Snippet };

let { testId, children }: Props = $props();
</script>

<div class="ui-workspace-body" data-testid={testId}>{@render children()}</div>

<style>
.ui-workspace-body { display: flex; flex-direction: column; gap: var(--space-4); min-height: 0; }
</style>
