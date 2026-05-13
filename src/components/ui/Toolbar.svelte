<script lang="ts">
import type { Snippet } from "svelte";

type Density = "comfortable" | "compact" | "tight";
type Overflow = "visible" | "scroll";

type Props = {
  ariaLabel?: string;
  testId?: string;
  wrap?: boolean;
  density?: Density;
  overflow?: Overflow;
  children: Snippet;
};

let {
  ariaLabel,
  testId,
  wrap = false,
  density = "comfortable",
  overflow = "visible",
  children,
}: Props = $props();

let toolbarClass = $derived([
  "flex max-w-full min-w-0 flex-nowrap items-center gap-2 [scrollbar-width:thin] [&>*]:shrink-0",
  density === "compact" ? "gap-1.5" : "",
  density === "tight" ? "gap-1" : "",
  wrap ? "flex-wrap" : "",
  overflow === "scroll" ? "overflow-x-auto overflow-y-hidden" : "",
].filter(Boolean).join(" "));
</script>

<div
  class={toolbarClass}
  data-density={density}
  data-overflow={overflow}
  data-wrap={wrap || undefined}
  role="toolbar"
  aria-label={ariaLabel}
  data-testid={testId}
>{@render children()}</div>
