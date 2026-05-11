// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChartSeriesPage, LogExportResult, LogLibraryCatalog, LogProgress, RawMessagePage } from "../../logs";
import type { MissionState, TransferProgress } from "../../mission";
import type { ParamProgress, ParamStore } from "../../params";
import type { PlaybackStateSnapshot } from "../../playback";
import type { RecordingSettingsResult, RecordingStatus } from "../../recording";
import type { OpenSessionSnapshot, SessionEvent } from "../../session";
import type {
    CatalogEntry,
    CatalogTargetSummary,
    DfuRecoveryResult,
    DfuScanResult,
    InventoryResult,
    PortInfo,
    SerialFlowResult,
    SerialPreflightInfo,
    SerialReadinessRequest,
} from "../../firmware";

import { getMockPlatformController, invokeMockCommand, listenMockEvent, type MockLogSeedPreset } from "./backend";
import { paramStoreForDemoPreset } from "./backend/param-fixtures";
import { mockProfileTiming, mockState } from "./backend/runtime";
import { horizontalDistanceM } from "./backend/vehicle-sim/geo";

function setMockProfile(profile: "test" | "demo") {
    import.meta.env.VITE_IRONWING_MOCK_PROFILE = profile;
}

function readRustCommandsSource() {
    return readFileSync("src-tauri/src/commands.rs", "utf8");
}

function readRustMessageRateCatalog() {
    const source = readRustCommandsSource();
    const functionMatch = source.match(
        /pub\(crate\) fn get_available_message_rates\(\) -> Vec<MessageRateInfo> \{\s*vec!\[(.*?)\n\s*]\n\}/s,
    );
    if (!functionMatch) {
        throw new Error("Could not locate get_available_message_rates in Rust commands.rs");
    }

    const entryPattern = /MessageRateInfo \{\s*id: (\d+),\s*name: "([^"]+)"\.into\(\),\s*default_rate_hz: ([0-9.]+),\s*}/g;
    const entries = [...functionMatch[1].matchAll(entryPattern)].map((match) => ({
        id: Number(match[1]),
        name: match[2] ?? "",
        default_rate_hz: Number(match[3]),
    }));

    if (entries.length === 0) {
        throw new Error("Could not parse any Rust message-rate entries");
    }

    return entries;
}

function readRustRateLimits() {
    const source = readRustCommandsSource();
    const messageRateMatch = source.match(/if !\(([0-9.]+)\.\.=([0-9.]+)\)\.contains\(&rate_hz\)/);
    const telemetryRateMatch = source.match(/if rate_hz == 0 \|\| rate_hz > (\d+)/);

    if (!messageRateMatch || !telemetryRateMatch) {
        throw new Error("Could not parse telemetry/message-rate limits from Rust commands.rs");
    }

    return {
        messageRate: {
            min: Number(messageRateMatch[1]),
            max: Number(messageRateMatch[2]),
        },
        telemetryRate: {
            min: 1,
            max: Number(telemetryRateMatch[1]),
        },
    };
}

afterEach(() => {
    vi.useRealTimers();
    setMockProfile("test");
});

