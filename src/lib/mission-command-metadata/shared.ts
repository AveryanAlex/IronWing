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
import type { FrameDescriptor, TypedFieldDescriptor } from "./types";

export const COPTER_CMD_LIST =
    "https://ardupilot.org/copter/docs/mission-command-list.html";
export const COMMON_CMD_REF =
    "https://ardupilot.org/planner/docs/common-mavlink-mission-command-messages-mav_cmd.html";

export const FRAME_RELATIVE_ALT: FrameDescriptor = {
    label: "Altitude Frame",
    hidden: true,
    description: "Altitude relative to home (global_relative_alt_int). Not user-editable for Copter.",
};

export const FRAME_NONE: FrameDescriptor = {
    label: "Frame",
    hidden: true,
    description: "No position component — frame is irrelevant.",
};

export const LOITER_DIRECTION_VALUES: NonNullable<TypedFieldDescriptor["enumValues"]> = LOITER_DIRECTIONS.map((value) => ({
    value,
    label: value === "Clockwise" ? "CW" : "CCW",
}));

export const SPEED_TYPE_VALUES: NonNullable<TypedFieldDescriptor["enumValues"]> = SPEED_TYPES.map((value) => ({
    value,
    label: value === "Groundspeed" ? "Ground Speed" : "Airspeed",
}));

export const YAW_DIRECTION_VALUES: NonNullable<TypedFieldDescriptor["enumValues"]> = YAW_DIRECTIONS.map((value) => ({
    value,
    label: value === "Clockwise" ? "CW" : "CCW",
}));

export const ALT_CHANGE_ACTION_VALUES: NonNullable<TypedFieldDescriptor["enumValues"]> = ALT_CHANGE_ACTIONS.map((value) => ({
    value,
    label: value,
}));

export const FENCE_ACTION_VALUES: NonNullable<TypedFieldDescriptor["enumValues"]> = FENCE_ACTIONS.map((value) => ({
    value,
    label: value === "DisableFloor" ? "Disable Floor" : value,
}));

export const PARACHUTE_ACTION_VALUES: NonNullable<TypedFieldDescriptor["enumValues"]> = PARACHUTE_ACTIONS.map((value) => ({
    value,
    label: value,
}));

export const GRIPPER_ACTION_VALUES: NonNullable<TypedFieldDescriptor["enumValues"]> = GRIPPER_ACTIONS.map((value) => ({
    value,
    label: value,
}));

export const WINCH_ACTION_VALUES: NonNullable<TypedFieldDescriptor["enumValues"]> = WINCH_ACTIONS.map((value) => ({
    value,
    label: value === "LengthControl" ? "Length Control" : value === "RateControl" ? "Rate Control" : "Relax",
}));
