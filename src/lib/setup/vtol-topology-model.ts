import type { StagedParameterValues } from "../params/parameter-values";
import { readAppliedParameter, readProposedParameter } from "../params/parameter-values";
import { getAllLayouts, getMotorLayout } from "../../data/motor-layouts";
import {
  isAirframe,
  FrameClass,
  FrameType,
  MotorRotation,
  TailsitterMode,
  TiltType,
  type Airframe,
  type MotorNumber,
  type MotorLayout,
  type MotorPosition,
} from "../airframe";
import {
  decodeArduPilotFrame,
  decodeArduPilotTiltType,
  decodeArduPilotTailsitterMode,
  encodeArduPilotFrame,
  encodeArduPilotFrameClass,
  ArduPilotTiltType,
  ArduPilotFrameClass,
  ArduPilotTailsitterMode,
  type ArduPilotFrameParameters,
} from "../ardupilot/airframe";
import { ArduPilotServoFunction } from "../ardupilot/servo-functions";
import type { ParamStore } from "../../params";
import { TILT_OUTPUT_FUNCTIONS, THROTTLE_OUTPUT_FUNCTIONS, servoFunctionForMotor } from "./motor-functions";

export type VtolArchitecture =
  | "disabled"
  | "standard"
  | "tiltrotor"
  | "bicopter"
  | "tailsitter_single_dual"
  | "tailsitter_copter"
  | "tailsitter_motor_only"
  | "conflict"
  | "unsupported"
  | "custom";

export type VtolMechanism =
  | "fixed"
  | "continuous"
  | "binary"
  | "vectored_yaw"
  | "bicopter"
  | "tailsitter_fixed"
  | "tailsitter_vectored"
  | "custom";

export type VtolIssueSeverity = "info" | "warning" | "danger";

export type VtolValidationIssue = {
  id: string;
  severity: VtolIssueSeverity;
  title: string;
  detail: string;
};

export type VtolOutputOwner = {
  outputIndex: number;
  functionValue: ArduPilotServoFunction;
  functionParamName: string;
};

export type VtolPropulsor = {
  id: string;
  label: string;
  motorNumber: MotorNumber | null;
  functionValue: ArduPilotServoFunction;
  position: MotorPosition;
  rotation: MotorRotation;
  testOrder: number;
  tilts: boolean;
  forwardActive: boolean;
  outputOwners: VtolOutputOwner[];
};

export type VtolActuatorKind = "tilt" | "yaw";

export type VtolActuator = {
  id: string;
  label: string;
  kind: VtolActuatorKind;
  functionValue: ArduPilotServoFunction;
  controlsPropulsorIds: string[];
  required: boolean;
  outputOwners: VtolOutputOwner[];
};

export type VtolFrameLayoutOption = {
  id: string;
  value: FrameType;
  label: string;
  description: string;
};

export type VtolFrameClassOption = {
  value: FrameClass;
  label: string;
  description: string;
  custom: boolean;
};

export type VtolTopologySnapshot = {
  architecture: VtolArchitecture;
  architectureLabel: string;
  mechanism: VtolMechanism;
  enabled: boolean;
  frame: Airframe | null;
  frameParameters: ArduPilotFrameParameters;
  frameClass: FrameClass | null;
  frameClassLabel: string;
  frameType: FrameType | null;
  frameTypeLabel: string;
  frameTypeIgnored: boolean;
  tiltMask: number;
  tailsitterMotorMask: number;
  propulsors: VtolPropulsor[];
  actuators: VtolActuator[];
  issues: VtolValidationIssue[];
  supportedDiagram: boolean;
};

export type VtolTopologyModel = {
  applied: VtolTopologySnapshot;
  proposed: VtolTopologySnapshot;
  hasProposedChanges: boolean;
  hasTopologyChanges: boolean;
  requiresRefreshBeforeMapping: boolean;
  pendingTopologyParams: string[];
};

export type VtolTopologyInput = {
  paramStore: ParamStore | null;
  stagedEdits: StagedParameterValues;
};

const TOPOLOGY_PARAM_NAMES = new Set([
  "Q_ENABLE",
  "Q_FRAME_CLASS",
  "Q_FRAME_TYPE",
  "Q_TILT_ENABLE",
  "Q_TILT_TYPE",
  "Q_TILT_MASK",
  "Q_TAILSIT_ENABLE",
  "Q_TAILSIT_MOTMX",
]);