describe("mock guided backend parity", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        setMockProfile("test");
        getMockPlatformController().reset();
    });

    it("returns playback-shaped open session snapshots", async () => {
        await invokeMockCommand("log_open", { path: "/tmp/mock.tlog" });
        const snapshot = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "playback" });

        expect(snapshot.session.provenance).toBe("playback");
        expect(snapshot.sensor_health).toEqual({ available: false, complete: false, provenance: "playback", value: null });
        expect(snapshot.configuration_facts).toEqual({ available: false, complete: false, provenance: "playback", value: null });
        expect(snapshot.calibration).toEqual({ available: false, complete: false, provenance: "playback", value: null });
        expect(snapshot.telemetry.value.flight.altitude_m).toBeNull();
        expect(snapshot.playback.cursor_usec).toBeNull();
    });

    it("uses pending live snapshot handshake semantics and rejects mismatched acks", async () => {
        const snapshot = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });

        expect(snapshot.envelope.source_kind).toBe("live");
        expect(snapshot.session.value.status).toBe("pending");

        const rejected = await invokeMockCommand<any>("ack_session_snapshot", {
            sessionId: `${snapshot.envelope.session_id}-stale`,
            seekEpoch: snapshot.envelope.seek_epoch,
            resetRevision: snapshot.envelope.reset_revision,
        });
        expect(rejected.result).toBe("rejected");
        expect(rejected.failure.reason.message).toBe("session snapshot mismatch");

        const accepted = await invokeMockCommand<any>("ack_session_snapshot", {
            sessionId: snapshot.envelope.session_id,
            seekEpoch: snapshot.envelope.seek_epoch,
            resetRevision: snapshot.envelope.reset_revision,
        });
        expect(accepted.result).toBe("accepted");
        expect(accepted.envelope).toEqual(snapshot.envelope);
    });

    it("expires stale matching pending snapshot acks after the ttl", async () => {
        const now = vi.spyOn(Date, "now");
        now.mockReturnValue(1_000);

        const snapshot = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });

        now.mockReturnValue(3_001);

        const expired = await invokeMockCommand<any>("ack_session_snapshot", {
            sessionId: snapshot.envelope.session_id,
            seekEpoch: snapshot.envelope.seek_epoch,
            resetRevision: snapshot.envelope.reset_revision,
        });

        expect(expired.result).toBe("rejected");
        expect(expired.failure.reason.kind).toBe("timeout");
        expect(expired.failure.reason.message).toBe("pending session expired or missing");
    });

    it("keeps separate pending live and playback snapshots and accepts both acks", async () => {
        const live = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });
        await invokeMockCommand("log_open", { path: "/tmp/mock.tlog" });
        const playback = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "playback" });

        expect(playback.envelope.reset_revision).toBe(live.envelope.reset_revision + 1);
        expect(playback.envelope.seek_epoch).toBe(live.envelope.seek_epoch + 1);

        const ackLive = await invokeMockCommand<any>("ack_session_snapshot", {
            sessionId: live.envelope.session_id,
            seekEpoch: live.envelope.seek_epoch,
            resetRevision: live.envelope.reset_revision,
        });
        const ackPlayback = await invokeMockCommand<any>("ack_session_snapshot", {
            sessionId: playback.envelope.session_id,
            seekEpoch: playback.envelope.seek_epoch,
            resetRevision: playback.envelope.reset_revision,
        });

        expect(ackLive.result).toBe("accepted");
        expect(ackLive.envelope).toEqual(live.envelope);
        expect(ackPlayback.result).toBe("accepted");
        expect(ackPlayback.envelope).toEqual(playback.envelope);
    });

    it("rejects guided commands while disconnected live with live-session-required semantics", async () => {
        const start = await invokeMockCommand<any>("start_guided_session", {
            request: { session: { kind: "goto", latitude_deg: 1, longitude_deg: 2, altitude_m: 3 } },
        });
        const update = await invokeMockCommand<any>("update_guided_session", {
            request: { session: { kind: "goto", latitude_deg: 1, longitude_deg: 2, altitude_m: 3 } },
        });
        const stop = await invokeMockCommand<any>("stop_guided_session");

        for (const result of [start, update, stop]) {
            expect(result.result).toBe("rejected");
            expect(result.failure.reason.kind).toBe("unavailable");
            expect(result.failure.reason.message).toBe("guided control requires a live vehicle session");
            expect(result.failure.detail).toEqual({ kind: "blocking_reason", blocking_reason: "live_session_required" });
        }
    });

    it("keeps vehicle_takeoff explicit and unavailable while disconnected live", async () => {
        await expect(invokeMockCommand("vehicle_takeoff", { altitudeM: 12 })).rejects.toThrow(
            "guided control requires a live vehicle session",
        );
    });

    it("allows idle live guided start when live vehicle context is available", async () => {
        await invokeMockCommand("connect_link", { request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" }, mockVehicleState: { armed: true, modeName: "GUIDED" } } });

        const live = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });

        expect(live.guided.value.status).toBe("idle");
        expect(live.guided.value.actions.start.allowed).toBe(true);
    });

    it("hydrates connected live snapshots when a vehicle exists", async () => {
        await invokeMockCommand("connect_link", {
            request: {
                transport: { kind: "udp", bind_addr: "0.0.0.0:14550" },
                mockVehicleState: {
                    armed: false,
                    custom_mode: 7,
                    mode_name: "Loiter",
                    system_status: "standby",
                    vehicle_type: "copter",
                    autopilot: "ardupilot",
                    system_id: 42,
                    component_id: 24,
                    heartbeat_received: true,
                },
            },
        });

        const live = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });

        expect(live.session.value.status).toBe("active");
        expect(live.session.value.connection).toEqual({ kind: "connected" });
        expect(live.session.value.vehicle_state).toEqual({
            armed: false,
            custom_mode: 7,
            mode_name: "Loiter",
            system_status: "standby",
            vehicle_type: "copter",
            autopilot: "ardupilot",
            system_id: 42,
            component_id: 24,
            heartbeat_received: true,
        });
        expect(live.guided.value.status).toBe("blocked");
        expect(live.guided.value.blocking_reason).toBe("vehicle_disarmed");
        expect(live.guided.value.actions.start.allowed).toBe(false);
        expect(live.guided.value.actions.start.blocking_reason).toBe("vehicle_disarmed");
        expect(live.guided.value.actions.stop.blocking_reason).toBe("live_session_required");
        expect(live.telemetry.available).toBe(true);
        expect(live.telemetry.provenance).toBe("bootstrap");
        expect(live.support).toEqual({ available: true, complete: false, provenance: "bootstrap", value: null });
        expect(live.sensor_health).toEqual({ available: true, complete: false, provenance: "bootstrap", value: null });
        expect(live.configuration_facts).toEqual({ available: true, complete: false, provenance: "bootstrap", value: null });
        expect(live.calibration).toEqual({ available: true, complete: false, provenance: "bootstrap", value: null });
    });

    it("keeps top-level guided idle state when armed but not in guided mode", async () => {
        await invokeMockCommand("connect_link", { request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" }, mockVehicleState: { armed: true, modeName: "Loiter" } } });

        const live = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });

        expect(live.guided.value.status).toBe("idle");
        expect(live.guided.value.blocking_reason).toBeNull();
        expect(live.guided.value.actions.start).toEqual({ allowed: false, blocking_reason: "vehicle_mode_incompatible" });
    });

    it("rejects guided commands with armed-vehicle conflict while live is disarmed", async () => {
        await invokeMockCommand("connect_link", { request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" }, mockVehicleState: { armed: false, modeName: "GUIDED" } } });

        const start = await invokeMockCommand<any>("start_guided_session", { request: { session: { kind: "goto", latitude_deg: 1, longitude_deg: 2, altitude_m: 3 } } });
        const update = await invokeMockCommand<any>("update_guided_session", { request: { session: { kind: "goto", latitude_deg: 1, longitude_deg: 2, altitude_m: 3 } } });
        const stop = await invokeMockCommand<any>("stop_guided_session");

        for (const result of [start, update]) {
            expect(result.failure.reason.message).toBe("guided control requires an armed vehicle");
            expect(result.failure.detail).toEqual({ kind: "blocking_reason", blocking_reason: "vehicle_disarmed" });
        }

        expect(stop.failure.reason.message).toBe("guided control requires an armed vehicle");
        expect(stop.failure.detail).toEqual({ kind: "blocking_reason", blocking_reason: "vehicle_disarmed" });
    });

    it("rejects vehicle_takeoff while live is disarmed", async () => {
        await invokeMockCommand("connect_link", { request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" }, mockVehicleState: { armed: false, modeName: "GUIDED" } } });

        await expect(invokeMockCommand("vehicle_takeoff", { altitudeM: 12 })).rejects.toThrow(
            "guided control requires an armed vehicle",
        );
    });

    it("rejects guided commands with guided-mode conflict while live is armed in wrong mode", async () => {
        await invokeMockCommand("connect_link", { request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" }, mockVehicleState: { armed: true, modeName: "Loiter" } } });

        const start = await invokeMockCommand<any>("start_guided_session", { request: { session: { kind: "goto", latitude_deg: 1, longitude_deg: 2, altitude_m: 3 } } });
        const update = await invokeMockCommand<any>("update_guided_session", { request: { session: { kind: "goto", latitude_deg: 1, longitude_deg: 2, altitude_m: 3 } } });
        const stop = await invokeMockCommand<any>("stop_guided_session");

        for (const result of [start, update, stop]) {
            expect(result.failure.reason.message).toBe("guided control requires GUIDED mode");
            expect(result.failure.detail).toEqual({ kind: "blocking_reason", blocking_reason: "vehicle_mode_incompatible" });
        }
    });

    it("rejects vehicle_takeoff while live is armed in the wrong mode", async () => {
        await invokeMockCommand("connect_link", { request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" }, mockVehicleState: { armed: true, modeName: "Loiter" } } });

        await expect(invokeMockCommand("vehicle_takeoff", { altitudeM: 12 })).rejects.toThrow(
            "guided control requires GUIDED mode",
        );
    });

    it("allows vehicle_takeoff when live is armed in guided mode", async () => {
        await invokeMockCommand("connect_link", { request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" }, mockVehicleState: { armed: true, modeName: "GUIDED" } } });

        await expect(invokeMockCommand("vehicle_takeoff", { altitudeM: 12 })).resolves.toBeUndefined();
    });

    it("prioritizes playback rejection for guided commands", async () => {
        await invokeMockCommand("log_open", { path: "/tmp/mock.tlog" });
        const playback = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "playback" });
        await invokeMockCommand("ack_session_snapshot", {
            sessionId: playback.envelope.session_id,
            seekEpoch: playback.envelope.seek_epoch,
            resetRevision: playback.envelope.reset_revision,
        });

        const result = await invokeMockCommand<any>("stop_guided_session");

        expect(result.result).toBe("rejected");
        expect(result.failure.reason.message).toBe("guided control is unavailable in playback");
        expect(result.failure.detail).toEqual({ kind: "source_kind", source_kind: "playback" });
    });

    it("rejects broader replay read-only commands with native-parity permission failures", async () => {
        await invokeMockCommand("log_open", { path: "/tmp/mock.tlog" });
        const playback = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "playback" });
        await invokeMockCommand("ack_session_snapshot", {
            sessionId: playback.envelope.session_id,
            seekEpoch: playback.envelope.seek_epoch,
            resetRevision: playback.envelope.reset_revision,
        });

        const cases = [
            { cmd: "arm_vehicle", args: { force: false }, operationId: "arm_vehicle" },
            { cmd: "disarm_vehicle", args: { force: false }, operationId: "disarm_vehicle" },
            { cmd: "set_message_rate", args: { messageId: 33, rateHz: 4 }, operationId: "set_message_rate" },
            { cmd: "vehicle_takeoff", args: { altitudeM: 12 }, operationId: "vehicle_takeoff" },
            {
                cmd: "mission_upload",
                args: {
                    plan: {
                        items: [
                            {
                                command: {
                                    Nav: {
                                        Waypoint: {
                                            position: {
                                                RelHome: {
                                                    latitude_deg: 47.52,
                                                    longitude_deg: 8.61,
                                                    relative_alt_m: 120,
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        ],
                    },
                },
                operationId: "mission_upload",
            },
            { cmd: "mission_download", args: undefined, operationId: "mission_download" },
            { cmd: "mission_clear", args: undefined, operationId: "mission_clear" },
            { cmd: "mission_set_current", args: { seq: 0 }, operationId: "mission_set_current" },
            {
                cmd: "fence_upload",
                args: { plan: { return_point: null, regions: [] } },
                operationId: "fence_upload",
            },
            { cmd: "fence_download", args: undefined, operationId: "fence_download" },
            { cmd: "fence_clear", args: undefined, operationId: "fence_clear" },
            {
                cmd: "rally_upload",
                args: { plan: { points: [] } },
                operationId: "rally_upload",
            },
            { cmd: "rally_download", args: undefined, operationId: "rally_download" },
            { cmd: "rally_clear", args: undefined, operationId: "rally_clear" },
            { cmd: "calibrate_accel", args: undefined, operationId: "calibrate_accel" },
            { cmd: "calibrate_gyro", args: undefined, operationId: "calibrate_gyro" },
            { cmd: "calibrate_compass_start", args: undefined, operationId: "calibrate_compass_start" },
            { cmd: "calibrate_compass_accept", args: undefined, operationId: "calibrate_compass_accept" },
            { cmd: "calibrate_compass_cancel", args: undefined, operationId: "calibrate_compass_cancel" },
            { cmd: "param_write_batch", args: { params: [["TEST", 1]] }, operationId: "param_write_batch" },
            { cmd: "reboot_vehicle", args: undefined, operationId: "reboot_vehicle" },
            { cmd: "request_prearm_checks", args: undefined, operationId: "request_prearm_checks" },
            { cmd: "set_servo", args: { instance: 1, pwmUs: 1500 }, operationId: "set_servo" },
            { cmd: "motor_test", args: { motorInstance: 1, throttlePct: 10, durationS: 1 }, operationId: "motor_test" },
            { cmd: "rc_override", args: { channels: [{ channel: 1, value: 1500 }] }, operationId: "rc_override" },
            {
                cmd: "firmware_flash_serial",
                args: {
                    request: {
                        port: "/dev/ttyACM0",
                        baud: 115200,
                        source: { kind: "catalog_url", url: "https://example.com/cubeorange-copter.apj" },
                        options: { full_chip_erase: false },
                    },
                },
                operationId: "firmware_flash_serial",
            },
            {
                cmd: "firmware_flash_dfu_recovery",
                args: {
                    request: {
                        device: {
                            vid: 0x0483,
                            pid: 0xdf11,
                            unique_id: "mock-dfu-1",
                            serial_number: "DFU0001",
                            manufacturer: "STMicroelectronics",
                            product: "STM32 BOOTLOADER",
                        },
                        source: { kind: "official_bootloader", board_target: "CubeOrange" },
                    },
                },
                operationId: "firmware_flash_dfu_recovery",
            },
        ] as const;

        for (const testCase of cases) {
            let message = "";
            try {
                await invokeMockCommand(testCase.cmd, testCase.args);
            } catch (error) {
                message = error instanceof Error ? error.message : String(error);
            }

            expect(() => JSON.parse(message), `${testCase.cmd} should reject with structured replay-readonly failure, got: ${message}`).not.toThrow();
            expect(JSON.parse(message)).toEqual({
                operation_id: testCase.operationId,
                reason: {
                    kind: "permission_denied",
                    message: "replay is read-only while playback is the effective source; switch back to the live source to send vehicle commands",
                },
            });
        }
    });

    it("emits grouped playback telemetry events from seek", async () => {
        await invokeMockCommand("log_open", { path: "/tmp/mock.tlog" });
        const playback = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "playback" });
        await invokeMockCommand("ack_session_snapshot", {
            sessionId: playback.envelope.session_id,
            seekEpoch: playback.envelope.seek_epoch,
            resetRevision: playback.envelope.reset_revision,
        });

        let telemetry: any = null;
        const unlisten = listenMockEvent("telemetry://state", (payload) => {
            telemetry = payload;
        });

        await invokeMockCommand("playback_seek", { cursorUsec: 123 });
        unlisten();

        const telemetryValue = telemetry?.value;
        expect(telemetryValue.available).toBe(true);
        expect(telemetryValue.provenance).toBe("playback");
        expect(typeof telemetryValue.value.flight.altitude_m).toBe("number");
        expect(typeof telemetryValue.value.attitude.roll_deg).toBe("number");
        expect(telemetryValue.value.power.battery_voltage_cells).toBeNull();
    });

    it("emits scoped mission state and progress events for the active live envelope", async () => {
        const controller = getMockPlatformController();
        const live = await invokeMockCommand<OpenSessionSnapshot>("open_session_snapshot", { sourceKind: "live" });
        await invokeMockCommand("ack_session_snapshot", {
            sessionId: live.envelope.session_id,
            seekEpoch: live.envelope.seek_epoch,
            resetRevision: live.envelope.reset_revision,
        });

        let missionStatePayload: SessionEvent<MissionState> | null = null;
        let missionProgressPayload: SessionEvent<TransferProgress> | null = null;
        const unlisteners = [
            listenMockEvent("mission://state", (payload) => {
                missionStatePayload = payload as SessionEvent<MissionState>;
            }),
            listenMockEvent("mission://progress", (payload) => {
                missionProgressPayload = payload as SessionEvent<TransferProgress>;
            }),
        ];

        controller.emitMissionState({ plan: null, current_index: 2, sync: "current", active_op: null });
        controller.emitMissionProgress({
            direction: "upload",
            mission_type: "mission",
            phase: "transfer_items",
            completed_items: 2,
            total_items: 5,
            retries_used: 1,
        });
        unlisteners.forEach((unlisten) => unlisten());

        expect(missionStatePayload).toEqual({
            envelope: live.envelope,
            value: { plan: null, current_index: 2, sync: "current", active_op: null },
        });
        expect(missionProgressPayload).toEqual({
            envelope: live.envelope,
            value: {
                direction: "upload",
                mission_type: "mission",
                phase: "transfer_items",
                completed_items: 2,
                total_items: 5,
                retries_used: 1,
            },
        });
    });

    it("emits scoped param store and progress events for the active live envelope", async () => {
        const controller = getMockPlatformController();
        const live = await invokeMockCommand<OpenSessionSnapshot>("open_session_snapshot", { sourceKind: "live" });
        await invokeMockCommand("ack_session_snapshot", {
            sessionId: live.envelope.session_id,
            seekEpoch: live.envelope.seek_epoch,
            resetRevision: live.envelope.reset_revision,
        });

        let paramStorePayload: SessionEvent<ParamStore> | null = null;
        let paramProgressPayload: SessionEvent<ParamProgress> | null = null;
        const unlisteners = [
            listenMockEvent("param://store", (payload) => {
                paramStorePayload = payload as SessionEvent<ParamStore>;
            }),
            listenMockEvent("param://progress", (payload) => {
                paramProgressPayload = payload as SessionEvent<ParamProgress>;
            }),
        ];

        controller.emitParamStore({
            expected_count: 2,
            params: {
                ARMING_CHECK: { name: "ARMING_CHECK", value: 1, param_type: "uint8", index: 0 },
                FS_THR_ENABLE: { name: "FS_THR_ENABLE", value: 2, param_type: "uint8", index: 1 },
            },
        });
        controller.emitParamProgress({ downloading: { received: 1, expected: 2 } });
        unlisteners.forEach((unlisten) => unlisten());

        expect(paramStorePayload).toEqual({
            envelope: live.envelope,
            value: {
                expected_count: 2,
                params: {
                    ARMING_CHECK: { name: "ARMING_CHECK", value: 1, param_type: "uint8", index: 0 },
                    FS_THR_ENABLE: { name: "FS_THR_ENABLE", value: 2, param_type: "uint8", index: 1 },
                },
            },
        });
        expect(paramProgressPayload).toEqual({
            envelope: live.envelope,
            value: { downloading: { received: 1, expected: 2 } },
        });
    });

    it("emits only the native playback event set on seek", async () => {
        await invokeMockCommand("log_open", { path: "/tmp/mock.tlog" });
        const playback = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "playback" });
        await invokeMockCommand("ack_session_snapshot", {
            sessionId: playback.envelope.session_id,
            seekEpoch: playback.envelope.seek_epoch,
            resetRevision: playback.envelope.reset_revision,
        });

        const seen: string[] = [];
        const unlisteners = [
            listenMockEvent("session://state", () => seen.push("session://state")),
            listenMockEvent("telemetry://state", () => seen.push("telemetry://state")),
            listenMockEvent("support://state", () => seen.push("support://state")),
            listenMockEvent("status_text://state", () => seen.push("status_text://state")),
            listenMockEvent("playback://state", () => seen.push("playback://state")),
            listenMockEvent("sensor_health://state", () => seen.push("sensor_health://state")),
            listenMockEvent("configuration_facts://state", () => seen.push("configuration_facts://state")),
            listenMockEvent("calibration://state", () => seen.push("calibration://state")),
        ];

        await invokeMockCommand("playback_seek", { cursorUsec: 123 });
        unlisteners.forEach((unlisten) => unlisten());

        expect(seen).toEqual([
            "session://state",
            "telemetry://state",
            "support://state",
            "status_text://state",
            "playback://state",
        ]);
    });

    it("rejects playback seek before playback session is active", async () => {
        await expect(invokeMockCommand("playback_seek", { cursorUsec: 123 })).rejects.toThrow("no log open");

        await invokeMockCommand("log_open", { path: "/tmp/mock.tlog" });
        await expect(invokeMockCommand("playback_seek", { cursorUsec: 123 })).rejects.toThrow("playback session is not active");
    });

    it("rejects playback open without a log open", async () => {
        await expect(invokeMockCommand("open_session_snapshot", { sourceKind: "playback" })).rejects.toThrow("no log open");
    });

    it("validates disconnect session_id like native", async () => {
        await expect(invokeMockCommand("disconnect_link", { request: { session_id: "session-wrong" } })).rejects.toThrow(
            "session_id mismatch: no active session for session-wrong",
        );
    });

    it("validates disconnect session_id against active live session only", async () => {
        await invokeMockCommand("connect_link", { request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" } } });

        await expect(invokeMockCommand("disconnect_link", { request: { session_id: "session-wrong" } })).rejects.toThrow(
            "session_id mismatch: no active session for session-wrong",
        );

        const live = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });
        await invokeMockCommand("ack_session_snapshot", {
            sessionId: live.envelope.session_id,
            seekEpoch: live.envelope.seek_epoch,
            resetRevision: live.envelope.reset_revision,
        });

        await expect(invokeMockCommand("disconnect_link", { request: { session_id: "session-wrong" } })).rejects.toThrow(
            `session_id mismatch: expected ${live.envelope.session_id}, got session-wrong`,
        );
    });

    it("preserves pending live snapshots across disconnect for later ack", async () => {
        const live = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });

        await invokeMockCommand("disconnect_link");

        const ack = await invokeMockCommand<any>("ack_session_snapshot", {
            sessionId: live.envelope.session_id,
            seekEpoch: live.envelope.seek_epoch,
            resetRevision: live.envelope.reset_revision,
        });

        expect(ack.result).toBe("accepted");
        expect(ack.envelope).toEqual(live.envelope);
    });

    it("does not treat pending playback as active for guided semantics", async () => {
        await invokeMockCommand("log_open", { path: "/tmp/mock.tlog" });
        await invokeMockCommand("open_session_snapshot", { sourceKind: "playback" });

        const result = await invokeMockCommand<any>("stop_guided_session");

        expect(result.result).toBe("rejected");
        expect(result.failure.reason.message).toBe("guided control requires a live vehicle session");
        expect(result.failure.detail).toEqual({ kind: "blocking_reason", blocking_reason: "live_session_required" });
    });

    it("disconnect preserves active playback state", async () => {
        await invokeMockCommand("log_open", { path: "/tmp/mock.tlog" });
        const playback = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "playback" });
        await invokeMockCommand("ack_session_snapshot", {
            sessionId: playback.envelope.session_id,
            seekEpoch: playback.envelope.seek_epoch,
            resetRevision: playback.envelope.reset_revision,
        });
        await invokeMockCommand("playback_seek", { cursorUsec: 456 });

        await invokeMockCommand("disconnect_link");

        await expect(invokeMockCommand("playback_seek", { cursorUsec: 789 })).resolves.toMatchObject({
            envelope: {
                session_id: playback.envelope.session_id,
                source_kind: "playback",
            },
            cursor_usec: 1000000,
        });
    });

    it("playback open terminates existing live guided state before returning to live", async () => {
        await invokeMockCommand("connect_link", { request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" }, mockVehicleState: { armed: true, modeName: "GUIDED" } } });
        await invokeMockCommand("start_guided_session", { request: { session: { kind: "goto", latitude_deg: 1, longitude_deg: 2, altitude_m: 3 } } });

        await invokeMockCommand("log_open", { path: "/tmp/mock.tlog" });
        const playback = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "playback" });

        expect(playback.guided).toEqual({ available: false, complete: false, provenance: "playback", value: null });

        await invokeMockCommand("log_close");
        const liveBeforeReconnect = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });
        expect(liveBeforeReconnect.guided.value.termination?.reason).toBe("source_switch");
        expect(liveBeforeReconnect.guided.value.session).toBeNull();

        await invokeMockCommand("connect_link", { request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" }, mockVehicleState: { armed: true, modeName: "GUIDED" } } });

        const liveAfterReconnect = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });
        expect(liveAfterReconnect.guided.value.session).toBeNull();
        expect(liveAfterReconnect.guided.value.actions.start.allowed).toBe(true);
    });

    it("playback seek terminates existing live guided state before returning to live", async () => {
        await invokeMockCommand("connect_link", { request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" }, mockVehicleState: { armed: true, modeName: "GUIDED" } } });
        await invokeMockCommand("start_guided_session", { request: { session: { kind: "goto", latitude_deg: 1, longitude_deg: 2, altitude_m: 3 } } });
        await invokeMockCommand("log_open", { path: "/tmp/mock.tlog" });
        const playback = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "playback" });
        await invokeMockCommand("ack_session_snapshot", {
            sessionId: playback.envelope.session_id,
            seekEpoch: playback.envelope.seek_epoch,
            resetRevision: playback.envelope.reset_revision,
        });

        await invokeMockCommand("playback_seek", { cursorUsec: 456 });
        await invokeMockCommand("log_close");

        const nextLive = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });
        expect(nextLive.guided.value.termination?.reason).toBe("source_switch");
        expect(nextLive.guided.value.session).toBeNull();
    });

    it("preserves guided termination after reconnect reset", async () => {
        await invokeMockCommand("connect_link", { request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" }, mockVehicleState: { armed: true, modeName: "GUIDED" } } });
        const live = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });
        await invokeMockCommand("ack_session_snapshot", {
            sessionId: live.envelope.session_id,
            seekEpoch: live.envelope.seek_epoch,
            resetRevision: live.envelope.reset_revision,
        });
        await invokeMockCommand("start_guided_session", { request: { session: { kind: "goto", latitude_deg: 1, longitude_deg: 2, altitude_m: 3 } } });

        await invokeMockCommand("connect_link", { request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" }, mockVehicleState: { armed: true, modeName: "GUIDED" } } });

        const nextLive = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });
        expect(nextLive.guided.value.termination?.reason).toBe("source_switch");
        expect(nextLive.guided.value.session).toBeNull();
        expect(nextLive.guided.value.last_command).toEqual({
            operation_id: "start_guided_session",
            session_kind: "goto",
            at_unix_msec: expect.any(Number),
        });
    });

    it("records source-switch termination even without an active guided session", async () => {
        await invokeMockCommand("connect_link", { request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" } } });

        const nextLive = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });
        expect(nextLive.guided.value.termination?.reason).toBe("source_switch");
        expect(nextLive.guided.value.session).toBeNull();
    });

    it("preserves guided termination after disconnect reset", async () => {
        await invokeMockCommand("connect_link", { request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" }, mockVehicleState: { armed: true, modeName: "GUIDED" } } });
        const live = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });
        await invokeMockCommand("ack_session_snapshot", {
            sessionId: live.envelope.session_id,
            seekEpoch: live.envelope.seek_epoch,
            resetRevision: live.envelope.reset_revision,
        });
        await invokeMockCommand("start_guided_session", { request: { session: { kind: "goto", latitude_deg: 1, longitude_deg: 2, altitude_m: 3 } } });

        await invokeMockCommand("disconnect_link", { request: { session_id: live.envelope.session_id } });

        const afterDisconnect = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });
        expect(afterDisconnect.guided.value.termination?.reason).toBe("disconnect");
        expect(afterDisconnect.guided.value.session).toBeNull();
        expect(afterDisconnect.guided.value.last_command).toEqual({
            operation_id: "start_guided_session",
            session_kind: "goto",
            at_unix_msec: expect.any(Number),
        });
    });

    it("records disconnect termination even without an active guided session", async () => {
        await invokeMockCommand("connect_link", { request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" } } });
        await invokeMockCommand("disconnect_link");

        const afterDisconnect = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });
        expect(afterDisconnect.guided.value.termination?.reason).toBe("disconnect");
        expect(afterDisconnect.guided.value.session).toBeNull();
    });

    it("reset clears stale guided termination state", async () => {
        await invokeMockCommand("connect_link", { request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" }, mockVehicleState: { armed: true, modeName: "GUIDED" } } });
        const live = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });
        await invokeMockCommand("ack_session_snapshot", {
            sessionId: live.envelope.session_id,
            seekEpoch: live.envelope.seek_epoch,
            resetRevision: live.envelope.reset_revision,
        });
        await invokeMockCommand("start_guided_session", { request: { session: { kind: "goto", latitude_deg: 1, longitude_deg: 2, altitude_m: 3 } } });
        await invokeMockCommand("disconnect_link", { request: { session_id: live.envelope.session_id } });

        getMockPlatformController().reset();

        const resetLive = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });
        expect(resetLive.guided.value.termination).toBeNull();
    });

    it("resolveDeferredConnectLink updates backing state for later snapshots and commands", async () => {
        const controller = getMockPlatformController();
        const live = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });
        await invokeMockCommand("ack_session_snapshot", {
            sessionId: live.envelope.session_id,
            seekEpoch: live.envelope.seek_epoch,
            resetRevision: live.envelope.reset_revision,
        });

        controller.setCommandBehavior("connect_link", { type: "defer" });
        const pendingConnect = invokeMockCommand("connect_link", {
            request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" } },
        });

        expect(controller.resolveDeferredConnectLink({
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
            guidedState: {
                status: "blocked",
                session: null,
                entered_at_unix_msec: null,
                blocking_reason: "vehicle_mode_incompatible",
                termination: null,
                last_command: null,
                actions: {
                    start: { allowed: false, blocking_reason: "vehicle_mode_incompatible" },
                    update: { allowed: false, blocking_reason: "live_session_required" },
                    stop: { allowed: false, blocking_reason: "live_session_required" },
                },
            },
        })).toBe(true);
        await pendingConnect;

        const nextLive = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });
        expect(nextLive.session.value.vehicle_state).toEqual({
            armed: true,
            custom_mode: 5,
            mode_name: "LOITER",
            system_status: "ACTIVE",
            vehicle_type: "copter",
            autopilot: "ardupilot",
            system_id: 1,
            component_id: 1,
            heartbeat_received: true,
        });
        expect(nextLive.guided.value.actions.start.blocking_reason).toBe("vehicle_mode_incompatible");

        const stop = await invokeMockCommand<any>("stop_guided_session");
        expect(stop.failure.reason.message).toBe("guided control requires GUIDED mode");
        controller.clearCommandBehavior("connect_link");
    });

    it("emitLiveSessionState auto-resets active guided session on vehicle state change", async () => {
        const controller = getMockPlatformController();
        await invokeMockCommand("connect_link", { request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" }, mockVehicleState: { armed: true, modeName: "GUIDED" } } });
        const live = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });
        await invokeMockCommand("ack_session_snapshot", {
            sessionId: live.envelope.session_id,
            seekEpoch: live.envelope.seek_epoch,
            resetRevision: live.envelope.reset_revision,
        });
        await invokeMockCommand("start_guided_session", { request: { session: { kind: "goto", latitude_deg: 1, longitude_deg: 2, altitude_m: 3 } } });

        let guidedPayload: any = null;
        const unlisten = listenMockEvent("guided://state", (payload) => {
            guidedPayload = payload;
        });

        controller.emitLiveSessionState({
            armed: false,
            custom_mode: 4,
            mode_name: "GUIDED",
            system_status: "ACTIVE",
            vehicle_type: "copter",
            autopilot: "ardupilot",
            system_id: 1,
            component_id: 1,
            heartbeat_received: true,
        });
        unlisten();

        expect(guidedPayload?.value?.value?.termination?.reason).toBe("mode_change");
        expect(guidedPayload?.value?.value?.session).toBeNull();

        const nextLive = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });
        expect(nextLive.guided.value.termination?.reason).toBe("mode_change");
        expect(nextLive.guided.value.session).toBeNull();
    });

    it("does not emit guided events until a live envelope exists", async () => {
        await invokeMockCommand("connect_link", { request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" }, mockVehicleState: { armed: true, modeName: "GUIDED" } } });

        const seen: unknown[] = [];
        const unlisten = listenMockEvent("guided://state", (payload) => {
            seen.push(payload);
        });

        await invokeMockCommand("start_guided_session", { request: { session: { kind: "goto", latitude_deg: 1, longitude_deg: 2, altitude_m: 3 } } });
        unlisten();

        expect(seen).toEqual([]);
    });
});

