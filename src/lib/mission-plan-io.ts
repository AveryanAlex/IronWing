import type { FencePlan, HomePosition, MissionItem, MissionPlan, RallyPlan } from "./mavkit-types";
import { exportFencePlan, parseFencePlan } from "./mission-plan-io/fence-codec";
import {
    DEFAULT_CRUISE_SPEED_MPS,
    DEFAULT_FIRMWARE_TYPE,
    DEFAULT_HOVER_SPEED_MPS,
    DEFAULT_VEHICLE_TYPE,
    QGC_FILE_TYPE,
    QGC_GROUND_STATION,
    QGC_MISSION_VERSION,
    QGC_PLAN_VERSION,
    type QgcComplexItem,
    type QgcPlan,
    type QgcSimpleItem,
} from "./mission-plan-io/qgc-types";
import { exportRallyPlan, parseRallyPlan } from "./mission-plan-io/rally-codec";
import {
    exportMissionItem,
    missionFrameFromNumeric,
    missionFrameToNumeric,
    parseSimpleItem,
} from "./mission-plan-io/simple-item-codec";
import { exportSurveyRegion, flattenComplexItem, parseKnownComplexItem } from "./mission-plan-io/survey-complex-item-codec";
import type { ExportPlanInput, ExportableSurveyRegion, ParsedSurveyRegion } from "./mission-plan-io/types";

export type { ExportDomain, ExportableSurveyRegion, ParsedSurveyRegion } from "./mission-plan-io/types";
export { missionFrameFromNumeric, missionFrameToNumeric };

export type PlanParseResult = {
    mission: MissionPlan;
    surveyRegions: ParsedSurveyRegion[];
    home: HomePosition | null;
    fence: FencePlan;
    rally: RallyPlan;
    cruiseSpeed: number;
    hoverSpeed: number;
    warnings: string[];
};

export type PlanExportResult = {
    json: QgcPlan;
    warnings: string[];
};

type ParsedMissionItems = {
    items: MissionItem[];
    surveyRegions: ParsedSurveyRegion[];
};

