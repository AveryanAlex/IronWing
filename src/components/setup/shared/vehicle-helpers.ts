import type { VehicleState } from "../../../telemetry";
import type { ParamInputParams } from "../primitives/param-helpers";
import type { VehicleSlug } from "../../../data/ardupilot-docs";

// ---------------------------------------------------------------------------
// Vehicle type constants
// ---------------------------------------------------------------------------

const COPTER_VEHICLE_TYPES = [
  "quadrotor",
  "hexarotor",
  "octorotor",
  "tricopter",
  "helicopter",
  "coaxial",
];

const ROVER_VEHICLE_TYPES = ["rover", "ground_rover", "boat"];

// ---------------------------------------------------------------------------
// Vehicle type detection helpers
// ---------------------------------------------------------------------------

export function isPlaneVehicleType(vehicleState: VehicleState | null): boolean {
  if (!vehicleState) return false;
  return vehicleState.vehicle_type.toLowerCase().includes("fixed_wing");
}

export function isCopterVehicleType(vehicleState: VehicleState | null): boolean {
  if (!vehicleState) return false;
  return COPTER_VEHICLE_TYPES.some((t) =>
    vehicleState.vehicle_type.toLowerCase().includes(t),
  );
}

export function isRoverVehicleType(vehicleState: VehicleState | null): boolean {
  if (!vehicleState) return false;
  return ROVER_VEHICLE_TYPES.some((t) =>
    vehicleState.vehicle_type.toLowerCase().includes(t),
  );
}

export function hasQuadPlaneParams(params: ParamInputParams): boolean {
  return params.store?.params["Q_FRAME_CLASS"] !== undefined;
}

/**
 * Derive a VehicleSlug for the docs resolver from VehicleState.
 * Returns null when the vehicle type is unknown or unrecognised.
 */
export function getVehicleSlug(
  vehicleState: VehicleState | null,
): VehicleSlug | null {
  if (isCopterVehicleType(vehicleState)) return "copter";
  if (isPlaneVehicleType(vehicleState)) return "plane";
  if (isRoverVehicleType(vehicleState)) return "rover";
  return null;
}
