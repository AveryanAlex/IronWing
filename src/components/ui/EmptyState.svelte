<script lang="ts">
import type { Snippet } from "svelte";
import { cn } from "../../lib/utils";

type Props = {
  title: string;
  description?: string;
  icon?: Snippet;
  actions?: Snippet;
  class?: string;
  testId?: string;
};

let { title, description, icon, actions, class: className, testId }: Props = $props();
</script>

<div
  class={cn(
    "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-light bg-surface-card/60 p-6 text-center text-text-secondary",
    className,
  )}
  data-testid={testId}
>
  {#if icon}<div class="text-text-muted" aria-hidden="true">{@render icon()}</div>{/if}
  <p class="m-0 text-base font-semibold text-text-primary">{title}</p>
  {#if description}<p class="m-0 text-sm leading-5">{description}</p>{/if}
  {#if actions}<div class="flex flex-wrap justify-center gap-2">{@render actions()}</div>{/if}
</div>