const REFRESH_BOUNDARY_PARAM_NAMES = new Set([
  "Q_ENABLE",
  "Q_FRAME_CLASS",
  "Q_FRAME_TYPE",
  "Q_TILT_ENABLE",
  "Q_TAILSIT_ENABLE",
]);

const FRAME_CLASS_OPTIONS: readonly VtolFrameClassOption[] = [
  { value: FrameClass.Quad, label: "Quad", description: "Four hover motors", custom: false },
  { value: FrameClass.Hexa, label: "Hexa", description: "Six hover motors", custom: false },
  { value: FrameClass.Octa, label: "Octa", description: "Eight hover motors", custom: false },
  { value: FrameClass.OctaQuad, label: "OctaQuad", description: "Eight coaxial hover motors", custom: false },
  { value: FrameClass.Y6, label: "Y6", description: "Six coaxial motors on three arms", custom: false },
  { value: FrameClass.Tri, label: "Tri", description: "Three propellers plus a yaw actuator", custom: false },
  {
    value: FrameClass.SingleDual,
    label: "Single / Dual",
    description: "Tailsitter or bicopter special case",
    custom: false,
  },
  { value: FrameClass.DodecaHexa, label: "DodecaHexa", description: "Twelve coaxial motors", custom: false },
  { value: FrameClass.Deca, label: "Deca", description: "Ten hover motors", custom: false },
  {
    value: FrameClass.ScriptingMatrix,
    label: "Scripting Matrix",
    description: "Geometry is supplied by a Lua script",
    custom: true,
  },
  {
    value: FrameClass.DynamicScriptingMatrix,
    label: "Dynamic Scripting Matrix",
    description: "Runtime geometry is supplied by a Lua script",
    custom: true,
  },
] as const;

const SPECIAL_LAYOUT_OPTIONS: Partial<Record<FrameClass, readonly VtolFrameLayoutOption[]>> = {
  [FrameClass.Tri]: [
    {
      id: "tri-standard",
      value: FrameType.TriStandard,
      label: "Standard Tri",
      description: "Q_FRAME_TYPE is otherwise ignored for Tri",
    },
    {
      id: "tri-pitch-reversed",
      value: FrameType.TriPitchReversed,
      label: "Pitch reversed",
      description: "Reverses the front/rear pitch mixer",
    },
  ],
  [FrameClass.Y6]: [
    { id: "y6-a", value: FrameType.Y6A, label: "Y6A", description: "Default Y6 arrangement" },
    { id: "y6-b", value: FrameType.Y6B, label: "Y6B", description: "Y6B motor arrangement" },
    {
      id: "y6-firefly",
      value: FrameType.Y6Firefly,
      label: "FireFly Y6",
      description: "Y6F / FireFly motor arrangement",
    },
  ],
  [FrameClass.Deca]: [
    { id: "deca-plus", value: FrameType.Plus, label: "Plus", description: "Deca Plus motor mixing" },
    {
      id: "deca-x",
      value: FrameType.X,
      label: "X / Clockwise X",
      description: "Equivalent Deca X values are shown as one layout",
    },
  ],
};

const CLASS_NAME_BY_VALUE = new Map(FRAME_CLASS_OPTIONS.map((option) => [option.value, option.label]));

function titleCaseLayout(value: string): string {
  const aliases: Record<string, string> = {
    PLUS: "Plus",
    X: "X",
    V: "V",
    H: "H",
    VTAIL: "V-tail",
    ATAIL: "A-tail",
    PLUSREV: "Plus reversed",
    BF_X: "BetaFlight X",
    DJI_X: "DJI X",
    CW_X: "Clockwise X",
    I: "I",
    NYT_PLUS: "No-yaw-torque Plus",
    NYT_X: "No-yaw-torque X",
    X_REV: "X reversed",
  };
  return (
    aliases[value] ??
    value
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/^./, (letter: string) => letter.toUpperCase())
  );
}

export function getVtolFrameClassOptions(): readonly VtolFrameClassOption[] {
  return FRAME_CLASS_OPTIONS;
}

