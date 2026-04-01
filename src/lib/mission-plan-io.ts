import {
    commandPosition,
    defaultCommand,
    defaultGeoPoint3d,
    geoPoint3dAltitude,
    type FencePlan,
    type FenceRegion,
    type GeoPoint2d,
    type GeoPoint3d,
    type HomePosition,
    type MissionCommand,
    type MissionFrame,
    type MissionItem,
    type MissionPlan,
    type RallyPlan,
    withCommandField,
} from "./mavkit-types";
import {
    COMMAND_CATALOG,
    commandIdToVariant,
    variantToCommandId,
    type CatalogEntry,
} from "./mission-command-metadata";
import type { CatalogCamera } from "./survey-camera-catalog";
import type { SurveyPatternType, SurveyRegionParams } from "./survey-region";

type QgcPlanMission = {
    version?: number;
    firmwareType?: number;
    vehicleType?: number;
    cruiseSpeed?: number;
    hoverSpeed?: number;
    plannedHomePosition?: [number, number, number] | number[];
    items?: unknown[];
};

type QgcFenceVertex = {
    lat?: number;
    lon?: number;
    latitude?: number;
    longitude?: number;
};

type QgcFencePolygon = {
    inclusion?: boolean;
    polygon?: QgcFenceVertex[];
};

type QgcFenceCircle = {
    inclusion?: boolean;
    circle?: {
        center?: QgcFenceVertex;
        radius?: number;
    };
};

type QgcGeoFence = {
    version?: number;
    polygons?: QgcFencePolygon[];
    circles?: QgcFenceCircle[];
};

type QgcRallyPoints = {
    version?: number;
    points?: Array<[number, number, number] | number[]>;
};

type QgcRallyExport = {
    version: number;
    points: Array<[number, number, number]>;
};

type QgcPlan = {
    fileType?: string;
    version?: number;
    groundStation?: string;
    mission?: QgcPlanMission;
    geoFence?: QgcGeoFence;
    rallyPoints?: QgcRallyPoints;
};

type QgcSimpleItem = {
    type: "SimpleItem";
    autoContinue?: boolean;
    command: number;
    doJumpId?: number;
    frame?: number;
    params?: number[];
};

type QgcComplexItem = {
    type: "ComplexItem";
    complexItemType?: string;
    [key: string]: unknown;
};

type QgcCoordinatePair = [number, number] | number[];

type QgcCameraCalc = {
    version?: number;
    CameraName?: string;
    DistanceToSurface?: number;
    DistanceToSurfaceRelative?: boolean;
    FixedOrientation?: boolean;
    FocalLength?: number;
    FrontalOverlap?: number;
    ImageHeight?: number;
    ImageWidth?: number;
    Landscape?: boolean;
    MinTriggerInterval?: number;
    SensorHeight?: number;
    SensorWidth?: number;
    SideOverlap?: number;
    ValueSetIsDistance?: boolean;
    [key: string]: unknown;
};

type QgcTransectStyleComplexItem = {
    version?: number;
    CameraCalc?: QgcCameraCalc;
    CameraTriggerInTurnAround?: boolean;
    FollowTerrain?: boolean;
    HoverAndCapture?: boolean;
    Items?: unknown[];
    Refly90Degrees?: boolean;
    TurnAroundDistance?: number;
    VisualTransectPoints?: QgcCoordinatePair[];
    [key: string]: unknown;
};

type QgcSurveyComplexItem = QgcComplexItem & {
    complexItemType: "survey";
    version?: number;
    angle?: number;
    entryLocation?: number;
    flyAlternateTransects?: boolean;
    polygon?: QgcCoordinatePair[];
    TransectStyleComplexItem?: QgcTransectStyleComplexItem;
};

type QgcCorridorComplexItem = QgcComplexItem & {
    complexItemType: "CorridorScan";
    version?: number;
    CorridorWidth?: number;
    EntryPoint?: number;
    polyline?: QgcCoordinatePair[];
    TransectStyleComplexItem?: QgcTransectStyleComplexItem;
};

type QgcStructureComplexItem = QgcComplexItem & {
    complexItemType: "StructureScan";
    version?: number;
    Altitude?: number;
    CameraCalc?: QgcCameraCalc;
    Layers?: number;
    StructureHeight?: number;
    altitudeRelative?: boolean;
    polygon?: QgcCoordinatePair[];
    Items?: unknown[];
};

type QgcSlot = "param1" | "param2" | "param3" | "param4" | "x" | "y" | "z";

type QgcParams = [number, number, number, number, number, number, number];

type FieldSpec = {
    field: string;
    slot: QgcSlot;
    decode?: (value: number, params: QgcParams) => unknown;
    encode?: (value: unknown, data: Record<string, unknown>, params: QgcParams) => number;
};

type GenericCommandCodec = {
    kind: "generic";
    hasPosition: boolean;
    fields: FieldSpec[];
};

type CustomCommandCodec = {
    kind: "custom";
    hasPosition: boolean;
    parse: (params: QgcParams, position: GeoPoint3d | null) => MissionCommand;
    export: (command: MissionCommand, params: QgcParams) => void;
};

