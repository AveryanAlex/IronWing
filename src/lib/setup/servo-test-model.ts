import type { Telemetry } from "../../telemetry";
import type { ParamMetadataMap } from "../../param-metadata";
import type { ParamStore } from "../../params";

export const SERVO_OUTPUT_COUNT = 32;
export const SERVO_LIVE_TEST_LIMIT = 16;
export const SERVO_COMMAND_PWM_MIN = 1000;
export const SERVO_COMMAND_PWM_MAX = 2000;

const MOTOR_FUNCTION_MIN = 33;
const MOTOR_FUNCTION_MAX = 40;
const SERVO_FUNCTION_DISABLED = 0;

export type ServoGroupingSubtype = "standard" | "tiltrotor" | "tailsitter" | "compound" | null;
export type ServoLiveTestStatus = "available" | "unsupported-bridge" | "motor-function";
export type ServoOutputGroupKind = "vtol" | "motor" | "general";

export type ServoParamsInput = {
  paramStore: ParamStore | null;
  metadata: ParamMetadataMap | null;
};

export type ServoConfiguredOutput = {
  index: number;
  outputLabel: string;
  functionValue: number;
  functionLabel: string;
  functionLabelKnown: boolean;
  minPwm: number;
  maxPwm: number;
  trimPwm: number;
  defaultPwm: number;
  reverseParamName: string | null;
  isMotorFunction: boolean;
  supported: boolean;
  liveTestStatus: ServoLiveTestStatus;
  liveTestReason: string | null;
};

export type ServoTestTarget = ServoConfiguredOutput;

export type ServoFunctionGroup = {
  id: string;
  functionValue: number;
  functionLabel: string;
  targets: ServoTestTarget[];
};

export type ServoOutputGroup = {
  id: string;
  title: string;
  description: string;
  kind: ServoOutputGroupKind;
  outputs: ServoConfiguredOutput[];
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasParam(input: ServoParamsInput, name: string): boolean {
  return input.paramStore?.params[name] !== undefined;
}

function currentParamValue(input: ServoParamsInput, name: string): number | null {
  return input.paramStore?.params[name]?.value ?? null;
}

function clampWithinWindow(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, clampServoCommandPwm(value)));
}

function resolveServoWindow(index: number, input: ServoParamsInput) {
  const minValue = currentParamValue(input, `SERVO${index}_MIN`);
  const maxValue = currentParamValue(input, `SERVO${index}_MAX`);
  const trimValue = currentParamValue(input, `SERVO${index}_TRIM`);

  const clampedMin = isFiniteNumber(minValue)
    ? clampServoCommandPwm(minValue)
    : SERVO_COMMAND_PWM_MIN;
  const clampedMax = isFiniteNumber(maxValue)
    ? clampServoCommandPwm(maxValue)
    : SERVO_COMMAND_PWM_MAX;

  const minPwm = clampedMin <= clampedMax ? clampedMin : SERVO_COMMAND_PWM_MIN;
  const maxPwm = clampedMin <= clampedMax ? clampedMax : SERVO_COMMAND_PWM_MAX;
  const trimPwm = isFiniteNumber(trimValue)
    ? clampWithinWindow(trimValue, minPwm, maxPwm)
    : clampWithinWindow((minPwm + maxPwm) / 2, minPwm, maxPwm);

  return {
    minPwm,
    maxPwm,
    trimPwm,
    defaultPwm: trimPwm,
  };
}

function resolveServoFunctionLabel(
  functionParamName: string,
  functionValue: number,
  metadata: ParamMetadataMap | null,
): { label: string; known: boolean } {
  const label = metadata?.get(functionParamName)?.values?.find((entry) => entry.code === functionValue)?.label?.trim();
  if (label) {
    return {
      label,
      known: true,
    };
  }

  return {
    label: `Function ${functionValue}`,
    known: false,
  };
}

function resolveLiveTestStatus(index: number, isMotorFunction: boolean): {
  supported: boolean;
  liveTestStatus: ServoLiveTestStatus;
  liveTestReason: string | null;
} {
  if (isMotorFunction) {
    return {
      supported: false,
      liveTestStatus: "motor-function",
      liveTestReason: "Motor-assigned outputs stay visible for inventory truth here, but live motor actuation belongs in Motors & ESC.",
    };
  }

  if (index > SERVO_LIVE_TEST_LIMIT) {
    return {
      supported: false,
      liveTestStatus: "unsupported-bridge",
      liveTestReason: "Live testing is limited to SERVO1–16 by the current actuation bridge.",
    };
  }

  return {
    supported: true,
    liveTestStatus: "available",
    liveTestReason: null,
  };
}

function matchesVtolServoKeyword(label: string, subtype: ServoGroupingSubtype): boolean {
  const normalized = label.trim().toLowerCase();
  if (!normalized || normalized.startsWith("function ")) {
    return false;
  }

  if (subtype === "tiltrotor") {
    return /tilt|vector|transition/.test(normalized);
  }

  if (subtype === "tailsitter") {
    return /tailsit|elevon|v-tail|ruddervator|vector/.test(normalized);
  }

  if (subtype === "compound") {
    return /tilt|transition|vtol|elevon|tailsit|vector/.test(normalized);
  }

  return /vtol|tilt|transition/.test(normalized);
}

