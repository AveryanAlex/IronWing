import {
    BATTERY_CHEMISTRIES,
    calcAccelPRMax,
    calcAccelYMax,
    calcBattArmVolt,
    calcBattCrtVolt,
    calcBattLowVolt,
    calcBattVoltMax,
    calcBattVoltMin,
    calcGyroFilter,
    calcMotThrustExpo,
} from "../../data/battery-presets";
import type { ParamMeta, ParamMetadataMap } from "../../param-metadata";
import type { Param, ParamStore } from "../../params";
import type { StagedParameterEdit } from "../stores/params-staged-edits";
import {
    buildParameterItemModel,
    type ParameterItemModel,
} from "./parameter-item-model";

export type WorkflowMetadataState = "idle" | "loading" | "ready" | "unavailable";
export type ParameterWorkflowCardId = "battery" | "safety" | "flight";
export type ParameterWorkflowCardStatus = "ready" | "disabled";

export type BatteryWorkflowInputs = {
    cellCount: number | null;
    chemistryIndex: number | null;
};

export type FlightWorkflowInputs = {
    propInches: number | null;
};

export type WorkflowInputValidation = {
    valid: boolean;
    message: string | null;
};

export type ParameterWorkflowRecommendation = {
    name: string;
    label: string;
    description: string | null;
    units: string | null;
    rebootRequired: boolean;
    currentValue: number;
    currentValueText: string;
    currentValueLabel: string | null;
    proposedValue: number;
    proposedValueText: string;
    proposedValueLabel: string | null;
    changed: boolean;
    isQueued: boolean;
    queuedValue: number | null;
    queuedValueText: string | null;
    hasQueuedOverride: boolean;
    item: ParameterItemModel;
};

export type ParameterWorkflowCard = {
    id: ParameterWorkflowCardId;
    title: string;
    eyebrow: string;
    description: string;
    summary: string;
    detail: string | null;
    status: ParameterWorkflowCardStatus;
    disabledMessage: string | null;
    targetNames: string[];
    recommendations: ParameterWorkflowRecommendation[];
    changedCount: number;
    matchingCount: number;
    queuedCount: number;
    unavailableCount: number;
};

export type ParameterWorkflowSection = {
    id: string;
    title: string;
    description: string;
    cards: ParameterWorkflowCard[];
};

type ResolvedBatteryWorkflowInputs = {
    cellCount: number;
    chemistryIndex: number;
};

type ResolvedFlightWorkflowInputs = {
    propInches: number;
};

type WorkflowBuildArgs = {
    paramStore: ParamStore | null;
    metadata: ParamMetadataMap | null;
    metadataState: WorkflowMetadataState;
    stagedEdits: Record<string, StagedParameterEdit>;
    batteryInputs: ResolvedBatteryWorkflowInputs;
    flightInputs: ResolvedFlightWorkflowInputs;
};

type WorkflowRecommendationDefinition = {
    name: string;
    proposedValue: number;
};

type WorkflowCardBase = Pick<ParameterWorkflowCard, "id" | "title" | "eyebrow" | "description">;

const workflowSectionDefinitions: ReadonlyArray<{
    id: string;
    title: string;
    description: string;
    cardIds: ParameterWorkflowCardId[];
}> = [
        {
            id: "power-protection",
            title: "Power and protection",
            description:
                "Start with battery thresholds and basic failsafe defaults so the vehicle is predictable before the first flight.",
            cardIds: ["battery", "safety"],
        },
        {
            id: "flight-starter",
            title: "Flight feel starter",
            description:
                "Use a prop-sized baseline for throttle curve and attitude response before deeper tuning in Advanced parameters.",
            cardIds: ["flight"],
        },
    ];

