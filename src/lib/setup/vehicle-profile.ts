import type { VehicleSlug } from "../../data/ardupilot-docs";
import type { ParamStore } from "../../params";

const COPTER_VEHICLE_TYPES = [
  "quadrotor",
  "hexarotor",
  "octorotor",
  "tricopter",
  "helicopter",
  "coaxial",
] as const;

const ROVER_VEHICLE_TYPES = ["rover", "ground_rover", "boat"] as const;

export type VehicleFamily = "plane" | "copter" | "rover" | "unknown";
export type VtolSubtype = "standard" | "tiltrotor" | "tailsitter" | "compound";
export type PlaneVtolState =
  | "plain-plane"
  | "enable-pending"
  | "awaiting-refresh"
  | "partial-refresh"
  | "vtol-ready";

export type VehicleProfile = {
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

export type VehicleProfileParamsInput = {
  paramStore: ParamStore | null;
  stagedEdits: Record<string, { nextValue: number } | undefined>;
};

function normalizeVehicleType(vehicleType: string | null): string {
  return vehicleType?.trim().toLowerCase() ?? "";
}

function hasStoreParam(input: VehicleProfileParamsInput, name: string): boolean {
  return input.paramStore?.params[name] !== undefined;
}

function getCurrentParamValue(input: VehicleProfileParamsInput, name: string): number | null {
  return input.paramStore?.params[name]?.value ?? null;
}

function getStagedOrCurrentParamValue(input: VehicleProfileParamsInput, name: string): number | null {
  const stagedValue = input.stagedEdits[name]?.nextValue;
  if (typeof stagedValue === "number" && Number.isFinite(stagedValue)) {
    return stagedValue;
  }

  return getCurrentParamValue(input, name);
}

function isEnabledFlag(value: number | null): boolean {
  return value !== null && value > 0;
}

export function isPlaneVehicleType(vehicleType: string | null): boolean {
  const normalized = normalizeVehicleType(vehicleType);
  return normalized.includes("fixed_wing") || normalized === "vtol";
}

export function isCopterVehicleType(vehicleType: string | null): boolean {
  const normalized = normalizeVehicleType(vehicleType);
  return COPTER_VEHICLE_TYPES.some((candidate) => normalized.includes(candidate));
}

export function isRoverVehicleType(vehicleType: string | null): boolean {
  const normalized = normalizeVehicleType(vehicleType);
  return ROVER_VEHICLE_TYPES.some((candidate) => normalized.includes(candidate));
}

export function deriveVehicleProfile(
  vehicleType: string | null,
  input: VehicleProfileParamsInput,
): VehicleProfile {
  const isPlane = isPlaneVehicleType(vehicleType);
  const isCopter = isCopterVehicleType(vehicleType);
  const isRover = isRoverVehicleType(vehicleType);

  const vehicleFamily: VehicleFamily = isPlane
    ? "plane"
    : isCopter
      ? "copter"
      : isRover
        ? "rover"
        : "unknown";

  const qEnable = getStagedOrCurrentParamValue(input, "Q_ENABLE");
  const qEnableCurrent = getCurrentParamValue(input, "Q_ENABLE");
  const qFrameClass = getStagedOrCurrentParamValue(input, "Q_FRAME_CLASS");
  const qFrameType = getStagedOrCurrentParamValue(input, "Q_FRAME_TYPE");
  const qFrameClassCurrent = getCurrentParamValue(input, "Q_FRAME_CLASS");
  const qFrameTypeCurrent = getCurrentParamValue(input, "Q_FRAME_TYPE");
  const qTiltEnable = getStagedOrCurrentParamValue(input, "Q_TILT_ENABLE");
  const qTailsitEnable = getStagedOrCurrentParamValue(input, "Q_TAILSIT_ENABLE");

  const hasQEnable = hasStoreParam(input, "Q_ENABLE");
  const hasQFrameClass = hasStoreParam(input, "Q_FRAME_CLASS");
  const hasQFrameType = hasStoreParam(input, "Q_FRAME_TYPE");
  const hasAnyQuadPlaneParams = [
    "Q_ENABLE",
    "Q_FRAME_CLASS",
    "Q_FRAME_TYPE",
    "Q_TILT_ENABLE",
    "Q_TAILSIT_ENABLE",
  ].some((name) => hasStoreParam(input, name));
  const hasCompleteQuadPlaneParams = hasQFrameClass && hasQFrameType;
  const hasPartialQuadPlaneParams = (hasQFrameClass || hasQFrameType) && !hasCompleteQuadPlaneParams;

  const quadPlaneEnabled = isPlane && (
    isEnabledFlag(qEnable)
    || hasQFrameClass
    || hasQFrameType
    || isEnabledFlag(qTiltEnable)
    || isEnabledFlag(qTailsitEnable)
  );

  const quadPlaneEnabledInStore = isPlane && (
    isEnabledFlag(qEnableCurrent)
    || hasQFrameClass
    || hasQFrameType
    || isEnabledFlag(getCurrentParamValue(input, "Q_TILT_ENABLE"))
    || isEnabledFlag(getCurrentParamValue(input, "Q_TAILSIT_ENABLE"))
  );

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

  const stagedEnableChange = qEnableCurrent !== null && qEnable !== null && qEnable !== qEnableCurrent;
  const stagedFrameClassChange = qFrameClassCurrent !== null
    && qFrameClass !== null
    && qFrameClass !== qFrameClassCurrent;
  const stagedFrameTypeChange = qFrameTypeCurrent !== null
    && qFrameType !== null
    && qFrameType !== qFrameTypeCurrent;

  const awaitingParamRefresh = isPlane && quadPlaneEnabled && !hasCompleteQuadPlaneParams;
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

  const hasStandardFrameParams = hasStoreParam(input, "FRAME_CLASS") && hasStoreParam(input, "FRAME_TYPE");
  const frameParamFamily = isPlane
    ? hasCompleteQuadPlaneParams && quadPlaneEnabled
      ? "quadplane"
      : null
    : hasStandardFrameParams
      ? "copter"
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

  const frameClassValue = frameClassParam ? getStagedOrCurrentParamValue(input, frameClassParam) : null;
  const frameTypeValue = frameTypeParam ? getStagedOrCurrentParamValue(input, frameTypeParam) : null;

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
    rebootRequiredBeforeTesting: stagedEnableChange || stagedFrameClassChange || stagedFrameTypeChange,
  };
}

export function deriveVtolProfile(
  vehicleType: string | null,
  input: VehicleProfileParamsInput,
): VehicleProfile {
  return deriveVehicleProfile(vehicleType, input);
}

export function hasQuadPlaneParams(input: Pick<VehicleProfileParamsInput, "paramStore">): boolean {
  return input.paramStore?.params.Q_FRAME_CLASS !== undefined;
}

export function getVehicleSlug(vehicleType: string | null): VehicleSlug | null {
  if (isCopterVehicleType(vehicleType)) {
    return "copter";
  }

  if (isPlaneVehicleType(vehicleType)) {
    return "plane";
  }

  if (isRoverVehicleType(vehicleType)) {
    return "rover";
  }

  return null;
}
