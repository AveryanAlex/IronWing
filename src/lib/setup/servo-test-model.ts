import { readChannelPwm, SERVO_TELEMETRY_CHANNEL_COUNT, SERVO_PARAMETER_OUTPUT_COUNT } from "../telemetry-channels";
import type { FrameClass } from "../airframe";
import { ArduPilotServoFunction, permitsDirectServoCommand } from "../ardupilot/servo-functions";
import type { Telemetry } from "../../telemetry";
import type { ParamMetadataMap } from "../../param-metadata";
import type { ParamStore } from "../../params";
import { isPropulsionServoFunction, isTricopterYawFunction, outputFrameClass } from "./motor-functions";

export const SERVO_OUTPUT_COUNT = SERVO_PARAMETER_OUTPUT_COUNT;
export const SERVO_LIVE_TEST_LIMIT = SERVO_TELEMETRY_CHANNEL_COUNT;
export const SERVO_COMMAND_PWM_MIN = 1000;
export const SERVO_COMMAND_PWM_MAX = 2000;

export type ServoGroupingSubtype = "standard" | "tiltrotor" | "tailsitter" | "compound" | null;
export type ServoLiveTestStatus =
  | "available"
  | "unsupported-bridge"
  | "motor-function"
  | "assigned-function"
  | "invalid-window";
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
  commandMinPwm: number;
  commandMaxPwm: number;
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

function currentParamValue(input: ServoParamsInput, name: string): number | null {
  return input.paramStore?.params[name]?.value ?? null;
}

