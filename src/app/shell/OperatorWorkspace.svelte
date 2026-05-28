<script lang="ts">
import { fromStore } from "svelte/store";

import type { OperatorMetricView } from "../../lib/telemetry-selectors";
import { Alert, Badge, Card, Eyebrow, HelperText, MetricTile, MonoValue, SplitPane } from "../../components/ui";
import OverviewMap from "../../features/overview/components/OverviewMap.svelte";
import { appShellTestIds } from "./chrome-state";
import {
  getMissionPlannerStoreContext,
  getOperatorWorkspaceViewStoreContext,
  getSessionStoreContext,
  getSessionViewStoreContext,
  getShellChromeStoreContext,
} from "./runtime-context";

const operatorWorkspace = fromStore(getOperatorWorkspaceViewStoreContext());
const sessionStore = fromStore(getSessionStoreContext());
const sessionView = fromStore(getSessionViewStoreContext());
const missionPlanner = fromStore(getMissionPlannerStoreContext());
const chrome = fromStore(getShellChromeStoreContext());

let view = $derived(operatorWorkspace.current);
let rawSession = $derived(sessionStore.current);
let session = $derived(sessionView.current);
let missionState = $derived(missionPlanner.current.missionState);
let tier = $derived(chrome.current.tier);
let useVerticalSplit = $derived(tier === "phone" || tier === "tablet");

let vehiclePos = $derived(session.vehiclePosition);
let homePos = $derived(session.homePosition);
let currentAltitudeM = $derived(session.telemetry.altitude_m);

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

type MetricTileTone = "neutral" | "success" | "warning" | "danger";

function metricTileTone(metric: OperatorMetricView): MetricTileTone {
  switch (metric.tone) {
    case "positive":
      return "success";
    case "caution":
      return "warning";
    case "critical":
      return "danger";
    default:
      return "neutral";
  }
}

function metricDimmed(metric: OperatorMetricView) {
  return metric.state === "stale" || metric.state === "unavailable";
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
          homeAltitude={homePos?.altitude_m}
          missionPlan={missionState?.plan}
          currentMissionIndex={missionState?.current_index}
          guided={rawSession.guided}
          {currentAltitudeM}
        />
      </div>
    {/snippet}
    {#snippet second()}
      <div class="flex h-full flex-col gap-2 overflow-y-auto p-2">
        {#if view.quality.stale}
          <Alert
            density="compact"
            description="Telemetry stale"
            testId="operator-workspace-stale"
            variant="warning"
          />
        {/if}
        {#if view.quality.disconnected}
          <Alert
            density="compact"
            description="Disconnected"
            testId="operator-workspace-disconnected"
            variant="info"
          />
        {/if}

        <div class="flex flex-wrap gap-2">
          {#if view.quality.telemetry.degraded}
            <Badge variant="warning" size="sm" shape="rounded" testId="operator-workspace-degraded-telemetry">degraded</Badge>
          {/if}
          {#if view.quality.support.degraded}
            <Badge variant="warning" size="sm" shape="rounded" testId="operator-workspace-degraded-support">degraded</Badge>
          {/if}
          {#if view.quality.notices.degraded}
            <Badge variant="warning" size="sm" shape="rounded" testId="operator-workspace-degraded-notices">degraded</Badge>
          {/if}
        </div>

        <HelperText size="xs" tone="muted" class="py-1" testId="operator-workspace-readiness">
          {view.readiness.label}
        </HelperText>

        {#each metricGroups as group (group.title)}
          <div>
            <Eyebrow as="div" class="mb-1">{group.title}</Eyebrow>
            <div class="grid grid-cols-2 gap-2">
              {#each group.entries as entry (entry.key)}
                <MetricTile
                  label={entry.label}
                  value={entry.metric.text}
                  density="compact"
                  mono
                  stale={metricDimmed(entry.metric)}
                  tone={metricTileTone(entry.metric)}
                  testId={entry.testId}
                />
              {/each}
            </div>
          </div>
        {/each}

        <div class="mt-1">
          <div class="mb-1 flex items-center justify-between">
            <Eyebrow as="span">Notices</Eyebrow>
            {#if view.notices.length > 0}
              <HelperText as="span" size="xs" tone="muted" testId="operator-workspace-notice-count">{view.notices.length} shown</HelperText>
            {/if}
          </div>
          {#if view.notices.length === 0}
            <HelperText size="xs" tone="muted" class="py-1" testId="operator-workspace-notices-empty">
              No active notices
            </HelperText>
          {:else}
            <ul class="m-0 flex list-none flex-col gap-1 p-0">
              {#each view.notices as notice (notice.id)}
                <li>
                  <Card.Root
                    density="compact"
                    surface="secondary"
                    tone={notice.tone === "critical" ? "danger" : notice.tone === "caution" ? "warning" : "neutral"}
                    class="py-1"
                  >
                    <MonoValue as="span" size="sm" tone={notice.tone === "critical" ? "danger" : notice.tone === "caution" ? "warning" : "primary"} wrap>{notice.text}</MonoValue>
                  </Card.Root>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>
    {/snippet}
  </SplitPane>
</section>
