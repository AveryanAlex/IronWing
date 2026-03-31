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

type ExportPlanInput = {
    mission: MissionPlan;
    home: HomePosition | null;
    fence: FencePlan;
    rally: RallyPlan;
};

export type PlanParseResult = {
    mission: MissionPlan;
    home: HomePosition | null;
    fence: FencePlan;
    rally: RallyPlan;
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
const DEFAULT_FIRMWARE_TYPE = 12;
const DEFAULT_VEHICLE_TYPE = 2;
const DEFAULT_CRUISE_SPEED_MPS = 15;
const DEFAULT_HOVER_SPEED_MPS = 5;

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

    return {
        mission: {
            items: parseMissionItems(missionSection.items, warnings),
        },
        home: parseHomePosition(missionSection.plannedHomePosition),
        fence: parseFencePlan(json?.geoFence, warnings),
        rally: parseRallyPlan(json?.rallyPoints, warnings),
        warnings,
    };
}

export function exportPlanFile({ mission, home, fence, rally }: ExportPlanInput): PlanExportResult {
    const warnings: string[] = [];
    const missionItems = mission.items.map((item, index) => exportMissionItem(item, index, warnings));
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
            cruiseSpeed: DEFAULT_CRUISE_SPEED_MPS,
            hoverSpeed: DEFAULT_HOVER_SPEED_MPS,
            plannedHomePosition,
            items: missionItems,
        },
    };

    if (fence.return_point !== null) {
        warnings.push("Fence return_point is not represented in QGroundControl .plan files and was omitted during export.");
    }

    if (fence.regions.length > 0) {
        json.geoFence = exportFencePlan(fence);
    }

    if (rally.points.length > 0) {
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

function parseMissionItems(items: unknown[] | undefined, warnings: string[]): MissionItem[] {
    if (!Array.isArray(items)) {
        return [];
    }

    const flattened: QgcSimpleItem[] = [];
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
            const context = `Mission ComplexItem ${index + 1}${typeof complexItem.complexItemType === "string" ? ` (${complexItem.complexItemType})` : ""}`;
            warnings.push(`${context} loses survey/corridor metadata when imported into IronWing.`);
            const embeddedItems = findEmbeddedSimpleItems(complexItem);
            if (embeddedItems.length === 0) {
                warnings.push(`${context} has no embedded SimpleItem array and was skipped.`);
                continue;
            }
            flattened.push(...embeddedItems);
            continue;
        }

        warnings.push(`Mission item ${index + 1} has unsupported type ${String(itemType)} and was skipped.`);
    }

    return flattened.map((item, index) => parseSimpleItem(item, index, warnings));
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

function parseSimpleItem(item: QgcSimpleItem, index: number, warnings: string[]): MissionItem {
    const params = normalizeParams(item.params);
    const entry = commandIdToVariant(item.command);
    const context = `Mission item ${index + 1} (MAV_CMD ${item.command})`;

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
