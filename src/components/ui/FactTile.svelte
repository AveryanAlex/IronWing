<script lang="ts">
import type { ClassValue } from "clsx";
import type { Snippet } from "svelte";
import { cn } from "../../lib/utils";

type Tone = "neutral" | "info" | "success" | "warning" | "danger";
type Density = "compact" | "default";

type Props = {
  label: string;
  value?: string | number | null;
  unit?: string;
  detail?: string;
  tone?: Tone;
  density?: Density;
  mono?: boolean;
  unavailable?: boolean;
  class?: ClassValue;
  testId?: string;
  children?: Snippet;
};

const toneClasses: Record<Tone, string> = {
  neutral: "border-border bg-bg-secondary/70 text-text-primary",
  info: "border-accent/30 bg-accent/10 text-accent",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
};

const densityClasses: Record<Density, string> = {
  compact: "px-2 py-1.5",
  default: "px-3 py-2",
};

let {
  label,
  value = null,
  unit,
  detail,
  tone = "neutral",
  density = "compact",
  mono = true,
  unavailable = false,
  class: className,
  testId,
  children,
}: Props = $props();

let displayValue = $derived(unavailable ? "—" : value);
let factClass = $derived(cn("min-w-0 rounded-md border", toneClasses[tone], densityClasses[density], className));
</script>

<div class={factClass} data-density={density} data-testid={testId} data-tone={tone} data-unavailable={unavailable || undefined}>
  <p class="m-0 text-xs font-semibold uppercase tracking-widest text-text-muted">{label}</p>
  <p class={cn("m-0 mt-0.5 font-semibold text-text-primary data-[tone=info]:text-accent data-[tone=success]:text-success data-[tone=warning]:text-warning data-[tone=danger]:text-danger data-[unavailable]:text-text-muted", mono && "font-mono tabular-nums")} data-tone={tone} data-unavailable={unavailable || undefined}>
    {#if children}
      {@render children()}
    {:else if displayValue !== null && displayValue !== undefined}
      {displayValue}{#if unit && !unavailable} <span class="font-sans text-text-secondary">{unit}</span>{/if}
    {/if}
  </p>
  {#if detail}<p class="m-0 mt-1 text-xs leading-5 text-text-secondary">{detail}</p>{/if}
</div>
