<script lang="ts">
import type { LogsChartState, LogsExportState } from "../../lib/stores/logs-workspace";
import { Banner, Button } from "../ui";
import type { LogChartGroup } from "./log-chart-config";
import { getChartMessageTypeFilters } from "./log-chart-config";
import { formatUsec } from "./logs-format";

type Props = {
  chartState: LogsChartState;
  exportState: LogsExportState;
  activeGroup: LogChartGroup | null;
  effectiveStartUsec: number | null;
  exportReady: boolean;
  onClearRange: () => void;
  onExportDestinationChange: (path: string) => void;
  onRequestExport: () => void;
};

let {
  chartState,
  exportState,
  activeGroup,
  effectiveStartUsec,
  exportReady,
  onClearRange,
  onExportDestinationChange,
  onRequestExport,
}: Props = $props();

let chartExportVisible = $derived(exportState.origin === "chart");
let chartExportInFlight = $derived(exportState.phase === "exporting" && chartExportVisible);

const eyebrowClass = "m-0 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]";
const copyClass = "m-0 text-[0.8rem] leading-[1.5] text-[var(--color-text-secondary)]";
const fieldLabelClass = eyebrowClass;
const inputClass = "w-full min-w-0 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-bg-input)] px-[0.7rem] py-[0.55rem] text-[0.8rem] text-[var(--color-text-primary)]";
</script>

<section class="flex flex-col gap-3 border-t border-[var(--color-border)] pt-3" data-testid="logs-chart-export">
  <div class="flex items-center justify-between gap-3 max-[720px]:flex-col max-[720px]:items-stretch">
    <div>
      <p class={eyebrowClass}>Selected-range export</p>
      <p class={copyClass}>Drag across any chart to pin a shared range, then export CSV for the active chart group only.</p>
    </div>

    <Button
      testId="logs-chart-clear-range"
      disabled={chartState.selectedRange == null}
      onclick={onClearRange}
    >
      Clear range
    </Button>
  </div>

  <div class="flex items-center justify-between gap-3 max-[720px]:flex-col max-[720px]:items-stretch">
    <label class="flex flex-1 flex-col gap-1.5">
      <span class={fieldLabelClass}>Destination path</span>
      <input
        class={inputClass}
        data-testid="logs-chart-export-path"
        oninput={(event) => onExportDestinationChange((event.currentTarget as HTMLInputElement).value)}
        placeholder="/tmp/selected-range.csv"
        type="text"
        value={chartState.exportDestinationPath}
      />
    </label>

    <Button
      tone="accent"
      testId="logs-chart-export-button"
      disabled={!exportReady}
      onclick={onRequestExport}
    >
      {chartExportInFlight ? "Exporting…" : "Export selected range as CSV"}
    </Button>
  </div>

  {#if !chartState.selectedRange}
    <p class={copyClass} data-testid="logs-chart-export-help">Drag on a chart to choose the export window before dispatching CSV export.</p>
  {:else}
    <p class={copyClass} data-testid="logs-chart-export-range-summary">
      Exporting {formatUsec(chartState.selectedRange.startUsec, effectiveStartUsec)} → {formatUsec(chartState.selectedRange.endUsec, effectiveStartUsec)} for {getChartMessageTypeFilters(activeGroup).join(", ") || "the active chart group"}.
    </p>
  {/if}

  {#if chartExportVisible && exportState.error}
    <Banner severity="danger" title={exportState.error} testId="logs-chart-export-error" />
  {:else if chartExportVisible && exportState.phase === "completed" && exportState.result}
    <Banner
      severity="success"
      title={`Wrote ${exportState.result.rows_written.toLocaleString()} rows to ${exportState.result.destination_path}.`}
      testId="logs-chart-export-result"
    />
  {/if}
</section>
