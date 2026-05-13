<script lang="ts">
import type { Snippet } from "svelte";

type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  testId?: string;
  actions?: Snippet;
};

let { eyebrow, title, description, testId, actions }: Props = $props();
</script>

<header class="flex flex-wrap items-start justify-between gap-[var(--space-3)]" data-testid={testId}>
  <div class="min-w-0">
    {#if eyebrow}<p class="m-0 text-[0.72rem] font-bold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">{eyebrow}</p>{/if}
    <h2 class="mt-1.5 text-[1.05rem] font-[650] text-[var(--color-text-primary)]">{title}</h2>
    {#if description}<p class="mt-1.5 text-[0.92rem] leading-[1.5] text-[var(--color-text-secondary)]">{description}</p>{/if}
  </div>
  {#if actions}<div class="flex shrink-0 gap-[var(--space-2)]">{@render actions()}</div>{/if}
</header>
