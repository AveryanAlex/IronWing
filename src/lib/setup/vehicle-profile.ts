import type { StagedParameterValues } from "../params/parameter-values";
import { hasParameter, readAppliedParameter, readProposedParameter } from "../params/parameter-values";
import { getVehicleDescriptor, type VehicleFamily } from "../vehicle-descriptor";
export type { VehicleFamily } from "../vehicle-descriptor";
import type { Airframe } from "../airframe";
import { decodeArduPilotFrame } from "../ardupilot/airframe";
import type { VehicleSlug } from "../../data/ardupilot-docs";
import type { ParamStore } from "../../params";

export type VtolSubtype = "standard" | "tiltrotor" | "tailsitter" | "compound";
export type PlaneVtolState = "plain-plane" | "enable-pending" | "awaiting-refresh" | "partial-refresh" | "vtol-ready";

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
  frame: Airframe | null;
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
  stagedEdits: StagedParameterValues;
};

function isEnabledFlag(value: number | null): boolean {
  return value !== null && value > 0;
}

export function isPlaneVehicleType(vehicleType: string | null): boolean {
  return getVehicleDescriptor(vehicleType).family === "plane";
}

export function isCopterVehicleType(vehicleType: string | null): boolean {
  return getVehicleDescriptor(vehicleType).family === "copter";
}

export function isRoverVehicleType(vehicleType: string | null): boolean {
  return getVehicleDescriptor(vehicleType).family === "rover";
}

export function deriveVehicleProfile(vehicleType: string | null, input: VehicleProfileParamsInput): VehicleProfile {
  const isPlane = isPlaneVehicleType(vehicleType);
  const isCopter = isCopterVehicleType(vehicleType);
  const isRover = isRoverVehicleType(vehicleType);

  const vehicleFamily: VehicleFamily = isPlane ? "plane" : isCopter ? "copter" : isRover ? "rover" : "unknown";

  const qEnable = readProposedParameter(input, "Q_ENABLE");
  const qEnableCurrent = readAppliedParameter(input.paramStore, "Q_ENABLE");
  const qFrameClass = readProposedParameter(input, "Q_FRAME_CLASS");
  const qFrameType = readProposedParameter(input, "Q_FRAME_TYPE");
  const qFrameClassCurrent = readAppliedParameter(input.paramStore, "Q_FRAME_CLASS");
  const qFrameTypeCurrent = readAppliedParameter(input.paramStore, "Q_FRAME_TYPE");
  const qTiltEnable = readProposedParameter(input, "Q_TILT_ENABLE");
  const qTailsitEnable = readProposedParameter(input, "Q_TAILSIT_ENABLE");

  const hasQEnable = hasParameter(input.paramStore, "Q_ENABLE");
  const hasQFrameClass = hasParameter(input.paramStore, "Q_FRAME_CLASS");
  const hasQFrameType = hasParameter(input.paramStore, "Q_FRAME_TYPE");
  const hasAnyQuadPlaneParams = ["Q_ENABLE", "Q_FRAME_CLASS", "Q_FRAME_TYPE", "Q_TILT_ENABLE", "Q_TAILSIT_ENABLE"].some(
    (name) => hasParameter(input.paramStore, name),
  );
  const hasCompleteQuadPlaneParams = hasQFrameClass && hasQFrameType;
  const hasPartialQuadPlaneParams = (hasQFrameClass || hasQFrameType) && !hasCompleteQuadPlaneParams;

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
      isEnabledFlag(readAppliedParameter(input.paramStore, "Q_TILT_ENABLE")) ||
      isEnabledFlag(readAppliedParameter(input.paramStore, "Q_TAILSIT_ENABLE")));

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
  const stagedFrameClassChange =
    qFrameClassCurrent !== null && qFrameClass !== null && qFrameClass !== qFrameClassCurrent;
  const stagedFrameTypeChange = qFrameTypeCurrent !== null && qFrameType !== null && qFrameType !== qFrameTypeCurrent;

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

  const hasStandardFrameParams = hasParameter(input.paramStore, "FRAME_CLASS") && hasParameter(input.paramStore, "FRAME_TYPE");
  const frameParamFamily = isPlane
    ? hasCompleteQuadPlaneParams && quadPlaneEnabled
      ? "quadplane"
      : null
    : hasStandardFrameParams
      ? "copter"
      : null;

  const frameClassParam =
    frameParamFamily === "copter" ? "FRAME_CLASS" : frameParamFamily === "quadplane" ? "Q_FRAME_CLASS" : null;
  const frameTypeParam =
    frameParamFamily === "copter" ? "FRAME_TYPE" : frameParamFamily === "quadplane" ? "Q_FRAME_TYPE" : null;

  const frameClassValue = frameClassParam ? readProposedParameter(input, frameClassParam) : null;
  const frameTypeValue = frameTypeParam ? readProposedParameter(input, frameTypeParam) : null;

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
    frame: decodeArduPilotFrame(frameClassValue, frameTypeValue).frame,
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

export function deriveVtolProfile(vehicleType: string | null, input: VehicleProfileParamsInput): VehicleProfile {
  return deriveVehicleProfile(vehicleType, input);
}

export function hasQuadPlaneParams(input: Pick<VehicleProfileParamsInput, "paramStore">): boolean {
  return input.paramStore?.params.Q_FRAME_CLASS !== undefined;
}

export function getVehicleSlug(vehicleType: string | null): VehicleSlug | null {
  return getVehicleDescriptor(vehicleType).docsSlug;
}
