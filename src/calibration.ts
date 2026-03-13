import { invoke } from "@platform/core";

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

export function rebootVehicle(): Promise<void> {
  return invoke("reboot_vehicle");
}

export function requestPrearmChecks(): Promise<void> {
  return invoke("request_prearm_checks");
}
