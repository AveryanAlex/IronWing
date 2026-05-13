<script lang="ts">
import type { Snippet } from "svelte";

type Tone = "neutral" | "accent" | "danger";
type Size = "sm" | "md";

type Props = {
  ariaLabel: string;
  tone?: Tone;
  size?: Size;
  disabled?: boolean;
  testId?: string;
  title?: string;
  onclick?: (event: MouseEvent) => void;
  children: Snippet;
};

const sizeClasses: Record<Size, string> = {
  sm: "size-[var(--control-h-sm)]",
  md: "size-[var(--control-h-md)]",
};

const toneClasses: Record<Tone, string> = {
  neutral: "border-[var(--color-border-light)] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] enabled:hover:bg-[var(--color-bg-input)]",
  accent: "border-[var(--color-accent)] bg-[var(--color-bg-primary)] text-[var(--color-accent)] enabled:hover:bg-[var(--color-bg-input)]",
  danger: "border-[color-mix(in_srgb,var(--color-danger)_55%,transparent)] bg-[var(--color-bg-primary)] text-[var(--color-danger)] enabled:hover:bg-[var(--color-bg-input)]",
};

let { ariaLabel, tone = "neutral", size = "md", disabled, testId, title, onclick, children }: Props = $props();

let buttonClass = $derived(
  [
    "inline-flex items-center justify-center rounded-[var(--radius-sm)] border cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-55",
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
  title={title ?? ariaLabel}
  disabled={disabled}
  onclick={onclick}
  type="button"
>
  {@render children()}
</button>
