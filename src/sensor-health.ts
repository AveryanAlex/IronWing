import { listen, type UnlistenFn } from "@platform/event";
import { createLatestScopedValueHandler } from "./lib/scoped-session-events";
import type { DomainValue } from "./lib/domain-status";
import type { SessionEvent } from "./session";

export type SensorStatus = "healthy" | "unhealthy" | "disabled" | "not_present";

export type SensorHealthState = {
  gyro: SensorStatus;
  accel: SensorStatus;
  mag: SensorStatus;
  baro: SensorStatus;
  gps: SensorStatus;
  airspeed: SensorStatus;
  rc_receiver: SensorStatus;
  battery: SensorStatus;
  terrain: SensorStatus;
  geofence: SensorStatus;
};

export type SensorHealth = SensorHealthState;

export type SensorHealthDomain = DomainValue<SensorHealthState>;

export type SensorId = keyof SensorHealthState;

export const SENSOR_KEYS: readonly SensorId[] = [
  "gyro", "accel", "mag", "baro", "gps",
  "airspeed", "rc_receiver", "battery", "terrain", "geofence",
] as const;

/** True when no sensor reports "unhealthy". */
export function isPreArmGood(health: SensorHealthState): boolean {
  return SENSOR_KEYS.every((k) => health[k] !== "unhealthy");
}

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

export async function subscribeSensorHealthState(
  cb: (domain: SensorHealthDomain) => void,
): Promise<UnlistenFn> {
  const handleEvent = createLatestScopedValueHandler(cb);
  return listen<SessionEvent<SensorHealthDomain>>("sensor_health://state", (event) => handleEvent(event.payload));
}

export async function subscribeSensorHealthStateEvent(
  cb: (event: SessionEvent<SensorHealthDomain>) => void,
): Promise<UnlistenFn> {
  return listen<SessionEvent<SensorHealthDomain>>("sensor_health://state", (event) => cb(event.payload));
}

export async function subscribeCompassCalProgress(cb: (progress: MagCalProgress) => void): Promise<UnlistenFn> {
  return listen<MagCalProgress>("compass://cal_progress", (event) => cb(event.payload));
}

export async function subscribeCompassCalReport(cb: (report: MagCalReport) => void): Promise<UnlistenFn> {
  return listen<MagCalReport>("compass://cal_report", (event) => cb(event.payload));
}
