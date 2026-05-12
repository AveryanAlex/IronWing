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

let { ariaLabel, tone = "neutral", size = "md", disabled, testId, title, onclick, children }: Props = $props();
</script>

<button
  class="ui-icon-btn"
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

<style>
.ui-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border-light);
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  cursor: pointer;
}
.ui-icon-btn[data-size="sm"] { width: var(--control-h-sm); height: var(--control-h-sm); }
.ui-icon-btn[data-size="md"] { width: var(--control-h-md); height: var(--control-h-md); }
.ui-icon-btn[data-tone="accent"] { color: var(--color-accent); border-color: var(--color-accent); }
.ui-icon-btn[data-tone="danger"] { color: var(--color-danger); border-color: color-mix(in srgb, var(--color-danger) 55%, transparent); }
.ui-icon-btn:hover:not([disabled]) { background: var(--color-bg-input); }
.ui-icon-btn:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 1px; }
.ui-icon-btn[disabled] { opacity: 0.55; cursor: not-allowed; }
</style>
