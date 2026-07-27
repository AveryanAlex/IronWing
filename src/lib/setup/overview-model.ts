import type { ParamMetadataMap } from "../../param-metadata";
import type { ParamStore } from "../../params";
import { buildParameterItemIndex } from "../params/parameter-item-model";
import type { SetupSectionId } from "../setup-sections";
import {
  buildFailsafeSectionModel,
  buildGeofenceModel,
  buildRtlReturnModel,
  type SafetyModelInput,
} from "./failsafe-model";
import { deriveVehicleProfile, type VehicleProfile } from "./vehicle-profile";

export type SetupOverviewFindingState = "active" | "pending_resolution" | "pending_introduction";
export type SetupOverviewFindingTone = "warning" | "danger";

export type SetupOverviewSafetyFinding = {
  id: string;
  sectionId: Extract<SetupSectionId, "arming" | "failsafe" | "rtl_return" | "geofence">;
  title: string;
  detail: string;
  tone: SetupOverviewFindingTone;
  state: SetupOverviewFindingState;
};

export type SetupOverviewIdentity = {
  vehicle: string;
  firmware: string;
  frame: string;
  orientation: string;
};

export type SetupOverviewModel = {
  identity: SetupOverviewIdentity;
  safetyFindings: SetupOverviewSafetyFinding[];
};

export type SetupOverviewModelInput = {
  vehicleType: string | null;
  firmwareVersion: string | null;
  paramStore: ParamStore | null;
  metadata: ParamMetadataMap | null;
  stagedEdits: Record<string, { nextValue: number } | undefined>;
};

type FindingSeed = Omit<SetupOverviewSafetyFinding, "state">;

const EMPTY_STAGED_EDITS: Record<string, { nextValue: number } | undefined> = {};

function currentValue(paramStore: ParamStore | null, name: string): number | null {
  return paramStore?.params[name]?.value ?? null;
}

function stagedOrCurrentValue(input: SafetyModelInput, name: string): number | null {
  const stagedValue = input.stagedEdits[name]?.nextValue;
  return typeof stagedValue === "number" && Number.isFinite(stagedValue)
    ? stagedValue
    : currentValue(input.paramStore, name);
}

function normalizeFindingId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function warningTone(text: string): SetupOverviewFindingTone {
  return /must stay|no fence types|threshold should stay higher/i.test(text) ? "danger" : "warning";
}

function modelWarningSeeds(
  sectionId: SetupOverviewSafetyFinding["sectionId"],
  title: string,
  warningTexts: string[],
): FindingSeed[] {
  return warningTexts.map((detail) => ({
    id: `${sectionId}-${normalizeFindingId(detail)}`,
    sectionId,
    title,
    detail,
    tone: warningTone(detail),
  }));
}

function collectSafetySeeds(input: SafetyModelInput): FindingSeed[] {
  const seeds: FindingSeed[] = [];
  const armingCheck = stagedOrCurrentValue(input, "ARMING_CHECK");
  const armingRequire = stagedOrCurrentValue(input, "ARMING_REQUIRE");

  if (armingCheck === 0) {
    seeds.push({
      id: "arming-checks-disabled",
      sectionId: "arming",
      title: "Pre-arm checks disabled",
      detail: "ARMING_CHECK is disabled, so the vehicle can arm without normal pre-flight safety validation.",
      tone: "danger",
    });
  } else if (armingCheck !== null && armingCheck !== 1) {
    seeds.push({
      id: "arming-checks-partial",
      sectionId: "arming",
      title: "Partial pre-arm checks",
      detail: "ARMING_CHECK uses a partial check set. Review which checks are disabled before flight.",
      tone: "warning",
    });
  }

  if (armingRequire === 0) {
    seeds.push({
      id: "arming-method-disabled",
      sectionId: "arming",
      title: "Arming safeguard disabled",
      detail: "ARMING_REQUIRE is disabled, so GCS arming can bypass the physical arming gesture safeguards.",
      tone: "warning",
    });
  }

  const failsafe = buildFailsafeSectionModel(input);
  seeds.push(...modelWarningSeeds("failsafe", "Failsafe configuration", failsafe.warningTexts));

  const rtlReturn = buildRtlReturnModel(input);
  seeds.push(...modelWarningSeeds("rtl_return", "Return configuration", rtlReturn.warningTexts));

  const geofence = buildGeofenceModel(input);
  const fenceEnablePresent = input.paramStore?.params.FENCE_ENABLE !== undefined;
  const fenceTypeValue = stagedOrCurrentValue(input, "FENCE_TYPE");
  const fenceTypeLabelsAvailable = (input.metadata?.get("FENCE_TYPE")?.bitmask?.length ?? 0) > 0;
  const geofenceWarnings = geofence.warningTexts.filter((warning) => {
    if (warning.startsWith("Fence is disabled")) {
      return fenceEnablePresent;
    }

    if (warning.includes("no fence types")) {
      return fenceTypeValue === 0 || fenceTypeLabelsAvailable;
    }

    return true;
  });
  seeds.push(...modelWarningSeeds("geofence", "Geofence configuration", geofenceWarnings));

  return seeds;
}

