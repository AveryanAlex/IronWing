<script lang="ts">
import { Toolbar as BitsToolbar } from "bits-ui";
import type { ToolbarRootProps } from "bits-ui";
import type { Snippet } from "svelte";
import { cn } from "../../lib/utils";

type Density = "comfortable" | "compact" | "tight";
type Overflow = "visible" | "scroll";

type Props = Omit<ToolbarRootProps, "aria-label" | "child" | "children" | "class"> & {
  ariaLabel?: string;
  testId?: string;
  wrap?: boolean;
  density?: Density;
  overflow?: Overflow;
  class?: string;
  children?: Snippet;
};

let {
  ariaLabel,
  testId,
  wrap = false,
  density = "comfortable",
  overflow = "visible",
  orientation = "horizontal",
  loop = true,
  class: className,
  children,
  ...restProps
}: Props = $props();

let toolbarClass = $derived(
  cn(
    "flex max-w-full min-w-0 flex-nowrap items-center gap-2 [scrollbar-width:thin] [&>*]:shrink-0",
    density === "compact" && "gap-1.5",
    density === "tight" && "gap-1",
    wrap && "flex-wrap",
    overflow === "scroll" && "overflow-x-auto overflow-y-hidden",
    className,
  ),
);
</script>

<BitsToolbar.Root
  {...restProps}
  class={toolbarClass}
  {loop}
  {orientation}
  data-density={density}
  data-overflow={overflow}
  data-wrap={wrap || undefined}
  aria-label={ariaLabel}
  data-testid={testId}
>
  {@render children?.()}
</BitsToolbar.Root>
