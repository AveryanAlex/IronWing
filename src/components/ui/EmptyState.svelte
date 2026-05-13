<script lang="ts">
import type { Snippet } from "svelte";

type Props = { title: string; description?: string; testId?: string; actions?: Snippet };

let { title, description, testId, actions }: Props = $props();
</script>

<div
  class="flex flex-col items-center justify-center gap-[var(--space-3)] rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-light)] p-[var(--space-6)] text-center text-[var(--color-text-secondary)]"
  data-testid={testId}
>
  <p class="m-0 font-semibold text-[var(--color-text-primary)]">{title}</p>
  {#if description}<p class="m-0 text-[0.92rem] leading-[1.5]">{description}</p>{/if}
  {#if actions}<div class="flex gap-[var(--space-2)]">{@render actions()}</div>{/if}
</div>
