<script lang="ts">
import type { ClassValue } from "clsx";
import type { Snippet } from "svelte";
import type { HTMLAttributes } from "svelte/elements";
import { cn } from "../../lib/utils";

type HelperElement = "div" | "p" | "span";
type HelperSize = "xs" | "sm";
type HelperTone = "muted" | "secondary" | "primary" | "accent" | "success" | "warning" | "danger";

type Props = Omit<HTMLAttributes<HTMLElement>, "class" | "children"> & {
  as?: HelperElement;
  size?: HelperSize;
  tone?: HelperTone;
  class?: ClassValue;
  testId?: string;
  children?: Snippet;
};

const sizeClasses: Record<HelperSize, string> = {
  xs: "text-xs leading-5",
  sm: "text-sm leading-6",
};

const toneClasses: Record<HelperTone, string> = {
  muted: "text-text-muted",
  secondary: "text-text-secondary",
  primary: "text-text-primary",
  accent: "text-accent",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

let { as = "p", size = "sm", tone = "secondary", class: className, testId, children, ...rest }: Props = $props();

let helperClass = $derived(cn("m-0", sizeClasses[size], toneClasses[tone], className));
</script>

<svelte:element this={as} {...rest} class={helperClass} data-testid={testId} data-size={size} data-tone={tone}>
  {@render children?.()}
</svelte:element>
