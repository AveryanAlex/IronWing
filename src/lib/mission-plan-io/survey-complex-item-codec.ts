import type { CatalogCamera } from "../survey-camera-catalog";
import type { GeoPoint2d, MissionItem } from "../mavkit-types";
import type { SurveyRegionParams } from "../survey-region";
import {
    CUSTOM_CAMERA_NAME,
    MANUAL_CAMERA_NAME,
    QGC_CAMERA_CALC_VERSION,
    QGC_CORRIDOR_VERSION,
    QGC_STRUCTURE_VERSION,
    QGC_SURVEY_VERSION,
    QGC_TRANSECT_STYLE_VERSION,
    type QgcCameraCalc,
    type QgcComplexItem,
    type QgcCoordinatePair,
    type QgcCorridorComplexItem,
    type QgcStructureComplexItem,
    type QgcSurveyComplexItem,
    type QgcTransectStyleComplexItem,
    type QgcSimpleItem,
} from "./qgc-types";
import type { ExportableSurveyRegion, ParsedSurveyRegion } from "./types";
import { exportMissionItem, parseSimpleItem } from "./simple-item-codec";

const ENTRY_LOCATION_TO_START_CORNER: Record<number, SurveyRegionParams["startCorner"]> = {
    0: "top_left",
    1: "top_right",
    2: "bottom_left",
    3: "bottom_right",
};

const START_CORNER_TO_ENTRY_LOCATION: Record<SurveyRegionParams["startCorner"], number> = {
    top_left: 0,
    top_right: 1,
    bottom_left: 2,
    bottom_right: 3,
};