export function isVtolFrameClassAllowed(frameClass: FrameClass, architecture: VtolArchitecture): boolean {
  if (architecture === "bicopter" || architecture === "tailsitter_single_dual")
    return frameClass === FrameClass.SingleDual;
  const tiltClasses: readonly FrameClass[] = [
    FrameClass.Quad,
    FrameClass.Hexa,
    FrameClass.Octa,
    FrameClass.OctaQuad,
    FrameClass.Y6,
    FrameClass.Tri,
  ];
  if (architecture === "tiltrotor") return tiltClasses.includes(frameClass);
  return FRAME_CLASS_OPTIONS.some((option) => option.value === frameClass) && frameClass !== FrameClass.SingleDual;
}

export function getVtolFrameLayoutOptions(frameClass: FrameClass): readonly VtolFrameLayoutOption[] {
  const special = SPECIAL_LAYOUT_OPTIONS[frameClass];
  if (special) return special;
  return getAllLayouts()
    .filter((layout) => layout.frame.frameClass === frameClass)
    .map((layout) => ({
      id: `${frameClass}-${layout.frame.frameType}`,
      value: layout.frame.frameType,
      label: titleCaseLayout(layout.typeName),
      description: `${CLASS_NAME_BY_VALUE.get(frameClass) ?? "Frame"} motor mixing`,
    }));
}

function isEnabled(value: number | null): boolean {
  return value !== null && value > 0;
}

function readOutputOwners(
  input: VtolTopologyInput,
  functionValue: ArduPilotServoFunction,
  proposed: boolean,
): VtolOutputOwner[] {
  const owners: VtolOutputOwner[] = [];
  for (let outputIndex = 1; outputIndex <= 32; outputIndex += 1) {
    const functionParamName = `SERVO${outputIndex}_FUNCTION`;
    const value = proposed ? readProposedParameter(input, functionParamName) : readAppliedParameter(input.paramStore, functionParamName);
    if (value === functionValue) {
      owners.push({ outputIndex, functionValue, functionParamName });
    }
  }
  return owners;
}

function architectureFor(values: Record<string, number | null>, frameClass: FrameClass | null): VtolArchitecture {
  if (!isEnabled(values.Q_ENABLE)) {
    return "disabled";
  }

  const tiltEnabled = isEnabled(values.Q_TILT_ENABLE);
  const tailsitterMode = decodeArduPilotTailsitterMode(values.Q_TAILSIT_ENABLE);
  if (values.Q_TAILSIT_ENABLE !== null && tailsitterMode === null) return "unsupported";
  const tailsitterEnabled = tailsitterMode !== null && tailsitterMode !== TailsitterMode.Disabled;
  if (tiltEnabled && tailsitterEnabled) {
    return "conflict";
  }
  if (tiltEnabled && decodeArduPilotTiltType(values.Q_TILT_TYPE) === TiltType.Bicopter) {
    return "bicopter";
  }
  if (tiltEnabled) {
    return "tiltrotor";
  }
  if (tailsitterEnabled) {
    if (tailsitterMode === TailsitterMode.MotorOnly) {
      return "tailsitter_motor_only";
    }
    return (values.Q_TAILSIT_MOTMX ?? 0) > 0 ? "tailsitter_copter" : "tailsitter_single_dual";
  }
  if (frameClass === FrameClass.ScriptingMatrix || frameClass === FrameClass.DynamicScriptingMatrix) {
    return "custom";
  }
  return "standard";
}

function architectureLabel(architecture: VtolArchitecture): string {
  switch (architecture) {
    case "disabled":
      return "VTOL disabled";
    case "standard":
      return "Lift + cruise QuadPlane";
    case "tiltrotor":
      return "Tiltrotor / tiltwing";
    case "bicopter":
      return "Bicopter tiltrotor";
    case "tailsitter_single_dual":
      return "Single / dual motor tailsitter";
    case "tailsitter_copter":
      return "Copter-motor tailsitter";
    case "tailsitter_motor_only":
      return "Motor-only tailsitter";
    case "conflict":
      return "Conflicting VTOL architecture";
    case "custom":
      return "Scripted motor matrix";
    case "unsupported":
      return "Unsupported VTOL configuration";
  }
}

