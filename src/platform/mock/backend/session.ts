import { liveGuidedDomain } from "./guided";
import {
    getResolvedReplayCursorUsec,
    playbackStateEvent,
    playbackTelemetryDomain,
    updateReplayStateForPause,
    updateReplayStateForPlay,
    updateReplayStateForSeek,
    updateReplayStateForSpeed,
} from "./logs";
import { mockState, nextEnvelope, resetGuided, sweepExpiredPending } from "./runtime";
import type { CommandArgs, MockLiveStatusTextState, SessionConnection, SessionEnvelope, MockPlatformEvent } from "./types";

function missingDomainValue() {
    return {
        available: false,
        complete: false,
        provenance: "bootstrap",
        value: null,
    };
}

function liveBootstrapTelemetryDomain() {
    return {
        available: true,
        complete: false,
        provenance: "bootstrap",
        value: {
            flight: { altitude_m: null, speed_mps: null, climb_rate_mps: null, throttle_pct: null, airspeed_mps: null },
            navigation: { latitude_deg: null, longitude_deg: null, heading_deg: null, wp_dist_m: null, nav_bearing_deg: null, target_bearing_deg: null, xtrack_error_m: null },
            attitude: { roll_deg: null, pitch_deg: null, yaw_deg: null },
            power: { battery_pct: null, battery_voltage_v: null, battery_current_a: null, battery_voltage_cells: null, energy_consumed_wh: null, battery_time_remaining_s: null },
            gps: { fix_type: null, satellites: null, hdop: null },
            terrain: { terrain_height_m: null, height_above_terrain_m: null },
            radio: { rc_channels: null, rc_rssi: null, servo_outputs: null },
        },
    };
}

function liveBootstrapNullDomain() {
    return { available: true, complete: false, provenance: "bootstrap", value: null };
}

function liveBootstrapStatusTextDomain() {
    return {
        available: true,
        complete: false,
        provenance: "bootstrap",
        value: { entries: [] },
    };
}

function liveStatusTextDomain(entries: MockLiveStatusTextState) {
    return {
        available: true,
        complete: true,
        provenance: "bootstrap" as const,
        value: structuredClone(entries),
    };
}

function cloneSeededLiveDomain<T>(value: T | null | undefined) {
    return value ? structuredClone(value) : null;
}

export function openSessionSnapshotResult(sourceKind: "live" | "playback") {
    if (sourceKind === "playback" && !mockState.logOpen) {
        throw new Error("no log open");
    }

    if (sourceKind === "playback") {
        resetGuided("source_switch", "playback source switched");
    }

    const envelope = nextEnvelope(sourceKind);
    if (sourceKind === "playback") {
        mockState.pendingPlaybackEnvelope = { envelope, opened_at_unix_msec: Date.now() };
    } else {
        mockState.pendingLiveEnvelope = { envelope, opened_at_unix_msec: Date.now() };
    }

    return {
        envelope,
        session: {
            available: true,
            complete: true,
            provenance: sourceKind === "playback" ? "playback" : "bootstrap",
            value: {
                status: sourceKind === "playback" ? "active" : mockState.liveVehicleAvailable ? "active" : "pending",
                connection: (sourceKind === "playback"
                    ? { kind: "disconnected" }
                    : mockState.liveVehicleAvailable
                        ? { kind: "connected" }
                        : { kind: "disconnected" }) satisfies SessionConnection,
                vehicle_state: sourceKind === "playback" || !mockState.liveVehicleAvailable
                    ? null
                    : mockState.liveVehicleState,
                home_position: sourceKind === "playback" || !mockState.liveVehicleAvailable
                    ? null
                    : structuredClone(mockState.liveMissionHome),
            },
        },
        telemetry: sourceKind === "playback"
            ? playbackTelemetryDomain()
            : mockState.liveVehicleAvailable
                ? cloneSeededLiveDomain(mockState.liveTelemetryDomain) ?? liveBootstrapTelemetryDomain()
                : missingDomainValue(),
        mission_state: sourceKind === "playback"
            ? null
            : mockState.liveVehicleAvailable ? structuredClone(mockState.liveMissionState) : null,
        param_store: sourceKind === "playback"
            ? null
            : mockState.liveVehicleAvailable ? structuredClone(mockState.liveParamStore) : null,
        param_progress: sourceKind === "playback"
            ? null
            : mockState.liveVehicleAvailable ? structuredClone(mockState.liveParamProgress) : null,
        support: sourceKind === "playback"
            ? { available: false, complete: false, provenance: "playback", value: null }
            : mockState.liveVehicleAvailable
                ? cloneSeededLiveDomain(mockState.liveSupportDomain) ?? liveBootstrapNullDomain()
                : missingDomainValue(),
        sensor_health: sourceKind === "playback"
            ? { available: false, complete: false, provenance: "playback", value: null }
            : mockState.liveVehicleAvailable
                ? cloneSeededLiveDomain(mockState.liveSensorHealthDomain) ?? liveBootstrapNullDomain()
                : missingDomainValue(),
        configuration_facts: sourceKind === "playback"
            ? { available: false, complete: false, provenance: "playback", value: null }
            : mockState.liveVehicleAvailable
                ? cloneSeededLiveDomain(mockState.liveConfigurationFactsDomain) ?? liveBootstrapNullDomain()
                : missingDomainValue(),
        calibration: sourceKind === "playback"
            ? { available: false, complete: false, provenance: "playback", value: null }
            : mockState.liveVehicleAvailable ? liveBootstrapNullDomain() : missingDomainValue(),
        guided: sourceKind === "playback"
            ? { available: false, complete: false, provenance: "playback", value: null }
            : liveGuidedDomain(),
        status_text: sourceKind === "playback"
            ? {
                available: true,
                complete: true,
                provenance: "playback",
                value: { entries: [] },
            }
            : mockState.liveVehicleAvailable
                ? (mockState.liveStatusText ? liveStatusTextDomain(mockState.liveStatusText) : liveBootstrapStatusTextDomain())
                : missingDomainValue(),
        playback: { cursor_usec: sourceKind === "playback" ? mockState.playbackCursorUsec : null },
    };
}

