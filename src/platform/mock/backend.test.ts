// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MissionState, TransferProgress } from "../../mission";
import type { ParamProgress, ParamStore } from "../../params";
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

import { getMockPlatformController, invokeMockCommand, listenMockEvent } from "./backend";

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

describe("mock guided backend parity", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
    expect(telemetryValue.value.flight.altitude_m).toBeNull();
    expect(telemetryValue.value.attitude.roll_deg).toBeNull();
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
      cursor_usec: 789,
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
});
