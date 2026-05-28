<script lang="ts">
import type { Snippet } from "svelte";
import { cn } from "../../lib/utils";

type Align = "start" | "end" | "between" | "stretch";
type Direction = "responsive" | "row" | "column";

type Props = {
  align?: Align;
  direction?: Direction;
  wrap?: boolean;
  class?: string;
  testId?: string;
  children?: Snippet;
};

const alignClasses: Record<Align, string> = {
  start: "justify-start",
  end: "justify-end",
  between: "justify-between",
  stretch: "justify-start items-stretch sm:items-stretch sm:[&>*]:flex-1",
};

const directionClasses: Record<Direction, string> = {
  responsive: "flex-col sm:flex-row sm:items-center",
  row: "flex-row items-center",
  column: "flex-col items-stretch",
};

let { align = "end", direction = "responsive", wrap = true, class: className, testId, children }: Props = $props();
</script>

<div
  class={cn(
    "flex gap-2",
    directionClasses[direction],
    alignClasses[align],
    wrap && direction !== "column" && "sm:flex-wrap",
    className,
  )}
  data-align={align}
  data-direction={direction}
  data-testid={testId}
>
  {@render children?.()}
</div>
