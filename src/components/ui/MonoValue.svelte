<script lang="ts">
import type { ClassValue } from "clsx";
import type { Snippet } from "svelte";
import type { HTMLAttributes } from "svelte/elements";
import { cn } from "../../lib/utils";

type MonoElement = "code" | "div" | "p" | "span";
type MonoSize = "xs" | "sm" | "base" | "lg";
type MonoTone = "muted" | "secondary" | "primary" | "accent" | "success" | "warning" | "danger";

type Props = Omit<HTMLAttributes<HTMLElement>, "class" | "children"> & {
  as?: MonoElement;
  size?: MonoSize;
  tone?: MonoTone;
  value?: string | number | null;
  wrap?: boolean;
  class?: ClassValue;
  testId?: string;
  children?: Snippet;
};

const sizeClasses: Record<MonoSize, string> = {
  xs: "text-xs",
  sm: "text-sm",
  base: "text-base",
  lg: "text-lg",
};

const toneClasses: Record<MonoTone, string> = {
  muted: "text-text-muted",
  secondary: "text-text-secondary",
  primary: "text-text-primary",
  accent: "text-accent",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

let {
  as = "span",
  size = "sm",
  tone = "primary",
  value = null,
  wrap = false,
  class: className,
  testId,
  children,
  ...rest
}: Props = $props();

let monoClass = $derived(
  cn("font-mono tabular-nums", sizeClasses[size], toneClasses[tone], wrap && "min-w-0 overflow-wrap-anywhere break-words", className),
);
</script>

<svelte:element this={as} {...rest} class={monoClass} data-testid={testId} data-size={size} data-tone={tone}>
  {#if value !== null && value !== undefined}
    {value}
  {:else}
    {@render children?.()}
  {/if}
</svelte:element>