describe("mock profile backend parity", () => {
    beforeEach(() => {
        setMockProfile("test");
        getMockPlatformController().reset();
        vi.useRealTimers();
    });

    async function openDemoLiveEnvelope() {
        setMockProfile("demo");

        await invokeMockCommand("connect_link", {
            request: { transport: { kind: "demo", vehicle_preset: "quadcopter" } },
        });

        const live = await invokeMockCommand<OpenSessionSnapshot>("open_session_snapshot", { sourceKind: "live" });
        await invokeMockCommand("ack_session_snapshot", {
            sessionId: live.envelope.session_id,
            seekEpoch: live.envelope.seek_epoch,
            resetRevision: live.envelope.reset_revision,
        });

        return live.envelope;
    }

    it("exposes only the demo transport in demo profile", async () => {
        setMockProfile("demo");

        await expect(invokeMockCommand("available_transports")).resolves.toEqual([
            { kind: "demo", label: "Demo vehicle", available: true, validation: {} },
        ]);
    });

    it("keeps discovery commands deterministic in the test profile", async () => {
        await expect(invokeMockCommand("available_transports")).resolves.toEqual([
            { kind: "udp", label: "UDP", available: true, validation: { bind_addr_required: true } },
            { kind: "tcp", label: "TCP", available: true, validation: { address_required: true } },
            { kind: "serial", label: "Serial", available: true, validation: { port_required: true, baud_required: true }, default_baud: 57600 },
            { kind: "bluetooth_ble", label: "BLE", available: true, validation: { address_required: true } },
            { kind: "bluetooth_spp", label: "SPP", available: true, validation: { address_required: true } },
        ]);
        await expect(invokeMockCommand("list_serial_ports_cmd")).resolves.toEqual([
            "/dev/ttyUSB0",
            "/dev/ttyACM0",
        ]);
        await expect(invokeMockCommand("bt_request_permissions")).resolves.toBeUndefined();
        await expect(invokeMockCommand("bt_get_bonded_devices")).resolves.toEqual([
            { name: "Demo SPP Radio", address: "11:22:33:44:55:66", device_type: "classic" },
        ]);
        await expect(invokeMockCommand("bt_scan_ble", { timeoutMs: 500 })).resolves.toEqual([
            { name: "Demo BLE Radio", address: "AA:BB:CC:DD:EE:FF", device_type: "ble" },
        ]);
        await expect(invokeMockCommand("bt_stop_scan_ble")).resolves.toBeUndefined();
    });

    it("seeds quadplane demo connects with richer live state and available modes", async () => {
        setMockProfile("demo");

        await invokeMockCommand("connect_link", {
            request: { transport: { kind: "demo", vehicle_preset: "quadplane" } },
        });

        const snapshot = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });
        const modes = await invokeMockCommand<any>("get_available_modes");

        expect(snapshot.session.value.vehicle_state.vehicle_type).toBe("vtol");
        expect(snapshot.session.value.home_position).toEqual({
            latitude_deg: 47.397742,
            longitude_deg: 8.545594,
            altitude_m: 488,
        });
        expect(snapshot.param_store?.params.Q_ENABLE?.value).toBe(1);
        expect(snapshot.mission_state?.plan?.items.length ?? 0).toBeGreaterThan(0);
        await expect(invokeMockCommand("fence_download")).resolves.toEqual({
            return_point: { latitude_deg: 47.3975, longitude_deg: 8.5458 },
            regions: [
                {
                    inclusion_polygon: {
                        vertices: [
                            { latitude_deg: 47.393, longitude_deg: 8.538 },
                            { latitude_deg: 47.408, longitude_deg: 8.538 },
                            { latitude_deg: 47.408, longitude_deg: 8.559 },
                            { latitude_deg: 47.393, longitude_deg: 8.559 },
                        ],
                        inclusion_group: 0,
                    },
                },
            ],
        });
        await expect(invokeMockCommand("rally_download")).resolves.toEqual({
            points: [
                { RelHome: { latitude_deg: 47.3985, longitude_deg: 8.5448, relative_alt_m: 80 } },
                { RelHome: { latitude_deg: 47.401, longitude_deg: 8.551, relative_alt_m: 95 } },
            ],
        });
        expect(snapshot.support.available).toBe(true);
        expect(snapshot.support.value).not.toBeNull();
        expect(snapshot.sensor_health.available).toBe(true);
        expect(snapshot.sensor_health.value).not.toBeNull();
        expect(snapshot.configuration_facts.available).toBe(true);
        expect(snapshot.configuration_facts.value).not.toBeNull();
        expect(snapshot.status_text.value.entries.length).toBeGreaterThan(0);
        expect(modes.map((entry: { name: string }) => entry.name)).toContain("QLOITER");
    });

    it("airplane demo connects disarmed and parked instead of disarmed AUTO flight", async () => {
        setMockProfile("demo");

        await invokeMockCommand("connect_link", {
            request: { transport: { kind: "demo", vehicle_preset: "airplane" } },
        });

        const snapshot = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });

        expect(snapshot.session.value.vehicle_state).toEqual({
            armed: false,
            custom_mode: 0,
            mode_name: "Manual",
            system_status: "standby",
            vehicle_type: "fixed_wing",
            autopilot: "ardu_pilot_mega",
            system_id: 1,
            component_id: 1,
            heartbeat_received: true,
        });
        expect(snapshot.telemetry.value.flight.altitude_m).toBe(0);
        expect(snapshot.telemetry.value.flight.speed_mps).toBe(0);
        expect(snapshot.telemetry.value.flight.climb_rate_mps).toBe(0);
        expect(snapshot.telemetry.value.flight.airspeed_mps).toBe(0);
        expect(snapshot.telemetry.value.navigation.latitude_deg).toBe(47.397742);
        expect(snapshot.telemetry.value.navigation.longitude_deg).toBe(8.545594);
        expect(snapshot.telemetry.value.terrain.height_above_terrain_m).toBe(0);
    });

    it("applies seeded demo flight modes through set_flight_mode", async () => {
        setMockProfile("demo");

        await invokeMockCommand("connect_link", {
            request: { transport: { kind: "demo", vehicle_preset: "quadplane" } },
        });

        const modes = await invokeMockCommand<Array<{ custom_mode: number; name: string }>>("get_available_modes");
        const qrtlMode = modes.find((entry) => entry.name === "QRTL");
        expect(qrtlMode).toBeTruthy();

        await invokeMockCommand("set_flight_mode", { customMode: qrtlMode!.custom_mode });

        const snapshot = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });
        expect(snapshot.session.value.vehicle_state.custom_mode).toBe(qrtlMode!.custom_mode);
        expect(snapshot.session.value.vehicle_state.mode_name).toBe("QRTL");
    });

    it("preserves seeded demo home position in live session stream updates", async () => {
        const envelope = await openDemoLiveEnvelope();
        const sessionEvents: OpenSessionSnapshot["session"][] = [];
        const unlisten = listenMockEvent("session://state", (payload) => {
            const event = payload as SessionEvent<OpenSessionSnapshot["session"]>;
            if (event.envelope.session_id === envelope.session_id) {
                sessionEvents.push(event.value);
            }
        });

        await invokeMockCommand("set_flight_mode", { customMode: 3 });
        unlisten();

        expect(sessionEvents.at(-1)?.value.home_position).toEqual({
            latitude_deg: 47.397742,
            longitude_deg: 8.545594,
            altitude_m: 472,
        });
    });

    it("seeds quadcopter demo SITL params with RTL and failsafe rows", async () => {
        setMockProfile("demo");

        await invokeMockCommand("connect_link", {
            request: { transport: { kind: "demo", vehicle_preset: "quadcopter" } },
        });

        const snapshot = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });
        expect(snapshot.param_store?.params.FLTMODE_CH?.value).toBe(5);
        expect(snapshot.param_store?.params.RTL_ALT?.value).toEqual(expect.any(Number));
        expect(snapshot.param_store?.params.RTL_ALT_FINAL?.value).toEqual(expect.any(Number));
        expect(snapshot.param_store?.params.RTL_CLIMB_MIN?.value).toEqual(expect.any(Number));
        expect(snapshot.param_store?.params.RTL_SPEED?.value).toEqual(expect.any(Number));
        expect(snapshot.param_store?.params.RTL_LOIT_TIME?.value).toEqual(expect.any(Number));
        expect(snapshot.param_store?.params.FS_THR_ENABLE?.value).toEqual(expect.any(Number));
        expect(snapshot.param_store?.params.FS_GCS_ENABLE?.value).toEqual(expect.any(Number));
        expect(snapshot.param_store?.params.FS_EKF_ACTION?.value).toEqual(expect.any(Number));
        expect(snapshot.param_store?.params.FS_CRASH_CHECK?.value).toEqual(expect.any(Number));
    });

    it("seeds airplane demo SITL params with plane RTL rows", async () => {
        setMockProfile("demo");

        await invokeMockCommand("connect_link", {
            request: { transport: { kind: "demo", vehicle_preset: "airplane" } },
        });

        const snapshot = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });
        expect(snapshot.param_store?.params.ALT_HOLD_RTL?.value).toEqual(expect.any(Number));
        expect(snapshot.param_store?.params.RTL_AUTOLAND?.value).toEqual(expect.any(Number));
    });

    it("seeds quadplane demo SITL params with quadplane compatibility rows", async () => {
        setMockProfile("demo");

        await invokeMockCommand("connect_link", {
            request: { transport: { kind: "demo", vehicle_preset: "quadplane" } },
        });

        const snapshot = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });
        expect(snapshot.param_store?.params.Q_ENABLE?.value).toEqual(expect.any(Number));
        expect(snapshot.param_store?.params.ALT_HOLD_RTL?.value).toEqual(expect.any(Number));
        expect(snapshot.param_store?.params.RTL_AUTOLAND?.value).toEqual(expect.any(Number));
    });

    it("emits demo param download progress and completes with the shared vocabulary", async () => {
        vi.useFakeTimers();
        const envelope = await openDemoLiveEnvelope();
        const progress: SessionEvent<ParamProgress>[] = [];
        const unlisten = listenMockEvent("param://progress", (payload) => {
            progress.push(payload as SessionEvent<ParamProgress>);
        });

        const downloadPromise = invokeMockCommand("param_download_all");
        const demoStore = paramStoreForDemoPreset("quadcopter");
        const totalDurationMs = demoStore.expected_count * mockProfileTiming().paramStepDelayMs + 1_000;

        await vi.advanceTimersByTimeAsync(totalDurationMs);
        await downloadPromise;
        unlisten();

        expect(progress.length).toBeGreaterThan(1);
        expect(progress.every((entry) => entry.envelope.session_id === envelope.session_id)).toBe(true);
        expect(progress[0]?.value).toMatchObject({
            downloading: {
                received: expect.any(Number),
                expected: expect.any(Number),
            },
        });
        expect(progress.at(-1)?.value).toBe("completed");
    });

    it("uses demo mission upload pacing and completes after the shared transfer phases", async () => {
        vi.useFakeTimers();
        await openDemoLiveEnvelope();
        const missionProgress: SessionEvent<TransferProgress>[] = [];
        const unlisten = listenMockEvent("mission://progress", (payload) => {
            missionProgress.push(payload as SessionEvent<TransferProgress>);
        });

        const uploadPromise = invokeMockCommand("mission_upload", {
            plan: {
                items: [
                    {
                        command: {
                            Nav: {
                                Waypoint: {
                                    position: {
                                        RelHome: {
                                            latitude_deg: 47.4,
                                            longitude_deg: 8.55,
                                            relative_alt_m: 25,
                                        },
                                    },
                                    hold_time_s: 0,
                                    acceptance_radius_m: 1,
                                    pass_radius_m: 0,
                                    yaw_deg: 0,
                                },
                            },
                        },
                        current: true,
                        autocontinue: true,
                    },
                ],
            },
        });

        let settled = false;
        void uploadPromise.then(() => {
            settled = true;
        });

        await vi.advanceTimersByTimeAsync(359);
        expect(settled).toBe(false);

        await vi.advanceTimersByTimeAsync(1);
        await uploadPromise;
        unlisten();

        expect(missionProgress.map((entry) => entry.value.phase)).toEqual([
            "request_count",
            "transfer_items",
            "await_ack",
            "completed",
        ]);
    });

    it("emits demo compass calibration progress and report events", async () => {
        vi.useFakeTimers();
        await openDemoLiveEnvelope();
        const progress: Array<{ compass_id: number; completion_pct: number; status: string; attempt: number }> = [];
        const reports: Array<{
            compass_id: number;
            status: string;
            fitness: number;
            ofs_x: number;
            ofs_y: number;
            ofs_z: number;
            autosaved: boolean;
        }> = [];
        const unlisteners = [
            listenMockEvent("compass://cal_progress", (payload) => {
                progress.push(payload as { compass_id: number; completion_pct: number; status: string; attempt: number });
            }),
            listenMockEvent("compass://cal_report", (payload) => {
                reports.push(payload as {
                    compass_id: number;
                    status: string;
                    fitness: number;
                    ofs_x: number;
                    ofs_y: number;
                    ofs_z: number;
                    autosaved: boolean;
                });
            }),
        ];

        await expect(invokeMockCommand("calibrate_compass_start", { compassMask: 0 })).resolves.toBeUndefined();

        await vi.advanceTimersByTimeAsync(400);
        unlisteners.forEach((unlisten) => unlisten());

        expect(progress).toEqual([
            { compass_id: 1, completion_pct: 15, status: "waiting_to_start", attempt: 1 },
            { compass_id: 1, completion_pct: 55, status: "running_step_one", attempt: 1 },
            { compass_id: 1, completion_pct: 100, status: "success", attempt: 1 },
        ]);
        expect(reports).toEqual([
            { compass_id: 1, status: "success", fitness: 12.5, ofs_x: 24, ofs_y: -11, ofs_z: 7, autosaved: true },
        ]);
    });

    it("stops demo compass calibration emission after disconnect", async () => {
        vi.useFakeTimers();
        const envelope = await openDemoLiveEnvelope();
        const progress: Array<{ completion_pct: number; status: string }> = [];
        const reports: Array<{ status: string }> = [];
        const unlisteners = [
            listenMockEvent("compass://cal_progress", (payload) => {
                progress.push(payload as { completion_pct: number; status: string });
            }),
            listenMockEvent("compass://cal_report", (payload) => {
                reports.push(payload as { status: string });
            }),
        ];

        await expect(invokeMockCommand("calibrate_compass_start", { compassMask: 0 })).resolves.toBeUndefined();
        await vi.advanceTimersByTimeAsync(120);
        await invokeMockCommand("disconnect_link", { request: { session_id: envelope.session_id } });
        await vi.advanceTimersByTimeAsync(1_000);
        unlisteners.forEach((unlisten) => unlisten());

        expect(progress).toEqual([{ compass_id: 1, completion_pct: 15, status: "waiting_to_start", attempt: 1 }]);
        expect(reports).toEqual([]);
    });

    it("stops demo timers on disconnect and emits a final disconnected live session state", async () => {
        vi.useFakeTimers();
        const envelope = await openDemoLiveEnvelope();
        const sessionEvents: SessionEvent<any>[] = [];
        const telemetryEvents: SessionEvent<any>[] = [];
        const unlisteners = [
            listenMockEvent("session://state", (payload) => {
                sessionEvents.push(payload as SessionEvent<any>);
            }),
            listenMockEvent("telemetry://state", (payload) => {
                telemetryEvents.push(payload as SessionEvent<any>);
            }),
        ];

        await vi.advanceTimersByTimeAsync(1_000);
        const telemetryBeforeDisconnect = telemetryEvents.length;

        await invokeMockCommand("disconnect_link", { request: { session_id: envelope.session_id } });
        await vi.advanceTimersByTimeAsync(5_000);
        unlisteners.forEach((unlisten) => unlisten());

        expect(telemetryBeforeDisconnect).toBeGreaterThan(0);
        expect(telemetryEvents).toHaveLength(telemetryBeforeDisconnect);
        expect(sessionEvents.at(-1)).toMatchObject({
            envelope,
            value: {
                value: {
                    connection: { kind: "disconnected" },
                },
            },
        });
    });

    it("demo telemetry stays stationary while the vehicle is disarmed", async () => {
        vi.useFakeTimers();
        await openDemoLiveEnvelope();
        const telemetryEvents: SessionEvent<any>[] = [];
        const unlisten = listenMockEvent("telemetry://state", (payload) => {
            telemetryEvents.push(payload as SessionEvent<any>);
        });

        await vi.advanceTimersByTimeAsync(1_000);
        unlisten();

        expect(telemetryEvents.length).toBeGreaterThan(0);
        expect(telemetryEvents.at(-1)?.value.value).toEqual(telemetryEvents[0]?.value.value);
    });

    it("vehicle_takeoff in guided copter mode drives simulator altitude upward", async () => {
        vi.useFakeTimers();
        await openDemoLiveEnvelope();

        await invokeMockCommand("set_flight_mode", { customMode: 4 });
        await invokeMockCommand("arm_vehicle", { force: false });
        await invokeMockCommand("vehicle_takeoff", { altitudeM: 12 });

        await vi.advanceTimersByTimeAsync(1_000);

        expect(mockState.liveSimulator?.state.position.relative_alt_m ?? 0).toBeGreaterThan(0);
        expect(mockState.liveSimulator?.state.target?.relative_alt_m).toBe(12);
    });

    it("selecting RTL drives a copter back toward home", async () => {
        vi.useFakeTimers();
        await openDemoLiveEnvelope();

        await invokeMockCommand("set_flight_mode", { customMode: 4 });
        await invokeMockCommand("arm_vehicle", { force: false });
        await invokeMockCommand("vehicle_takeoff", { altitudeM: 12 });
        await vi.advanceTimersByTimeAsync(5_000);

        await invokeMockCommand("start_guided_session", {
            request: { session: { kind: "goto", latitude_deg: 47.3982, longitude_deg: 8.5461, altitude_m: 12 } },
        });
        await vi.advanceTimersByTimeAsync(5_000);

        const beforeRtl = mockState.liveSimulator?.state.position;
        expect(beforeRtl).toBeTruthy();
        const distanceBeforeRtl = horizontalDistanceM(beforeRtl!, mockState.liveSimulator!.state.home_position);
        expect(distanceBeforeRtl).toBeGreaterThan(0);

        await invokeMockCommand("set_flight_mode", { customMode: 6 });
        await vi.advanceTimersByTimeAsync(2_000);

        const afterRtl = mockState.liveSimulator?.state.position;
        expect(afterRtl).toBeTruthy();
        const distanceAfterRtl = horizontalDistanceM(afterRtl!, mockState.liveSimulator!.state.home_position);

        expect(distanceAfterRtl).toBeLessThan(distanceBeforeRtl);
    });

    it("switching to Stabilize clears stale autonomous targets", async () => {
        vi.useFakeTimers();
        await openDemoLiveEnvelope();

        await invokeMockCommand("set_flight_mode", { customMode: 4 });
        await invokeMockCommand("arm_vehicle", { force: false });
        await invokeMockCommand("start_guided_session", {
            request: { session: { kind: "goto", latitude_deg: 47.3982, longitude_deg: 8.5461, altitude_m: 12 } },
        });
        await vi.advanceTimersByTimeAsync(1_000);

        const beforeStabilize = structuredClone(mockState.liveSimulator?.state.position);
        expect(mockState.liveSimulator?.state.target).not.toBeNull();

        await invokeMockCommand("set_flight_mode", { customMode: 0 });
        await vi.advanceTimersByTimeAsync(2_000);

        expect(mockState.liveSimulator?.state.target).toBeNull();
        expect(mockState.liveSimulator?.state.position).toEqual(beforeStabilize);
    });

    it("disarming in flight parks the simulated copter immediately", async () => {
        vi.useFakeTimers();
        await openDemoLiveEnvelope();

        await invokeMockCommand("set_flight_mode", { customMode: 4 });
        await invokeMockCommand("arm_vehicle", { force: false });
        await invokeMockCommand("vehicle_takeoff", { altitudeM: 12 });
        await vi.advanceTimersByTimeAsync(2_000);

        expect(mockState.liveSimulator?.state.position.relative_alt_m ?? 0).toBeGreaterThan(0);

        await invokeMockCommand("disarm_vehicle", { force: false });

        expect(mockState.liveSimulator?.state.armed).toBe(false);
        expect(mockState.liveSimulator?.state.position.relative_alt_m).toBe(0);
        expect(mockState.liveSimulator?.state.groundspeed_mps).toBe(0);
        expect(mockState.liveSimulator?.state.climb_rate_mps).toBe(0);
    });

    it("mission management preserves active non-AUTO simulator targets", async () => {
        vi.useFakeTimers();
        await openDemoLiveEnvelope();

        await invokeMockCommand("set_flight_mode", { customMode: 4 });
        await invokeMockCommand("arm_vehicle", { force: false });
        await invokeMockCommand("start_guided_session", {
            request: { session: { kind: "goto", latitude_deg: 47.3982, longitude_deg: 8.5461, altitude_m: 12 } },
        });

        const guidedTargetBeforeMissionUpdate = structuredClone(mockState.liveSimulator?.state.target);

        const uploadPromise = invokeMockCommand("mission_upload", {
            plan: {
                items: [
                    {
                        command: {
                            Nav: {
                                Waypoint: {
                                    position: {
                                        RelHome: {
                                            latitude_deg: 47.399,
                                            longitude_deg: 8.547,
                                            relative_alt_m: 20,
                                        },
                                    },
                                    hold_time_s: 0,
                                    acceptance_radius_m: 1,
                                    pass_radius_m: 0,
                                    yaw_deg: 0,
                                },
                            },
                        },
                        current: true,
                        autocontinue: true,
                    },
                ],
            },
        });
        await vi.advanceTimersByTimeAsync(400);
        await uploadPromise;

        expect(mockState.liveVehicleState?.mode_name).toBe("Guided");
        expect(mockState.liveSimulator?.state.target).toEqual(guidedTargetBeforeMissionUpdate);
    });

    it("a basic demo AUTO mission executes and disarms after landing", async () => {
        vi.useFakeTimers();
        const envelope = await openDemoLiveEnvelope();
        const missionStates: SessionEvent<MissionState>[] = [];
        const unlistenMission = listenMockEvent("mission://state", (payload) => {
            missionStates.push(payload as SessionEvent<MissionState>);
        });

        const uploadPromise = invokeMockCommand("mission_upload", {
            plan: {
                items: [
                    {
                        command: {
                            Nav: {
                                Takeoff: {
                                    position: {
                                        RelHome: {
                                            latitude_deg: 47.397742,
                                            longitude_deg: 8.545594,
                                            relative_alt_m: 3,
                                        },
                                    },
                                    pitch_deg: 15,
                                },
                            },
                        },
                        current: true,
                        autocontinue: true,
                    },
                    {
                        command: {
                            Nav: {
                                Waypoint: {
                                    position: {
                                        RelHome: {
                                            latitude_deg: 47.39776,
                                            longitude_deg: 8.54561,
                                            relative_alt_m: 3,
                                        },
                                    },
                                    hold_time_s: 0,
                                    acceptance_radius_m: 1,
                                    pass_radius_m: 0,
                                    yaw_deg: 0,
                                },
                            },
                        },
                        current: false,
                        autocontinue: true,
                    },
                    {
                        command: {
                            Nav: {
                                Land: {
                                    position: {
                                        RelHome: {
                                            latitude_deg: 47.39776,
                                            longitude_deg: 8.54561,
                                            relative_alt_m: 0,
                                        },
                                    },
                                    abort_alt_m: 10,
                                },
                            },
                        },
                        current: false,
                        autocontinue: true,
                    },
                ],
            },
        });
        await vi.advanceTimersByTimeAsync(400);
        await uploadPromise;

        await invokeMockCommand("set_flight_mode", { customMode: 3 });
        await invokeMockCommand("arm_vehicle", { force: false });

        await vi.advanceTimersByTimeAsync(10_000);
        unlistenMission();

        expect(mockState.liveVehicleState).toMatchObject({
            armed: false,
            mode_name: "Auto",
            system_status: "standby",
        });
        expect(mockState.liveSimulator?.state.armed).toBe(false);
        expect(mockState.liveSimulator?.state.position.relative_alt_m).toBe(0);
        expect(missionStates.map((entry) => entry.envelope)).toEqual(expect.arrayContaining([envelope]));
        expect(missionStates.map((entry) => entry.value.current_index)).toEqual(expect.arrayContaining([1, 2]));
        expect(missionStates[missionStates.length - 1]?.value.current_index).toBeNull();
    });

    it("demo AUTO mission seeding keeps simulator mission runtime aligned with public mission state", async () => {
        await openDemoLiveEnvelope();

        const publicMission = mockState.liveMissionState;
        const simulatorMission = mockState.liveSimulator?.state.mission;

        expect(publicMission?.current_index).toBe(0);
        expect(simulatorMission).toMatchObject({
            current_index: publicMission?.current_index,
            completed: false,
            items: [
                {
                    kind: "takeoff",
                    latitude_deg: 47.397742,
                    longitude_deg: 8.545594,
                    relative_alt_m: 20,
                },
                {
                    kind: "waypoint",
                    latitude_deg: 47.3989,
                    longitude_deg: 8.5482,
                    relative_alt_m: 30,
                },
            ],
        });
    });

    it("AUTO mission change_speed updates simulator mission speed before the waypoint leg", async () => {
        vi.useFakeTimers();
        await openDemoLiveEnvelope();

        const uploadPromise = invokeMockCommand("mission_upload", {
            plan: {
                items: [
                    {
                        command: {
                            Nav: {
                                Takeoff: {
                                    position: {
                                        RelHome: {
                                            latitude_deg: 47.397742,
                                            longitude_deg: 8.545594,
                                            relative_alt_m: 3,
                                        },
                                    },
                                    pitch_deg: 15,
                                },
                            },
                        },
                        current: true,
                        autocontinue: true,
                    },
                    {
                        command: {
                            Do: {
                                ChangeSpeed: {
                                    speed_type: "Groundspeed",
                                    speed_mps: 2,
                                    throttle_pct: 50,
                                },
                            },
                        },
                        current: false,
                        autocontinue: true,
                    },
                    {
                        command: {
                            Nav: {
                                Waypoint: {
                                    position: {
                                        RelHome: {
                                            latitude_deg: 47.3982,
                                            longitude_deg: 8.5461,
                                            relative_alt_m: 3,
                                        },
                                    },
                                    hold_time_s: 0,
                                    acceptance_radius_m: 1,
                                    pass_radius_m: 0,
                                    yaw_deg: 0,
                                },
                            },
                        },
                        current: false,
                        autocontinue: true,
                    },
                    {
                        command: {
                            Nav: {
                                Land: {
                                    position: {
                                        RelHome: {
                                            latitude_deg: 47.3982,
                                            longitude_deg: 8.5461,
                                            relative_alt_m: 0,
                                        },
                                    },
                                    abort_alt_m: 10,
                                },
                            },
                        },
                        current: false,
                        autocontinue: true,
                    },
                ],
            },
        });
        await vi.advanceTimersByTimeAsync(400);
        await uploadPromise;

        await invokeMockCommand("set_flight_mode", { customMode: 3 });
        await invokeMockCommand("arm_vehicle", { force: false });
        await vi.advanceTimersByTimeAsync(2_000);

        expect(mockState.liveSimulator?.state.mission.current_index).toBe(2);
        expect(mockState.liveSimulator?.state.groundspeed_mps).toBeLessThanOrEqual(2);
    });

    it("unsupported AUTO mission commands emit status text", async () => {
        vi.useFakeTimers();
        await openDemoLiveEnvelope();
        const statusTextEvents: SessionEvent<{ available: boolean; complete: boolean; provenance: string; value: { entries: Array<{ text: string }> } }>[] = [];
        const unlistenStatus = listenMockEvent("status_text://state", (payload) => {
            statusTextEvents.push(payload as SessionEvent<{ available: boolean; complete: boolean; provenance: string; value: { entries: Array<{ text: string }> } }>);
        });

        const uploadPromise = invokeMockCommand("mission_upload", {
            plan: {
                items: [
                    {
                        command: {
                            Nav: {
                                Takeoff: {
                                    position: {
                                        RelHome: {
                                            latitude_deg: 47.397742,
                                            longitude_deg: 8.545594,
                                            relative_alt_m: 3,
                                        },
                                    },
                                    pitch_deg: 15,
                                },
                            },
                        },
                        current: true,
                        autocontinue: true,
                    },
                    {
                        command: {
                            Nav: {
                                SplineWaypoint: {
                                    position: {
                                        RelHome: {
                                            latitude_deg: 47.3978,
                                            longitude_deg: 8.54565,
                                            relative_alt_m: 3,
                                        },
                                    },
                                    hold_time_s: 0,
                                },
                            },
                        },
                        current: false,
                        autocontinue: true,
                    },
                    {
                        command: {
                            Nav: {
                                Land: {
                                    position: {
                                        RelHome: {
                                            latitude_deg: 47.3978,
                                            longitude_deg: 8.54565,
                                            relative_alt_m: 0,
                                        },
                                    },
                                    abort_alt_m: 10,
                                },
                            },
                        },
                        current: false,
                        autocontinue: true,
                    },
                ],
            },
        });
        await vi.advanceTimersByTimeAsync(400);
        await uploadPromise;

        await invokeMockCommand("set_flight_mode", { customMode: 3 });
        await invokeMockCommand("arm_vehicle", { force: false });

        await vi.advanceTimersByTimeAsync(10_000);
        unlistenStatus();

        const emittedTexts = statusTextEvents.flatMap((event) => event.value.value.entries.map((entry) => entry.text));
        expect(emittedTexts.some((text) => text.includes("Spline Waypoint"))).toBe(true);
    });

    it("disconnect clears simulator state and stops demo timers", async () => {
        vi.useFakeTimers();
        const envelope = await openDemoLiveEnvelope();
        const telemetryEvents: SessionEvent<any>[] = [];
        const unlisten = listenMockEvent("telemetry://state", (payload) => {
            telemetryEvents.push(payload as SessionEvent<any>);
        });

        expect(mockState.liveSimulator).not.toBeNull();
        expect(mockState.demoTelemetryIntervalId).not.toBeNull();
        expect(mockState.demoStatusIntervalId).not.toBeNull();

        await vi.advanceTimersByTimeAsync(1_000);
        const telemetryBeforeDisconnect = telemetryEvents.length;

        await invokeMockCommand("disconnect_link", { request: { session_id: envelope.session_id } });
        await vi.advanceTimersByTimeAsync(1_000);
        unlisten();

        expect(mockState.liveSimulator).toBeNull();
        expect(mockState.demoTelemetryIntervalId).toBeNull();
        expect(mockState.demoStatusIntervalId).toBeNull();
        expect(telemetryBeforeDisconnect).toBeGreaterThan(0);
        expect(telemetryEvents).toHaveLength(telemetryBeforeDisconnect);
    });
});

