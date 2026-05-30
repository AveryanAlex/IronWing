import type { ParameterItemModel } from "../params/parameter-item-model";
import { clampNumber } from "./rate-curves";
import { resolveRcMappedChannel, type RcChannelSample } from "./rc-input-normalization";

export const COPTER_THROTTLE_CONTROL_MAX = 1000;

export type CopterThrottleResponseInput = {
  throttleControl: number;
  throttleMid: number;
  throttleDeadZone: number;
  pilotSpeedUpMps: number;
  pilotSpeedDownMps: number;
};

export type CopterThrottleDeadband = {
  bottom: number;
  top: number;
};

export type CopterThrottleResponsePoint = {
  throttleControl: number;
  climbRateMps: number;
};

export type CopterThrottleRangeCalibration = {
  min: number;
  max: number;
  deadZone: number;
  reversed: boolean;
};

export type CopterThrottleMarker = {
  channel: number;
  pwm: number;
  stale: boolean;
  throttleControl: number;
  throttleMid: number;
};

type ValueResolver = (name: string) => number | null;

/** Models ArduCopter's static AltHold-style throttle-to-climb-rate mapping. */
export function copterThrottleToClimbRateMps(input: CopterThrottleResponseInput): number {
  const throttleControl = clampNumber(input.throttleControl, 0, COPTER_THROTTLE_CONTROL_MAX);
  const deadband = resolveCopterThrottleDeadband(input.throttleMid, input.throttleDeadZone);
  const speedUpMps = positiveMagnitude(input.pilotSpeedUpMps);
  const speedDownMps = resolveCopterPilotSpeedDownMps(input.pilotSpeedDownMps, speedUpMps);

  if (throttleControl < deadband.bottom) {
    return speedDownMps * (throttleControl - deadband.bottom) / deadband.bottom;
  }

  if (throttleControl > deadband.top) {
    return speedUpMps * (throttleControl - deadband.top) / (COPTER_THROTTLE_CONTROL_MAX - deadband.top);
  }

  return 0;
}

export function resolveCopterThrottleDeadband(throttleMid: number, throttleDeadZone: number): CopterThrottleDeadband {
  const mid = clampNumber(throttleMid, 0, COPTER_THROTTLE_CONTROL_MAX);
  const deadZone = clampNumber(throttleDeadZone, 0, 400);
  return {
    bottom: clampNumber(mid - deadZone, 0, COPTER_THROTTLE_CONTROL_MAX),
    top: clampNumber(mid + deadZone, 0, COPTER_THROTTLE_CONTROL_MAX),
  };
}

/** A zero PILOT_SPD_DN delegates to PILOT_SPD_UP in current ArduCopter. */
export function resolveCopterPilotSpeedDownMps(pilotSpeedDownMps: number, pilotSpeedUpMps: number): number {
  const speedDownMps = positiveMagnitude(pilotSpeedDownMps);
  return speedDownMps === 0 ? positiveMagnitude(pilotSpeedUpMps) : speedDownMps;
}

export function sampleCopterThrottleResponse(
  input: Omit<CopterThrottleResponseInput, "throttleControl">,
  samples = 81,
): CopterThrottleResponsePoint[] {
  const sampleCount = Math.max(3, samples);
  const deadband = resolveCopterThrottleDeadband(input.throttleMid, input.throttleDeadZone);
  const controls = [
    ...Array.from({ length: sampleCount }, (_, index) => COPTER_THROTTLE_CONTROL_MAX * index / (sampleCount - 1)),
    deadband.bottom,
    deadband.top,
  ];

  return [...new Set(controls)]
    .sort((left, right) => left - right)
    .map((throttleControl) => ({
      throttleControl,
      climbRateMps: copterThrottleToClimbRateMps({ ...input, throttleControl }),
    }));
}

