<script lang="ts">
import type uPlot from "uplot";

import {
  type MissionTerrainState,
  type MissionTerrainStatus,
} from "../../lib/mission-terrain-state";
import type { ProfilePoint, TerrainWarning } from "../../lib/mission-terrain-profile";
import UPlotChart from "./UPlotChart.svelte";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

type Props = {
  state: MissionTerrainState;
  onRetry: () => Promise<void> | void;
  onSelectWarning: (index: number) => void;
};

type WarningEntry = {
  index: number;
  warning: Exclude<TerrainWarning, "none">;
  title: string;
  detail: string;
};

type SurveyProfileBand = {
  regionId: string;
  label: string;
  start_m: number;
  end_m: number;
  itemCount: number;
  toneIndex: number;
};

let {
  state,
  onRetry,
  onSelectWarning,
}: Props = $props();

let warningEntries = $derived.by<WarningEntry[]>(() =>
  Array.from(state.warningsByIndex.entries())
    .filter((entry): entry is [number, Exclude<TerrainWarning, "none">] => entry[1] !== "none")
    .sort((left, right) => left[0] - right[0])
    .map(([index, warning]) => ({
      index,
      warning,
      ...describeWarning(index, warning),
    })),
);

let chartData = $derived.by<uPlot.AlignedData>(() => {
  const profilePoints = state.profile?.points ?? [];
  return [
    profilePoints.map((point) => point.distance_m),
    profilePoints.map((point) => point.terrainMsl),
    profilePoints.map((point) => point.interpolatedFlightMsl ?? point.flightMsl),
  ];
});

let surveyBands = $derived.by<SurveyProfileBand[]>(() => buildSurveyProfileBands(state.profile?.points ?? []));

let chartOptions = $derived.by<Omit<uPlot.Options, "width" | "height">>(() => ({
    scales: {
      x: {
        time: false,
      },
    },
    legend: {
      show: false,
    },
    cursor: {
      drag: {
        x: false,
        y: false,
      },
    },
    axes: [
      {
        label: "Distance",
        values: (_plot, values) => values.map((value) => `${Math.round(Number(value))} m`),
        grid: { show: false },
        stroke: "#64748b",
      },
      {
        label: "Altitude MSL",
        values: (_plot, values) => values.map((value) => `${Math.round(Number(value))} m`),
        grid: { stroke: "rgba(100, 116, 139, 0.18)", width: 1 },
        stroke: "#64748b",
      },
    ],
    series: [
      {},
      {
        label: "Terrain",
        stroke: "#f59e0b",
        width: 2,
        spanGaps: false,
      },
      {
        label: "Flight",
        stroke: "#22c55e",
        width: 2,
        spanGaps: false,
      },
    ],
    plugins: surveyBands.length > 0 ? [createSurveyBandPlugin(surveyBands)] : [],
  }));

let hasChart = $derived((state.profile?.points.length ?? 0) > 0);
let statusLabel = $derived(statusBadgeLabel(state.status));
let statusClass = $derived(statusBadgeClass(state.status));
let warningCountLabel = $derived(
  state.warningSummary.actionable === 1
    ? "1 warning"
    : `${state.warningSummary.actionable} warnings`,
);

function describeWarning(index: number, warning: Exclude<TerrainWarning, "none">) {
  if (warning === "below_terrain") {
    return {
      title: `Mission item ${index + 1} is below terrain`,
      detail: "The sampled clearance is at or below terrain, so the planner stays fail-closed until you raise or retarget the item.",
    };
  }

  if (warning === "near_terrain") {
    return {
      title: `Mission item ${index + 1} is near terrain`,
      detail: "The sampled clearance is below the configured terrain safety margin. Open the item to adjust altitude or path geometry.",
    };
  }

  return {
    title: `Item ${index + 1}: terrain data unavailable`,
    detail: "Terrain sampling did not return usable data for this item. The orange terrain line stays gapped here while the green flight line still reflects the mission item altitude.",
  };
}

