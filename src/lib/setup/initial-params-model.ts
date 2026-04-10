import {
  ATC_RAT_PIT_FLTE,
  ATC_RAT_RLL_FLTE,
  ATC_RAT_YAW_FLTD,
  ATC_RAT_YAW_FLTE,
  ATC_THR_MIX_MAN,
  BATTERY_CHEMISTRIES,
  calcAccelPRMax,
  calcAccelYMax,
  calcAcroYawP,
  calcBattArmVolt,
  calcBattCrtVolt,
  calcBattLowVolt,
  calcBattVoltMax,
  calcBattVoltMin,
  calcGyroFilter,
  calcMotThrustExpo,
  calcRateFilterD,
  calcYawFilterT,
  INS_ACCEL_FILTER,
  MOT_THST_HOVER,
} from "../../data/battery-presets";
import type { ParamMetadataMap } from "../../param-metadata";
import type { ParamStore } from "../../params";
import {
  buildParameterItemIndex,
  formatParamValue,
  type ParameterItemModel,
} from "../params/parameter-item-model";
import { deriveVehicleProfile, type VehicleProfile } from "./vehicle-profile";

export type InitialParamsFamilyState =
  | "copter"
  | "quadplane"
  | "quadplane-refresh"
  | "plain-plane"
  | "rover"
  | "unknown";

export type InitialParamsCalculatorInputs = {
  propInches: number | null;
  cellCount: number | null;
  chemistryIndex: number | null;
};

export type ResolvedInitialParamsInputs = {
  propInches: number;
  cellCount: number;
  chemistryIndex: number;
};

export type InitialParamsPreviewRow = {
  key: string;
  label: string;
  paramName: string;
  detail: string;
  willChange: boolean;
};

export type InitialParamsPreviewEntry = {
  item: ParameterItemModel;
  name: string;
  nextValue: number;
};

export type InitialParamsPreviewBatch = {
  id: "control_baseline" | "battery_compensation" | "safety_defaults";
  title: string;
  description: string;
  rows: InitialParamsPreviewRow[];
  entries: InitialParamsPreviewEntry[];
  changedCount: number;
  stageAllowed: boolean;
  stageBlockedReason: string | null;
};

export type InitialParamsFamilyRecommendation = {
  state: InitialParamsFamilyState;
  headline: string;
  detail: string;
  supportsCalculator: boolean;
};

export type InitialParamsModel = {
  family: InitialParamsFamilyRecommendation;
  vehicleProfile: VehicleProfile;
  validationMessage: string | null;
  resolvedInputs: ResolvedInitialParamsInputs | null;
  usingFallbackInputs: boolean;
  previewStateText: string;
  previewDetailText: string;
  missingParamNames: string[];
  recoveryReasons: string[];
  batches: InitialParamsPreviewBatch[];
  availableBatchCount: number;
  totalChangeCount: number;
  canConfirm: boolean;
};

type InitialParamsModelInput = {
  vehicleType: string | null;
  paramStore: ParamStore | null;
  metadata: ParamMetadataMap | null;
  stagedEdits: Record<string, { nextValue: number } | undefined>;
  inputs: InitialParamsCalculatorInputs;
  fallbackInputs?: ResolvedInitialParamsInputs | null;
};

type RecommendationDefinition = {
  canonical: string;
  label: string;
  batchId: InitialParamsPreviewBatch["id"];
  proposedValue: number;
};

type RecommendationBatchDefinition = {
  id: InitialParamsPreviewBatch["id"];
  title: string;
  description: string;
};

const ATC_PARAMS = new Set([
  "ATC_RAT_PIT_FLTD",
  "ATC_RAT_PIT_FLTE",
  "ATC_RAT_PIT_FLTT",
  "ATC_RAT_RLL_FLTD",
  "ATC_RAT_RLL_FLTE",
  "ATC_RAT_RLL_FLTT",
  "ATC_RAT_YAW_FLTD",
  "ATC_RAT_YAW_FLTE",
  "ATC_RAT_YAW_FLTT",
  "ATC_ACCEL_P_MAX",
  "ATC_ACCEL_R_MAX",
  "ATC_ACCEL_Y_MAX",
  "ATC_THR_MIX_MAN",
]);

const MOT_PARAMS = new Set([
  "MOT_THST_EXPO",
  "MOT_THST_HOVER",
  "MOT_BAT_VOLT_MAX",
  "MOT_BAT_VOLT_MIN",
]);

