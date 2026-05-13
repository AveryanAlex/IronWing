<script lang="ts">
import type { Snippet } from "svelte";

type Props = { title: string; description?: string; testId?: string; actions?: Snippet };

let { title, description, testId, actions }: Props = $props();
</script>

<div
  class="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border-light p-6 text-center text-text-secondary"
  data-testid={testId}
>
  <p class="m-0 text-base font-semibold text-text-primary">{title}</p>
  {#if description}<p class="m-0 text-sm leading-5">{description}</p>{/if}
  {#if actions}<div class="flex gap-2">{@render actions()}</div>{/if}
</div>
