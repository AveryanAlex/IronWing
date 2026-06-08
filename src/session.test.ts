import { describe, expect, it } from "vitest";
import { OPERATION_IDS, type AckSessionSnapshotResult, type OperationFailure } from "./session";

describe("session contract", () => {
  it("exposes operation ids generated from the Rust IPC contract", () => {
    expect(new Set(OPERATION_IDS).size).toBe(OPERATION_IDS.length);
    expect(OPERATION_IDS).toEqual(expect.arrayContaining([
      "open_session_snapshot",
      "ack_session_snapshot",
      "mission_cancel",
      "param_download_all",
      "param_cancel",
      "firmware_install_update",
      "firmware_bootloader_installation",
    ]));
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
      { operation_id: "firmware_install_update", reason: { kind: "unavailable", message: "port busy" } },
    ];

    expect(failures.map((failure) => failure.operation_id)).toEqual([
      "arm_vehicle",
      "mission_upload",
      "param_write_batch",
      "firmware_install_update",
    ]);
  });
});
