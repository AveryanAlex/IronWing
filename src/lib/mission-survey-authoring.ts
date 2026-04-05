import { generateCorridor, type CorridorParams, type CorridorResult } from "./corridor-scan";
import {
    findCamera,
    type CatalogCamera,
} from "./survey-camera-catalog";
import {
    generateStructureScan,
    type StructureScanParams,
    type StructureScanResult,
} from "./structure-scan";
import {
    normalizeSurveyDraftExtension,
    setSurveyRegionGenerationState,
    type SurveyDraftExtension,
    type SurveyRegion,
} from "./survey-region";
import {
    generateSurvey,
    type SurveyParams,
    type SurveyResult,
} from "./survey-grid";

export type SurveyAuthoringSelection =
    | { kind: "home" }
    | { kind: "mission-item"; index: number | null }
    | { kind: "survey-block"; regionId: string };

export type SurveyInsertionSite = {
    position: number;
    orderIndex: number;
};

export type SurveyAuthoringPrompt =
    | {
        kind: "confirm-regenerate";
        regionId: string;
        manualEditCount: number;
        message: string;
    }
    | {
        kind: "confirm-dissolve";
        regionId: string;
        generatedItemCount: number;
        manualEditCount: number;
        message: string;
    };

export type SurveyGenerationBlockedReason = {
    code: "invalid_geometry" | "missing_camera" | "unresolved_camera";
    message: string;
};

export type SurveyGenerationRequest =
    | {
        kind: "grid";
        params: SurveyParams;
    }
    | {
        kind: "corridor";
        params: CorridorParams;
    }
    | {
        kind: "structure";
        params: StructureScanParams;
    };

export type SurveyEngineRunners = {
    grid: (params: SurveyParams) => Promise<SurveyResult>;
    corridor: (params: CorridorParams) => Promise<CorridorResult>;
    structure: (params: StructureScanParams) => Promise<StructureScanResult>;
};

export const DEFAULT_SURVEY_ENGINE_RUNNERS: SurveyEngineRunners = {
    grid: generateSurvey,
    corridor: generateCorridor,
    structure: generateStructureScan,
};

export function normalizeSurveyAuthoringExtension(extension: SurveyDraftExtension): SurveyDraftExtension {
    const ordered = normalizeSurveyDraftExtension(extension);
    const surveyRegions = new Map<string, SurveyRegion>();

    for (const [regionId, region] of ordered.surveyRegions) {
        surveyRegions.set(regionId, reconcileSurveyRegionGenerationState(region));
    }

    return {
        surveyRegions,
        surveyRegionOrder: ordered.surveyRegionOrder.map((block) => ({ ...block })),
    };
}

export function reindexSurveyBlocksAfterDissolve(
    survey: SurveyDraftExtension,
    missionItemCount: number,
    regionId: string,
    insertedItemCount: number,
): SurveyDraftExtension {
    const orderedBlocks = survey.surveyRegionOrder
        .map((block, index) => ({ block, index }))
        .sort((left, right) => left.block.position - right.block.position || left.index - right.index);
    const mixedEntries: Array<{ kind: "manual" } | { kind: "survey"; regionId: string }> = [];
    let blockIndex = 0;

    const appendBlocksAt = (position: number) => {
        while (blockIndex < orderedBlocks.length && orderedBlocks[blockIndex]?.block.position === position) {
            const block = orderedBlocks[blockIndex]?.block;
            if (block) {
                mixedEntries.push({ kind: "survey", regionId: block.regionId });
            }
            blockIndex += 1;
        }
    };

    appendBlocksAt(0);

    for (let index = 0; index < missionItemCount; index += 1) {
        mixedEntries.push({ kind: "manual" });
        appendBlocksAt(index + 1);
    }

    while (blockIndex < orderedBlocks.length) {
        const block = orderedBlocks[blockIndex]?.block;
        if (block) {
            mixedEntries.push({ kind: "survey", regionId: block.regionId });
        }
        blockIndex += 1;
    }

    const replacedEntries: Array<{ kind: "manual" } | { kind: "survey"; regionId: string }> = [];
    for (const entry of mixedEntries) {
        if (entry.kind === "survey" && entry.regionId === regionId) {
            for (let count = 0; count < insertedItemCount; count += 1) {
                replacedEntries.push({ kind: "manual" });
            }
            continue;
        }

        replacedEntries.push(entry);
    }

    let manualCount = 0;
    const surveyRegionOrder: SurveyDraftExtension["surveyRegionOrder"] = [];
    for (const entry of replacedEntries) {
        if (entry.kind === "manual") {
            manualCount += 1;
            continue;
        }

        if (!survey.surveyRegions.has(entry.regionId) || entry.regionId === regionId) {
            continue;
        }

        surveyRegionOrder.push({
            regionId: entry.regionId,
            position: manualCount,
        });
    }

    return {
        surveyRegions: new Map(survey.surveyRegions),
        surveyRegionOrder,
    };
}

