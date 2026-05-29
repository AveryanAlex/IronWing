<script lang="ts">
import type { RateCurveAxisModel } from "../../../../lib/setup/rate-curve-adapters";
import type { RateCurvePlot } from "./RateCurvePreviewChart.svelte";
import RateAxisControls from "./RateAxisControls.svelte";
import RateCurvePreviewChart from "./RateCurvePreviewChart.svelte";

const MIN_CHART_HEIGHT = 256;

type Props = {
  axis: RateCurveAxisModel;
  marker: RateCurvePlot["marker"];
  markerSummary: string;
  disabled?: boolean;
  graphTestId: string;
  markerTestId: string;
  inputTestIdPrefix: string;
  onChange: (name: string, value: number) => void;
};

let {
  axis,
  marker,
  markerSummary,
  disabled = false,
  graphTestId,
  markerTestId,
  inputTestIdPrefix,
  onChange,
}: Props = $props();
</script>

<section class="rate-axis-card min-w-0 rounded-xl border border-border bg-bg-secondary/70 p-3">
  <div class="flex min-w-0 items-center justify-between gap-3">
    <h3 class="shrink-0 text-sm font-semibold text-text-primary">{axis.label}</h3>
    <p
      class="min-w-0 truncate text-right text-xs font-medium text-text-secondary sm:text-sm"
      data-testid={markerTestId}
      title={markerSummary}
    >
      {markerSummary}
    </p>
  </div>

  <div class="rate-axis-body mt-3 grid min-w-0 gap-4">
    <div class="rate-axis-chart-pane relative min-h-64 min-w-0 overflow-hidden">
      <div class="absolute inset-0">
        <RateCurvePreviewChart
          plot={{
            axisId: axis.id,
            label: axis.label,
            unit: axis.unit,
            currentPoints: axis.currentPoints,
            draftPoints: axis.draftPoints,
            marker,
          }}
          height={MIN_CHART_HEIGHT}
          fillHeight
          testId={graphTestId}
        />
      </div>
    </div>

    <div class="rate-axis-settings-pane min-w-0">
      <RateAxisControls
        {axis}
        {disabled}
        testIdPrefix={inputTestIdPrefix}
        {onChange}
        distributeControls
        class="h-full"
      />
    </div>
  </div>
</section>

<style>
  .rate-axis-card {
    container-type: inline-size;
  }

  .rate-axis-chart-pane {
    aspect-ratio: 16 / 9;
  }

  @container (min-width: 45rem) {
    .rate-axis-body {
      display: flex;
      align-items: stretch;
    }

    .rate-axis-chart-pane {
      flex: 1 1 20rem;
      max-width: 39.0625rem;
      min-width: 20rem;
      aspect-ratio: auto;
    }

    .rate-axis-settings-pane {
      flex: 1 1 24rem;
      min-width: 24rem;
    }
  }
</style>
