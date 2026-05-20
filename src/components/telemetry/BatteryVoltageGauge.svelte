<script lang="ts">
type Props = {
  percent?: number | null;
  voltage?: number | null;
  current?: number | null;
  energyWh?: number | null;
  timeRemainingS?: number | null;
  cellVoltages?: number[] | null;
};

let { percent = null, voltage = null, current = null, energyWh = null, timeRemainingS = null, cellVoltages = null }: Props = $props();

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatNumber(value: number | null | undefined, digits: number, unit: string): string {
  if (!finite(value)) return `-- ${unit}`;
  return `${value.toFixed(digits)} ${unit}`;
}

function formatPercent(value: number | null | undefined): string {
  if (!finite(value)) return "--%";
  return `${value.toFixed(0)}%`;
}

function formatTime(value: number | null | undefined): string {
  if (!finite(value)) return "--";
  if (value >= 60) return `${Math.floor(value / 60)}m ${Math.round(value % 60)}s`;
  return `${Math.round(value)}s`;
}

let fillPct = $derived(finite(percent) ? Math.max(0, Math.min(100, percent)) : 0);
let tone = $derived.by(() => {
  if (!finite(percent)) return "neutral";
  if (percent <= 15) return "danger";
  if (percent <= 30) return "warning";
  return "success";
});
let powerW = $derived(finite(voltage) && finite(current) ? voltage * current : null);
let validCells = $derived((cellVoltages ?? []).filter(finite));
let cellSpread = $derived(validCells.length > 1 ? Math.max(...validCells) - Math.min(...validCells) : null);
</script>

<section class="rounded-lg border border-border bg-bg-primary/80 p-3">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Battery gauge</p>
      <p class="mt-1 text-2xl font-semibold text-text-primary data-[tone=success]:text-success data-[tone=warning]:text-warning data-[tone=danger]:text-danger" data-tone={tone}>
        {formatPercent(percent)}
      </p>
    </div>
    <div class="text-right font-mono text-sm text-text-secondary">
      <p class="font-semibold text-text-primary">{formatNumber(voltage, 1, "V")}</p>
      <p>{formatNumber(current, 1, "A")}</p>
    </div>
  </div>

  <div class="mt-3 flex items-center gap-2">
    <div class="h-9 flex-1 rounded-md border border-border bg-bg-secondary p-1">
      <div
        class="h-full rounded-sm bg-text-muted data-[tone=success]:bg-success data-[tone=warning]:bg-warning data-[tone=danger]:bg-danger"
        data-tone={tone}
        style:width={`${fillPct}%`}
      ></div>
    </div>
    <div class="h-4 w-1.5 rounded-r-sm bg-border"></div>
  </div>

  <div class="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
    <div class="rounded-md border border-border bg-bg-secondary/70 px-2 py-1.5">
      <p class="uppercase tracking-widest text-text-muted">Power</p>
      <p class="mt-0.5 font-mono font-semibold text-text-primary">{formatNumber(powerW, 0, "W")}</p>
    </div>
    <div class="rounded-md border border-border bg-bg-secondary/70 px-2 py-1.5">
      <p class="uppercase tracking-widest text-text-muted">Consumed</p>
      <p class="mt-0.5 font-mono font-semibold text-text-primary">{formatNumber(energyWh, 0, "Wh")}</p>
    </div>
    <div class="rounded-md border border-border bg-bg-secondary/70 px-2 py-1.5">
      <p class="uppercase tracking-widest text-text-muted">Remaining</p>
      <p class="mt-0.5 font-mono font-semibold text-text-primary">{formatTime(timeRemainingS)}</p>
    </div>
    <div class="rounded-md border border-border bg-bg-secondary/70 px-2 py-1.5">
      <p class="uppercase tracking-widest text-text-muted">Cell spread</p>
      <p class="mt-0.5 font-mono font-semibold text-text-primary">{formatNumber(cellSpread, 2, "V")}</p>
    </div>
  </div>

  {#if validCells.length > 0}
    <div class="mt-3 flex flex-wrap gap-1.5">
      {#each validCells as cell, index (`cell-${index}`)}
        <span class="rounded-full border border-border bg-bg-secondary px-2 py-1 font-mono text-xs font-semibold text-text-primary">
          {index + 1}:{cell.toFixed(2)}V
        </span>
      {/each}
    </div>
  {/if}
</section>
