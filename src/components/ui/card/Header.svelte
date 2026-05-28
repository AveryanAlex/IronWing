<script lang="ts">
import type { Snippet } from "svelte";
import type { HTMLAttributes } from "svelte/elements";
import { cn } from "../../../lib/utils";

type Props = Omit<HTMLAttributes<HTMLDivElement>, "class" | "children"> & {
  testId?: string;
  class?: string;
  children?: Snippet;
};

let { testId, class: className, children, ...restProps }: Props = $props();
</script>

<div {...restProps} class={cn("flex flex-col gap-1.5", className)} data-testid={testId}>
  {@render children?.()}
</div>
