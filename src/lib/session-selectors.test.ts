import { describe, expect, it } from "vitest";

import {
    buildConnectRequest,
    describeTransportAvailability,
    validateTransportDescriptor,
} from "../transport";
import {
    selectConnectionPanelPresentation,
    selectOperatorReadinessView,
    selectOperatorSessionSummaryView,
    selectVehiclePosition,
    selectVehicleStatusCardView,
} from "./session-selectors";

describe("session selectors and connect workflow", () => {
    it("selects vehicle position from grouped telemetry navigation data", () => {
        expect(
            selectVehiclePosition({
                available: true,
                complete: true,
                provenance: "stream",
                value: {
                    flight: {},
                    navigation: { latitude_deg: 47.3, longitude_deg: 8.55, heading_deg: 123 },
                    gps: {},
                },
            }),
        ).toEqual({ latitude_deg: 47.3, longitude_deg: 8.55, heading_deg: 123 });
    });

    it("exposes typed transport descriptors with availability and validation/discovery errors", () => {
        const descriptor = {
            kind: "serial",
            label: "USB Serial",
            available: false,
            discovery_error: "permission denied",
            validation: { port_required: true, baud_required: true },
            default_baud: 115200,
        } as const;

        expect(describeTransportAvailability(descriptor)).toContain("permission denied");
        expect(validateTransportDescriptor(descriptor, { port: "", baud: null })).toEqual([
            "port is required",
            "baud is required",
        ]);
        expect(
            buildConnectRequest(descriptor, { port: "/dev/ttyACM0", baud: 57600 }),
        ).toEqual({ transport: { kind: "serial", port: "/dev/ttyACM0", baud: 57600 } });
    });

    it("maps vehicle status card display fields and tones", () => {
        expect(
            selectVehicleStatusCardView({
                connected: true,
                activeSource: "playback",
                vehicleState: {
                    armed: true,
                    custom_mode: 5,
                    mode_name: "LOITER",
                    system_status: "STANDBY",
                    vehicle_type: "copter",
                    autopilot: "ardupilot",
                    system_id: 1,
                    component_id: 1,
                    heartbeat_received: true,
                },
            }),
        ).toEqual({
            sessionLabel: "live session",
            sessionTone: "positive",
            armStateText: "ARMED",
            armStateTone: "positive",
            modeText: "LOITER",
            systemText: "STANDBY",
            dataFeedText: "Replay",
        });
    });

    it("derives connection panel status and submit lock rules", () => {
        expect(
            selectConnectionPanelPresentation({
                hydrated: true,
                isConnecting: false,
                connected: false,
                selectedTransportAvailable: true,
                connectionMode: "bluetooth_ble",
                selectedBtDevice: "",
                visibleError: "address is required",
            }),
        ).toEqual({
            formLocked: false,
            connectDisabled: true,
            statusLabel: "Error",
            statusTone: "critical",
        });
    });

    it("labels playback and live operator summaries without inventing connected data", () => {
        expect(
            selectOperatorSessionSummaryView({
                connected: true,
                linkState: "connected",
                activeSource: "playback",
                vehicleState: {
                    armed: false,
                    custom_mode: 0,
                    mode_name: "AUTO",
                    system_status: "ACTIVE",
                    vehicle_type: "copter",
                    autopilot: "ardupilot",
                    system_id: 1,
                    component_id: 1,
                    heartbeat_received: true,
                },
            }),
        ).toEqual({
            sessionLabel: "replay session",
            sessionTone: "positive",
            linkText: "Connected",
            linkTone: "positive",
            armStateText: "DISARMED",
            armStateTone: "neutral",
            modeText: "AUTO",
            systemText: "ACTIVE",
            sourceText: "Replay",
        });

        expect(
            selectOperatorSessionSummaryView({
                connected: false,
                linkState: "disconnected",
                activeSource: "live",
                vehicleState: {
                    armed: true,
                    custom_mode: 5,
                    mode_name: "LOITER",
                    system_status: "ACTIVE",
                    vehicle_type: "copter",
                    autopilot: "ardupilot",
                    system_id: 1,
                    component_id: 1,
                    heartbeat_received: true,
                },
            }),
        ).toEqual({
            sessionLabel: "idle session",
            sessionTone: "neutral",
            linkText: "Disconnected",
            linkTone: "neutral",
            armStateText: "--",
            armStateTone: "neutral",
            modeText: "--",
            systemText: "--",
            sourceText: "--",
        });
    });

    it("prefers support-derived readiness when available and falls back cleanly for legacy payloads", () => {
        expect(
            selectOperatorReadinessView({
                connected: true,
                support: {
                    available: true,
                    complete: true,
                    provenance: "stream",
                    value: {
                        can_request_prearm_checks: false,
                        can_calibrate_accel: true,
                        can_calibrate_compass: true,
                        can_calibrate_radio: false,
                    },
                },
                telemetryAttentionTone: "neutral",
            }),
        ).toEqual({
            label: "Pre-arm checks unavailable",
            tone: "caution",
            source: "support",
            supportAvailable: true,
            supportComplete: true,
            canRequestPrearmChecks: false,
        });

        expect(
            selectOperatorReadinessView({
                connected: true,
                support: {
                    available: true,
                    complete: true,
                    provenance: "stream",
                    value: {
                        can_arm: true,
                        readiness: "ready",
                    } as any,
                },
                telemetryAttentionTone: "critical",
            }),
        ).toEqual({
            label: "Support data incomplete",
            tone: "critical",
            source: "telemetry",
            supportAvailable: true,
            supportComplete: true,
            canRequestPrearmChecks: null,
        });
    });
});