const PREVIEW_BATCHES: RecommendationBatchDefinition[] = [
  {
    id: "control_baseline",
    title: "Control and filter baseline",
    description:
      "Use prop-size formulas to preview the thrust curve, rate filters, and acceleration limits before deeper tuning.",
  },
  {
    id: "battery_compensation",
    title: "Battery compensation",
    description:
      "Preview battery-compensation and pack-voltage thresholds from the current chemistry and cell-count assumptions.",
  },
  {
    id: "safety_defaults",
    title: "Safety defaults",
    description:
      "Queue conservative starter defaults for battery failsafe and fence behavior without applying directly from this section.",
  },
];

const SAFETY_DEFAULTS: ReadonlyArray<{ canonical: string; label: string; proposedValue: number }> = [
  { canonical: "BATT_FS_LOW_ACT", label: "Low-battery action", proposedValue: 2 },
  { canonical: "BATT_FS_CRT_ACT", label: "Critical-battery action", proposedValue: 1 },
  { canonical: "FENCE_ENABLE", label: "Fence enable", proposedValue: 1 },
  { canonical: "FENCE_TYPE", label: "Fence type", proposedValue: 0b0111 },
  { canonical: "FENCE_ACTION", label: "Fence action", proposedValue: 1 },
  { canonical: "FENCE_ALT_MAX", label: "Fence max altitude", proposedValue: 100 },
];

function roundToDigits(value: number, digits = 2): number {
  return Number.parseFloat(value.toFixed(digits));
}

function currentOrStagedValue(
  item: ParameterItemModel,
  stagedEdits: Record<string, { nextValue: number } | undefined>,
): number {
  const stagedValue = stagedEdits[item.name]?.nextValue;
  return typeof stagedValue === "number" && Number.isFinite(stagedValue) ? stagedValue : item.value;
}

function validateCalculatorInputs(inputs: InitialParamsCalculatorInputs): {
  valid: boolean;
  message: string | null;
} {
  if (typeof inputs.propInches !== "number" || !Number.isFinite(inputs.propInches) || inputs.propInches <= 0) {
    return {
      valid: false,
      message: "Enter a valid prop size before staging initial-parameter previews.",
    };
  }

  if (!Number.isInteger(inputs.cellCount) || Number(inputs.cellCount) < 1) {
    return {
      valid: false,
      message: "Enter a whole battery cell count before staging initial-parameter previews.",
    };
  }

  if (
    !Number.isInteger(inputs.chemistryIndex)
    || Number(inputs.chemistryIndex) < 0
    || Number(inputs.chemistryIndex) >= BATTERY_CHEMISTRIES.length
  ) {
    return {
      valid: false,
      message: "Choose a supported battery chemistry before staging initial-parameter previews.",
    };
  }

  return {
    valid: true,
    message: null,
  };
}

function resolveInputs(
  inputs: InitialParamsCalculatorInputs,
  fallbackInputs: ResolvedInitialParamsInputs | null | undefined,
): {
  resolvedInputs: ResolvedInitialParamsInputs | null;
  usingFallbackInputs: boolean;
  validationMessage: string | null;
} {
  const validation = validateCalculatorInputs(inputs);
  if (validation.valid) {
    return {
      resolvedInputs: {
        propInches: inputs.propInches!,
        cellCount: inputs.cellCount!,
        chemistryIndex: inputs.chemistryIndex!,
      },
      usingFallbackInputs: false,
      validationMessage: null,
    };
  }

  if (fallbackInputs) {
    return {
      resolvedInputs: fallbackInputs,
      usingFallbackInputs: true,
      validationMessage: validation.message,
    };
  }

  return {
    resolvedInputs: null,
    usingFallbackInputs: false,
    validationMessage: validation.message,
  };
}

function toVehicleParamName(name: string, profile: VehicleProfile): string {
  if (!profile.isPlane || !profile.quadPlaneEnabled) {
    return name;
  }

  if (ATC_PARAMS.has(name)) {
    return name.replace("ATC_", "Q_A_");
  }

  if (MOT_PARAMS.has(name)) {
    return name.replace("MOT_", "Q_M_");
  }

  return name;
}

