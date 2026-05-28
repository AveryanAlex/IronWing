<script lang="ts">
import type { Snippet } from "svelte";
import type { HTMLAttributes } from "svelte/elements";
import { cn } from "../../../lib/utils";

type TitleElement = "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "div";

type Props = Omit<HTMLAttributes<HTMLHeadingElement>, "class" | "children"> & {
  as?: TitleElement;
  testId?: string;
  class?: string;
  children?: Snippet;
};

let { as = "h3", testId, class: className, children, ...restProps }: Props = $props();
</script>

<svelte:element {...restProps} this={as} class={cn("text-base font-semibold leading-none tracking-tight", className)} data-testid={testId}>
  {@render children?.()}
</svelte:element>
