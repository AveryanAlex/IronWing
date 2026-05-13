<script lang="ts">
import type { Snippet } from "svelte";

type Layout = "row" | "stacked";

type Props = {
  label: string;
  description?: string;
  htmlFor?: string;
  layout?: Layout;
  testId?: string;
  control: Snippet;
};

let { label, description, htmlFor, layout = "row", testId, control }: Props = $props();
</script>

<div
  class={[
    "grid gap-3 border-b border-border/50 py-3",
    layout === "row"
      ? "grid-cols-1 items-center md:grid-cols-[minmax(0,1fr)_minmax(160px,auto)]"
      : "grid-cols-1",
  ]}
  data-layout={layout}
  data-testid={testId}
>
  <div class="min-w-0">
    <label class="text-sm font-medium text-text-primary" for={htmlFor}>{label}</label>
    {#if description}<p class="mt-1 text-sm leading-5 text-text-secondary">{description}</p>{/if}
  </div>
  <div class="flex items-center justify-start gap-2 md:justify-end">{@render control()}</div>
</div>
