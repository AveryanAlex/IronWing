import { invoke } from "@tauri-apps/api/core";

export async function calibrateAccel(): Promise<void> {
  return invoke("calibrate_accel");
}

export async function calibrateGyro(): Promise<void> {
  return invoke("calibrate_gyro");
}
