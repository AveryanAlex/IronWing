<script lang="ts">
import type { Snippet } from "svelte";
import { cn } from "../../lib/utils";

type Variant = "default" | "secondary" | "outline" | "destructive" | "success" | "warning" | "accent" | "muted" | "tint";
type Size = "micro" | "xs" | "sm" | "default" | "lg";
type BadgeCase = "upper" | "normal";
type Shape = "pill" | "rounded";
type Surface = "default" | "primary";
type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";
type LegacyTone = BadgeTone;

type Props = {
  variant?: Variant;
  size?: Size;
  case?: BadgeCase;
  shape?: Shape;
  surface?: Surface;
  class?: string;
  testId?: string;
  children: Snippet;
  tone?: LegacyTone;
};

const variantClasses: Record<Variant, string> = {
  default: "border-transparent bg-accent text-bg-primary",
  secondary: "border-border-light bg-bg-tertiary text-text-primary",
  outline: "border-border-light bg-transparent text-text-primary",
  destructive: "border-danger/30 bg-danger/10 text-danger",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  accent: "border-accent/30 bg-accent/10 text-accent",
  muted: "border-border bg-bg-secondary text-text-muted",
  tint: "border-transparent bg-bg-tertiary text-text-muted",
};

const tintToneClasses: Record<BadgeTone, string> = {
  neutral: "border-transparent bg-bg-tertiary text-text-muted",
  info: "border-transparent bg-accent/15 text-accent",
  accent: "border-transparent bg-accent/15 text-accent",
  success: "border-transparent bg-success/15 text-success",
  warning: "border-transparent bg-warning/15 text-warning",
  danger: "border-transparent bg-danger/15 text-danger",
};

const sizeClasses: Record<Size, string> = {
  micro: "min-h-0 px-1 py-0.5 text-[9px] leading-none",
  xs: "min-h-4 px-1.5 py-0 text-[10px]",
  sm: "min-h-5 px-1.5 py-0.5 text-xs",
  default: "min-h-5 px-2 py-0.5 text-xs",
  lg: "min-h-6 px-2.5 py-1 text-xs",
};

const caseClasses: Record<BadgeCase, string> = {
  upper: "uppercase tracking-wide",
  normal: "normal-case tracking-normal",
};

const shapeClasses: Record<Shape, string> = {
  pill: "rounded-full",
  rounded: "rounded",
};

const toneVariants: Record<LegacyTone, Variant> = {
  neutral: "muted",
  info: "accent",
  success: "success",
  warning: "warning",
  danger: "destructive",
  accent: "accent",
};

let { variant, size = "default", case: badgeCase = "upper", shape = "pill", surface = "default", class: className, testId, children, tone }: Props = $props();

let effectiveVariant = $derived(variant ?? (tone ? toneVariants[tone] : "default"));
let effectiveVariantClass = $derived(effectiveVariant === "tint" ? tintToneClasses[tone ?? "neutral"] : variantClasses[effectiveVariant]);

let badgeClass = $derived(
  cn(
    "inline-flex min-h-5 items-center rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide",
    shapeClasses[shape],
    caseClasses[badgeCase],
    sizeClasses[size],
    effectiveVariantClass,
    surface === "primary" && effectiveVariant === "muted" && "bg-bg-primary",
    className,
  ),
);
</script>

<span class={badgeClass} data-variant={effectiveVariant} data-size={size} data-surface={surface} data-testid={testId}>{@render children()}</span>
