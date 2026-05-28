<script lang="ts">
import type { Snippet } from "svelte";
import type { HTMLAttributes } from "svelte/elements";
import { cn } from "../../../lib/utils";

type DescriptionElement = "p" | "div" | "span";

type Props = Omit<HTMLAttributes<HTMLElement>, "class" | "children"> & {
  as?: DescriptionElement;
  testId?: string;
  class?: string;
  children?: Snippet;
};

let { as = "p", testId, class: className, children, ...restProps }: Props = $props();
</script>

<svelte:element {...restProps} this={as} class={cn("text-sm text-text-secondary", className)} data-testid={testId}>
  {@render children?.()}
</svelte:element>