function buildRecommendationDefinitions(inputs: ResolvedInitialParamsInputs): RecommendationDefinition[] {
  const chemistry = BATTERY_CHEMISTRIES[inputs.chemistryIndex]!;
  const gyroFilter = calcGyroFilter(inputs.propInches);
  const rateFilter = calcRateFilterD(gyroFilter);
  const yawFilter = calcYawFilterT(gyroFilter);
  const accelPr = calcAccelPRMax(inputs.propInches);
  const accelY = calcAccelYMax(inputs.propInches);

  return [
    {
      canonical: "MOT_THST_EXPO",
      label: "Thrust expo",
      batchId: "control_baseline",
      proposedValue: roundToDigits(calcMotThrustExpo(inputs.propInches)),
    },
    {
      canonical: "MOT_THST_HOVER",
      label: "Hover thrust",
      batchId: "control_baseline",
      proposedValue: MOT_THST_HOVER,
    },
    {
      canonical: "INS_GYRO_FILTER",
      label: "Gyro filter",
      batchId: "control_baseline",
      proposedValue: gyroFilter,
    },
    {
      canonical: "INS_ACCEL_FILTER",
      label: "Accel filter",
      batchId: "control_baseline",
      proposedValue: INS_ACCEL_FILTER,
    },
    {
      canonical: "ATC_RAT_PIT_FLTD",
      label: "Pitch D filter",
      batchId: "control_baseline",
      proposedValue: rateFilter,
    },
    {
      canonical: "ATC_RAT_PIT_FLTE",
      label: "Pitch error filter",
      batchId: "control_baseline",
      proposedValue: ATC_RAT_PIT_FLTE,
    },
    {
      canonical: "ATC_RAT_PIT_FLTT",
      label: "Pitch target filter",
      batchId: "control_baseline",
      proposedValue: rateFilter,
    },
    {
      canonical: "ATC_RAT_RLL_FLTD",
      label: "Roll D filter",
      batchId: "control_baseline",
      proposedValue: rateFilter,
    },
    {
      canonical: "ATC_RAT_RLL_FLTE",
      label: "Roll error filter",
      batchId: "control_baseline",
      proposedValue: ATC_RAT_RLL_FLTE,
    },
    {
      canonical: "ATC_RAT_RLL_FLTT",
      label: "Roll target filter",
      batchId: "control_baseline",
      proposedValue: rateFilter,
    },
    {
      canonical: "ATC_RAT_YAW_FLTD",
      label: "Yaw D filter",
      batchId: "control_baseline",
      proposedValue: ATC_RAT_YAW_FLTD,
    },
    {
      canonical: "ATC_RAT_YAW_FLTE",
      label: "Yaw error filter",
      batchId: "control_baseline",
      proposedValue: ATC_RAT_YAW_FLTE,
    },
    {
      canonical: "ATC_RAT_YAW_FLTT",
      label: "Yaw target filter",
      batchId: "control_baseline",
      proposedValue: yawFilter,
    },
    {
      canonical: "ATC_ACCEL_P_MAX",
      label: "Pitch accel max",
      batchId: "control_baseline",
      proposedValue: accelPr,
    },
    {
      canonical: "ATC_ACCEL_R_MAX",
      label: "Roll accel max",
      batchId: "control_baseline",
      proposedValue: accelPr,
    },
    {
      canonical: "ATC_ACCEL_Y_MAX",
      label: "Yaw accel max",
      batchId: "control_baseline",
      proposedValue: accelY,
    },
    {
      canonical: "ATC_THR_MIX_MAN",
      label: "Throttle mix manual",
      batchId: "control_baseline",
      proposedValue: ATC_THR_MIX_MAN,
    },
    {
      canonical: "ACRO_YAW_P",
      label: "Acro yaw P",
      batchId: "control_baseline",
      proposedValue: roundToDigits(calcAcroYawP(accelY)),
    },
    {
      canonical: "MOT_BAT_VOLT_MAX",
      label: "Motor battery max",
      batchId: "battery_compensation",
      proposedValue: roundToDigits(calcBattVoltMax(inputs.cellCount, chemistry.cellVoltMax)),
    },
    {
      canonical: "MOT_BAT_VOLT_MIN",
      label: "Motor battery min",
      batchId: "battery_compensation",
      proposedValue: roundToDigits(calcBattVoltMin(inputs.cellCount, chemistry.cellVoltMin)),
    },
    {
      canonical: "BATT_ARM_VOLT",
      label: "Arm voltage",
      batchId: "battery_compensation",
      proposedValue: roundToDigits(calcBattArmVolt(inputs.cellCount, chemistry.cellVoltMin)),
    },
    {
      canonical: "BATT_LOW_VOLT",
      label: "Low voltage",
      batchId: "battery_compensation",
      proposedValue: roundToDigits(calcBattLowVolt(inputs.cellCount, chemistry.cellVoltMin)),
    },
    {
      canonical: "BATT_CRT_VOLT",
      label: "Critical voltage",
      batchId: "battery_compensation",
      proposedValue: roundToDigits(calcBattCrtVolt(inputs.cellCount, chemistry.cellVoltMin)),
    },
    ...SAFETY_DEFAULTS.map((definition) => ({
      ...definition,
      batchId: "safety_defaults" as const,
    })),
  ];
}

