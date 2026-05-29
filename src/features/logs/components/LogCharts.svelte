<script lang="ts">
import type uPlot from "uplot";

import type { ChartSeries, ChartSeriesRequest, LogLibraryEntry } from "../../../logs";
import type { LogsChartState, LogsExportState } from "../../../lib/stores/logs-workspace";
import UPlotChart from "../../../components/charts/UPlotChart.svelte";
import { Banner, Card, EmptyState, Eyebrow, HelperText, MonoValue, Panel, StatusPill } from "../../../components/ui";
import LogChartExportPanel from "./LogChartExportPanel.svelte";
import LogChartGroupSelector from "./LogChartGroupSelector.svelte";
import { getChartMessageTypeFilters, getDefaultChartGroupKey, getLogChartGroups, type LogChartGroup } from "../log-chart-config";
import { formatUsec } from "../logs-format";

type Props = {
  entry: LogLibraryEntry | null;
  chartState: LogsChartState;
  exportState: LogsExportState;
  playbackCursorUsec: number | null;
  playbackRangeStartUsec: number | null;
  playbackRangeEndUsec: number | null;
  onSelectGroup: (groupKey: string | null) => void;
  onHoverCursor: (cursorUsec: number | null) => void;
  onSelectRange: (startUsec: number | null, endUsec: number | null) => void;
  onExportDestinationChange: (path: string) => void;
  onRequestChartRange: (request: Omit<ChartSeriesRequest, "entry_id">) => void;
  onExportSelectedRange: (request: { destinationPath: string; startUsec: number; endUsec: number; messageTypes: string[] }) => void;
};

let {
  entry,
  chartState,
  exportState,
  playbackCursorUsec,
  playbackRangeStartUsec,
  playbackRangeEndUsec,
  onSelectGroup,
  onHoverCursor,
  onSelectRange,
  onExportDestinationChange,
  onRequestChartRange,
  onExportSelectedRange,
}: Props = $props();

type DragState = {
  left: number;
  width: number;
  startClientX: number;
};

const MAX_CHART_POINTS = 240;
const MIN_DRAG_PIXELS = 4;

let dragState = $state<DragState | null>(null);
let draftRange = $state<{ startUsec: number; endUsec: number } | null>(null);

let groups = $derived(getLogChartGroups(entry));
let defaultGroupKey = $derived(getDefaultChartGroupKey(groups));
let activeGroupKey = $derived(chartState.activeGroupKey ?? defaultGroupKey);
let activeGroup = $derived(groups.find((group) => group.key === activeGroupKey) ?? null);
let effectiveStartUsec = $derived(
  chartState.selectedRange?.startUsec
    ?? playbackRangeStartUsec
    ?? entry?.metadata.start_usec
    ?? null,
);
let effectiveEndUsec = $derived(
  chartState.selectedRange?.endUsec
    ?? playbackRangeEndUsec
    ?? entry?.metadata.end_usec
    ?? effectiveStartUsec,
);
let syncedCursorUsec = $derived(chartState.hoveredCursorUsec ?? playbackCursorUsec ?? effectiveStartUsec);
let series = $derived(chartState.page?.series ?? []);
let shadedRange = $derived(chartState.selectedRange ?? draftRange);
let hasRenderableSeries = $derived(series.some((nextSeries) => nextSeries.points.length > 0));
let exportReady = $derived(
  activeGroup?.supported === true
    && chartState.selectedRange != null
    && chartState.exportDestinationPath.trim().length > 0
    && exportState.phase !== "exporting",
);

function sameRequest(request: Omit<ChartSeriesRequest, "entry_id">): boolean {
  if (!chartState.request || !entry) {
    return false;
  }

  return chartState.request.entry_id === entry.entry_id
    && chartState.request.start_usec === request.start_usec
    && chartState.request.end_usec === request.end_usec
    && chartState.request.max_points === request.max_points
    && JSON.stringify(chartState.request.selectors) === JSON.stringify(request.selectors);
}

