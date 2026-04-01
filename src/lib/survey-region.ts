import type { TypedDraftItem } from "./mission-draft-typed";
import type { StartCorner, TurnDirection } from "./mission-grid";
import type { GeoPoint2d, MissionItem } from "./mavkit-types";
import type { CatalogCamera } from "./survey-camera-catalog";
import type { CameraOrientation } from "./survey-camera";
import type {
    GridValidationError,
    SurveyCaptureMode,
    SurveyResult,
    SurveyStats,
    SurveyTransect,
} from "./survey-grid";

export type SurveyRegionParams = {
    sideOverlap_pct: number;
    frontOverlap_pct: number;
    altitude_m: number;
    trackAngle_deg: number;
    orientation: CameraOrientation;
    crosshatch: boolean;
    turnaroundDistance_m: number;
    terrainFollow: boolean;
    captureMode: SurveyCaptureMode;
    startCorner: StartCorner;
    turnDirection: TurnDirection;
};

export type SurveyRegion = {
    id: string;
    polygon: GeoPoint2d[];
    cameraId: string | null;
    camera: CatalogCamera | null;
    params: SurveyRegionParams;
    generatedItems: MissionItem[];
    generatedTransects: SurveyTransect[];
    generatedCrosshatch: SurveyTransect[];
    generatedStats: SurveyStats | null;
    errors: GridValidationError[];
    manualEdits: Map<number, MissionItem>;
    collapsed: boolean;
};

export type SurveyRegionBlock = {
    regionId: string;
    position: number;
};

export type SurveyDraftExtension = {
    surveyRegions: Map<string, SurveyRegion>;
    surveyRegionOrder: SurveyRegionBlock[];
};

const DEFAULT_REGION_PARAMS: SurveyRegionParams = {
    sideOverlap_pct: 70,
    frontOverlap_pct: 80,
    altitude_m: 50,
    trackAngle_deg: 0,
    orientation: "landscape",
    crosshatch: false,
    turnaroundDistance_m: 0,
    terrainFollow: false,
    captureMode: "distance",
    startCorner: "bottom_left",
    turnDirection: "clockwise",
};

let nextSurveyRegionId = 1;

function allocateSurveyRegionId(): string {
    const id = `survey-region-${nextSurveyRegionId}`;
    nextSurveyRegionId += 1;
    return id;
}

function cloneMissionItems(items: MissionItem[]): MissionItem[] {
    return items.map((item) => ({ ...item }));
}

function cloneTransects(transects: SurveyTransect[]): SurveyTransect[] {
    return transects.map((transect) => transect.map((point) => ({ ...point })));
}

function cloneStats(stats: SurveyStats | null): SurveyStats | null {
    return stats ? { ...stats } : null;
}

function cloneErrors(errors: GridValidationError[]): GridValidationError[] {
    return errors.map((error) => ({ ...error }));
}

function clonePolygon(polygon: GeoPoint2d[]): GeoPoint2d[] {
    return polygon.map((point) => ({ ...point }));
}

function cloneRegion(region: SurveyRegion): SurveyRegion {
    return {
        ...region,
        polygon: clonePolygon(region.polygon),
        params: { ...region.params },
        generatedItems: cloneMissionItems(region.generatedItems),
        generatedTransects: cloneTransects(region.generatedTransects),
        generatedCrosshatch: cloneTransects(region.generatedCrosshatch),
        generatedStats: cloneStats(region.generatedStats),
        errors: cloneErrors(region.errors),
        manualEdits: new Map(region.manualEdits),
        camera: region.camera ? { ...region.camera } : null,
    };
}

function normalizePosition(position: number): number {
    if (!Number.isFinite(position)) {
        return 0;
    }

    return Math.max(0, Math.trunc(position));
}

function orderSurveyBlocks(blocks: SurveyRegionBlock[]): SurveyRegionBlock[] {
    return blocks
        .map((block, index) => ({ block, index }))
        .sort((left, right) => left.block.position - right.block.position || left.index - right.index)
        .map(({ block }) => ({ ...block, position: normalizePosition(block.position) }));
}

function withOrderedBlocks(extension: SurveyDraftExtension): SurveyDraftExtension {
    return {
        surveyRegions: new Map(extension.surveyRegions),
        surveyRegionOrder: orderSurveyBlocks(extension.surveyRegionOrder),
    };
}

function isMissionItemDocument(document: TypedDraftItem["document"]): document is MissionItem {
    return typeof document === "object" && document !== null && "command" in document;
}

export function createSurveyRegion(polygon: GeoPoint2d[]): SurveyRegion {
    return {
        id: allocateSurveyRegionId(),
        polygon: clonePolygon(polygon),
        cameraId: null,
        camera: null,
        params: { ...DEFAULT_REGION_PARAMS },
        generatedItems: [],
        generatedTransects: [],
        generatedCrosshatch: [],
        generatedStats: null,
        errors: [],
        manualEdits: new Map<number, MissionItem>(),
        collapsed: false,
    };
}

export function regionItemCount(region: SurveyRegion): number {
    return region.generatedItems.length;
}

