// @vitest-environment jsdom

import { get, writable } from "svelte/store";
import { describe, expect, it } from "vitest";

import { missingDomainValue } from "../domain-status";
import type { SessionStoreState } from "./session-state";
import { createOperatorWorkspaceViewStore } from "./operator-workspace-view";
import type { OpenSessionSnapshot } from "../../session";
import type { SessionConnectionFormState } from "../platform/session";

const defaultConnectionForm: SessionConnectionFormState = {
    mode: "udp",
    udpBind: "0.0.0.0:14550",
    tcpAddress: "127.0.0.1:5760",
    serialPort: "",
    baud: 57600,
    selectedBtDevice: "",
    takeoffAlt: "10",
    followVehicle: true,
};

function createSnapshot(overrides: Partial<OpenSessionSnapshot> = {}): OpenSessionSnapshot {
    return {
        envelope: {
            session_id: "session-1",
            source_kind: "live",
            seek_epoch: 0,
            reset_revision: 0,
        },
        session: {
            available: true,
            complete: true,
            provenance: "stream",
            value: {
                status: "active",
                connection: { kind: "connected" },
                vehicle_state: {
                    armed: false,
                    custom_mode: 5,
                    mode_name: "LOITER",
                    system_status: "ACTIVE",
                    vehicle_type: "quadrotor",
                    autopilot: "ardupilot",
                    system_id: 1,
                    component_id: 1,
                    heartbeat_received: true,
                },
                home_position: null,
            },
        },
        telemetry: {
            available: true,
            complete: true,
            provenance: "stream",
            value: {
                flight: { altitude_m: 123, speed_mps: 12.3, climb_rate_mps: 1.8 },
                navigation: { heading_deg: 186 },
                power: { battery_pct: 18, battery_voltage_v: 22.7 },
                gps: { fix_type: "fix_2d", satellites: 8 },
            },
        },
        mission_state: null,
        param_store: null,
        param_progress: null,
        support: {
            available: true,
            complete: true,
            provenance: "stream",
            value: {
                can_request_prearm_checks: true,
                can_calibrate_accel: true,
                can_calibrate_compass: true,
                can_calibrate_radio: false,
            },
        },
        sensor_health: missingDomainValue("stream"),
        configuration_facts: missingDomainValue("stream"),
        calibration: missingDomainValue("stream"),
        guided: missingDomainValue("stream"),
        status_text: {
            available: true,
            complete: true,
            provenance: "stream",
            value: { entries: [] },
        },
        playback: { cursor_usec: null },
        ...overrides,
    };
}

function createState(snapshot: OpenSessionSnapshot = createSnapshot()): SessionStoreState {
    return {
        hydrated: true,
        lastPhase: "ready",
        lastError: null,
        activeEnvelope: snapshot.envelope,
        activeSource: snapshot.envelope.source_kind,
        sessionDomain: snapshot.session,
        telemetryDomain: snapshot.telemetry,
        support: snapshot.support,
        sensorHealth: snapshot.sensor_health,
        configurationFacts: snapshot.configuration_facts,
        calibration: snapshot.calibration,
        guided: snapshot.guided,
        statusText: snapshot.status_text,
        bootstrap: {
            missionState: snapshot.mission_state,
            paramStore: snapshot.param_store,
            paramProgress: snapshot.param_progress,
            playbackCursorUsec: snapshot.playback.cursor_usec,
        },
        connectionForm: { ...defaultConnectionForm },
        transportDescriptors: [],
        serialPorts: [],
        availableModes: [],
        btDevices: [],
        btScanning: false,
        optimisticConnection: null,
    };
}

