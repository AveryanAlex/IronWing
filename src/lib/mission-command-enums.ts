import type {
    AltChangeAction,
    FenceAction,
    GripperAction,
    LoiterDirection,
    ParachuteAction,
    SpeedType,
    WinchAction,
    YawDirection,
} from "./generated/mavkit";

export const LOITER_DIRECTIONS = ["clockwise", "counter_clockwise"] as const satisfies readonly LoiterDirection[];
export const ALT_CHANGE_ACTIONS = ["neutral", "climb", "descend"] as const satisfies readonly AltChangeAction[];
export const SPEED_TYPES = ["airspeed", "groundspeed"] as const satisfies readonly SpeedType[];
export const FENCE_ACTIONS = ["disable", "enable", "disable_floor"] as const satisfies readonly FenceAction[];
export const PARACHUTE_ACTIONS = ["disable", "enable", "release"] as const satisfies readonly ParachuteAction[];
export const GRIPPER_ACTIONS = ["release", "grab"] as const satisfies readonly GripperAction[];
export const WINCH_ACTIONS = ["relax", "length_control", "rate_control"] as const satisfies readonly WinchAction[];
export const YAW_DIRECTIONS = ["clockwise", "counter_clockwise"] as const satisfies readonly YawDirection[];

export const LOITER_DIRECTION_LABELS = {
    clockwise: "CW",
    counter_clockwise: "CCW",
} as const satisfies Record<LoiterDirection, string>;

export const ALT_CHANGE_ACTION_LABELS = {
    neutral: "Neutral",
    climb: "Climb",
    descend: "Descend",
} as const satisfies Record<AltChangeAction, string>;

export const SPEED_TYPE_LABELS = {
    airspeed: "Airspeed",
    groundspeed: "Ground Speed",
} as const satisfies Record<SpeedType, string>;

export const FENCE_ACTION_LABELS = {
    disable: "Disable",
    enable: "Enable",
    disable_floor: "Disable Floor",
} as const satisfies Record<FenceAction, string>;

export const PARACHUTE_ACTION_LABELS = {
    disable: "Disable",
    enable: "Enable",
    release: "Release",
} as const satisfies Record<ParachuteAction, string>;

export const GRIPPER_ACTION_LABELS = {
    release: "Release",
    grab: "Grab",
} as const satisfies Record<GripperAction, string>;

export const WINCH_ACTION_LABELS = {
    relax: "Relax",
    length_control: "Length Control",
    rate_control: "Rate Control",
} as const satisfies Record<WinchAction, string>;

export const YAW_DIRECTION_LABELS = {
    clockwise: "CW",
    counter_clockwise: "CCW",
} as const satisfies Record<YawDirection, string>;