function numberOrDefault(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanOrDefault(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
}

function stringOrNull(value: unknown): string | null {
    return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function cloneJsonValue<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function parseEmbeddedMissionItems(items: QgcSimpleItem[], warnings: string[], context: string): MissionItem[] {
    return items.map((item, index) => parseSimpleItem(item, index, warnings, `${context} ${index + 1}`));
}

function parseCoordinatePairs(value: unknown, warnings: string[], context: string): GeoPoint2d[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const points: GeoPoint2d[] = [];
    for (const [index, entry] of value.entries()) {
        if (!Array.isArray(entry) || entry.length < 2) {
            warnings.push(`${context} vertex ${index + 1} was malformed and was skipped.`);
            continue;
        }

        const latitude = entry[0];
        const longitude = entry[1];
        if (typeof latitude !== "number" || !Number.isFinite(latitude) || typeof longitude !== "number" || !Number.isFinite(longitude)) {
            warnings.push(`${context} vertex ${index + 1} was malformed and was skipped.`);
            continue;
        }

        points.push({ latitude_deg: latitude, longitude_deg: longitude });
    }

    return points;
}

function findEmbeddedSimpleItems(item: QgcComplexItem): QgcSimpleItem[] {
    const queue: unknown[] = [item];
    const seen = new Set<unknown>();

    while (queue.length > 0) {
        const current = queue.shift();
        if (!current || typeof current !== "object" || seen.has(current)) {
            continue;
        }
        seen.add(current);

        const record = current as Record<string, unknown>;
        const items = record.Items;
        if (Array.isArray(items)) {
            return items.filter(isSimpleItemLike) as QgcSimpleItem[];
        }

        for (const value of Object.values(record)) {
            if (value && typeof value === "object") {
                queue.push(value);
            }
        }
    }

    return [];
}

function isSimpleItemLike(value: unknown): boolean {
    return Boolean(
        value
        && typeof value === "object"
        && (value as { type?: unknown }).type === "SimpleItem"
        && typeof (value as { command?: unknown }).command === "number",
    );
}

function warnOnUnexpectedVersion(
    version: number | undefined,
    [minVersion, maxVersion]: [number, number],
    context: string,
    label: string,
    warnings: string[],
): void {
    if (version === undefined) {
        return;
    }

    if (version < minVersion || version > maxVersion) {
        warnings.push(`${context} uses ${label} version ${version}, which is outside IronWing's expected ${minVersion}-${maxVersion} range; attempting a best-effort parse.`);
    }
}

function collectComplexItemWarnings(
    item: { version?: number },
    transectStyle: QgcTransectStyleComplexItem | undefined,
    cameraCalc: QgcCameraCalc | undefined,
    context: string,
    options: {
        versionRange: [number, number];
        itemType: string;
        unsupportedFlags: Array<[unknown, string]>;
    },
): string[] {
    const regionWarnings: string[] = [];
    warnOnUnexpectedVersion(item.version, options.versionRange, context, options.itemType, regionWarnings);

    if (transectStyle) {
        warnOnUnexpectedVersion(
            transectStyle.version,
            [QGC_TRANSECT_STYLE_VERSION, QGC_TRANSECT_STYLE_VERSION],
            `${context} TransectStyleComplexItem`,
            "TransectStyleComplexItem",
            regionWarnings,
        );
    }

    if (cameraCalc) {
        warnOnUnexpectedVersion(
            cameraCalc.version,
            [QGC_CAMERA_CALC_VERSION, QGC_CAMERA_CALC_VERSION],
            `${context} CameraCalc`,
            "CameraCalc",
            regionWarnings,
        );
    }

    for (const [flag, warning] of options.unsupportedFlags) {
        if (flag) {
            regionWarnings.push(`${context}: ${warning}`);
        }
    }

    return regionWarnings;
}

function extractSurveySpecificParams(
    item: QgcSurveyComplexItem,
    warnings: string[],
    context: string,
): Partial<SurveyRegionParams> {
    const params: Partial<SurveyRegionParams> = {};

    if (typeof item.angle === "number" && Number.isFinite(item.angle)) {
        params.trackAngle_deg = item.angle;
    }

    if (typeof item.entryLocation === "number") {
        const startCorner = ENTRY_LOCATION_TO_START_CORNER[item.entryLocation];
        if (startCorner) {
            params.startCorner = startCorner;
        } else {
            warnings.push(`${context} uses unsupported survey entryLocation ${item.entryLocation}; preserving the raw QGC field in passthrough metadata.`);
        }
    }

    return params;
}

function extractTransectStyleParams(transectStyle: QgcTransectStyleComplexItem | undefined): Partial<SurveyRegionParams> {
    if (!transectStyle) {
        return {};
    }

    return {
        crosshatch: booleanOrDefault(transectStyle.Refly90Degrees, false),
        turnaroundDistance_m: numberOrDefault(transectStyle.TurnAroundDistance, 0),
        terrainFollow: booleanOrDefault(transectStyle.FollowTerrain, false),
        captureMode: booleanOrDefault(transectStyle.HoverAndCapture, false) ? "hover" : "distance",
    };
}

function extractCameraDrivenParams(cameraCalc: QgcCameraCalc | undefined): Partial<SurveyRegionParams> {
    if (!cameraCalc) {
        return {};
    }

    return {
        ...(typeof cameraCalc.DistanceToSurface === "number" && Number.isFinite(cameraCalc.DistanceToSurface)
            ? { altitude_m: cameraCalc.DistanceToSurface }
            : {}),
        ...(typeof cameraCalc.SideOverlap === "number" && Number.isFinite(cameraCalc.SideOverlap)
            ? { sideOverlap_pct: cameraCalc.SideOverlap }
            : {}),
        ...(typeof cameraCalc.FrontalOverlap === "number" && Number.isFinite(cameraCalc.FrontalOverlap)
            ? { frontOverlap_pct: cameraCalc.FrontalOverlap }
            : {}),
        ...(typeof cameraCalc.Landscape === "boolean"
            ? { orientation: cameraCalc.Landscape ? "landscape" : "portrait" }
            : {}),
    };
}

function parseCameraCalc(
    cameraCalc: QgcCameraCalc | undefined,
    warnings: string[],
    context: string,
): Partial<CatalogCamera> | null {
    if (!cameraCalc) {
        return null;
    }

    const cameraName = stringOrNull(cameraCalc.CameraName);
    if (cameraName === MANUAL_CAMERA_NAME || cameraName === CUSTOM_CAMERA_NAME) {
        warnings.push(`${context} uses ${cameraName}; IronWing imports it as a manual camera and preserves the raw CameraCalc metadata for export.`);
        return null;
    }

    const camera: Partial<CatalogCamera> = {};
    if (cameraName) {
        camera.canonicalName = cameraName;
        camera.brand = cameraName;
        camera.model = cameraName;
    }
    if (typeof cameraCalc.SensorWidth === "number" && Number.isFinite(cameraCalc.SensorWidth)) {
        camera.sensorWidth_mm = cameraCalc.SensorWidth;
    }
    if (typeof cameraCalc.SensorHeight === "number" && Number.isFinite(cameraCalc.SensorHeight)) {
        camera.sensorHeight_mm = cameraCalc.SensorHeight;
    }
    if (typeof cameraCalc.ImageWidth === "number" && Number.isFinite(cameraCalc.ImageWidth)) {
        camera.imageWidth_px = cameraCalc.ImageWidth;
    }
    if (typeof cameraCalc.ImageHeight === "number" && Number.isFinite(cameraCalc.ImageHeight)) {
        camera.imageHeight_px = cameraCalc.ImageHeight;
    }
    if (typeof cameraCalc.FocalLength === "number" && Number.isFinite(cameraCalc.FocalLength)) {
        camera.focalLength_mm = cameraCalc.FocalLength;
    }
    if (typeof cameraCalc.Landscape === "boolean") {
        camera.landscape = cameraCalc.Landscape;
    }
    if (typeof cameraCalc.FixedOrientation === "boolean") {
        camera.fixedOrientation = cameraCalc.FixedOrientation;
    }
    if (typeof cameraCalc.MinTriggerInterval === "number" && Number.isFinite(cameraCalc.MinTriggerInterval)) {
        camera.minTriggerInterval_s = cameraCalc.MinTriggerInterval;
    }

    return Object.keys(camera).length > 0 ? camera : null;
}

function clonePassthrough(value: Record<string, unknown> | undefined): Record<string, unknown> {
    return value ? cloneJsonValue(value) : {};
}

function warnOnPreservedUnsupportedFields(
    base: Record<string, unknown>,
    warnings: string[],
    patternType: "survey" | "CorridorScan",
): void {
    if (base.flyAlternateTransects) {
        warnings.push(`${patternType} flyAlternateTransects is preserved from passthrough metadata, but IronWing does not model or edit it.`);
    }

    const transectStyle = asRecord(base.TransectStyleComplexItem);
    if (transectStyle?.CameraTriggerInTurnAround) {
        warnings.push(`${patternType} CameraTriggerInTurnAround is preserved from passthrough metadata, but IronWing does not model or edit it.`);
    }
}

function exportCoordinatePairs(points: GeoPoint2d[]): QgcCoordinatePair[] {
    return points.map((point) => [point.latitude_deg, point.longitude_deg]);
}

function pickFiniteNumber(primary: unknown, fallback: unknown, defaultValue: number): number {
    if (typeof primary === "number" && Number.isFinite(primary)) {
        return primary;
    }
    if (typeof fallback === "number" && Number.isFinite(fallback)) {
        return fallback;
    }
    return defaultValue;
}

function resolveEntryLocation(startCorner: unknown, fallback: unknown): number {
    if (typeof startCorner === "string" && startCorner in START_CORNER_TO_ENTRY_LOCATION) {
        return START_CORNER_TO_ENTRY_LOCATION[startCorner as SurveyRegionParams["startCorner"]];
    }

    return typeof fallback === "number" && Number.isFinite(fallback) ? fallback : 0;
}

function resolveCaptureMode(value: unknown, fallback: unknown): boolean {
    if (value === "hover") {
        return true;
    }
    if (value === "distance") {
        return false;
    }
    return booleanOrDefault(fallback, false);
}

function resolveDistanceToSurface(region: ExportableSurveyRegion, fallback: unknown): number {
    if (region.patternType === "structure") {
        return pickFiniteNumber(region.params.scanDistance_m, fallback, 0);
    }

    return pickFiniteNumber(region.params.altitude_m, fallback, 0);
}

function resolveLandscape(region: ExportableSurveyRegion, fallback: unknown): boolean {
    if (region.params.orientation === "landscape") {
        return true;
    }
    if (region.params.orientation === "portrait") {
        return false;
    }
    if (typeof region.camera?.landscape === "boolean") {
        return region.camera.landscape;
    }
    return booleanOrDefault(fallback, true);
}

function resolveCorridorWidth(region: ExportableSurveyRegion, warnings: string[]): number {
    const leftWidth = typeof region.params.leftWidth_m === "number" && Number.isFinite(region.params.leftWidth_m)
        ? region.params.leftWidth_m
        : 0;
    const rightWidth = typeof region.params.rightWidth_m === "number" && Number.isFinite(region.params.rightWidth_m)
        ? region.params.rightWidth_m
        : 0;

    if (leftWidth > 0 && rightWidth > 0 && Math.abs(leftWidth - rightWidth) > 1e-6) {
        warnings.push("Corridor scan export only supports a symmetric QGC CorridorWidth; IronWing exported the larger of leftWidth_m/rightWidth_m and preserved the original asymmetric widths in passthrough metadata.");
    }

    return Math.max(leftWidth, rightWidth, 0);
}

function buildCameraCalc(
    region: ExportableSurveyRegion,
    baseValue: Record<string, unknown> | null,
    _warnings: string[],
): QgcCameraCalc {
    const base = baseValue ? cloneJsonValue(baseValue) : {};
    const distanceToSurface = resolveDistanceToSurface(region, base.DistanceToSurface);
    const landscape = resolveLandscape(region, base.Landscape);
    const frontalOverlap = pickFiniteNumber(region.params.frontOverlap_pct, base.FrontalOverlap, 0);
    const sideOverlap = pickFiniteNumber(region.params.sideOverlap_pct, base.SideOverlap, 0);

    if (!region.camera) {
        const cameraName = stringOrNull(base.CameraName) ?? MANUAL_CAMERA_NAME;
        return {
            ...base,
            version: numberOrDefault(base.version, QGC_CAMERA_CALC_VERSION),
            CameraName: cameraName === CUSTOM_CAMERA_NAME ? CUSTOM_CAMERA_NAME : MANUAL_CAMERA_NAME,
            DistanceToSurface: distanceToSurface,
            DistanceToSurfaceRelative: booleanOrDefault(base.DistanceToSurfaceRelative, true),
            FrontalOverlap: frontalOverlap,
            Landscape: landscape,
            SideOverlap: sideOverlap,
        };
    }

    return {
        ...base,
        version: numberOrDefault(base.version, QGC_CAMERA_CALC_VERSION),
        CameraName: region.camera.canonicalName,
        DistanceToSurface: distanceToSurface,
        DistanceToSurfaceRelative: booleanOrDefault(base.DistanceToSurfaceRelative, true),
        FixedOrientation: region.camera.fixedOrientation,
        FocalLength: region.camera.focalLength_mm,
        FrontalOverlap: frontalOverlap,
        ImageHeight: region.camera.imageHeight_px,
        ImageWidth: region.camera.imageWidth_px,
        Landscape: landscape,
        MinTriggerInterval: region.camera.minTriggerInterval_s ?? numberOrDefault(base.MinTriggerInterval, 0),
        SensorHeight: region.camera.sensorHeight_mm,
        SensorWidth: region.camera.sensorWidth_mm,
        SideOverlap: sideOverlap,
        ValueSetIsDistance: booleanOrDefault(base.ValueSetIsDistance, true),
    };
}

function buildTransectStyleComplexItem(
    region: ExportableSurveyRegion,
    baseValue: unknown,
    warnings: string[],
): QgcTransectStyleComplexItem {
    const base: Record<string, unknown> = asRecord(baseValue)
        ? cloneJsonValue(baseValue as Record<string, unknown>)
        : {};
    return {
        ...base,
        version: numberOrDefault(base.version, QGC_TRANSECT_STYLE_VERSION),
        CameraCalc: buildCameraCalc(region, asRecord(base.CameraCalc), warnings),
        CameraTriggerInTurnAround: booleanOrDefault(base.CameraTriggerInTurnAround, false),
        FollowTerrain: booleanOrDefault(region.params.terrainFollow, booleanOrDefault(base.FollowTerrain, false)),
        HoverAndCapture: resolveCaptureMode(region.params.captureMode, base.HoverAndCapture),
        Items: region.embeddedItems.map((item, index) => exportMissionItem(item, index, warnings)),
        Refly90Degrees: booleanOrDefault(region.params.crosshatch, booleanOrDefault(base.Refly90Degrees, false)),
        TurnAroundDistance: pickFiniteNumber(region.params.turnaroundDistance_m, base.TurnAroundDistance, 0),
    };
}

function parseQgcSurveyComplexItem(
    item: QgcSurveyComplexItem,
    position: number,
    index: number,
    warnings: string[],
): ParsedSurveyRegion | null {
    const context = `Mission ComplexItem ${index + 1} (survey)`;
    const polygon = parseCoordinatePairs(item.polygon, warnings, `${context} polygon`);
    const transectStyle = item.TransectStyleComplexItem;
    const cameraCalc = transectStyle?.CameraCalc;
    const params = {
        ...extractCameraDrivenParams(cameraCalc),
        ...extractTransectStyleParams(transectStyle),
        ...extractSurveySpecificParams(item, warnings, context),
    } satisfies Partial<SurveyRegionParams>;
    const embeddedItems = parseEmbeddedMissionItems(findEmbeddedSimpleItems(item), warnings, `${context} embedded item`);
    const regionWarnings = collectComplexItemWarnings(item, transectStyle, cameraCalc, context, {
        versionRange: [3, 5],
        itemType: "survey",
        unsupportedFlags: [
            [item.flyAlternateTransects, "flyAlternateTransects is not modeled by IronWing; preserving the QGC field in passthrough metadata."],
            [transectStyle?.CameraTriggerInTurnAround, "CameraTriggerInTurnAround is not modeled by IronWing; preserving the QGC field in passthrough metadata."],
        ],
    });
    const camera = parseCameraCalc(cameraCalc, regionWarnings, context);

    if (polygon.length < 3) {
        warnings.push(`${context} could not be parsed as a survey region because it did not contain at least three polygon points; falling back to flattened SimpleItems.`);
        return null;
    }

    return {
        patternType: "grid",
        position,
        polygon,
        polyline: [],
        camera,
        params,
        embeddedItems,
        qgcPassthrough: cloneJsonValue(item as Record<string, unknown>),
        warnings: regionWarnings,
    };
}

function parseQgcCorridorComplexItem(
    item: QgcCorridorComplexItem,
    position: number,
    index: number,
    warnings: string[],
): ParsedSurveyRegion | null {
    const context = `Mission ComplexItem ${index + 1} (CorridorScan)`;
    const polyline = parseCoordinatePairs(item.polyline, warnings, `${context} polyline`);
    const transectStyle = item.TransectStyleComplexItem;
    const cameraCalc = transectStyle?.CameraCalc;
    const corridorWidth = numberOrDefault(item.CorridorWidth, 0);
    const params = {
        ...extractCameraDrivenParams(cameraCalc),
        ...extractTransectStyleParams(transectStyle),
        ...(corridorWidth > 0 ? { leftWidth_m: corridorWidth, rightWidth_m: corridorWidth } : {}),
    } satisfies Partial<SurveyRegionParams>;
    const embeddedItems = parseEmbeddedMissionItems(findEmbeddedSimpleItems(item), warnings, `${context} embedded item`);
    const regionWarnings = collectComplexItemWarnings(item, transectStyle, cameraCalc, context, {
        versionRange: [2, 4],
        itemType: "CorridorScan",
        unsupportedFlags: [
            [transectStyle?.CameraTriggerInTurnAround, "CameraTriggerInTurnAround is not modeled by IronWing; preserving the QGC field in passthrough metadata."],
        ],
    });
    const camera = parseCameraCalc(cameraCalc, regionWarnings, context);

    if (polyline.length < 2) {
        warnings.push(`${context} could not be parsed as a corridor region because it did not contain at least two polyline points; falling back to flattened SimpleItems.`);
        return null;
    }

    return {
        patternType: "corridor",
        position,
        polygon: [],
        polyline,
        camera,
        params,
        embeddedItems,
        qgcPassthrough: cloneJsonValue(item as Record<string, unknown>),
        warnings: regionWarnings,
    };
}

function parseQgcStructureComplexItem(
    item: QgcStructureComplexItem,
    position: number,
    index: number,
    warnings: string[],
): ParsedSurveyRegion | null {
    const context = `Mission ComplexItem ${index + 1} (StructureScan)`;
    const polygon = parseCoordinatePairs(item.polygon, warnings, `${context} polygon`);
    const cameraCalc = item.CameraCalc;
    const params = {
        ...extractCameraDrivenParams(cameraCalc),
        ...(typeof item.Altitude === "number" && Number.isFinite(item.Altitude) ? { altitude_m: item.Altitude } : {}),
        ...(typeof item.StructureHeight === "number" && Number.isFinite(item.StructureHeight)
            ? { structureHeight_m: item.StructureHeight }
            : {}),
        ...(typeof item.Layers === "number" && Number.isFinite(item.Layers) ? { layerCount: item.Layers } : {}),
        ...(typeof cameraCalc?.DistanceToSurface === "number" && Number.isFinite(cameraCalc.DistanceToSurface)
            ? { scanDistance_m: cameraCalc.DistanceToSurface }
            : {}),
    } satisfies Partial<SurveyRegionParams>;
    const embeddedItems = parseEmbeddedMissionItems(findEmbeddedSimpleItems(item), warnings, `${context} embedded item`);
    const regionWarnings = collectComplexItemWarnings(item, undefined, cameraCalc, context, {
        versionRange: [1, 3],
        itemType: "StructureScan",
        unsupportedFlags: [],
    });
    const camera = parseCameraCalc(cameraCalc, regionWarnings, context);

    if (polygon.length < 3) {
        warnings.push(`${context} could not be parsed as a structure region because it did not contain at least three polygon points; falling back to flattened SimpleItems.`);
        return null;
    }

    return {
        patternType: "structure",
        position,
        polygon,
        polyline: [],
        camera,
        params,
        embeddedItems,
        qgcPassthrough: cloneJsonValue(item as Record<string, unknown>),
        warnings: regionWarnings,
    };
}

function exportQgcSurveyComplexItem(region: ExportableSurveyRegion, warnings: string[]): QgcSurveyComplexItem {
    const base = clonePassthrough(region.qgcPassthrough);
    warnOnPreservedUnsupportedFields(base, warnings, "survey");
    return {
        ...base,
        type: "ComplexItem",
        complexItemType: "survey",
        version: numberOrDefault(base.version, QGC_SURVEY_VERSION),
        angle: pickFiniteNumber(region.params.trackAngle_deg, base.angle, 0),
        entryLocation: resolveEntryLocation(region.params.startCorner, base.entryLocation),
        flyAlternateTransects: booleanOrDefault(base.flyAlternateTransects, false),
        polygon: exportCoordinatePairs(region.polygon),
        TransectStyleComplexItem: buildTransectStyleComplexItem(region, base.TransectStyleComplexItem, warnings),
    };
}

function exportQgcCorridorComplexItem(region: ExportableSurveyRegion, warnings: string[]): QgcCorridorComplexItem {
    const base = clonePassthrough(region.qgcPassthrough);
    warnOnPreservedUnsupportedFields(base, warnings, "CorridorScan");
    return {
        ...base,
        type: "ComplexItem",
        complexItemType: "CorridorScan",
        version: numberOrDefault(base.version, QGC_CORRIDOR_VERSION),
        CorridorWidth: resolveCorridorWidth(region, warnings),
        EntryPoint: typeof base.EntryPoint === "number" && Number.isFinite(base.EntryPoint) ? base.EntryPoint : 0,
        polyline: exportCoordinatePairs(region.polyline),
        TransectStyleComplexItem: buildTransectStyleComplexItem(region, base.TransectStyleComplexItem, warnings),
    };
}

function exportQgcStructureComplexItem(region: ExportableSurveyRegion, warnings: string[]): QgcStructureComplexItem {
    const base = clonePassthrough(region.qgcPassthrough);
    return {
        ...base,
        type: "ComplexItem",
        complexItemType: "StructureScan",
        version: numberOrDefault(base.version, QGC_STRUCTURE_VERSION),
        Altitude: pickFiniteNumber(region.params.altitude_m, base.Altitude, 0),
        CameraCalc: buildCameraCalc(region, asRecord(base.CameraCalc), warnings),
        Layers: pickFiniteNumber(region.params.layerCount, base.Layers, 1),
        StructureHeight: pickFiniteNumber(region.params.structureHeight_m, base.StructureHeight, 0),
        altitudeRelative: booleanOrDefault(base.altitudeRelative, true),
        polygon: exportCoordinatePairs(region.polygon),
        Items: region.embeddedItems.map((item, index) => exportMissionItem(item, index, warnings)),
    };
}

export function parseKnownComplexItem(
    complexItem: QgcComplexItem,
    position: number,
    index: number,
    warnings: string[],
): ParsedSurveyRegion | null {
    switch (complexItem.complexItemType) {
        case "survey":
            return parseQgcSurveyComplexItem(complexItem as QgcSurveyComplexItem, position, index, warnings);
        case "CorridorScan":
            return parseQgcCorridorComplexItem(complexItem as QgcCorridorComplexItem, position, index, warnings);
        case "StructureScan":
            return parseQgcStructureComplexItem(complexItem as QgcStructureComplexItem, position, index, warnings);
        default:
            return null;
    }
}

export function flattenComplexItem(
    complexItem: QgcComplexItem,
    index: number,
    flattened: QgcSimpleItem[],
    warnings: string[],
): void {
    const context = `Mission ComplexItem ${index + 1}${typeof complexItem.complexItemType === "string" ? ` (${complexItem.complexItemType})` : ""}`;
    warnings.push(`${context} loses survey/corridor metadata when imported into IronWing.`);
    const embeddedItems = findEmbeddedSimpleItems(complexItem);
    if (embeddedItems.length === 0) {
        warnings.push(`${context} has no embedded SimpleItem array and was skipped.`);
        return;
    }
    flattened.push(...embeddedItems);
}

export function exportSurveyRegion(region: ExportableSurveyRegion, warnings: string[]): QgcComplexItem {
    switch (region.patternType) {
        case "corridor":
            return exportQgcCorridorComplexItem(region, warnings);
        case "structure":
            return exportQgcStructureComplexItem(region, warnings);
        default:
            return exportQgcSurveyComplexItem(region, warnings);
    }
}
