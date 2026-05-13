<script lang="ts">
import type { Snippet } from "svelte";

type Props = {
  eyebrow?: string;
  title: string;
  description?: string;
  testId?: string;
  icon?: Snippet;
  actions?: Snippet;
};

let { eyebrow, title, description, testId, icon, actions }: Props = $props();
</script>

<header class="flex flex-wrap items-start justify-between gap-3" data-testid={testId}>
  <div class="flex min-w-0 items-start gap-2">
    {#if icon}
      <span class="mt-1 inline-flex shrink-0 text-accent">{@render icon()}</span>
    {/if}
    <div class="min-w-0">
    {#if eyebrow}<p class="m-0 text-xs font-semibold uppercase tracking-wide text-text-muted">{eyebrow}</p>{/if}
    <h2 class="mt-1 text-base font-semibold text-text-primary">{title}</h2>
    {#if description}<p class="mt-1 text-sm leading-5 text-text-secondary">{description}</p>{/if}
    </div>
  </div>
  {#if actions}<div class="flex shrink-0 gap-2">{@render actions()}</div>{/if}
</header>
