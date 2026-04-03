import { describe, expect, it } from "vitest";
import { getDirectionGuidance } from "./servo-direction-guidance";

describe("getDirectionGuidance", () => {
  it("returns specific labels for known control surface functions", () => {
    const aileron = getDirectionGuidance(4);
    expect(aileron.minLabel).toBe("Roll left (trailing edge up)");
    expect(aileron.maxLabel).toBe("Roll right (trailing edge down)");

    const elevator = getDirectionGuidance(19);
    expect(elevator.minLabel).toBe("Pitch down (trailing edge down)");
    expect(elevator.maxLabel).toBe("Pitch up (trailing edge up)");

    const rudder = getDirectionGuidance(21);
    expect(rudder.minLabel).toBe("Yaw left");
    expect(rudder.maxLabel).toBe("Yaw right");
  });

  it("returns specific labels for flaps and spoilers", () => {
    const flap = getDirectionGuidance(2);
    expect(flap.minLabel).toBe("Retracted");
    expect(flap.maxLabel).toBe("Fully deployed");

    const airBrake = getDirectionGuidance(110);
    expect(airBrake.minLabel).toBe("Retracted");
    expect(airBrake.maxLabel).toBe("Fully deployed");
  });

  it("returns specific labels for throttle functions", () => {
    const throttle = getDirectionGuidance(70);
    expect(throttle.minLabel).toBe("Idle / off");
    expect(throttle.maxLabel).toBe("Full throttle");
  });

  it("returns specific labels for gimbal mount axes", () => {
    const pitch = getDirectionGuidance(7);
    expect(pitch.minLabel).toBe("Full down");
    expect(pitch.maxLabel).toBe("Full up");

    const yaw = getDirectionGuidance(6);
    expect(yaw.minLabel).toBe("Full left");
    expect(yaw.maxLabel).toBe("Full right");
  });

  it("returns specific labels for VTOL tilt motors", () => {
    const tilt = getDirectionGuidance(41);
    expect(tilt.minLabel).toBe("Forward flight");
    expect(tilt.maxLabel).toBe("Vertical hover");
  });

  it("returns specific labels for mechanical outputs", () => {
    const gear = getDirectionGuidance(29);
    expect(gear.minLabel).toBe("Deployed (down)");
    expect(gear.maxLabel).toBe("Retracted (up)");
  });

  it("returns generic fallback labels for unknown function codes", () => {
    const unknown = getDirectionGuidance(999);
    expect(unknown.minLabel).toBe("Min PWM position");
    expect(unknown.maxLabel).toBe("Max PWM position");
  });

  it("returns generic fallback labels for passthrough functions", () => {
    const passthru = getDirectionGuidance(1);
    expect(passthru.minLabel).toBe("Min PWM position");
    expect(passthru.maxLabel).toBe("Max PWM position");
  });
});