function mechanismFor(
  architecture: VtolArchitecture,
  tiltType: TiltType | null,
  input: VtolTopologyInput,
  proposed: boolean,
): VtolMechanism {
  if (architecture === "bicopter") return "bicopter";
  if (architecture === "tiltrotor") {
    if (tiltType === TiltType.Binary) return "binary";
    if (tiltType === TiltType.VectoredYaw) return "vectored_yaw";
    return tiltType === TiltType.Continuous ? "continuous" : "custom";
  }
  if (architecture.startsWith("tailsitter")) {
    const leftTilt = readOutputOwners(input, TILT_OUTPUT_FUNCTIONS.frontLeft, proposed).length > 0;
    const rightTilt = readOutputOwners(input, TILT_OUTPUT_FUNCTIONS.frontRight, proposed).length > 0;
    return leftTilt || rightTilt ? "tailsitter_vectored" : "tailsitter_fixed";
  }
  if (architecture === "custom" || architecture === "conflict" || architecture === "unsupported") return "custom";
  return "fixed";
}

function normalizeMask(value: number | null): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}

function maskIncludes(mask: number, motorNumber: number): boolean {
  return (mask & (1 << (motorNumber - 1))) !== 0;
}

function propulsorFromLayout(
  motor: MotorLayout,
  tiltMask: number,
  forwardMask: number,
  architecture: VtolArchitecture,
  mechanism: VtolMechanism,
  input: VtolTopologyInput,
  proposed: boolean,
): VtolPropulsor | null {
  const functionValue = servoFunctionForMotor(motor.motorNumber);
  if (functionValue === null) {
    return null;
  }

  return {
    id: `motor-${motor.motorNumber}`,
    label: `Motor ${motor.motorNumber}`,
    motorNumber: motor.motorNumber,
    functionValue,
    position: motor.position,
    rotation: motor.rotation,
    testOrder: motor.testOrder,
    tilts:
      architecture === "tiltrotor" ? maskIncludes(tiltMask, motor.motorNumber) : mechanism === "tailsitter_vectored",
    forwardActive:
      architecture === "tailsitter_motor_only" ||
      (architecture === "tailsitter_copter" && maskIncludes(forwardMask, motor.motorNumber)),
    outputOwners: readOutputOwners(input, functionValue, proposed),
  };
}

function buildSingleDualPropulsors(
  architecture: VtolArchitecture,
  mechanism: VtolMechanism,
  input: VtolTopologyInput,
  proposed: boolean,
): VtolPropulsor[] {
  if (architecture === "bicopter") {
    return [
      customPropulsor("left-throttle", "Left motor", THROTTLE_OUTPUT_FUNCTIONS.left, -0.75, 0, true, input, proposed),
      customPropulsor("right-throttle", "Right motor", THROTTLE_OUTPUT_FUNCTIONS.right, 0.75, 0, true, input, proposed),
    ];
  }

  const throttleOwners = readOutputOwners(input, THROTTLE_OUTPUT_FUNCTIONS.throttle, proposed);
  const leftOwners = readOutputOwners(input, THROTTLE_OUTPUT_FUNCTIONS.left, proposed);
  const rightOwners = readOutputOwners(input, THROTTLE_OUTPUT_FUNCTIONS.right, proposed);
  if (throttleOwners.length > 0 && leftOwners.length === 0 && rightOwners.length === 0) {
    return [
      customPropulsor(
        "throttle",
        "Main motor",
        THROTTLE_OUTPUT_FUNCTIONS.throttle,
        0,
        0,
        mechanism === "tailsitter_vectored",
        input,
        proposed,
      ),
    ];
  }

  return [
    customPropulsor(
      "left-throttle",
      "Left motor",
      THROTTLE_OUTPUT_FUNCTIONS.left,
      -0.75,
      0,
      mechanism === "tailsitter_vectored",
      input,
      proposed,
    ),
    customPropulsor(
      "right-throttle",
      "Right motor",
      THROTTLE_OUTPUT_FUNCTIONS.right,
      0.75,
      0,
      mechanism === "tailsitter_vectored",
      input,
      proposed,
    ),
  ];
}