function clampRatio(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function toRatio(timestampUsec: number, startUsec: number, endUsec: number): number {
  if (endUsec <= startUsec) {
    return 0;
  }

  return clampRatio((timestampUsec - startUsec) / (endUsec - startUsec));
}

function toUsec(clientX: number, left: number, width: number): number | null {
  if (effectiveStartUsec == null || effectiveEndUsec == null || width <= 0) {
    return null;
  }

  const ratio = clampRatio((clientX - left) / width);
  return Math.round(effectiveStartUsec + (effectiveEndUsec - effectiveStartUsec) * ratio);
}

function toAlignedData(nextSeries: ChartSeries): uPlot.AlignedData {
  return [
    nextSeries.points.map((point) => point.timestamp_usec),
    nextSeries.points.map((point) => point.value),
  ];
}

function createChartOptions(nextSeries: ChartSeries): Omit<uPlot.Options, "width" | "height"> {
  return {
    scales: {
      x: {
        time: false,
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
        label: "Time",
        values: (_plot, values) => values.map((value) => formatUsec(Number(value), effectiveStartUsec)),
        grid: { show: false },
        stroke: "#64748b",
      },
      {
        label: nextSeries.selector.unit ?? nextSeries.selector.label,
        values: (_plot, values) => values.map((value) => formatValue(Number(value), nextSeries.selector.unit)),
        grid: { stroke: "rgba(100, 116, 139, 0.18)", width: 1 },
        stroke: "#64748b",
      },
    ],
    series: [
      {},
      {
        label: nextSeries.selector.label,
        stroke: "#60a5fa",
        width: 2,
        spanGaps: false,
      },
    ],
  };
}

function summarizeSeries(nextSeries: ChartSeries) {
  const values = nextSeries.points.map((point) => point.value);
  const minValue = values.length > 0 ? Math.min(...values) : 0;
  const maxValue = values.length > 0 ? Math.max(...values) : 1;

  return {
    minValue,
    maxValue: maxValue === minValue ? minValue + 1 : maxValue,
    latestValue: values.length > 0 ? values[values.length - 1] ?? null : null,
  };
}

function handlePointerDown(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  dragState = {
    left: rect.left,
    width: rect.width,
    startClientX: event.clientX,
  };
  draftRange = null;
  onHoverCursor(toUsec(event.clientX, rect.left, rect.width));
}

function handlePointerMove(event: PointerEvent) {
  if (!dragState) {
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    onHoverCursor(toUsec(event.clientX, rect.left, rect.width));
    return;
  }

  const startUsec = toUsec(dragState.startClientX, dragState.left, dragState.width);
  const endUsec = toUsec(event.clientX, dragState.left, dragState.width);
  onHoverCursor(endUsec);

  if (startUsec == null || endUsec == null) {
    draftRange = null;
    return;
  }

  draftRange = startUsec <= endUsec
    ? { startUsec, endUsec }
    : { startUsec: endUsec, endUsec: startUsec };
}

function handlePointerLeave() {
  if (!dragState) {
    onHoverCursor(null);
  }
}

function handleWindowPointerUp(event: PointerEvent) {
  if (!dragState) {
    return;
  }

  const startUsec = toUsec(dragState.startClientX, dragState.left, dragState.width);
  const endUsec = toUsec(event.clientX, dragState.left, dragState.width);
  const movedEnough = Math.abs(event.clientX - dragState.startClientX) >= MIN_DRAG_PIXELS;
  dragState = null;

  if (!movedEnough || startUsec == null || endUsec == null) {
    draftRange = null;
    return;
  }

  const nextRange = startUsec <= endUsec
    ? { startUsec, endUsec }
    : { startUsec: endUsec, endUsec: startUsec };
  draftRange = null;
  onSelectRange(nextRange.startUsec, nextRange.endUsec);
}

function handleWindowPointerMove(event: PointerEvent) {
  if (!dragState) {
    return;
  }

  const startUsec = toUsec(dragState.startClientX, dragState.left, dragState.width);
  const endUsec = toUsec(event.clientX, dragState.left, dragState.width);
  onHoverCursor(endUsec);

  if (startUsec == null || endUsec == null) {
    draftRange = null;
    return;
  }

  draftRange = startUsec <= endUsec
    ? { startUsec, endUsec }
    : { startUsec: endUsec, endUsec: startUsec };
}

function clearRange() {
  draftRange = null;
  onSelectRange(null, null);
}

function requestExport() {
  if (!activeGroup || !chartState.selectedRange) {
    return;
  }

  onExportSelectedRange({
    destinationPath: chartState.exportDestinationPath.trim(),
    startUsec: chartState.selectedRange.startUsec,
    endUsec: chartState.selectedRange.endUsec,
    messageTypes: getChartMessageTypeFilters(activeGroup),
  });
}

function formatValue(value: number | null, unit: string | null): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }

  return `${value.toFixed(2)}${unit ? ` ${unit}` : ""}`;
}

