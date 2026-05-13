<script lang="ts">
import type { Snippet } from "svelte";

type Props = { columns?: number; testId?: string; children: Snippet };

let { columns = 2, testId, children }: Props = $props();
</script>

<div
  class="grid grid-cols-[repeat(var(--ui-grid-columns,2),minmax(0,1fr))] gap-[var(--space-4)] max-[900px]:grid-cols-1"
  data-testid={testId}
  style="--ui-grid-columns: {columns};"
>
  {@render children()}
</div>
