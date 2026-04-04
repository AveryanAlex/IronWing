import { COPTER_CMD_LIST, FRAME_NONE, YAW_DIRECTION_VALUES } from "./shared";
import type { CommandMetadata } from "./types";

export const CONDITION_COMMAND_IDS = [112, 114, 115] as const;

export const CONDITION_COMMAND_METADATA: Record<number, CommandMetadata> = {
    112: {
        id: 112,
        category: "condition",
        summary: "Delay the next DO command by a number of seconds.",
        docsUrl: `${COPTER_CMD_LIST}#condition-delay`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Time", units: "s", description: "Seconds to delay.", required: true },
        },
        typedFields: {
            delay_s: {
                label: "Time",
                units: "s",
                description: "Seconds to delay.",
                required: true,
            },
        },
        notes: [
            "Does NOT stop the vehicle.",
            "Timer expires at the next waypoint — if the DO command hasn't fired by then, it is skipped.",
        ],
    },

    114: {
        id: 114,
        category: "condition",
        summary: "Delay the next DO command until within a distance of the next waypoint.",
        docsUrl: `${COPTER_CMD_LIST}#condition-distance`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Distance", units: "m", description: "Distance threshold in meters.", required: true },
        },
        typedFields: {
            distance_m: {
                label: "Distance",
                units: "m",
                description: "Distance threshold in meters.",
                required: true,
            },
        },
        notes: ["Does NOT stop the vehicle."],
    },

    115: {
        id: 115,
        category: "condition",
        summary: "Set the vehicle yaw to a specified heading.",
        docsUrl: `${COPTER_CMD_LIST}#condition-yaw`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Heading", units: "deg", description: "Target heading.", required: true },
            param2: { label: "Speed", units: "deg/s", description: "Rotation speed." },
            param3: {
                label: "Direction",
                description: "1 = CW, -1 = CCW, 0 = shortest path (absolute mode only).",
                enumValues: [
                    { value: 1, label: "CW" },
                    { value: -1, label: "CCW" },
                    { value: 0, label: "Shortest" },
                ],
            },
            param4: {
                label: "Reference",
                description: "0 = absolute heading, 1 = relative change.",
                enumValues: [
                    { value: 0, label: "Absolute" },
                    { value: 1, label: "Relative" },
                ],
            },
        },
        typedFields: {
            angle_deg: {
                label: "Heading",
                units: "deg",
                description: "Target heading.",
                required: true,
            },
            turn_rate_dps: {
                label: "Speed",
                units: "deg/s",
                description: "Rotation speed.",
            },
            direction: {
                label: "Direction",
                description: "Rotation direction.",
                enumValues: YAW_DIRECTION_VALUES,
            },
            relative: {
                label: "Relative",
                description: "Turn relative to current heading instead of absolute yaw.",
            },
        },
    },
};
