import { invoke } from "@platform/core";
import { listen, type UnlistenFn } from "@platform/event";
import type { SessionEnvelope, SessionEvent } from "./session";
import type { Telemetry, VehicleState } from "./telemetry";

export type FlightPathPoint = {
  timestamp_usec: number;
  lat: number;
  lon: number;
  alt: number;
  heading: number;
};

export type TelemetrySnapshot = {
  timestamp_usec: number;
  latitude_deg?: number;
  longitude_deg?: number;
  altitude_m?: number;
  heading_deg?: number;
  speed_mps?: number;
  airspeed_mps?: number;
  climb_rate_mps?: number;
  roll_deg?: number;
  pitch_deg?: number;
  yaw_deg?: number;
  battery_pct?: number;
  battery_voltage_v?: number;
  battery_current_a?: number;
  energy_consumed_wh?: number;
  gps_fix_type?: string;
  gps_satellites?: number;
  gps_hdop?: number;
  throttle_pct?: number;
  wp_dist_m?: number;
  nav_bearing_deg?: number;
  target_bearing_deg?: number;
  xtrack_error_m?: number;
  armed?: boolean;
  custom_mode?: number;
  rc_channels?: number[];
  rc_rssi?: number;
  servo_outputs?: number[];
};

export type PlaybackStateSnapshot = {
  cursor_usec: number | null;
  barrier_ready: boolean;
};

export type PlaybackStateEvent = SessionEvent<PlaybackStateSnapshot>;

export type PlaybackSeekResult = {
  envelope: SessionEnvelope;
  cursor_usec: number | null;
};

export async function getFlightPath(
  maxPoints?: number,
): Promise<FlightPathPoint[]> {
  return invoke<FlightPathPoint[]>("log_get_flight_path", {
    maxPoints: maxPoints ?? null,
  });
}

export async function getLogTelemetryTrack(
  maxPoints?: number,
): Promise<TelemetrySnapshot[]> {
  return invoke<TelemetrySnapshot[]>("log_get_telemetry_track", {
    maxPoints: maxPoints ?? null,
  });
}

export async function seekPlayback(cursorUsec: number): Promise<PlaybackSeekResult> {
  return invoke<PlaybackSeekResult>("playback_seek", { cursorUsec });
}

export async function subscribePlaybackState(
  cb: (event: PlaybackStateEvent) => void,
): Promise<UnlistenFn> {
  return listen<PlaybackStateEvent>("playback://state", (event) => cb(event.payload));
}

function lerpOpt(
  a: number | undefined,
  b: number | undefined,
  t: number,
): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
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
    altitude_m: snap.altitude_m,
    speed_mps: snap.speed_mps,
    heading_deg: snap.heading_deg,
    latitude_deg: snap.latitude_deg,
    longitude_deg: snap.longitude_deg,
    battery_pct: snap.battery_pct,
    gps_fix_type: snap.gps_fix_type,
    climb_rate_mps: snap.climb_rate_mps,
    throttle_pct: snap.throttle_pct,
    airspeed_mps: snap.airspeed_mps,
    battery_voltage_v: snap.battery_voltage_v,
    battery_current_a: snap.battery_current_a,
    gps_satellites: snap.gps_satellites,
    gps_hdop: snap.gps_hdop,
    roll_deg: snap.roll_deg,
    pitch_deg: snap.pitch_deg,
    yaw_deg: snap.yaw_deg,
    wp_dist_m: snap.wp_dist_m,
    nav_bearing_deg: snap.nav_bearing_deg,
    target_bearing_deg: snap.target_bearing_deg,
    xtrack_error_m: snap.xtrack_error_m,
    energy_consumed_wh: snap.energy_consumed_wh,
    rc_channels: snap.rc_channels,
    rc_rssi: snap.rc_rssi,
    servo_outputs: snap.servo_outputs,
  };

  const vehicleState: VehicleState | null =
    snap.armed !== undefined && snap.custom_mode !== undefined
      ? {
          armed: snap.armed,
          custom_mode: snap.custom_mode,
          mode_name: `Mode ${snap.custom_mode}`,
          system_status: "active",
          vehicle_type: "",
          autopilot: "",
          system_id: 0,
          component_id: 0,
          heartbeat_received: false,
        }
      : null;

  return { telemetry, vehicleState };
}
