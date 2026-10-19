// AP_Motors mixer/test metadata from MissionPlanner APMotorLayout.json.
// Physical conventions: https://ardupilot.org/copter/docs/connect-escs-and-motors.html
import rawData from "./motor-layouts.json";
import {
  isMotorNumber,
  type MotorNumber,
  FrameClass,
  FrameType,
  MotorRotation,
  MotorLayer,
  type Airframe,
  type MotorPosition,
  type MotorLayout,
} from "../lib/airframe";
import { decodeArduPilotFrame } from "../lib/ardupilot/airframe";

export type FrameYawServo = {
  label: string;
  controlsMotorNumber: MotorNumber;
};

export type FrameLayout = {
  frame: Airframe;
  className: string;
  typeName: string;
  motors: MotorLayout[];
  yawServo: FrameYawServo | null;
};

type RawMotor = { Number: number; TestOrder: number; Rotation: string; Roll: number; Pitch: number };
type RawLayout = { Class: number; ClassName: string; Type: number; TypeName: string; motors: RawMotor[] };

function physicalPosition(frame: Airframe, motor: RawMotor): MotorPosition {
  // A positive roll command increases LEFT motor thrust. Mixer coefficients
  // must be converted here; presentation and actuator ownership use positions.
  let right = -motor.Roll;
  if (
    frame.frameClass === FrameClass.Quad &&
    (frame.frameType === FrameType.VTail || frame.frameType === FrameType.ATail)
  ) {
    // V/A-tail rear motors provide no roll torque, but sit on opposite arms.
    if (motor.Number === 2) right = -0.5;
    if (motor.Number === 4) right = 0.5;
  }
  // Layer membership comes from the official diagrams, independently of the
  // test sequence and mixer factors (Y6A and BF ordering are not alternating).
  const topMotors =
    frame.frameClass === FrameClass.OctaQuad
      ? frame.frameType === FrameType.ClockwiseX
        ? [1, 3, 5, 7]
        : [1, 2, 3, 4]
      : frame.frameClass === FrameClass.Y6
        ? frame.frameType === FrameType.Y6B
          ? [1, 3, 5]
          : frame.frameType === FrameType.Y6Firefly
            ? [1, 2, 3]
            : [2, 5, 6]
        : frame.frameClass === FrameClass.DodecaHexa
          ? [1, 3, 5, 7, 9, 11]
          : null;
  return {
    right: Math.abs(right) < 1e-6 ? 0 : right,
    forward: Math.abs(motor.Pitch) < 1e-6 ? 0 : motor.Pitch,
    layer: topMotors ? (topMotors.includes(motor.Number) ? MotorLayer.Top : MotorLayer.Bottom) : null,
  };
}

const layoutIndex = new Map<string, FrameLayout>();
function frameKey(frame: Airframe): string {
  return `${frame.frameClass}:${frame.frameType}`;
}

for (const raw of rawData.layouts satisfies RawLayout[]) {
  const { frame } = decodeArduPilotFrame(raw.Class, raw.Type);
  if (!frame) throw new Error(`Invalid motor catalog frame ${raw.Class}:${raw.Type}`);
  const key = frameKey(frame);
  if (layoutIndex.has(key)) continue; // Tri/Y6/Deca aliases share one geometry.
  layoutIndex.set(key, {
    frame,
    className: raw.ClassName,
    typeName: raw.TypeName,
    motors: raw.motors
      // AP_MotorsTri stores its yaw actuator in the Motor7 slot.
      .filter((motor) => !(frame.frameClass === FrameClass.Tri && motor.Number === 7))
      .map((motor) => {
        if (!isMotorNumber(motor.Number)) throw new Error(`Invalid catalog motor ${motor.Number}`);
        return {
          motorNumber: motor.Number,
          position: physicalPosition(frame, motor),
          rotation:
            motor.Rotation === "CW"
              ? MotorRotation.Clockwise
              : motor.Rotation === "CCW"
                ? MotorRotation.CounterClockwise
                : MotorRotation.Unknown,
          testOrder: motor.TestOrder,
        };
      }),
    yawServo:
      frame.frameClass === FrameClass.Tri
        ? {
            label: frame.frameType === FrameType.TriPitchReversed ? "Front yaw servo" : "Rear yaw servo",
            controlsMotorNumber: 4,
          }
        : null,
  });
}

export function getMotorLayout(frame: Airframe | null): FrameLayout | null {
  return frame ? (layoutIndex.get(frameKey(frame)) ?? null) : null;
}

export function getAllLayouts(): FrameLayout[] {
  return Array.from(layoutIndex.values());
}
