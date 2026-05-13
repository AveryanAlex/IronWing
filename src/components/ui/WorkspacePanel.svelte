<script lang="ts">
import type { Snippet } from "svelte";

type Props = { testId?: string; children: Snippet };

let { testId, children }: Props = $props();
</script>

<section
  class="flex min-h-0 flex-col gap-3 rounded-lg border border-border bg-surface-panel p-4"
  data-testid={testId}
>
  {@render children()}
</section>
