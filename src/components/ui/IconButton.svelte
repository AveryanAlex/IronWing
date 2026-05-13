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
  sm: "size-7",
  md: "size-8",
};

const toneClasses: Record<Tone, string> = {
  neutral: "border-border-light bg-bg-secondary text-text-primary enabled:hover:bg-bg-tertiary",
  accent: "border-accent/30 bg-accent/10 text-accent enabled:hover:bg-accent/15",
  danger: "border-danger/30 bg-danger/10 text-danger enabled:hover:bg-danger/15",
};

let { ariaLabel, tone = "neutral", size = "md", disabled, testId, title, onclick, children }: Props = $props();

let buttonClass = $derived(
  [
    "inline-flex items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50",
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
