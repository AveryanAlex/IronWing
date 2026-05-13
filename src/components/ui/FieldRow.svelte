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
    "grid gap-[var(--space-3)] border-b [border-bottom-color:color-mix(in_srgb,var(--color-border)_50%,transparent)] py-[var(--space-3)]",
    layout === "row"
      ? "grid-cols-1 items-center md:grid-cols-[minmax(0,1fr)_minmax(160px,auto)]"
      : "grid-cols-1",
  ]}
  data-layout={layout}
  data-testid={testId}
>
  <div class="min-w-0">
    <label class="text-[0.92rem] font-semibold text-[var(--color-text-primary)]" for={htmlFor}>{label}</label>
    {#if description}<p class="mt-1 text-[0.82rem] leading-[1.45] text-[var(--color-text-secondary)]">{description}</p>{/if}
  </div>
  <div class="flex items-center justify-start gap-[var(--space-2)] md:justify-end">{@render control()}</div>
</div>