describe("operator workspace view store", () => {
    it("derives connected operator state, bounded notices, and operator attention from live domains", () => {
        const state = writable(createState(createSnapshot({
            status_text: {
                available: true,
                complete: true,
                provenance: "stream",
                value: {
                    entries: [
                        { sequence: 1, text: "Boot complete", severity: "info", timestamp_usec: 100 },
                        { sequence: 2, text: "GPS weak", severity: "warning", timestamp_usec: 200 },
                        { sequence: 3, text: "SD card present", severity: "notice", timestamp_usec: 300 },
                        { sequence: 4, text: "Battery failsafe", severity: "critical", timestamp_usec: 400 },
                        { sequence: 5, text: "Motor fault", severity: "emergency", timestamp_usec: 500 },
                    ],
                },
            },
        })));
        const view = createOperatorWorkspaceViewStore(state);

        expect(get(view)).toMatchObject({
            connected: true,
            lifecycle: {
                sessionLabel: "live session",
                sourceText: "Vehicle",
                modeText: "LOITER",
            },
            readiness: {
                label: "Pre-arm checks available",
                source: "support",
            },
            primaryMetrics: {
                altitude: { text: "123.0 m", state: "live" },
                battery: { text: "18.0%", tone: "critical" },
                gps: { text: "2D fix · 8 sats", tone: "caution" },
            },
            secondaryMetrics: {
                heading: { text: "186°", state: "live" },
            },
            attentionTone: "critical",
            quality: {
                disconnected: false,
                degraded: false,
                stale: false,
            },
        });
        expect(get(view).notices.map((notice) => [notice.id, notice.text, notice.tone])).toEqual([
            ["seq:2", "GPS weak", "caution"],
            ["seq:4", "Battery failsafe", "critical"],
            ["seq:5", "Motor fault", "critical"],
        ]);
    });

    it("keeps partial bootstrap state explicit instead of clearing incomplete domains", () => {
        const state = writable(createState(createSnapshot({
            telemetry: {
                available: true,
                complete: false,
                provenance: "bootstrap",
                value: {
                    flight: { altitude_m: 55 },
                    gps: {},
                },
            },
            support: missingDomainValue("bootstrap"),
            status_text: missingDomainValue("bootstrap"),
        })));
        const view = createOperatorWorkspaceViewStore(state);

        expect(get(view)).toMatchObject({
            connected: true,
            quality: {
                degraded: true,
                stale: false,
                telemetry: {
                    degraded: true,
                    provenance: "bootstrap",
                },
                support: {
                    degraded: true,
                },
                notices: {
                    degraded: true,
                },
            },
            primaryMetrics: {
                altitude: { text: "55.0 m", state: "degraded" },
                speed: { text: "-- m/s", state: "degraded" },
            },
            readiness: {
                label: "Support unavailable",
                source: "telemetry",
            },
            attentionTone: "caution",
        });
    });

    it("keeps the last accepted scoped snapshot visible when the session disconnects", () => {
        const state = writable(createState());
        const view = createOperatorWorkspaceViewStore(state);

        expect(get(view).connected).toBe(true);

        state.set(createState(createSnapshot({
            session: {
                available: true,
                complete: true,
                provenance: "stream",
                value: {
                    status: "active",
                    connection: { kind: "disconnected" },
                    vehicle_state: {
                        armed: false,
                        custom_mode: 5,
                        mode_name: "LOITER",
                        system_status: "ACTIVE",
                        vehicle_type: "quadrotor",
                        autopilot: "ardupilot",
                        system_id: 1,
                        component_id: 1,
                        heartbeat_received: true,
                    },
                    home_position: null,
                },
            },
            telemetry: missingDomainValue("stream"),
            support: missingDomainValue("stream"),
        })));

        expect(get(view)).toMatchObject({
            connected: false,
            lifecycle: {
                linkText: "Disconnected",
                armStateText: "--",
                modeText: "--",
            },
            primaryMetrics: {
                altitude: { text: "123.0 m", state: "stale" },
                battery: { text: "18.0%", state: "stale" },
            },
            quality: {
                disconnected: true,
                degraded: true,
                stale: true,
            },
        });
    });

    it("ignores malformed notice/status updates and preserves the last valid compact strip", () => {
        const state = writable(createState(createSnapshot({
            status_text: {
                available: true,
                complete: true,
                provenance: "stream",
                value: {
                    entries: [
                        { sequence: 10, text: "Initial warning", severity: "warning", timestamp_usec: 1000 },
                    ],
                },
            },
        })));
        const view = createOperatorWorkspaceViewStore(state);

        expect(get(view).notices.map((notice) => notice.text)).toEqual(["Initial warning"]);

        state.set(createState(createSnapshot({
            status_text: {
                available: true,
                complete: true,
                provenance: "stream",
                value: {
                    entries: [
                        { sequence: Number.NaN as unknown as number, text: "", severity: null as unknown as string },
                        { sequence: Number.NaN as unknown as number, text: "   ", severity: "warning" },
                    ],
                },
            },
            support: {
                available: true,
                complete: true,
                provenance: "stream",
                value: {
                    can_arm: true,
                    readiness: "ready",
                } as any,
            },
        })));

        expect(get(view).notices.map((notice) => notice.text)).toEqual(["Initial warning"]);
        expect(get(view).readiness).toMatchObject({
            label: "Support data incomplete",
            source: "telemetry",
            canRequestPrearmChecks: null,
        });
    });
});
