<script lang="ts">
import type { Snippet } from "svelte";
import type { HTMLAttributes } from "svelte/elements";
import { cn } from "../../../lib/utils";

type ActionElement = "div" | "nav";

type Props = Omit<HTMLAttributes<HTMLElement>, "class" | "children"> & {
  as?: ActionElement;
  testId?: string;
  class?: string;
  children?: Snippet;
};

let { as = "div", testId, class: className, children, ...restProps }: Props = $props();
</script>

<svelte:element {...restProps} this={as} class={cn("flex flex-wrap items-center justify-end gap-2", className)} data-testid={testId}>
  {@render children?.()}
</svelte:element>
