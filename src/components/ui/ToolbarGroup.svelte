<script lang="ts">
import type { Snippet } from "svelte";

type Props = { testId?: string; children: Snippet };

let { testId, children }: Props = $props();
</script>

<div
  class="inline-flex items-center gap-1 border-l border-border-light pl-2 first:border-l-0 first:pl-0"
  data-testid={testId}
>
  {@render children()}
</div>
