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
</script>

<button
  class="ui-btn"
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

<style>
.ui-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border-light);
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.ui-btn[data-size="sm"] { height: var(--control-h-sm); padding: 0 10px; font-size: 0.78rem; }
.ui-btn[data-size="md"] { height: var(--control-h-md); padding: 0 14px; font-size: 0.86rem; }
.ui-btn[data-size="lg"] { height: var(--control-h-lg); padding: 0 18px; font-size: 0.95rem; }
.ui-btn[data-tone="accent"] { border-color: var(--color-accent); color: var(--color-accent); background: color-mix(in srgb, var(--color-accent) 12%, transparent); }
.ui-btn[data-tone="success"] { border-color: color-mix(in srgb, var(--color-success) 55%, transparent); color: var(--color-success); background: color-mix(in srgb, var(--color-success) 12%, transparent); }
.ui-btn[data-tone="warning"] { border-color: color-mix(in srgb, var(--color-warning) 55%, transparent); color: var(--color-warning); background: color-mix(in srgb, var(--color-warning) 12%, transparent); }
.ui-btn[data-tone="danger"]  { border-color: color-mix(in srgb, var(--color-danger) 55%, transparent);  color: var(--color-danger);  background: color-mix(in srgb, var(--color-danger) 12%, transparent); }
.ui-btn:hover:not([disabled]) { background: var(--color-bg-input); }
.ui-btn:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 1px; }
.ui-btn[disabled] { opacity: 0.55; cursor: not-allowed; }
</style>