const workflowCardDefinitions: Record<ParameterWorkflowCardId, WorkflowCardBase> = {
    battery: {
        id: "battery",
        eyebrow: "Battery workflow",
        title: "Battery and power",
        description:
            "Calculate conservative arm, low, and critical voltage thresholds from your pack chemistry and cell count.",
    },
    safety: {
        id: "safety",
        eyebrow: "Safety starter",
        title: "Safety and failsafe starter",
        description:
            "Turn on high-value arming and failsafe defaults before expanding into the full raw parameter browser.",
    },
    flight: {
        id: "flight",
        eyebrow: "Flight starter",
        title: "Flight feel starter",
        description:
            "Use prop-size formulas to seed a baseline throttle curve and acceleration limits for the current airframe.",
    },
};

const safetyStarterDefinitions: ReadonlyArray<WorkflowRecommendationDefinition> = [
    { name: "ARMING_CHECK", proposedValue: 1 },
    { name: "FS_THR_ENABLE", proposedValue: 1 },
    { name: "BATT_FS_LOW_ACT", proposedValue: 2 },
    { name: "BATT_FS_CRT_ACT", proposedValue: 1 },
];

export function validateBatteryWorkflowInputs(
    inputs: BatteryWorkflowInputs,
): WorkflowInputValidation {
    if (!Number.isInteger(inputs.cellCount) || Number(inputs.cellCount) < 1) {
        return {
            valid: false,
            message: "Enter a valid battery cell count before queuing recommendations.",
        };
    }

    if (
        !Number.isInteger(inputs.chemistryIndex)
        || Number(inputs.chemistryIndex) < 0
        || Number(inputs.chemistryIndex) >= BATTERY_CHEMISTRIES.length
    ) {
        return {
            valid: false,
            message: "Choose a supported battery chemistry before queuing recommendations.",
        };
    }

    return {
        valid: true,
        message: null,
    };
}

export function validateFlightWorkflowInputs(
    inputs: FlightWorkflowInputs,
): WorkflowInputValidation {
    if (typeof inputs.propInches !== "number" || !Number.isFinite(inputs.propInches) || inputs.propInches <= 0) {
        return {
            valid: false,
            message: "Enter a valid prop size before queuing recommendations.",
        };
    }

    return {
        valid: true,
        message: null,
    };
}

export function buildParameterWorkflowSections(args: WorkflowBuildArgs): ParameterWorkflowSection[] {
    const cards = new Map<ParameterWorkflowCardId, ParameterWorkflowCard>([
        ["battery", buildBatteryWorkflowCard(args)],
        ["safety", buildSafetyWorkflowCard(args)],
        ["flight", buildFlightWorkflowCard(args)],
    ]);

    return workflowSectionDefinitions.map((section) => ({
        id: section.id,
        title: section.title,
        description: section.description,
        cards: section.cardIds.map((cardId) => cards.get(cardId)!).filter(Boolean),
    }));
}

function buildBatteryWorkflowCard(args: WorkflowBuildArgs): ParameterWorkflowCard {
    const chemistry = BATTERY_CHEMISTRIES[args.batteryInputs.chemistryIndex];

    return buildWorkflowCard(args, workflowCardDefinitions.battery, [
        {
            name: "BATT_ARM_VOLT",
            proposedValue: roundToFixed(calcBattArmVolt(args.batteryInputs.cellCount, chemistry.cellVoltMin)),
        },
        {
            name: "BATT_LOW_VOLT",
            proposedValue: roundToFixed(calcBattLowVolt(args.batteryInputs.cellCount, chemistry.cellVoltMin)),
        },
        {
            name: "BATT_CRT_VOLT",
            proposedValue: roundToFixed(calcBattCrtVolt(args.batteryInputs.cellCount, chemistry.cellVoltMin)),
        },
        {
            name: "MOT_BAT_VOLT_MAX",
            proposedValue: roundToFixed(calcBattVoltMax(args.batteryInputs.cellCount, chemistry.cellVoltMax)),
        },
        {
            name: "MOT_BAT_VOLT_MIN",
            proposedValue: roundToFixed(calcBattVoltMin(args.batteryInputs.cellCount, chemistry.cellVoltMin)),
        },
    ]);
}

