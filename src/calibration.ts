import { invoke } from "@platform/core";
import { listen, type UnlistenFn } from "@platform/event";
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

export type CalibrationLifecycle = "not_started" | "running" | "complete" | "failed";

export type CalibrationStep = {
  lifecycle: CalibrationLifecycle;
  progress: MagCalProgress | null;
  report: MagCalReport | null;
};

export type CalibrationState = {
  accel: CalibrationStep | null;
  compass: CalibrationStep | null;
  radio: CalibrationStep | null;
};

export type CalibrationDomain = DomainValue<CalibrationState>;

export async function subscribeCalibrationState(
  cb: (domain: CalibrationDomain) => void,
): Promise<UnlistenFn> {
  const handleEvent = createLatestScopedValueHandler(cb);
  return listen<SessionEvent<CalibrationDomain>>("calibration://state", (event) => handleEvent(event.payload));
}

export async function subscribeCalibrationStateEvent(
  cb: (event: SessionEvent<CalibrationDomain>) => void,
): Promise<UnlistenFn> {
  return listen<SessionEvent<CalibrationDomain>>("calibration://state", (event) => cb(event.payload));
}

export async function calibrateAccel(): Promise<void> {
  return invoke("calibrate_accel");
}

export async function calibrateGyro(): Promise<void> {
  return invoke("calibrate_gyro");
}

export function calibrateCompassStart(compassMask: number = 0): Promise<void> {
  return invoke("calibrate_compass_start", { compassMask });
}

export function calibrateCompassAccept(compassMask: number = 0): Promise<void> {
  return invoke("calibrate_compass_accept", { compassMask });
}

export function calibrateCompassCancel(compassMask: number = 0): Promise<void> {
  return invoke("calibrate_compass_cancel", { compassMask });
}

export function motorTest(motorInstance: number, throttlePct: number, durationS: number): Promise<void> {
  return invoke("motor_test", { motorInstance, throttlePct, durationS });
}

export function setServo(instance: number, pwmUs: number): Promise<void> {
  return invoke("set_servo", { instance, pwmUs });
}

/**
 * RC overrides are transient; callers must resend at their required control cadence.
 */
export function rcOverride(channels: RcOverrideChannel[]): Promise<void> {
  return invoke("rc_override", { channels });
}

export function rebootVehicle(): Promise<void> {
  return invoke("reboot_vehicle");
}

export function requestPrearmChecks(): Promise<void> {
  return invoke("request_prearm_checks");
}