describe("mock mission backend parity", () => {
    beforeEach(() => {
        getMockPlatformController().reset();
    });

    async function openLiveEnvelope() {
        await invokeMockCommand("connect_link", {
            request: {
                transport: { kind: "udp", bind_addr: "0.0.0.0:14550" },
                mockVehicleState: {
                    armed: false,
                    mode_name: "Loiter",
                    system_status: "standby",
                    vehicle_type: "copter",
                    autopilot: "ardupilot",
                    system_id: 1,
                    component_id: 1,
                    heartbeat_received: true,
                },
            },
        });

        const live = await invokeMockCommand<OpenSessionSnapshot>("open_session_snapshot", { sourceKind: "live" });
        await invokeMockCommand("ack_session_snapshot", {
            sessionId: live.envelope.session_id,
            seekEpoch: live.envelope.seek_epoch,
            resetRevision: live.envelope.reset_revision,
        });

        return live.envelope;
    }

    it("emits truthful download mission state/progress and returns default mission planner payloads", async () => {
        const envelope = await openLiveEnvelope();
        const missionStates: SessionEvent<MissionState>[] = [];
        const missionProgress: SessionEvent<TransferProgress>[] = [];
        const unlisteners = [
            listenMockEvent("mission://state", (payload) => {
                missionStates.push(payload as SessionEvent<MissionState>);
            }),
            listenMockEvent("mission://progress", (payload) => {
                missionProgress.push(payload as SessionEvent<TransferProgress>);
            }),
        ];

        const mission = await invokeMockCommand<any>("mission_download");
        const fence = await invokeMockCommand<any>("fence_download");
        const rally = await invokeMockCommand<any>("rally_download");
        unlisteners.forEach((unlisten) => unlisten());

        expect(mission.plan.items).toHaveLength(2);
        expect(mission.home).toEqual({ latitude_deg: 47.397742, longitude_deg: 8.545594, altitude_m: 488 });
        expect(fence.regions).toHaveLength(1);
        expect(rally.points).toHaveLength(1);
        expect(missionStates.map((entry) => entry.envelope)).toEqual([envelope, envelope]);
        expect(missionStates[0]?.value.active_op).toBe("download");
        expect(missionStates[1]?.value.active_op).toBeNull();
        expect(missionStates[1]?.value.current_index).toBe(0);
        expect(missionProgress.map((entry) => entry.value.phase)).toEqual([
            "request_count",
            "transfer_items",
            "await_ack",
            "completed",
        ]);
        const lastMissionProgress = missionProgress[missionProgress.length - 1];
        expect(lastMissionProgress?.value).toMatchObject({
            direction: "download",
            mission_type: "mission",
            completed_items: 2,
            total_items: 2,
            retries_used: 0,
        });
    });

    it("persists uploaded mission/fence/rally plans so later downloads stay truthful", async () => {
        await openLiveEnvelope();

        const uploadedMission = {
            items: [
                {
                    command: {
                        Nav: {
                            Waypoint: {
                                position: {
                                    RelHome: {
                                        latitude_deg: 47.52,
                                        longitude_deg: 8.61,
                                        relative_alt_m: 120,
                                    },
                                },
                                hold_time_s: 0,
                                acceptance_radius_m: 1,
                                pass_radius_m: 0,
                                yaw_deg: 0,
                            },
                        },
                    },
                    current: true,
                    autocontinue: true,
                },
            ],
        };
        const uploadedFence = {
            return_point: { latitude_deg: 47.53, longitude_deg: 8.62 },
            regions: [],
        };
        const uploadedRally = {
            points: [
                {
                    RelHome: {
                        latitude_deg: 47.54,
                        longitude_deg: 8.63,
                        relative_alt_m: 45,
                    },
                },
            ],
        };

        const missionStates: SessionEvent<MissionState>[] = [];
        const missionProgress: SessionEvent<TransferProgress>[] = [];
        const unlisteners = [
            listenMockEvent("mission://state", (payload) => {
                missionStates.push(payload as SessionEvent<MissionState>);
            }),
            listenMockEvent("mission://progress", (payload) => {
                missionProgress.push(payload as SessionEvent<TransferProgress>);
            }),
        ];

        await invokeMockCommand("mission_upload", { plan: uploadedMission });
        await invokeMockCommand("fence_upload", { plan: uploadedFence });
        await invokeMockCommand("rally_upload", { plan: uploadedRally });

        const mission = await invokeMockCommand<any>("mission_download");
        const fence = await invokeMockCommand<any>("fence_download");
        const rally = await invokeMockCommand<any>("rally_download");
        unlisteners.forEach((unlisten) => unlisten());

        expect(mission.plan).toEqual(uploadedMission);
        expect(fence).toEqual(uploadedFence);
        expect(rally).toEqual(uploadedRally);
        expect(missionStates.some((entry) => entry.value.active_op === "upload")).toBe(true);
        expect(missionStates.some((entry) => entry.value.plan?.items[0]?.current === true)).toBe(true);
        expect(missionProgress.some((entry) => entry.value.direction === "upload" && entry.value.phase === "completed")).toBe(true);
    });

    it("cancels an in-flight upload loudly and preserves the previously stored mission", async () => {
        await openLiveEnvelope();

        const originalMission = await invokeMockCommand<any>("mission_download");
        const replacementMission = {
            items: [
                {
                    command: {
                        Nav: {
                            Waypoint: {
                                position: {
                                    RelHome: {
                                        latitude_deg: 47.7,
                                        longitude_deg: 8.7,
                                        relative_alt_m: 80,
                                    },
                                },
                                hold_time_s: 0,
                                acceptance_radius_m: 1,
                                pass_radius_m: 0,
                                yaw_deg: 0,
                            },
                        },
                    },
                    current: true,
                    autocontinue: true,
                },
            ],
        };

        const missionStates: SessionEvent<MissionState>[] = [];
        const missionProgress: SessionEvent<TransferProgress>[] = [];
        const unlisteners = [
            listenMockEvent("mission://state", (payload) => {
                missionStates.push(payload as SessionEvent<MissionState>);
            }),
            listenMockEvent("mission://progress", (payload) => {
                missionProgress.push(payload as SessionEvent<TransferProgress>);
            }),
        ];

        const uploadPromise = invokeMockCommand("mission_upload", { plan: replacementMission });
        await new Promise((resolve) => setTimeout(resolve, 30));
        await expect(invokeMockCommand("mission_cancel")).resolves.toBeUndefined();
        await expect(uploadPromise).rejects.toThrow("Mission upload cancelled.");

        const missionAfterCancel = await invokeMockCommand<any>("mission_download");
        unlisteners.forEach((unlisten) => unlisten());

        expect(missionAfterCancel.plan).toEqual(originalMission.plan);
        expect(missionProgress.some((entry) => entry.value.phase === "cancelled")).toBe(true);
        expect(missionProgress.some((entry) => entry.value.phase === "completed")).toBe(true);
        const lastMissionState = missionStates[missionStates.length - 1];
        expect(lastMissionState?.value.active_op).toBeNull();
        expect(lastMissionState?.value.plan).toEqual(originalMission.plan);
    });
});