function describeFamily(profile: VehicleProfile): InitialParamsFamilyRecommendation {
  if (profile.isCopter) {
    return {
      state: "copter",
      headline: "Multirotor starter baseline",
      detail:
        "Mission Planner’s calculator-style starter values can stage here because the active scope exposes the multirotor control families directly.",
      supportsCalculator: true,
    };
  }

  if (profile.isPlane) {
    if (profile.planeVtolState === "vtol-ready") {
      return {
        state: "quadplane",
        headline: "QuadPlane VTOL starter baseline",
        detail:
          "QuadPlane is fully identified, so hover-related ATC_* and MOT_* starters are remapped to the truthful Q_A_* and Q_M_* families.",
        supportsCalculator: true,
      };
    }

    if (profile.quadPlaneEnabled || profile.planeVtolState === "enable-pending" || profile.planeVtolState === "awaiting-refresh" || profile.planeVtolState === "partial-refresh") {
      return {
        state: "quadplane-refresh",
        headline: "QuadPlane refresh required",
        detail:
          "VTOL starter formulas stay blocked until the active scope exposes the full Q_A_* and Q_M_* families after the QuadPlane refresh.",
        supportsCalculator: false,
      };
    }

    return {
      state: "plain-plane",
      headline: "Fixed-wing starter gap",
      detail:
        "This calculator is intentionally scoped to multirotor and QuadPlane hover tuning. Fixed-wing starter values stay outside this purpose-built section.",
      supportsCalculator: false,
    };
  }

  if (profile.isRover) {
    return {
      state: "rover",
      headline: "Rover starter gap",
      detail:
        "Rover startup tuning is intentionally not modeled in this calculator-first section yet. Use the dedicated setup sections or Full Parameters instead.",
      supportsCalculator: false,
    };
  }

  return {
    state: "unknown",
    headline: "Unsupported vehicle family",
    detail:
      "The current vehicle family is ambiguous, so the initial-parameter calculator stays fail-closed instead of guessing which parameter families should be touched.",
    supportsCalculator: false,
  };
}

function batchDefinition(batchId: InitialParamsPreviewBatch["id"]): RecommendationBatchDefinition {
  return PREVIEW_BATCHES.find((entry) => entry.id === batchId) ?? {
    id: batchId,
    title: batchId,
    description: "Preview batch",
  };
}

function buildBatch(
  batchId: InitialParamsPreviewBatch["id"],
  definitions: RecommendationDefinition[],
  itemIndex: Map<string, ParameterItemModel>,
  profile: VehicleProfile,
  stagedEdits: Record<string, { nextValue: number } | undefined>,
  usingFallbackInputs: boolean,
): {
  batch: InitialParamsPreviewBatch;
  missingNames: string[];
} {
  const entries: InitialParamsPreviewEntry[] = [];
  const rows: InitialParamsPreviewRow[] = [];
  const missingNames: string[] = [];

  for (const definition of definitions.filter((entry) => entry.batchId === batchId)) {
    const targetName = toVehicleParamName(definition.canonical, profile);
    const item = itemIndex.get(targetName) ?? null;

    if (!item) {
      missingNames.push(targetName);
      continue;
    }

    const currentValue = currentOrStagedValue(item, stagedEdits);
    const willChange = currentValue !== definition.proposedValue;

    entries.push({
      item,
      name: targetName,
      nextValue: definition.proposedValue,
    });
    rows.push({
      key: targetName,
      label: item.label,
      paramName: targetName,
      detail: `${formatParamValue(currentValue)} → ${formatParamValue(definition.proposedValue)}`,
      willChange,
    });
  }

  const definition = batchDefinition(batchId);
  const changedCount = rows.filter((row) => row.willChange).length;
  const stageBlockedReason = usingFallbackInputs
    ? "Current calculator fields are invalid, so this preview stays visible for reference only until the inputs are fixed."
    : null;

  return {
    batch: {
      id: batchId,
      title: definition.title,
      description: definition.description,
      rows,
      entries,
      changedCount,
      stageAllowed: !usingFallbackInputs,
      stageBlockedReason,
    },
    missingNames,
  };
}

