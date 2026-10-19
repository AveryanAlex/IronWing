import { gpsFixProfile } from "./gps-fix";
import type { GpsFixType } from "./generated/mavkit";
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

function formatGpsFix(value: GpsFixType | undefined): string {
    return gpsFixProfile(value)?.label ?? "--";
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

function gpsTone(connected: boolean, value: GpsFixType | undefined): TelemetrySummaryTone {
    return connected ? gpsFixProfile(value)?.tone ?? "neutral" : "neutral";
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
    fixType: GpsFixType | null;
    satellites: number | null;
    previous?: OperatorMetricView | null;
    stale: boolean;
    degraded: boolean;
}): OperatorMetricView {
    const previousValue =
        input.previous?.value && typeof input.previous.value === "object"
            ? input.previous.value as { fixType?: GpsFixType | null; satellites?: number | null }
            : null;
    const fixType = input.fixType ?? previousValue?.fixType ?? null;
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
    const state = domain?.value;

    return {
        altitude_m: state?.flight?.altitude_m ?? undefined,
        speed_mps: state?.flight?.speed_mps ?? undefined,
        climb_rate_mps: state?.flight?.climb_rate_mps ?? undefined,
        throttle_pct: state?.flight?.throttle_pct ?? undefined,
        airspeed_mps: state?.flight?.airspeed_mps ?? undefined,
        heading_deg: state?.navigation?.heading_deg ?? undefined,
        latitude_deg: state?.navigation?.latitude_deg ?? undefined,
        longitude_deg: state?.navigation?.longitude_deg ?? undefined,
        wp_dist_m: state?.navigation?.wp_dist_m ?? undefined,
        nav_bearing_deg: state?.navigation?.nav_bearing_deg ?? undefined,
        target_bearing_deg: state?.navigation?.target_bearing_deg ?? undefined,
        xtrack_error_m: state?.navigation?.xtrack_error_m ?? undefined,
        roll_deg: state?.attitude?.roll_deg ?? undefined,
        pitch_deg: state?.attitude?.pitch_deg ?? undefined,
        yaw_deg: state?.attitude?.yaw_deg ?? undefined,
        battery_pct: state?.power?.battery_pct ?? undefined,
        battery_voltage_v: state?.power?.battery_voltage_v ?? undefined,
        battery_current_a: state?.power?.battery_current_a ?? undefined,
        battery_voltage_cells: state?.power?.battery_voltage_cells ?? undefined,
        battery_time_remaining_s: state?.power?.battery_time_remaining_s ?? undefined,
        energy_consumed_wh: state?.power?.energy_consumed_wh ?? undefined,
        gps_fix_type: state?.gps?.fix_type ?? undefined,
        gps_satellites: state?.gps?.satellites ?? undefined,
        gps_hdop: state?.gps?.hdop ?? undefined,
        terrain_height_m: state?.terrain?.terrain_height_m ?? undefined,
        height_above_terrain_m: state?.terrain?.height_above_terrain_m ?? undefined,
        rc_channels: state?.radio?.rc_channels ?? undefined,
        rc_rssi: state?.radio?.rc_rssi ?? undefined,
        servo_outputs: state?.radio?.servo_outputs ?? undefined,
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
            fixType: telemetry.gps_fix_type ?? null,
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