function rangeStyle(range: { startUsec: number; endUsec: number } | null): string {
  if (!range || effectiveStartUsec == null || effectiveEndUsec == null) {
    return "display: none;";
  }

  const left = toRatio(range.startUsec, effectiveStartUsec, effectiveEndUsec) * 100;
  const width = (toRatio(range.endUsec, effectiveStartUsec, effectiveEndUsec) - toRatio(range.startUsec, effectiveStartUsec, effectiveEndUsec)) * 100;
  return `left: ${left}%; width: ${width}%;`;
}

function cursorStyle(cursorUsec: number | null): string {
  if (cursorUsec == null || effectiveStartUsec == null || effectiveEndUsec == null) {
    return "display: none;";
  }

  return `left: ${toRatio(cursorUsec, effectiveStartUsec, effectiveEndUsec) * 100}%;`;
}

$effect(() => {
  if (chartState.activeGroupKey == null && defaultGroupKey != null) {
    onSelectGroup(defaultGroupKey);
  }
});

$effect(() => {
  if (!entry || !activeGroup || !activeGroup.supported || effectiveStartUsec == null || effectiveEndUsec == null) {
    return;
  }

  const request = {
    selectors: activeGroup.selectors,
    start_usec: effectiveStartUsec,
    end_usec: effectiveEndUsec,
    max_points: MAX_CHART_POINTS,
  } satisfies Omit<ChartSeriesRequest, "entry_id">;

  if (!sameRequest(request)) {
    onRequestChartRange(request);
  }
});
</script>

<svelte:window onpointermove={handleWindowPointerMove} onpointerup={handleWindowPointerUp} />