export function buildInitialParamsModel(input: InitialParamsModelInput): InitialParamsModel {
  const vehicleProfile = deriveVehicleProfile(input.vehicleType, {
    paramStore: input.paramStore,
    stagedEdits: input.stagedEdits,
  });
  const family = describeFamily(vehicleProfile);
  const { resolvedInputs, usingFallbackInputs, validationMessage } = resolveInputs(input.inputs, input.fallbackInputs);
  const itemIndex = buildParameterItemIndex(input.paramStore, input.metadata);

  if (!resolvedInputs || !family.supportsCalculator) {
    const previewStateText = resolvedInputs === null ? "Inputs incomplete" : family.headline;
    const previewDetailText = resolvedInputs === null
      ? validationMessage ?? "Enter valid calculator inputs to preview initial-parameter batches."
      : family.detail;
    const recoveryReasons = family.supportsCalculator ? [] : [family.detail];

    return {
      family,
      vehicleProfile,
      validationMessage,
      resolvedInputs,
      usingFallbackInputs,
      previewStateText,
      previewDetailText,
      missingParamNames: [],
      recoveryReasons,
      batches: [],
      availableBatchCount: 0,
      totalChangeCount: 0,
      canConfirm: false,
    };
  }

  const definitions = buildRecommendationDefinitions(resolvedInputs);
  const batchResults = PREVIEW_BATCHES.map((definition) =>
    buildBatch(definition.id, definitions, itemIndex, vehicleProfile, input.stagedEdits, usingFallbackInputs)
  );

  const batches = batchResults
    .map((result) => result.batch)
    .filter((batch) => batch.rows.length > 0);
  const missingParamNames = [...new Set(batchResults.flatMap((result) => result.missingNames))];
  const quadPlaneFamilyMissing = missingParamNames.filter((name) => name.startsWith("Q_A_") || name.startsWith("Q_M_"));
  const recoveryReasons: string[] = [];

  if (usingFallbackInputs && validationMessage) {
    recoveryReasons.push(validationMessage);
  }

  if (quadPlaneFamilyMissing.length > 0) {
    recoveryReasons.push(
      `QuadPlane starter rows are incomplete for this scope: ${quadPlaneFamilyMissing.join(", ")}. Refresh parameters or recover through Full Parameters before staging VTOL starter values.`,
    );
  }

  if (quadPlaneFamilyMissing.length === 0 && missingParamNames.length > 0) {
    recoveryReasons.push(
      `Some starter rows are unavailable on this scope and were omitted from the preview: ${missingParamNames.join(", ")}.`,
    );
  }

  const stageLockedByQuadPlaneGap = quadPlaneFamilyMissing.length > 0;
  const resolvedBatches = stageLockedByQuadPlaneGap
    ? batches.map((batch) => ({
        ...batch,
        stageAllowed: false,
        stageBlockedReason:
          "QuadPlane VTOL starter families are incomplete on this scope, so staging stays locked until Q_A_* and Q_M_* rows recover.",
      }))
    : batches;
  const totalChangeCount = resolvedBatches.reduce((count, batch) => count + batch.changedCount, 0);
  const canConfirm = recoveryReasons.length === 0
    && !usingFallbackInputs
    && resolvedBatches.length > 0
    && totalChangeCount === 0;

  let previewStateText = `${totalChangeCount} recommended change${totalChangeCount === 1 ? "" : "s"}`;
  let previewDetailText = usingFallbackInputs
    ? "Showing the last valid calculator preview only for reference. Fix the current inputs before staging any starter batch."
    : family.detail;

  if (resolvedBatches.length === 0) {
    previewStateText = "No previewable rows";
    previewDetailText = recoveryReasons[0]
      ?? "The current scope does not expose enough initial-parameter rows to build a truthful starter preview.";
  } else if (usingFallbackInputs) {
    previewStateText = "Stale preview retained";
  }

  return {
    family,
    vehicleProfile,
    validationMessage,
    resolvedInputs,
    usingFallbackInputs,
    previewStateText,
    previewDetailText,
    missingParamNames,
    recoveryReasons,
    batches: resolvedBatches,
    availableBatchCount: resolvedBatches.length,
    totalChangeCount,
    canConfirm,
  };
}

export function createResolvedInitialParamsInputs(
  inputs: ResolvedInitialParamsInputs,
): ResolvedInitialParamsInputs {
  return {
    propInches: inputs.propInches,
    cellCount: inputs.cellCount,
    chemistryIndex: inputs.chemistryIndex,
  };
}