function customPropulsor(
  id: string,
  label: string,
  functionValue: ArduPilotServoFunction,
  right: number,
  forward: number,
  tilts: boolean,
  input: VtolTopologyInput,
  proposed: boolean,
): VtolPropulsor {
  return {
    id,
    label,
    motorNumber: null,
    functionValue,
    position: { right, forward, layer: null },
    rotation: MotorRotation.Unknown,
    testOrder: 0,
    tilts,
    forwardActive: true,
    outputOwners: readOutputOwners(input, functionValue, proposed),
  };
}

function buildActuators(
  architecture: VtolArchitecture,
  mechanism: VtolMechanism,
  propulsors: VtolPropulsor[],
  frame: Airframe | null,
  input: VtolTopologyInput,
  proposed: boolean,
): VtolActuator[] {
  const actuators: VtolActuator[] = [];
  if (mechanism === "custom") return actuators;
  const tilted = propulsors.filter((propulsor) => propulsor.tilts);

  const add = (
    id: string,
    label: string,
    kind: VtolActuatorKind,
    functionValue: ArduPilotServoFunction,
    controlled: VtolPropulsor[],
    required = true,
  ) => {
    if (controlled.length === 0 && kind === "tilt") return;
    actuators.push({
      id,
      label,
      kind,
      functionValue,
      controlsPropulsorIds: controlled.map((propulsor) => propulsor.id),
      required,
      outputOwners: readOutputOwners(input, functionValue, proposed),
    });
  };

  if (mechanism === "continuous" || mechanism === "binary") {
    // Continuous and binary control output a single collective tilt (function 41).
    add("collective-tilt", "Collective tilt", "tilt", TILT_OUTPUT_FUNCTIONS.collective, tilted);
  } else if (mechanism === "vectored_yaw") {
    add(
      "front-left",
      "Front left tilt",
      "tilt",
      TILT_OUTPUT_FUNCTIONS.frontLeft,
      tilted.filter((motor) => motor.position.forward >= 0 && motor.position.right < 0),
    );
    add(
      "front-right",
      "Front right tilt",
      "tilt",
      TILT_OUTPUT_FUNCTIONS.frontRight,
      tilted.filter((motor) => motor.position.forward >= 0 && motor.position.right > 0),
    );
    add(
      "rear-left",
      "Rear left tilt",
      "tilt",
      TILT_OUTPUT_FUNCTIONS.rearLeft,
      tilted.filter((motor) => motor.position.forward < 0 && motor.position.right < 0),
    );
    add(
      "rear-right",
      "Rear right tilt",
      "tilt",
      TILT_OUTPUT_FUNCTIONS.rearRight,
      tilted.filter((motor) => motor.position.forward < 0 && motor.position.right > 0),
    );
    add(
      "front-center",
      "Front center tilt",
      "tilt",
      TILT_OUTPUT_FUNCTIONS.collective,
      tilted.filter((motor) => motor.position.forward >= 0 && motor.position.right === 0),
    );
    add(
      "rear-center",
      "Rear center tilt",
      "tilt",
      TILT_OUTPUT_FUNCTIONS.rearCollective,
      tilted.filter((motor) => motor.position.forward < 0 && motor.position.right === 0),
    );
  } else if (mechanism === "bicopter" || mechanism === "tailsitter_vectored") {
    add(
      "left-vector",
      "Left vector servo",
      "tilt",
      TILT_OUTPUT_FUNCTIONS.frontLeft,
      propulsors.filter((motor) => motor.position.right <= 0),
    );
    add(
      "right-vector",
      "Right vector servo",
      "tilt",
      TILT_OUTPUT_FUNCTIONS.frontRight,
      propulsors.filter((motor) => motor.position.right >= 0),
    );
  } else if (architecture.startsWith("tailsitter")) {
    add(
      "left-vector",
      "Optional left vector servo",
      "tilt",
      TILT_OUTPUT_FUNCTIONS.frontLeft,
      propulsors.filter((motor) => motor.position.right <= 0),
      false,
    );
    add(
      "right-vector",
      "Optional right vector servo",
      "tilt",
      TILT_OUTPUT_FUNCTIONS.frontRight,
      propulsors.filter((motor) => motor.position.right >= 0),
      false,
    );
  }

  if (frame?.frameClass === FrameClass.Tri && mechanism !== "vectored_yaw") {
    const yawServo = getMotorLayout(frame)?.yawServo;
    if (yawServo)
      add(
        "tri-yaw",
        yawServo.label,
        "yaw",
        ArduPilotServoFunction.TricopterYaw,
        propulsors.filter((motor) => motor.motorNumber === yawServo.controlsMotorNumber),
      );
  }

  return actuators;
}

