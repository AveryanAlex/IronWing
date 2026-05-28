<script lang="ts">
import type { ClassValue } from "clsx";
import type { Snippet } from "svelte";
import { cn } from "../../lib/utils";

type Size = "sm" | "default";

type SegmentedControlOption = {
  value: string;
  label: string;
  disabled?: boolean;
  testId?: string;
  icon?: Snippet;
};

type Props = {
  options: ReadonlyArray<SegmentedControlOption>;
  value?: string;
  ariaLabel: string;
  disabled?: boolean;
  size?: Size;
  class?: ClassValue;
  testId?: string;
  onValueChange?: (value: string) => void;
};

const sizeClasses: Record<Size, string> = {
  sm: "p-0.5 text-xs",
  default: "p-1 text-sm",
};

const buttonSizeClasses: Record<Size, string> = {
  sm: "min-h-7 px-2",
  default: "min-h-8 px-3",
};

let {
  options,
  value = $bindable(),
  ariaLabel,
  disabled = false,
  size = "default",
  class: className,
  testId,
  onValueChange,
}: Props = $props();

let rootClass = $derived(cn("inline-flex items-center gap-1 rounded-lg border border-border bg-bg-secondary", sizeClasses[size], className));

function selectValue(nextValue: string, optionDisabled = false) {
  if (disabled || optionDisabled || nextValue === value) {
    return;
  }

  value = nextValue;
  onValueChange?.(nextValue);
}
</script>

<div class={rootClass} data-testid={testId} role="group" aria-label={ariaLabel} data-size={size}>
  {#each options as option (option.value)}
    <button
      class={cn(
        "inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-md border border-transparent font-semibold text-text-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 disabled:cursor-not-allowed disabled:opacity-50",
        buttonSizeClasses[size],
        option.value === value ? "border-border-light bg-bg-primary text-text-primary shadow-sm" : "hover:border-border hover:text-text-primary",
      )}
      type="button"
      aria-pressed={option.value === value}
      data-active={option.value === value || undefined}
      data-testid={option.testId}
      disabled={disabled || option.disabled}
      onclick={() => selectValue(option.value, option.disabled)}
    >
      {#if option.icon}
        <span class="inline-flex shrink-0" aria-hidden="true">{@render option.icon()}</span>
        <span class="truncate">{option.label}</span>
      {:else}
        {option.label}
      {/if}
    </button>
  {/each}
</div>
