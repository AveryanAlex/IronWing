import type { VehicleState } from "../../../telemetry";
import {
  getStagedOrCurrent,
  type ParamInputParams,
} from "../primitives/param-helpers";
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
// VTOL profile types
// ---------------------------------------------------------------------------

export type VehicleFamily = "plane" | "copter" | "rover" | "unknown";
export type VtolSubtype = "standard" | "tiltrotor" | "tailsitter" | "compound";
export type PlaneVtolState =
  | "plain-plane"
  | "enable-pending"
  | "awaiting-refresh"
  | "partial-refresh"
  | "vtol-ready";

export type VtolProfile = {
  vehicleFamily: VehicleFamily;
  isPlane: boolean;
  isCopter: boolean;
  isRover: boolean;
  supportsVtol: boolean;
  hasVtolToggle: boolean;
  quadPlaneEnabled: boolean;
  quadPlaneEnabledInStore: boolean;
  hasAnyQuadPlaneParams: boolean;
  hasCompleteQuadPlaneParams: boolean;
  hasPartialQuadPlaneParams: boolean;
  awaitingParamRefresh: boolean;
  frameParamFamily: "copter" | "quadplane" | null;
  frameClassParam: "FRAME_CLASS" | "Q_FRAME_CLASS" | null;
  frameTypeParam: "FRAME_TYPE" | "Q_FRAME_TYPE" | null;
  frameClassValue: number | null;
  frameTypeValue: number | null;
  tiltEnabled: boolean;
  tailsitterEnabled: boolean;
  subtype: VtolSubtype | null;
  hasUnsupportedSubtype: boolean;
  planeVtolState: PlaneVtolState | null;
  stagedEnableChange: boolean;
  stagedFrameClassChange: boolean;
  stagedFrameTypeChange: boolean;
  rebootRequiredBeforeTesting: boolean;
};

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

function hasStoreParam(params: ParamInputParams, name: string): boolean {
  return params.store?.params[name] !== undefined;
}

function getCurrentParamValue(
  params: ParamInputParams,
  name: string,
): number | null {
  return params.store?.params[name]?.value ?? null;
}

function isEnabledFlag(value: number | null): boolean {
  return value !== null && value > 0;
}

