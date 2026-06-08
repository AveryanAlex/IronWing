import type * as Generated from "../generated/mavkit";

export type * from "../generated/mavkit";
export type {
    MissionItem as WireMissionItem,
    MissionPlan as WireMissionPlan,
} from "../generated/mavkit";

type UiWire<T> = T extends null | undefined
    ? never
    : T extends string | number | boolean | bigint
      ? T
      : T extends Array<infer Item>
        ? UiWire<Item>[]
        : T extends object
          ? {
                [K in keyof T as NonNullable<T[K]> extends never ? never : K]-?: UiWire<NonNullable<T[K]>>;
            }
          : T;

export type GeoPoint2d = UiWire<Generated.GeoPoint2d>;
export type GeoPoint3dMsl = UiWire<Generated.GeoPoint3dMsl>;
export type GeoPoint3dRelHome = UiWire<Generated.GeoPoint3dRelHome>;
export type GeoPoint3dTerrain = UiWire<Generated.GeoPoint3dTerrain>;
export type GeoPoint3d = UiWire<Generated.GeoPoint3d>;
export type HomePosition = UiWire<Generated.HomePosition>;

export type LoiterDirection = Generated.LoiterDirection;
export type AltChangeAction = Generated.AltChangeAction;
export type SpeedType = Generated.SpeedType;
export type FenceAction = Generated.FenceAction;
export type ParachuteAction = Generated.ParachuteAction;
export type GripperAction = Generated.GripperAction;
export type WinchAction = Generated.WinchAction;
export type YawDirection = Generated.YawDirection;
export type MissionFrame = Generated.MissionFrame;

export type RawMissionCommand = UiWire<Generated.RawMissionCommand>;

export type NavWaypoint = UiWire<Generated.NavWaypoint>;
export type NavSplineWaypoint = UiWire<Generated.NavSplineWaypoint>;
export type NavArcWaypoint = UiWire<Generated.NavArcWaypoint>;
export type NavTakeoff = UiWire<Generated.NavTakeoff>;
export type NavLand = UiWire<Generated.NavLand>;
export type NavLoiterUnlimited = UiWire<Generated.NavLoiterUnlimited>;
export type NavLoiterTurns = UiWire<Generated.NavLoiterTurns>;
export type NavLoiterTime = UiWire<Generated.NavLoiterTime>;
export type NavLoiterToAlt = UiWire<Generated.NavLoiterToAlt>;
export type NavContinueAndChangeAlt = UiWire<Generated.NavContinueAndChangeAlt>;
export type NavDelay = UiWire<Generated.NavDelay>;
export type NavGuidedEnable = UiWire<Generated.NavGuidedEnable>;
export type NavAltitudeWait = UiWire<Generated.NavAltitudeWait>;
export type NavVtolTakeoff = UiWire<Generated.NavVtolTakeoff>;
export type NavVtolLand = UiWire<Generated.NavVtolLand>;
export type NavPayloadPlace = UiWire<Generated.NavPayloadPlace>;
export type NavSetYawSpeed = UiWire<Generated.NavSetYawSpeed>;
export type NavScriptTime = UiWire<Generated.NavScriptTime>;
export type NavAttitudeTime = UiWire<Generated.NavAttitudeTime>;
export type NavCommand = UiWire<Generated.NavCommand>;

