import {
    ALT_CHANGE_ACTIONS,
    ALT_CHANGE_ACTION_LABELS,
    FENCE_ACTIONS,
    FENCE_ACTION_LABELS,
    GRIPPER_ACTIONS,
    GRIPPER_ACTION_LABELS,
    LOITER_DIRECTIONS,
    LOITER_DIRECTION_LABELS,
    PARACHUTE_ACTIONS,
    PARACHUTE_ACTION_LABELS,
    SPEED_TYPES,
    SPEED_TYPE_LABELS,
    WINCH_ACTIONS,
    WINCH_ACTION_LABELS,
    YAW_DIRECTIONS,
    YAW_DIRECTION_LABELS,
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
    label: LOITER_DIRECTION_LABELS[value],
}));

export const SPEED_TYPE_VALUES: NonNullable<TypedFieldDescriptor["enumValues"]> = SPEED_TYPES.map((value) => ({
    value,
    label: SPEED_TYPE_LABELS[value],
}));

export const YAW_DIRECTION_VALUES: NonNullable<TypedFieldDescriptor["enumValues"]> = YAW_DIRECTIONS.map((value) => ({
    value,
    label: YAW_DIRECTION_LABELS[value],
}));

export const ALT_CHANGE_ACTION_VALUES: NonNullable<TypedFieldDescriptor["enumValues"]> = ALT_CHANGE_ACTIONS.map((value) => ({
    value,
    label: ALT_CHANGE_ACTION_LABELS[value],
}));

export const FENCE_ACTION_VALUES: NonNullable<TypedFieldDescriptor["enumValues"]> = FENCE_ACTIONS.map((value) => ({
    value,
    label: FENCE_ACTION_LABELS[value],
}));

export const PARACHUTE_ACTION_VALUES: NonNullable<TypedFieldDescriptor["enumValues"]> = PARACHUTE_ACTIONS.map((value) => ({
    value,
    label: PARACHUTE_ACTION_LABELS[value],
}));

export const GRIPPER_ACTION_VALUES: NonNullable<TypedFieldDescriptor["enumValues"]> = GRIPPER_ACTIONS.map((value) => ({
    value,
    label: GRIPPER_ACTION_LABELS[value],
}));

export const WINCH_ACTION_VALUES: NonNullable<TypedFieldDescriptor["enumValues"]> = WINCH_ACTIONS.map((value) => ({
    value,
    label: WINCH_ACTION_LABELS[value],
}));
