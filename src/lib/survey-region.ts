import type { TypedDraftItem } from "./mission-draft-typed";
import type { ExportableSurveyRegion, ParsedSurveyRegion } from "./mission-plan-io";
import type { StartCorner, TurnDirection } from "./mission-grid";
import type { GeoPoint2d, MissionItem } from "./mavkit-types";
import type { CatalogCamera } from "./survey-camera-catalog";
import type { CameraOrientation } from "./survey-camera";
import type { CorridorResult, CorridorValidationError } from "./corridor-scan";
import type {
    StructureScanLayer,
    StructureScanResult,
    StructureScanStats,
    StructureScanValidationError,
} from "./structure-scan";
import type {
    GridValidationError,
    SurveyCaptureMode,
    SurveyResult,
    SurveyStats,
    SurveyTransect,
} from "./survey-grid";

export type SurveyPatternType = "grid" | "corridor" | "structure";
export type SurveyGenerationError = GridValidationError | CorridorValidationError | StructureScanValidationError;
export type SurveyGenerationResult = SurveyResult | CorridorResult | StructureScanResult;
export type SurveyGeneratedStats =
    | (SurveyStats & Partial<StructureScanStats>)
    | (StructureScanStats & Partial<SurveyStats>);

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
    leftWidth_m: number;
    rightWidth_m: number;
    structureHeight_m: number;
    scanDistance_m: number;
    layerCount: number;
    layerOrder: "bottom_to_top" | "top_to_bottom";
};

export type SurveyRegion = {
    id: string;
    patternType: SurveyPatternType;
    polygon: GeoPoint2d[];
    polyline: GeoPoint2d[];
    corridorPolygon: GeoPoint2d[];
    cameraId: string | null;
    camera: CatalogCamera | null;
    params: SurveyRegionParams;
    generatedItems: MissionItem[];
    generatedTransects: SurveyTransect[];
    generatedCrosshatch: SurveyTransect[];
    generatedLayers: StructureScanLayer[];
    generatedStats: SurveyGeneratedStats | null;
    errors: SurveyGenerationError[];
    manualEdits: Map<number, MissionItem>;
    collapsed: boolean;
    qgcPassthrough?: Record<string, unknown>;
    importWarnings?: string[];
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
    leftWidth_m: 0,
    rightWidth_m: 0,
    structureHeight_m: 20,
    scanDistance_m: 15,
    layerCount: 3,
    layerOrder: "bottom_to_top",
};

const DEFAULT_CORRIDOR_WIDTH_M = 50;

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

function cloneLayers(layers: StructureScanLayer[]): StructureScanLayer[] {
    return layers.map((layer) => ({
        ...layer,
        orbitPoints: layer.orbitPoints.map((point) => ({ ...point })),
    }));
}

function cloneStats(stats: SurveyGeneratedStats | null): SurveyGeneratedStats | null {
    return stats ? { ...stats } : null;
}

function cloneErrors(errors: SurveyGenerationError[]): SurveyGenerationError[] {
    return errors.map((error) => ({ ...error }));
}

function clonePoints(points: GeoPoint2d[]): GeoPoint2d[] {
    return points.map((point) => ({ ...point }));
}

function cloneJsonValue<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function cloneJsonRecord(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
    return value ? cloneJsonValue(value) : undefined;
}

function cloneWarnings(warnings: string[] | undefined): string[] | undefined {
    return warnings ? [...warnings] : undefined;
}

