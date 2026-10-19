import { FrameClass, FrameType, isAirframe, TailsitterMode, TiltType, type Airframe } from "../airframe";

// AP_Motors::motor_frame_class / motor_frame_type:
// https://github.com/ArduPilot/ardupilot/blob/master/libraries/AP_Motors/AP_Motors_Class.h
export enum ArduPilotFrameClass {
  Undefined = 0,
  Quad = 1,
  Hexa = 2,
  Octa = 3,
  OctaQuad = 4,
  Y6 = 5,
  Heli = 6,
  Tri = 7,
  Single = 8,
  Coax = 9,
  Tailsitter = 10,
  HeliDual = 11,
  DodecaHexa = 12,
  HeliQuad = 13,
  Deca = 14,
  ScriptingMatrix = 15,
  Scripting6Dof = 16,
  DynamicScriptingMatrix = 17,
}

export enum ArduPilotFrameType {
  Plus = 0,
  X = 1,
  V = 2,
  H = 3,
  VTail = 4,
  ATail = 5,
  PlusReversed = 6,
  Y6B = 10,
  Y6Firefly = 11,
  BetaFlightX = 12,
  DjiX = 13,
  ClockwiseX = 14,
  I = 15,
  NoYawTorquePlus = 16,
  NoYawTorqueX = 17,
  BetaFlightXReversed = 18,
  Y4 = 19,
  XCoRotating = 20,
  ClockwiseXCoRotating = 21,
}

export enum ArduPilotTiltType {
  Continuous = 0,
  Binary = 1,
  VectoredYaw = 2,
  Bicopter = 3,
}
export enum ArduPilotTailsitterMode {
  Disabled = 0,
  Enabled = 1,
  MotorOnly = 2,
}

const CLASS_CODES = {
  [FrameClass.Undefined]: ArduPilotFrameClass.Undefined,
  [FrameClass.Quad]: ArduPilotFrameClass.Quad,
  [FrameClass.Hexa]: ArduPilotFrameClass.Hexa,
  [FrameClass.Octa]: ArduPilotFrameClass.Octa,
  [FrameClass.OctaQuad]: ArduPilotFrameClass.OctaQuad,
  [FrameClass.Y6]: ArduPilotFrameClass.Y6,
  [FrameClass.Heli]: ArduPilotFrameClass.Heli,
  [FrameClass.Tri]: ArduPilotFrameClass.Tri,
  [FrameClass.Single]: ArduPilotFrameClass.Single,
  [FrameClass.Coax]: ArduPilotFrameClass.Coax,
  [FrameClass.SingleDual]: ArduPilotFrameClass.Tailsitter,
  [FrameClass.HeliDual]: ArduPilotFrameClass.HeliDual,
  [FrameClass.DodecaHexa]: ArduPilotFrameClass.DodecaHexa,
  [FrameClass.HeliQuad]: ArduPilotFrameClass.HeliQuad,
  [FrameClass.Deca]: ArduPilotFrameClass.Deca,
  [FrameClass.ScriptingMatrix]: ArduPilotFrameClass.ScriptingMatrix,
  [FrameClass.Scripting6Dof]: ArduPilotFrameClass.Scripting6Dof,
  [FrameClass.DynamicScriptingMatrix]: ArduPilotFrameClass.DynamicScriptingMatrix,
} as const satisfies Record<FrameClass, ArduPilotFrameClass>;

const TYPE_CODES = {
  [FrameType.Plus]: ArduPilotFrameType.Plus,
  [FrameType.X]: ArduPilotFrameType.X,
  [FrameType.V]: ArduPilotFrameType.V,
  [FrameType.H]: ArduPilotFrameType.H,
  [FrameType.VTail]: ArduPilotFrameType.VTail,
  [FrameType.ATail]: ArduPilotFrameType.ATail,
  [FrameType.PlusReversed]: ArduPilotFrameType.PlusReversed,
  [FrameType.Y6B]: ArduPilotFrameType.Y6B,
  [FrameType.Y6Firefly]: ArduPilotFrameType.Y6Firefly,
  [FrameType.BetaFlightX]: ArduPilotFrameType.BetaFlightX,
  [FrameType.DjiX]: ArduPilotFrameType.DjiX,
  [FrameType.ClockwiseX]: ArduPilotFrameType.ClockwiseX,
  [FrameType.I]: ArduPilotFrameType.I,
  [FrameType.NoYawTorquePlus]: ArduPilotFrameType.NoYawTorquePlus,
  [FrameType.NoYawTorqueX]: ArduPilotFrameType.NoYawTorqueX,
  [FrameType.BetaFlightXReversed]: ArduPilotFrameType.BetaFlightXReversed,
  [FrameType.Y4]: ArduPilotFrameType.Y4,
  [FrameType.XCoRotating]: ArduPilotFrameType.XCoRotating,
  [FrameType.ClockwiseXCoRotating]: ArduPilotFrameType.ClockwiseXCoRotating,
  [FrameType.TriStandard]: ArduPilotFrameType.Plus,
  [FrameType.TriPitchReversed]: ArduPilotFrameType.PlusReversed,
  [FrameType.Y6A]: ArduPilotFrameType.Plus,
  [FrameType.NotApplicable]: ArduPilotFrameType.Plus,
  [FrameType.ScriptDefined]: ArduPilotFrameType.Plus,
} as const satisfies Record<FrameType, ArduPilotFrameType>;

