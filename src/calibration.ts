import { EVENT_NAMES } from "./lib/generated/events";
import type { CalibrationLifecycle, CalibrationState, CalibrationStep } from "./lib/generated/ironwing";
import { typedInvoke, typedListen, type UnlistenFn } from "./lib/ipc/client";
import { createLatestScopedValueHandler } from "./lib/scoped-session-events";
import type { DomainValue } from "./lib/domain-status";
import type { MagCalProgress, MagCalReport } from "./sensor-health";
import type { SessionEvent } from "./session";

export type RcOverrideChannelValue =
  | { kind: "ignore" }
  | { kind: "release" }
  | { kind: "pwm"; pwm_us: number };

export type RcOverrideChannel = {
  channel: number;
  value: RcOverrideChannelValue;
};

export type { CalibrationLifecycle, CalibrationState, CalibrationStep };

export type CalibrationDomain = DomainValue<CalibrationState>;

export async function subscribeCalibrationState(
  cb: (domain: CalibrationDomain) => void,
): Promise<UnlistenFn> {
  const handleEvent = createLatestScopedValueHandler(cb);
  return typedListen(EVENT_NAMES.CALIBRATION_STATE, (event) => handleEvent(event.payload));
}

export async function subscribeCalibrationStateEvent(
  cb: (event: SessionEvent<CalibrationDomain>) => void,
): Promise<UnlistenFn> {
  return typedListen(EVENT_NAMES.CALIBRATION_STATE, (event) => cb(event.payload));
}

export async function calibrateAccel(): Promise<void> {
  return typedInvoke("calibrate_accel");
}

export async function calibrateGyro(): Promise<void> {
  return typedInvoke("calibrate_gyro");
}

export function calibrateCompassStart(compassMask: number = 0): Promise<void> {
  return typedInvoke("calibrate_compass_start", { compassMask });
}

export function calibrateCompassAccept(compassMask: number = 0): Promise<void> {
  return typedInvoke("calibrate_compass_accept", { compassMask });
}

export function calibrateCompassCancel(compassMask: number = 0): Promise<void> {
  return typedInvoke("calibrate_compass_cancel", { compassMask });
}

export function motorTest(motorInstance: number, throttlePct: number, durationS: number): Promise<void> {
  return typedInvoke("motor_test", { motorInstance, throttlePct, durationS });
}

export function setServo(instance: number, pwmUs: number): Promise<void> {
  return typedInvoke("set_servo", { instance, pwmUs });
}

/**
 * RC overrides are transient; callers must resend at their required control cadence.
 */
export function rcOverride(channels: RcOverrideChannel[]): Promise<void> {
  return typedInvoke("rc_override", { channels });
}

export function rebootVehicle(): Promise<void> {
  return typedInvoke("reboot_vehicle");
}

export function requestPrearmChecks(): Promise<void> {
  return typedInvoke("request_prearm_checks");
}