function clampWithinWindow(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function resolveServoWindow(index: number, input: ServoParamsInput) {
  const minValue = currentParamValue(input, `SERVO${index}_MIN`);
  const maxValue = currentParamValue(input, `SERVO${index}_MAX`);
  const trimValue = currentParamValue(input, `SERVO${index}_TRIM`);

  const minPwm = isFiniteNumber(minValue) ? Math.round(minValue) : SERVO_COMMAND_PWM_MIN;
  const maxPwm = isFiniteNumber(maxValue) ? Math.round(maxValue) : SERVO_COMMAND_PWM_MAX;
  const trimPwm = isFiniteNumber(trimValue) ? Math.round(trimValue) : Math.round((minPwm + maxPwm) / 2);
  const commandMinPwm = Math.max(SERVO_COMMAND_PWM_MIN, minPwm);
  const commandMaxPwm = Math.min(SERVO_COMMAND_PWM_MAX, maxPwm);
  return {
    minPwm,
    maxPwm,
    trimPwm,
    commandMinPwm,
    commandMaxPwm,
    defaultPwm: clampWithinWindow(trimPwm, commandMinPwm, commandMaxPwm),
  };
}

function resolveServoFunctionLabel(
  functionParamName: string,
  functionValue: number,
  metadata: ParamMetadataMap | null,
): { label: string; known: boolean } {
  const label = metadata
    ?.get(functionParamName)
    ?.values?.find((entry) => entry.code === functionValue)
    ?.label?.trim();
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

function resolveLiveTestStatus(
  index: number,
  functionValue: number,
  isMotorFunction: boolean,
): {
  supported: boolean;
  liveTestStatus: ServoLiveTestStatus;
  liveTestReason: string | null;
} {
  if (isMotorFunction) {
    return {
      supported: false,
      liveTestStatus: "motor-function",
      liveTestReason: "Motor-assigned outputs are listed here, but live motor actuation belongs in Motors & ESC.",
    };
  }

  // AP_ServoRelayEvents::do_set_servo rejects outputs owned by control laws.
  if (!permitsDirectServoCommand(functionValue)) {
    return {
      supported: false,
      liveTestStatus: "assigned-function",
      liveTestReason:
        "This function owns the output. Check its motion through the transmitter and the documented vehicle setup procedure; direct PWM testing is unavailable.",
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

/** Validate without substituting a different PWM for a named endpoint. */
export function canSendServoPwm(output: ServoConfiguredOutput, pwm: number): boolean {
  return output.supported && Number.isInteger(pwm) && pwm >= output.commandMinPwm && pwm <= output.commandMaxPwm;
}

export function clampServoCommandPwm(value: number): number {
  return Math.max(SERVO_COMMAND_PWM_MIN, Math.min(SERVO_COMMAND_PWM_MAX, Math.round(value)));
}

export function isMotorServoFunction(functionValue: number | null, frameClass: FrameClass | null = null): boolean {
  return isPropulsionServoFunction(functionValue, frameClass);
}

export function deriveConfiguredServoOutputs(input: ServoParamsInput): ServoConfiguredOutput[] {
  const outputs: ServoConfiguredOutput[] = [];

  for (let index = 1; index <= SERVO_OUTPUT_COUNT; index += 1) {
    const functionParamName = `SERVO${index}_FUNCTION`;
    const functionValue = currentParamValue(input, functionParamName);

    if (!isFiniteNumber(functionValue) || functionValue < 0) {
      continue;
    }

    const { label, known } = resolveServoFunctionLabel(functionParamName, functionValue, input.metadata);
    const frameClass = outputFrameClass(input.paramStore);
    const isMotorFunction = isMotorServoFunction(functionValue, frameClass);
    const window = resolveServoWindow(index, input);
    let testStatus = resolveLiveTestStatus(index, functionValue, isMotorFunction);
    if (testStatus.supported && window.commandMinPwm > window.commandMaxPwm) {
      testStatus = {
        supported: false,
        liveTestStatus: "invalid-window",
        liveTestReason: "The configured PWM range does not intersect the supported 1000–2000 µs command range.",
      };
    }

    outputs.push({
      index,
      outputLabel: `SERVO${index}`,
      functionValue,
      functionLabel: isTricopterYawFunction(functionValue, frameClass)
        ? "Tricopter yaw servo"
        : functionValue === ArduPilotServoFunction.Disabled
          ? "Disabled (direct PWM)"
          : label,
      functionLabelKnown: known,
      isMotorFunction,
      ...window,
      ...testStatus,
    });
  }

  return outputs;
}

export function deriveServoTestTargets(input: ServoParamsInput): ServoTestTarget[] {
  return deriveConfiguredServoOutputs(input).filter((output) => output.supported);
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
      title:
        subtype === "tiltrotor"
          ? "VTOL transition & tilt outputs"
          : subtype === "tailsitter"
            ? "Tailsitter control outputs"
            : "VTOL control outputs",
      description:
        subtype === "tiltrotor"
          ? "These outputs look like tilt or transition servos for this VTOL layout."
          : subtype === "tailsitter"
            ? "These outputs look like tailsitter surfaces or transition servos."
            : "These outputs look VTOL-specific and stay grouped here without hiding the remaining configured outputs.",
      kind: "vtol",
      outputs: vtolOutputs,
    });
  }

  if (motorOutputs.length > 0) {
    groups.push({
      id: "motors",
      title: "Auto-assigned lift motors",
      description: "Motor functions are listed here for inspection, but live actuation belongs in Motors & ESC.",
      kind: "motor",
      outputs: motorOutputs,
    });
  }

  if (generalOutputs.length > 0 || groups.length === 0) {
    groups.push({
      id: "general",
      title: groups.length === 0 ? "Configured outputs" : "Other configured outputs",
      description:
        groups.length === 0
          ? "All configured outputs are shown in one list."
          : "Outputs without a VTOL-specific label are grouped here for inspection.",
      kind: "general",
      outputs: generalOutputs,
    });
  }

  return groups.filter((group) => group.outputs.length > 0);
}

export function readServoOutputPwm(servoIndex: number, telemetry: Telemetry | null): number | null {
  if (servoIndex < 1 || servoIndex > SERVO_LIVE_TEST_LIMIT) {
    return null;
  }

  const value = readChannelPwm(telemetry?.servo_outputs, servoIndex);
  return value === null ? null : Math.round(value);
}
