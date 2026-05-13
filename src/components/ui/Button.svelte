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
  sm: "h-[var(--control-h-sm)] px-[10px] text-[0.78rem]",
  md: "h-[var(--control-h-md)] px-[14px] text-[0.86rem]",
  lg: "h-[var(--control-h-lg)] px-[18px] text-[0.95rem]",
};

const toneClasses: Record<Tone, string> = {
  neutral: "border-[var(--color-border-light)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] enabled:hover:bg-[var(--color-bg-input)]",
  accent: "border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)] enabled:hover:bg-[var(--color-bg-input)]",
  success: "border-[color-mix(in_srgb,var(--color-success)_55%,transparent)] bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] text-[var(--color-success)] enabled:hover:bg-[var(--color-bg-input)]",
  warning: "border-[color-mix(in_srgb,var(--color-warning)_55%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_12%,transparent)] text-[var(--color-warning)] enabled:hover:bg-[var(--color-bg-input)]",
  danger: "border-[color-mix(in_srgb,var(--color-danger)_55%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] text-[var(--color-danger)] enabled:hover:bg-[var(--color-bg-input)]",
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
    "inline-flex items-center justify-center gap-[6px] rounded-[var(--radius-sm)] border font-semibold transition-[background-color,border-color,color] duration-150 ease-in-out focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-55",
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