export function resolveSurveyInsertionSite(
    selection: SurveyAuthoringSelection,
    survey: SurveyDraftExtension,
): SurveyInsertionSite {
    const orderedBlocks = survey.surveyRegionOrder
        .map((block, index) => ({ block, index }))
        .sort((left, right) => left.block.position - right.block.position || left.index - right.index);

    if (selection.kind === "survey-block") {
        const selectedIndex = orderedBlocks.findIndex(({ block }) => block.regionId === selection.regionId);
        if (selectedIndex >= 0) {
            return {
                position: orderedBlocks[selectedIndex]?.block.position ?? 0,
                orderIndex: selectedIndex + 1,
            };
        }
    }

    const position = selection.kind === "mission-item" && selection.index !== null
        ? Math.max(0, selection.index + 1)
        : 0;
    const orderIndex = orderedBlocks.findIndex(({ block }) => block.position >= position);

    return {
        position,
        orderIndex: orderIndex === -1 ? orderedBlocks.length : orderIndex,
    };
}

export function createSurveyRegeneratePrompt(region: SurveyRegion): SurveyAuthoringPrompt | null {
    if (region.manualEdits.size === 0) {
        return null;
    }

    return {
        kind: "confirm-regenerate",
        regionId: region.id,
        manualEditCount: region.manualEdits.size,
        message: `Regenerating this ${region.patternType} survey will overwrite ${region.manualEdits.size} manual edit${region.manualEdits.size === 1 ? "" : "s"}.`,
    };
}

export function createSurveyDissolvePrompt(region: SurveyRegion): SurveyAuthoringPrompt {
    const generatedItemCount = region.generatedItems.length;
    const manualEditCount = region.manualEdits.size;

    return {
        kind: "confirm-dissolve",
        regionId: region.id,
        generatedItemCount,
        manualEditCount,
        message: generatedItemCount > 0
            ? `Dissolving this ${region.patternType} survey will convert ${generatedItemCount} generated item${generatedItemCount === 1 ? "" : "s"} into manual mission items.`
            : `Dissolving this ${region.patternType} survey will remove the block because it has no generated mission items yet.`,
    };
}

export function resolveSurveyGenerationBlockedReason(region: SurveyRegion): SurveyGenerationBlockedReason | null {
    if (region.patternType === "corridor") {
        if (region.polyline.length < 2) {
            return {
                code: "invalid_geometry",
                message: `Corridor surveys need at least 2 polyline points before they can generate (got ${region.polyline.length}).`,
            };
        }
    } else if (region.polygon.length < 3) {
        return {
            code: "invalid_geometry",
            message: `${region.patternType === "structure" ? "Structure" : "Grid"} surveys need at least 3 polygon points before they can generate (got ${region.polygon.length}).`,
        };
    }

    if (region.camera) {
        return null;
    }

    if (region.cameraId) {
        if (findCamera(region.cameraId)) {
            return null;
        }

        return {
            code: "unresolved_camera",
            message: `Camera \"${region.cameraId}\" is not available in the current catalog. Choose a valid camera before generating this survey region.`,
        };
    }

    if (region.qgcPassthrough) {
        return {
            code: "missing_camera",
            message: "Imported camera metadata was preserved for export only. Choose a valid camera before generating this survey region.",
        };
    }

    return {
        code: "missing_camera",
        message: "Choose a camera before generating this survey region.",
    };
}

