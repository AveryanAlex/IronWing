import { getAllLayouts, getMotorLayout, type MotorLayout } from "../../data/motor-layouts";
import type { ParamStore } from "../../params";
import {
  TILT_OUTPUT_FUNCTIONS,
  THROTTLE_OUTPUT_FUNCTIONS,
  servoFunctionForMotor,
} from "./motor-functions";

export type VtolArchitecture =
  | "disabled"
  | "standard"
  | "tiltrotor"
  | "bicopter"
  | "tailsitter_single_dual"
  | "tailsitter_copter"
  | "tailsitter_motor_only"
  | "conflict"
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
  functionValue: number;
  functionParamName: string;
};

export type VtolPropulsor = {
  id: string;
  label: string;
  motorNumber: number | null;
  functionValue: number;
  rollFactor: number;
  pitchFactor: number;
  yawFactor: number;
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
  functionValue: number;
  controlsPropulsorIds: string[];
  required: boolean;
  outputOwners: VtolOutputOwner[];
};

export type VtolFrameLayoutOption = {
  id: string;
  value: number;
  label: string;
  description: string;
  matches: (frameType: number) => boolean;
};

export type VtolFrameClassOption = {
  value: number;
  label: string;
  description: string;
  custom: boolean;
};

export type VtolTopologySnapshot = {
  architecture: VtolArchitecture;
  architectureLabel: string;
  mechanism: VtolMechanism;
  enabled: boolean;
  frameClass: number | null;
  frameClassLabel: string;
  frameType: number | null;
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
  stagedEdits: Record<string, { nextValue: number } | undefined>;
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
  { value: 1, label: "Quad", description: "Four hover motors", custom: false },
  { value: 2, label: "Hexa", description: "Six hover motors", custom: false },
  { value: 3, label: "Octa", description: "Eight hover motors", custom: false },
  { value: 4, label: "OctaQuad", description: "Eight coaxial hover motors", custom: false },
  { value: 5, label: "Y6", description: "Six coaxial motors on three arms", custom: false },
  { value: 7, label: "Tri", description: "Three propellers plus a yaw actuator", custom: false },
  { value: 10, label: "Single / Dual", description: "Tailsitter or bicopter special case", custom: false },
  { value: 12, label: "DodecaHexa", description: "Twelve coaxial motors", custom: false },
  { value: 14, label: "Deca", description: "Ten hover motors", custom: false },
  { value: 15, label: "Scripting Matrix", description: "Geometry is supplied by a Lua script", custom: true },
  { value: 17, label: "Dynamic Scripting Matrix", description: "Runtime geometry is supplied by a Lua script", custom: true },
] as const;

const TRI_LAYOUT_OPTIONS: readonly VtolFrameLayoutOption[] = [
  {
    id: "tri-standard",
    value: 0,
    label: "Standard Tri",
    description: "Q_FRAME_TYPE is otherwise ignored for Tri",
    matches: (frameType) => frameType !== 6,
  },
  {
    id: "tri-pitch-reversed",
    value: 6,
    label: "Pitch reversed",
    description: "Reverses the front/rear pitch mixer",
    matches: (frameType) => frameType === 6,
  },
];

const Y6_LAYOUT_OPTIONS: readonly VtolFrameLayoutOption[] = [
  {
    id: "y6-a",
    value: 0,
    label: "Y6A",
    description: "Default Y6 arrangement",
    matches: (frameType) => frameType !== 10 && frameType !== 11,
  },
  {
    id: "y6-b",
    value: 10,
    label: "Y6B",
    description: "Y6B motor arrangement",
    matches: (frameType) => frameType === 10,
  },
  {
    id: "y6-firefly",
    value: 11,
    label: "FireFly Y6",
    description: "Y6F / FireFly motor arrangement",
    matches: (frameType) => frameType === 11,
  },
];

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
    "X/CW_X": "X / Clockwise X",
  };

  return aliases[value] ?? value.replace(/_/g, " ").toLowerCase().replace(/^./, (letter: string) => letter.toUpperCase());
}

export function getVtolFrameClassOptions(): readonly VtolFrameClassOption[] {
  return FRAME_CLASS_OPTIONS;
}