export function playbackStreamEvents(envelope: SessionEnvelope): MockPlatformEvent[] {
    return [
        {
            event: "session://state",
            payload: {
                envelope,
                value: {
                    available: true,
                    complete: true,
                    provenance: "playback",
                    value: {
                        status: "active",
                        connection: { kind: "disconnected" },
                        vehicle_state: null,
                        home_position: null,
                    },
                },
            },
        },
        {
            event: "telemetry://state",
            payload: {
                envelope,
                value: playbackTelemetryDomain(),
            },
        },
        {
            event: "support://state",
            payload: {
                envelope,
                value: { available: false, complete: false, provenance: "playback", value: null },
            },
        },
        {
            event: "status_text://state",
            payload: {
                envelope,
                value: { available: true, complete: true, provenance: "playback", value: { entries: [] } },
            },
        },
        {
            ...playbackStateEvent(envelope),
        },
    ];
}

function requireActivePlaybackEnvelope(): SessionEnvelope {
    if (!mockState.logOpen) {
        throw new Error("no log open");
    }
    if (!mockState.playbackEnvelope) {
        throw new Error("playback session is not active");
    }

    return mockState.playbackEnvelope;
}

function missingPendingAckResult() {
    return {
        result: "rejected",
        failure: {
            operation_id: "ack_session_snapshot",
            reason: { kind: "timeout", message: "pending session expired or missing" },
        },
    };
}

export function ackSessionSnapshotResult(args: CommandArgs) {
    sweepExpiredPending();
    if (!mockState.pendingLiveEnvelope && !mockState.pendingPlaybackEnvelope) {
        return missingPendingAckResult();
    }

    const pending = [mockState.pendingLiveEnvelope, mockState.pendingPlaybackEnvelope].find((entry) => entry
        && args?.sessionId === entry.envelope.session_id
        && args?.seekEpoch === entry.envelope.seek_epoch
        && args?.resetRevision === entry.envelope.reset_revision) ?? null;

    if (!pending) {
        if (!mockState.pendingLiveEnvelope && !mockState.pendingPlaybackEnvelope) {
            return missingPendingAckResult();
        }

        return {
            result: "rejected",
            failure: {
                operation_id: "ack_session_snapshot",
                reason: { kind: "conflict", message: "session snapshot mismatch" },
            },
        };
    }

    if (pending.envelope.source_kind === "playback") {
        mockState.playbackEnvelope = pending.envelope;
        mockState.pendingPlaybackEnvelope = null;
    } else {
        mockState.liveEnvelope = pending.envelope;
        mockState.pendingLiveEnvelope = null;
    }

    return { result: "accepted", envelope: pending.envelope };
}

export function playbackSeekResult(args: CommandArgs): {
    envelope: SessionEnvelope;
    cursor_usec: number | null;
    events: MockPlatformEvent[];
} {
    const activeEnvelope = requireActivePlaybackEnvelope();

    resetGuided("source_switch", "playback source switched");
    const nextEnvelope: SessionEnvelope = {
        ...activeEnvelope,
        seek_epoch: activeEnvelope.seek_epoch + 1,
        reset_revision: activeEnvelope.reset_revision,
    };
    mockState.playbackEnvelope = nextEnvelope;
    mockState.playbackCursorUsec = (args?.cursorUsec as number | undefined) ?? null;
    updateReplayStateForSeek(mockState.playbackCursorUsec);
    mockState.playbackCursorUsec = getResolvedReplayCursorUsec();

    return {
        envelope: nextEnvelope,
        cursor_usec: mockState.playbackCursorUsec,
        events: playbackStreamEvents(nextEnvelope),
    };
}

export function playbackPlayResult() {
    const envelope = requireActivePlaybackEnvelope();
    updateReplayStateForPlay();
    return {
        state: playbackStateEvent(envelope).payload.value,
        events: playbackStreamEvents(envelope),
    };
}

export function playbackPauseResult() {
    const envelope = requireActivePlaybackEnvelope();
    updateReplayStateForPause();
    return {
        state: playbackStateEvent(envelope).payload.value,
        events: playbackStreamEvents(envelope),
    };
}

export function playbackSetSpeedResult(args: CommandArgs) {
    const envelope = requireActivePlaybackEnvelope();
    const speed = args?.speed;
    if (typeof speed !== "number" || !Number.isFinite(speed)) {
        throw new Error("missing or invalid playback_set_speed.speed");
    }

    updateReplayStateForSpeed(speed);
    return {
        state: playbackStateEvent(envelope).payload.value,
        events: playbackStreamEvents(envelope),
    };
}
