import { MotorLayer, type MotorPosition } from "../airframe";

/** Shared by the motor tester and the selectable VTOL topology diagram. */
export function projectMotorPositions<T extends { position: MotorPosition }>(
  motors: readonly T[],
  width: number,
  height: number,
) {
  const stackOffset = 21;
  const hasLayers = motors.some((motor) => motor.position.layer !== null);
  const maxRight = Math.max(0.5, ...motors.map((motor) => Math.abs(motor.position.right)));
  const maxForward = Math.max(0.5, ...motors.map((motor) => Math.abs(motor.position.forward)));
  const scale = Math.min((width / 2 - 28) / maxRight, (height / 2 - 40 - (hasLayers ? stackOffset : 0)) / maxForward);
  return motors.map((motor) => ({
    motor,
    cx: width / 2 + motor.position.right * scale,
    cy:
      height / 2 -
      motor.position.forward * scale +
      (motor.position.layer === MotorLayer.Top
        ? -stackOffset
        : motor.position.layer === MotorLayer.Bottom
          ? stackOffset
          : 0),
  }));
}
