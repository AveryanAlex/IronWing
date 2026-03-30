import type { Telemetry } from "../../../telemetry";
import type { ParamInputParams } from "../primitives/param-helpers";
import { getParamMeta, getStagedOrCurrent } from "../primitives/param-helpers";

export const SERVO_OUTPUT_COUNT = 32;
export const ACTUATED_SERVO_OUTPUT_COUNT = 16;
export const SERVO_COMMAND_PWM_MIN = 1000;
export const SERVO_COMMAND_PWM_MAX = 2000;

const MOTOR_FUNCTION_MIN = 33;
const MOTOR_FUNCTION_MAX = 40;
const SERVO_FUNCTION_DISABLED = 0;

export type ServoTestTarget = {
  index: number;
  outputLabel: string;
  functionValue: number;
  functionLabel: string;
  minPwm: number;
  maxPwm: number;
  trimPwm: number;
  defaultPwm: number;
  supported: boolean;
  unavailableReason: string | null;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function clampServoCommandPwm(value: number): number {
  return Math.max(
    SERVO_COMMAND_PWM_MIN,
    Math.min(SERVO_COMMAND_PWM_MAX, Math.round(value)),
  );
}

function clampWithinWindow(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, clampServoCommandPwm(value)));
}

export function isMotorServoFunction(functionValue: number | null): boolean {
  if (functionValue == null) return false;
  return functionValue >= MOTOR_FUNCTION_MIN && functionValue <= MOTOR_FUNCTION_MAX;
}

function resolveServoFunctionLabel(
  functionParamName: string,
  functionValue: number,
  params: ParamInputParams,
): string {
  const meta = getParamMeta(functionParamName, params.metadata);
  const label = meta?.values?.find((entry) => entry.code === functionValue)?.label;
  return label ?? `Function ${functionValue}`;
}

function resolveServoWindow(index: number, params: ParamInputParams) {
  const minValue = getStagedOrCurrent(`SERVO${index}_MIN`, params);
  const maxValue = getStagedOrCurrent(`SERVO${index}_MAX`, params);
  const trimValue = getStagedOrCurrent(`SERVO${index}_TRIM`, params);

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

export function deriveServoTestTargets(params: ParamInputParams): ServoTestTarget[] {
  const targets: ServoTestTarget[] = [];

  for (let index = 1; index <= SERVO_OUTPUT_COUNT; index++) {
    const functionParamName = `SERVO${index}_FUNCTION`;
    const functionValue = getStagedOrCurrent(functionParamName, params);

    if (!isFiniteNumber(functionValue) || functionValue <= SERVO_FUNCTION_DISABLED) {
      continue;
    }

    if (isMotorServoFunction(functionValue)) {
      continue;
    }

    const window = resolveServoWindow(index, params);
    const supported = index <= ACTUATED_SERVO_OUTPUT_COUNT;

    targets.push({
      index,
      outputLabel: `SERVO${index}`,
      functionValue,
      functionLabel: resolveServoFunctionLabel(functionParamName, functionValue, params),
      supported,
      unavailableReason: supported
        ? null
        : "Live testing is limited to SERVO1–16 by the current actuation bridge.",
      ...window,
    });
  }

  return targets;
}

export function readServoOutputPwm(
  servoIndex: number,
  telemetry: Telemetry | null,
): number | null {
  if (servoIndex < 1 || servoIndex > ACTUATED_SERVO_OUTPUT_COUNT) {
    return null;
  }

  const value = telemetry?.servo_outputs?.[servoIndex - 1];
  return isFiniteNumber(value) ? value : null;
}
