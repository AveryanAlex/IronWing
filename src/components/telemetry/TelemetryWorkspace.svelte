<script lang="ts">
import { fromStore } from "svelte/store";

import type { OperatorMetricView } from "../../lib/telemetry-selectors";
import {
  getOperatorWorkspaceViewStoreContext,
  getSessionViewStoreContext,
} from "../../app/shell/runtime-context";

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
  if (value == null || Number.isNaN(value)) return "--\u00B0";
  return `${value.toFixed(1)}\u00B0`;
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

let sections = $derived.by<MetricSection[]>(() => {
  const flight: MetricEntry[] = [
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
      key: "ground-speed",
      label: "GROUND SPEED",
      metric: {
        text: telemetry.speed_mps != null ? `${telemetry.speed_mps.toFixed(1)} m/s` : "-- m/s",
        tone: "neutral",
        state: metricState(telemetry.speed_mps != null),
        value: telemetry.speed_mps,
      },
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
  ];

  const gps: MetricEntry[] = [
    {
      key: "gps-fix",
      label: "FIX TYPE",
      metric: view.primaryMetrics.gps,
    },
    {
      key: "satellites",
      label: "SATELLITES",
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
      label: "VOLTAGE",
      metric: view.secondaryMetrics.batteryVoltage,
    },
  ];

  if (telemetry.battery_current_a != null) {
    battery.push({
      key: "battery-current",
      label: "CURRENT",
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
    label: "CHARGE",
    metric: view.primaryMetrics.battery,
  });

  if (telemetry.battery_voltage_v != null && telemetry.battery_current_a != null) {
    battery.push({
      key: "battery-power",
      label: "POWER",
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
      label: "ROLL",
      metric: {
        text: formatDeg(telemetry.roll_deg),
        tone: "neutral",
        state: metricState(telemetry.roll_deg != null),
        value: telemetry.roll_deg,
      },
    },
    {
      key: "pitch",
      label: "PITCH",
      metric: {
        text: formatDeg(telemetry.pitch_deg),
        tone: "neutral",
        state: metricState(telemetry.pitch_deg != null),
        value: telemetry.pitch_deg,
      },
    },
    {
      key: "yaw",
      label: "YAW",
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
      label: "DIST TO WP",
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
      label: "NAV BEARING",
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

<section class="telemetry-workspace">
  <h2 class="telemetry-workspace__title">Telemetry</h2>

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
        <div class="telemetry-section__grid">
          {#each section.entries as entry (entry.key)}
            <div class="telemetry-card" data-testid={entry.testId}>
              <span class="telemetry-card__label">{entry.label}</span>
              <span
                class="telemetry-card__value"
                style:color={metricColorVar(entry.metric)}
              >
                {entry.metric.text}
              </span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/each}
</section>

<style>
  .telemetry-workspace {
    overflow-y: auto;
    padding: 8px;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .telemetry-workspace__title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0 0 4px 2px;
  }

  .telemetry-section {
    display: flex;
    flex-direction: column;
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
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.08em;
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

  .telemetry-section__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 6px;
    margin-top: 4px;
  }

  .telemetry-card {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid var(--color-border);
    background: var(--color-bg-secondary);
  }

  .telemetry-card__label {
    font-size: 0.6rem;
    font-weight: 500;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
  }

  .telemetry-card__value {
    font-family: "JetBrains Mono", monospace;
    font-variant-numeric: tabular-nums;
    font-size: 1.1rem;
    font-weight: 500;
    line-height: 1.2;
  }
</style>
