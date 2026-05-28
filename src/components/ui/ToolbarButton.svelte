<script lang="ts">
import { Toolbar as BitsToolbar } from "bits-ui";
import type { ToolbarButtonProps } from "bits-ui";
import type { Snippet } from "svelte";
import { cn } from "../../lib/utils";

type ToolbarButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive" | "warning" | "link" | "soft" | "solid" | "bare";
type ToolbarButtonSize = "sm" | "default" | "lg" | "icon-sm" | "icon" | "icon-lg";
type ToolbarButtonTone = "neutral" | "accent" | "success" | "warning" | "danger";
type ToolbarButtonShape = "default" | "pill";
type LegacyTone = ToolbarButtonTone;
type LegacySize = "md";

type Props = Omit<ToolbarButtonProps, "aria-label" | "child" | "children" | "class" | "disabled" | "size"> & {
  variant?: ToolbarButtonVariant;
  tone?: ToolbarButtonTone;
  shape?: ToolbarButtonShape;
  selected?: boolean;
  size?: ToolbarButtonSize | LegacySize;
  disabled?: boolean;
  loading?: boolean;
  ariaLabel?: string;
  testId?: string;
  class?: string;
  children?: Snippet;
};

const sizeClasses: Record<ToolbarButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  default: "h-9 px-4 text-sm",
  lg: "h-10 px-5 text-sm",
  "icon-sm": "size-8 p-0",
  icon: "size-9 p-0",
  "icon-lg": "size-10 p-0",
};

const variantClasses: Record<ToolbarButtonVariant, string> = {
  default: "border-transparent bg-accent text-bg-primary shadow-sm enabled:hover:bg-accent-hover",
  secondary: "border-border-light bg-bg-secondary text-text-primary shadow-sm enabled:hover:bg-bg-tertiary",
  outline: "border-border-light bg-transparent text-text-primary enabled:hover:bg-bg-secondary",
  ghost: "border-transparent bg-transparent text-text-primary enabled:hover:bg-bg-secondary",
  destructive: "border-transparent bg-danger text-bg-primary shadow-sm enabled:hover:bg-danger/90",
  warning: "border-transparent bg-warning text-bg-primary shadow-sm enabled:hover:brightness-105",
  link: "h-auto border-transparent bg-transparent px-0 text-accent underline-offset-4 enabled:hover:underline",
  soft: "border-border-light bg-bg-secondary text-text-primary shadow-sm enabled:hover:bg-bg-tertiary",
  solid: "border-transparent bg-accent text-bg-primary shadow-sm enabled:hover:bg-accent-hover",
  bare: "border-transparent bg-transparent shadow-none enabled:hover:bg-transparent",
};

const solidToneClasses: Record<ToolbarButtonTone, string> = {
  neutral: "border-border-light bg-bg-secondary text-text-primary shadow-sm enabled:hover:bg-bg-tertiary",
  accent: "border-transparent bg-accent text-bg-primary shadow-sm enabled:hover:bg-accent-hover",
  success: "border-transparent bg-success text-black shadow-sm enabled:hover:opacity-90",
  warning: "border-transparent bg-warning text-bg-primary shadow-sm enabled:hover:brightness-105",
  danger: "border-transparent bg-danger text-bg-primary shadow-sm enabled:hover:bg-danger/90",
};

const softToneClasses: Record<ToolbarButtonTone, string> = {
  neutral: "border-border-light bg-bg-secondary text-text-primary shadow-sm enabled:hover:bg-bg-tertiary",
  accent: "border-accent/40 bg-accent/10 text-accent enabled:hover:bg-accent/15",
  success: "border-success/30 bg-success/10 text-success enabled:hover:bg-success/15",
  warning: "border-warning/40 bg-warning/10 text-warning enabled:hover:bg-warning/15",
  danger: "border-danger/40 bg-danger/10 text-danger enabled:hover:bg-danger/15",
};

const quietToneClasses: Record<ToolbarButtonTone, string> = {
  neutral: "text-text-muted enabled:hover:text-text-secondary",
  accent: "text-accent enabled:hover:text-accent",
  success: "text-success enabled:hover:text-success",
  warning: "text-warning enabled:hover:text-warning",
  danger: "text-danger enabled:hover:text-danger",
};

const shapeClasses: Record<ToolbarButtonShape, string> = {
  default: "rounded-md",
  pill: "rounded-full",
};

const toneVariant: Record<LegacyTone, ToolbarButtonVariant> = {
  neutral: "secondary",
  accent: "default",
  success: "outline",
  warning: "warning",
  danger: "destructive",
};

let {
  variant,
  tone,
  shape = "default",
  selected = false,
  size = "default",
  type = "button",
  disabled = false,
  loading = false,
  ariaLabel,
  testId,
  onclick,
  class: className,
  children,
  ...restProps
}: Props = $props();

let resolvedVariant = $derived(variant ?? (tone ? toneVariant[tone] : "default"));
let resolvedSize = $derived(size === "md" ? "default" : size);
let resolvedTone = $derived<ToolbarButtonTone>(tone ?? (resolvedVariant === "destructive" ? "danger" : resolvedVariant === "warning" ? "warning" : "accent"));
let resolvedVariantClass = $derived.by(() => {
  if (resolvedVariant === "soft") return softToneClasses[resolvedTone];
  if (resolvedVariant === "solid") return solidToneClasses[resolvedTone];
  if ((resolvedVariant === "outline" || resolvedVariant === "ghost" || resolvedVariant === "bare") && tone) {
    return cn(variantClasses[resolvedVariant], quietToneClasses[tone]);
  }
  return variantClasses[resolvedVariant];
});

let buttonClass = $derived(
  cn(
    "ui-btn inline-flex items-center justify-center gap-2 border font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
    shapeClasses[shape],
    sizeClasses[resolvedSize],
    resolvedVariantClass,
    selected && resolvedVariant !== "soft" && resolvedVariant !== "solid" && softToneClasses[resolvedTone],
    className,
  ),
);

function handleClick(event: MouseEvent & { currentTarget: EventTarget & HTMLButtonElement }) {
  if (disabled || loading) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  onclick?.(event);
}
</script>

<BitsToolbar.Button
  {...restProps}
  class={buttonClass}
  aria-label={ariaLabel}
  data-size={resolvedSize}
  data-shape={shape}
  data-selected={selected || undefined}
  data-tone={tone}
  data-testid={testId}
  data-variant={resolvedVariant}
  aria-busy={loading || undefined}
  disabled={disabled || loading}
  {type}
  onclick={handleClick}
>
  {#if loading}
    <span aria-hidden="true" class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
  {/if}
  {@render children?.()}
</BitsToolbar.Button>
