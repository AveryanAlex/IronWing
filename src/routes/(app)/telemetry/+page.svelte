<script lang="ts">
import { ChevronDown } from "lucide-svelte";
import { fromStore } from "svelte/store";

import { getOperatorWorkspaceViewStoreContext, getSessionViewStoreContext } from "../../../app/shell/runtime-context";
import { Button, Card, Eyebrow, MetricTile, WorkspaceShell } from "../../../components/ui";
import AttitudeOrientationGauge from "../../../features/telemetry/components/AttitudeOrientationGauge.svelte";
import BatteryVoltageGauge from "../../../features/telemetry/components/BatteryVoltageGauge.svelte";
import PwmChannelStrip from "../../../features/telemetry/components/PwmChannelStrip.svelte";

type MetricTone = "neutral" | "info" | "success" | "warning" | "danger";
type MetricState = "live" | "unavailable";

const operatorWorkspace = fromStore(getOperatorWorkspaceViewStoreContext());
const sessionView = fromStore(getSessionViewStoreContext());

type MetricEntry = {
  key: string;
  label: string;
  value: string;
  tone?: MetricTone;
  state: MetricState;
  testId?: string;
  wide?: boolean;
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

function isFiniteNumber(value: number | undefined): value is number {
  if (value == null || Number.isNaN(value)) return false;
  return Number.isFinite(value);
}

function formatNumber(value: number | undefined, digits: number, unit: string): string {
  if (!isFiniteNumber(value)) return `--${unit ? ` ${unit}` : ""}`;
  return `${value.toFixed(digits)}${unit ? ` ${unit}` : ""}`;
}

function formatWhole(value: number | undefined, unit: string): string {
  if (!isFiniteNumber(value)) return `--${unit ? ` ${unit}` : ""}`;
  return `${Math.round(value)}${unit ? ` ${unit}` : ""}`;
}

function formatPercent(value: number | undefined): string {
  if (!isFiniteNumber(value)) return "--%";
  return `${value.toFixed(1)}%`;
}

function formatDeg(value: number | undefined): string {
  if (!isFiniteNumber(value)) return "--°";
  return `${value.toFixed(1)}°`;
}

function formatCoordinate(value: number | undefined): string {
  if (!isFiniteNumber(value)) return "--°";
  return `${value.toFixed(7)}°`;
}

function formatTime(value: number | undefined): string {
  if (!isFiniteNumber(value)) return "-- s";

  if (value >= 60) {
    const minutes = Math.floor(value / 60);
    const seconds = Math.round(value % 60);
    return `${minutes}m ${seconds}s`;
  }

  return `${Math.round(value)} s`;
}

function formatPower(voltage: number | undefined, current: number | undefined): string {
  if (!isFiniteNumber(voltage) || !isFiniteNumber(current)) return "-- W";
  return `${(voltage * current).toFixed(0)} W`;
}

function gpsTone(fixType: string | undefined): MetricTone {
  const normalized = fixType?.toLowerCase() ?? "";
  if (!normalized || normalized.includes("no") || normalized === "none") return "warning";
  if (normalized.includes("3d") || normalized.includes("rtk")) return "success";
  return "neutral";
}

function batteryTone(value: number | undefined): MetricTone {
  if (!isFiniteNumber(value)) return "neutral";
  if (value <= 15) return "danger";
  if (value <= 30) return "warning";
  return "success";
}

function hdopTone(value: number | undefined): MetricTone {
  if (!isFiniteNumber(value)) return "neutral";
  if (value <= 1.5) return "success";
  if (value <= 3) return "warning";
  return "danger";
}

function metric(
  key: string,
  label: string,
  value: string,
  hasValue: boolean,
  options: { tone?: MetricTone; testId?: string; wide?: boolean } = {},
): MetricEntry {
  return {
    key,
    label,
    value,
    tone: options.tone ?? "neutral",
    state: metricState(hasValue),
    testId: options.testId,
    wide: options.wide,
  };
}

let view = $derived(operatorWorkspace.current);
let session = $derived(sessionView.current);
let telemetry = $derived(session.telemetry);
let connected = $derived(view.connected);

function metricState(hasValue: boolean): "live" | "unavailable" {
  if (!connected) return "unavailable";
  return hasValue ? "live" : "unavailable";
}

function metricTone(entry: MetricEntry): MetricTone {
  if (entry.state === "unavailable") return "neutral";
  return entry.tone ?? "neutral";
}

let sections = $derived.by<MetricSection[]>(() => {
  const hasPower = isFiniteNumber(telemetry.battery_voltage_v) && isFiniteNumber(telemetry.battery_current_a);

  return [
    {
      key: "flight",
      title: "Flight",
      entries: [
        metric(
          "altitude",
          "Altitude",
          formatNumber(telemetry.altitude_m, 1, "m"),
          isFiniteNumber(telemetry.altitude_m),
          {
            testId: "telemetry-alt-value",
          },
        ),
        metric(
          "ground-speed",
          "Ground speed",
          formatNumber(telemetry.speed_mps, 1, "m/s"),
          isFiniteNumber(telemetry.speed_mps),
          {
            testId: "telemetry-speed-value",
          },
        ),
        metric(
          "airspeed",
          "Airspeed",
          formatNumber(telemetry.airspeed_mps, 1, "m/s"),
          isFiniteNumber(telemetry.airspeed_mps),
        ),
        metric(
          "climb-rate",
          "Climb rate",
          formatNumber(telemetry.climb_rate_mps, 1, "m/s"),
          isFiniteNumber(telemetry.climb_rate_mps),
        ),
        metric("throttle", "Throttle", formatPercent(telemetry.throttle_pct), isFiniteNumber(telemetry.throttle_pct)),
      ],
    },
    {
      key: "position",
      title: "Position",
      entries: [
        metric(
          "latitude",
          "Latitude",
          formatCoordinate(telemetry.latitude_deg),
          isFiniteNumber(telemetry.latitude_deg),
        ),
        metric(
          "longitude",
          "Longitude",
          formatCoordinate(telemetry.longitude_deg),
          isFiniteNumber(telemetry.longitude_deg),
        ),
        metric("heading", "Heading", formatDeg(telemetry.heading_deg), isFiniteNumber(telemetry.heading_deg), {
          testId: "telemetry-heading-value",
        }),
      ],
    },
    {
      key: "navigation",
      title: "Navigation",
      entries: [
        metric("wp-dist", "WP distance", formatWhole(telemetry.wp_dist_m, "m"), isFiniteNumber(telemetry.wp_dist_m)),
        metric(
          "nav-bearing",
          "Nav bearing",
          formatDeg(telemetry.nav_bearing_deg),
          isFiniteNumber(telemetry.nav_bearing_deg),
        ),
        metric(
          "target-bearing",
          "Target bearing",
          formatDeg(telemetry.target_bearing_deg),
          isFiniteNumber(telemetry.target_bearing_deg),
        ),
        metric(
          "xtrack-error",
          "Cross-track",
          formatNumber(telemetry.xtrack_error_m, 1, "m"),
          isFiniteNumber(telemetry.xtrack_error_m),
        ),
      ],
    },
    {
      key: "attitude",
      title: "Attitude",
      entries: [
        metric("roll", "Roll", formatDeg(telemetry.roll_deg), isFiniteNumber(telemetry.roll_deg)),
        metric("pitch", "Pitch", formatDeg(telemetry.pitch_deg), isFiniteNumber(telemetry.pitch_deg)),
        metric("yaw", "Yaw", formatDeg(telemetry.yaw_deg), isFiniteNumber(telemetry.yaw_deg)),
      ],
    },
    {
      key: "power",
      title: "Power",
      entries: [
        metric("battery-pct", "Charge", formatPercent(telemetry.battery_pct), isFiniteNumber(telemetry.battery_pct), {
          tone: batteryTone(telemetry.battery_pct),
          testId: "telemetry-battery-value",
        }),
        metric(
          "battery-voltage",
          "Voltage",
          formatNumber(telemetry.battery_voltage_v, 1, "V"),
          isFiniteNumber(telemetry.battery_voltage_v),
        ),
        metric(
          "battery-current",
          "Current",
          formatNumber(telemetry.battery_current_a, 1, "A"),
          isFiniteNumber(telemetry.battery_current_a),
        ),
        metric(
          "battery-power",
          "Power",
          formatPower(telemetry.battery_voltage_v, telemetry.battery_current_a),
          hasPower,
        ),
        metric(
          "energy-consumed",
          "Consumed",
          formatNumber(telemetry.energy_consumed_wh, 0, "Wh"),
          isFiniteNumber(telemetry.energy_consumed_wh),
        ),
        metric(
          "time-remaining",
          "Time remaining",
          formatTime(telemetry.battery_time_remaining_s),
          isFiniteNumber(telemetry.battery_time_remaining_s),
        ),
      ],
    },
    {
      key: "gps",
      title: "GPS",
      entries: [
        metric("gps-fix", "Fix type", telemetry.gps_fix_type ?? "--", Boolean(telemetry.gps_fix_type), {
          tone: gpsTone(telemetry.gps_fix_type),
          testId: "telemetry-gps-text",
        }),
        metric(
          "satellites",
          "Satellites",
          formatWhole(telemetry.gps_satellites, "sats"),
          isFiniteNumber(telemetry.gps_satellites),
        ),
        metric("hdop", "HDOP", formatNumber(telemetry.gps_hdop, 1, ""), isFiniteNumber(telemetry.gps_hdop), {
          tone: hdopTone(telemetry.gps_hdop),
        }),
      ],
    },
    {
      key: "terrain",
      title: "Terrain",
      entries: [
        metric(
          "terrain-height",
          "Terrain height",
          formatNumber(telemetry.terrain_height_m, 1, "m"),
          isFiniteNumber(telemetry.terrain_height_m),
        ),
        metric(
          "height-above-terrain",
          "Height above terrain",
          formatNumber(telemetry.height_above_terrain_m, 1, "m"),
          isFiniteNumber(telemetry.height_above_terrain_m),
        ),
      ],
    },
    {
      key: "radio",
      title: "Radio & outputs",
      entries: [metric("rc-rssi", "RC RSSI", formatPercent(telemetry.rc_rssi), isFiniteNumber(telemetry.rc_rssi))],
    },
  ];
});
</script>

<WorkspaceShell mode="inset">
  <div class="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
    {#each sections as section (section.key)}
      <Card.Root as="section" class={`min-w-0 ${section.key === "attitude" || section.key === "power" || section.key === "radio" ? "xl:col-span-2 2xl:col-span-1" : ""}`} density="compact" gap="none" padding="tight" surface="panel-soft">
        <Button
          variant="ghost"
          size="sm"
          class="flex w-full cursor-pointer items-center justify-between px-2 py-1 transition-colors duration-150"
          onclick={() => toggleSection(section.key)}
        >
          <Eyebrow as="span" class="font-bold">
            {section.title}
            <span class="ml-1 font-medium text-text-secondary">{section.entries.length}</span>
          </Eyebrow>
          <ChevronDown
            aria-hidden="true"
            class={`h-3.5 w-3.5 text-text-muted transition-transform duration-150 ease-in-out ${collapsed[section.key] ? "-rotate-90" : ""}`}
            size={14}
          />
        </Button>

        {#if !collapsed[section.key]}
          <div class="mt-2 flex flex-col gap-2">
            {#if section.key === "power"}
              <BatteryVoltageGauge
                percent={telemetry.battery_pct}
                voltage={telemetry.battery_voltage_v}
                current={telemetry.battery_current_a}
                energyWh={telemetry.energy_consumed_wh}
                timeRemainingS={telemetry.battery_time_remaining_s}
                cellVoltages={telemetry.battery_voltage_cells}
              />
            {:else if section.key === "attitude"}
              <AttitudeOrientationGauge
                rollDeg={telemetry.roll_deg}
                pitchDeg={telemetry.pitch_deg}
                yawDeg={telemetry.yaw_deg}
                stale={!connected}
              />
            {:else if section.key === "radio"}
              <PwmChannelStrip title="RC channels" values={telemetry.rc_channels} labelPrefix="CH" emptyText="No RC channel telemetry available." />
              <PwmChannelStrip title="Servo outputs" values={telemetry.servo_outputs} labelPrefix="S" maxVisible={16} emptyText="No servo output telemetry available." />
            {/if}

            {#if section.key !== "attitude"}
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {#each section.entries as entry (entry.key)}
                  <MetricTile
                    class={`min-w-0 ${entry.wide ? "col-span-2 sm:col-span-3 xl:col-span-4" : ""}`}
                    density="compact"
                    label={entry.label}
                    mono
                    stale={entry.state === "unavailable"}
                    testId={entry.testId}
                    tone={metricTone(entry)}
                    value={entry.value}
                  />
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </Card.Root>
    {/each}
  </div>
</WorkspaceShell>