type CommandCodec = GenericCommandCodec | CustomCommandCodec;

export type ExportDomain = "mission" | "fence" | "rally";

export type ParsedSurveyRegion = {
    patternType: SurveyPatternType;
    position: number;
    polygon: GeoPoint2d[];
    polyline: GeoPoint2d[];
    camera: Partial<CatalogCamera> | null;
    params: Partial<SurveyRegionParams>;
    embeddedItems: MissionItem[];
    qgcPassthrough: Record<string, unknown>;
    warnings: string[];
};

export type ExportableSurveyRegion = {
    patternType: SurveyPatternType;
    polygon: GeoPoint2d[];
    polyline: GeoPoint2d[];
    camera: CatalogCamera | null;
    params: Partial<SurveyRegionParams>;
    embeddedItems: MissionItem[];
    qgcPassthrough: Record<string, unknown>;
    position: number;
};

type ExportPlanInput = {
    mission: MissionPlan;
    surveyRegions?: ExportableSurveyRegion[];
    home: HomePosition | null;
    fence: FencePlan;
    rally: RallyPlan;
    cruiseSpeed?: number;
    hoverSpeed?: number;
    /** Domains listed here are omitted from the exported JSON. "mission" exclusion removes waypoints but the mission envelope is still written. */
    excludeDomains?: ExportDomain[];
};

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

const QGC_FILE_TYPE = "Plan";
const QGC_GROUND_STATION = "QGroundControl";
const QGC_PLAN_VERSION = 1;
const QGC_MISSION_VERSION = 2;
const QGC_GEOFENCE_VERSION = 2;
const QGC_RALLY_VERSION = 2;
const QGC_SURVEY_VERSION = 5;
const QGC_CORRIDOR_VERSION = 3;
const QGC_STRUCTURE_VERSION = 2;
const QGC_TRANSECT_STYLE_VERSION = 1;
const QGC_CAMERA_CALC_VERSION = 1;
const DEFAULT_FIRMWARE_TYPE = 12;
const DEFAULT_VEHICLE_TYPE = 2;
const DEFAULT_CRUISE_SPEED_MPS = 15;
const DEFAULT_HOVER_SPEED_MPS = 5;
const MANUAL_CAMERA_NAME = "Manual (no camera specs)";
const CUSTOM_CAMERA_NAME = "Custom Camera";

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

const MAV_FRAME_GLOBAL = 0;
const MAV_FRAME_MISSION = 2;
const MAV_FRAME_GLOBAL_RELATIVE_ALT = 3;
const MAV_FRAME_GLOBAL_TERRAIN_ALT = 10;

const ALT_CHANGE_ACTIONS = ["Neutral", "Climb", "Descend"] as const;
const SPEED_TYPES = ["Airspeed", "Groundspeed"] as const;
const FENCE_ACTIONS = ["Disable", "Enable", "DisableFloor"] as const;
const PARACHUTE_ACTIONS = ["Disable", "Enable", "Release"] as const;
const GRIPPER_ACTIONS = ["Release", "Grab"] as const;
const WINCH_ACTIONS = ["Relax", "LengthControl", "RateControl"] as const;

const SLOT_INDEX: Record<QgcSlot, number> = {
    param1: 0,
    param2: 1,
    param3: 2,
    param4: 3,
    x: 4,
    y: 5,
    z: 6,
};

function numberField(field: string, slot: QgcSlot): FieldSpec {
    return { field, slot };
}

function boolField(field: string, slot: QgcSlot): FieldSpec {
    return {
        field,
        slot,
        decode: (value) => Math.abs(value) > 0.5,
        encode: (value) => (value ? 1 : 0),
    };
}

function enumIndexField<TValue extends string>(field: string, slot: QgcSlot, values: readonly TValue[]): FieldSpec {
    return {
        field,
        slot,
        decode: (value) => enumFromIndex(value, values),
        encode: (value) => enumToIndex(value, values),
    };
}

function genericCodec(hasPosition: boolean, fields: FieldSpec[]): GenericCommandCodec {
    return { kind: "generic", hasPosition, fields };
}

function unitCodec(hasPosition = false): GenericCommandCodec {
    return { kind: "generic", hasPosition, fields: [] };
}

function customCodec(
    hasPosition: boolean,
    parse: CustomCommandCodec["parse"],
    exportCommand: CustomCommandCodec["export"],
): CustomCommandCodec {
    return { kind: "custom", hasPosition, parse, export: exportCommand };
}

function enumFromIndex<TValue extends string>(value: number, values: readonly TValue[]): TValue {
    const index = Math.round(value);
    return values[index] ?? values[0];
}

function enumToIndex<TValue extends string>(value: unknown, values: readonly TValue[]): number {
    const index = values.indexOf(value as TValue);
    return index >= 0 ? index : 0;
}

function directionFromSignedMagnitude(value: number): "Clockwise" | "CounterClockwise" {
    return value < 0 ? "CounterClockwise" : "Clockwise";
}

function encodeSignedMagnitude(magnitude: number, direction: unknown): number {
    const absMagnitude = Math.abs(magnitude);
    return direction === "CounterClockwise" ? -absMagnitude : absMagnitude;
}

