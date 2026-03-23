import { describe, expect, it } from "vitest";

import { describeGuidedCommandRejection } from "./MapPanel";

describe("describeGuidedCommandRejection", () => {
  it("returns null for accepted results", () => {
    expect(describeGuidedCommandRejection({
      result: "accepted",
      state: { available: false, complete: false, provenance: "stream", value: null },
    })).toBeNull();
  });

  it("surfaces typed guided rejection messages", () => {
    expect(describeGuidedCommandRejection({
      result: "rejected",
      failure: {
        operation_id: "start_guided_session",
        reason: { kind: "unsupported", message: "explicit guided stop is not supported" },
        retryable: false,
        fatality_scope: "operation",
        detail: null,
      },
    })).toBe("explicit guided stop is not supported");
  });
});