export function clampServoCommandPwm(value: number): number {
  return Math.max(
    SERVO_COMMAND_PWM_MIN,
    Math.min(SERVO_COMMAND_PWM_MAX, Math.round(value)),
  );
}

export function isMotorServoFunction(functionValue: number | null): boolean {
  if (functionValue == null) {
    return false;
  }

  return functionValue >= MOTOR_FUNCTION_MIN && functionValue <= MOTOR_FUNCTION_MAX;
}

export function deriveConfiguredServoOutputs(input: ServoParamsInput): ServoConfiguredOutput[] {
  const outputs: ServoConfiguredOutput[] = [];

  for (let index = 1; index <= SERVO_OUTPUT_COUNT; index += 1) {
    const functionParamName = `SERVO${index}_FUNCTION`;
    const functionValue = currentParamValue(input, functionParamName);

    if (!isFiniteNumber(functionValue) || functionValue <= SERVO_FUNCTION_DISABLED) {
      continue;
    }

    const { label, known } = resolveServoFunctionLabel(functionParamName, functionValue, input.metadata);
    const isMotorFunction = isMotorServoFunction(functionValue);
    const testStatus = resolveLiveTestStatus(index, isMotorFunction);

    outputs.push({
      index,
      outputLabel: `SERVO${index}`,
      functionValue,
      functionLabel: label,
      functionLabelKnown: known,
      reverseParamName: hasParam(input, `SERVO${index}_REVERSED`) ? `SERVO${index}_REVERSED` : null,
      isMotorFunction,
      ...resolveServoWindow(index, input),
      ...testStatus,
    });
  }

  return outputs;
}

export function deriveServoTestTargets(input: ServoParamsInput): ServoTestTarget[] {
  return deriveConfiguredServoOutputs(input).filter((output) => !output.isMotorFunction);
}

export function groupServoTestTargetsByFunction(targets: ServoTestTarget[]): ServoFunctionGroup[] {
  const groups = new Map<number, ServoFunctionGroup>();

  for (const target of targets) {
    let group = groups.get(target.functionValue);
    if (!group) {
      group = {
        id: `function-${target.functionValue}`,
        functionValue: target.functionValue,
        functionLabel: target.functionLabel,
        targets: [],
      };
      groups.set(target.functionValue, group);
    }

    group.targets.push(target);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      targets: [...group.targets].sort((left, right) => left.index - right.index),
    }))
    .sort((left, right) => left.targets[0].index - right.targets[0].index);
}

export function deriveServoOutputGroups(
  outputs: ServoConfiguredOutput[],
  subtype: ServoGroupingSubtype,
): ServoOutputGroup[] {
  const vtolOutputs: ServoConfiguredOutput[] = [];
  const motorOutputs: ServoConfiguredOutput[] = [];
  const generalOutputs: ServoConfiguredOutput[] = [];

  for (const output of outputs) {
    if (output.isMotorFunction) {
      motorOutputs.push(output);
      continue;
    }

    if (subtype && output.functionLabelKnown && matchesVtolServoKeyword(output.functionLabel, subtype)) {
      vtolOutputs.push(output);
      continue;
    }

    generalOutputs.push(output);
  }

  const groups: ServoOutputGroup[] = [];

  if (vtolOutputs.length > 0) {
    groups.push({
      id: "vtol",
      title: subtype === "tiltrotor"
        ? "VTOL transition & tilt outputs"
        : subtype === "tailsitter"
          ? "Tailsitter control outputs"
          : "VTOL control outputs",
      description: subtype === "tiltrotor"
        ? "These outputs look like tilt or transition servos. Keep them visible here even when other VTOL metadata is still settling."
        : subtype === "tailsitter"
          ? "These outputs look like tailsitter surfaces or transition servos. Keep them visible even when the current metadata is only partially labeled."
          : "These outputs look VTOL-specific and stay grouped here without hiding the remaining configured outputs.",
      kind: "vtol",
      outputs: vtolOutputs,
    });
  }

  if (motorOutputs.length > 0) {
    groups.push({
      id: "motors",
      title: "Auto-assigned lift motors",
      description: "Motor functions stay visible for inventory truth here, but live actuation belongs in Motors & ESC.",
      kind: "motor",
      outputs: motorOutputs,
    });
  }

  if (generalOutputs.length > 0 || groups.length === 0) {
    groups.push({
      id: "general",
      title: groups.length === 0 ? "Configured outputs" : "Other configured outputs",
      description: groups.length === 0
        ? "All configured outputs stay visible here so partial or missing metadata never hides them."
        : "Outputs without trustworthy VTOL labels fall back here so partial metadata never hides them.",
      kind: "general",
      outputs: generalOutputs,
    });
  }

  return groups.filter((group) => group.outputs.length > 0);
}

export function readServoOutputPwm(
  servoIndex: number,
  telemetry: Telemetry | null,
): number | null {
  if (servoIndex < 1 || servoIndex > SERVO_LIVE_TEST_LIMIT) {
    return null;
  }

  const value = telemetry?.servo_outputs?.[servoIndex - 1];
  return isFiniteNumber(value) ? value : null;
}
