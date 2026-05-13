<script lang="ts">
import type { Snippet } from "svelte";

type Props = { testId?: string; children: Snippet };

let { testId, children }: Props = $props();
</script>

<section
  class="flex min-h-0 flex-col gap-[var(--space-3)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--surface-panel)] p-[var(--space-4)]"
  data-testid={testId}
>
  {@render children()}
</section>
