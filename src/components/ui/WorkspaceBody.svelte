<script lang="ts">
import type { Snippet } from "svelte";

type Props = { testId?: string; children: Snippet };

let { testId, children }: Props = $props();
</script>

<div class="flex min-h-0 flex-col gap-[var(--space-4)]" data-testid={testId}>{@render children()}</div>