function buildIssues(
  architecture: VtolArchitecture,
  mechanism: VtolMechanism,
  frameClass: FrameClass | null,
  propulsors: VtolPropulsor[],
  actuators: VtolActuator[],
  tiltMask: number,
  angleBoost: number | null,
): VtolValidationIssue[] {
  const issues: VtolValidationIssue[] = [];
  if (architecture === "unsupported" || (architecture === "tiltrotor" && mechanism === "custom")) {
    issues.push({
      id: "unsupported-vtol-type",
      severity: "danger",
      title: "Unsupported VTOL mechanism",
      detail:
        "The firmware reports a mechanism this application cannot interpret. Review its parameters before testing outputs.",
    });
  }
  if (architecture === "conflict") {
    issues.push({
      id: "architecture-conflict",
      severity: "danger",
      title: "Tiltrotor and tailsitter are both enabled",
      detail: "Choose one VTOL architecture before changing motor or output mappings.",
    });
  }
  if (architecture === "bicopter" && frameClass !== FrameClass.SingleDual) {
    issues.push({
      id: "bicopter-frame-class",
      severity: "danger",
      title: "Bicopter requires Single / Dual frame class",
      detail: "Set Q_FRAME_CLASS to 10; this is the ArduPilot bicopter special case.",
    });
  }
  if (architecture === "tiltrotor" && tiltMask === 0) {
    issues.push({
      id: "empty-tilt-mask",
      severity: "danger",
      title: "No motors are selected to tilt",
      detail: "Select every propeller moved by the tilt mechanism in the airframe diagram.",
    });
  }

  const validMotorMask = propulsors.reduce(
    (mask, propulsor) => (propulsor.motorNumber === null ? mask : mask | (1 << (propulsor.motorNumber - 1))),
    0,
  );
  if (architecture === "tiltrotor" && (tiltMask & ~validMotorMask) !== 0) {
    issues.push({
      id: "unknown-tilt-mask-bits",
      severity: "danger",
      title: "Tilt mask references motors outside this frame",
      detail: "Clear mask bits that do not correspond to propulsion motors in the selected hover layout.",
    });
  }

  for (const item of [...propulsors, ...actuators.filter((actuator) => actuator.required)]) {
    if (item.outputOwners.length === 0) {
      issues.push({
        id: `missing-output-${item.id}`,
        severity: "warning",
        title: `${item.label} has no physical output`,
        detail: `Assign its logical function ${item.functionValue} to a SERVO output after the topology refreshes.`,
      });
    }
  }

  for (const propulsor of propulsors) {
    if (propulsor.outputOwners.length > 1) {
      issues.push({
        id: `mirrored-output-${propulsor.id}`,
        severity: "warning",
        title: `${propulsor.label} has a mirrored motor command`,
        detail: `Function ${propulsor.functionValue} drives ${propulsor.outputOwners.map((owner) => `SERVO${owner.outputIndex}`).join(", ")}. This is supported, but unusual; verify the wiring and output protocol.`,
      });
    }
  }

  if (mechanism === "tailsitter_vectored" && angleBoost !== 0) {
    issues.push({
      id: "tailsitter-angle-boost",
      severity: "danger",
      title: "Vectored tailsitter requires angle boost off",
      detail: "Set Q_A_ANGLE_BOOST to 0 before flight; Q_TILT_TYPE is ignored for tailsitters.",
    });
  }
  return issues;
}