describe("mock backend actuation parity", () => {
    beforeEach(() => {
        getMockPlatformController().reset();
    });

    it("accepts set_servo, motor_test, and rc_override once a live vehicle exists", async () => {
        await invokeMockCommand("connect_link", {
            request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" } },
        });

        await expect(invokeMockCommand("set_servo", { instance: 3, pwmUs: 1500 })).resolves.toBeUndefined();
        await expect(invokeMockCommand("motor_test", { motorInstance: 4, throttlePct: 5, durationS: 2 })).resolves.toBeUndefined();
        await expect(invokeMockCommand("rc_override", {
            channels: [
                { channel: 1, value: { kind: "pwm", pwm_us: 1500 } },
                { channel: 2, value: { kind: "release" } },
                { channel: 3, value: { kind: "ignore" } },
            ],
        })).resolves.toBeUndefined();
    });

    it("surfaces disconnected actuation calls as rejected invokes", async () => {
        await expect(invokeMockCommand("set_servo", { instance: 3, pwmUs: 1500 })).rejects.toThrow("not connected");
        await expect(invokeMockCommand("motor_test", { motorInstance: 2, throttlePct: 3, durationS: 2 })).rejects.toThrow("not connected");
        await expect(invokeMockCommand("rc_override", {
            channels: [{ channel: 1, value: { kind: "release" } }],
        })).rejects.toThrow("not connected");
    });

    it("rejects malformed actuation payloads instead of silently coercing them", async () => {
        await invokeMockCommand("connect_link", {
            request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" } },
        });

        await expect(invokeMockCommand("set_servo", { instance: 3 })).rejects.toThrow(
            "missing or invalid set_servo.pwmUs",
        );
        await expect(invokeMockCommand("set_servo", { instance: 0, pwmUs: 1500 })).rejects.toThrow(
            "set_servo instance must be in 1..=16, got 0",
        );
        await expect(invokeMockCommand("motor_test", { motorInstance: 2, throttlePct: 5 })).rejects.toThrow(
            "missing or invalid motor_test.durationS",
        );
        await expect(invokeMockCommand("motor_test", { motorInstance: 9, throttlePct: 5, durationS: 2 })).rejects.toThrow(
            "motor_test motorInstance must be in 1..=8, got 9",
        );
        await expect(invokeMockCommand("motor_test", { motorInstance: 2, throttlePct: 101, durationS: 2 })).rejects.toThrow(
            "motor_test throttlePct must be in 0..=100, got 101",
        );
        await expect(invokeMockCommand("rc_override", {
            channels: [{ channel: 1, value: {} }],
        })).rejects.toThrow("missing or invalid rc_override.channels[0].value.kind");
        await expect(invokeMockCommand("rc_override", {
            channels: [{ channel: 19, value: { kind: "release" } }],
        })).rejects.toThrow("rc override channel must be 1..=18, got 19");
        await expect(invokeMockCommand("rc_override", {
            channels: [{ channel: 4, value: { kind: "pwm", pwm_us: 0 } }],
        })).rejects.toThrow(
            "rc override pwm 0 is reserved for release; use RcOverrideChannelValue::Release or RcOverride::release()",
        );
    });
});

