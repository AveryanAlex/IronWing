<script lang="ts">
import { fromStore } from "svelte/store";

import type { OperatorMetricView } from "../../lib/telemetry-selectors";
import SplitPane from "../../components/shared/SplitPane.svelte";
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
let isPhone = $derived(tier === "phone");

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
          tone: view.lifecycle.armStateTone === "positive" ? "positive"
            : view.lifecycle.armStateTone === "caution" ? "caution"
            : view.lifecycle.armStateTone === "critical" ? "critical"
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
  class="operator-workspace"
  data-shell-tier={tier}
  data-testid={appShellTestIds.operatorWorkspace}
>
  <SplitPane
    direction={isPhone ? "vertical" : "horizontal"}
    initialRatio={isPhone ? 0.55 : 0.7}
    minRatio={0.3}
    maxRatio={0.85}
  >
    {#snippet first()}
      <div class="operator-workspace__map">
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
      <div class="operator-workspace__metrics">
        {#each metricGroups as group (group.title)}
          <div class="metric-group">
            <h3 class="metric-group__title">{group.title}</h3>
            <div class="metric-group__grid">
              {#each group.entries as entry (entry.key)}
                <div class="metric-card" data-testid={entry.testId}>
                  <span class="metric-card__label">{entry.label}</span>
                  <span
                    class="metric-card__value"
                    style:color={metricColorVar(entry.metric)}
                  >
                    {entry.metric.text}
                  </span>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/snippet}
  </SplitPane>
</section>

<style>
  .operator-workspace {
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  .operator-workspace__map {
    width: 100%;
    height: 100%;
  }

  .operator-workspace__metrics {
    overflow-y: auto;
    padding: 8px;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .metric-group__title {
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--color-text-muted);
    text-transform: uppercase;
    margin: 0 0 4px 2px;
  }

  .metric-group__grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
  }

  .metric-card {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid var(--color-border);
    background: var(--color-bg-secondary);
  }

  .metric-card__label {
    font-size: 0.6rem;
    font-weight: 500;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
  }

  .metric-card__value {
    font-family: "JetBrains Mono", monospace;
    font-variant-numeric: tabular-nums;
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.2;
  }
</style>
