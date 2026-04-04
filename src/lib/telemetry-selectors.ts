import type { Telemetry, TelemetryState } from "../telemetry";
import {
    missingDomainValue,
    type DomainProvenance,
    type DomainValue,
} from "./domain-status";

const EMPTY = missingDomainValue<TelemetryState>("bootstrap");

export type TelemetrySummaryTone = "neutral" | "positive" | "caution" | "critical";
export type OperatorMetricState = "live" | "degraded" | "stale" | "unavailable";

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

export type OperatorMetricView = {
    text: string;
    tone: TelemetrySummaryTone;
    state: OperatorMetricState;
    value: unknown;
};

export type OperatorTelemetryView = {
    quality: {
        available: boolean;
        complete: boolean;
        provenance: DomainProvenance;
        degraded: boolean;
        stale: boolean;
    };
    primary: {
        altitude: OperatorMetricView;
        speed: OperatorMetricView;
        battery: OperatorMetricView;
        gps: OperatorMetricView;
    };
    secondary: {
        heading: OperatorMetricView;
        climbRate: OperatorMetricView;
        batteryVoltage: OperatorMetricView;
        satellites: OperatorMetricView;
    };
    attentionTone: TelemetrySummaryTone;
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

function toneRank(tone: TelemetrySummaryTone): number {
    switch (tone) {
        case "critical":
            return 3;
        case "caution":
            return 2;
        case "positive":
            return 1;
        case "neutral":
        default:
            return 0;
    }
}

function highestTone(...tones: TelemetrySummaryTone[]): TelemetrySummaryTone {
    return tones.reduce<TelemetrySummaryTone>(
        (highest, next) => toneRank(next) > toneRank(highest) ? next : highest,
        "neutral",
    );
}

function asFiniteNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asTrimmedText(value: unknown): string | null {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function resolveMetricState(hasValue: boolean, stale: boolean, degraded: boolean): OperatorMetricState {
    if (hasValue) {
        if (stale) {
            return "stale";
        }

        if (degraded) {
            return "degraded";
        }

        return "live";
    }

    if (stale) {
        return "stale";
    }

    if (degraded) {
        return "degraded";
    }

    return "unavailable";
}

function createNumberMetric(input: {
    currentValue: number | null;
    previous?: OperatorMetricView | null;
    stale: boolean;
    degraded: boolean;
    placeholder: string;
    format: (value: number) => string;
    tone: (value: number | undefined) => TelemetrySummaryTone;
}): OperatorMetricView {
    const previousValue = input.previous?.value;
    const fallbackValue = typeof previousValue === "number" && Number.isFinite(previousValue) ? previousValue : null;
    const resolvedValue = input.currentValue ?? fallbackValue;
    const hasValue = resolvedValue != null;

    return {
        text: hasValue ? input.format(resolvedValue) : input.placeholder,
        tone: input.tone(resolvedValue ?? undefined),
        state: resolveMetricState(hasValue, input.stale, input.degraded),
        value: resolvedValue,
    };
}

function createGpsMetric(input: {
    fixType: string | null;
    satellites: number | null;
    previous?: OperatorMetricView | null;
    stale: boolean;
    degraded: boolean;
}): OperatorMetricView {
    const previousValue =
        input.previous?.value && typeof input.previous.value === "object"
            ? input.previous.value as { fixType?: string | null; satellites?: number | null }
            : null;
    const fixType = input.fixType ?? asTrimmedText(previousValue?.fixType);
    const satellites = input.satellites ?? asFiniteNumber(previousValue?.satellites);
    const hasValue = fixType != null || satellites != null;
    const fixText = formatGpsFix(fixType ?? undefined);

    return {
        text: hasValue ? `${fixText} · ${satellites ?? "--"} sats` : "--",
        tone: gpsTone(true, fixType ?? undefined),
        state: resolveMetricState(hasValue, input.stale, input.degraded),
        value: { fixType, satellites },
    };
}

function hasTelemetrySignal(telemetry: Telemetry): boolean {
    return Object.values(telemetry).some((value) => {
        if (Array.isArray(value)) {
            return value.length > 0;
        }

        if (typeof value === "number") {
            return Number.isFinite(value);
        }

        return typeof value === "string" && value.trim().length > 0;
    });
}

function hasTelemetryGap(telemetry: Telemetry): boolean {
    return asFiniteNumber(telemetry.altitude_m) == null
        || asFiniteNumber(telemetry.speed_mps) == null
        || asFiniteNumber(telemetry.battery_pct) == null
        || (
            asTrimmedText(telemetry.gps_fix_type) == null
            && asFiniteNumber(telemetry.gps_satellites) == null
        );
}

function hasOperatorTelemetrySignal(view: OperatorTelemetryView | null | undefined): boolean {
    return Object.values(view?.primary ?? {}).some((metric) => metric.value != null)
        || Object.values(view?.secondary ?? {}).some((metric) => metric.value != null);
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

export function selectOperatorTelemetryView(input: {
    connected: boolean;
    telemetryDomain: DomainValue<TelemetryState> | null | undefined;
    previous?: OperatorTelemetryView | null;
}): OperatorTelemetryView {
    const domain = input.telemetryDomain ?? EMPTY;
    const telemetry = selectTelemetryView(domain);
    const degraded = input.connected
        && (
            !domain.available
            || !domain.complete
            || domain.value == null
            || hasTelemetryGap(telemetry)
        );
    const stale = !input.connected && (hasTelemetrySignal(telemetry) || hasOperatorTelemetrySignal(input.previous));

    const primary = {
        altitude: createNumberMetric({
            currentValue: asFiniteNumber(telemetry.altitude_m),
            previous: input.previous?.primary.altitude,
            stale,
            degraded,
            placeholder: "-- m",
            format: (value) => `${value.toFixed(1)} m`,
            tone: () => "neutral",
        }),
        speed: createNumberMetric({
            currentValue: asFiniteNumber(telemetry.speed_mps),
            previous: input.previous?.primary.speed,
            stale,
            degraded,
            placeholder: "-- m/s",
            format: (value) => `${value.toFixed(1)} m/s`,
            tone: () => "neutral",
        }),
        battery: createNumberMetric({
            currentValue: asFiniteNumber(telemetry.battery_pct),
            previous: input.previous?.primary.battery,
            stale,
            degraded,
            placeholder: "--%",
            format: (value) => `${value.toFixed(1)}%`,
            tone: (value) => batteryTone(true, value),
        }),
        gps: createGpsMetric({
            fixType: asTrimmedText(telemetry.gps_fix_type),
            satellites: asFiniteNumber(telemetry.gps_satellites),
            previous: input.previous?.primary.gps,
            stale,
            degraded,
        }),
    };

    const secondary = {
        heading: createNumberMetric({
            currentValue: asFiniteNumber(telemetry.heading_deg),
            previous: input.previous?.secondary.heading,
            stale,
            degraded,
            placeholder: "--°",
            format: (value) => `${Math.round(value)}°`,
            tone: () => "neutral",
        }),
        climbRate: createNumberMetric({
            currentValue: asFiniteNumber(telemetry.climb_rate_mps),
            previous: input.previous?.secondary.climbRate,
            stale,
            degraded,
            placeholder: "-- m/s",
            format: (value) => `${value.toFixed(1)} m/s`,
            tone: () => "neutral",
        }),
        batteryVoltage: createNumberMetric({
            currentValue: asFiniteNumber(telemetry.battery_voltage_v),
            previous: input.previous?.secondary.batteryVoltage,
            stale,
            degraded,
            placeholder: "-- V",
            format: (value) => `${value.toFixed(1)} V`,
            tone: () => "neutral",
        }),
        satellites: createNumberMetric({
            currentValue: asFiniteNumber(telemetry.gps_satellites),
            previous: input.previous?.secondary.satellites,
            stale,
            degraded,
            placeholder: "-- sats",
            format: (value) => `${Math.round(value)} sats`,
            tone: (value) => {
                if (value == null) {
                    return "neutral";
                }

                if (value >= 12) {
                    return "positive";
                }

                if (value >= 6) {
                    return "caution";
                }

                return "critical";
            },
        }),
    };

    return {
        quality: {
            available: domain.available,
            complete: domain.complete,
            provenance: domain.provenance,
            degraded,
            stale,
        },
        primary,
        secondary,
        attentionTone: highestTone(
            primary.battery.tone,
            primary.gps.tone,
            stale || degraded ? "caution" : "neutral",
        ),
    };
}
