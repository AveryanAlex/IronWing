import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type SensorId = "gyro_3d" | "accel_3d" | "mag_3d" | "absolute_pressure" | "gps" | "optical_flow" | "range_finder" | "external_ground_truth" | "motor_outputs" | "rc_receiver" | "prearm_check" | "ahrs" | "terrain" | "reverse_motor" | "logging" | "battery";

export type SensorStatus = "healthy" | "unhealthy" | "disabled" | "not_present";

export type SensorHealth = {
  sensors: [SensorId, SensorStatus][];
  pre_arm_good: boolean;
};

export type MagCalStatus = "not_started" | "waiting_to_start" | "running_step_one" | "running_step_two" | "success" | "failed" | "bad_orientation" | "bad_radius";

export type MagCalProgress = {
  compass_id: number;
  completion_pct: number;
  status: MagCalStatus;
  attempt: number;
};

export type MagCalReport = {
  compass_id: number;
  status: MagCalStatus;
  fitness: number;
  ofs_x: number;
  ofs_y: number;
  ofs_z: number;
  autosaved: boolean;
};

export async function subscribeSensorHealth(cb: (health: SensorHealth) => void): Promise<UnlistenFn> {
  return listen<SensorHealth>("sensor://health", (event) => cb(event.payload));
}

export async function subscribeCompassCalProgress(cb: (progress: MagCalProgress) => void): Promise<UnlistenFn> {
  return listen<MagCalProgress>("compass://cal_progress", (event) => cb(event.payload));
}

export async function subscribeCompassCalReport(cb: (report: MagCalReport) => void): Promise<UnlistenFn> {
  return listen<MagCalReport>("compass://cal_report", (event) => cb(event.payload));
}
