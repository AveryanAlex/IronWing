<script lang="ts">
import type { ClassValue } from "clsx";
import type { Snippet } from "svelte";
import type { HTMLAttributes } from "svelte/elements";
import { cn } from "../../lib/utils";

type InfoBlockElement = "aside" | "div" | "section";
type InfoBlockTone = "neutral" | "info" | "success" | "warning" | "danger";
type InfoBlockDensity = "compact" | "default" | "comfortable";
type InfoBlockSize = "xs" | "sm";

type Props = Omit<HTMLAttributes<HTMLElement>, "class" | "children" | "title"> & {
  as?: InfoBlockElement;
  title?: string;
  tone?: InfoBlockTone;
  density?: InfoBlockDensity;
  size?: InfoBlockSize;
  class?: ClassValue;
  testId?: string;
  children?: Snippet;
};

const toneClasses: Record<InfoBlockTone, string> = {
  neutral: "border-border bg-bg-input text-text-secondary",
  info: "border-accent/30 bg-accent/10 text-text-secondary",
  success: "border-success/30 bg-success/10 text-text-secondary",
  warning: "border-warning/35 bg-warning/10 text-warning",
  danger: "border-danger/35 bg-danger/10 text-danger",
};

const densityClasses: Record<InfoBlockDensity, string> = {
  compact: "px-3 py-2",
  default: "p-3",
  comfortable: "px-4 py-3",
};

const sizeClasses: Record<InfoBlockSize, string> = {
  xs: "text-xs leading-5",
  sm: "text-sm leading-6",
};

let { as = "div", title, tone = "neutral", density = "compact", size = "xs", class: className, testId, children, ...rest }: Props = $props();

let infoBlockClass = $derived(
  cn("rounded-md border", toneClasses[tone], densityClasses[density], sizeClasses[size], className),
);
</script>

<svelte:element this={as} {...rest} class={infoBlockClass} data-density={density} data-testid={testId} data-tone={tone}>
  {#if title}<span class="font-semibold text-text-primary">{title}</span>{/if}
  {@render children?.()}
</svelte:element>