function compareSafetySeeds(applied: FindingSeed[], proposed: FindingSeed[]): SetupOverviewSafetyFinding[] {
  const appliedById = new Map(applied.map((finding) => [finding.id, finding]));
  const proposedById = new Map(proposed.map((finding) => [finding.id, finding]));
  const orderedIds = [
    ...appliedById.keys(),
    ...[...proposedById.keys()].filter((id) => !appliedById.has(id)),
  ];

  return orderedIds.map((id) => {
    const appliedFinding = appliedById.get(id);
    const proposedFinding = proposedById.get(id);
    const finding = appliedFinding ?? proposedFinding;
    if (!finding) {
      throw new Error(`Missing setup overview finding for ${id}`);
    }

    return {
      ...finding,
      state: appliedFinding
        ? proposedFinding
          ? "active"
          : "pending_resolution"
        : "pending_introduction",
    };
  });
}

function humanizeVehicleType(vehicleType: string | null): string {
  if (!vehicleType?.trim()) {
    return "Unavailable";
  }

  return vehicleType
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function vehicleLabel(vehicleType: string | null, profile: VehicleProfile): string {
  if (!profile.quadPlaneEnabledInStore) {
    return humanizeVehicleType(vehicleType);
  }

  switch (profile.subtype) {
    case "tiltrotor":
      return "Tilt-rotor QuadPlane";
    case "tailsitter":
      return "Tailsitter QuadPlane";
    case "compound":
      return "Compound QuadPlane";
    case "standard":
    default:
      return "QuadPlane";
  }
}

function fallbackFrameLabel(profile: VehicleProfile): string {
  if (profile.isPlane) {
    return profile.quadPlaneEnabledInStore ? "QuadPlane layout unavailable" : "Fixed-wing airframe";
  }

  if (profile.isRover) {
    return "Rover / boat";
  }

  return "Unavailable";
}

function buildIdentity(input: SetupOverviewModelInput): SetupOverviewIdentity {
  const appliedProfile = deriveVehicleProfile(input.vehicleType, {
    paramStore: input.paramStore,
    stagedEdits: EMPTY_STAGED_EDITS,
  });
  const itemIndex = buildParameterItemIndex(input.paramStore, input.metadata);
  const frameClass = appliedProfile.frameClassParam ? itemIndex.get(appliedProfile.frameClassParam) : null;
  const frameType = appliedProfile.frameTypeParam ? itemIndex.get(appliedProfile.frameTypeParam) : null;
  const orientation = itemIndex.get("AHRS_ORIENTATION") ?? null;
  const frameParts = [frameClass, frameType]
    .filter((item) => item != null)
    .map((item) => item.valueLabel ?? item.valueText);

  return {
    vehicle: vehicleLabel(input.vehicleType, appliedProfile),
    firmware: input.firmwareVersion?.trim() || "Unavailable",
    frame: frameParts.length > 0 ? frameParts.join(" · ") : fallbackFrameLabel(appliedProfile),
    orientation: orientation?.valueLabel ?? orientation?.valueText ?? "Unavailable",
  };
}

export function buildSetupOverviewModel(input: SetupOverviewModelInput): SetupOverviewModel {
  const appliedInput: SafetyModelInput = {
    vehicleType: input.vehicleType,
    paramStore: input.paramStore,
    metadata: input.metadata,
    stagedEdits: EMPTY_STAGED_EDITS,
  };
  const proposedInput: SafetyModelInput = {
    ...appliedInput,
    stagedEdits: input.stagedEdits,
  };

  return {
    identity: buildIdentity(input),
    safetyFindings: compareSafetySeeds(
      collectSafetySeeds(appliedInput),
      collectSafetySeeds(proposedInput),
    ),
  };
}