export function getVtolFrameLayoutOptions(frameClass: number): readonly VtolFrameLayoutOption[] {
  if (frameClass === 7) {
    return TRI_LAYOUT_OPTIONS;
  }

  if (frameClass === 5) {
    return Y6_LAYOUT_OPTIONS;
  }

  if (frameClass === 10 || frameClass === 15 || frameClass === 17) {
    return [];
  }

  if (frameClass === 14) {
    return [
      {
        id: "deca-plus",
        value: 0,
        label: "Plus",
        description: "Deca Plus motor mixing",
        matches: (frameType) => frameType === 0,
      },
      {
        id: "deca-x",
        value: 1,
        label: "X / Clockwise X",
        description: "Equivalent Deca X values are shown as one layout",
        matches: (frameType) => frameType === 1 || frameType === 14,
      },
    ];
  }

  const layouts = getAllLayouts()
    .filter((layout) => layout.frameClass === frameClass)
    .sort((left, right) => left.frameType - right.frameType);

  const seen = new Set<number>();
  return layouts.flatMap((layout) => {
    if (seen.has(layout.frameType)) {
      return [];
    }
    seen.add(layout.frameType);
    return [{
      id: `${frameClass}-${layout.frameType}`,
      value: layout.frameType,
      label: titleCaseLayout(layout.typeName),
      description: `${CLASS_NAME_BY_VALUE.get(frameClass) ?? "Frame"} motor mixing`,
      matches: (frameType: number) => frameType === layout.frameType,
    } satisfies VtolFrameLayoutOption];
  });
}

function currentValue(input: VtolTopologyInput, name: string): number | null {
  const value = input.paramStore?.params[name]?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function proposedValue(input: VtolTopologyInput, name: string): number | null {
  const staged = input.stagedEdits[name]?.nextValue;
  return typeof staged === "number" && Number.isFinite(staged) ? staged : currentValue(input, name);
}

function isEnabled(value: number | null): boolean {
  return value !== null && value > 0;
}

function readOutputOwners(input: VtolTopologyInput, functionValue: number, proposed: boolean): VtolOutputOwner[] {
  const owners: VtolOutputOwner[] = [];
  for (let outputIndex = 1; outputIndex <= 32; outputIndex += 1) {
    const functionParamName = `SERVO${outputIndex}_FUNCTION`;
    const value = proposed ? proposedValue(input, functionParamName) : currentValue(input, functionParamName);
    if (value === functionValue) {
      owners.push({ outputIndex, functionValue, functionParamName });
    }
  }
  return owners;
}

function architectureFor(values: Record<string, number | null>): VtolArchitecture {
  if (!isEnabled(values.Q_ENABLE)) {
    return "disabled";
  }

  const tiltEnabled = isEnabled(values.Q_TILT_ENABLE);
  const tailsitterEnabled = isEnabled(values.Q_TAILSIT_ENABLE);
  if (tiltEnabled && tailsitterEnabled) {
    return "conflict";
  }
  if (tiltEnabled && values.Q_TILT_TYPE === 3) {
    return "bicopter";
  }
  if (tiltEnabled) {
    return "tiltrotor";
  }
  if (tailsitterEnabled) {
    if (values.Q_TAILSIT_ENABLE === 2) {
      return "tailsitter_motor_only";
    }
    return (values.Q_TAILSIT_MOTMX ?? 0) > 0 ? "tailsitter_copter" : "tailsitter_single_dual";
  }
  if (values.Q_FRAME_CLASS === 15 || values.Q_FRAME_CLASS === 17) {
    return "custom";
  }
  return "standard";
}

function architectureLabel(architecture: VtolArchitecture): string {
  switch (architecture) {
    case "disabled": return "VTOL disabled";
    case "standard": return "Lift + cruise QuadPlane";
    case "tiltrotor": return "Tiltrotor / tiltwing";
    case "bicopter": return "Bicopter tiltrotor";
    case "tailsitter_single_dual": return "Single / dual motor tailsitter";
    case "tailsitter_copter": return "Copter-motor tailsitter";
    case "tailsitter_motor_only": return "Motor-only tailsitter";
    case "conflict": return "Conflicting VTOL architecture";
    case "custom": return "Scripted motor matrix";
  }
}

function mechanismFor(
  architecture: VtolArchitecture,
  tiltType: number | null,
  input: VtolTopologyInput,
  proposed: boolean,
): VtolMechanism {
  if (architecture === "bicopter") return "bicopter";
  if (architecture === "tiltrotor") {
    if (tiltType === 1) return "binary";
    if (tiltType === 2) return "vectored_yaw";
    return "continuous";
  }
  if (architecture.startsWith("tailsitter")) {
    const leftTilt = readOutputOwners(input, TILT_OUTPUT_FUNCTIONS.frontLeft, proposed).length > 0;
    const rightTilt = readOutputOwners(input, TILT_OUTPUT_FUNCTIONS.frontRight, proposed).length > 0;
    return leftTilt || rightTilt ? "tailsitter_vectored" : "tailsitter_fixed";
  }
  if (architecture === "custom" || architecture === "conflict") return "custom";
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
    rollFactor: motor.rollFactor,
    pitchFactor: motor.pitchFactor,
    yawFactor: motor.yawFactor,
    testOrder: motor.testOrder,
    tilts: architecture === "tiltrotor"
      ? maskIncludes(tiltMask, motor.motorNumber)
      : mechanism === "tailsitter_vectored",
    forwardActive: architecture === "tailsitter_motor_only"
      || (architecture === "tailsitter_copter" && maskIncludes(forwardMask, motor.motorNumber)),
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
    return [customPropulsor("throttle", "Main motor", THROTTLE_OUTPUT_FUNCTIONS.throttle, 0, 0, mechanism === "tailsitter_vectored", input, proposed)];
  }

  return [
    customPropulsor("left-throttle", "Left motor", THROTTLE_OUTPUT_FUNCTIONS.left, -0.75, 0, mechanism === "tailsitter_vectored", input, proposed),
    customPropulsor("right-throttle", "Right motor", THROTTLE_OUTPUT_FUNCTIONS.right, 0.75, 0, mechanism === "tailsitter_vectored", input, proposed),
  ];
}

