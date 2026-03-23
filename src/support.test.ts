import { beforeEach, describe, expect, it, vi } from "vitest";

const { listen } = vi.hoisted(() => ({
  listen: vi.fn(),
}));

vi.mock("@platform/event", () => ({
  listen,
}));

import { subscribeSupport } from "./support";

describe("support domain", () => {
  beforeEach(() => {
    listen.mockReset();
  });

  it("is a first-class backend domain instead of legacy heuristics", () => {
    const support = {
      available: true,
      complete: true,
      provenance: "stream",
      value: {
        can_request_prearm_checks: true,
        can_calibrate_accel: true,
        can_calibrate_compass: true,
        can_calibrate_radio: false,
      },
    } as const;

    expect(support.available).toBe(true);
    expect(support.value.can_request_prearm_checks).toBe(true);
  });

  it("unwraps the Rust scoped payload shape", async () => {
    const domain = {
      available: true,
      complete: true,
      provenance: "stream",
      value: {
        can_request_prearm_checks: true,
        can_calibrate_accel: true,
        can_calibrate_compass: true,
        can_calibrate_radio: false,
      },
    } as const;
    const cb = vi.fn();

    listen.mockImplementation(async (_event, handler) => {
      handler({
        payload: {
          envelope: { session_id: "session-1", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
          value: domain,
        },
      });
      return () => {};
    });

    await subscribeSupport(cb);

    expect(cb).toHaveBeenCalledWith(domain);
  });
});
