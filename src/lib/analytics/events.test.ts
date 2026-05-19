import { describe, expect, it } from "vitest";
import { normalizeAnalyticsProperties } from "./events";

describe("normalizeAnalyticsProperties", () => {
  it("keeps only finite string and number properties with safe keys", () => {
    expect(
      normalizeAnalyticsProperties({
        transport: " tcp ",
        attempt_count: 2,
        badBool: true,
        bad_nan: Number.NaN,
        bad_object: { value: "udp" },
        "bad-key": "udp",
        empty: "   ",
      }),
    ).toEqual({
      transport: "tcp",
      attempt_count: 2,
    });
  });

  it("clamps long string values", () => {
    const normalized = normalizeAnalyticsProperties({ reason: "x".repeat(160) });

    expect(normalized.reason).toHaveLength(120);
  });

  it("limits the number of emitted properties", () => {
    const props = Object.fromEntries(Array.from({ length: 24 }, (_, index) => [`prop_${index}`, index]));

    expect(Object.keys(normalizeAnalyticsProperties(props))).toHaveLength(16);
  });
});
