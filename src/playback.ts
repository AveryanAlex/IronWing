import type { GpsFixType } from "./lib/generated/mavkit";
import { EVENT_NAMES } from "./lib/generated/events";
import type * as Generated from "./lib/generated/ironwing";
import type * as GeneratedJson from "./lib/generated/ironwing-json";
import { typedInvoke, typedListen, type UnlistenFn } from "./lib/ipc/client";
import type { LogDiagnostic } from "./logs";
import type { SessionEvent } from "./session";
import type { Telemetry, VehicleState } from "./telemetry";

export type FlightPathPoint = {
  timestamp_usec: number;
  lat: number;
  lon: number;
  alt: number;
  heading: number;
};

export type TelemetrySnapshot = GeneratedJson.LogTelemetrySnapshot;

export type ReplayStatus = Generated.ReplayStatus;

export type ReplayState = Omit<GeneratedJson.PlaybackState, "available_speeds" | "diagnostic" | "speed"> & {
  speed: number;
  available_speeds: number[];
  diagnostic: LogDiagnostic | null;
};

export type PlaybackStateSnapshot = ReplayState;

export type PlaybackSeekResult = GeneratedJson.PlaybackSeekResult;

export async function getFlightPath(
  maxPoints?: number,
): Promise<FlightPathPoint[]> {
  return typedInvoke("log_get_flight_path", {
    maxPoints: maxPoints ?? null,
  });
}

export async function getLogTelemetryTrack(
  maxPoints?: number,
): Promise<TelemetrySnapshot[]> {
  return typedInvoke("log_get_telemetry_track", {
    maxPoints: maxPoints ?? null,
  });
}

export async function playPlayback(): Promise<PlaybackStateSnapshot> {
  return typedInvoke("playback_play");
}

export async function pausePlayback(): Promise<PlaybackStateSnapshot> {
  return typedInvoke("playback_pause");
}

export async function seekPlayback(cursorUsec: number | null): Promise<PlaybackSeekResult> {
  return typedInvoke("playback_seek", { cursorUsec });
}

export async function setPlaybackSpeed(speed: number): Promise<PlaybackStateSnapshot> {
  return typedInvoke("playback_set_speed", { speed });
}

export async function stopPlayback(): Promise<PlaybackStateSnapshot> {
  return typedInvoke("playback_stop");
}

export async function subscribePlaybackState(
  cb: (event: SessionEvent<PlaybackStateSnapshot>) => void,
): Promise<UnlistenFn> {
  return typedListen(EVENT_NAMES.PLAYBACK_STATE, (event) => cb(event.payload));
}

function lerpOpt(
  a: number | null | undefined,
  b: number | null | undefined,
  t: number,
): number | null {
  if (a == null) return b ?? null;
  if (b == null) return a;
  return a + (b - a) * t;
}

function binarySearchLeft(
  track: TelemetrySnapshot[],
  timeUsec: number,
): number {
  let lo = 0;
  let hi = track.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (track[mid].timestamp_usec <= timeUsec) lo = mid;
    else hi = mid;
  }
  return lo;
}

export type InterpolatedState = {
  telemetry: Telemetry;
  vehicleState: VehicleState | null;
};