function numberOrZero(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberOrDefault(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizePosition(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return 0;
    }

    return Math.max(0, Math.trunc(value));
}

function parseHomePosition(value: [number, number, number] | number[] | undefined): HomePosition | null {
    if (!Array.isArray(value) || value.length < 3) {
        return null;
    }

    return {
        latitude_deg: numberOrZero(value[0]),
        longitude_deg: numberOrZero(value[1]),
        altitude_m: numberOrZero(value[2]),
    };
}

function parseMissionItems(items: unknown[] | undefined, warnings: string[]): ParsedMissionItems {
    if (!Array.isArray(items)) {
        return { items: [], surveyRegions: [] };
    }

    const flattened: QgcSimpleItem[] = [];
    const surveyRegions: ParsedSurveyRegion[] = [];

    for (const [index, rawItem] of items.entries()) {
        if (!rawItem || typeof rawItem !== "object") {
            warnings.push(`Mission item ${index + 1} is not an object and was skipped.`);
            continue;
        }

        const item = rawItem as Record<string, unknown>;
        const itemType = item.type;
        if (itemType === "SimpleItem") {
            if (typeof item.command === "number") {
                flattened.push(item as unknown as QgcSimpleItem);
            } else {
                warnings.push(`Mission SimpleItem ${index + 1} is missing a numeric command and was skipped.`);
            }
            continue;
        }

        if (itemType === "ComplexItem") {
            const complexItem = item as unknown as QgcComplexItem;
            const parsedRegion = parseKnownComplexItem(complexItem, flattened.length, index, warnings);
            if (parsedRegion) {
                surveyRegions.push(parsedRegion);
                warnings.push(...parsedRegion.warnings);
                continue;
            }

            flattenComplexItem(complexItem, index, flattened, warnings);
            continue;
        }

        warnings.push(`Mission item ${index + 1} has unsupported type ${String(itemType)} and was skipped.`);
    }

    return {
        items: flattened.map((item, index) => parseSimpleItem(item, index, warnings)),
        surveyRegions,
    };
}

function exportMissionItemsWithSurveyRegions(
    missionItems: MissionItem[],
    surveyRegions: ExportableSurveyRegion[],
    warnings: string[],
): Array<QgcSimpleItem | QgcComplexItem> {
    const exportedSimpleItems = missionItems.map((item, index) => exportMissionItem(item, index, warnings));
    const orderedSurveyRegions = surveyRegions
        .map((region, index) => ({ region, index }))
        .sort((left, right) => normalizePosition(left.region.position) - normalizePosition(right.region.position) || left.index - right.index);

    const combined: Array<QgcSimpleItem | QgcComplexItem> = [];
    let surveyRegionIndex = 0;

    const appendSurveyRegionsAtPosition = (position: number) => {
        while (surveyRegionIndex < orderedSurveyRegions.length) {
            const current = orderedSurveyRegions[surveyRegionIndex];
            if (!current || normalizePosition(current.region.position) !== position) {
                break;
            }
            combined.push(exportSurveyRegion(current.region, warnings));
            surveyRegionIndex += 1;
        }
    };

    appendSurveyRegionsAtPosition(0);

    exportedSimpleItems.forEach((item, index) => {
        combined.push(item);
        appendSurveyRegionsAtPosition(index + 1);
    });

    while (surveyRegionIndex < orderedSurveyRegions.length) {
        const current = orderedSurveyRegions[surveyRegionIndex];
        if (current) {
            combined.push(exportSurveyRegion(current.region, warnings));
        }
        surveyRegionIndex += 1;
    }

    return combined;
}

export function parsePlanFile(input: string | object): PlanParseResult {
    const warnings: string[] = [];
    const json = coercePlanJson(input, warnings);
    const missionSection = json?.mission ?? {};
    const parsedMission = parseMissionItems(missionSection.items, warnings);

    return {
        mission: {
            items: parsedMission.items,
        },
        surveyRegions: parsedMission.surveyRegions,
        home: parseHomePosition(missionSection.plannedHomePosition),
        fence: parseFencePlan(json?.geoFence, warnings),
        rally: parseRallyPlan(json?.rallyPoints, warnings),
        cruiseSpeed: numberOrDefault(missionSection.cruiseSpeed, DEFAULT_CRUISE_SPEED_MPS),
        hoverSpeed: numberOrDefault(missionSection.hoverSpeed, DEFAULT_HOVER_SPEED_MPS),
        warnings,
    };
}

export function exportPlanFile({ mission, surveyRegions, home, fence, rally, cruiseSpeed, hoverSpeed, excludeDomains }: ExportPlanInput): PlanExportResult {
    const warnings: string[] = [];
    const excluded = new Set(excludeDomains ?? []);
    const missionItems = excluded.has("mission")
        ? []
        : exportMissionItemsWithSurveyRegions(mission.items, surveyRegions ?? [], warnings);
    const plannedHomePosition: [number, number, number] = home && !excluded.has("mission")
        ? [home.latitude_deg, home.longitude_deg, home.altitude_m]
        : [0, 0, 0];

    const json: QgcPlan = {
        fileType: QGC_FILE_TYPE,
        version: QGC_PLAN_VERSION,
        groundStation: QGC_GROUND_STATION,
        mission: {
            version: QGC_MISSION_VERSION,
            firmwareType: DEFAULT_FIRMWARE_TYPE,
            vehicleType: DEFAULT_VEHICLE_TYPE,
            cruiseSpeed: numberOrDefault(cruiseSpeed, DEFAULT_CRUISE_SPEED_MPS),
            hoverSpeed: numberOrDefault(hoverSpeed, DEFAULT_HOVER_SPEED_MPS),
            plannedHomePosition,
            items: missionItems,
        },
    };

    if (!excluded.has("fence")) {
        if (fence.return_point !== null) {
            warnings.push("Fence return_point is not represented in QGroundControl .plan files and was omitted during export.");
        }

        if (fence.regions.length > 0) {
            json.geoFence = exportFencePlan(fence);
        }
    }

    if (!excluded.has("rally") && rally.points.length > 0) {
        const rallyExport = exportRallyPlan(rally, warnings);
        if (rallyExport.points.length > 0) {
            json.rallyPoints = rallyExport;
        }
    }

    return { json, warnings };
}

function coercePlanJson(input: string | object, warnings: string[]): QgcPlan | null {
    if (typeof input === "string") {
        try {
            return JSON.parse(input) as QgcPlan;
        } catch {
            warnings.push("Plan file is not valid JSON; returning empty mission, fence, and rally plans.");
            return null;
        }
    }

    if (input && typeof input === "object") {
        return input as QgcPlan;
    }

    warnings.push("Plan input was neither a JSON string nor an object; returning empty mission, fence, and rally plans.");
    return null;
}
