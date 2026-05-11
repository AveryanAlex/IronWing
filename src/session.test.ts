import { describe, expect, it } from "vitest";
import { OPERATION_IDS, type AckSessionSnapshotResult, type OperationFailure } from "./session";

describe("session contract", () => {
  it("keeps TypeScript operation ids aligned with the Rust IPC contract", () => {
    expect(OPERATION_IDS).toEqual([
      "open_session_snapshot",
      "ack_session_snapshot",
      "arm_vehicle",
      "disarm_vehicle",
      "set_flight_mode",
      "vehicle_takeoff",
      "start_guided_session",
      "update_guided_session",
      "stop_guided_session",
      "set_message_rate",
      "mission_upload",
      "mission_download",
      "mission_clear",
      "fence_upload",
      "fence_download",
      "fence_clear",
      "rally_upload",
      "rally_download",
      "rally_clear",
      "mission_set_current",
      "calibrate_accel",
      "calibrate_gyro",
      "param_write",
      "param_write_batch",
      "reboot_vehicle",
      "motor_test",
      "set_servo",
      "rc_override",
      "calibrate_compass_start",
      "calibrate_compass_accept",
      "calibrate_compass_cancel",
      "request_prearm_checks",
      "log_open",
      "log_library_list",
      "log_library_register",
      "log_library_relink",
      "log_library_remove",
      "log_library_reindex",
      "log_library_cancel",
      "log_raw_messages_query",
      "log_chart_series_query",
      "log_export",
      "replay_open",
      "replay_play",
      "replay_pause",
      "replay_seek",
      "replay_set_speed",
      "replay_stop",
      "recording_start",
      "recording_stop",
      "recording_status",
      "recording_settings_read",
      "recording_settings_write",
      "firmware_flash_serial",
      "firmware_flash_dfu_recovery",
    ]);
  });

  it("preserves typed ack rejection reasons and operation identity", () => {
    const value: AckSessionSnapshotResult = {
      result: "rejected",
      failure: {
        operation_id: "ack_session_snapshot",
        reason: {
          kind: "conflict",
          message: "session snapshot mismatch",
        },
      },
    };

    if (value.result !== "rejected") {
      throw new Error("expected rejected ack result");
    }

    expect(value.failure.operation_id).toBe("ack_session_snapshot");
    expect(value.failure.reason.kind).toBe("conflict");
  });

  it("accepts the expanded operation failures exposed by the Rust IPC boundary", () => {
    const failures: OperationFailure[] = [
      { operation_id: "arm_vehicle", reason: { kind: "failed", message: "arm rejected" } },
      { operation_id: "mission_upload", reason: { kind: "conflict", message: "transfer active" } },
      { operation_id: "param_write_batch", reason: { kind: "invalid_input", message: "param blocked" } },
      { operation_id: "firmware_flash_serial", reason: { kind: "unavailable", message: "port busy" } },
    ];

    expect(failures.map((failure) => failure.operation_id)).toEqual([
      "arm_vehicle",
      "mission_upload",
      "param_write_batch",
      "firmware_flash_serial",
    ]);
  });
});