describe("mock setup/calibration/arming backend parity", () => {
    beforeEach(() => {
        getMockPlatformController().reset();
    });

    it("arms when connected and rejects when disconnected", async () => {
        await expect(invokeMockCommand("arm_vehicle", { force: false })).rejects.toThrow("not connected");

        await invokeMockCommand("connect_link", {
            request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" } },
        });

        await expect(invokeMockCommand("arm_vehicle", { force: false })).resolves.toBeUndefined();

        const live = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });
        expect(live.session.value.vehicle_state.armed).toBe(true);
        expect(live.guided.value.status).toBe("idle");
    });

    it("disarms when connected", async () => {
        await invokeMockCommand("connect_link", {
            request: {
                transport: { kind: "udp", bind_addr: "0.0.0.0:14550" },
                mockVehicleState: { armed: true, modeName: "GUIDED" },
            },
        });

        await expect(invokeMockCommand("disarm_vehicle", { force: false })).resolves.toBeUndefined();

        const live = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });
        expect(live.session.value.vehicle_state.armed).toBe(false);
        expect(live.guided.value.blocking_reason).toBe("vehicle_disarmed");
    });

    it("starts accel calibration when connected and rejects when disconnected", async () => {
        await expect(invokeMockCommand("calibrate_accel")).rejects.toThrow("not connected");

        await invokeMockCommand("connect_link", {
            request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" } },
        });

        await expect(invokeMockCommand("calibrate_accel")).resolves.toBeUndefined();
    });

    it("starts gyro calibration when connected", async () => {
        await invokeMockCommand("connect_link", {
            request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" } },
        });

        await expect(invokeMockCommand("calibrate_gyro")).resolves.toBeUndefined();
    });

    it("starts compass calibration when connected", async () => {
        await invokeMockCommand("connect_link", {
            request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" } },
        });

        await expect(invokeMockCommand("calibrate_compass_start", { compassMask: 0 })).resolves.toBeUndefined();
    });

    it("uses the shared compass calibration flow in the test profile with faster pacing", async () => {
        vi.useFakeTimers();
        await invokeMockCommand("connect_link", {
            request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" } },
        });

        const progress: Array<{ compass_id: number; completion_pct: number; status: string; attempt: number }> = [];
        const reports: Array<{
            compass_id: number;
            status: string;
            fitness: number;
            ofs_x: number;
            ofs_y: number;
            ofs_z: number;
            autosaved: boolean;
        }> = [];
        const unlisteners = [
            listenMockEvent("compass://cal_progress", (payload) => {
                progress.push(payload as { compass_id: number; completion_pct: number; status: string; attempt: number });
            }),
            listenMockEvent("compass://cal_report", (payload) => {
                reports.push(payload as {
                    compass_id: number;
                    status: string;
                    fitness: number;
                    ofs_x: number;
                    ofs_y: number;
                    ofs_z: number;
                    autosaved: boolean;
                });
            }),
        ];

        await expect(invokeMockCommand("calibrate_compass_start", { compassMask: 0 })).resolves.toBeUndefined();
        await vi.advanceTimersByTimeAsync(80);
        unlisteners.forEach((unlisten) => unlisten());

        expect(progress).toEqual([
            { compass_id: 1, completion_pct: 15, status: "waiting_to_start", attempt: 1 },
            { compass_id: 1, completion_pct: 55, status: "running_step_one", attempt: 1 },
            { compass_id: 1, completion_pct: 100, status: "success", attempt: 1 },
        ]);
        expect(reports).toEqual([
            { compass_id: 1, status: "success", fitness: 12.5, ofs_x: 24, ofs_y: -11, ofs_z: 7, autosaved: true },
        ]);
    });

    it("reboots the vehicle when connected", async () => {
        await invokeMockCommand("connect_link", {
            request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" } },
        });

        await expect(invokeMockCommand("reboot_vehicle")).resolves.toBeUndefined();
    });

    it("requests prearm checks when connected", async () => {
        await invokeMockCommand("connect_link", {
            request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" } },
        });

        await expect(invokeMockCommand("request_prearm_checks")).resolves.toBeUndefined();
    });

    it("returns frontend-shaped param write batch results when connected", async () => {
        await invokeMockCommand("connect_link", {
            request: {
                transport: { kind: "udp", bind_addr: "0.0.0.0:14550" },
                mockParamStore: {
                    expected_count: 2,
                    params: {
                        ARMING_CHECK: { name: "ARMING_CHECK", value: 1, param_type: "uint8", index: 0 },
                        FS_THR_ENABLE: { name: "FS_THR_ENABLE", value: 2, param_type: "uint8", index: 1 },
                    },
                },
            },
        });

        await expect(invokeMockCommand("param_write_batch", {
            params: [["ARMING_CHECK", 0], ["FS_THR_ENABLE", 1]],
        })).resolves.toEqual([
            { name: "ARMING_CHECK", requested_value: 0, confirmed_value: 0, success: true },
            { name: "FS_THR_ENABLE", requested_value: 1, confirmed_value: 1, success: true },
        ]);

        const live = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });
        expect(live.param_store.params.ARMING_CHECK.value).toBe(0);
        expect(live.param_store.params.FS_THR_ENABLE.value).toBe(1);
    });

    it("emits cancelled progress when param_download_all is cancelled", async () => {
        vi.useFakeTimers();
        await invokeMockCommand("connect_link", {
            request: {
                transport: { kind: "udp", bind_addr: "0.0.0.0:14550" },
                mockParamStore: {
                    expected_count: 2,
                    params: {
                        ARMING_CHECK: { name: "ARMING_CHECK", value: 1, param_type: "uint8", index: 0 },
                        FS_THR_ENABLE: { name: "FS_THR_ENABLE", value: 2, param_type: "uint8", index: 1 },
                    },
                },
            },
        });
        const live = await invokeMockCommand<OpenSessionSnapshot>("open_session_snapshot", { sourceKind: "live" });
        await invokeMockCommand("ack_session_snapshot", {
            sessionId: live.envelope.session_id,
            seekEpoch: live.envelope.seek_epoch,
            resetRevision: live.envelope.reset_revision,
        });
        const progress: ParamProgress[] = [];
        const unlisten = listenMockEvent("param://progress", (payload) => {
            progress.push((payload as SessionEvent<ParamProgress>).value);
        });

        const downloadPromise = invokeMockCommand("param_download_all");
        await vi.advanceTimersByTimeAsync(20);
        await expect(invokeMockCommand("param_cancel")).resolves.toBeUndefined();
        await expect(downloadPromise).rejects.toThrow("Param download cancelled.");
        unlisten();

        expect(progress).toEqual([
            { downloading: { received: 1, expected: 2 } },
            "cancelled",
        ]);
    });

    it("returns single param_write results consistent with the stored value", async () => {
        vi.useFakeTimers();
        await invokeMockCommand("connect_link", {
            request: {
                transport: { kind: "udp", bind_addr: "0.0.0.0:14550" },
                mockParamStore: {
                    expected_count: 1,
                    params: {
                        ARMING_CHECK: { name: "ARMING_CHECK", value: 1, param_type: "uint8", index: 0 },
                    },
                },
            },
        });

        const writePromise = invokeMockCommand<any>("param_write", { name: "ARMING_CHECK", value: 0 });
        await vi.advanceTimersByTimeAsync(25);
        await expect(writePromise).resolves.toEqual({
            name: "ARMING_CHECK",
            value: 0,
            param_type: "uint8",
            index: 0,
        });

        const live = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "live" });
        expect(live.param_store.params.ARMING_CHECK).toEqual({
            name: "ARMING_CHECK",
            value: 0,
            param_type: "uint8",
            index: 0,
        });
    });

    it("parses .param files with the same frontend-shaped response contract as native", async () => {
        await expect(invokeMockCommand<Record<string, number>>("param_parse_file", {
            contents: "# comment\nFS_THR_ENABLE,2\nARMING_CHECK,1\n",
        })).resolves.toEqual({
            FS_THR_ENABLE: 2,
            ARMING_CHECK: 1,
        });

        await expect(invokeMockCommand<Record<string, number>>("param_parse_file", {
            contents: "",
        })).resolves.toEqual({});
    });

    it("formats the provided param snapshot alphabetically for expert export parity", async () => {
        await expect(invokeMockCommand<string>("param_format_file", {
            store: {
                expected_count: 2,
                params: {
                    ZEBRA: { name: "ZEBRA", value: 1, param_type: "real32", index: 1 },
                    ALPHA: { name: "ALPHA", value: 2, param_type: "uint32", index: 0 },
                },
            },
        })).resolves.toBe("ALPHA,2\nZEBRA,1\n");
    });

    it("rejects malformed parse and format payloads loudly instead of masking mock drift", async () => {
        await expect(invokeMockCommand("param_parse_file", {})).rejects.toThrow(
            "missing or invalid param_parse_file.contents",
        );
        await expect(invokeMockCommand("param_parse_file", {
            contents: "ARMING_CHECK",
        })).rejects.toThrow("line 1: expected NAME,VALUE");
        await expect(invokeMockCommand("param_parse_file", {
            contents: "ARMING_CHECK,not-a-number",
        })).rejects.toThrow("line 1: invalid value 'not-a-number'");

        await expect(invokeMockCommand("param_format_file", {})).rejects.toThrow(
            "missing or invalid param_format_file.store",
        );
        await expect(invokeMockCommand("param_format_file", {
            store: {
                expected_count: 1,
                params: {
                    ARMING_CHECK: { name: "ARMING_CHECK", value: 1, param_type: "bogus", index: 0 },
                },
            },
        })).rejects.toThrow("missing or invalid param_format_file.store.params.ARMING_CHECK.param_type");
    });
});