function buildSnapshot(input: VtolTopologyInput, proposed: boolean): VtolTopologySnapshot {
  const read = (name: string) => (proposed ? readProposedParameter(input, name) : readAppliedParameter(input.paramStore, name));
  const values = {
    Q_ENABLE: read("Q_ENABLE"),
    Q_FRAME_CLASS: read("Q_FRAME_CLASS"),
    Q_FRAME_TYPE: read("Q_FRAME_TYPE"),
    Q_TILT_ENABLE: read("Q_TILT_ENABLE"),
    Q_TILT_TYPE: read("Q_TILT_TYPE"),
    Q_TAILSIT_ENABLE: read("Q_TAILSIT_ENABLE"),
    Q_TAILSIT_MOTMX: read("Q_TAILSIT_MOTMX"),
  };
  const decodedFrame = decodeArduPilotFrame(values.Q_FRAME_CLASS, values.Q_FRAME_TYPE);
  const { frame, frameClass, parameters: frameParameters } = decodedFrame;
  const frameType = frame?.frameType ?? null;
  const architecture = architectureFor(values, frameClass);
  const mechanism = mechanismFor(architecture, decodeArduPilotTiltType(values.Q_TILT_TYPE), input, proposed);
  const tiltMask = normalizeMask(read("Q_TILT_MASK"));
  const tailsitterMotorMask = normalizeMask(values.Q_TAILSIT_MOTMX);
  const frameClassLabel =
    frameParameters.frameClass === null
      ? "Not selected"
      : frameClass === null
        ? `Class ${frameParameters.frameClass}`
        : (CLASS_NAME_BY_VALUE.get(frameClass) ?? frameClass);
  const layoutOptions = frameClass === null ? [] : getVtolFrameLayoutOptions(frameClass);
  const layoutOption = frameType === null ? null : (layoutOptions.find((option) => option.value === frameType) ?? null);
  const frameTypeIgnored = frameType === FrameType.NotApplicable || frameType === FrameType.ScriptDefined;
  const frameTypeLabel =
    frameType === FrameType.NotApplicable
      ? "Not applicable"
      : frameType === FrameType.ScriptDefined
        ? "Defined by script"
        : (layoutOption?.label ??
          (frameParameters.frameType === null ? "Not selected" : `Type ${frameParameters.frameType}`));

  let propulsors: VtolPropulsor[] = [];
  if (architecture === "bicopter" || architecture === "tailsitter_single_dual") {
    propulsors = buildSingleDualPropulsors(architecture, mechanism, input, proposed);
  } else if (frame !== null) {
    const layout = getMotorLayout(frame);
    propulsors = (layout?.motors ?? []).flatMap((motor) => {
      const propulsor = propulsorFromLayout(
        motor,
        tiltMask,
        tailsitterMotorMask,
        architecture,
        mechanism,
        input,
        proposed,
      );
      return propulsor ? [propulsor] : [];
    });
  }

  const actuators = buildActuators(architecture, mechanism, propulsors, frame, input, proposed);
  const supportedDiagram =
    architecture !== "custom" &&
    architecture !== "conflict" &&
    architecture !== "unsupported" &&
    mechanism !== "custom" &&
    propulsors.length > 0;
  return {
    architecture,
    architectureLabel: architectureLabel(architecture),
    mechanism,
    enabled: architecture !== "disabled",
    frame,
    frameParameters,
    frameClass,
    frameClassLabel,
    frameType,
    frameTypeLabel,
    frameTypeIgnored,
    tiltMask,
    tailsitterMotorMask,
    propulsors,
    actuators,
    issues: buildIssues(architecture, mechanism, frameClass, propulsors, actuators, tiltMask, read("Q_A_ANGLE_BOOST")),
    supportedDiagram,
  };
}

export function buildVtolTopologyModel(input: VtolTopologyInput): VtolTopologyModel {
  const stagedParamNames = Object.keys(input.stagedEdits);
  const pendingTopologyParams = stagedParamNames.filter((name) => TOPOLOGY_PARAM_NAMES.has(name));
  return {
    applied: buildSnapshot(input, false),
    proposed: buildSnapshot(input, true),
    hasProposedChanges:
      pendingTopologyParams.length > 0 || stagedParamNames.some((name) => /^SERVO\d+_FUNCTION$/.test(name)),
    hasTopologyChanges: pendingTopologyParams.length > 0,
    requiresRefreshBeforeMapping: pendingTopologyParams.some((name) => REFRESH_BOUNDARY_PARAM_NAMES.has(name)),
    pendingTopologyParams,
  };
}