function buildSurveyProfileBands(points: ProfilePoint[]): SurveyProfileBand[] {
  const bands: SurveyProfileBand[] = [];
  let activeBand: SurveyProfileBand | null = null;
  let lastSurveyLocalIndex: number | null = null;

  for (const point of points) {
    if (!point.isWaypoint) {
      continue;
    }

    if (point.source !== "survey" || !point.surveyRegionId) {
      activeBand = null;
      lastSurveyLocalIndex = null;
      continue;
    }

    if (!activeBand || activeBand.regionId !== point.surveyRegionId) {
      activeBand = {
        regionId: point.surveyRegionId,
        label: point.surveyLabel ?? "Survey",
        start_m: point.distance_m,
        end_m: point.distance_m,
        itemCount: 0,
        toneIndex: bands.length,
      };
      bands.push(activeBand);
      lastSurveyLocalIndex = null;
    }

    activeBand.end_m = point.distance_m;
    if (point.surveyLocalIndex !== lastSurveyLocalIndex) {
      activeBand.itemCount += 1;
      lastSurveyLocalIndex = point.surveyLocalIndex ?? null;
    }
  }

  return bands;
}

function createSurveyBandPlugin(bands: SurveyProfileBand[]): uPlot.Plugin {
  return {
    hooks: {
      drawClear: [
        (plot) => {
          drawSurveyBands(plot, bands);
        },
      ],
    },
  };
}