function customPropulsor(
  id: string,
  label: string,
  functionValue: number,
  rollFactor: number,
  pitchFactor: number,
  tilts: boolean,
  input: VtolTopologyInput,
  proposed: boolean,
): VtolPropulsor {
  return {
    id,
    label,
    motorNumber: null,
    functionValue,
    rollFactor,
    pitchFactor,
    yawFactor: 0,
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
  frameClass: number | null,
  input: VtolTopologyInput,
  proposed: boolean,
): VtolActuator[] {
  const actuators: VtolActuator[] = [];
  const tilted = propulsors.filter((propulsor) => propulsor.tilts);

  const add = (
    id: string,
    label: string,
    kind: VtolActuatorKind,
    functionValue: number,
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
    add("front-collective", "Front tilt", "tilt", TILT_OUTPUT_FUNCTIONS.frontCollective, tilted.filter((motor) => motor.pitchFactor >= 0));
    add("rear-collective", "Rear tilt", "tilt", TILT_OUTPUT_FUNCTIONS.rearCollective, tilted.filter((motor) => motor.pitchFactor < 0));
  } else if (mechanism === "vectored_yaw") {
    add("front-left", "Front left tilt", "tilt", TILT_OUTPUT_FUNCTIONS.frontLeft, tilted.filter((motor) => motor.pitchFactor >= 0 && motor.rollFactor < 0));
    add("front-right", "Front right tilt", "tilt", TILT_OUTPUT_FUNCTIONS.frontRight, tilted.filter((motor) => motor.pitchFactor >= 0 && motor.rollFactor > 0));
    add("rear-left", "Rear left tilt", "tilt", TILT_OUTPUT_FUNCTIONS.rearLeft, tilted.filter((motor) => motor.pitchFactor < 0 && motor.rollFactor < 0));
    add("rear-right", "Rear right tilt", "tilt", TILT_OUTPUT_FUNCTIONS.rearRight, tilted.filter((motor) => motor.pitchFactor < 0 && motor.rollFactor > 0));
  } else if (mechanism === "bicopter" || mechanism === "tailsitter_vectored") {
    add("left-vector", "Left vector servo", "tilt", TILT_OUTPUT_FUNCTIONS.frontLeft, propulsors.filter((motor) => motor.rollFactor <= 0));
    add("right-vector", "Right vector servo", "tilt", TILT_OUTPUT_FUNCTIONS.frontRight, propulsors.filter((motor) => motor.rollFactor >= 0));
  } else if (architecture.startsWith("tailsitter")) {
    add("left-vector", "Optional left vector servo", "tilt", TILT_OUTPUT_FUNCTIONS.frontLeft, propulsors.filter((motor) => motor.rollFactor <= 0), false);
    add("right-vector", "Optional right vector servo", "tilt", TILT_OUTPUT_FUNCTIONS.frontRight, propulsors.filter((motor) => motor.rollFactor >= 0), false);
  }

  if (frameClass === 7 && mechanism !== "vectored_yaw") {
    add("rear-yaw", "Rear yaw servo", "yaw", 39, propulsors.filter((motor) => motor.motorNumber === 4));
  }

  return actuators;
}

function buildIssues(
  architecture: VtolArchitecture,
  mechanism: VtolMechanism,
  frameClass: number | null,
  propulsors: VtolPropulsor[],
  actuators: VtolActuator[],
  tiltMask: number,
  angleBoost: number | null,
): VtolValidationIssue[] {
  const issues: VtolValidationIssue[] = [];
  if (architecture === "conflict") {
    issues.push({
      id: "architecture-conflict",
      severity: "danger",
      title: "Tiltrotor and tailsitter are both enabled",
      detail: "Choose one VTOL architecture before changing motor or output mappings.",
    });
  }
  if (architecture === "bicopter" && frameClass !== 10) {
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
    (mask, propulsor) => propulsor.motorNumber === null ? mask : mask | (1 << (propulsor.motorNumber - 1)),
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
    } else if (item.outputOwners.length > 1) {
      issues.push({
        id: `duplicate-output-${item.id}`,
        severity: "danger",
        title: `${item.label} is assigned more than once`,
        detail: `Function ${item.functionValue} owns ${item.outputOwners.map((owner) => `SERVO${owner.outputIndex}`).join(", ")}. Keep exactly one assignment.`,
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
  const read = (name: string) => proposed ? proposedValue(input, name) : currentValue(input, name);
  const values = {
    Q_ENABLE: read("Q_ENABLE"),
    Q_FRAME_CLASS: read("Q_FRAME_CLASS"),
    Q_FRAME_TYPE: read("Q_FRAME_TYPE"),
    Q_TILT_ENABLE: read("Q_TILT_ENABLE"),
    Q_TILT_TYPE: read("Q_TILT_TYPE"),
    Q_TAILSIT_ENABLE: read("Q_TAILSIT_ENABLE"),
    Q_TAILSIT_MOTMX: read("Q_TAILSIT_MOTMX"),
  };
  const architecture = architectureFor(values);
  const mechanism = mechanismFor(architecture, values.Q_TILT_TYPE, input, proposed);
  const frameClass = values.Q_FRAME_CLASS;
  const frameType = values.Q_FRAME_TYPE;
  const tiltMask = normalizeMask(read("Q_TILT_MASK"));
  const tailsitterMotorMask = normalizeMask(values.Q_TAILSIT_MOTMX);
  const frameClassLabel = frameClass === null ? "Not selected" : CLASS_NAME_BY_VALUE.get(frameClass) ?? `Class ${frameClass}`;
  const layoutOptions = frameClass === null ? [] : getVtolFrameLayoutOptions(frameClass);
  const layoutOption = frameType === null ? null : layoutOptions.find((option) => option.matches(frameType)) ?? null;
  const frameTypeIgnored = layoutOptions.length === 0 || frameClass === 7 || frameClass === 5;
  const frameTypeLabel = frameTypeIgnored && frameClass === 10
    ? "Not applicable"
    : layoutOption?.label ?? (frameType === null ? "Not selected" : `Type ${frameType}`);

  let propulsors: VtolPropulsor[] = [];
  if (architecture === "bicopter" || architecture === "tailsitter_single_dual") {
    propulsors = buildSingleDualPropulsors(architecture, mechanism, input, proposed);
  } else if (frameClass !== null && frameType !== null) {
    const lookupType = frameClass === 7 && frameType !== 6
      ? 0
      : frameClass === 5 && frameType !== 10 && frameType !== 11
        ? 0
        : frameType;
    const layout = getMotorLayout(frameClass, lookupType);
    propulsors = (layout?.motors ?? [])
      .filter((motor) => !(frameClass === 7 && motor.motorNumber === 7))
      .flatMap((motor) => {
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

  const actuators = buildActuators(architecture, mechanism, propulsors, frameClass, input, proposed);
  const supportedDiagram = architecture !== "custom" && architecture !== "conflict" && propulsors.length > 0;
  return {
    architecture,
    architectureLabel: architectureLabel(architecture),
    mechanism,
    enabled: architecture !== "disabled",
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
    hasProposedChanges: pendingTopologyParams.length > 0 || stagedParamNames.some((name) => /^SERVO\d+_FUNCTION$/.test(name)),
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
      return { Q_ENABLE: 1, Q_TILT_ENABLE: 0, Q_TAILSIT_ENABLE: 0 };
    case "tiltrotor":
      return { Q_ENABLE: 1, Q_TILT_ENABLE: 1, Q_TAILSIT_ENABLE: 0, Q_TILT_TYPE: 0 };
    case "bicopter":
      return { Q_ENABLE: 1, Q_TILT_ENABLE: 1, Q_TAILSIT_ENABLE: 0, Q_TILT_TYPE: 3, Q_FRAME_CLASS: 10 };
    case "tailsitter_single_dual":
      return { Q_ENABLE: 1, Q_TILT_ENABLE: 0, Q_TAILSIT_ENABLE: 1, Q_TAILSIT_MOTMX: 0, Q_FRAME_CLASS: 10 };
    case "tailsitter_copter":
      return { Q_ENABLE: 1, Q_TILT_ENABLE: 0, Q_TAILSIT_ENABLE: 1 };
    case "tailsitter_motor_only":
      return { Q_ENABLE: 1, Q_TILT_ENABLE: 0, Q_TAILSIT_ENABLE: 2 };
    case "disabled":
      return { Q_ENABLE: 0 };
    default:
      return {};
  }
}