export function toggleMotorMask(mask: number, motorNumber: number): number {
  if (!Number.isInteger(motorNumber) || motorNumber < 1 || motorNumber > 31) {
    return mask;
  }
  return mask ^ (1 << (motorNumber - 1));
}

export function architectureParameterValues(architecture: VtolArchitecture): Record<string, number> {
  switch (architecture) {
    case "standard":
      return { Q_ENABLE: 1, Q_TILT_ENABLE: 0, Q_TAILSIT_ENABLE: ArduPilotTailsitterMode.Disabled };
    case "tiltrotor":
      return {
        Q_ENABLE: 1,
        Q_TILT_ENABLE: 1,
        Q_TAILSIT_ENABLE: ArduPilotTailsitterMode.Disabled,
        Q_TILT_TYPE: ArduPilotTiltType.Continuous,
      };
    case "bicopter":
      return {
        Q_ENABLE: 1,
        Q_TILT_ENABLE: 1,
        Q_TAILSIT_ENABLE: ArduPilotTailsitterMode.Disabled,
        Q_TILT_TYPE: ArduPilotTiltType.Bicopter,
        Q_FRAME_CLASS: ArduPilotFrameClass.Tailsitter,
      };
    case "tailsitter_single_dual":
      return {
        Q_ENABLE: 1,
        Q_TILT_ENABLE: 0,
        Q_TAILSIT_ENABLE: ArduPilotTailsitterMode.Enabled,
        Q_TAILSIT_MOTMX: 0,
        Q_FRAME_CLASS: ArduPilotFrameClass.Tailsitter,
      };
    case "tailsitter_copter":
      return { Q_ENABLE: 1, Q_TILT_ENABLE: 0, Q_TAILSIT_ENABLE: ArduPilotTailsitterMode.Enabled };
    case "tailsitter_motor_only":
      return { Q_ENABLE: 1, Q_TILT_ENABLE: 0, Q_TAILSIT_ENABLE: ArduPilotTailsitterMode.MotorOnly };
    case "disabled":
      return { Q_ENABLE: 0 };
    default:
      return {};
  }
}

/** Compute staged wire edits in the model, so components never invent firmware codes. */
export function planVtolArchitectureChange(
  architecture: VtolArchitecture,
  current: VtolTopologySnapshot,
): Record<string, number> {
  const values = architectureParameterValues(architecture);
  const defaultFrame = encodeArduPilotFrame({ frameClass: FrameClass.Quad, frameType: FrameType.X });
  if (architecture === "tailsitter_copter") {
    const hasCopterLayout =
      current.frameClass !== null && current.frameClass !== FrameClass.SingleDual && current.propulsors.length > 0;
    if (!hasCopterLayout) {
      values.Q_FRAME_CLASS = defaultFrame.frameClass;
      values.Q_FRAME_TYPE = defaultFrame.frameType;
      values.Q_TAILSIT_MOTMX = 0b1111;
    } else if (current.tailsitterMotorMask === 0) {
      values.Q_TAILSIT_MOTMX = current.propulsors.reduce(
        (mask, motor) => (motor.motorNumber === null ? mask : mask | (1 << (motor.motorNumber - 1))),
        0,
      );
    }
  }
  if (architecture === "tailsitter_motor_only" && current.frameClass === FrameClass.SingleDual) {
    values.Q_FRAME_CLASS = defaultFrame.frameClass;
    values.Q_FRAME_TYPE = defaultFrame.frameType;
  }
  return values;
}

/** A class change keeps the existing wire type when the new backend accepts it. */
export function planVtolFrameClassChange(
  frameClass: FrameClass,
  current: VtolTopologySnapshot,
): Record<string, number> {
  const code = encodeArduPilotFrameClass(frameClass);
  const values: Record<string, number> = { Q_FRAME_CLASS: code };
  const options = getVtolFrameLayoutOptions(frameClass);
  const prospective = decodeArduPilotFrame(code, current.frameParameters.frameType).frame;
  if (options.length > 0 && !options.some((option) => option.value === prospective?.frameType)) {
    const frame = { frameClass, frameType: options[0].value };
    if (isAirframe(frame)) values.Q_FRAME_TYPE = encodeArduPilotFrame(frame).frameType;
  }
  return values;
}
