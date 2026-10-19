/** Application concepts. ArduPilot parameter codes belong in lib/ardupilot. */
export enum FrameClass {
  Undefined = "undefined",
  Quad = "quad",
  Hexa = "hexa",
  Octa = "octa",
  OctaQuad = "octa_quad",
  Y6 = "y6",
  Heli = "heli",
  Tri = "tri",
  Single = "single",
  Coax = "coax",
  SingleDual = "single_dual",
  HeliDual = "heli_dual",
  DodecaHexa = "dodeca_hexa",
  HeliQuad = "heli_quad",
  Deca = "deca",
  ScriptingMatrix = "scripting_matrix",
  Scripting6Dof = "scripting_6dof",
  DynamicScriptingMatrix = "dynamic_scripting_matrix",
}

export enum FrameType {
  Plus = "plus",
  X = "x",
  V = "v",
  H = "h",
  VTail = "v_tail",
  ATail = "a_tail",
  PlusReversed = "plus_reversed",
  BetaFlightX = "betaflight_x",
  DjiX = "dji_x",
  ClockwiseX = "clockwise_x",
  I = "i",
  NoYawTorquePlus = "no_yaw_torque_plus",
  NoYawTorqueX = "no_yaw_torque_x",
  BetaFlightXReversed = "betaflight_x_reversed",
  Y4 = "y4",
  XCoRotating = "x_co_rotating",
  ClockwiseXCoRotating = "clockwise_x_co_rotating",
  TriStandard = "tri_standard",
  TriPitchReversed = "tri_pitch_reversed",
  Y6A = "y6_a",
  Y6B = "y6_b",
  Y6Firefly = "y6_firefly",
  NotApplicable = "not_applicable",
  ScriptDefined = "script_defined",
}

// The same firmware FRAME_TYPE code has different meanings across classes.
// This table makes those constraints part of the application's type system.
export const FRAME_TYPES = {
  [FrameClass.Undefined]: [FrameType.NotApplicable],
  [FrameClass.Quad]: [
    FrameType.Plus,
    FrameType.X,
    FrameType.V,
    FrameType.H,
    FrameType.VTail,
    FrameType.ATail,
    FrameType.PlusReversed,
    FrameType.BetaFlightX,
    FrameType.DjiX,
    FrameType.ClockwiseX,
    FrameType.NoYawTorquePlus,
    FrameType.NoYawTorqueX,
    FrameType.BetaFlightXReversed,
    FrameType.Y4,
  ],
  [FrameClass.Hexa]: [FrameType.Plus, FrameType.X, FrameType.H, FrameType.DjiX, FrameType.ClockwiseX],
  [FrameClass.Octa]: [
    FrameType.Plus,
    FrameType.X,
    FrameType.V,
    FrameType.H,
    FrameType.DjiX,
    FrameType.ClockwiseX,
    FrameType.I,
  ],
  [FrameClass.OctaQuad]: [
    FrameType.Plus,
    FrameType.X,
    FrameType.V,
    FrameType.H,
    FrameType.BetaFlightX,
    FrameType.ClockwiseX,
    FrameType.BetaFlightXReversed,
    FrameType.XCoRotating,
    FrameType.ClockwiseXCoRotating,
  ],
  [FrameClass.Y6]: [FrameType.Y6A, FrameType.Y6B, FrameType.Y6Firefly],
  [FrameClass.Tri]: [FrameType.TriStandard, FrameType.TriPitchReversed],
  [FrameClass.Single]: [FrameType.NotApplicable],
  [FrameClass.Coax]: [FrameType.NotApplicable],
  [FrameClass.SingleDual]: [FrameType.NotApplicable],
  [FrameClass.Heli]: [FrameType.NotApplicable],
  [FrameClass.HeliDual]: [FrameType.NotApplicable],
  [FrameClass.HeliQuad]: [FrameType.NotApplicable],
  [FrameClass.DodecaHexa]: [FrameType.Plus, FrameType.X],
  [FrameClass.Deca]: [FrameType.Plus, FrameType.X],
  [FrameClass.ScriptingMatrix]: [FrameType.ScriptDefined],
  [FrameClass.Scripting6Dof]: [FrameType.ScriptDefined],
  [FrameClass.DynamicScriptingMatrix]: [FrameType.ScriptDefined],
} as const satisfies Record<FrameClass, readonly FrameType[]>;

export type Airframe = {
  [C in FrameClass]: { frameClass: C; frameType: (typeof FRAME_TYPES)[C][number] };
}[FrameClass];

export function isAirframe(frame: { frameClass: FrameClass; frameType: FrameType }): frame is Airframe {
  const types: readonly FrameType[] = FRAME_TYPES[frame.frameClass];
  return types.includes(frame.frameType);
}

export enum MotorRotation {
  Clockwise = "cw",
  CounterClockwise = "ccw",
  Unknown = "unknown",
}

export enum MotorLayer {
  Top = "top",
  Bottom = "bottom",
}

export enum TiltType {
  Continuous = "continuous",
  Binary = "binary",
  VectoredYaw = "vectored_yaw",
  Bicopter = "bicopter",
}

export enum TailsitterMode {
  Disabled = "disabled",
  Enabled = "enabled",
  MotorOnly = "motor_only",
}

/** Logical motor identity. This is neither a SERVO connector nor motor-test order. */
export const MOTOR_NUMBERS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
] as const;
export type MotorNumber = (typeof MOTOR_NUMBERS)[number];
export function isMotorNumber(value: number): value is MotorNumber {
  return Number.isInteger(value) && value >= MOTOR_NUMBERS[0] && value <= MOTOR_NUMBERS[MOTOR_NUMBERS.length - 1];
}

/** Schematic body coordinates, viewed from above with the nose up. */
export type MotorPosition = {
  right: number;
  forward: number;
  layer: MotorLayer | null;
};

export type MotorLayout = {
  /** Logical motor, independent of its physical SERVO connector. */
  motorNumber: MotorNumber;
  position: MotorPosition;
  rotation: MotorRotation;
  /** MAV_CMD_DO_MOTOR_TEST sequence, not the logical motor number. */
  testOrder: number;
};
