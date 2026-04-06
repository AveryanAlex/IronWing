<script lang="ts">
import type uPlot from "uplot";

import {
  type MissionTerrainState,
  type MissionTerrainStatus,
} from "../../lib/mission-terrain-state";
import type { TerrainWarning } from "../../lib/mission-terrain-profile";
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

let chartOptions = $derived<Omit<uPlot.Options, "width" | "height">>({
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
});

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
    title: `Mission item ${index + 1} has no terrain data`,
    detail: "IronWing could not resolve usable terrain data for this item, so clearance remains fail-closed until the path samples cleanly.",
  };
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

<section class="rounded-2xl border border-border bg-bg-primary p-4" data-testid={missionWorkspaceTestIds.terrainPanel}>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Terrain support</p>
      <h3 class="mt-1 text-sm font-semibold text-text-primary">Terrain profile</h3>
      <p class="mt-1 text-xs text-text-secondary">
        Terrain and flight MSL stay visible together so clearance warnings can jump back to the affected mission item.
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <span
        class={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${statusClass}`}
        data-testid={missionWorkspaceTestIds.terrainStatus}
      >
        {statusLabel}
      </span>
      <span
        class="rounded-full border border-border bg-bg-secondary px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-secondary"
        data-testid={missionWorkspaceTestIds.terrainWarningCount}
      >
        {warningCountLabel}
      </span>
      {#if state.canRetry}
        <button
          class="rounded-full border border-border bg-bg-secondary px-3 py-1.5 text-xs font-semibold text-text-primary transition hover:border-accent hover:text-accent"
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
        class="rounded-2xl border border-dashed border-border bg-bg-secondary/60 px-4 py-6 text-sm text-text-secondary"
        data-testid={missionWorkspaceTestIds.terrainEmpty}
      >
        No sampled terrain profile yet. Add positional mission items or set Home to turn this into a real clearance view.
      </div>
    {/if}
  </div>

  {#if warningEntries.length > 0}
    <div class="mt-4 space-y-3">
      {#each warningEntries as warning (`${warning.index}-${warning.warning}`)}
        <article
          class={`rounded-2xl border px-4 py-3 ${warningToneClass(warning.warning)}`}
          data-testid={`${missionWorkspaceTestIds.terrainWarningPrefix}-${warning.index}`}
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="max-w-3xl">
              <h4 class="text-sm font-semibold">{warning.title}</h4>
              <p class="mt-1 text-xs opacity-90">{warning.detail}</p>
            </div>
            <button
              class="rounded-full border border-current/30 bg-bg-primary/70 px-3 py-1.5 text-xs font-semibold transition hover:brightness-105"
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