export function interpolateLogTelemetry(
  track: TelemetrySnapshot[],
  timeUsec: number,
): InterpolatedState | null {
  if (track.length === 0) return null;

  let snap: TelemetrySnapshot;

  if (timeUsec <= track[0].timestamp_usec) {
    snap = track[0];
  } else if (timeUsec >= track[track.length - 1].timestamp_usec) {
    snap = track[track.length - 1];
  } else {
    const lo = binarySearchLeft(track, timeUsec);
    const a = track[lo];
    const b = track[lo + 1];
    const t =
      (timeUsec - a.timestamp_usec) / (b.timestamp_usec - a.timestamp_usec);

    snap = {
      ...a,
      timestamp_usec: timeUsec,
      latitude_deg: lerpOpt(a.latitude_deg, b.latitude_deg, t),
      longitude_deg: lerpOpt(a.longitude_deg, b.longitude_deg, t),
      altitude_m: lerpOpt(a.altitude_m, b.altitude_m, t),
      heading_deg: lerpOpt(a.heading_deg, b.heading_deg, t),
      speed_mps: lerpOpt(a.speed_mps, b.speed_mps, t),
      airspeed_mps: lerpOpt(a.airspeed_mps, b.airspeed_mps, t),
      climb_rate_mps: lerpOpt(a.climb_rate_mps, b.climb_rate_mps, t),
      roll_deg: lerpOpt(a.roll_deg, b.roll_deg, t),
      pitch_deg: lerpOpt(a.pitch_deg, b.pitch_deg, t),
      yaw_deg: lerpOpt(a.yaw_deg, b.yaw_deg, t),
      battery_pct: lerpOpt(a.battery_pct, b.battery_pct, t),
      battery_voltage_v: lerpOpt(a.battery_voltage_v, b.battery_voltage_v, t),
      battery_current_a: lerpOpt(a.battery_current_a, b.battery_current_a, t),
      energy_consumed_wh: lerpOpt(
        a.energy_consumed_wh,
        b.energy_consumed_wh,
        t,
      ),
      gps_satellites: lerpOpt(a.gps_satellites, b.gps_satellites, t),
      gps_hdop: lerpOpt(a.gps_hdop, b.gps_hdop, t),
      throttle_pct: lerpOpt(a.throttle_pct, b.throttle_pct, t),
      wp_dist_m: lerpOpt(a.wp_dist_m, b.wp_dist_m, t),
      nav_bearing_deg: lerpOpt(a.nav_bearing_deg, b.nav_bearing_deg, t),
      target_bearing_deg: lerpOpt(
        a.target_bearing_deg,
        b.target_bearing_deg,
        t,
      ),
      xtrack_error_m: lerpOpt(a.xtrack_error_m, b.xtrack_error_m, t),
      rc_rssi: lerpOpt(a.rc_rssi, b.rc_rssi, t),
      gps_fix_type: a.gps_fix_type,
      armed: a.armed,
      custom_mode: a.custom_mode,
      rc_channels: a.rc_channels,
      servo_outputs: a.servo_outputs,
    };
  }

  const telemetry: Telemetry = {
    altitude_m: snap.altitude_m ?? undefined,
    speed_mps: snap.speed_mps ?? undefined,
    heading_deg: snap.heading_deg ?? undefined,
    latitude_deg: snap.latitude_deg ?? undefined,
    longitude_deg: snap.longitude_deg ?? undefined,
    battery_pct: snap.battery_pct ?? undefined,
    gps_fix_type: snap.gps_fix_type ?? undefined,
    climb_rate_mps: snap.climb_rate_mps ?? undefined,
    throttle_pct: snap.throttle_pct ?? undefined,
    airspeed_mps: snap.airspeed_mps ?? undefined,
    battery_voltage_v: snap.battery_voltage_v ?? undefined,
    battery_current_a: snap.battery_current_a ?? undefined,
    gps_satellites: snap.gps_satellites ?? undefined,
    gps_hdop: snap.gps_hdop ?? undefined,
    roll_deg: snap.roll_deg ?? undefined,
    pitch_deg: snap.pitch_deg ?? undefined,
    yaw_deg: snap.yaw_deg ?? undefined,
    wp_dist_m: snap.wp_dist_m ?? undefined,
    nav_bearing_deg: snap.nav_bearing_deg ?? undefined,
    target_bearing_deg: snap.target_bearing_deg ?? undefined,
    xtrack_error_m: snap.xtrack_error_m ?? undefined,
    energy_consumed_wh: snap.energy_consumed_wh ?? undefined,
    battery_voltage_cells: snap.battery_voltage_cells?.filter((value): value is number => value !== null),
    battery_time_remaining_s: snap.battery_time_remaining_s ?? undefined,
    terrain_height_m: snap.terrain_height_m ?? undefined,
    height_above_terrain_m: snap.height_above_terrain_m ?? undefined,
    rc_channels: snap.rc_channels ?? undefined,
    rc_rssi: snap.rc_rssi ?? undefined,
    servo_outputs: snap.servo_outputs ?? undefined,
  };

  const vehicleState: VehicleState | null =
    snap.armed != null && snap.custom_mode != null
      ? {
          armed: snap.armed,
          custom_mode: snap.custom_mode,
          mode_name: `Mode ${snap.custom_mode}`,
          system_status: "active",
          vehicle_type: "unknown",
          autopilot: "unknown",
          firmware_version: null,
          system_id: 0,
          component_id: 0,
          heartbeat_received: false,
        }
      : null;

  return { telemetry, vehicleState };
}
