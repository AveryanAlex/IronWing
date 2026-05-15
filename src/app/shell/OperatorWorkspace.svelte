<script lang="ts">
import { fromStore } from "svelte/store";

import type { OperatorMetricView } from "../../lib/telemetry-selectors";
import { SplitPane } from "../../components/ui";
import OverviewMap from "../../components/overview/OverviewMap.svelte";
import { appShellTestIds } from "./chrome-state";
import {
  getOperatorWorkspaceViewStoreContext,
  getSessionViewStoreContext,
  getShellChromeStoreContext,
} from "./runtime-context";

const operatorWorkspace = fromStore(getOperatorWorkspaceViewStoreContext());
const sessionView = fromStore(getSessionViewStoreContext());
const chrome = fromStore(getShellChromeStoreContext());

let view = $derived(operatorWorkspace.current);
let session = $derived(sessionView.current);
let tier = $derived(chrome.current.tier);
let useVerticalSplit = $derived(tier === "phone" || tier === "tablet");

let vehiclePos = $derived(session.vehiclePosition);
let homePos = $derived(session.homePosition);

type MetricEntry = {
  key: string;
  label: string;
  metric: OperatorMetricView;
  testId?: string;
};

type MetricGroup = {
  title: string;
  entries: MetricEntry[];
};

let metricGroups = $derived.by<MetricGroup[]>(() => [
  {
    title: "Status",
    entries: [
      {
        key: "mode",
        label: "MODE",
        metric: {
          text: view.lifecycle.modeText,
          tone: "neutral",
          state: view.connected ? "live" : "unavailable",
          value: view.lifecycle.modeText,
        },
        testId: "telemetry-mode-value",
      },
      {
        key: "arm",
        label: "ARM STATE",
        metric: {
          text: view.lifecycle.armStateText,
          tone:
            view.lifecycle.armStateTone === "positive"
              ? "positive"
              : view.lifecycle.armStateTone === "caution"
                ? "caution"
                : view.lifecycle.armStateTone === "critical"
                  ? "critical"
                  : "neutral",
          state: view.connected ? "live" : "unavailable",
          value: view.lifecycle.armStateText,
        },
        testId: "telemetry-state-value",
      },
    ],
  },
  {
    title: "Flight",
    entries: [
      {
        key: "altitude",
        label: "ALTITUDE",
        metric: view.primaryMetrics.altitude,
        testId: "telemetry-alt-value",
      },
      {
        key: "speed",
        label: "SPEED",
        metric: view.primaryMetrics.speed,
        testId: "telemetry-speed-value",
      },
      {
        key: "heading",
        label: "HEADING",
        metric: view.secondaryMetrics.heading,
        testId: "telemetry-heading-value",
      },
      {
        key: "climb-rate",
        label: "CLIMB RATE",
        metric: view.secondaryMetrics.climbRate,
      },
    ],
  },
  {
    title: "Battery",
    entries: [
      {
        key: "battery",
        label: "CHARGE",
        metric: view.primaryMetrics.battery,
        testId: "telemetry-battery-value",
      },
      {
        key: "battery-voltage",
        label: "VOLTAGE",
        metric: view.secondaryMetrics.batteryVoltage,
      },
    ],
  },
  {
    title: "GPS",
    entries: [
      {
        key: "gps",
        label: "FIX",
        metric: view.primaryMetrics.gps,
        testId: "telemetry-gps-text",
      },
      {
        key: "satellites",
        label: "SATELLITES",
        metric: view.secondaryMetrics.satellites,
      },
    ],
  },
]);

function metricColorVar(metric: OperatorMetricView): string {
  if (metric.state === "stale" || metric.state === "unavailable") {
    return "var(--color-text-muted)";
  }
  switch (metric.tone) {
    case "positive":
      return "var(--color-success)";
    case "caution":
      return "var(--color-warning)";
    case "critical":
      return "var(--color-danger)";
    default:
      return "var(--color-text-primary)";
  }
}
</script>

<section
  class="size-full min-h-0"
  data-shell-tier={tier}
  data-testid={appShellTestIds.operatorWorkspace}
