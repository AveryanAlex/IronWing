import type { VehicleType } from "./generated/mavkit";
import type { VehicleSlug } from "../data/ardupilot-docs";

export type VehicleFamily = "plane" | "copter" | "rover" | "unknown";
export type VehicleIconKind = "fixed_wing" | "multirotor" | "helicopter" | "rover" | "boat" | "generic";
export type AttitudeModelKind = "fixed_wing" | "vtol" | "multirotor" | "helicopter" | "rover" | "submarine" | "generic";
export type MultirotorLayout = "tri" | "quad" | "hex" | "octo" | "coaxial";
export type ParameterMetadataSlug = "ArduCopter" | "ArduPlane" | "Heli" | "Rover" | "ArduSub" | "Blimp" | "AntennaTracker";

export type VehicleDescriptor = {
  family: VehicleFamily;
  docsSlug: VehicleSlug | null;
  metadataSlug: ParameterMetadataSlug | null;
  icon: VehicleIconKind;
  attitudeModel: AttitudeModelKind;
  multirotorLayout: MultirotorLayout;
};

const UNKNOWN: VehicleDescriptor = {
  family: "unknown", docsSlug: null, metadataSlug: null,
  icon: "generic", attitudeModel: "generic", multirotorLayout: "quad",
};
const COPTER: VehicleDescriptor = {
  family: "copter", docsSlug: "copter", metadataSlug: "ArduCopter",
  icon: "multirotor", attitudeModel: "multirotor", multirotorLayout: "quad",
};
const PLANE: VehicleDescriptor = {
  family: "plane", docsSlug: "plane", metadataSlug: "ArduPlane",
  icon: "fixed_wing", attitudeModel: "fixed_wing", multirotorLayout: "quad",
};
const ROVER: VehicleDescriptor = {
  ...UNKNOWN, family: "rover", docsSlug: "rover", metadataSlug: "Rover", icon: "rover", attitudeModel: "rover",
};

export const VEHICLE_DESCRIPTORS = {
  unknown: UNKNOWN,
  generic: UNKNOWN,
  fixed_wing: PLANE,
  vtol: { ...PLANE, attitudeModel: "vtol" },
  quadrotor: COPTER,
  hexarotor: { ...COPTER, multirotorLayout: "hex" },
  octorotor: { ...COPTER, multirotorLayout: "octo" },
  tricopter: { ...COPTER, multirotorLayout: "tri" },
  coaxial: { ...COPTER, multirotorLayout: "coaxial" },
  helicopter: { ...COPTER, metadataSlug: "Heli", icon: "helicopter", attitudeModel: "helicopter" },
  ground_rover: ROVER,
  submarine: { ...UNKNOWN, metadataSlug: "ArduSub", icon: "boat", attitudeModel: "submarine" },
} satisfies Record<VehicleType, VehicleDescriptor>;

// Normalize presentation/import aliases once. SDK identities already use the canonical keys above.
const ALIASES: Record<string, VehicleType> = {
  plane: "fixed_wing", arduplane: "fixed_wing", quadplane: "vtol",
  copter: "quadrotor", arducopter: "quadrotor", quadrotor_x: "quadrotor", heli: "helicopter",
  rover: "ground_rover", car: "ground_rover", sub: "submarine",
};
const OTHER_DESCRIPTORS: Record<string, VehicleDescriptor> = {
  boat: { ...ROVER, metadataSlug: null, icon: "boat", attitudeModel: "submarine" },
  blimp: { ...UNKNOWN, metadataSlug: "Blimp" },
  antenna_tracker: { ...UNKNOWN, metadataSlug: "AntennaTracker" },
};

export function getVehicleDescriptor(value: string | null | undefined): VehicleDescriptor {
  const normalized = value?.trim().toLowerCase().replace(/[- ]/g, "_") ?? "unknown";
  const key = (Object.prototype.hasOwnProperty.call(ALIASES, normalized) ? ALIASES[normalized] : normalized);
  if (Object.prototype.hasOwnProperty.call(VEHICLE_DESCRIPTORS, key)) return VEHICLE_DESCRIPTORS[key as VehicleType];
  return Object.prototype.hasOwnProperty.call(OTHER_DESCRIPTORS, key) ? OTHER_DESCRIPTORS[key] : UNKNOWN;
}
