<script lang="ts">
import type uPlot from "uplot";

import UPlotChart from "../../../../components/charts/UPlotChart.svelte";
import { interpolateRateCurve, type RateCurvePoint } from "../../../../lib/setup/rate-curves";

export type RateCurvePlot = {
  axisId: string;
  label: string;
  unit: "deg/s";
  currentPoints: RateCurvePoint[];
  draftPoints: RateCurvePoint[];
  marker?: {
    stick: number;
    rateDegS: number;
    stale: boolean;
    pwm: number;
    channel: number;
  } | null;
};

type Props = {
  plot: RateCurvePlot;
  height?: number;
  fillHeight?: boolean;
  testId?: string;
  class?: string;
};

let {
  plot,
  height = 220,
  fillHeight = false,
  testId,
  class: className = "",
}: Props = $props();

let yMax = $derived.by(() => {
  const values = [...plot.currentPoints, ...plot.draftPoints].map((point) => Math.abs(point.rateDegS));
  if (plot.marker) {
    values.push(Math.abs(plot.marker.rateDegS));
  }

  const max = Math.max(50, ...values);
  return Math.ceil(max / 50) * 50;
});

let alignedData = $derived.by(() => {
  const sticks = [
    ...plot.currentPoints.map((point) => point.stick),
    ...plot.draftPoints.map((point) => point.stick),
    ...(plot.marker ? [Number(plot.marker.stick.toFixed(4))] : []),
  ];
  const xValues = sticks
    .sort((left, right) => left - right)
    .filter((stick, index, values) => index === 0 || Math.abs(stick - values[index - 1]) > 0.0001);
  const current = xValues.map((stick) => interpolateRateCurve(plot.currentPoints, stick));
  const draft = xValues.map((stick) => interpolateRateCurve(plot.draftPoints, stick));
  const marker = xValues.map((stick) => (
    plot.marker && Math.abs(stick - plot.marker.stick) < 0.0001 ? plot.marker.rateDegS : null
  ));

  return [xValues, current, draft, marker] as unknown as uPlot.AlignedData;
});

let chartOptions = $derived<Omit<uPlot.Options, "width" | "height">>({
  scales: {
    x: {
      time: false,
      min: -1,
      max: 1,
    },
    y: {
      min: -yMax,
      max: yMax,
    },
  },
  legend: {
    show: false,
  },
  cursor: {
    show: false,
    drag: {
      x: false,
      y: false,
    },
  },
  axes: [
    {
      values: (_plot, values) => values.map((value) => `${Math.round(Number(value) * 100)}%`),
      grid: { stroke: "rgba(100, 116, 139, 0.18)", width: 1 },
      stroke: "#64748b",
    },
    {
      values: (_plot, values) => values.map((value) => formatAxisTick(Number(value))),
      grid: { stroke: "rgba(100, 116, 139, 0.18)", width: 1 },
      stroke: "#64748b",
    },
  ],
  series: [
    {},
    {
      label: "Current",
      stroke: "rgba(148, 163, 184, 0.75)",
      width: 2,
      spanGaps: false,
      points: { show: false },
    },
    {
      label: "Draft",
      stroke: "#60a5fa",
      width: 2,
      spanGaps: false,
      points: { show: false },
    },
    {
      label: "Live stick",
      stroke: "#f97316",
      width: 0,
      spanGaps: false,
      points: {
        show: true,
        size: 8,
        width: 2,
        stroke: "#f97316",
        fill: plot.marker?.stale ? "rgba(249, 115, 22, 0.35)" : "#f97316",
      },
    },
  ],
});

let optionsKey = $derived(`${plot.axisId}:${plot.unit}:${yMax}:${plot.marker?.stale === true ? "stale" : "live"}`);
let rootClass = $derived(`relative min-h-0 min-w-0 w-full overflow-hidden ${fillHeight ? "h-full" : "aspect-video"} ${className}`);
let rootStyle = $derived(fillHeight ? undefined : `min-height: ${height}px;`);

function formatAxisTick(value: number): string {
  if (!Number.isFinite(value)) {
    return "--";
  }

  const rounded = Math.abs(value) < 0.005 ? 0 : Number(value.toFixed(2));
  return String(rounded);
}
</script>

<div class={rootClass} style={rootStyle} data-testid={testId} aria-label={`${plot.label} rate curve`}>
  <UPlotChart data={alignedData} options={chartOptions} {height} {optionsKey} fillHeight class="h-full" />
  <div class="pointer-events-none absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border/70 bg-bg-primary/85 px-2 py-1 text-xs text-text-muted shadow-sm backdrop-blur">
    <span class="inline-flex items-center gap-1"><span class="size-2 rounded-full bg-slate-400/80"></span>Current</span>
    <span class="inline-flex items-center gap-1"><span class="size-2 rounded-full bg-blue-400"></span>Draft</span>
    <span class="inline-flex items-center gap-1"><span class="size-2 rounded-full bg-orange-500"></span>Live stick</span>
  </div>
</div>
