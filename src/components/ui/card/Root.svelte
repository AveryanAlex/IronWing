<script lang="ts">
import type { Snippet } from "svelte";
import type { HTMLAttributes } from "svelte/elements";
import type { ClassValue } from "clsx";
import { cn } from "../../../lib/utils";

type CardElement = "article" | "aside" | "div" | "footer" | "header" | "li" | "section";
type CardSurface = "default" | "elevated" | "muted" | "muted-soft" | "transparent" | "primary" | "secondary" | "panel" | "panel-soft" | "input";
type CardRadius = "none" | "sm" | "default" | "lg" | "xl";
type CardDensity = "compact" | "default" | "comfortable";
type CardTone = "neutral" | "info" | "success" | "warning" | "danger";
type CardAppearance = "solid" | "dashed";
type CardLayout = "stack" | "row" | "block";
type CardGap = "inherit" | "none" | "compact" | "default" | "comfortable";
type CardPadding = "inherit" | "none" | "tight" | "compact" | "default" | "comfortable";
type CardJustify = "start" | "center";

type Props = Omit<HTMLAttributes<HTMLElement>, "class" | "children"> & {
  as?: CardElement;
  surface?: CardSurface;
  radius?: CardRadius;
  density?: CardDensity;
  tone?: CardTone;
  appearance?: CardAppearance;
  layout?: CardLayout;
  gap?: CardGap;
  padding?: CardPadding;
  justify?: CardJustify;
  selected?: boolean;
  testId?: string;
  class?: ClassValue;
  children?: Snippet;
};

const surfaceClasses: Record<CardSurface, string> = {
  default: "border-border bg-surface-card",
  elevated: "border-border-light bg-surface-card-elevated shadow-sm",
  muted: "border-border bg-bg-secondary",
  "muted-soft": "border-border/70 bg-bg-secondary",
  transparent: "border-border bg-transparent",
  primary: "border-border bg-bg-primary/80",
  secondary: "border-border bg-bg-secondary/70",
  panel: "border-border bg-surface-panel",
  "panel-soft": "border-border bg-surface-panel/70 shadow-sm",
  input: "border-border bg-bg-input",
};

const toneClasses: Record<CardTone, string> = {
  neutral: "",
  info: "border-accent/30 bg-accent/10",
  success: "border-success/30 bg-success/10",
  warning: "border-warning/35 bg-warning/10",
  danger: "border-danger/35 bg-danger/10",
};

const radiusClasses: Record<CardRadius, string> = {
  none: "rounded-none",
  sm: "rounded-md",
  default: "rounded-lg",
  lg: "rounded-xl",
  xl: "rounded-2xl",
};

const gapClasses: Record<Exclude<CardGap, "inherit">, string> = {
  none: "gap-0",
  compact: "gap-3",
  default: "gap-4",
  comfortable: "gap-5",
};

const paddingClasses: Record<Exclude<CardPadding, "inherit">, string> = {
  none: "p-0",
  tight: "p-2",
  compact: "p-3",
  default: "p-4",
  comfortable: "p-5",
};

const densityGap: Record<CardDensity, Exclude<CardGap, "inherit">> = {
  compact: "compact",
  default: "default",
  comfortable: "comfortable",
};

const densityPadding: Record<CardDensity, Exclude<CardPadding, "inherit">> = {
  compact: "compact",
  default: "default",
  comfortable: "comfortable",
};

const layoutClasses: Record<CardLayout, string> = {
  stack: "flex flex-col",
  row: "flex flex-row",
  block: "block",
};

const justifyClasses: Record<CardJustify, string> = {
  start: "",
  center: "justify-center",
};

let {
  as = "div",
  surface = "default",
  radius = "default",
  density = "default",
  tone = "neutral",
  appearance = "solid",
  layout = "stack",
  gap = "inherit",
  padding = "inherit",
  justify = "start",
  selected = false,
  testId,
  class: className,
  children,
  ...restProps
}: Props = $props();

let cardClass = $derived(
  cn(
    "min-w-0 max-w-full border text-text-primary",
    layoutClasses[layout],
    surfaceClasses[surface],
    toneClasses[tone],
    radiusClasses[radius],
    gap === "inherit" ? gapClasses[densityGap[density]] : gapClasses[gap],
    padding === "inherit" ? paddingClasses[densityPadding[density]] : paddingClasses[padding],
    justifyClasses[justify],
    appearance === "dashed" && "border-dashed",
    selected && "border-accent/70 bg-accent/10 ring-1 ring-accent/35",
    className,
  ),
);
</script>

<svelte:element
  this={as}
  {...restProps}
  class={cardClass}
  data-appearance={appearance}
  data-density={density}
  data-gap={gap}
  data-layout={layout}
  data-padding={padding}
  data-justify={justify}
  data-radius={radius}
  data-selected={selected || undefined}
  data-surface={surface}
  data-tone={tone}
  data-testid={testId}
>
  {@render children?.()}
</svelte:element>