function buildSafetyWorkflowCard(args: WorkflowBuildArgs): ParameterWorkflowCard {
    return buildWorkflowCard(args, workflowCardDefinitions.safety, safetyStarterDefinitions);
}

function buildFlightWorkflowCard(args: WorkflowBuildArgs): ParameterWorkflowCard {
    return buildWorkflowCard(args, workflowCardDefinitions.flight, [
        {
            name: "MOT_THST_EXPO",
            proposedValue: roundToFixed(calcMotThrustExpo(args.flightInputs.propInches)),
        },
        {
            name: "INS_GYRO_FILTER",
            proposedValue: calcGyroFilter(args.flightInputs.propInches),
        },
        {
            name: "ATC_ACCEL_P_MAX",
            proposedValue: calcAccelPRMax(args.flightInputs.propInches),
        },
        {
            name: "ATC_ACCEL_R_MAX",
            proposedValue: calcAccelPRMax(args.flightInputs.propInches),
        },
        {
            name: "ATC_ACCEL_Y_MAX",
            proposedValue: calcAccelYMax(args.flightInputs.propInches),
        },
    ]);
}

function buildWorkflowCard(
    args: WorkflowBuildArgs,
    base: WorkflowCardBase,
    definitions: ReadonlyArray<WorkflowRecommendationDefinition>,
): ParameterWorkflowCard {
    const metadataLock = resolveMetadataLock(args.metadataState, args.metadata);
    if (metadataLock) {
        return {
            ...base,
            summary: metadataLock.summary,
            detail: metadataLock.detail,
            status: "disabled",
            disabledMessage: metadataLock.detail,
            targetNames: definitions.map((definition) => definition.name),
            recommendations: [],
            changedCount: 0,
            matchingCount: 0,
            queuedCount: 0,
            unavailableCount: definitions.length,
        };
    }

    const recommendations: ParameterWorkflowRecommendation[] = [];
    let unavailableCount = 0;

    for (const definition of definitions) {
        const recommendation = buildRecommendation(
            definition,
            args.paramStore,
            args.metadata,
            args.stagedEdits,
        );
        if (!recommendation) {
            unavailableCount += 1;
            continue;
        }

        recommendations.push(recommendation);
    }

    const changedCount = recommendations.filter((recommendation) => recommendation.changed).length;
    const matchingCount = recommendations.length - changedCount;
    const queuedCount = recommendations.filter((recommendation) => recommendation.isQueued).length;

    if (recommendations.length === 0) {
        return {
            ...base,
            summary: "This workflow is unavailable for the current snapshot.",
            detail: "The current vehicle did not expose enough labeled parameters for this guided starter. Open Advanced parameters for raw access.",
            status: "disabled",
            disabledMessage:
                "The current vehicle did not expose enough labeled parameters for this guided starter. Open Advanced parameters for raw access.",
            targetNames: definitions.map((definition) => definition.name),
            recommendations: [],
            changedCount: 0,
            matchingCount: 0,
            queuedCount: 0,
            unavailableCount,
        };
    }

    return {
        ...base,
        summary: buildSummaryText(changedCount, queuedCount, recommendations.length),
        detail: buildDetailText(unavailableCount, recommendations),
        status: "ready",
        disabledMessage: null,
        targetNames: definitions.map((definition) => definition.name),
        recommendations,
        changedCount,
        matchingCount,
        queuedCount,
        unavailableCount,
    };
}

