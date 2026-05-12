<script lang="ts">
import { fromStore } from "svelte/store";

import type { OperatorMetricView, TelemetrySummaryTone } from "../../lib/telemetry-selectors";
import {
  getOperatorWorkspaceViewStoreContext,
  getSessionViewStoreContext,
} from "../../app/shell/runtime-context";
import { MetricGroup, MetricTile, WorkspaceShell } from "../ui";

type MetricTone = "neutral" | "info" | "success" | "warning" | "danger";

const operatorWorkspace = fromStore(getOperatorWorkspaceViewStoreContext());
const sessionView = fromStore(getSessionViewStoreContext());

type MetricEntry = {
  key: string;
  label: string;
  metric: OperatorMetricView;
  testId?: string;
};

type MetricSection = {
  key: string;
  title: string;
  entries: MetricEntry[];
};

let collapsed = $state<Record<string, boolean>>({});

function toggleSection(key: string) {
  collapsed = { ...collapsed, [key]: !collapsed[key] };
}

function formatDeg(value: number | undefined): string {
  if (value == null || Number.isNaN(value)) return "--°";
  return `${value.toFixed(1)}°`;
}

function formatDistance(value: number | undefined): string {
  if (value == null || Number.isNaN(value)) return "-- m";
  return `${value.toFixed(0)} m`;
}

function formatCurrent(value: number | undefined): string {
  if (value == null || Number.isNaN(value)) return "-- A";
  return `${value.toFixed(1)} A`;
}

function formatPower(voltage: number | undefined, current: number | undefined): string {
  if (voltage == null || current == null || Number.isNaN(voltage) || Number.isNaN(current)) return "-- W";
  return `${(voltage * current).toFixed(0)} W`;
}

function formatHdop(value: number | undefined): string {
  if (value == null || Number.isNaN(value)) return "--";
  return value.toFixed(1);
}

let view = $derived(operatorWorkspace.current);
let session = $derived(sessionView.current);
let telemetry = $derived(session.telemetry);
let connected = $derived(view.connected);

function metricState(hasValue: boolean): "live" | "unavailable" {
  if (!connected) return "unavailable";
  return hasValue ? "live" : "unavailable";
}

function metricTone(metric: OperatorMetricView): MetricTone {
  if (metric.state === "unavailable" || metric.state === "stale") {
    return "neutral";
  }
  return mapTone(metric.tone);
}