describe("mock firmware backend parity", () => {
    beforeEach(() => {
        getMockPlatformController().reset();
    });

    const expectedPorts: PortInfo[] = [
        {
            port_name: "/dev/ttyACM0",
            vid: null,
            pid: null,
            serial_number: null,
            manufacturer: "Hex",
            product: null,
            location: null,
        },
    ];

    const serialReadinessRequest: SerialReadinessRequest = {
        port: "/dev/ttyACM0",
        source: { kind: "catalog_url", url: "https://example.com/cubeorange-copter.apj" },
        options: { full_chip_erase: false },
    };

    it("implements the firmware commands used by the standalone tab with frontend-shaped responses", async () => {
        const preflight = await invokeMockCommand<SerialPreflightInfo>("firmware_serial_preflight");
        expect(preflight).toEqual({
            vehicle_connected: false,
            param_count: 0,
            has_params_to_backup: false,
            available_ports: expectedPorts,
            detected_board_id: null,
            session_ready: true,
            session_status: { kind: "idle" },
        });

        await expect(invokeMockCommand("firmware_session_status")).resolves.toEqual({ kind: "idle" });
        await expect(invokeMockCommand("firmware_session_clear_completed")).resolves.toBeUndefined();

        const ports = await invokeMockCommand<InventoryResult>("firmware_list_ports");
        expect(ports).toEqual({ kind: "available", ports: expectedPorts });

        const dfuDevices = await invokeMockCommand<DfuScanResult>("firmware_list_dfu_devices");
        expect(dfuDevices).toEqual({
            kind: "available",
            devices: [
                {
                    vid: 0x0483,
                    pid: 0xdf11,
                    unique_id: "mock-dfu-1",
                    serial_number: "DFU0001",
                    manufacturer: "STMicroelectronics",
                    product: "STM32 BOOTLOADER",
                },
            ],
        });

        const targets = await invokeMockCommand<CatalogTargetSummary[]>("firmware_catalog_targets");
        expect(targets).toEqual([
            {
                board_id: 140,
                platform: "CubeOrange",
                brand_name: "Cube Orange",
                manufacturer: "Hex",
                vehicle_types: ["Copter", "Plane"],
                latest_version: "4.5.0",
            },
            {
                board_id: 9,
                platform: "fmuv2",
                brand_name: null,
                manufacturer: null,
                vehicle_types: ["Plane"],
                latest_version: "4.4.0",
            },
        ]);

        const recoveryTargets = await invokeMockCommand<CatalogTargetSummary[]>("firmware_recovery_catalog_targets");
        expect(recoveryTargets).toEqual([
            {
                board_id: 140,
                platform: "CubeOrange",
                brand_name: "Cube Orange",
                manufacturer: "Hex",
                vehicle_types: ["Copter", "Plane"],
                latest_version: "4.5.0",
            },
        ]);

        const entries = await invokeMockCommand<CatalogEntry[]>("firmware_catalog_entries", {
            boardId: 140,
            platform: "CubeOrange",
        });
        expect(entries).toEqual([
            {
                board_id: 140,
                platform: "CubeOrange",
                vehicle_type: "Copter",
                version: "4.5.0",
                version_type: "stable",
                format: "apj",
                url: "https://example.com/cubeorange-copter.apj",
                image_size: 123_456,
                latest: true,
                git_sha: "abc1234",
                brand_name: "Cube Orange",
                manufacturer: "Hex",
            },
            {
                board_id: 140,
                platform: "CubeOrange",
                vehicle_type: "Plane",
                version: "4.5.0",
                version_type: "stable",
                format: "apj",
                url: "https://example.com/cubeorange-plane.apj",
                image_size: 123_400,
                latest: false,
                git_sha: "abc5678",
                brand_name: "Cube Orange",
                manufacturer: "Hex",
            },
        ]);

        const readiness = await invokeMockCommand("firmware_serial_readiness", {
            request: serialReadinessRequest,
        });
        expect(readiness).toEqual({
            request_token: "serial-readiness:port=/dev/ttyACM0:source_kind=catalog_url:source_identity=41-c7f40b36334f961c:full_chip_erase=0",
            session_status: { kind: "idle" },
            readiness: { kind: "advisory" },
            target_hint: null,
            validation_pending: true,
            bootloader_transition: { kind: "manual_bootloader_entry_required" },
        });

        const serialResult = await invokeMockCommand<SerialFlowResult>("firmware_flash_serial", {
            request: {
                port: "/dev/ttyACM0",
                baud: 115200,
                source: { kind: "catalog_url", url: "https://example.com/cubeorange-copter.apj" },
                options: { full_chip_erase: false },
            },
        });
        expect(serialResult).toEqual({
            result: "verified",
            board_id: 140,
            bootloader_rev: 5,
            port: "/dev/ttyACM0",
        });

        const localSerialResult = await invokeMockCommand<SerialFlowResult>("firmware_flash_serial", {
            request: {
                port: "/dev/ttyACM0",
                baud: 115200,
                source: {
                    kind: "local_apj_bytes",
                    data: [1, 2, 3, 4],
                    fileName: "cube-custom.apj",
                    byteLength: 4,
                    digest: "be7a5e775165785d",
                },
                options: { full_chip_erase: false },
            },
        });
        expect(localSerialResult).toEqual({
            result: "verified",
            board_id: 140,
            bootloader_rev: 5,
            port: "/dev/ttyACM0",
        });

        const dfuResult = await invokeMockCommand<DfuRecoveryResult>("firmware_flash_dfu_recovery", {
            request: {
                device: {
                    vid: 0x0483,
                    pid: 0xdf11,
                    unique_id: "mock-dfu-1",
                    serial_number: "DFU0001",
                    manufacturer: "STMicroelectronics",
                    product: "STM32 BOOTLOADER",
                },
                source: { kind: "official_bootloader", board_target: "CubeOrange" },
            },
        });
        expect(dfuResult).toEqual({ result: "verified" });

        const localDfuResult = await invokeMockCommand<DfuRecoveryResult>("firmware_flash_dfu_recovery", {
            request: {
                device: {
                    vid: 0x0483,
                    pid: 0xdf11,
                    unique_id: "mock-dfu-1",
                    serial_number: "DFU0001",
                    manufacturer: "STMicroelectronics",
                    product: "STM32 BOOTLOADER",
                },
                source: { kind: "local_bin_bytes", data: [9, 8, 7, 6] },
            },
        });
        expect(localDfuResult).toEqual({ result: "verified" });
    });

    it("returns blocked serial readiness states instead of inventing usable defaults", async () => {
        await expect(invokeMockCommand("firmware_serial_readiness", {
            request: {
                port: "",
                source: { kind: "catalog_url", url: "" },
                options: { full_chip_erase: false },
            },
        })).resolves.toMatchObject({ readiness: { kind: "blocked", reason: "port_unselected" } });

        await expect(invokeMockCommand("firmware_serial_readiness", {
            request: {
                port: "/dev/ttyUSB9",
                source: { kind: "catalog_url", url: "https://example.com/cubeorange-copter.apj" },
                options: { full_chip_erase: false },
            },
        })).resolves.toMatchObject({ readiness: { kind: "blocked", reason: "port_unavailable" } });

        await expect(invokeMockCommand("firmware_serial_readiness", {
            request: {
                port: "/dev/ttyACM0",
                source: { kind: "catalog_url", url: "" },
                options: { full_chip_erase: false },
            },
        })).resolves.toMatchObject({ readiness: { kind: "blocked", reason: "source_missing" } });
    });

    it("rejects malformed firmware command payloads loudly", async () => {
        await expect(invokeMockCommand("firmware_catalog_entries", {})).rejects.toThrow(
            "missing or invalid firmware_catalog_entries.boardId",
        );
        await expect(invokeMockCommand("firmware_serial_readiness", {})).rejects.toThrow(
            "missing or invalid firmware_serial_readiness.request",
        );
        await expect(invokeMockCommand("firmware_flash_serial", {
            request: { baud: 115200, source: { kind: "catalog_url", url: "https://example.com/cubeorange-copter.apj" } },
        })).rejects.toThrow("missing or invalid firmware_flash_serial.request.port");
        await expect(invokeMockCommand("firmware_flash_serial", {
            request: {
                port: "/dev/ttyACM0",
                baud: 115200,
                source: { kind: "local_apj_bytes", data: "bad-payload" },
                options: { full_chip_erase: false },
            },
        })).rejects.toThrow("missing or invalid firmware_flash_serial.request.source.data");
        await expect(invokeMockCommand("firmware_flash_dfu_recovery", {
            request: {
                device: {
                    vid: 0x0483,
                    pid: 0xdf11,
                    unique_id: "",
                    serial_number: "DFU0001",
                    manufacturer: "STMicroelectronics",
                    product: "STM32 BOOTLOADER",
                },
                source: { kind: "official_bootloader", board_target: "CubeOrange" },
            },
        })).rejects.toThrow("missing or invalid firmware_flash_dfu_recovery.request.device.unique_id");
        await expect(invokeMockCommand("firmware_flash_dfu_recovery", {
            request: {
                device: {
                    vid: 0x0483,
                    pid: 0xdf11,
                    unique_id: "mock-dfu-1",
                    serial_number: "DFU0001",
                    manufacturer: "STMicroelectronics",
                    product: "STM32 BOOTLOADER",
                },
                source: { kind: "local_bin_bytes", data: "bad-payload" },
            },
        })).rejects.toThrow("missing or invalid firmware_flash_dfu_recovery.request.source.data");
    });

    it("keeps mock message-rate defaults aligned with the Rust command catalog", async () => {
        const rustCatalog = readRustMessageRateCatalog();

        await expect(invokeMockCommand("get_available_message_rates")).resolves.toEqual(rustCatalog);
    });

    it("matches Rust telemetry and message-rate validation semantics", async () => {
        const limits = readRustRateLimits();

        await expect(invokeMockCommand("set_telemetry_rate", { rateHz: limits.telemetryRate.min - 1 })).rejects.toThrow(
            "rate_hz must be between 1 and 20",
        );
        await expect(invokeMockCommand("set_telemetry_rate", { rateHz: limits.telemetryRate.max + 1 })).rejects.toThrow(
            "rate_hz must be between 1 and 20",
        );

        await expect(invokeMockCommand("set_message_rate", { messageId: 33, rateHz: 4 })).rejects.toThrow(
            "not connected",
        );

        await invokeMockCommand("connect_link", {
            request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" } },
        });

        await expect(
            invokeMockCommand("set_message_rate", { messageId: 33, rateHz: limits.messageRate.min - 0.1 }),
        ).rejects.toThrow("rate_hz must be between 0.1 and 50.0");
        await expect(
            invokeMockCommand("set_message_rate", { messageId: 33, rateHz: limits.messageRate.max + 0.1 }),
        ).rejects.toThrow("rate_hz must be between 0.1 and 50.0");
        await expect(invokeMockCommand("set_message_rate", { messageId: 33, rateHz: 4 })).resolves.toBeUndefined();
    });

    it("rejects malformed telemetry settings payloads loudly", async () => {
        await expect(invokeMockCommand("set_telemetry_rate", {})).rejects.toThrow(
            "missing or invalid set_telemetry_rate.rateHz",
        );
        await expect(invokeMockCommand("set_message_rate", { rateHz: 4 })).rejects.toThrow(
            "not connected",
        );

        await invokeMockCommand("connect_link", {
            request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" } },
        });

        await expect(invokeMockCommand("set_message_rate", { rateHz: 4 })).rejects.toThrow(
            "missing or invalid set_message_rate.messageId",
        );
        await expect(invokeMockCommand("set_message_rate", { messageId: 33, rateHz: "fast" })).rejects.toThrow(
            "missing or invalid set_message_rate.rateHz",
        );
    });

    it("does not let overridden settings commands bypass native-like validation", async () => {
        const controller = getMockPlatformController();
        controller.setCommandBehavior("set_message_rate", { type: "defer" });

        await expect(invokeMockCommand("set_message_rate", { messageId: 33, rateHz: 4 })).rejects.toThrow(
            "not connected",
        );
        expect(controller.resolveDeferred("set_message_rate")).toBe(false);

        await invokeMockCommand("connect_link", {
            request: { transport: { kind: "udp", bind_addr: "0.0.0.0:14550" } },
        });

        const pending = invokeMockCommand("set_message_rate", { messageId: 33, rateHz: 4 });
        expect(controller.resolveDeferred("set_message_rate")).toBe(true);
        await expect(pending).resolves.toBeUndefined();
    });

    it("surfaces rejected firmware starts without papering over controller overrides", async () => {
        const controller = getMockPlatformController();
        controller.setCommandBehavior("firmware_flash_serial", {
            type: "reject",
            error: "serial bootloader handshake failed",
        });

        await expect(invokeMockCommand("firmware_flash_serial", {
            request: {
                port: "/dev/ttyACM0",
                baud: 115200,
                source: { kind: "catalog_url", url: "https://example.com/cubeorange-copter.apj" },
                options: { full_chip_erase: false },
            },
        })).rejects.toBe("serial bootloader handshake failed");
    });

    it("exposes deterministic log catalog seeding for ready, missing, and corrupt tlog/bin entries", async () => {
        const controller = getMockPlatformController();

        const defaultCatalog = await invokeMockCommand<LogLibraryCatalog>("log_library_list");
        expect(defaultCatalog.entries.map((entry) => `${entry.status}:${entry.metadata.format}`)).toEqual([
            "ready:tlog",
            "ready:bin",
            "missing:tlog",
            "corrupt:bin",
        ]);

        const seededPresets: MockLogSeedPreset[] = [
            "ready_tlog",
            "ready_bin",
            "missing_tlog",
            "missing_bin",
            "corrupt_tlog",
            "corrupt_bin",
        ];
        const seededCatalog = controller.seedLogLibrary(seededPresets);
        expect(seededCatalog.entries.map((entry) => `${entry.status}:${entry.metadata.format}`)).toEqual([
            "ready:tlog",
            "ready:bin",
            "missing:tlog",
            "missing:bin",
            "corrupt:tlog",
            "corrupt:bin",
        ]);

        const corruptTlog = controller.getSeededLogEntry("corrupt_tlog");
        expect(corruptTlog.status).toBe("corrupt");
        expect(corruptTlog.metadata.format).toBe("tlog");
        expect(corruptTlog.diagnostics[0]?.code).toBe("invalid_crc");
    });

    it("returns deterministic log pages and emits log progress for exports", async () => {
        const seenProgress: LogProgress[] = [];
        const unlisten = listenMockEvent("log://progress", (payload) => {
            seenProgress.push(payload as LogProgress);
        });

        await invokeMockCommand("log_open", { path: "/mock/logs/flight-001.tlog" });

        const rawPage = await invokeMockCommand<RawMessagePage>("log_raw_messages_query", {
            request: {
                entry_id: "log-2026-05-08-001",
                cursor: null,
                start_usec: null,
                end_usec: null,
                message_types: ["GLOBAL_POSITION_INT"],
                limit: 100,
            },
        });
        const chartPage = await invokeMockCommand<ChartSeriesPage>("log_chart_series_query", {
            request: {
                entry_id: "log-2026-05-08-001",
                selectors: [{ message_type: "VFR_HUD", field: "alt", label: "Altitude", unit: "m" }],
                start_usec: null,
                end_usec: null,
                max_points: 500,
            },
        });
        const exportResult = await invokeMockCommand<LogExportResult>("log_export", {
            request: {
                entry_id: "log-2026-05-08-001",
                instance_id: "export-1",
                format: "csv",
                destination_path: "/tmp/flight-001.csv",
                start_usec: null,
                end_usec: null,
                message_types: [],
            },
        });
        const csvRows = await invokeMockCommand<number>("log_export_csv", { path: "/tmp/flight-001.csv" });
        unlisten();

        expect(rawPage.entry_id).toBe("log-2026-05-08-001");
        expect(rawPage.items[0]?.message_type).toBe("GLOBAL_POSITION_INT");
        expect(chartPage.entry_id).toBe("log-2026-05-08-001");
        expect(chartPage.series[0]?.selector.message_type).toBe("VFR_HUD");
        expect(exportResult).toEqual({
            operation_id: "log_export",
            destination_path: "/tmp/flight-001.csv",
            bytes_written: 4096,
            rows_written: 42,
            diagnostics: [],
        });
        expect(csvRows).toBe(2400);
        expect(seenProgress.map((event) => `${event.operation_id}:${event.phase}`)).toEqual([
            "log_open:queued",
            "log_open:parsing",
            "log_open:parsing",
            "log_open:indexing",
            "log_open:completed",
            "log_export:exporting",
            "log_export:completed",
            "log_export:completed",
        ]);
        expect(seenProgress.filter((event) => event.instance_id !== null).every((event) => event.instance_id === "export-1")).toBe(true);
    });

    it("rejects non-csv log exports to match the native backend", async () => {
        await expect(invokeMockCommand("log_export", {
            request: {
                entry_id: "log-2026-05-08-001",
                instance_id: "export-unsupported",
                format: "kmz",
                destination_path: "/tmp/flight-001.kmz",
                start_usec: null,
                end_usec: null,
                message_types: [],
                text: null,
                field_filters: [],
            } as any,
        })).rejects.toThrow("log export format kmz is not implemented yet");
    });

    it("honors requested chart selectors for seeded tlog and bin fixtures", async () => {
        const tlogChartPage = await invokeMockCommand<ChartSeriesPage>("log_chart_series_query", {
            request: {
                entry_id: "log-2026-05-08-001",
                selectors: [
                    { message_type: "ATTITUDE", field: "roll", label: "Roll", unit: "rad" },
                    { message_type: "ATTITUDE", field: "pitch", label: "Pitch", unit: "rad" },
                    { message_type: "SYS_STATUS", field: "voltage_battery", label: "Voltage", unit: "mV" },
                ],
                start_usec: null,
                end_usec: null,
                max_points: 500,
            },
        });

        const binChartPage = await invokeMockCommand<ChartSeriesPage>("log_chart_series_query", {
            request: {
                entry_id: "log-2026-05-08-002",
                selectors: [
                    { message_type: "ATT", field: "Roll", label: "Roll", unit: "deg" },
                    { message_type: "CTUN", field: "Alt", label: "Altitude", unit: "m" },
                    { message_type: "BAT", field: "Volt", label: "Voltage", unit: "V" },
                ],
                start_usec: null,
                end_usec: null,
                max_points: 500,
            },
        });

        expect(tlogChartPage.series.map((series) => `${series.selector.message_type}.${series.selector.field}`)).toEqual([
            "ATTITUDE.roll",
            "ATTITUDE.pitch",
            "SYS_STATUS.voltage_battery",
        ]);
        expect(tlogChartPage.series.every((series) => series.points.length > 0)).toBe(true);

        expect(binChartPage.series.map((series) => `${series.selector.message_type}.${series.selector.field}`)).toEqual([
            "ATT.Roll",
            "CTUN.Alt",
            "BAT.Volt",
        ]);
        expect(binChartPage.series.every((series) => series.points.length > 0)).toBe(true);
    });

    it("emits native-like log progress phases when opening a seeded log", async () => {
        const seenProgress: LogProgress[] = [];
        const unlisten = listenMockEvent("log://progress", (payload) => {
            seenProgress.push(payload as LogProgress);
        });

        const summary = await invokeMockCommand<any>("log_open", { path: "/mock/logs/flight-001.tlog" });
        unlisten();

        expect(summary.total_entries).toBe(2400);
        expect(seenProgress.map((event) => `${event.operation_id}:${event.phase}:${event.completed_items}`)).toEqual([
            "log_open:queued:0",
            "log_open:parsing:0",
            "log_open:parsing:2400",
            "log_open:indexing:2400",
            "log_open:completed:2400",
        ]);
    });

    it("keeps mock log library list/relink/reindex/remove/cancel aligned with the native command surface", async () => {
        const controller = getMockPlatformController();
        controller.seedLogLibrary(["missing_tlog", "ready_bin"]);

        const listed = await invokeMockCommand<LogLibraryCatalog>("log_library_list");
        expect(listed.entries.map((entry) => entry.status)).toEqual(["missing", "ready"]);

        const relinked = await invokeMockCommand<any>("log_library_relink", {
            entryId: listed.entries[0]?.entry_id,
            path: "/mock/logs/flight-002.bin",
        });
        expect(relinked.status).toBe("stale");
        expect(relinked.diagnostics.some((diagnostic: { code: string }) => diagnostic.code === "relink_requires_reindex")).toBe(true);

        const reindexed = await invokeMockCommand<any>("log_library_reindex", {
            entryId: listed.entries[0]?.entry_id,
        });
        expect(reindexed.status).toBe("ready");

        const removed = await invokeMockCommand<LogLibraryCatalog>("log_library_remove", {
            entryId: listed.entries[0]?.entry_id,
        });
        expect(removed.entries.find((entry) => entry.entry_id === listed.entries[0]?.entry_id)).toBeUndefined();

        await expect(invokeMockCommand<boolean>("log_library_cancel")).resolves.toBe(false);

        controller.setCommandBehavior("log_library_cancel", { type: "defer" });
        const activeCancel = invokeMockCommand<boolean>("log_library_cancel");
        expect(controller.resolveDeferred("log_library_cancel", true)).toBe(true);
        await expect(activeCancel).resolves.toBe(true);
        controller.clearCommandBehavior("log_library_cancel");
    });

    it("rejects malformed mock log library relink and reindex requests loudly", async () => {
        await expect(invokeMockCommand("log_library_relink", { entryId: 42, path: "/mock/logs/flight-002.bin" })).rejects.toThrow(
            "missing or invalid log_library_relink.entryId",
        );
        await expect(invokeMockCommand("log_library_relink", { entryId: "entry-1", path: 42 })).rejects.toThrow(
            "missing or invalid log_library_relink.path",
        );
        await expect(invokeMockCommand("log_library_reindex", { entryId: 42 })).rejects.toThrow(
            "missing or invalid log_library_reindex.entryId",
        );
    });

    it("rejects opening seeded missing and corrupt mock logs", async () => {
        const controller = getMockPlatformController();
        controller.seedLogLibrary(["missing_tlog", "corrupt_bin", "ready_tlog"]);

        await expect(invokeMockCommand("log_open", { path: "/mock/missing/missing-flight.tlog" })).rejects.toThrow(
            "mock log is missing: /mock/missing/missing-flight.tlog",
        );
        await expect(invokeMockCommand("log_open", { path: "/mock/logs/corrupt-flight.bin" })).rejects.toThrow(
            "mock log is corrupt: /mock/logs/corrupt-flight.bin",
        );
    });

    it("registers a mock log library entry from the browser picker harness", async () => {
        const controller = getMockPlatformController();
        const pickerFile = controller.getSeededLogPickerFile("ready_tlog");
        const showOpenFilePicker = vi.fn(async () => [{
            getFile: async () => new File([new Uint8Array(pickerFile.bytes)], pickerFile.name, { type: pickerFile.type }),
        }]);
        vi.stubGlobal("showOpenFilePicker", showOpenFilePicker);

        const entry = await invokeMockCommand<any>("log_library_register_open_file");

        expect(showOpenFilePicker).toHaveBeenCalledTimes(1);
        expect(entry.metadata.display_name).toBe(pickerFile.name);
        expect(entry.source.original_path).toContain(pickerFile.name);
    });

    it("emits playback state with replay metadata after mock log seek", async () => {
        await invokeMockCommand("log_open", { path: "/mock/logs/flight-001.tlog" });
        const playback = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "playback" });
        await invokeMockCommand("ack_session_snapshot", {
            sessionId: playback.envelope.session_id,
            seekEpoch: playback.envelope.seek_epoch,
            resetRevision: playback.envelope.reset_revision,
        });

        let playbackEvent: { envelope: OpenSessionSnapshot["envelope"]; value: PlaybackStateSnapshot } | null = null;
        let telemetryEvent: { envelope: OpenSessionSnapshot["envelope"]; value: OpenSessionSnapshot["telemetry"] } | null = null;
        const unlisteners = [
            listenMockEvent("playback://state", (payload) => {
                playbackEvent = payload as { envelope: OpenSessionSnapshot["envelope"]; value: PlaybackStateSnapshot };
            }),
            listenMockEvent("telemetry://state", (payload) => {
                telemetryEvent = payload as { envelope: OpenSessionSnapshot["envelope"]; value: OpenSessionSnapshot["telemetry"] };
            }),
        ];

        await invokeMockCommand("playback_seek", { cursorUsec: 42000000 });
        unlisteners.forEach((unlisten) => unlisten());

        expect(playbackEvent).not.toBeNull();
        expect(telemetryEvent).not.toBeNull();
        if (!playbackEvent || !telemetryEvent) {
            throw new Error("expected playback and telemetry events");
        }
        const playbackPayload = playbackEvent as any;
        const telemetryPayload = telemetryEvent as any;

        expect(playbackPayload.value).toMatchObject({
            status: "seeking",
            entry_id: "log-2026-05-08-001",
            operation_id: "replay_seek",
            cursor_usec: 42000000,
            start_usec: 1000000,
            end_usec: 61000000,
            duration_secs: 60,
            speed: 1,
            available_speeds: [0.5, 1, 2, 4, 8, 16],
            barrier_ready: true,
            readonly: true,
            diagnostic: null,
        });
        expect(telemetryPayload.value.value?.flight?.altitude_m).toBe(12.3);
        expect(telemetryPayload.value.value?.navigation?.latitude_deg).toBeCloseTo(47.397782, 6);
    });

    it("supports playback play pause speed and stop parity", async () => {
        await invokeMockCommand("log_open", { path: "/mock/logs/flight-001.tlog" });
        const playback = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "playback" });
        await invokeMockCommand("ack_session_snapshot", {
            sessionId: playback.envelope.session_id,
            seekEpoch: playback.envelope.seek_epoch,
            resetRevision: playback.envelope.reset_revision,
        });

        const playing = await invokeMockCommand<PlaybackStateSnapshot>("playback_play");
        expect(playing).toMatchObject({
            status: "playing",
            operation_id: "replay_play",
            cursor_usec: 1000000,
            speed: 1,
        });

        const faster = await invokeMockCommand<PlaybackStateSnapshot>("playback_set_speed", { speed: 4 });
        expect(faster).toMatchObject({
            status: "playing",
            operation_id: "replay_set_speed",
            speed: 4,
        });

        const paused = await invokeMockCommand<PlaybackStateSnapshot>("playback_pause");
        expect(paused).toMatchObject({
            status: "paused",
            operation_id: "replay_pause",
            speed: 4,
        });

        const stopped = await invokeMockCommand<PlaybackStateSnapshot>("playback_stop");
        expect(stopped).toMatchObject({
            status: "idle",
            operation_id: null,
            cursor_usec: null,
        });

        await expect(invokeMockCommand("playback_play")).rejects.toThrow("no log open");
    });

    it("clamps playback seek cursor to seeded log bounds like native", async () => {
        await invokeMockCommand("log_open", { path: "/mock/logs/flight-001.tlog" });
        const playback = await invokeMockCommand<any>("open_session_snapshot", { sourceKind: "playback" });
        await invokeMockCommand("ack_session_snapshot", {
            sessionId: playback.envelope.session_id,
            seekEpoch: playback.envelope.seek_epoch,
            resetRevision: playback.envelope.reset_revision,
        });

        await expect(invokeMockCommand<any>("playback_seek", { cursorUsec: 0 })).resolves.toMatchObject({
            cursor_usec: 1000000,
        });
        await expect(invokeMockCommand<any>("playback_seek", { cursorUsec: 999999999 })).resolves.toMatchObject({
            cursor_usec: 61000000,
        });
    });

    it("tracks recording settings and status through mock commands and controller setters", async () => {
        const controller = getMockPlatformController();

        const initialSettings = await invokeMockCommand<RecordingSettingsResult>("recording_settings_read");
        expect(initialSettings.operation_id).toBe("recording_settings_read");
        expect(initialSettings.settings).toEqual({
            auto_record_on_connect: false,
            auto_record_directory: "/mock-app-data/logs/recordings",
            filename_template: "YYYY-MM-DD_HH-MM-SS_{vehicle-or-sysid-or-unknown}.tlog",
            add_completed_recordings_to_library: true,
        });

        const savedSettings = await invokeMockCommand<RecordingSettingsResult>("recording_settings_write", {
            settings: {
                auto_record_on_connect: false,
                auto_record_directory: "/tmp/recordings",
                filename_template: "{date}_{vehicle}.tlog",
                add_completed_recordings_to_library: true,
            },
        });
        expect(savedSettings).toEqual({
            operation_id: "recording_settings_write",
            settings: {
                auto_record_on_connect: false,
                auto_record_directory: "/mock-app-data/logs/recordings",
                filename_template: "YYYY-MM-DD_HH-MM-SS_{vehicle-or-sysid-or-unknown}.tlog",
                add_completed_recordings_to_library: true,
            },
        });

        await expect(invokeMockCommand<string>("recording_start", { path: "/tmp/recordings/flight-010.tlog" })).resolves.toBe(
            "/tmp/recordings/flight-010.tlog",
        );
        await expect(invokeMockCommand<RecordingStatus>("recording_status")).resolves.toEqual({
            kind: "recording",
            operation_id: "recording_start",
            mode: "manual",
            file_name: "flight-010.tlog",
            destination_path: "/tmp/recordings/flight-010.tlog",
            bytes_written: 2048,
            started_at_unix_msec: 1778246400000,
        });

        await expect(invokeMockCommand("recording_stop")).resolves.toBeUndefined();
        await expect(invokeMockCommand<RecordingStatus>("recording_status")).resolves.toEqual({ kind: "idle" });

        const catalogAfterStop = await invokeMockCommand<LogLibraryCatalog>("log_library_list");
        const addedRecording = catalogAfterStop.entries.find((entry) => entry.source.original_path === "/tmp/recordings/flight-010.tlog");
        expect(addedRecording).toMatchObject({
            status: "ready",
            metadata: {
                display_name: "flight-010.tlog",
                format: "tlog",
            },
        });
        expect(addedRecording?.diagnostics[0]?.source).toBe("recording");

        const failedStatus = controller.setRecordingStatus({
            kind: "failed",
            failure: {
                operation_id: "recording_start",
                reason: { kind: "failed", message: "disk full" },
            },
        });
        expect(failedStatus.kind).toBe("failed");
        if (failedStatus.kind !== "failed") {
            throw new Error("expected failed recording status");
        }
        expect(failedStatus.failure.reason.message).toBe("disk full");
    });
});
