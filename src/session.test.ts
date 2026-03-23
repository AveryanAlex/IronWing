import { describe, expect, it } from "vitest";
import type { AckSessionSnapshotResult } from "./session";

describe("session contract", () => {
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
});
