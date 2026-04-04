import {
    ALT_CHANGE_ACTIONS,
    FENCE_ACTIONS,
    GRIPPER_ACTIONS,
    LOITER_DIRECTIONS,
    PARACHUTE_ACTIONS,
    SPEED_TYPES,
    WINCH_ACTIONS,
    YAW_DIRECTIONS,
} from "../mission-command-enums";

// TypeScript types mirroring mavkit serde output.
// These must match the exact JSON shapes produced by serde serialization
// of the Rust types in mavkit (externally-tagged enums, struct field names).

export type GeoPoint2d = {
    latitude_deg: number;
    longitude_deg: number;
};

export type GeoPoint3dMsl = {
    latitude_deg: number;
    longitude_deg: number;
    altitude_msl_m: number;
};

export type GeoPoint3dRelHome = {
    latitude_deg: number;
    longitude_deg: number;
    relative_alt_m: number;
};

export type GeoPoint3dTerrain = {
    latitude_deg: number;
    longitude_deg: number;
    altitude_terrain_m: number;
};

// Externally-tagged enum (no rename_all on the Rust side).
export type GeoPoint3d =
    | { Msl: GeoPoint3dMsl }
    | { RelHome: GeoPoint3dRelHome }
    | { Terrain: GeoPoint3dTerrain };

export type LoiterDirection = (typeof LOITER_DIRECTIONS)[number];
export type AltChangeAction = (typeof ALT_CHANGE_ACTIONS)[number];
export type SpeedType = (typeof SPEED_TYPES)[number];
export type FenceAction = (typeof FENCE_ACTIONS)[number];
export type ParachuteAction = (typeof PARACHUTE_ACTIONS)[number];
export type GripperAction = (typeof GRIPPER_ACTIONS)[number];
export type WinchAction = (typeof WINCH_ACTIONS)[number];
export type YawDirection = (typeof YAW_DIRECTIONS)[number];

export type MissionFrame =
    | "Global"
    | "GlobalRelativeAlt"
    | "GlobalTerrainAlt"
    | "Mission"
    | { Other: number };

export type RawMissionCommand = {
    command: number;
    frame: MissionFrame;
    param1: number;
    param2: number;
    param3: number;
    param4: number;
    x: number;
    y: number;
    z: number;
};

export type NavWaypoint = {
    position: GeoPoint3d;
    hold_time_s: number;
    acceptance_radius_m: number;
    pass_radius_m: number;
    yaw_deg: number;
};

export type NavSplineWaypoint = {
    position: GeoPoint3d;
    hold_time_s: number;
};

export type NavArcWaypoint = {
    position: GeoPoint3d;
    arc_angle_deg: number;
    direction: LoiterDirection;
};

export type NavTakeoff = {
    position: GeoPoint3d;
    pitch_deg: number;
};

export type NavLand = {
    position: GeoPoint3d;
    abort_alt_m: number;
};

export type NavLoiterUnlimited = {
    position: GeoPoint3d;
    radius_m: number;
    direction: LoiterDirection;
};

export type NavLoiterTurns = {
    position: GeoPoint3d;
    turns: number;
    radius_m: number;
    direction: LoiterDirection;
    exit_xtrack: boolean;
};

export type NavLoiterTime = {
    position: GeoPoint3d;
    time_s: number;
    direction: LoiterDirection;
    exit_xtrack: boolean;
};

export type NavLoiterToAlt = {
    position: GeoPoint3d;
    radius_m: number;
    direction: LoiterDirection;
    exit_xtrack: boolean;
};

export type NavContinueAndChangeAlt = {
    position: GeoPoint3d;
    action: AltChangeAction;
};

export type NavDelay = {
    seconds: number;
    hour_utc: number;
    min_utc: number;
    sec_utc: number;
};

export type NavGuidedEnable = {
    enabled: boolean;
};

export type NavAltitudeWait = {
    altitude_m: number;
    descent_rate_mps: number;
    wiggle_time_s: number;
};

export type NavVtolTakeoff = {
    position: GeoPoint3d;
};

export type NavVtolLand = {
    position: GeoPoint3d;
    options: number;
};

export type NavPayloadPlace = {
    position: GeoPoint3d;
    max_descent_m: number;
};

export type NavSetYawSpeed = {
    angle_deg: number;
    speed_mps: number;
    relative: boolean;
};

