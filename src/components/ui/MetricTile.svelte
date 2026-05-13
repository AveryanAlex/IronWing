<script lang="ts">
type Tone = "neutral" | "info" | "success" | "warning" | "danger";

type Props = {
  label: string;
  value: string;
  unit?: string;
  tone?: Tone;
  stale?: boolean;
  unavailable?: boolean;
  hint?: string;
  testId?: string;
};

let { label, value, unit, tone = "neutral", stale = false, unavailable = false, hint, testId }: Props = $props();
let displayValue = $derived(unavailable ? "—" : value);
</script>

<div
  class="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface-card p-3 data-[stale]:opacity-60"
  data-tone={tone}
  data-stale={stale || undefined}
  data-unavailable={unavailable || undefined}
  data-testid={testId}
>
  <div class="text-xs font-semibold uppercase tracking-wide text-text-muted">
    {label}{#if hint} <span class="font-medium text-text-secondary">({hint})</span>{/if}
  </div>
  <div class="flex items-baseline gap-1.5 [font-variant-numeric:tabular-nums]">
    <span
      class="text-lg font-semibold text-text-primary data-[tone=info]:text-accent data-[tone=success]:text-success data-[tone=warning]:text-warning data-[tone=danger]:text-danger data-[unavailable]:text-text-muted"
      data-tone={tone}
      data-unavailable={unavailable || undefined}
    >{displayValue}</span>
    {#if unit && !unavailable}<span class="text-sm text-text-secondary">{unit}</span>{/if}
  </div>
</div>