export function deriveVtolProfile(
  vehicleState: VehicleState | null,
  params: ParamInputParams,
): VtolProfile {
  const isPlane = isPlaneVehicleType(vehicleState);
  const isCopter = isCopterVehicleType(vehicleState);
  const isRover = isRoverVehicleType(vehicleState);

  const vehicleFamily: VehicleFamily = isPlane
    ? "plane"
    : isCopter
      ? "copter"
      : isRover
        ? "rover"
        : "unknown";

  const qEnable = getStagedOrCurrent("Q_ENABLE", params);
  const qEnableCurrent = getCurrentParamValue(params, "Q_ENABLE");
  const qFrameClass = getStagedOrCurrent("Q_FRAME_CLASS", params);
  const qFrameType = getStagedOrCurrent("Q_FRAME_TYPE", params);
  const qFrameClassCurrent = getCurrentParamValue(params, "Q_FRAME_CLASS");
  const qFrameTypeCurrent = getCurrentParamValue(params, "Q_FRAME_TYPE");
  const qTiltEnable = getStagedOrCurrent("Q_TILT_ENABLE", params);
  const qTailsitEnable = getStagedOrCurrent("Q_TAILSIT_ENABLE", params);

  const hasQEnable = hasStoreParam(params, "Q_ENABLE");
  const hasQFrameClass = hasStoreParam(params, "Q_FRAME_CLASS");
  const hasQFrameType = hasStoreParam(params, "Q_FRAME_TYPE");
  const hasAnyQuadPlaneParams = [
    "Q_ENABLE",
    "Q_FRAME_CLASS",
    "Q_FRAME_TYPE",
    "Q_TILT_ENABLE",
    "Q_TAILSIT_ENABLE",
  ].some((name) => hasStoreParam(params, name));
  const hasCompleteQuadPlaneParams = hasQFrameClass && hasQFrameType;
  const hasPartialQuadPlaneParams =
    (hasQFrameClass || hasQFrameType) && !hasCompleteQuadPlaneParams;

  const quadPlaneEnabled =
    isPlane &&
    (isEnabledFlag(qEnable) ||
      hasQFrameClass ||
      hasQFrameType ||
      isEnabledFlag(qTiltEnable) ||
      isEnabledFlag(qTailsitEnable));

  const quadPlaneEnabledInStore =
    isPlane &&
    (isEnabledFlag(qEnableCurrent) ||
      hasQFrameClass ||
      hasQFrameType ||
      isEnabledFlag(getCurrentParamValue(params, "Q_TILT_ENABLE")) ||
      isEnabledFlag(getCurrentParamValue(params, "Q_TAILSIT_ENABLE")));

  const tiltEnabled = quadPlaneEnabled && isEnabledFlag(qTiltEnable);
  const tailsitterEnabled = quadPlaneEnabled && isEnabledFlag(qTailsitEnable);

  const subtype: VtolSubtype | null = !quadPlaneEnabled
    ? null
    : tiltEnabled && tailsitterEnabled
      ? "compound"
      : tiltEnabled
        ? "tiltrotor"
        : tailsitterEnabled
          ? "tailsitter"
          : "standard";

  const stagedEnableChange =
    qEnableCurrent !== null && qEnable !== null && qEnable !== qEnableCurrent;
  const stagedFrameClassChange =
    qFrameClassCurrent !== null &&
    qFrameClass !== null &&
    qFrameClass !== qFrameClassCurrent;
  const stagedFrameTypeChange =
    qFrameTypeCurrent !== null &&
    qFrameType !== null &&
    qFrameType !== qFrameTypeCurrent;

  const awaitingParamRefresh =
    isPlane && quadPlaneEnabled && !hasCompleteQuadPlaneParams;

  const planeVtolState: PlaneVtolState | null = !isPlane
    ? null
    : hasCompleteQuadPlaneParams && quadPlaneEnabled
      ? "vtol-ready"
      : hasPartialQuadPlaneParams
        ? "partial-refresh"
        : stagedEnableChange && quadPlaneEnabled && !quadPlaneEnabledInStore
          ? "enable-pending"
          : quadPlaneEnabled
            ? "awaiting-refresh"
            : "plain-plane";

  const frameParamFamily = isCopter
    ? "copter"
    : isPlane && hasCompleteQuadPlaneParams && quadPlaneEnabled
      ? "quadplane"
      : null;

  const frameClassParam = frameParamFamily === "copter"
    ? "FRAME_CLASS"
    : frameParamFamily === "quadplane"
      ? "Q_FRAME_CLASS"
      : null;

  const frameTypeParam = frameParamFamily === "copter"
    ? "FRAME_TYPE"
    : frameParamFamily === "quadplane"
      ? "Q_FRAME_TYPE"
      : null;

  const frameClassValue = frameClassParam
    ? getStagedOrCurrent(frameClassParam, params)
    : null;
  const frameTypeValue = frameTypeParam
    ? getStagedOrCurrent(frameTypeParam, params)
    : null;

  return {
    vehicleFamily,
    isPlane,
    isCopter,
    isRover,
    supportsVtol: isPlane,
    hasVtolToggle: isPlane && hasQEnable,
    quadPlaneEnabled,
    quadPlaneEnabledInStore,
    hasAnyQuadPlaneParams,
    hasCompleteQuadPlaneParams,
    hasPartialQuadPlaneParams,
    awaitingParamRefresh,
    frameParamFamily,
    frameClassParam,
    frameTypeParam,
    frameClassValue,
    frameTypeValue,
    tiltEnabled,
    tailsitterEnabled,
    subtype,
    hasUnsupportedSubtype: subtype === "compound",
    planeVtolState,
    stagedEnableChange,
    stagedFrameClassChange,
    stagedFrameTypeChange,
    rebootRequiredBeforeTesting:
      stagedEnableChange || stagedFrameClassChange || stagedFrameTypeChange,
  };
}

export function hasQuadPlaneParams(params: ParamInputParams): boolean {
  return hasStoreParam(params, "Q_FRAME_CLASS");
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
