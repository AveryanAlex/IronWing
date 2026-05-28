<script lang="ts">
import type { Snippet } from "svelte";
import type { HTMLAttributes } from "svelte/elements";
import { cn } from "../../lib/utils";

type Props = Omit<HTMLAttributes<HTMLDivElement>, "class" | "children"> & {
  testId?: string;
  separated?: boolean;
  class?: string;
  children?: Snippet;
};

let { testId, separated = true, class: className, children, ...restProps }: Props = $props();

let groupClass = $derived(
  cn(
    "inline-flex items-center gap-1",
    separated && "border-l border-border-light pl-2 first:border-l-0 first:pl-0",
    className,
  ),
);
</script>

<div
  {...restProps}
  class={groupClass}
  data-testid={testId}
>
  {@render children?.()}
</div>
