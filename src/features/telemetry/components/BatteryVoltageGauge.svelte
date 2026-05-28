<script lang="ts">
import { Badge, Card, Eyebrow, FactTile, MonoValue } from "../../../components/ui";

type Props = {
  percent?: number | null;
  voltage?: number | null;
  current?: number | null;
  energyWh?: number | null;
  timeRemainingS?: number | null;
  cellVoltages?: number[] | null;
};

type BatteryTone = "neutral" | "success" | "warning" | "danger";
type ValueTone = "primary" | "success" | "warning" | "danger";

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
let tone = $derived.by<BatteryTone>(() => {
  if (!finite(percent)) return "neutral";
  if (percent <= 15) return "danger";
  if (percent <= 30) return "warning";
  return "success";
});
let valueTone = $derived.by<ValueTone>(() => tone === "neutral" ? "primary" : tone);
let powerW = $derived(finite(voltage) && finite(current) ? voltage * current : null);
let validCells = $derived((cellVoltages ?? []).filter(finite));
let cellSpread = $derived(validCells.length > 1 ? Math.max(...validCells) - Math.min(...validCells) : null);
</script>

<Card.Root as="section" gap="none" density="compact" surface="primary">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <Eyebrow tracking="widest">Battery gauge</Eyebrow>
      <MonoValue as="p" class="mt-1 text-2xl font-semibold" size="lg" tone={valueTone} value={formatPercent(percent)} />
    </div>
    <div class="text-right">
      <MonoValue as="p" class="font-semibold" value={formatNumber(voltage, 1, "V")} />
      <MonoValue as="p" tone="secondary" value={formatNumber(current, 1, "A")} />
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

  <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
    <FactTile label="Power" value={formatNumber(powerW, 0, "W")} />
    <FactTile label="Consumed" value={formatNumber(energyWh, 0, "Wh")} />
    <FactTile label="Remaining" value={formatTime(timeRemainingS)} />
    <FactTile label="Cell spread" value={formatNumber(cellSpread, 2, "V")} />
  </div>

  {#if validCells.length > 0}
    <div class="mt-3 flex flex-wrap gap-1.5">
      {#each validCells as cell, index (`cell-${index}`)}
        <Badge variant="muted" size="sm" case="normal">
          <MonoValue size="xs" value={`${index + 1}:${cell.toFixed(2)}V`} />
        </Badge>
      {/each}
    </div>
  {/if}
</Card.Root>