export function buildSurveyGenerationRequest(
    region: SurveyRegion,
): { ok: true; request: SurveyGenerationRequest } | { ok: false; blockedReason: SurveyGenerationBlockedReason } {
    const blockedReason = resolveSurveyGenerationBlockedReason(region);
    if (blockedReason) {
        return { ok: false, blockedReason };
    }

    const camera = resolveRegionCamera(region);
    if (!camera) {
        return {
            ok: false,
            blockedReason: {
                code: "missing_camera",
                message: "Choose a camera before generating this survey region.",
            },
        };
    }

    switch (region.patternType) {
        case "corridor":
            return {
                ok: true,
                request: {
                    kind: "corridor",
                    params: {
                        polyline: region.polyline.map((point) => ({ ...point })),
                        camera,
                        altitude_m: region.params.altitude_m,
                        orientation: region.params.orientation,
                        sideOverlap_pct: region.params.sideOverlap_pct,
                        frontOverlap_pct: region.params.frontOverlap_pct,
                        leftWidth_m: region.params.leftWidth_m,
                        rightWidth_m: region.params.rightWidth_m,
                        turnaroundDistance_m: region.params.turnaroundDistance_m,
                        terrainFollow: region.params.terrainFollow,
                        captureMode: region.params.captureMode,
                    },
                },
            };
        case "structure":
            return {
                ok: true,
                request: {
                    kind: "structure",
                    params: {
                        polygon: region.polygon.map((point) => ({ ...point })),
                        camera,
                        altitude_m: region.params.altitude_m,
                        orientation: region.params.orientation,
                        structureHeight_m: region.params.structureHeight_m,
                        scanDistance_m: region.params.scanDistance_m,
                        layerCount: region.params.layerCount,
                        layerOrder: region.params.layerOrder,
                        sideOverlap_pct: region.params.sideOverlap_pct,
                        frontOverlap_pct: region.params.frontOverlap_pct,
                        terrainFollow: region.params.terrainFollow,
                        captureMode: region.params.captureMode,
                    },
                },
            };
        default:
            return {
                ok: true,
                request: {
                    kind: "grid",
                    params: {
                        polygon: region.polygon.map((point) => ({ ...point })),
                        camera,
                        altitude_m: region.params.altitude_m,
                        orientation: region.params.orientation,
                        sideOverlap_pct: region.params.sideOverlap_pct,
                        frontOverlap_pct: region.params.frontOverlap_pct,
                        trackAngle_deg: region.params.trackAngle_deg,
                        startCorner: region.params.startCorner,
                        turnDirection: region.params.turnDirection,
                        crosshatch: region.params.crosshatch,
                        turnaroundDistance_m: region.params.turnaroundDistance_m,
                        terrainFollow: region.params.terrainFollow,
                        captureMode: region.params.captureMode,
                    },
                },
            };
    }
}

export async function runSurveyGenerationRequest(
    request: SurveyGenerationRequest,
    engines: SurveyEngineRunners = DEFAULT_SURVEY_ENGINE_RUNNERS,
): Promise<SurveyResult | CorridorResult | StructureScanResult> {
    switch (request.kind) {
        case "corridor":
            return engines.corridor(request.params);
        case "structure":
            return engines.structure(request.params);
        default:
            return engines.grid(request.params);
    }
}

export function reconcileSurveyRegionGenerationState(region: SurveyRegion): SurveyRegion {
    if (region.generationState === "generating") {
        return region;
    }

    const blockedReason = resolveSurveyGenerationBlockedReason(region);
    if (blockedReason) {
        return setSurveyRegionGenerationState(region, "blocked", blockedReason.message);
    }

    return setSurveyRegionGenerationState(region, "idle", region.errors[0]?.message ?? null);
}

function resolveRegionCamera(region: SurveyRegion): CatalogCamera | null {
    if (region.camera) {
        return { ...region.camera };
    }

    if (!region.cameraId) {
        return null;
    }

    const camera = findCamera(region.cameraId);
    return camera ? { ...camera } : null;
}
