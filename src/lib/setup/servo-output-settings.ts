import type { ParameterItemModel } from "../params/parameter-item-model";
import { SERVO_COMMAND_PWM_MAX, SERVO_COMMAND_PWM_MIN } from "./servo-test-model";

export type ServoPwmPoint = "min" | "mid" | "max";
type ProposedEdits = Record<string, { nextValue: number } | undefined>;

export type ServoPwmSetting = {
  point: ServoPwmPoint;
  label: string;
  paramName: string;
  item: ParameterItemModel | null;
  value: number | null;
  min: number;
  max: number | null;
  sliderMin: number;
  sliderMax: number;
};

export function buildServoOutputSettings(
  outputIndex: number,
  itemIndex: ReadonlyMap<string, ParameterItemModel>,
  stagedEdits: ProposedEdits,
): ServoPwmSetting[] {
  const points = [
    { point: "min", suffix: "MIN", label: "Min PWM" },
    { point: "mid", suffix: "TRIM", label: "Mid PWM" },
    { point: "max", suffix: "MAX", label: "Max PWM" },
  ] as const;
  const settings = points.map(({ point, suffix, label }) => {
    const paramName = `SERVO${outputIndex}_${suffix}`;
    const item = itemIndex.get(paramName) ?? null;
    const value = item ? stagedEdits[paramName]?.nextValue ?? item.value : null;
    return {
      point,
      label,
      paramName,
      item,
      value,
      min: item?.range?.min ?? 0,
      max: item?.range?.max ?? null,
    };
  });

  return settings.map((setting, index) => {
    const lowerValues = settings.slice(0, index).flatMap(({ value }) => value === null ? [] : [value]);
    const upperValues = settings.slice(index + 1).flatMap(({ value }) => value === null ? [] : [value]);
    const min = Math.max(setting.min, ...lowerValues);
    const max = Math.min(setting.max ?? Number.POSITIVE_INFINITY, ...upperValues);
    const sliderMin = setting.item?.range?.min
      ?? Math.min(SERVO_COMMAND_PWM_MIN, setting.value ?? SERVO_COMMAND_PWM_MIN);
    const sliderMax = setting.item?.range?.max
      ?? Math.max(SERVO_COMMAND_PWM_MAX, setting.value ?? SERVO_COMMAND_PWM_MAX);
    return {
      ...setting,
      min,
      max: Number.isFinite(max) ? max : null,
      sliderMin: Math.max(min, sliderMin),
      sliderMax: Math.min(max, sliderMax),
    };
  });
}

export function servoPwmValidationError(setting: ServoPwmSetting, value: number): string | null {
  if (!Number.isInteger(value)) return "Enter a whole PWM value in µs.";
  if (value < setting.min || (setting.max !== null && value > setting.max)) {
    const range = setting.max === null ? `at least ${setting.min}` : `${setting.min}–${setting.max}`;
    return `Use ${range} µs. Keep Min ≤ Mid ≤ Max.`;
  }
  return null;
}
