<svelte:options runes={false} />

<script lang="ts">
import { createSessionViewStore, session, type SessionStore } from "../../lib/stores/session";

export let store: SessionStore = session;

let view = createSessionViewStore(store);
let altitudeText = "-- m";
let speedText = "-- m/s";
let batteryText = "--%";
let headingText = "--°";
let gpsText = "GPS: --";
let batteryTone = "text-text-primary";
let gpsTone = "text-text-primary";

function formatMetric(connected: boolean, value: number | undefined, suffix: string, decimals = 1) {
  if (!connected || value == null || Number.isNaN(value)) {
    return `--${suffix}`;
  }

  return `${value.toFixed(decimals)}${suffix}`;
}

function formatWholeMetric(connected: boolean, value: number | undefined, suffix: string) {
  if (!connected || value == null || Number.isNaN(value)) {
    return `--${suffix}`;
  }

  return `${Math.round(value)}${suffix}`;
}

function batteryClass(connected: boolean, value: number | undefined) {
  if (!connected || value == null || Number.isNaN(value)) {
    return "text-text-primary";
  }

  if (value > 50) {
    return "text-success";
  }

  if (value >= 20) {
    return "text-warning";
  }

  return "text-danger";
}

function gpsClass(connected: boolean, value: string | undefined) {
  const fix = value?.toLowerCase() ?? "";
  if (!connected || fix.length === 0 || fix === "--") {
    return "text-text-primary";
  }

  if (fix.includes("3d") || fix.includes("rtk")) {
    return "text-success";
  }

  if (fix.includes("2d")) {
    return "text-warning";
  }

  return "text-danger";
}

$: view = createSessionViewStore(store);
$: altitudeText = formatMetric($view.connected, $view.telemetry.altitude_m, " m");
$: speedText = formatMetric($view.connected, $view.telemetry.speed_mps, " m/s");
$: batteryText = formatMetric($view.connected, $view.telemetry.battery_pct, "%");
$: headingText = formatWholeMetric($view.connected, $view.telemetry.heading_deg, "°");
$: gpsText = !$view.connected
  ? "GPS: --"
  : `GPS: ${$view.telemetry.gps_fix_type ?? "--"} · ${$view.telemetry.gps_satellites ?? "--"} sats`;
$: batteryTone = batteryClass($view.connected, $view.telemetry.battery_pct);
$: gpsTone = gpsClass($view.connected, $view.telemetry.gps_fix_type);
</script>

<section class="rounded-[24px] border border-border bg-bg-secondary/80 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.18)]">
  <div class="flex items-center justify-between gap-3">
    <div>
      <p class="runtime-eyebrow mb-2">Telemetry summary</p>
      <h2 class="text-xl font-semibold tracking-[-0.03em] text-text-primary">First live metrics from the new store</h2>
    </div>
    <span class="rounded-full bg-bg-primary/70 px-3 py-1 text-xs font-semibold text-text-secondary">
      {$view.connected ? "streaming" : "waiting for link"}
    </span>
  </div>

  <dl class="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
    <div class="rounded-2xl border border-border bg-bg-primary/70 p-4" data-testid="telemetry-alt-value">
      <dt class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Altitude</dt>
      <dd class="mt-3 text-lg font-semibold text-text-primary">{altitudeText}</dd>
    </div>

    <div class="rounded-2xl border border-border bg-bg-primary/70 p-4" data-testid="telemetry-speed-value">
      <dt class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Speed</dt>
      <dd class="mt-3 text-lg font-semibold text-text-primary">{speedText}</dd>
    </div>

    <div class="rounded-2xl border border-border bg-bg-primary/70 p-4" data-testid="telemetry-battery-value">
      <dt class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Battery</dt>
      <dd class={`mt-3 text-lg font-semibold ${batteryTone}`}>{batteryText}</dd>
    </div>

    <div class="rounded-2xl border border-border bg-bg-primary/70 p-4" data-testid="telemetry-heading-value">
      <dt class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Heading</dt>
      <dd class="mt-3 text-lg font-semibold text-text-primary">{headingText}</dd>
    </div>

    <div class="rounded-2xl border border-border bg-bg-primary/70 p-4 sm:col-span-2 xl:col-span-1" data-testid="telemetry-gps-text">
      <dt class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">GPS</dt>
      <dd class={`mt-3 text-base font-semibold ${gpsTone}`}>{gpsText}</dd>
    </div>
  </dl>
</section>
