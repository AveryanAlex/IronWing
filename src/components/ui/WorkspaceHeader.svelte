<script lang="ts">
import type { Snippet } from "svelte";

type Props = {
  title: string;
  eyebrow?: string;
  description?: string;
  testId?: string;
  status?: Snippet;
  actions?: Snippet;
};

let { title, eyebrow, description, testId, status, actions }: Props = $props();
</script>

<header class="flex flex-wrap items-start justify-between gap-[var(--space-3)]" data-testid={testId}>
  <div class="min-w-0">
    {#if eyebrow}<p class="m-0 text-[0.72rem] font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">{eyebrow}</p>{/if}
    <h1 class="mt-1.5 text-[1.25rem] font-[650]">{title}</h1>
    {#if description}<p class="mt-1.5 max-w-[60ch] text-[0.94rem] leading-[1.5] text-[var(--color-text-secondary)]">{description}</p>{/if}
    {#if status}<div class="mt-2 flex flex-wrap gap-[var(--space-2)]">{@render status()}</div>{/if}
  </div>
  {#if actions}<div class="flex shrink-0 gap-[var(--space-2)]">{@render actions()}</div>{/if}
</header>