export function regionHasManualEdits(region: SurveyRegion): boolean {
    return region.manualEdits.size > 0;
}

export function applyGenerationResult(region: SurveyRegion, result: SurveyResult): SurveyRegion {
    const next = cloneRegion(region);
    next.manualEdits = new Map<number, MissionItem>();

    if (result.ok) {
        next.generatedItems = cloneMissionItems(result.items);
        next.generatedTransects = cloneTransects(result.transects);
        next.generatedCrosshatch = cloneTransects(result.crosshatchTransects);
        next.generatedStats = cloneStats(result.stats);
        next.errors = [];
        return next;
    }

    next.errors = cloneErrors(result.errors);
    return next;
}

export function markItemEdited(region: SurveyRegion, localIndex: number, editedItem: MissionItem): SurveyRegion {
    const next = cloneRegion(region);
    next.manualEdits.set(localIndex, { ...editedItem });
    return next;
}

export function dissolveRegion(region: SurveyRegion): MissionItem[] {
    if (region.generatedItems.length === 0) {
        return [];
    }

    return region.generatedItems.map((item, index) => {
        const manualEdit = region.manualEdits.get(index);
        return manualEdit ? { ...manualEdit } : { ...item };
    });
}

export function createSurveyDraftExtension(): SurveyDraftExtension {
    return {
        surveyRegions: new Map<string, SurveyRegion>(),
        surveyRegionOrder: [],
    };
}

export function addSurveyRegion(extension: SurveyDraftExtension, region: SurveyRegion, afterIndex: number): SurveyDraftExtension {
    const next = createSurveyDraftExtension();
    next.surveyRegions = new Map(extension.surveyRegions);
    next.surveyRegions.set(region.id, cloneRegion(region));
    next.surveyRegionOrder = [
        ...extension.surveyRegionOrder.map((block) => ({ ...block })),
        { regionId: region.id, position: normalizePosition(afterIndex + 1) },
    ];
    return withOrderedBlocks(next);
}

export function removeSurveyRegion(extension: SurveyDraftExtension, regionId: string): SurveyDraftExtension {
    const nextRegions = new Map(extension.surveyRegions);
    nextRegions.delete(regionId);
    return {
        surveyRegions: nextRegions,
        surveyRegionOrder: extension.surveyRegionOrder
            .filter((block) => block.regionId !== regionId)
            .map((block) => ({ ...block })),
    };
}

export function updateSurveyRegion(
    extension: SurveyDraftExtension,
    regionId: string,
    updater: (region: SurveyRegion) => SurveyRegion,
): SurveyDraftExtension {
    const existing = extension.surveyRegions.get(regionId);
    if (!existing) {
        return withOrderedBlocks(extension);
    }

    const nextRegions = new Map(extension.surveyRegions);
    nextRegions.set(regionId, cloneRegion(updater(cloneRegion(existing))));
    return {
        surveyRegions: nextRegions,
        surveyRegionOrder: extension.surveyRegionOrder.map((block) => ({ ...block })),
    };
}

export function moveSurveyRegionTo(extension: SurveyDraftExtension, regionId: string, newPosition: number): SurveyDraftExtension {
    return withOrderedBlocks({
        surveyRegions: new Map(extension.surveyRegions),
        surveyRegionOrder: extension.surveyRegionOrder.map((block) => (
            block.regionId === regionId
                ? { regionId, position: normalizePosition(newPosition) }
                : { ...block }
        )),
    });
}

export function dissolveSurveyRegion(
    extension: SurveyDraftExtension,
    regionId: string,
): { extension: SurveyDraftExtension; dissolvedItems: MissionItem[] } {
    const region = extension.surveyRegions.get(regionId);
    if (!region) {
        return {
            extension: withOrderedBlocks(extension),
            dissolvedItems: [],
        };
    }

    return {
        extension: removeSurveyRegion(extension, regionId),
        dissolvedItems: dissolveRegion(region),
    };
}

export function flattenRegionsToItems(items: TypedDraftItem[], regions: SurveyDraftExtension): MissionItem[] {
    const orderedBlocks = orderSurveyBlocks(regions.surveyRegionOrder);
    const flattened: MissionItem[] = [];
    let blockIndex = 0;

    const appendRegionsAtPosition = (position: number) => {
        while (blockIndex < orderedBlocks.length && orderedBlocks[blockIndex]?.position === position) {
            const regionId = orderedBlocks[blockIndex]?.regionId;
            if (regionId) {
                const region = regions.surveyRegions.get(regionId);
                if (region) {
                    flattened.push(...dissolveRegion(region));
                }
            }
            blockIndex += 1;
        }
    };

    appendRegionsAtPosition(0);

    items.forEach((item, index) => {
        if (isMissionItemDocument(item.document)) {
            flattened.push({ ...item.document });
        }
        appendRegionsAtPosition(index + 1);
    });

    while (blockIndex < orderedBlocks.length) {
        const regionId = orderedBlocks[blockIndex]?.regionId;
        if (regionId) {
            const region = regions.surveyRegions.get(regionId);
            if (region) {
                flattened.push(...dissolveRegion(region));
            }
        }
        blockIndex += 1;
    }

    return flattened;
}