export type NavScriptTime = {
    command: number;
    timeout_s: number;
    arg1: number;
    arg2: number;
    arg3: number;
    arg4: number;
};

export type NavAttitudeTime = {
    time_s: number;
    roll_deg: number;
    pitch_deg: number;
    yaw_deg: number;
    climb_rate_mps: number;
};

export type NavCommand =
    | { Waypoint: NavWaypoint }
    | { SplineWaypoint: NavSplineWaypoint }
    | { ArcWaypoint: NavArcWaypoint }
    | { Takeoff: NavTakeoff }
    | { Land: NavLand }
    | { LoiterUnlimited: NavLoiterUnlimited }
    | { LoiterTurns: NavLoiterTurns }
    | { LoiterTime: NavLoiterTime }
    | { LoiterToAlt: NavLoiterToAlt }
    | { ContinueAndChangeAlt: NavContinueAndChangeAlt }
    | { Delay: NavDelay }
    | { GuidedEnable: NavGuidedEnable }
    | { AltitudeWait: NavAltitudeWait }
    | { VtolTakeoff: NavVtolTakeoff }
    | { VtolLand: NavVtolLand }
    | { PayloadPlace: NavPayloadPlace }
    | { SetYawSpeed: NavSetYawSpeed }
    | { ScriptTime: NavScriptTime }
    | { AttitudeTime: NavAttitudeTime }
    | "ReturnToLaunch";

export type DoJump = { target_index: number; repeat_count: number };
export type DoJumpTag = { tag: number; repeat_count: number };
export type DoTag = { tag: number };
export type DoPauseContinue = { pause: boolean };
export type DoChangeSpeed = { speed_type: SpeedType; speed_mps: number; throttle_pct: number };
export type DoSetReverse = { reverse: boolean };
export type DoSetHome = { position: GeoPoint3d; use_current: boolean };
export type DoLandStart = { position: GeoPoint3d };
export type DoReturnPathStart = { position: GeoPoint3d };
export type DoGoAround = { position: GeoPoint3d };
export type DoSetRoiLocation = { position: GeoPoint3d };
export type DoSetRoi = { mode: number; position: GeoPoint3d };
export type DoMountControl = { pitch_deg: number; roll_deg: number; yaw_deg: number };
export type DoGimbalManagerPitchYaw = {
    pitch_deg: number;
    yaw_deg: number;
    pitch_rate_dps: number;
    yaw_rate_dps: number;
    flags: number;
    gimbal_id: number;
};
export type DoCamTriggerDistance = { meters: number; trigger_now: boolean };
export type DoImageStartCapture = {
    instance: number;
    interval_s: number;
    total_images: number;
    start_number: number;
};
export type DoImageStopCapture = { instance: number };
export type DoVideoStartCapture = { stream_id: number };
export type DoVideoStopCapture = { stream_id: number };
export type DoSetCameraZoom = { zoom_type: number; zoom_value: number };
export type DoSetCameraFocus = { focus_type: number; focus_value: number };
export type DoSetCameraSource = { instance: number; primary: number; secondary: number };
export type DoDigicamConfigure = {
    shooting_mode: number;
    shutter_speed: number;
    aperture: number;
    iso: number;
    exposure_type: number;
    cmd_id: number;
    cutoff_time: number;
};
export type DoDigicamControl = {
    session: number;
    zoom_pos: number;
    zoom_step: number;
    focus_lock: number;
    shooting_cmd: number;
    cmd_id: number;
};
export type DoSetServo = { channel: number; pwm: number };
export type DoSetRelay = { number: number; state: boolean };
export type DoRepeatServo = { channel: number; pwm: number; count: number; cycle_time_s: number };
export type DoRepeatRelay = { number: number; count: number; cycle_time_s: number };
export type DoFenceEnable = { action: FenceAction };
export type DoParachute = { action: ParachuteAction };
export type DoGripper = { number: number; action: GripperAction };
export type DoSprayer = { enabled: boolean };
export type DoWinch = {
    number: number;
    action: WinchAction;
    release_length_m: number;
    release_rate_mps: number;
};
export type DoEngineControl = {
    start: boolean;
    cold_start: boolean;
    height_delay_m: number;
    allow_disarmed: boolean;
};
export type DoInvertedFlight = { inverted: boolean };
export type DoAutotuneEnable = { enabled: boolean };
export type DoVtolTransition = { target_state: number };
export type DoGuidedLimits = {
    max_time_s: number;
    min_alt_m: number;
    max_alt_m: number;
    max_horiz_m: number;
};
export type DoSetResumeRepeatDist = { distance_m: number };
export type DoAuxFunction = { function: number; switch_pos: number };
export type DoSendScriptMessage = { id: number; p1: number; p2: number; p3: number };

