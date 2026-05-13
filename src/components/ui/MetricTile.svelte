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
  class="flex min-w-0 flex-col gap-[var(--space-2)] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--surface-card)] p-[var(--space-3)] data-[stale]:opacity-[0.6]"
  data-tone={tone}
  data-stale={stale || undefined}
  data-unavailable={unavailable || undefined}
  data-testid={testId}
>
  <div class="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
    {label}{#if hint} <span class="font-medium text-[var(--color-text-secondary)]">({hint})</span>{/if}
  </div>
  <div class="flex items-baseline gap-1.5 [font-variant-numeric:tabular-nums]">
    <span
      class="text-[1.15rem] font-[650] text-[var(--color-text-primary)] data-[tone=info]:text-[var(--color-accent)] data-[tone=success]:text-[var(--color-success)] data-[tone=warning]:text-[var(--color-warning)] data-[tone=danger]:text-[var(--color-danger)] data-[unavailable]:text-[var(--color-text-muted)]"
      data-tone={tone}
      data-unavailable={unavailable || undefined}
    >{displayValue}</span>
    {#if unit && !unavailable}<span class="text-[0.85rem] text-[var(--color-text-secondary)]">{unit}</span>{/if}
  </div>
</div>
