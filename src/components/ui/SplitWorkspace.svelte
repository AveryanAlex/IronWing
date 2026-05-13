<script lang="ts">
import type { Snippet } from "svelte";

type Props = {
  primaryMin?: string;
  primaryMax?: string;
  testId?: string;
  primary: Snippet;
  secondary: Snippet;
};

let { primaryMin = "0", primaryMax = "1fr", testId, primary, secondary }: Props = $props();
</script>

<div
  class="grid min-h-0 grid-cols-[minmax(var(--split-primary-min),var(--split-primary-max))_minmax(280px,360px)] gap-[var(--workspace-gutter-split)] max-[1024px]:grid-cols-1"
  data-testid={testId}
  style="--split-primary-min: {primaryMin}; --split-primary-max: {primaryMax};"
>
  <div class="min-h-0 min-w-0">{@render primary()}</div>
  <div class="min-h-0 min-w-0">{@render secondary()}</div>
</div>
