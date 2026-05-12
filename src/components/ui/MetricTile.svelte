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

<div class="ui-metric" data-tone={tone} data-stale={stale || undefined} data-unavailable={unavailable || undefined} data-testid={testId}>
  <div class="ui-metric__label">{label}{#if hint} <span class="ui-metric__hint">({hint})</span>{/if}</div>
  <div class="ui-metric__value">
    <span class="ui-metric__number">{displayValue}</span>
    {#if unit && !unavailable}<span class="ui-metric__unit">{unit}</span>{/if}
  </div>
</div>

<style>
.ui-metric {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-3);
  background: var(--surface-card);
  min-width: 0;
}
.ui-metric__label { color: var(--color-text-muted); font-size: 0.7rem; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; }
.ui-metric__hint { color: var(--color-text-secondary); font-weight: 500; }
.ui-metric__value { display: flex; align-items: baseline; gap: 6px; font-variant-numeric: tabular-nums; }
.ui-metric__number { font-size: 1.15rem; font-weight: 650; color: var(--color-text-primary); }
.ui-metric__unit { font-size: 0.85rem; color: var(--color-text-secondary); }
.ui-metric[data-tone="info"]    .ui-metric__number { color: var(--color-accent); }
.ui-metric[data-tone="success"] .ui-metric__number { color: var(--color-success); }
.ui-metric[data-tone="warning"] .ui-metric__number { color: var(--color-warning); }
.ui-metric[data-tone="danger"]  .ui-metric__number { color: var(--color-danger); }
.ui-metric[data-stale] { opacity: 0.6; }
.ui-metric[data-unavailable] .ui-metric__number { color: var(--color-text-muted); }
</style>