/** Models RC_Channel::pwm_to_range() after Copter configures throttle as 0..1000. */
export function pwmToCopterThrottleControl(
  pwm: number,
  calibration: Partial<CopterThrottleRangeCalibration> = {},
): number {
  const resolved = normalizeThrottleCalibration(calibration);
  let constrainedPwm = clampNumber(pwm, resolved.min, resolved.max);
  if (resolved.reversed) {
    constrainedPwm = resolved.max - (constrainedPwm - resolved.min);
  }

  const radioTrimLow = resolved.min + resolved.deadZone;
  if (constrainedPwm <= radioTrimLow) {
    return 0;
  }

  return COPTER_THROTTLE_CONTROL_MAX * (constrainedPwm - radioTrimLow) / (resolved.max - radioTrimLow);
}

/** Models RC_Channel::get_control_mid() for Copter's throttle range channel. */
export function copterThrottleControlMidpoint(
  calibration: Partial<CopterThrottleRangeCalibration> = {},
): number {
  const resolved = normalizeThrottleCalibration(calibration);
  const rangeMidpointPwm = Math.trunc((resolved.min + resolved.max) / 2);
  const radioTrimLow = resolved.min + resolved.deadZone;
  return Math.trunc(COPTER_THROTTLE_CONTROL_MAX * (rangeMidpointPwm - radioTrimLow) / (resolved.max - radioTrimLow));
}

export function resolveCopterThrottleMarker(input: {
  channels: readonly RcChannelSample[];
  itemIndex: ReadonlyMap<string, ParameterItemModel>;
  resolveValue?: ValueResolver;
}): CopterThrottleMarker | null {
  const resolveValue = input.resolveValue ?? ((name: string) => input.itemIndex.get(name)?.value ?? null);
  const channel = resolveRcMappedChannel("throttle", input.itemIndex, resolveValue);
  if (channel == null) {
    return null;
  }

  const sample = input.channels.find((entry) => entry.channel === channel);
  if (!sample || !Number.isFinite(sample.pwm)) {
    return null;
  }

  const calibration = readThrottleCalibration(channel, input.itemIndex, resolveValue);
  return {
    channel,
    pwm: sample.pwm,
    stale: sample.stale === true,
    throttleControl: pwmToCopterThrottleControl(sample.pwm, calibration),
    throttleMid: copterThrottleControlMidpoint(calibration),
  };
}

export function resolveCopterThrottleControlMidpoint(input: {
  itemIndex: ReadonlyMap<string, ParameterItemModel>;
  resolveValue?: ValueResolver;
}): number | null {
  const resolveValue = input.resolveValue ?? ((name: string) => input.itemIndex.get(name)?.value ?? null);
  const channel = resolveRcMappedChannel("throttle", input.itemIndex, resolveValue);
  if (channel == null) {
    return null;
  }

  return copterThrottleControlMidpoint(readThrottleCalibration(channel, input.itemIndex, resolveValue));
}

function readThrottleCalibration(
  channel: number,
  itemIndex: ReadonlyMap<string, ParameterItemModel>,
  resolveValue: ValueResolver,
): CopterThrottleRangeCalibration {
  const prefix = `RC${channel}_`;
  const read = (suffix: string, fallback: number) => {
    const value = resolveValue(`${prefix}${suffix}`) ?? itemIndex.get(`${prefix}${suffix}`)?.value;
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  };

  return normalizeThrottleCalibration({
    min: read("MIN", 1100),
    max: read("MAX", 1900),
    deadZone: read("DZ", 30),
    reversed: read("REVERSED", 0) >= 0.5,
  });
}

function normalizeThrottleCalibration(
  calibration: Partial<CopterThrottleRangeCalibration>,
): CopterThrottleRangeCalibration {
  const requestedMin = clampNumber(calibration.min ?? 1100, 500, 3000);
  const requestedMax = clampNumber(calibration.max ?? 1900, 500, 3000);
  const min = Math.min(requestedMin, requestedMax - 1);
  const max = Math.max(requestedMax, min + 1);
  const deadZone = clampNumber(calibration.deadZone ?? 30, 0, max - min - 1);
  return {
    min,
    max,
    deadZone,
    reversed: calibration.reversed === true,
  };
}

function positiveMagnitude(value: number): number {
  return Number.isFinite(value) ? Math.abs(value) : 0;
}