<Panel testId="logs-charts-panel">
  <div class="flex min-h-0 flex-col gap-3">
    <div class="flex items-center justify-between gap-3 max-md:flex-col max-md:items-stretch">
      <div>
        <Eyebrow>Charts</Eyebrow>
        <h3 class="m-0 text-sm font-semibold text-text-primary">Bounded panels, synced cursor, and range export</h3>
        <HelperText>
          Chart queries stay clamped to the active replay window or the selected drag range. Export uses the same bounded selection instead of a full-log fetch.
        </HelperText>
      </div>

      {#if chartState.selectedRange}
        <StatusPill tone="success" testId="logs-chart-range-pill">
          range · {formatUsec(chartState.selectedRange.startUsec, effectiveStartUsec)} → {formatUsec(chartState.selectedRange.endUsec, effectiveStartUsec)}
        </StatusPill>
      {/if}
    </div>

    {#if !entry}
      <EmptyState
        description="The chart surface follows the active workspace selection and bounded replay window."
        testId="logs-charts-empty"
        title="Select a log before opening charts."
      />
    {:else}
      <LogChartGroupSelector {groups} {activeGroupKey} onSelectGroup={(groupKey) => onSelectGroup(groupKey)} />

      {#if groups.length > 0 && groups.every((group) => !group.supported)}
        <EmptyState
          description="No bounded chart query was sent because the indexed message groups needed for the active panels are missing."
          testId="logs-charts-unsupported"
          title="This log does not expose a supported chart group yet."
        />
      {:else if activeGroup && !activeGroup.supported}
        <EmptyState
          description={activeGroup.emptyReason}
          testId="logs-charts-group-unsupported"
          title={`${activeGroup.title} is unavailable for this log.`}
        />
      {:else}
        {#if activeGroup?.supportsAltitudePreview}
          <Banner
            severity="info"
            title="Altitude preview follows the same bounded start/end window as the timeline and selected export range."
            testId="logs-altitude-preview-note"
          />
        {/if}

        {#if chartState.error}
          <Banner severity="danger" title={chartState.error} testId="logs-charts-error" />
        {/if}

      {#if chartState.phase === "loading"}
        <Card.Root layout="block" density="compact" surface="secondary" testId="logs-charts-loading">
          <p class="m-0 font-semibold text-text-primary">Loading bounded chart series…</p>
          <HelperText>The workspace is querying only the active group and active range.</HelperText>
        </Card.Root>
      {:else if chartState.phase === "ready" && (!series.length || !hasRenderableSeries)}
        <EmptyState
          description="Try a different group or clear the selected range if the current slice is empty."
          testId="logs-charts-no-series"
          title="No chart data landed for this bounded range."
        />
      {:else}
        <div class="flex min-h-0 flex-col gap-3">
          {#each series as nextSeries (`${nextSeries.selector.message_type}-${nextSeries.selector.field}`)}
            {@const summary = summarizeSeries(nextSeries)}
            <Card.Root as="article" density="compact" surface="primary" testId={`logs-chart-series-${nextSeries.selector.field}`}>
              <div class="flex items-center justify-between gap-3 max-md:flex-col max-md:items-stretch">
                <div>
                  <p class="m-0 text-sm font-semibold text-text-primary">{nextSeries.selector.label}</p>
                  <MonoValue class="mt-0.5" size="xs" tone="muted" value={`${nextSeries.selector.message_type}.${nextSeries.selector.field}`} />
                </div>
                <MonoValue class="font-semibold" size="sm" value={formatValue(summary.latestValue, nextSeries.selector.unit)} />
              </div>

              <div
                class="logs-chart-series__plot"
                data-testid={`logs-chart-plot-${nextSeries.selector.field}`}
                onpointerdown={handlePointerDown}
                onpointerleave={handlePointerLeave}
                onpointermove={handlePointerMove}
                role="presentation"
              >
                <UPlotChart data={toAlignedData(nextSeries)} height={120} options={createChartOptions(nextSeries)} />

                <div class="logs-chart-series__overlay" aria-hidden="true">
                  <div class="logs-chart-series__range" style={rangeStyle(shadedRange)}></div>
                  <div class="logs-chart-series__cursor" style={cursorStyle(syncedCursorUsec)}></div>
                </div>
              </div>

              <div class="flex items-center justify-between gap-3 max-md:flex-col max-md:items-stretch">
                <MonoValue size="xs" tone="muted" value={formatValue(summary.minValue, nextSeries.selector.unit)} />
                <MonoValue size="xs" tone="muted" testId={`logs-chart-cursor-${nextSeries.selector.field}`}>
                  cursor · {formatUsec(syncedCursorUsec, effectiveStartUsec)}
                </MonoValue>
                <MonoValue size="xs" tone="muted" value={formatValue(summary.maxValue, nextSeries.selector.unit)} />
              </div>
            </Card.Root>
          {/each}
        </div>
      {/if}

      <LogChartExportPanel
        {activeGroup}
        {chartState}
        effectiveStartUsec={effectiveStartUsec}
        {exportReady}
        {exportState}
        onClearRange={clearRange}
        onExportDestinationChange={onExportDestinationChange}
        onRequestExport={requestExport}
      />
    {/if}
  {/if}
  </div>
</Panel>

<style>
  .logs-chart-series__plot {
    position: relative;
    height: 120px;
    border-radius: 8px;
    overflow: hidden;
  }

  .logs-chart-series__overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .logs-chart-series__cursor {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: color-mix(in srgb, var(--color-warning) 85%, white);
    transform: translateX(-50%);
  }

  .logs-chart-series__range {
    position: absolute;
    top: 0;
    bottom: 0;
    background: color-mix(in srgb, var(--color-warning) 18%, transparent);
  }
</style>