function buildRecommendation(
    definition: WorkflowRecommendationDefinition,
    paramStore: ParamStore | null,
    metadata: ParamMetadataMap | null,
    stagedEdits: Record<string, StagedParameterEdit>,
): ParameterWorkflowRecommendation | null {
    const param = paramStore?.params[definition.name];
    if (!param) {
        return null;
    }

    const meta = metadata?.get(definition.name);
    if (!hasGuidedMetadata(meta)) {
        return null;
    }

    const item = buildParameterItemModel(param, metadata);
    const proposedItem = buildParameterItemModel(createProposedParam(param, definition.proposedValue), metadata);
    const queuedEdit = stagedEdits[definition.name];
    const queuedValue = typeof queuedEdit?.nextValue === "number" ? queuedEdit.nextValue : null;
    const isQueued = queuedValue === definition.proposedValue;

    return {
        name: definition.name,
        label: item.label,
        description: item.description,
        units: item.units,
        rebootRequired: item.rebootRequired,
        currentValue: item.value,
        currentValueText: item.valueText,
        currentValueLabel: item.valueLabel,
        proposedValue: definition.proposedValue,
        proposedValueText: proposedItem.valueText,
        proposedValueLabel: proposedItem.valueLabel,
        changed: item.value !== definition.proposedValue,
        isQueued,
        queuedValue,
        queuedValueText: queuedValue === null ? null : queuedEdit?.nextValueText ?? proposedItem.valueText,
        hasQueuedOverride: queuedValue !== null && queuedValue !== definition.proposedValue,
        item,
    };
}

function createProposedParam(param: Param, proposedValue: number): Param {
    return {
        ...param,
        value: proposedValue,
    };
}

function hasGuidedMetadata(meta: ParamMeta | undefined): boolean {
    return typeof meta?.humanName === "string" && meta.humanName.trim().length > 0;
}

function resolveMetadataLock(
    metadataState: WorkflowMetadataState,
    metadata: ParamMetadataMap | null,
): { summary: string; detail: string } | null {
    if (metadataState === "ready" && metadata) {
        return null;
    }

    if (metadataState === "unavailable") {
        return {
            summary: "Guided recommendations are paused.",
            detail:
                "Parameter info is unavailable for this vehicle, so the workflow cards stay visible but disabled. Open Advanced parameters for raw access and staging.",
        };
    }

    return {
        summary: "Guided recommendations are loading.",
        detail:
            "Current values are still loading their parameter labels and docs. Guided staging unlocks when parameter info is ready.",
    };
}

function buildSummaryText(
    changedCount: number,
    queuedCount: number,
    totalCount: number,
): string {
    if (totalCount === 0) {
        return "No guided recommendations are available.";
    }

    if (changedCount === 0) {
        return `All ${totalCount} recommendations already match the current vehicle.`;
    }

    if (queuedCount === changedCount) {
        return `${queuedCount} recommendation${queuedCount === 1 ? "" : "s"} already queued in the review tray.`;
    }

    if (queuedCount > 0) {
        return `${queuedCount} queued · ${changedCount - queuedCount} remaining recommendation${changedCount - queuedCount === 1 ? "" : "s"}.`;
    }

    return `${changedCount} recommendation${changedCount === 1 ? "" : "s"} differ from the current vehicle.`;
}

function buildDetailText(
    unavailableCount: number,
    recommendations: ParameterWorkflowRecommendation[],
): string | null {
    const queuedOverrides = recommendations.filter((recommendation) => recommendation.hasQueuedOverride).length;
    const messages: string[] = [];

    if (unavailableCount > 0) {
        messages.push(
            `${unavailableCount} recommendation${unavailableCount === 1 ? " is" : "s are"} unavailable because the current snapshot is missing those labeled parameters.`,
        );
    }

    if (queuedOverrides > 0) {
        messages.push(
            `${queuedOverrides} queued value${queuedOverrides === 1 ? " already differs" : "s already differ"} from this starter and will be overwritten if you queue the recommendation again.`,
        );
    }

    return messages.length > 0 ? messages.join(" ") : null;
}

function roundToFixed(value: number, digits = 2): number {
    return Number.parseFloat(value.toFixed(digits));
}
