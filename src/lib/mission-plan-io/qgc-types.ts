export type QgcPlanMission = {
    version?: number;
    firmwareType?: number;
    vehicleType?: number;
    cruiseSpeed?: number;
    hoverSpeed?: number;
    plannedHomePosition?: [number, number, number] | number[];
    items?: unknown[];
};

export type QgcFenceVertex = {
    lat?: number;
    lon?: number;
    latitude?: number;
    longitude?: number;
};

export type QgcFencePolygon = {
    inclusion?: boolean;
    polygon?: QgcFenceVertex[];
};

export type QgcFenceCircle = {
    inclusion?: boolean;
    circle?: {
        center?: QgcFenceVertex;
        radius?: number;
    };
};

export type QgcGeoFence = {
    version?: number;
    polygons?: QgcFencePolygon[];
    circles?: QgcFenceCircle[];
};

export type QgcRallyPoints = {
    version?: number;
    points?: Array<[number, number, number] | number[]>;
};

export type QgcRallyExport = {
    version: number;
    points: Array<[number, number, number]>;
};

export type QgcPlan = {
    fileType?: string;
    version?: number;
    groundStation?: string;
    mission?: QgcPlanMission;
    geoFence?: QgcGeoFence;
    rallyPoints?: QgcRallyPoints;
};

export type QgcSimpleItem = {
    type: "SimpleItem";
    autoContinue?: boolean;
    command: number;
    doJumpId?: number;
    frame?: number;
    params?: number[];
};

export type QgcComplexItem = {
    type: "ComplexItem";
    complexItemType?: string;
    [key: string]: unknown;
};

export type QgcCoordinatePair = [number, number] | number[];

export type QgcCameraCalc = {
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

export type QgcTransectStyleComplexItem = {
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

export type QgcSurveyComplexItem = QgcComplexItem & {
    complexItemType: "survey";
    version?: number;
    angle?: number;
    entryLocation?: number;
    flyAlternateTransects?: boolean;
    polygon?: QgcCoordinatePair[];
    TransectStyleComplexItem?: QgcTransectStyleComplexItem;
};

export type QgcCorridorComplexItem = QgcComplexItem & {
    complexItemType: "CorridorScan";
    version?: number;
    CorridorWidth?: number;
    EntryPoint?: number;
    polyline?: QgcCoordinatePair[];
    TransectStyleComplexItem?: QgcTransectStyleComplexItem;
};

export type QgcStructureComplexItem = QgcComplexItem & {
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

export const QGC_FILE_TYPE = "Plan";
export const QGC_GROUND_STATION = "QGroundControl";
export const QGC_PLAN_VERSION = 1;
export const QGC_MISSION_VERSION = 2;
export const QGC_GEOFENCE_VERSION = 2;
export const QGC_RALLY_VERSION = 2;
export const QGC_SURVEY_VERSION = 5;
export const QGC_CORRIDOR_VERSION = 3;
export const QGC_STRUCTURE_VERSION = 2;
export const QGC_TRANSECT_STYLE_VERSION = 1;
export const QGC_CAMERA_CALC_VERSION = 1;
export const DEFAULT_FIRMWARE_TYPE = 12;
export const DEFAULT_VEHICLE_TYPE = 2;
export const DEFAULT_CRUISE_SPEED_MPS = 15;
export const DEFAULT_HOVER_SPEED_MPS = 5;
export const MANUAL_CAMERA_NAME = "Manual (no camera specs)";
export const CUSTOM_CAMERA_NAME = "Custom Camera";

export const MAV_FRAME_GLOBAL = 0;
export const MAV_FRAME_MISSION = 2;
export const MAV_FRAME_GLOBAL_RELATIVE_ALT = 3;
export const MAV_FRAME_GLOBAL_TERRAIN_ALT = 10;
