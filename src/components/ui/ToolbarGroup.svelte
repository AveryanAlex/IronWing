<script lang="ts">
import type { Snippet } from "svelte";

type Props = { testId?: string; children: Snippet };

let { testId, children }: Props = $props();
</script>

<div
  class="inline-flex items-center gap-[var(--space-1)] rounded-[var(--radius-sm)] border border-[var(--color-border-light)] bg-[var(--color-bg-primary)] p-[2px]"
  data-testid={testId}
>
  {@render children()}
</div>
