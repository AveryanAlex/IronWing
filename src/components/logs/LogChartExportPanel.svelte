<script lang="ts">
import type { LogsChartState, LogsExportState } from "../../lib/stores/logs-workspace";
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
</script>

<section class="logs-chart-export" data-testid="logs-chart-export">
  <div class="logs-chart-export__header">
    <div>
      <p class="logs-card__eyebrow">Selected-range export</p>
      <p class="logs-card__copy">Drag across any chart to pin a shared range, then export CSV for the active chart group only.</p>
    </div>

    <button
      class="logs-button logs-button--ghost"
      data-testid="logs-chart-clear-range"
      disabled={chartState.selectedRange == null}
      onclick={onClearRange}
      type="button"
    >
      Clear range
    </button>
  </div>

  <div class="logs-chart-export__controls">
    <label class="logs-field logs-chart-export__field">
      <span class="logs-field__label">Destination path</span>
      <input
        class="logs-input"
        data-testid="logs-chart-export-path"
        oninput={(event) => onExportDestinationChange((event.currentTarget as HTMLInputElement).value)}
        placeholder="/tmp/selected-range.csv"
        type="text"
        value={chartState.exportDestinationPath}
      />
    </label>

    <button
      class="logs-button"
      data-testid="logs-chart-export-button"
      disabled={!exportReady}
      onclick={onRequestExport}
      type="button"
    >
      {chartExportInFlight ? "Exporting…" : "Export selected range as CSV"}
    </button>
  </div>

  {#if !chartState.selectedRange}
    <p class="logs-card__copy" data-testid="logs-chart-export-help">Drag on a chart to choose the export window before dispatching CSV export.</p>
  {:else}
    <p class="logs-card__copy" data-testid="logs-chart-export-range-summary">
      Exporting {formatUsec(chartState.selectedRange.startUsec, effectiveStartUsec)} → {formatUsec(chartState.selectedRange.endUsec, effectiveStartUsec)} for {getChartMessageTypeFilters(activeGroup).join(", ") || "the active chart group"}.
    </p>
  {/if}

  {#if chartExportVisible && exportState.error}
    <div aria-live="assertive" aria-atomic="true" class="logs-banner" data-tone="critical" data-testid="logs-chart-export-error" role="alert">{exportState.error}</div>
  {:else if chartExportVisible && exportState.phase === "completed" && exportState.result}
    <div aria-live="polite" aria-atomic="true" class="logs-banner" data-tone="positive" data-testid="logs-chart-export-result" role="status">
      Wrote {exportState.result.rows_written.toLocaleString()} rows to {exportState.result.destination_path}.
    </div>
  {/if}
</section>

<style>
  .logs-card__eyebrow,
  .logs-field__label {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .logs-card__copy,
  .logs-banner {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: 0.8rem;
    line-height: 1.5;
  }

  .logs-chart-export {
    display: flex;
    flex-direction: column;
    gap: 12px;
    border-top: 1px solid var(--color-border);
    padding-top: 12px;
  }

  .logs-chart-export__controls,
  .logs-chart-export__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .logs-chart-export__field {
    flex: 1;
  }

  .logs-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .logs-input {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-bg-input);
    color: var(--color-text-primary);
    font-size: 0.8rem;
    padding: 0.55rem 0.7rem;
  }

  .logs-button {
    border: 1px solid var(--color-accent);
    border-radius: 6px;
    background: color-mix(in srgb, var(--color-accent) 14%, var(--color-bg-primary));
    color: var(--color-text-primary);
    font-size: 0.78rem;
    font-weight: 600;
    padding: 0.5rem 0.8rem;
  }

  .logs-button:disabled {
    opacity: 0.45;
  }

  .logs-button--ghost {
    border-color: var(--color-border);
    background: var(--color-bg-primary);
    color: var(--color-text-secondary);
  }

  .logs-banner {
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-bg-primary);
    padding: 10px 12px;
  }

  .logs-banner[data-tone="critical"] {
    border-color: color-mix(in srgb, var(--color-danger) 45%, var(--color-border));
    background: color-mix(in srgb, var(--color-danger) 10%, var(--color-bg-primary));
    color: var(--color-danger);
  }

  .logs-banner[data-tone="positive"] {
    border-color: color-mix(in srgb, var(--color-success) 45%, var(--color-border));
    background: color-mix(in srgb, var(--color-success) 10%, var(--color-bg-primary));
    color: var(--color-success);
  }

  @media (max-width: 720px) {
    .logs-chart-export__controls,
    .logs-chart-export__header {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
