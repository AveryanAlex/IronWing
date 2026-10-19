import type { GeoPoint3d, MissionItem } from "./mavkit-types";

type Vec2 = { x: number; y: number };
const PHOTO_COUNT_EPSILON_M = 1e-9;

export function createWaypointItem(position: GeoPoint3d, hold_time_s = 0): MissionItem {
  return {
    command: {
      Nav: {
        Waypoint: {
          position,
          hold_time_s,
          acceptance_radius_m: 1,
          pass_radius_m: 0,
          yaw_deg: 0,
        },
      },
    },
    current: false,
    autocontinue: true,
  };
}

export function createTriggerDistanceItem(meters: number, trigger_now: boolean): MissionItem {
  return {
    command: {
      Do: {
        CamTriggerDistance: {
          meters,
          trigger_now,
        },
      },
    },
    current: false,
    autocontinue: true,
  };
}

export function createImageStartCaptureItem(): MissionItem {
  return {
    command: {
      Do: {
        ImageStartCapture: {
          instance: 0,
          interval_s: 0,
          total_images: 1,
          start_number: 0,
        },
      },
    },
    current: false,
    autocontinue: true,
  };
}

export function photoCountForTransect(length_m: number, triggerDistance_m: number): number {
  if (triggerDistance_m <= 0) {
    return 0;
  }
  return Math.max(1, Math.floor((length_m + PHOTO_COUNT_EPSILON_M) / triggerDistance_m) + 1);
}

export function samplePhotoPoints(start: Vec2, end: Vec2, triggerDistance_m: number): Vec2[] {
  const length_m = Math.hypot(end.x - start.x, end.y - start.y);
  const photoCount = photoCountForTransect(length_m, triggerDistance_m);
  if (photoCount <= 1 || length_m === 0) {
    return [start];
  }

  return Array.from({ length: photoCount }, (_, index) => {
    const distance_m = Math.min(index * triggerDistance_m, length_m);
    const t = length_m === 0 ? 0 : distance_m / length_m;
    return {
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
    };
  });
}