function mapTone(tone: TelemetrySummaryTone): MetricTone {
  switch (tone) {
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

let sections = $derived.by<MetricSection[]>(() => {
  const flight: MetricEntry[] = [
    {
      key: "altitude",
      label: "Altitude",
      metric: view.primaryMetrics.altitude,
      testId: "telemetry-alt-value",
    },
    {
      key: "speed",
      label: "Speed",
      metric: view.primaryMetrics.speed,
      testId: "telemetry-speed-value",
    },
    {
      key: "ground-speed",
      label: "Ground Speed",
      metric: {
        text: telemetry.speed_mps != null ? `${telemetry.speed_mps.toFixed(1)} m/s` : "-- m/s",
        tone: "neutral",
        state: metricState(telemetry.speed_mps != null),
        value: telemetry.speed_mps,
      },
    },
    {
      key: "heading",
      label: "Heading",
      metric: view.secondaryMetrics.heading,
      testId: "telemetry-heading-value",
    },
    {
      key: "climb-rate",
      label: "Climb Rate",
      metric: view.secondaryMetrics.climbRate,
    },
  ];

  const gps: MetricEntry[] = [
    {
      key: "gps-fix",
      label: "Fix Type",
      metric: view.primaryMetrics.gps,
    },
    {
      key: "satellites",
      label: "Satellites",
      metric: view.secondaryMetrics.satellites,
    },
  ];

  if (telemetry.gps_hdop != null) {
    gps.push({
      key: "hdop",
      label: "HDOP",
      metric: {
        text: formatHdop(telemetry.gps_hdop),
        tone: telemetry.gps_hdop <= 1.5 ? "positive" : telemetry.gps_hdop <= 3 ? "caution" : "critical",
        state: metricState(true),
        value: telemetry.gps_hdop,
      },
    });
  }

  const battery: MetricEntry[] = [
    {
      key: "battery-voltage",
      label: "Voltage",
      metric: view.secondaryMetrics.batteryVoltage,
    },
  ];

  if (telemetry.battery_current_a != null) {
    battery.push({
      key: "battery-current",
      label: "Current",
      metric: {
        text: formatCurrent(telemetry.battery_current_a),
        tone: "neutral",
        state: metricState(true),
        value: telemetry.battery_current_a,
      },
    });
  }

  battery.push({
    key: "battery-pct",
    label: "Charge",
    metric: view.primaryMetrics.battery,
  });

  if (telemetry.battery_voltage_v != null && telemetry.battery_current_a != null) {
    battery.push({
      key: "battery-power",
      label: "Power",
      metric: {
        text: formatPower(telemetry.battery_voltage_v, telemetry.battery_current_a),
        tone: "neutral",
        state: metricState(true),
        value: telemetry.battery_voltage_v * telemetry.battery_current_a,
      },
    });
  }

  const attitude: MetricEntry[] = [
    {
      key: "roll",
      label: "Roll",
      metric: {
        text: formatDeg(telemetry.roll_deg),
        tone: "neutral",
        state: metricState(telemetry.roll_deg != null),
        value: telemetry.roll_deg,
      },
    },
    {
      key: "pitch",
      label: "Pitch",
      metric: {
        text: formatDeg(telemetry.pitch_deg),
        tone: "neutral",
        state: metricState(telemetry.pitch_deg != null),
        value: telemetry.pitch_deg,
      },
    },
    {
      key: "yaw",
      label: "Yaw",
      metric: {
        text: formatDeg(telemetry.yaw_deg),
        tone: "neutral",
        state: metricState(telemetry.yaw_deg != null),
        value: telemetry.yaw_deg,
      },
    },
  ];

  const navigation: MetricEntry[] = [];

  if (telemetry.wp_dist_m != null) {
    navigation.push({
      key: "wp-dist",
      label: "Dist To WP",
      metric: {
        text: formatDistance(telemetry.wp_dist_m),
        tone: "neutral",
        state: metricState(true),
        value: telemetry.wp_dist_m,
      },
    });
  }

  if (telemetry.nav_bearing_deg != null) {
    navigation.push({
      key: "nav-bearing",
      label: "Nav Bearing",
      metric: {
        text: formatDeg(telemetry.nav_bearing_deg),
        tone: "neutral",
        state: metricState(true),
        value: telemetry.nav_bearing_deg,
      },
    });
  }

  const result: MetricSection[] = [
    { key: "flight", title: "Flight", entries: flight },
    { key: "gps", title: "GPS", entries: gps },
    { key: "battery", title: "Battery", entries: battery },
    { key: "attitude", title: "Attitude", entries: attitude },
  ];

  if (navigation.length > 0) {
    result.push({ key: "navigation", title: "Navigation", entries: navigation });
  }

  return result;
});
</script>

<WorkspaceShell mode="inset">
  {#each sections as section (section.key)}
    <div class="telemetry-section">
      <button
        class="telemetry-section__header"
        onclick={() => toggleSection(section.key)}
        type="button"
      >
        <span class="telemetry-section__title">{section.title}</span>
        <svg
          class="telemetry-section__chevron"
          class:telemetry-section__chevron--collapsed={collapsed[section.key]}
          fill="none"
          height="14"
          stroke="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          viewBox="0 0 24 24"
          width="14"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {#if !collapsed[section.key]}
        <MetricGroup columns={4}>
          {#each section.entries as entry (entry.key)}
            <MetricTile
              label={entry.label}
              value={entry.metric.text}
              tone={metricTone(entry.metric)}
              stale={entry.metric.state === "stale" || entry.metric.state === "unavailable"}
              testId={entry.testId}
            />
          {/each}
        </MetricGroup>
      {/if}
    </div>
  {/each}
</WorkspaceShell>

<style>
  .telemetry-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .telemetry-section__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 6px;
    border: none;
    background: none;
    cursor: pointer;
    border-radius: 4px;
    transition: background-color 0.15s;
  }

  .telemetry-section__header:hover {
    background: var(--color-bg-secondary);
  }

  .telemetry-section__title {
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    color: var(--color-text-muted);
    text-transform: uppercase;
  }

  .telemetry-section__chevron {
    color: var(--color-text-muted);
    transition: transform 0.15s ease;
  }

  .telemetry-section__chevron--collapsed {
    transform: rotate(-90deg);
  }
</style>