function setParam(params: QgcParams, slot: QgcSlot, value: number): void {
    params[SLOT_INDEX[slot]] = Number.isFinite(value) ? value : 0;
}

function getParam(params: QgcParams, slot: QgcSlot): number {
    return params[SLOT_INDEX[slot]];
}

function normalizeParams(params: number[] | undefined): QgcParams {
    return [
        numberOrZero(params?.[0]),
        numberOrZero(params?.[1]),
        numberOrZero(params?.[2]),
        numberOrZero(params?.[3]),
        numberOrZero(params?.[4]),
        numberOrZero(params?.[5]),
        numberOrZero(params?.[6]),
    ];
}

function numberOrZero(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function numberOrDefault(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanOrDefault(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
}

function stringOrNull(value: unknown): string | null {
    return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function normalizePosition(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return 0;
    }

    return Math.max(0, Math.trunc(value));
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function cloneJsonValue<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

export function missionFrameFromNumeric(frame: number): MissionFrame {
    switch (frame) {
        case MAV_FRAME_GLOBAL:
            return "Global";
        case MAV_FRAME_GLOBAL_RELATIVE_ALT:
            return "GlobalRelativeAlt";
        case MAV_FRAME_GLOBAL_TERRAIN_ALT:
            return "GlobalTerrainAlt";
        case MAV_FRAME_MISSION:
            return "Mission";
        default:
            return { Other: frame };
    }
}

export function missionFrameToNumeric(frame: MissionFrame): number {
    if (frame === "Global") return MAV_FRAME_GLOBAL;
    if (frame === "GlobalRelativeAlt") return MAV_FRAME_GLOBAL_RELATIVE_ALT;
    if (frame === "GlobalTerrainAlt") return MAV_FRAME_GLOBAL_TERRAIN_ALT;
    if (frame === "Mission") return MAV_FRAME_MISSION;
    return frame.Other;
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
    const plannedHomePosition: [number, number, number] = home
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

type ParsedMissionItems = {
    items: MissionItem[];
    surveyRegions: ParsedSurveyRegion[];
};

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

function parseKnownComplexItem(
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

function parseEmbeddedMissionItems(items: QgcSimpleItem[], warnings: string[], context: string): MissionItem[] {
    return items.map((item, index) => parseSimpleItem(item, index, warnings, `${context} ${index + 1}`));
}

function flattenComplexItem(
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

function parseSimpleItem(item: QgcSimpleItem, index: number, warnings: string[], label = `Mission item ${index + 1}`): MissionItem {
    const params = normalizeParams(item.params);
    const entry = commandIdToVariant(item.command);
    const context = `${label} (MAV_CMD ${item.command})`;

    if (!entry) {
        warnings.push(`${context} is not in COMMAND_CATALOG; imported as Other.`);
        warnings.push(`${context} stores Other.x and Other.y as float degrees from QGC params[4] and params[5], not degE7 wire integers.`);
        return {
            command: {
                Other: {
                    command: item.command,
                    frame: missionFrameFromNumeric(numberOrZero(item.frame)),
                    param1: params[0],
                    param2: params[1],
                    param3: params[2],
                    param4: params[3],
                    x: params[4],
                    y: params[5],
                    z: params[6],
                },
            },
            current: index === 0,
            autocontinue: item.autoContinue ?? true,
        };
    }

    const codec = COMMAND_CODEC_BY_KEY[commandKey(entry.category, entry.variant)];
    const position = codec.hasPosition
        ? parsePositionFromParams(numberOrZero(item.frame), params, warnings, context)
        : null;

    return {
        command: parseKnownMissionCommand(entry, codec, params, position),
        current: index === 0,
        autocontinue: item.autoContinue ?? true,
    };
}

function parseKnownMissionCommand(
    entry: CatalogEntry,
    codec: CommandCodec,
    params: QgcParams,
    position: GeoPoint3d | null,
): MissionCommand {
    if (codec.kind === "custom") {
        return codec.parse(params, position);
    }

    let command = defaultCommand(entry.category, entry.variant, position ?? undefined);
    for (const field of codec.fields) {
        const rawValue = getParam(params, field.slot);
        const value = field.decode ? field.decode(rawValue, params) : rawValue;
        command = withCommandField(command, field.field, value);
    }
    return command;
}

function parsePositionFromParams(
    frame: number,
    params: QgcParams,
    warnings: string[],
    context: string,
): GeoPoint3d {
    const latitude = params[4];
    const longitude = params[5];
    const altitude = params[6];

    switch (frame) {
        case MAV_FRAME_GLOBAL:
            return { Msl: { latitude_deg: latitude, longitude_deg: longitude, altitude_msl_m: altitude } };
        case MAV_FRAME_GLOBAL_RELATIVE_ALT:
            return { RelHome: { latitude_deg: latitude, longitude_deg: longitude, relative_alt_m: altitude } };
        case MAV_FRAME_GLOBAL_TERRAIN_ALT:
            return { Terrain: { latitude_deg: latitude, longitude_deg: longitude, altitude_terrain_m: altitude } };
        case MAV_FRAME_MISSION:
            warnings.push(`${context} used MAV_FRAME_MISSION despite carrying a position; falling back to RelHome coordinates for import.`);
            return defaultGeoPoint3d(latitude, longitude, altitude);
        default:
            warnings.push(`${context} used unsupported MAV_FRAME ${frame}; falling back to RelHome coordinates for import.`);
            return defaultGeoPoint3d(latitude, longitude, altitude);
    }
}

function exportMissionItem(item: MissionItem, index: number, warnings: string[]): QgcSimpleItem {
    const context = `Mission item ${index + 1}`;

    if ("Other" in item.command) {
        const params = normalizeParams([]);
        const raw = item.command.Other;
        params[0] = raw.param1;
        params[1] = raw.param2;
        params[2] = raw.param3;
        params[3] = raw.param4;
        params[4] = raw.x;
        params[5] = raw.y;
        params[6] = raw.z;
        warnings.push(`${context} exports Other.x and Other.y as float degrees because QGC .plan params[4] and params[5] are degree floats, not degE7 wire integers.`);
        return {
            type: "SimpleItem",
            autoContinue: item.autocontinue,
            command: raw.command,
            doJumpId: index + 1,
            frame: missionFrameToNumeric(raw.frame),
            params,
        };
    }

    const entry = resolveMissionCommandEntry(item.command);
    if (!entry) {
        const params = normalizeParams([]);
        warnings.push(`${context} could not be mapped back to COMMAND_CATALOG and was exported as MAV_CMD 0.`);
        return {
            type: "SimpleItem",
            autoContinue: item.autocontinue,
            command: 0,
            doJumpId: index + 1,
            frame: MAV_FRAME_MISSION,
            params,
        };
    }

    const codec = COMMAND_CODEC_BY_KEY[commandKey(entry.category, entry.variant)];
    const params = normalizeParams([]);
    let frame = MAV_FRAME_MISSION;

    if (codec.hasPosition) {
        const position = commandPosition(item.command);
        if (position) {
            const altitude = geoPoint3dAltitude(position);
            if ("Msl" in position) {
                frame = MAV_FRAME_GLOBAL;
                params[4] = position.Msl.latitude_deg;
                params[5] = position.Msl.longitude_deg;
                params[6] = altitude.value;
            } else if ("RelHome" in position) {
                frame = MAV_FRAME_GLOBAL_RELATIVE_ALT;
                params[4] = position.RelHome.latitude_deg;
                params[5] = position.RelHome.longitude_deg;
                params[6] = altitude.value;
            } else {
                frame = MAV_FRAME_GLOBAL_TERRAIN_ALT;
                params[4] = position.Terrain.latitude_deg;
                params[5] = position.Terrain.longitude_deg;
                params[6] = altitude.value;
            }
        } else {
            warnings.push(`${context} is missing a position for ${entry.category}:${entry.variant}; exporting zero RelHome coordinates.`);
            frame = MAV_FRAME_GLOBAL_RELATIVE_ALT;
        }
    }

    if (codec.kind === "custom") {
        codec.export(item.command, params);
    } else {
        const data = commandVariantPayload(item.command, entry.category, entry.variant);
        for (const field of codec.fields) {
            const encoded = field.encode
                ? field.encode(data?.[field.field], data ?? {}, params)
                : numberOrZero(data?.[field.field]);
            setParam(params, field.slot, encoded);
        }
    }

    return {
        type: "SimpleItem",
        autoContinue: item.autocontinue,
        command: variantToCommandId(entry.category, entry.variant) ?? 0,
        doJumpId: index + 1,
        frame,
        params,
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

function exportSurveyRegion(region: ExportableSurveyRegion, warnings: string[]): QgcComplexItem {
    switch (region.patternType) {
        case "corridor":
            return exportQgcCorridorComplexItem(region, warnings);
        case "structure":
            return exportQgcStructureComplexItem(region, warnings);
        default:
            return exportQgcSurveyComplexItem(region, warnings);
    }
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

function resolveEntryLocation(startCorner: unknown, fallback: unknown): number {
    if (typeof startCorner === "string" && startCorner in START_CORNER_TO_ENTRY_LOCATION) {
        return START_CORNER_TO_ENTRY_LOCATION[startCorner as SurveyRegionParams["startCorner"]];
    }

    return typeof fallback === "number" && Number.isFinite(fallback) ? fallback : 0;
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

function resolveCaptureMode(value: unknown, fallback: unknown): boolean {
    if (value === "hover") {
        return true;
    }
    if (value === "distance") {
        return false;
    }
    return booleanOrDefault(fallback, false);
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

function clonePassthrough(value: Record<string, unknown> | undefined): Record<string, unknown> {
    return value ? cloneJsonValue(value) : {};
}

function exportCoordinatePairs(points: GeoPoint2d[]): QgcCoordinatePair[] {
    return points.map((point) => [point.latitude_deg, point.longitude_deg]);
}

function resolveMissionCommandEntry(command: MissionCommand): CatalogEntry | null {
    if ("Nav" in command) {
        if (typeof command.Nav === "string") {
            const id = variantToCommandId("Nav", command.Nav);
            return id === undefined ? null : { category: "Nav", variant: command.Nav, id, label: command.Nav };
        }
        const variant = Object.keys(command.Nav)[0];
        const id = variantToCommandId("Nav", variant);
        return id === undefined ? null : { category: "Nav", variant, id, label: variant };
    }

    if ("Do" in command) {
        if (typeof command.Do === "string") {
            const id = variantToCommandId("Do", command.Do);
            return id === undefined ? null : { category: "Do", variant: command.Do, id, label: command.Do };
        }
        const variant = Object.keys(command.Do)[0];
        const id = variantToCommandId("Do", variant);
        return id === undefined ? null : { category: "Do", variant, id, label: variant };
    }

    if ("Condition" in command) {
        const variant = Object.keys(command.Condition)[0];
        const id = variantToCommandId("Condition", variant);
        return id === undefined ? null : { category: "Condition", variant, id, label: variant };
    }

    return null;
}

function commandVariantPayload(
    command: MissionCommand,
    category: CatalogEntry["category"],
    variant: string,
): Record<string, unknown> | null {
    if (category === "Nav" && "Nav" in command) {
        if (typeof command.Nav === "string") {
            return command.Nav === variant ? {} : null;
        }
        return (command.Nav as Record<string, Record<string, unknown>>)[variant] ?? null;
    }

    if (category === "Do" && "Do" in command) {
        if (typeof command.Do === "string") {
            return command.Do === variant ? {} : null;
        }
        return (command.Do as Record<string, Record<string, unknown>>)[variant] ?? null;
    }

    if (category === "Condition" && "Condition" in command) {
        return (command.Condition as Record<string, Record<string, unknown>>)[variant] ?? null;
    }

    return null;
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

function parseFencePlan(geoFence: QgcGeoFence | undefined, warnings: string[]): FencePlan {
    const regions: FenceRegion[] = [];

    for (const polygon of geoFence?.polygons ?? []) {
        const vertices = (polygon.polygon ?? [])
            .map(parseFenceVertex)
            .filter((vertex): vertex is GeoPoint2d => vertex !== null);
        if (vertices.length === 0) {
            warnings.push("A QGC fence polygon had no valid vertices and was skipped.");
            continue;
        }

        if (polygon.inclusion === false) {
            regions.push({ exclusion_polygon: { vertices } });
        } else {
            regions.push({ inclusion_polygon: { vertices, inclusion_group: 0 } });
        }
    }

    for (const circle of geoFence?.circles ?? []) {
        const center = parseFenceVertex(circle.circle?.center);
        const radius = numberOrZero(circle.circle?.radius);
        if (!center || radius <= 0) {
            warnings.push("A QGC fence circle was missing a valid center or positive radius and was skipped.");
            continue;
        }

        if (circle.inclusion === false) {
            regions.push({ exclusion_circle: { center, radius_m: radius } });
        } else {
            regions.push({ inclusion_circle: { center, radius_m: radius, inclusion_group: 0 } });
        }
    }

    return {
        return_point: null,
        regions,
    };
}

function exportFencePlan(fence: FencePlan): QgcGeoFence {
    const polygons: QgcFencePolygon[] = [];
    const circles: QgcFenceCircle[] = [];

    for (const region of fence.regions) {
        if ("inclusion_polygon" in region) {
            polygons.push({
                inclusion: true,
                polygon: region.inclusion_polygon.vertices.map((vertex) => ({
                    latitude: vertex.latitude_deg,
                    longitude: vertex.longitude_deg,
                })),
            });
            continue;
        }

        if ("exclusion_polygon" in region) {
            polygons.push({
                inclusion: false,
                polygon: region.exclusion_polygon.vertices.map((vertex) => ({
                    latitude: vertex.latitude_deg,
                    longitude: vertex.longitude_deg,
                })),
            });
            continue;
        }

        if ("inclusion_circle" in region) {
            circles.push({
                inclusion: true,
                circle: {
                    center: {
                        latitude: region.inclusion_circle.center.latitude_deg,
                        longitude: region.inclusion_circle.center.longitude_deg,
                    },
                    radius: region.inclusion_circle.radius_m,
                },
            });
            continue;
        }

        circles.push({
            inclusion: false,
            circle: {
                center: {
                    latitude: region.exclusion_circle.center.latitude_deg,
                    longitude: region.exclusion_circle.center.longitude_deg,
                },
                radius: region.exclusion_circle.radius_m,
            },
        });
    }

    return {
        version: QGC_GEOFENCE_VERSION,
        polygons,
        circles,
    };
}

function parseFenceVertex(vertex: QgcFenceVertex | undefined): GeoPoint2d | null {
    if (!vertex || typeof vertex !== "object") {
        return null;
    }

    const maybeLatitude = typeof vertex.latitude === "number" ? vertex.latitude : vertex.lat;
    const maybeLongitude = typeof vertex.longitude === "number" ? vertex.longitude : vertex.lon;
    if (!Number.isFinite(maybeLatitude) || !Number.isFinite(maybeLongitude)) {
        return null;
    }

    const latitude = maybeLatitude as number;
    const longitude = maybeLongitude as number;
    return {
        latitude_deg: latitude,
        longitude_deg: longitude,
    };
}

function parseRallyPlan(rallyPoints: QgcRallyPoints | undefined, warnings: string[]): RallyPlan {
    const points: GeoPoint3d[] = [];

    for (const [index, point] of (rallyPoints?.points ?? []).entries()) {
        if (!Array.isArray(point) || point.length < 3) {
            warnings.push(`Rally point ${index + 1} was malformed and was skipped.`);
            continue;
        }

        points.push({
            RelHome: {
                latitude_deg: numberOrZero(point[0]),
                longitude_deg: numberOrZero(point[1]),
                relative_alt_m: numberOrZero(point[2]),
            },
        });
    }

    return { points };
}

function exportRallyPlan(rally: RallyPlan, warnings: string[]): QgcRallyExport {
    return {
        version: QGC_RALLY_VERSION,
        points: rally.points.map((point, index) => {
            if (!("RelHome" in point)) {
                warnings.push(`Rally point ${index + 1} used a non-RelHome altitude frame and was exported lossily as a QGC relative-alt point.`);
            }

            if ("Msl" in point) {
                return [point.Msl.latitude_deg, point.Msl.longitude_deg, point.Msl.altitude_msl_m];
            }
            if ("Terrain" in point) {
                return [point.Terrain.latitude_deg, point.Terrain.longitude_deg, point.Terrain.altitude_terrain_m];
            }
            return [point.RelHome.latitude_deg, point.RelHome.longitude_deg, point.RelHome.relative_alt_m];
        }),
    };
}

function commandKey(category: CatalogEntry["category"], variant: string): string {
    return `${category}:${variant}`;
}

const COMMAND_CODEC_BY_KEY: Record<string, CommandCodec> = {
    // Nav
    "Nav:Waypoint": genericCodec(true, [
        numberField("hold_time_s", "param1"),
        numberField("acceptance_radius_m", "param2"),
        numberField("pass_radius_m", "param3"),
        numberField("yaw_deg", "param4"),
    ]),
    "Nav:SplineWaypoint": genericCodec(true, [
        numberField("hold_time_s", "param1"),
    ]),
    "Nav:ArcWaypoint": genericCodec(true, [
        numberField("arc_angle_deg", "param1"),
        enumIndexField("direction", "param2", ["Clockwise", "CounterClockwise"]),
    ]),
    "Nav:Takeoff": genericCodec(true, [
        numberField("pitch_deg", "param1"),
    ]),
    "Nav:Land": genericCodec(true, [
        numberField("abort_alt_m", "param1"),
    ]),
    "Nav:LoiterUnlimited": customCodec(
        true,
        (params, position) => {
            let command = defaultCommand("Nav", "LoiterUnlimited", position ?? undefined);
            command = withCommandField(command, "radius_m", Math.abs(params[2]));
            command = withCommandField(command, "direction", directionFromSignedMagnitude(params[2]));
            return command;
        },
        (command, params) => {
            const data = commandVariantPayload(command, "Nav", "LoiterUnlimited") ?? {};
            params[2] = encodeSignedMagnitude(numberOrZero(data.radius_m), data.direction);
        },
    ),
    "Nav:LoiterTurns": customCodec(
        true,
        (params, position) => {
            let command = defaultCommand("Nav", "LoiterTurns", position ?? undefined);
            command = withCommandField(command, "turns", params[0]);
            command = withCommandField(command, "radius_m", Math.abs(params[2]));
            command = withCommandField(command, "direction", directionFromSignedMagnitude(params[2]));
            command = withCommandField(command, "exit_xtrack", Math.abs(params[3]) > 0.5);
            return command;
        },
        (command, params) => {
            const data = commandVariantPayload(command, "Nav", "LoiterTurns") ?? {};
            params[0] = numberOrZero(data.turns);
            params[2] = encodeSignedMagnitude(numberOrZero(data.radius_m), data.direction);
            params[3] = data.exit_xtrack ? 1 : 0;
        },
    ),
    "Nav:LoiterTime": customCodec(
        true,
        (params, position) => {
            let command = defaultCommand("Nav", "LoiterTime", position ?? undefined);
            command = withCommandField(command, "time_s", params[0]);
            command = withCommandField(command, "direction", directionFromSignedMagnitude(params[2]));
            command = withCommandField(command, "exit_xtrack", Math.abs(params[3]) > 0.5);
            return command;
        },
        (command, params) => {
            const data = commandVariantPayload(command, "Nav", "LoiterTime") ?? {};
            params[0] = numberOrZero(data.time_s);
            params[2] = encodeSignedMagnitude(1, data.direction);
            params[3] = data.exit_xtrack ? 1 : 0;
        },
    ),
    "Nav:LoiterToAlt": customCodec(
        true,
        (params, position) => {
            let command = defaultCommand("Nav", "LoiterToAlt", position ?? undefined);
            command = withCommandField(command, "radius_m", Math.abs(params[0]));
            command = withCommandField(command, "direction", directionFromSignedMagnitude(params[0]));
            command = withCommandField(command, "exit_xtrack", Math.abs(params[1]) > 0.5);
            return command;
        },
        (command, params) => {
            const data = commandVariantPayload(command, "Nav", "LoiterToAlt") ?? {};
            params[0] = encodeSignedMagnitude(numberOrZero(data.radius_m), data.direction);
            params[1] = data.exit_xtrack ? 1 : 0;
        },
    ),
    "Nav:ContinueAndChangeAlt": genericCodec(true, [
        enumIndexField("action", "param1", ALT_CHANGE_ACTIONS),
    ]),
    "Nav:VtolTakeoff": unitCodec(true),
    "Nav:VtolLand": genericCodec(true, [
        numberField("options", "param1"),
    ]),
    "Nav:PayloadPlace": genericCodec(true, [
        numberField("max_descent_m", "param1"),
    ]),
    "Nav:ReturnToLaunch": unitCodec(false),
    "Nav:Delay": genericCodec(false, [
        numberField("seconds", "param1"),
        numberField("hour_utc", "param2"),
        numberField("min_utc", "param3"),
        numberField("sec_utc", "param4"),
    ]),
    "Nav:GuidedEnable": genericCodec(false, [
        boolField("enabled", "param1"),
    ]),
    "Nav:AltitudeWait": genericCodec(false, [
        numberField("altitude_m", "param1"),
        numberField("descent_rate_mps", "param2"),
        numberField("wiggle_time_s", "param3"),
    ]),
    "Nav:SetYawSpeed": genericCodec(false, [
        numberField("angle_deg", "param1"),
        numberField("speed_mps", "param2"),
        boolField("relative", "param3"),
    ]),
    "Nav:ScriptTime": genericCodec(false, [
        numberField("command", "param1"),
        numberField("timeout_s", "param2"),
        numberField("arg1", "param3"),
        numberField("arg2", "param4"),
        numberField("arg3", "x"),
        numberField("arg4", "y"),
    ]),
    "Nav:AttitudeTime": genericCodec(false, [
        numberField("time_s", "param1"),
        numberField("roll_deg", "param2"),
        numberField("pitch_deg", "param3"),
        numberField("yaw_deg", "param4"),
        numberField("climb_rate_mps", "x"),
    ]),

    // Do
    "Do:Jump": genericCodec(false, [
        numberField("target_index", "param1"),
        numberField("repeat_count", "param2"),
    ]),
    "Do:JumpTag": genericCodec(false, [
        numberField("tag", "param1"),
        numberField("repeat_count", "param2"),
    ]),
    "Do:Tag": genericCodec(false, [
        numberField("tag", "param1"),
    ]),
    "Do:PauseContinue": genericCodec(false, [
        boolField("pause", "param1"),
    ]),
    "Do:ChangeSpeed": genericCodec(false, [
        enumIndexField("speed_type", "param1", SPEED_TYPES),
        numberField("speed_mps", "param2"),
        numberField("throttle_pct", "param3"),
    ]),
    "Do:SetReverse": genericCodec(false, [
        boolField("reverse", "param1"),
    ]),
    "Do:SetHome": genericCodec(true, [
        boolField("use_current", "param1"),
    ]),
    "Do:LandStart": unitCodec(true),
    "Do:ReturnPathStart": unitCodec(true),
    "Do:GoAround": unitCodec(true),
    "Do:SetRoiLocation": unitCodec(true),
    "Do:SetRoi": genericCodec(true, [
        numberField("mode", "param1"),
    ]),
    "Do:SetRoiNone": unitCodec(false),
    "Do:MountControl": genericCodec(false, [
        numberField("pitch_deg", "param1"),
        numberField("roll_deg", "param2"),
        numberField("yaw_deg", "param3"),
    ]),
    "Do:GimbalManagerPitchYaw": genericCodec(false, [
        numberField("pitch_deg", "param1"),
        numberField("yaw_deg", "param2"),
        numberField("pitch_rate_dps", "param3"),
        numberField("yaw_rate_dps", "param4"),
        numberField("flags", "x"),
        numberField("gimbal_id", "y"),
    ]),
    "Do:CamTriggerDistance": genericCodec(false, [
        numberField("meters", "param1"),
        boolField("trigger_now", "param3"),
    ]),
    "Do:ImageStartCapture": genericCodec(false, [
        numberField("instance", "param1"),
        numberField("interval_s", "param2"),
        numberField("total_images", "param3"),
        numberField("start_number", "param4"),
    ]),
    "Do:ImageStopCapture": genericCodec(false, [
        numberField("instance", "param1"),
    ]),
    "Do:VideoStartCapture": genericCodec(false, [
        numberField("stream_id", "param1"),
    ]),
    "Do:VideoStopCapture": genericCodec(false, [
        numberField("stream_id", "param1"),
    ]),
    "Do:SetCameraZoom": genericCodec(false, [
        numberField("zoom_type", "param1"),
        numberField("zoom_value", "param2"),
    ]),
    "Do:SetCameraFocus": genericCodec(false, [
        numberField("focus_type", "param1"),
        numberField("focus_value", "param2"),
    ]),
    "Do:SetCameraSource": genericCodec(false, [
        numberField("instance", "param1"),
        numberField("primary", "param2"),
        numberField("secondary", "param3"),
    ]),
    "Do:DigicamConfigure": genericCodec(false, [
        numberField("shooting_mode", "param1"),
        numberField("shutter_speed", "param2"),
        numberField("aperture", "param3"),
        numberField("iso", "param4"),
        numberField("exposure_type", "x"),
        numberField("cmd_id", "y"),
        numberField("cutoff_time", "z"),
    ]),
    "Do:DigicamControl": genericCodec(false, [
        numberField("session", "param1"),
        numberField("zoom_pos", "param2"),
        numberField("zoom_step", "param3"),
        numberField("focus_lock", "param4"),
        numberField("shooting_cmd", "x"),
        numberField("cmd_id", "y"),
    ]),
    "Do:SetServo": genericCodec(false, [
        numberField("channel", "param1"),
        numberField("pwm", "param2"),
    ]),
    "Do:SetRelay": genericCodec(false, [
        numberField("number", "param1"),
        boolField("state", "param2"),
    ]),
    "Do:RepeatServo": genericCodec(false, [
        numberField("channel", "param1"),
        numberField("pwm", "param2"),
        numberField("count", "param3"),
        numberField("cycle_time_s", "param4"),
    ]),
    "Do:RepeatRelay": genericCodec(false, [
        numberField("number", "param1"),
        numberField("count", "param2"),
        numberField("cycle_time_s", "param3"),
    ]),
    "Do:FenceEnable": genericCodec(false, [
        enumIndexField("action", "param1", FENCE_ACTIONS),
    ]),
    "Do:Parachute": genericCodec(false, [
        enumIndexField("action", "param1", PARACHUTE_ACTIONS),
    ]),
    "Do:Gripper": genericCodec(false, [
        numberField("number", "param1"),
        enumIndexField("action", "param2", GRIPPER_ACTIONS),
    ]),
    "Do:Sprayer": genericCodec(false, [
        boolField("enabled", "param1"),
    ]),
    "Do:Winch": genericCodec(false, [
        numberField("number", "param1"),
        enumIndexField("action", "param2", WINCH_ACTIONS),
        numberField("release_length_m", "param3"),
        numberField("release_rate_mps", "param4"),
    ]),
    "Do:EngineControl": genericCodec(false, [
        boolField("start", "param1"),
        boolField("cold_start", "param2"),
        numberField("height_delay_m", "param3"),
        boolField("allow_disarmed", "param4"),
    ]),
    "Do:InvertedFlight": genericCodec(false, [
        boolField("inverted", "param1"),
    ]),
    "Do:AutotuneEnable": genericCodec(false, [
        boolField("enabled", "param1"),
    ]),
    "Do:VtolTransition": genericCodec(false, [
        numberField("target_state", "param1"),
    ]),
    "Do:GuidedLimits": genericCodec(false, [
        numberField("max_time_s", "param1"),
        numberField("min_alt_m", "param2"),
        numberField("max_alt_m", "param3"),
        numberField("max_horiz_m", "param4"),
    ]),
    "Do:SetResumeRepeatDist": genericCodec(false, [
        numberField("distance_m", "param1"),
    ]),
    "Do:AuxFunction": genericCodec(false, [
        numberField("function", "param1"),
        numberField("switch_pos", "param2"),
    ]),
    "Do:SendScriptMessage": genericCodec(false, [
        numberField("id", "param1"),
        numberField("p1", "param2"),
        numberField("p2", "param3"),
        numberField("p3", "param4"),
    ]),

    // Condition
    "Condition:Delay": genericCodec(false, [
        numberField("delay_s", "param1"),
    ]),
    "Condition:Distance": genericCodec(false, [
        numberField("distance_m", "param1"),
    ]),
    "Condition:Yaw": {
        kind: "custom",
        hasPosition: false,
        parse: (params) => {
            let command = defaultCommand("Condition", "Yaw");
            command = withCommandField(command, "angle_deg", params[0]);
            command = withCommandField(command, "turn_rate_dps", params[1]);
            command = withCommandField(command, "direction", params[2] < 0 ? "CounterClockwise" : "Clockwise");
            command = withCommandField(command, "relative", Math.abs(params[3]) > 0.5);
            return command;
        },
        export: (command, params) => {
            const data = commandVariantPayload(command, "Condition", "Yaw") ?? {};
            params[0] = numberOrZero(data.angle_deg);
            params[1] = numberOrZero(data.turn_rate_dps);
            params[2] = data.direction === "CounterClockwise" ? -1 : 1;
            params[3] = data.relative ? 1 : 0;
        },
    },
};

const missingCommandCodecs = COMMAND_CATALOG.filter(
    (entry) => !(commandKey(entry.category, entry.variant) in COMMAND_CODEC_BY_KEY),
);

if (missingCommandCodecs.length > 0) {
    throw new Error(
        `mission-plan-io missing command codecs for: ${missingCommandCodecs
            .map((entry) => `${entry.category}:${entry.variant}`)
            .join(", ")}`,
    );
}
