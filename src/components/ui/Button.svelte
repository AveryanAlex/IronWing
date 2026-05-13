<script lang="ts">
import type { Snippet } from "svelte";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";
type Size = "sm" | "md" | "lg";

type Props = {
  tone?: Tone;
  size?: Size;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  loading?: boolean;
  ariaLabel?: string;
  testId?: string;
  onclick?: (event: MouseEvent) => void;
  children?: Snippet;
};

const sizeClasses: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs",
  md: "h-8 px-3 text-sm",
  lg: "h-10 px-4 text-sm",
};

const toneClasses: Record<Tone, string> = {
  neutral: "border-border-light bg-bg-secondary text-text-primary enabled:hover:bg-bg-tertiary",
  accent: "border-transparent bg-accent text-bg-primary enabled:hover:bg-accent-hover",
  success: "border-success/30 bg-success/10 text-success enabled:hover:bg-success/15",
  warning: "border-warning/30 bg-warning/10 text-warning enabled:hover:bg-warning/15",
  danger: "border-danger/30 bg-danger/10 text-danger enabled:hover:bg-danger/15",
};

let {
  tone = "neutral",
  size = "md",
  type = "button",
  disabled = false,
  loading = false,
  ariaLabel,
  testId,
  onclick,
  children,
}: Props = $props();

function handleClick(event: MouseEvent) {
  if (disabled || loading) {
    return;
  }
  onclick?.(event);
}

let buttonClass = $derived(
  [
    "inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50",
    sizeClasses[size],
    toneClasses[tone],
  ].join(" "),
);
</script>

<button
  class={buttonClass}
  data-tone={tone}
  data-size={size}
  data-testid={testId}
  aria-label={ariaLabel}
  aria-busy={loading || undefined}
  disabled={disabled || loading}
  {type}
  onclick={handleClick}
>
  {@render children?.()}
</button>
