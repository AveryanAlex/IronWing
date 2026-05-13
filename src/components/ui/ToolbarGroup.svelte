<script lang="ts">
import type { Snippet } from "svelte";

type Props = { testId?: string; children: Snippet };

let { testId, children }: Props = $props();
</script>

<div
  class="inline-flex items-center gap-1 rounded-md border border-border-light bg-bg-secondary p-0.5"
  data-testid={testId}
>
  {@render children()}
</div>
