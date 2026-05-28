<script lang="ts">
import type { ClassValue } from "clsx";
import type { Snippet } from "svelte";
import type { HTMLLabelAttributes } from "svelte/elements";
import { cn } from "../../../lib/utils";

type Props = Omit<HTMLLabelAttributes, "class"> & {
  variant?: "default" | "eyebrow";
  children?: Snippet;
  class?: ClassValue;
};

let { variant = "default", children, class: className, ...rest }: Props = $props();

let labelClass = $derived(
  cn(
    variant === "eyebrow"
      ? "text-xs font-semibold uppercase tracking-wider text-text-muted"
      : "text-sm font-medium text-text-primary",
    className,
  ),
);
</script>

<label {...rest} class={labelClass} data-ui-field-label data-variant={variant}>
  {@render children?.()}
</label>
