<script lang="ts">
import type { Snippet } from "svelte";

type Props = {
  ariaLabel?: string;
  testId?: string;
  split?: boolean;
  children: Snippet;
};

let { ariaLabel, testId, split = false, children }: Props = $props();
</script>

<div class="@container min-w-0 w-full" data-split={split || undefined}>
  <div
    class={`flex w-full min-w-0 flex-nowrap items-center gap-[clamp(6px,1cqi,var(--adaptive-rail-gap,14px))] [&>*]:min-w-0 ${split ? "[&>*:last-child]:ml-auto" : ""}`}
    aria-label={ariaLabel}
    data-testid={testId}
  >
    {@render children()}
  </div>
</div>
