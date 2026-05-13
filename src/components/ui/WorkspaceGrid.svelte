<script lang="ts">
import type { Snippet } from "svelte";

type Props = { columns?: number; testId?: string; children: Snippet };

let { columns = 2, testId, children }: Props = $props();
</script>

<div
  class="grid grid-cols-1 gap-4 md:grid-cols-[repeat(var(--ui-grid-columns,2),minmax(0,1fr))]"
  data-testid={testId}
  style="--ui-grid-columns: {columns};"
>
  {@render children()}
</div>