function drawSurveyBands(plot: uPlot, bands: SurveyProfileBand[]) {
  const { ctx, bbox } = plot;
  const pxRatio = Math.max(1, ctx.canvas.width / Math.max(1, plot.width));
  const labelPadding = 6 * pxRatio;
  const minBandWidth = 10 * pxRatio;
  const top = bbox.top;
  const height = bbox.height;
  const left = bbox.left;
  const right = bbox.left + bbox.width;

  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, bbox.width, height);
  ctx.clip();

  bands.forEach((band) => {
    const rawStart = plot.valToPos(band.start_m, "x", true);
    const rawEnd = plot.valToPos(band.end_m, "x", true);
    const center = (rawStart + rawEnd) / 2;
    const bandWidth = Math.max(minBandWidth, Math.abs(rawEnd - rawStart));
    const start = Math.max(left, Math.min(center - bandWidth / 2, right));
    const end = Math.min(right, Math.max(center + bandWidth / 2, left));
    const width = Math.max(0, end - start);
    const fill = band.toneIndex % 2 === 0 ? "rgba(59, 130, 246, 0.12)" : "rgba(168, 85, 247, 0.12)";
    const stroke = band.toneIndex % 2 === 0 ? "rgba(59, 130, 246, 0.42)" : "rgba(168, 85, 247, 0.42)";

    if (width <= 0) {
      return;
    }

    ctx.fillStyle = fill;
    ctx.fillRect(start, top, width, height);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, pxRatio);
    ctx.beginPath();
    ctx.moveTo(start, top);
    ctx.lineTo(start, top + height);
    ctx.moveTo(end, top);
    ctx.lineTo(end, top + height);
    ctx.stroke();

    if (width > 76 * pxRatio) {
      ctx.fillStyle = stroke;
      ctx.font = `${11 * pxRatio}px sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillText(`${band.label} · ${band.itemCount} pts`, start + labelPadding, top + labelPadding, width - labelPadding * 2);
    }
  });

  ctx.restore();
}

function warningToneClass(warning: Exclude<TerrainWarning, "none">): string {
  if (warning === "below_terrain") {
    return "border-danger/40 bg-danger/10 text-danger";
  }

  if (warning === "near_terrain") {
    return "border-warning/40 bg-warning/10 text-warning";
  }

  return "border-accent/30 bg-accent/10 text-text-primary";
}

function statusBadgeLabel(status: MissionTerrainStatus): string {
  switch (status) {
    case "loading":
      return "Loading";
    case "ready":
      return "Ready";
    case "error":
      return "Error";
    case "no_data":
      return "No data";
    case "idle":
    default:
      return "Idle";
  }
}

function statusBadgeClass(status: MissionTerrainStatus): string {
  switch (status) {
    case "ready":
      return "border-success/30 bg-success/10 text-success";
    case "loading":
      return "border-accent/30 bg-accent/10 text-text-primary";
    case "error":
      return "border-danger/40 bg-danger/10 text-danger";
    case "no_data":
      return "border-warning/40 bg-warning/10 text-warning";
    case "idle":
    default:
      return "border-border bg-bg-secondary text-text-secondary";
  }
}
</script>

<section class="rounded-lg border border-border bg-bg-primary p-3" data-testid={missionWorkspaceTestIds.terrainPanel}>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Terrain support</p>
      <h3 class="mt-1 text-sm font-semibold text-text-primary">Terrain profile</h3>
      <p class="mt-1 text-xs text-text-secondary">
        Orange line = terrain MSL · green line = flight MSL. Clearance warnings jump back to the affected mission item.
      </p>
      {#if surveyBands.length > 0}
        <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
          <span class="inline-flex items-center gap-1.5">
            <span class="h-3 w-5 rounded-sm border border-accent/40 bg-accent/20" aria-hidden="true"></span>
            Survey-generated items are shaded
          </span>
          <span class="text-text-muted">Vertical edges separate surveys from manual route points.</span>
        </div>
      {/if}
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <span
        class={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusClass}`}
        data-testid={missionWorkspaceTestIds.terrainStatus}
      >
        {statusLabel}
      </span>
      <span
        class="rounded-full border border-border bg-bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-text-secondary"
        data-testid={missionWorkspaceTestIds.terrainWarningCount}
      >
        {warningCountLabel}
      </span>
      {#if state.canRetry}
        <button
          class="rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-semibold text-text-primary transition hover:border-accent hover:text-accent"
          data-testid={missionWorkspaceTestIds.terrainRetry}
          onclick={onRetry}
          type="button"
        >
          Retry terrain
        </button>
      {/if}
    </div>
  </div>

  <p class="mt-3 text-sm text-text-secondary" data-testid={missionWorkspaceTestIds.terrainStatusDetail}>
    {state.detail}
  </p>

  {#if state.lastError}
    <p class="mt-2 text-xs text-danger">
      {state.lastError}
    </p>
  {/if}

  <div class="mt-4">
    {#if hasChart}
      <UPlotChart
        data={chartData}
        height={240}
        options={chartOptions}
        testId={missionWorkspaceTestIds.terrainChart}
      />
    {:else}
      <div
        class="rounded-lg border border-dashed border-border bg-bg-secondary/60 px-4 py-6 text-sm text-text-secondary"
        data-testid={missionWorkspaceTestIds.terrainEmpty}
      >
        No sampled profile yet. Add positional mission items or set Home to turn this into a real clearance view.
      </div>
    {/if}
  </div>

  {#if warningEntries.length > 0}
    <div class="mt-4 space-y-3">
      {#each warningEntries as warning (`${warning.index}-${warning.warning}`)}
        <article
          class={`rounded-lg border px-4 py-3 ${warningToneClass(warning.warning)}`}
          data-testid={`${missionWorkspaceTestIds.terrainWarningPrefix}-${warning.index}`}
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="max-w-3xl">
              <h4 class="text-sm font-semibold">{warning.title}</h4>
              <p class="mt-1 text-xs opacity-90">{warning.detail}</p>
            </div>
            <button
              class="rounded-md border border-current/30 bg-bg-primary/70 px-3 py-1.5 text-xs font-semibold transition hover:brightness-105"
              data-testid={`${missionWorkspaceTestIds.terrainWarningActionPrefix}-${warning.index}`}
              onclick={() => onSelectWarning(warning.index)}
              type="button"
            >
              Open item {warning.index + 1}
            </button>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</section>