export type DoCommand =
    | { Jump: DoJump }
    | { JumpTag: DoJumpTag }
    | { Tag: DoTag }
    | { PauseContinue: DoPauseContinue }
    | { ChangeSpeed: DoChangeSpeed }
    | { SetReverse: DoSetReverse }
    | { SetHome: DoSetHome }
    | { LandStart: DoLandStart }
    | { ReturnPathStart: DoReturnPathStart }
    | { GoAround: DoGoAround }
    | { SetRoiLocation: DoSetRoiLocation }
    | { SetRoi: DoSetRoi }
    | { MountControl: DoMountControl }
    | { GimbalManagerPitchYaw: DoGimbalManagerPitchYaw }
    | { CamTriggerDistance: DoCamTriggerDistance }
    | { ImageStartCapture: DoImageStartCapture }
    | { ImageStopCapture: DoImageStopCapture }
    | { VideoStartCapture: DoVideoStartCapture }
    | { VideoStopCapture: DoVideoStopCapture }
    | { SetCameraZoom: DoSetCameraZoom }
    | { SetCameraFocus: DoSetCameraFocus }
    | { SetCameraSource: DoSetCameraSource }
    | { DigicamConfigure: DoDigicamConfigure }
    | { DigicamControl: DoDigicamControl }
    | { SetServo: DoSetServo }
    | { SetRelay: DoSetRelay }
    | { RepeatServo: DoRepeatServo }
    | { RepeatRelay: DoRepeatRelay }
    | { FenceEnable: DoFenceEnable }
    | { Parachute: DoParachute }
    | { Gripper: DoGripper }
    | { Sprayer: DoSprayer }
    | { Winch: DoWinch }
    | { EngineControl: DoEngineControl }
    | { InvertedFlight: DoInvertedFlight }
    | { AutotuneEnable: DoAutotuneEnable }
    | { VtolTransition: DoVtolTransition }
    | { GuidedLimits: DoGuidedLimits }
    | { SetResumeRepeatDist: DoSetResumeRepeatDist }
    | { AuxFunction: DoAuxFunction }
    | { SendScriptMessage: DoSendScriptMessage }
    | "SetRoiNone";

export type CondDelay = { delay_s: number };
export type CondDistance = { distance_m: number };
export type CondYaw = {
    angle_deg: number;
    turn_rate_dps: number;
    direction: YawDirection;
    relative: boolean;
};

export type ConditionCommand =
    | { Delay: CondDelay }
    | { Distance: CondDistance }
    | { Yaw: CondYaw };

export type MissionCommand =
    | { Nav: NavCommand }
    | { Do: DoCommand }
    | { Condition: ConditionCommand }
    | { Other: RawMissionCommand };

export type MissionItem = {
    command: MissionCommand;
    current: boolean;
    autocontinue: boolean;
};

export type MissionPlan = {
    items: MissionItem[];
};

export type HomePosition = {
    latitude_deg: number;
    longitude_deg: number;
    altitude_m: number;
};

export type FenceInclusionPolygon = {
    vertices: GeoPoint2d[];
    inclusion_group: number;
};

export type FenceExclusionPolygon = {
    vertices: GeoPoint2d[];
};

export type FenceInclusionCircle = {
    center: GeoPoint2d;
    radius_m: number;
    inclusion_group: number;
};

export type FenceExclusionCircle = {
    center: GeoPoint2d;
    radius_m: number;
};

export type FenceRegion =
    | { inclusion_polygon: FenceInclusionPolygon }
    | { exclusion_polygon: FenceExclusionPolygon }
    | { inclusion_circle: FenceInclusionCircle }
    | { exclusion_circle: FenceExclusionCircle };

export type FencePlan = {
    return_point: GeoPoint2d | null;
    regions: FenceRegion[];
};

export type RallyPlan = {
    points: GeoPoint3d[];
};
