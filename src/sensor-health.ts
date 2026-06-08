import { EVENT_NAMES } from "./lib/generated/events";
import { typedListen, type UnlistenFn } from "./lib/ipc/client";
import type {
  MagCalProgress,
  MagCalReport,
  MagCalStatus,
  SensorHealthState as SensorStatus,
  SensorHealthSummary,
} from "./lib/generated/ironwing";
import { createLatestScopedValueHandler } from "./lib/scoped-session-events";
import type { DomainValue } from "./lib/domain-status";
import type { SessionEvent } from "./session";

export type { MagCalProgress, MagCalReport, MagCalStatus, SensorStatus };

export type SensorHealthState = SensorHealthSummary;

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

export async function subscribeSensorHealthState(
  cb: (domain: SensorHealthDomain) => void,
): Promise<UnlistenFn> {
  const handleEvent = createLatestScopedValueHandler(cb);
  return typedListen(EVENT_NAMES.SENSOR_HEALTH_STATE, (event) => handleEvent(event.payload));
}

export async function subscribeSensorHealthStateEvent(
  cb: (event: SessionEvent<SensorHealthDomain>) => void,
): Promise<UnlistenFn> {
  return typedListen(EVENT_NAMES.SENSOR_HEALTH_STATE, (event) => cb(event.payload));
}

export async function subscribeCompassCalProgress(cb: (progress: MagCalProgress) => void): Promise<UnlistenFn> {
  return typedListen(EVENT_NAMES.COMPASS_CAL_PROGRESS, (event) => cb(event.payload));
}

export async function subscribeCompassCalReport(cb: (report: MagCalReport) => void): Promise<UnlistenFn> {
  return typedListen(EVENT_NAMES.COMPASS_CAL_REPORT, (event) => cb(event.payload));
}
