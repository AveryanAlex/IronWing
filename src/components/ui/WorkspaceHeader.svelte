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

<header class="flex flex-wrap items-start justify-between gap-3" data-testid={testId}>
  <div class="min-w-0">
    {#if eyebrow}<p class="m-0 text-xs font-semibold uppercase tracking-wide text-text-muted">{eyebrow}</p>{/if}
    <h1 class="mt-1 text-lg font-semibold text-text-primary">{title}</h1>
    {#if description}<p class="mt-1 max-w-[60ch] text-sm leading-5 text-text-secondary">{description}</p>{/if}
    {#if status}<div class="mt-2 flex flex-wrap gap-2">{@render status()}</div>{/if}
  </div>
  {#if actions}<div class="flex shrink-0 gap-2">{@render actions()}</div>{/if}
</header>
