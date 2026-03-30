import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("@platform/core", () => ({
  invoke,
}));

describe("calibration bridge actuation wrappers", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("invokes set_servo with snake_case command name and camelCase args", async () => {
    invoke.mockResolvedValue(undefined);
    const { setServo } = await import("./calibration");

    await setServo(6, 1750);

    expect(invoke).toHaveBeenCalledWith("set_servo", {
      instance: 6,
      pwmUs: 1750,
    });
  });

  it("invokes rc_override with typed channel variants unchanged", async () => {
    invoke.mockResolvedValue(undefined);
    const { rcOverride } = await import("./calibration");

    const channels = [
      { channel: 1, value: { kind: "pwm" as const, pwm_us: 1500 } },
      { channel: 2, value: { kind: "release" as const } },
      { channel: 3, value: { kind: "ignore" as const } },
    ];

    await rcOverride(channels);

    expect(invoke).toHaveBeenCalledWith("rc_override", {
      channels,
    });
  });

  it("surfaces invoke rejections for actuation commands", async () => {
    const { setServo, rcOverride } = await import("./calibration");

    invoke.mockRejectedValueOnce(new Error("not connected"));
    await expect(setServo(1, 1500)).rejects.toThrow("not connected");

    invoke.mockRejectedValueOnce(new Error("unsupported actuation command"));
    await expect(rcOverride([{ channel: 1, value: { kind: "release" } }])).rejects.toThrow(
      "unsupported actuation command",
    );
  });
});
