<script lang="ts">
import { cn } from "../../lib/utils";

type Variant = "default" | "accent" | "success" | "warning" | "danger";

type Props = {
  value?: number;
  max?: number;
  label?: string;
  ariaLabel?: string;
  showValue?: boolean;
  variant?: Variant;
  class?: string;
  trackClass?: string;
  indicatorClass?: string;
  testId?: string;
};

const indicatorClasses: Record<Variant, string> = {
  default: "bg-accent",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

let {
  value,
  max = 100,
  label,
  ariaLabel,
  showValue = false,
  variant = "default",
  class: className,
  trackClass,
  indicatorClass,
  testId,
}: Props = $props();

let hasValue = $derived(typeof value === "number" && Number.isFinite(value));
let safeMax = $derived(max > 0 && Number.isFinite(max) ? max : 100);
let percent = $derived.by(() => {
  const currentValue = value;
  if (typeof currentValue !== "number" || !Number.isFinite(currentValue)) {
    return 100;
  }

  return Math.min(100, Math.max(0, (currentValue / safeMax) * 100));
});
let valueText = $derived(hasValue ? `${Math.round(percent)}%` : "Loading");
</script>

<div class={cn("w-full", className)} data-variant={variant} data-testid={testId}>
  {#if label || showValue}
    <div class="mb-2 flex items-center justify-between gap-3 text-sm">
      {#if label}<span class="font-medium text-text-primary">{label}</span>{/if}
      {#if showValue}<span class="tabular-nums text-text-secondary">{valueText}</span>{/if}
    </div>
  {/if}

  <div
    class={cn("h-2 overflow-hidden rounded-full bg-bg-input", trackClass)}
    role="progressbar"
    aria-label={ariaLabel ?? label}
    aria-valuemin="0"
    aria-valuemax={safeMax}
    aria-valuenow={hasValue ? value : undefined}
  >
    <div
      class={cn(
        "h-full rounded-full transition-[width] duration-300 ease-out",
        !hasValue && "animate-pulse",
        indicatorClasses[variant],
        indicatorClass,
      )}
      style:width={`${percent}%`}
    ></div>
  </div>
</div>
