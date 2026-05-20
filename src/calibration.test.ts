import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("@platform/core", () => ({
  invoke,
}));

describe("calibration bridge actuation wrappers", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("invokes motor_test with snake_case command name and camelCase args", async () => {
    invoke.mockResolvedValue(undefined);
    const { motorTest } = await import("./calibration");

    await motorTest(4, 5, 2);

    expect(invoke).toHaveBeenCalledWith("motor_test", {
      motorInstance: 4,
      throttlePct: 5,
      durationS: 2,
    });
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

  it("invokes calibration actions with native command names", async () => {
    invoke.mockResolvedValue(undefined);
    const {
      calibrateAccel,
      calibrateGyro,
      calibrateCompassStart,
      calibrateCompassAccept,
      calibrateCompassCancel,
    } = await import("./calibration");

    await calibrateAccel();
    await calibrateGyro();
    await calibrateCompassStart(5);
    await calibrateCompassAccept(5);
    await calibrateCompassCancel(5);

    expect(invoke).toHaveBeenCalledWith("calibrate_accel");
    expect(invoke).toHaveBeenCalledWith("calibrate_gyro");
    expect(invoke).toHaveBeenCalledWith("calibrate_compass_start", { compassMask: 5 });
    expect(invoke).toHaveBeenCalledWith("calibrate_compass_accept", { compassMask: 5 });
    expect(invoke).toHaveBeenCalledWith("calibrate_compass_cancel", { compassMask: 5 });
  });

  it("invokes maintenance actions with native command names", async () => {
    invoke.mockResolvedValue(undefined);
    const { rebootVehicle, requestPrearmChecks } = await import("./calibration");

    await rebootVehicle();
    await requestPrearmChecks();

    expect(invoke).toHaveBeenCalledWith("reboot_vehicle");
    expect(invoke).toHaveBeenCalledWith("request_prearm_checks");
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
