<script lang="ts">
import type { ClassValue } from "clsx";
import { cn } from "../../lib/utils";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";
type Density = "compact" | "default" | "comfortable";

type Props = {
  label: string;
  value: string;
  unit?: string;
  tone?: Tone;
  density?: Density;
  stale?: boolean;
  unavailable?: boolean;
  hint?: string;
  mono?: boolean;
  class?: ClassValue;
  testId?: string;
};

const densityClasses: Record<Density, string> = {
  compact: "gap-1 px-2 py-1.5",
  default: "gap-2 p-3",
  comfortable: "gap-2.5 p-4",
};

const labelClasses: Record<Density, string> = {
  compact: "truncate text-[0.65rem]",
  default: "text-xs",
  comfortable: "text-xs",
};

const valueClasses: Record<Density, string> = {
  compact: "text-sm",
  default: "text-lg",
  comfortable: "text-lg",
};

let { label, value, unit, tone = "neutral", density = "default", stale = false, unavailable = false, hint, mono = false, class: className, testId }: Props = $props();
let displayValue = $derived(unavailable ? "—" : value);
let tileClass = $derived(cn("flex min-w-0 flex-col rounded-lg border border-border bg-surface-card data-[stale]:opacity-60", densityClasses[density], className));
let labelClass = $derived(cn("font-semibold uppercase tracking-wide text-text-muted", labelClasses[density]));
let valueClass = $derived(
  cn(
    "min-w-0 max-w-full truncate font-semibold text-text-primary data-[tone=info]:text-accent data-[tone=success]:text-success data-[tone=warning]:text-warning data-[tone=danger]:text-danger data-[unavailable]:text-text-muted",
    valueClasses[density],
    mono && "font-mono",
  ),
);
</script>

<div
  class={tileClass}
  data-density={density}
  data-tone={tone}
  data-stale={stale || undefined}
  data-unavailable={unavailable || undefined}
  data-testid={testId}
>
  <div class={labelClass}>
    {label}{#if hint} <span class="font-medium text-text-secondary">({hint})</span>{/if}
  </div>
  <div class="flex min-w-0 items-baseline gap-1.5 [font-variant-numeric:tabular-nums]">
    <span
      class={valueClass}
      data-tone={tone}
      data-unavailable={unavailable || undefined}
      title={displayValue}
    >{displayValue}</span>
    {#if unit && !unavailable}<span class="text-sm text-text-secondary">{unit}</span>{/if}
  </div>
</div>