const CLASSES_BY_CODE = new Map<number, FrameClass>(
  Object.entries(CLASS_CODES).map(([key, code]) => [code, key as FrameClass]),
);
// Only the generic mixer variants are decoded without class context.
const GENERIC_TYPES_BY_CODE = new Map<number, FrameType>(
  Object.entries(TYPE_CODES)
    .filter(
      ([type]) =>
        ![
          FrameType.TriStandard,
          FrameType.TriPitchReversed,
          FrameType.Y6A,
          FrameType.NotApplicable,
          FrameType.ScriptDefined,
        ].includes(type as FrameType),
    )
    .map(([type, code]) => [code, type as FrameType]),
);

export type ArduPilotFrameParameters = { frameClass: number | null; frameType: number | null };
export type DecodedArduPilotFrame = {
  parameters: ArduPilotFrameParameters;
  frameClass: FrameClass | null;
} & ({ status: "known"; frame: Airframe } | { status: "incomplete" | "unsupported"; frame: null });

export function decodeArduPilotFrameClass(value: number | null): FrameClass | null {
  return value === null ? null : (CLASSES_BY_CODE.get(value) ?? null);
}

export function encodeArduPilotFrameClass(frameClass: FrameClass): ArduPilotFrameClass {
  return CLASS_CODES[frameClass];
}

export function encodeArduPilotFrame(frame: Airframe): {
  frameClass: ArduPilotFrameClass;
  frameType: ArduPilotFrameType;
} {
  return { frameClass: CLASS_CODES[frame.frameClass], frameType: TYPE_CODES[frame.frameType] };
}

export function decodeArduPilotFrame(
  frameClassValue: number | null,
  frameTypeValue: number | null,
): DecodedArduPilotFrame {
  const parameters = { frameClass: frameClassValue, frameType: frameTypeValue };
  const frameClass = decodeArduPilotFrameClass(frameClassValue);
  const base = { parameters, frameClass };
  if (frameClassValue === null || frameTypeValue === null) return { ...base, status: "incomplete", frame: null };
  if (frameClass === null || !Number.isInteger(frameTypeValue) || frameTypeValue < 0 || frameTypeValue > 255) {
    return { ...base, status: "unsupported", frame: null };
  }
  let frameType: FrameType | null;
  switch (frameClass) {
    case FrameClass.Tri:
      frameType =
        frameTypeValue === ArduPilotFrameType.PlusReversed ? FrameType.TriPitchReversed : FrameType.TriStandard;
      break;
    case FrameClass.Y6:
      frameType =
        frameTypeValue === ArduPilotFrameType.Y6B
          ? FrameType.Y6B
          : frameTypeValue === ArduPilotFrameType.Y6Firefly
            ? FrameType.Y6Firefly
            : FrameType.Y6A;
      break;
    case FrameClass.ScriptingMatrix:
    case FrameClass.Scripting6Dof:
    case FrameClass.DynamicScriptingMatrix:
      frameType = FrameType.ScriptDefined;
      break;
    case FrameClass.Undefined:
    case FrameClass.Single:
    case FrameClass.Coax:
    case FrameClass.SingleDual:
    case FrameClass.Heli:
    case FrameClass.HeliDual:
    case FrameClass.HeliQuad:
      frameType = FrameType.NotApplicable;
      break;
    case FrameClass.Deca:
      frameType =
        frameTypeValue === ArduPilotFrameType.ClockwiseX
          ? FrameType.X
          : (GENERIC_TYPES_BY_CODE.get(frameTypeValue) ?? null);
      break;
    default:
      frameType = GENERIC_TYPES_BY_CODE.get(frameTypeValue) ?? null;
  }
  if (frameType !== null) {
    const frame = { frameClass, frameType };
    if (isAirframe(frame)) return { ...base, status: "known", frame };
  }
  return { ...base, status: "unsupported", frame: null };
}

const TILT_CODES = {
  [TiltType.Continuous]: ArduPilotTiltType.Continuous,
  [TiltType.Binary]: ArduPilotTiltType.Binary,
  [TiltType.VectoredYaw]: ArduPilotTiltType.VectoredYaw,
  [TiltType.Bicopter]: ArduPilotTiltType.Bicopter,
} as const satisfies Record<TiltType, ArduPilotTiltType>;
const TILT_TYPES_BY_CODE = new Map<number, TiltType>(
  Object.entries(TILT_CODES).map(([type, code]) => [code, type as TiltType]),
);
export function decodeArduPilotTiltType(value: number | null): TiltType | null {
  return value === null ? null : (TILT_TYPES_BY_CODE.get(value) ?? null);
}
export function encodeArduPilotTiltType(type: TiltType): ArduPilotTiltType {
  return TILT_CODES[type];
}
export function decodeArduPilotTailsitterMode(value: number | null): TailsitterMode | null {
  switch (value) {
    case ArduPilotTailsitterMode.Disabled:
      return TailsitterMode.Disabled;
    case ArduPilotTailsitterMode.Enabled:
      return TailsitterMode.Enabled;
    case ArduPilotTailsitterMode.MotorOnly:
      return TailsitterMode.MotorOnly;
    default:
      return null;
  }
}
