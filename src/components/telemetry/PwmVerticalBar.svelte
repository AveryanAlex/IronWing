<script lang="ts">
export type PwmBarState = "live" | "stale" | "unavailable" | "malformed";

type Props = {
  label: string;
  value?: number | null;
  min?: number;
  normalMin?: number;
  center?: number;
  normalMax?: number;
  max?: number;
  state?: PwmBarState;
  testId?: string;
};

let {
  label,
  value = null,
  min = 800,
  normalMin = 1000,
  center = 1500,
  normalMax = 2000,
  max = 2200,
  state = "live",
  testId,
}: Props = $props();

let numericValue = $derived(typeof value === "number" && Number.isFinite(value) ? value : null);
let valid = $derived(numericValue !== null);
let clampedValue = $derived(numericValue !== null ? Math.max(min, Math.min(max, numericValue)) : center);
let centerTopPct = $derived(((max - center) / (max - min)) * 100);
let normalMinTopPct = $derived(((max - normalMin) / (max - min)) * 100);
let normalMaxTopPct = $derived(((max - normalMax) / (max - min)) * 100);
let valueTopPct = $derived(((max - clampedValue) / (max - min)) * 100);
let fillTopPct = $derived(Math.min(centerTopPct, valueTopPct));
let fillHeightPct = $derived(Math.abs(centerTopPct - valueTopPct));
let displayValue = $derived(numericValue !== null ? `${Math.round(numericValue)}` : "--");
let isNeutral = $derived(numericValue !== null && Math.abs(numericValue - center) <= 20);
let visualState = $derived(valid ? state : "unavailable");
</script>

<article
  class="flex min-w-0 flex-col items-center gap-1 rounded-md border border-border bg-bg-secondary/70 px-1 py-2 data-[state=stale]:border-warning/40 data-[state=stale]:bg-warning/10 data-[state=unavailable]:opacity-60 data-[state=malformed]:border-danger/40 data-[state=malformed]:bg-danger/10"
  data-state={visualState}
  data-testid={testId}
  title={`${label} ${displayValue}; extended ${min}–${max} µs, normal ${normalMin}–${normalMax} µs, neutral ${center} µs`}
>
  <div class="font-mono text-[0.6rem] font-semibold uppercase tracking-wide text-text-muted">{label}</div>
  <div class="font-mono text-xs font-semibold text-text-primary [font-variant-numeric:tabular-nums]">{displayValue}</div>

  <div class="relative mt-1 h-36 w-5 rounded-full border border-border bg-bg-primary/90 shadow-inner">
    <div class="absolute inset-x-0 bottom-2 top-2">
      <div
        class="absolute left-1/2 w-1.5 -translate-x-1/2 rounded-full bg-bg-secondary/80"
        style:top={`${normalMaxTopPct}%`}
        style:height={`${Math.max(normalMinTopPct - normalMaxTopPct, 1)}%`}
      ></div>
      {#if valid}
        <div
          class="absolute left-1/2 w-2 -translate-x-1/2 rounded-full bg-accent data-[neutral]:bg-text-muted data-[state=stale]:bg-warning data-[state=malformed]:bg-danger"
          data-neutral={isNeutral || undefined}
          data-state={visualState}
          style:height={`calc(${Math.max(fillHeightPct, 1)}% + 4px)`}
          style:top={`calc(${fillTopPct}% - 2px)`}
        ></div>
      {/if}
      <div class="absolute left-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text-muted/70" style:top={`${normalMaxTopPct}%`}></div>
      <div class="absolute left-0 right-0 h-px bg-border/90" style:top={`${centerTopPct}%`}></div>
      <div class="absolute left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-text-muted/80 bg-bg-primary" style:top={`${centerTopPct}%`}></div>
      <div class="absolute left-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-text-muted/70" style:top={`${normalMinTopPct}%`}></div>
    {#if valid}
      <div
        class="absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-bg-primary bg-accent shadow data-[state=stale]:bg-warning data-[state=malformed]:bg-danger"
        data-neutral={isNeutral || undefined}
        data-state={visualState}
        style:top={`${valueTopPct}%`}
      ></div>
    {/if}
    </div>
  </div>
</article>
