<script lang="ts">
import type { Snippet } from "svelte";
import type { HTMLButtonAttributes } from "svelte/elements";
import { cn } from "../../lib/utils";

type IconButtonVariant = "default" | "secondary" | "outline" | "ghost" | "destructive" | "bare";
type IconButtonSize = "icon-sm" | "icon" | "icon-lg" | "auto";
type IconButtonTone = "neutral" | "accent" | "danger";
type LegacyTone = IconButtonTone;
type LegacySize = "sm" | "md";

type Props = Omit<HTMLButtonAttributes, "class" | "children" | "disabled" | "size"> & {
  ariaLabel: string;
  variant?: IconButtonVariant;
  tone?: IconButtonTone;
  size?: IconButtonSize | LegacySize;
  disabled?: boolean;
  loading?: boolean;
  testId?: string;
  class?: string;
  children: Snippet;
};

const sizeClasses: Record<IconButtonSize, string> = {
  "icon-sm": "size-8",
  icon: "size-9",
  "icon-lg": "size-10",
  auto: "size-auto",
};

const variantClasses: Record<IconButtonVariant, string> = {
  default: "border-transparent bg-accent text-bg-primary shadow-sm enabled:hover:bg-accent-hover",
  secondary: "border-border-light bg-bg-secondary text-text-primary shadow-sm enabled:hover:bg-bg-tertiary",
  outline: "border-border-light bg-transparent text-text-primary enabled:hover:bg-bg-secondary",
  ghost: "border-transparent bg-transparent text-text-primary enabled:hover:bg-bg-secondary",
  destructive: "border-transparent bg-danger text-bg-primary shadow-sm enabled:hover:bg-danger/90",
  bare: "border-transparent bg-transparent p-0 shadow-none enabled:hover:bg-transparent",
};

const quietToneClasses: Record<IconButtonTone, string> = {
  neutral: "text-text-muted enabled:hover:text-text-primary",
  accent: "text-text-muted enabled:hover:text-accent",
  danger: "text-text-muted enabled:hover:text-danger",
};

const toneVariant: Record<LegacyTone, IconButtonVariant> = {
  neutral: "secondary",
  accent: "outline",
  danger: "destructive",
};

const legacySize: Record<LegacySize, IconButtonSize> = {
  sm: "icon-sm",
  md: "icon",
};

let {
  ariaLabel,
  variant,
  size = "icon",
  disabled = false,
  loading = false,
  testId,
  onclick,
  title,
  class: className,
  children,
  tone,
  type = "button",
  ...restProps
}: Props = $props();

let resolvedVariant = $derived(variant ?? (tone ? toneVariant[tone] : "secondary"));
let resolvedSize = $derived(size === "sm" || size === "md" ? legacySize[size] : size);
let resolvedVariantClass = $derived(
  cn(
    variantClasses[resolvedVariant],
    (resolvedVariant === "ghost" || resolvedVariant === "bare" || resolvedVariant === "outline") && tone && quietToneClasses[tone],
  ),
);
let buttonClass = $derived(
  cn(
    "inline-flex items-center justify-center rounded-md border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
    sizeClasses[resolvedSize],
    resolvedVariantClass,
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

<button
  {...restProps}
  class={buttonClass}
  aria-busy={loading || undefined}
  aria-label={ariaLabel}
  data-size={resolvedSize}
  data-testid={testId}
  data-tone={tone}
  data-variant={resolvedVariant}
  disabled={disabled || loading}
  title={title ?? ariaLabel}
  {type}
  onclick={handleClick}
>
  {#if loading}
    <span aria-hidden="true" class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
  {:else}
    {@render children()}
  {/if}
</button>