>
  <SplitPane
    direction={useVerticalSplit ? "vertical" : "horizontal"}
    initialRatio={useVerticalSplit ? 0.55 : 0.7}
    minRatio={0.3}
    maxRatio={0.85}
  >
    {#snippet first()}
      <div class="size-full">
        <OverviewMap
          vehicleLat={vehiclePos?.latitude_deg}
          vehicleLon={vehiclePos?.longitude_deg}
          vehicleHeading={vehiclePos?.heading_deg}
          homeLat={homePos?.latitude_deg}
          homeLon={homePos?.longitude_deg}
        />
      </div>
    {/snippet}
    {#snippet second()}
      <div class="flex h-full flex-col gap-2 overflow-y-auto p-2">
        <!-- Quality state indicators -->
        {#if view.quality.stale}
          <div
            class="rounded-md bg-warning px-2 py-1 text-xs font-semibold text-bg-primary"
            data-testid="operator-workspace-stale"
          >
            <span>Telemetry stale</span>
          </div>
        {/if}
        {#if view.quality.disconnected}
          <div
            class="rounded-md bg-border px-2 py-1 text-xs font-semibold text-text-muted"
            data-testid="operator-workspace-disconnected"
          >
            <span>Disconnected</span>
          </div>
        {/if}

        <!-- Degraded data source badges -->
        {#if view.quality.telemetry.degraded}
          <span
            class="inline-block rounded-md bg-warning px-2 py-1 text-xs font-medium text-bg-primary"
            data-testid="operator-workspace-degraded-telemetry"
          >degraded</span>
        {/if}
        {#if view.quality.support.degraded}
          <span
            class="inline-block rounded-md bg-warning px-2 py-1 text-xs font-medium text-bg-primary"
            data-testid="operator-workspace-degraded-support"
          >degraded</span>
        {/if}
        {#if view.quality.notices.degraded}
          <span
            class="inline-block rounded-md bg-warning px-2 py-1 text-xs font-medium text-bg-primary"
            data-testid="operator-workspace-degraded-notices"
          >degraded</span>
        {/if}

        <!-- Readiness strip -->
        <div class="py-1 text-xs font-medium text-text-muted" data-testid="operator-workspace-readiness">
          {view.readiness.label}
        </div>

        <!-- Metric groups -->
        {#each metricGroups as group (group.title)}
          <div>
            <h3 class="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">{group.title}</h3>
            <div class="grid grid-cols-2 gap-2">
              {#each group.entries as entry (entry.key)}
                <div
                  class="flex min-w-0 flex-col gap-1 rounded-md border border-border bg-bg-secondary px-2 py-2"
                  data-testid={entry.testId}
                >
                  <span class="min-w-0 truncate text-xs font-medium tracking-wide text-text-muted">{entry.label}</span>
                  <span
                    class="min-w-0 break-words font-mono text-sm font-medium leading-tight tabular-nums"
                    style:color={metricColorVar(entry.metric)}
                  >
                    {entry.metric.text}
                  </span>
                </div>
              {/each}
            </div>
          </div>
        {/each}

        <!-- Status notice strip -->
        <div class="mt-1">
          <div class="mb-1 flex items-center justify-between">
            <span class="text-xs font-semibold uppercase tracking-wide text-text-muted">Notices</span>
            {#if view.notices.length > 0}
              <span class="text-xs text-text-muted" data-testid="operator-workspace-notice-count">{view.notices.length} shown</span>
            {/if}
          </div>
          {#if view.notices.length === 0}
            <div class="py-1 text-xs text-text-muted" data-testid="operator-workspace-notices-empty">
              No active notices
            </div>
          {:else}
            <ul class="m-0 flex list-none flex-col gap-1 p-0">
              {#each view.notices as notice (notice.id)}
                <li
                  class={[
                    "rounded-md border border-border bg-bg-secondary px-2 py-1 text-sm text-text-primary",
                    notice.tone === "critical" && "border-danger text-danger",
                    notice.tone === "caution" && "border-warning text-warning",
                  ]}
                >
                  {notice.text}
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>
    {/snippet}
  </SplitPane>
</section>
