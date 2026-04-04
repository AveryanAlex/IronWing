import type { Telemetry, TelemetryState } from "../telemetry";
import { missingDomainValue, type DomainValue } from "./domain-status";

const EMPTY = missingDomainValue<TelemetryState>("bootstrap");

export type TelemetrySummaryTone = "neutral" | "positive" | "caution" | "critical";

export type TelemetrySummaryView = {
  altitudeText: string;
  speedText: string;
  batteryText: string;
  batteryTone: TelemetrySummaryTone;
  headingText: string;
  gpsText: string;
  gpsTone: TelemetrySummaryTone;
  sessionLabel: string;
};

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

function formatGpsFix(value: string | undefined): string {
  if (!value) {
    return "--";
  }

  const fix = value.trim().toLowerCase();
  if (!fix.length) {
    return "--";
  }

  if (fix.includes("rtk") && fix.includes("fixed")) {
    return "RTK fixed";
  }

  if (fix.includes("rtk") && fix.includes("float")) {
    return "RTK float";
  }

  if (fix.includes("3d")) {
    return "3D fix";
  }

  if (fix.includes("2d")) {
    return "2D fix";
  }

  if (fix.includes("dgps") || fix.includes("differential")) {
    return "DGPS";
  }

  if (fix.includes("no") || fix.includes("none") || fix.includes("unknown")) {
    return "No fix";
  }

  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (segment) => segment.toUpperCase());
}

function batteryTone(connected: boolean, value: number | undefined): TelemetrySummaryTone {
  if (!connected || value == null || Number.isNaN(value)) {
    return "neutral";
  }

  if (value > 50) {
    return "positive";
  }

  if (value >= 20) {
    return "caution";
  }

  return "critical";
}

function gpsTone(connected: boolean, value: string | undefined): TelemetrySummaryTone {
  const fix = value?.toLowerCase() ?? "";
  if (!connected || fix.length === 0 || fix === "--") {
    return "neutral";
  }

  if (fix.includes("3d") || fix.includes("rtk")) {
    return "positive";
  }

  if (fix.includes("2d")) {
    return "caution";
  }

  return "critical";
}

export function selectTelemetryView(domain: DomainValue<TelemetryState> | null | undefined): Telemetry {
  const state = domain?.value ?? EMPTY.value ?? {};

  return {
    altitude_m: state.flight?.altitude_m,
    speed_mps: state.flight?.speed_mps,
    climb_rate_mps: state.flight?.climb_rate_mps,
    throttle_pct: state.flight?.throttle_pct,
    airspeed_mps: state.flight?.airspeed_mps,
    heading_deg: state.navigation?.heading_deg,
    latitude_deg: state.navigation?.latitude_deg,
    longitude_deg: state.navigation?.longitude_deg,
    wp_dist_m: state.navigation?.wp_dist_m,
    nav_bearing_deg: state.navigation?.nav_bearing_deg,
    target_bearing_deg: state.navigation?.target_bearing_deg,
    xtrack_error_m: state.navigation?.xtrack_error_m,
    roll_deg: state.attitude?.roll_deg,
    pitch_deg: state.attitude?.pitch_deg,
    yaw_deg: state.attitude?.yaw_deg,
    battery_pct: state.power?.battery_pct,
    battery_voltage_v: state.power?.battery_voltage_v,
    battery_current_a: state.power?.battery_current_a,
    battery_voltage_cells: state.power?.battery_voltage_cells,
    battery_time_remaining_s: state.power?.battery_time_remaining_s,
    energy_consumed_wh: state.power?.energy_consumed_wh,
    gps_fix_type: state.gps?.fix_type,
    gps_satellites: state.gps?.satellites,
    gps_hdop: state.gps?.hdop,
    terrain_height_m: state.terrain?.terrain_height_m,
    height_above_terrain_m: state.terrain?.height_above_terrain_m,
    rc_channels: state.radio?.rc_channels,
    rc_rssi: state.radio?.rc_rssi,
    servo_outputs: state.radio?.servo_outputs,
  };
}

export function selectTelemetrySummaryView(connected: boolean, telemetry: Telemetry): TelemetrySummaryView {
  return {
    altitudeText: formatMetric(connected, telemetry.altitude_m, " m"),
    speedText: formatMetric(connected, telemetry.speed_mps, " m/s"),
    batteryText: formatMetric(connected, telemetry.battery_pct, "%"),
    batteryTone: batteryTone(connected, telemetry.battery_pct),
    headingText: formatWholeMetric(connected, telemetry.heading_deg, "°"),
    gpsText: !connected
      ? "GPS: --"
      : `GPS: ${formatGpsFix(telemetry.gps_fix_type)} · ${telemetry.gps_satellites ?? "--"} sats`,
    gpsTone: gpsTone(connected, telemetry.gps_fix_type),
    sessionLabel: connected ? "streaming" : "waiting for link",
  };
}
