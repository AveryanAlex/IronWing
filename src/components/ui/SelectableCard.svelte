<script lang="ts">
import type { Snippet } from "svelte";
import { cn } from "../../lib/utils";

type Variant = "default" | "ghost" | "elevated";
type Density = "compact" | "default" | "comfortable";

type Props = {
  variant?: Variant;
  density?: Density;
  selected?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  class?: string;
  testId?: string;
  onSelect?: (event: MouseEvent) => void;
  children?: Snippet;
};

const variantClasses: Record<Variant, string> = {
  default: "border-border bg-surface-card hover:border-border-light hover:bg-surface-card-elevated",
  ghost: "border-transparent bg-transparent hover:border-border hover:bg-bg-secondary",
  elevated: "border-border-light bg-surface-card-elevated shadow-sm hover:bg-bg-tertiary",
};

const densityClasses: Record<Density, string> = {
  compact: "p-3",
  default: "p-4",
  comfortable: "p-5",
};

let {
  variant = "default",
  density = "default",
  selected = false,
  disabled = false,
  ariaLabel,
  class: className,
  testId,
  onSelect,
  children,
}: Props = $props();

let cardClass = $derived(
  cn(
    "group w-full rounded-lg border text-left text-text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50",
    variantClasses[variant],
    densityClasses[density],
    selected && "border-accent/70 bg-accent/10 ring-1 ring-accent/35 hover:border-accent/70 hover:bg-accent/15",
    className,
  ),
);

function handleClick(event: MouseEvent) {
  if (disabled) {
    return;
  }

  onSelect?.(event);
}
</script>

<button
  class={cardClass}
  type="button"
  aria-label={ariaLabel}
  aria-pressed={selected}
  disabled={disabled}
  data-variant={variant}
  data-density={density}
  data-selected={selected || undefined}
  data-testid={testId}
  onclick={handleClick}
>
  {@render children?.()}
</button>