function cloneRegion(region: SurveyRegion): SurveyRegion {
    return {
        ...region,
        polygon: clonePoints(region.polygon),
        polyline: clonePoints(region.polyline),
        corridorPolygon: clonePoints(region.corridorPolygon),
        params: { ...region.params },
        generatedItems: cloneMissionItems(region.generatedItems),
        generatedTransects: cloneTransects(region.generatedTransects),
        generatedCrosshatch: cloneTransects(region.generatedCrosshatch),
        generatedLayers: cloneLayers(region.generatedLayers),
        generatedStats: cloneStats(region.generatedStats),
        errors: cloneErrors(region.errors),
        manualEdits: new Map(region.manualEdits),
        camera: region.camera ? { ...region.camera } : null,
        qgcPassthrough: cloneJsonRecord(region.qgcPassthrough),
        importWarnings: cloneWarnings(region.importWarnings),
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

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function stringOrNull(value: unknown): string | null {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function pickFirstString(...values: unknown[]): string | null {
    for (const value of values) {
        const candidate = stringOrNull(value);
        if (candidate) {
            return candidate;
        }
    }

    return null;
}

function pickFirstBoolean(...values: unknown[]): boolean | null {
    for (const value of values) {
        if (typeof value === "boolean") {
            return value;
        }
    }

    return null;
}

function pickFirstFinitePositive(...values: unknown[]): number | null {
    for (const value of values) {
        if (typeof value === "number" && Number.isFinite(value) && value > 0) {
            return value;
        }
    }

    return null;
}

function pickFirstFiniteNonNegative(...values: unknown[]): number | null {
    for (const value of values) {
        if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
            return value;
        }
    }

    return null;
}

function defaultParamsForPatternType(patternType: SurveyPatternType): SurveyRegionParams {
    return {
        ...DEFAULT_REGION_PARAMS,
        leftWidth_m: patternType === "corridor" ? DEFAULT_CORRIDOR_WIDTH_M : DEFAULT_REGION_PARAMS.leftWidth_m,
        rightWidth_m: patternType === "corridor" ? DEFAULT_CORRIDOR_WIDTH_M : DEFAULT_REGION_PARAMS.rightWidth_m,
    };
}

function extractPassthroughCameraCalc(qgcPassthrough: Record<string, unknown> | undefined): Record<string, unknown> | null {
    const passthrough = asRecord(qgcPassthrough);
    if (!passthrough) {
        return null;
    }

    const transectStyle = asRecord(passthrough.TransectStyleComplexItem);
    return asRecord(transectStyle?.CameraCalc) ?? asRecord(passthrough.CameraCalc);
}

function toHydratedCatalogCamera(
    camera: Partial<CatalogCamera> | null,
    qgcPassthrough: Record<string, unknown> | undefined,
): CatalogCamera | null {
    if (!camera) {
        return null;
    }

    const cameraCalc = extractPassthroughCameraCalc(qgcPassthrough);
    const canonicalName = pickFirstString(camera.canonicalName, cameraCalc?.CameraName);
    const brand = pickFirstString(camera.brand, canonicalName);
    const model = pickFirstString(camera.model, canonicalName);
    const sensorWidth_mm = pickFirstFinitePositive(camera.sensorWidth_mm, cameraCalc?.SensorWidth);
    const sensorHeight_mm = pickFirstFinitePositive(camera.sensorHeight_mm, cameraCalc?.SensorHeight);
    const imageWidth_px = pickFirstFinitePositive(camera.imageWidth_px, cameraCalc?.ImageWidth);
    const imageHeight_px = pickFirstFinitePositive(camera.imageHeight_px, cameraCalc?.ImageHeight);
    const focalLength_mm = pickFirstFinitePositive(camera.focalLength_mm, cameraCalc?.FocalLength);

    if (
        !canonicalName
        || !brand
        || !model
        || sensorWidth_mm === null
        || sensorHeight_mm === null
        || imageWidth_px === null
        || imageHeight_px === null
        || focalLength_mm === null
    ) {
        return null;
    }

    const hydrated: CatalogCamera = {
        canonicalName,
        brand,
        model,
        sensorWidth_mm,
        sensorHeight_mm,
        imageWidth_px,
        imageHeight_px,
        focalLength_mm,
        landscape: pickFirstBoolean(camera.landscape, cameraCalc?.Landscape) ?? true,
        fixedOrientation: pickFirstBoolean(camera.fixedOrientation, cameraCalc?.FixedOrientation) ?? false,
    };

    const minTriggerInterval_s = pickFirstFiniteNonNegative(camera.minTriggerInterval_s, cameraCalc?.MinTriggerInterval);
    if (minTriggerInterval_s !== null) {
        hydrated.minTriggerInterval_s = minTriggerInterval_s;
    }

    return hydrated;
}

function resolveExportCamera(region: SurveyRegion): CatalogCamera | null {
    if (region.camera) {
        return { ...region.camera };
    }

    if (!region.cameraId && !region.qgcPassthrough) {
        return null;
    }

    const camera = toHydratedCatalogCamera(
        region.cameraId
            ? {
                canonicalName: region.cameraId,
                brand: region.cameraId,
                model: region.cameraId,
            }
            : null,
        region.qgcPassthrough,
    );

    return camera ? { ...camera } : null;
}

export function createSurveyRegion(
    geometry: GeoPoint2d[],
    patternType: SurveyPatternType = "grid",
): SurveyRegion {
    const isCorridor = patternType === "corridor";
    return {
        id: allocateSurveyRegionId(),
        patternType,
        polygon: isCorridor ? [] : clonePoints(geometry),
        polyline: isCorridor ? clonePoints(geometry) : [],
        corridorPolygon: [],
        cameraId: null,
        camera: null,
        params: defaultParamsForPatternType(patternType),
        generatedItems: [],
        generatedTransects: [],
        generatedCrosshatch: [],
        generatedLayers: [],
        generatedStats: null,
        errors: [],
        manualEdits: new Map<number, MissionItem>(),
        collapsed: false,
    };
}

export function createCorridorRegion(polyline: GeoPoint2d[]): SurveyRegion {
    return createSurveyRegion(polyline, "corridor");
}

export function createStructureRegion(polygon: GeoPoint2d[]): SurveyRegion {
    return createSurveyRegion(polygon, "structure");
}

export function hydrateSurveyRegion(parsed: ParsedSurveyRegion): SurveyRegion {
    const region = parsed.patternType === "corridor"
        ? createCorridorRegion(parsed.polyline)
        : parsed.patternType === "structure"
            ? createStructureRegion(parsed.polygon)
            : createSurveyRegion(parsed.polygon);
    const cameraId = stringOrNull(parsed.camera?.canonicalName);
    const hydratedCamera = toHydratedCatalogCamera(parsed.camera, parsed.qgcPassthrough);

    return {
        ...region,
        polygon: clonePoints(parsed.polygon),
        polyline: clonePoints(parsed.polyline),
        cameraId: cameraId ?? hydratedCamera?.canonicalName ?? null,
        camera: hydratedCamera,
        params: {
            ...defaultParamsForPatternType(parsed.patternType),
            ...parsed.params,
        },
        generatedItems: cloneMissionItems(parsed.embeddedItems),
        qgcPassthrough: cloneJsonValue(parsed.qgcPassthrough),
        importWarnings: [...parsed.warnings],
    };
}

export function toExportableSurveyRegion(region: SurveyRegion, position: number): ExportableSurveyRegion {
    return {
        patternType: region.patternType,
        polygon: clonePoints(region.polygon),
        polyline: clonePoints(region.polyline),
        camera: resolveExportCamera(region),
        params: { ...region.params },
        embeddedItems: dissolveRegion(region),
        qgcPassthrough: cloneJsonValue(region.qgcPassthrough ?? {}),
        position: normalizePosition(position),
    };
}

export function regionItemCount(region: SurveyRegion): number {
    return region.generatedItems.length;
}

export function regionHasManualEdits(region: SurveyRegion): boolean {
    return region.manualEdits.size > 0;
}

export function applyGenerationResult(region: SurveyRegion, result: SurveyGenerationResult): SurveyRegion {
    const next = cloneRegion(region);
    next.manualEdits = new Map<number, MissionItem>();

    if (result.ok) {
        next.generatedItems = cloneMissionItems(result.items);
        next.generatedTransects = "transects" in result ? cloneTransects(result.transects) : [];
        next.generatedCrosshatch = "crosshatchTransects" in result ? cloneTransects(result.crosshatchTransects) : [];
        next.generatedLayers = "layers" in result ? cloneLayers(result.layers) : [];
        next.generatedStats = cloneStats(result.stats);
        next.corridorPolygon = "corridorPolygon" in result ? clonePoints(result.corridorPolygon) : [];
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
