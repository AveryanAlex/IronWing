<script lang="ts">
import type { ClassValue } from "clsx";
import type { Snippet } from "svelte";
import type { HTMLAttributes } from "svelte/elements";
import { cn } from "../../../lib/utils";

type Props = Omit<HTMLAttributes<HTMLDivElement>, "class"> & {
  orientation?: "vertical" | "horizontal";
  children?: Snippet;
  class?: ClassValue;
};

let { orientation = "vertical", children, class: className, ...rest }: Props = $props();

let groupClass = $derived(
  cn(
    orientation === "horizontal" ? "flex flex-wrap items-center gap-3" : "grid gap-3",
    className,
  ),
);
</script>

<div {...rest} class={groupClass} data-ui-field-group data-orientation={orientation}>
  {@render children?.()}
</div>
