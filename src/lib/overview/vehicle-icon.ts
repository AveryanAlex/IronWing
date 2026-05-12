export type VehicleIconKind =
  | "fixed_wing"
  | "multirotor"
  | "helicopter"
  | "rover"
  | "boat";

const MAV_TYPE_FIXED_WING = new Set([1, 7, 16, 22]);
const MAV_TYPE_MULTIROTOR = new Set([2, 13, 14, 15]);
const MAV_TYPE_HELICOPTER = new Set([4, 6, 19, 20]);
const MAV_TYPE_ROVER = new Set([10]);
const MAV_TYPE_BOAT = new Set([11, 12]);

export function resolveVehicleIconKind(mavType: number | undefined): VehicleIconKind {
  if (typeof mavType !== "number") return "fixed_wing";
  if (MAV_TYPE_MULTIROTOR.has(mavType)) return "multirotor";
  if (MAV_TYPE_HELICOPTER.has(mavType)) return "helicopter";
  if (MAV_TYPE_ROVER.has(mavType)) return "rover";
  if (MAV_TYPE_BOAT.has(mavType)) return "boat";
  return "fixed_wing";
}

export const VEHICLE_ICON_SVG: Record<VehicleIconKind, string> = {
  fixed_wing: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M16 2 L19 14 L30 16 L30 18 L19 18 L19 24 L23 27 L23 28 L16 26 L9 28 L9 27 L13 24 L13 18 L2 18 L2 16 L13 14 Z" fill="var(--marker-vehicle)" stroke="var(--marker-vehicle-stroke)" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`,
  multirotor: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="7" cy="7" r="4" fill="var(--marker-vehicle)" stroke="var(--marker-vehicle-stroke)" stroke-width="1"/>
    <circle cx="25" cy="7" r="4" fill="var(--marker-vehicle)" stroke="var(--marker-vehicle-stroke)" stroke-width="1"/>
    <circle cx="7" cy="25" r="4" fill="var(--marker-vehicle)" stroke="var(--marker-vehicle-stroke)" stroke-width="1"/>
    <circle cx="25" cy="25" r="4" fill="var(--marker-vehicle)" stroke="var(--marker-vehicle-stroke)" stroke-width="1"/>
    <path d="M7 7 L25 25 M25 7 L7 25" stroke="var(--marker-vehicle-stroke)" stroke-width="2"/>
    <circle cx="16" cy="16" r="4" fill="var(--marker-vehicle)" stroke="var(--marker-vehicle-stroke)" stroke-width="1.5"/>
    <path d="M16 11 L17 16 L15 16 Z" fill="var(--marker-vehicle-stroke)"/>
  </svg>`,
  helicopter: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <ellipse cx="16" cy="9" rx="14" ry="2" fill="var(--marker-vehicle)" opacity="0.55"/>
    <path d="M16 6 L20 18 L18 20 L18 25 L20 27 L12 27 L14 25 L14 20 L12 18 Z" fill="var(--marker-vehicle)" stroke="var(--marker-vehicle-stroke)" stroke-width="1.5" stroke-linejoin="round"/>
  </svg>`,
  rover: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="6" y="10" width="20" height="12" rx="2" fill="var(--marker-vehicle)" stroke="var(--marker-vehicle-stroke)" stroke-width="1.5"/>
    <circle cx="11" cy="24" r="3" fill="var(--marker-vehicle-stroke)"/>
    <circle cx="21" cy="24" r="3" fill="var(--marker-vehicle-stroke)"/>
    <path d="M16 6 L18 10 L14 10 Z" fill="var(--marker-vehicle-stroke)"/>
  </svg>`,
  boat: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M16 4 L22 22 L10 22 Z" fill="var(--marker-vehicle)" stroke="var(--marker-vehicle-stroke)" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M4 24 Q16 30 28 24 L26 28 Q16 32 6 28 Z" fill="var(--marker-vehicle)" stroke="var(--marker-vehicle-stroke)" stroke-width="1.5"/>
  </svg>`,
};