export type DoJump = UiWire<Generated.DoJump>;
export type DoJumpTag = UiWire<Generated.DoJumpTag>;
export type DoTag = UiWire<Generated.DoTag>;
export type DoPauseContinue = UiWire<Generated.DoPauseContinue>;
export type DoChangeSpeed = UiWire<Generated.DoChangeSpeed>;
export type DoSetReverse = UiWire<Generated.DoSetReverse>;
export type DoSetHome = UiWire<Generated.DoSetHome>;
export type DoLandStart = UiWire<Generated.DoLandStart>;
export type DoReturnPathStart = UiWire<Generated.DoReturnPathStart>;
export type DoGoAround = UiWire<Generated.DoGoAround>;
export type DoSetRoiLocation = UiWire<Generated.DoSetRoiLocation>;
export type DoSetRoi = UiWire<Generated.DoSetRoi>;
export type DoMountControl = UiWire<Generated.DoMountControl>;
export type DoGimbalManagerPitchYaw = UiWire<Generated.DoGimbalManagerPitchYaw>;
export type DoCamTriggerDistance = UiWire<Generated.DoCamTriggerDistance>;
export type DoImageStartCapture = UiWire<Generated.DoImageStartCapture>;
export type DoImageStopCapture = UiWire<Generated.DoImageStopCapture>;
export type DoVideoStartCapture = UiWire<Generated.DoVideoStartCapture>;
export type DoVideoStopCapture = UiWire<Generated.DoVideoStopCapture>;
export type DoSetCameraZoom = UiWire<Generated.DoSetCameraZoom>;
export type DoSetCameraFocus = UiWire<Generated.DoSetCameraFocus>;
export type DoSetCameraSource = UiWire<Generated.DoSetCameraSource>;
export type DoDigicamConfigure = UiWire<Generated.DoDigicamConfigure>;
export type DoDigicamControl = UiWire<Generated.DoDigicamControl>;
export type DoSetServo = UiWire<Generated.DoSetServo>;
export type DoSetRelay = UiWire<Generated.DoSetRelay>;
export type DoRepeatServo = UiWire<Generated.DoRepeatServo>;
export type DoRepeatRelay = UiWire<Generated.DoRepeatRelay>;
export type DoFenceEnable = UiWire<Generated.DoFenceEnable>;
export type DoParachute = UiWire<Generated.DoParachute>;
export type DoGripper = UiWire<Generated.DoGripper>;
export type DoSprayer = UiWire<Generated.DoSprayer>;
export type DoWinch = UiWire<Generated.DoWinch>;
export type DoEngineControl = UiWire<Generated.DoEngineControl>;
export type DoInvertedFlight = UiWire<Generated.DoInvertedFlight>;
export type DoAutotuneEnable = UiWire<Generated.DoAutotuneEnable>;
export type DoVtolTransition = UiWire<Generated.DoVtolTransition>;
export type DoGuidedLimits = UiWire<Generated.DoGuidedLimits>;
export type DoSetResumeRepeatDist = UiWire<Generated.DoSetResumeRepeatDist>;
export type DoAuxFunction = UiWire<Generated.DoAuxFunction>;
export type DoSendScriptMessage = UiWire<Generated.DoSendScriptMessage>;
export type DoCommand = UiWire<Generated.DoCommand>;

export type CondDelay = UiWire<Generated.CondDelay>;
export type CondDistance = UiWire<Generated.CondDistance>;
export type CondYaw = UiWire<Generated.CondYaw>;
export type ConditionCommand = UiWire<Generated.ConditionCommand>;

export type MissionCommand = UiWire<Generated.MissionCommand>;
export type UiMissionItem = UiWire<Generated.MissionItem> & {
    current?: boolean;
};
export type MissionItem = UiMissionItem;
export type UiMissionPlan = Omit<UiWire<Generated.MissionPlan>, "items"> & {
    items: UiMissionItem[];
};
export type MissionPlan = UiMissionPlan;

export type MissionIssue = UiWire<Generated.MissionIssue>;
export type MissionState = Omit<UiWire<Generated.MissionState>, "plan"> & {
    plan: MissionPlan | null;
};
export type MissionType = Generated.MissionType;

export type FenceInclusionPolygon = UiWire<Generated.FenceInclusionPolygon>;
export type FenceExclusionPolygon = UiWire<Generated.FenceExclusionPolygon>;
export type FenceInclusionCircle = UiWire<Generated.FenceInclusionCircle>;
export type FenceExclusionCircle = UiWire<Generated.FenceExclusionCircle>;
export type FenceRegion = UiWire<Generated.FenceRegion>;
export type FencePlan = Omit<UiWire<Generated.FencePlan>, "return_point"> & {
    return_point: GeoPoint2d | null;
};

export type RallyPlan = UiWire<Generated.RallyPlan>;

export type ParamType = Generated.ParamType;
export type Param = UiWire<Generated.Param>;
export type ParamStore = UiWire<Generated.ParamStore>;
export type ParamWriteResult = UiWire<Generated.ParamWriteResult>;
export type ParamState = UiWire<Generated.ParamState>;
