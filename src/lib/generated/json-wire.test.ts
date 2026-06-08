import { describe, expect, it } from "vitest";

import type { ChartPoint, FirmwareProgress, MissionState, Param } from "./ironwing-json";

describe("json-safe generated aliases", () => {
  it("preserves nullable fields that exist in generated contracts", () => {
    const param: Param = { name: "TEST", value: null, param_type: "real32", index: 0 };
    const firmware: FirmwareProgress = { phase_label: "idle", bytes_written: 0, bytes_total: 0, pct: null };
    const point: ChartPoint = { timestamp_usec: 1, value: null };

    expect(param.value).toBeNull();
    expect(firmware.pct).toBeNull();
    expect(point.value).toBeNull();
  });

  it("uses generated mission sync and operation variants", () => {
    const state: MissionState = {
      plan: null,
      current_index: null,
      sync: "possibly_stale",
      active_op: "verify",
    };

    expect(state.sync).toBe("possibly_stale");
    expect(state.active_op).toBe("verify");
  });
});
