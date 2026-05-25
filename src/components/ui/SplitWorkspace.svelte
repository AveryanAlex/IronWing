<script lang="ts">
import type { Snippet } from "svelte";

type Props = {
  primaryMin?: string;
  primaryMax?: string;
  gutter?: string;
  testId?: string;
  primary: Snippet;
  secondary: Snippet;
};

let { primaryMin = "0", primaryMax = "1fr", gutter = "var(--workspace-gutter-split)", testId, primary, secondary }: Props = $props();
</script>

<div
  class="grid h-full min-h-0 grid-cols-[minmax(var(--split-primary-min),var(--split-primary-max))_minmax(280px,1fr)] gap-[var(--split-gutter)] max-[1024px]:grid-cols-1"
  data-testid={testId}
  style="--split-primary-min: {primaryMin}; --split-primary-max: {primaryMax}; --split-gutter: {gutter};"
>
  <div class="flex min-h-0 min-w-0 flex-col overflow-hidden">{@render primary()}</div>
  <div class="flex min-h-0 min-w-0 flex-col overflow-hidden">{@render secondary()}</div>
</div>
