import {
    ALT_CHANGE_ACTION_VALUES,
    COMMON_CMD_REF,
    COPTER_CMD_LIST,
    FRAME_NONE,
    FRAME_RELATIVE_ALT,
    LOITER_DIRECTION_VALUES,
} from "./shared";
import type { CommandMetadata } from "./types";

export const NAVIGATION_COMMAND_IDS = [16, 82, 36, 22, 21, 17, 18, 19, 31, 30, 84, 85, 94, 20, 93, 92, 83, 213, 42702, 42703] as const;

export const NAVIGATION_COMMAND_METADATA: Record<number, CommandMetadata> = {
    16: {
        id: 16,
        category: "navigation",
        summary: "Fly to a waypoint, optionally hold for a delay.",
        docsUrl: `${COPTER_CMD_LIST}#waypoint`,
        frame: FRAME_RELATIVE_ALT,
        params: {
            param1: {
                label: "Hold",
                units: "s",
                description: "Time to hold at waypoint before advancing. 0 = fly through without stopping.",
            },
            param2: {
                label: "Accept Radius",
                units: "m",
                description: "Acceptance radius for reaching the waypoint. On Copter, use WP_RADIUS parameter instead.",
            },
            param3: {
                label: "Pass Radius",
                units: "m",
                description: "Fly-by radius. Positive = fly through, negative = loiter and orbit. Plane only.",
            },
            param4: {
                label: "Yaw",
                units: "deg",
                description: "Target yaw angle at waypoint. On Copter, use CONDITION_YAW command instead.",
            },
            x: { label: "Latitude", units: "degE7", description: "0 = use current location." },
            y: { label: "Longitude", units: "degE7", description: "0 = use current location." },
            z: { label: "Altitude", units: "m", description: "Relative to home.", required: true },
        },
        typedFields: {
            hold_time_s: {
                label: "Hold",
                units: "s",
                description: "Time to hold at waypoint before advancing. 0 = fly through without stopping.",
            },
            acceptance_radius_m: {
                label: "Accept Radius",
                units: "m",
                description: "Acceptance radius for reaching the waypoint. On Copter, use WP_RADIUS parameter instead.",
            },
            pass_radius_m: {
                label: "Pass Radius",
                units: "m",
                description: "Fly-by radius. Positive = fly through, negative = loiter and orbit. Plane only.",
            },
            yaw_deg: {
                label: "Yaw",
                units: "deg",
                description: "Target yaw angle at waypoint. On Copter, use CONDITION_YAW command instead.",
            },
        },
        notes: [
            "Without a delay, the waypoint is considered complete when the virtual chase-point reaches it — the vehicle may begin turning 10 m+ before physically arriving.",
            "Lat/Lon = 0 substitutes the vehicle's current location.",
        ],
    },

    22: {
        id: 22,
        category: "navigation",
        summary: "Climb straight up to the specified altitude.",
        docsUrl: `${COPTER_CMD_LIST}#takeoff`,
        frame: FRAME_RELATIVE_ALT,
        params: {
            param1: { label: "Pitch", units: "deg", hidden: true, description: "Minimum pitch (Plane only)." },
            x: { label: "Latitude", hidden: true },
            y: { label: "Longitude", hidden: true },
            z: { label: "Altitude", units: "m", description: "Target altitude relative to home.", required: true },
        },
        typedFields: {
            pitch_deg: {
                label: "Pitch",
                units: "deg",
                hidden: true,
                description: "Minimum pitch (Plane only).",
            },
        },
        notes: [
            "If the vehicle is already above this altitude, the command is skipped immediately (and any following DO commands are also skipped).",
        ],
    },

    21: {
        id: 21,
        category: "navigation",
        summary: "Land at the specified location or in place.",
        docsUrl: `${COPTER_CMD_LIST}#land`,
        frame: FRAME_RELATIVE_ALT,
        params: {
            x: { label: "Latitude", units: "degE7", description: "0 = land in place." },
            y: { label: "Longitude", units: "degE7", description: "0 = land in place." },
            z: { label: "Altitude", units: "m", hidden: true, description: "Ignored for landing." },
        },
        typedFields: {
            abort_alt_m: {
                label: "Abort Altitude",
                units: "m",
                hidden: true,
                description: "Go-around altitude. Not used in the primary Copter landing flow.",
            },
        },
        notes: ["Lat/Lon = 0 means land at the current location."],
    },

    17: {
        id: 17,
        category: "navigation",
        summary: "Fly to a location and loiter indefinitely.",
        docsUrl: `${COPTER_CMD_LIST}#loiter_unlim`,
        frame: FRAME_RELATIVE_ALT,
        params: {
            x: { label: "Latitude", units: "degE7" },
            y: { label: "Longitude", units: "degE7" },
            z: { label: "Altitude", units: "m", description: "Relative to home.", required: true },
        },
        typedFields: {
            radius_m: {
                label: "Radius",
                units: "m",
                description: "0 = pirouette. Direction selects CW or CCW orbit.",
            },
            direction: {
                label: "Direction",
                description: "Orbit direction.",
                enumValues: LOITER_DIRECTION_VALUES,
            },
        },
        notes: ["The mission does NOT advance past this command."],
    },

    18: {
        id: 18,
        category: "navigation",
        summary: "Circle a location for a specified number of turns.",
        docsUrl: `${COPTER_CMD_LIST}#loiter_turns`,
        frame: FRAME_RELATIVE_ALT,
        params: {
            param1: {
                label: "Turns",
                required: true,
                description: "Number of turns. Fractional 0–1 ok; >1 must be integer.",
            },
            param3: {
                label: "Radius",
                units: "m",
                description: "0 = pirouette. Negative = CCW. >255 m rounded to nearest 10 m.",
            },
            x: { label: "Latitude", units: "degE7" },
            y: { label: "Longitude", units: "degE7" },
            z: { label: "Altitude", units: "m", description: "Relative to home.", required: true },
        },
        typedFields: {
            turns: {
                label: "Turns",
                required: true,
                description: "Number of turns. Fractional 0–1 ok; >1 must be integer.",
            },
            radius_m: {
                label: "Radius",
                units: "m",
                description: "0 = pirouette. Direction selects CW or CCW orbit.",
            },
            direction: {
                label: "Direction",
                description: "Orbit direction.",
                enumValues: LOITER_DIRECTION_VALUES,
            },
            exit_xtrack: {
                label: "Exit Crosstrack",
                description: "Leave the circle aligned with the next leg instead of tangentially.",
            },
        },
    },

    19: {
        id: 19,
        category: "navigation",
        summary: "Fly to a location and loiter for a specified time.",
        docsUrl: `${COPTER_CMD_LIST}#loiter_time`,
        frame: FRAME_RELATIVE_ALT,
        params: {
            param1: { label: "Time", units: "s", description: "Loiter duration in seconds.", required: true },
            x: { label: "Latitude", units: "degE7" },
            y: { label: "Longitude", units: "degE7" },
            z: { label: "Altitude", units: "m", description: "Relative to home.", required: true },
        },
        typedFields: {
            time_s: {
                label: "Time",
                units: "s",
                description: "Loiter duration in seconds.",
                required: true,
            },
            direction: {
                label: "Direction",
                description: "Orbit direction.",
                enumValues: LOITER_DIRECTION_VALUES,
            },
            exit_xtrack: {
                label: "Exit Crosstrack",
                description: "Leave the circle aligned with the next leg instead of tangentially.",
            },
        },
    },

    20: {
        id: 20,
        category: "navigation",
        summary: "Return to launch point (or nearest Rally Point) and land.",
        docsUrl: `${COPTER_CMD_LIST}#return-to-launch`,
        frame: FRAME_NONE,
        params: {},
        typedFields: {},
        notes: [
            "Vehicle climbs to RTL_ALT first (default 15 m), then flies home.",
            "Returns to nearest Rally Point if one is closer than home.",
        ],
    },

    82: {
        id: 82,
        category: "navigation",
        summary: "Fly a smooth spline path through this waypoint.",
        docsUrl: `${COPTER_CMD_LIST}#spline-waypoint`,
        frame: FRAME_RELATIVE_ALT,
        params: {
            param1: {
                label: "Hold",
                units: "s",
                description: "Time to hold at waypoint before advancing.",
            },
            x: { label: "Latitude", units: "degE7" },
            y: { label: "Longitude", units: "degE7" },
            z: { label: "Altitude", units: "m", description: "Relative to home.", required: true },
        },
        typedFields: {
            hold_time_s: {
                label: "Hold",
                units: "s",
                description: "Time to hold at waypoint before advancing.",
            },
        },
    },

    93: {
        id: 93,
        category: "navigation",
        summary: "Delay the mission for a specified time or until a clock time.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-nav-delay`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Delay", units: "s", description: "Delay in seconds (-1 to use clock time).", required: true },
            param2: { label: "Hour", description: "Target hour (UTC, 24h). -1 = ignore." },
            param3: { label: "Minute", description: "Target minute. -1 = ignore." },
            param4: { label: "Second", description: "Target second. -1 = ignore." },
        },
        typedFields: {
            seconds: {
                label: "Delay",
                units: "s",
                description: "Delay in seconds (-1 to use clock time).",
                required: true,
            },
            hour_utc: {
                label: "Hour",
                description: "Target hour (UTC, 24h). -1 = ignore.",
            },
            min_utc: {
                label: "Minute",
                description: "Target minute. -1 = ignore.",
            },
            sec_utc: {
                label: "Second",
                description: "Target second. -1 = ignore.",
            },
        },
    },

    30: {
        id: 30,
        category: "navigation",
        summary: "Continue on the current track while changing altitude.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-nav-continue-and-change-alt`,
        frame: FRAME_RELATIVE_ALT,
        params: {
            param1: { label: "Action", description: "Altitude change behavior during the transit." },
            x: { label: "Latitude", units: "degE7" },
            y: { label: "Longitude", units: "degE7" },
            z: { label: "Altitude", units: "m", description: "Target altitude relative to home.", required: true },
        },
        typedFields: {
            action: {
                label: "Action",
                description: "Altitude change behavior during the transit leg.",
                enumValues: ALT_CHANGE_ACTION_VALUES,
            },
        },
        notes: ["Uses the supplied position and altitude as the end state of the transition leg."],
    },

    31: {
        id: 31,
        category: "navigation",
        summary: "Climb or descend while orbiting until the requested altitude is reached.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-nav-loiter-to-alt`,
        frame: FRAME_RELATIVE_ALT,
        params: {
            param1: { label: "Radius", units: "m", description: "Orbit radius. 0 = pirouette." },
            x: { label: "Latitude", units: "degE7" },
            y: { label: "Longitude", units: "degE7" },
            z: { label: "Altitude", units: "m", description: "Target altitude relative to home.", required: true },
        },
        typedFields: {
            radius_m: {
                label: "Radius",
                units: "m",
                description: "Orbit radius. 0 = pirouette.",
            },
            direction: {
                label: "Direction",
                description: "Orbit direction while climbing or descending.",
                enumValues: LOITER_DIRECTION_VALUES,
            },
            exit_xtrack: {
                label: "Exit Crosstrack",
                description: "Leave the orbit aligned with the next leg instead of tangentially.",
            },
        },
    },

    36: {
        id: 36,
        category: "navigation",
        summary: "Fly an arc to the target position instead of a straight-line leg.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-nav-pathplanning`,
        frame: FRAME_RELATIVE_ALT,
        params: {
            param1: { label: "Arc Angle", units: "deg", description: "Signed sweep angle used to shape the arc." },
            x: { label: "Latitude", units: "degE7" },
            y: { label: "Longitude", units: "degE7" },
            z: { label: "Altitude", units: "m", description: "Target altitude relative to home.", required: true },
        },
        typedFields: {
            arc_angle_deg: {
                label: "Arc Angle",
                units: "deg",
                description: "Signed sweep angle used to shape the arc.",
            },
            direction: {
                label: "Direction",
                description: "Preferred turn direction when resolving the arc.",
                enumValues: LOITER_DIRECTION_VALUES,
            },
        },
    },

    83: {
        id: 83,
        category: "navigation",
        summary: "Wait for the aircraft to settle at an altitude window before advancing.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-nav-altitude-wait`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Altitude", units: "m", description: "Altitude threshold to satisfy.", required: true },
            param2: { label: "Descent Rate", units: "m/s", description: "Expected descent rate while waiting." },
            param3: { label: "Wiggle Time", units: "s", description: "Extra time to hold once the target is reached." },
        },
        typedFields: {
            altitude_m: {
                label: "Altitude",
                units: "m",
                description: "Altitude threshold to satisfy.",
                required: true,
            },
            descent_rate_mps: {
                label: "Descent Rate",
                units: "m/s",
                description: "Expected descent rate while waiting.",
            },
            wiggle_time_s: {
                label: "Wiggle Time",
                units: "s",
                description: "Extra time to hold once the target is reached.",
            },
        },
    },

    84: {
        id: 84,
        category: "navigation",
        summary: "Perform a VTOL takeoff to the requested position and altitude.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-nav-vtol-takeoff`,
        frame: FRAME_RELATIVE_ALT,
        params: {
            x: { label: "Latitude", units: "degE7" },
            y: { label: "Longitude", units: "degE7" },
            z: { label: "Altitude", units: "m", description: "Target altitude relative to home.", required: true },
        },
        typedFields: {},
        notes: ["Use when the vehicle should take off in VTOL mode before continuing the mission."],
    },

    85: {
        id: 85,
        category: "navigation",
        summary: "Perform a VTOL landing at the requested position.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-nav-vtol-land`,
        frame: FRAME_RELATIVE_ALT,
        params: {
            param1: { label: "Options", description: "Vehicle-specific VTOL landing option bits." },
            x: { label: "Latitude", units: "degE7" },
            y: { label: "Longitude", units: "degE7" },
            z: { label: "Altitude", units: "m", description: "Landing altitude reference relative to home." },
        },
        typedFields: {
            options: {
                label: "Options",
                description: "Vehicle-specific VTOL landing option bits.",
            },
        },
    },

    92: {
        id: 92,
        category: "navigation",
        summary: "Enable or disable guided mode progression from the mission.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-nav-guided-enable`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Enabled", description: "Whether guided mode should be enabled." },
        },
        typedFields: {
            enabled: {
                label: "Enabled",
                description: "Whether guided mode should be enabled.",
            },
        },
    },

    94: {
        id: 94,
        category: "navigation",
        summary: "Descend to place a payload, then release it at the target location.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-nav-payload-place`,
        frame: FRAME_RELATIVE_ALT,
        params: {
            param1: { label: "Max Descent", units: "m", description: "Maximum additional descent allowed while placing." },
            x: { label: "Latitude", units: "degE7" },
            y: { label: "Longitude", units: "degE7" },
            z: { label: "Altitude", units: "m", description: "Approach altitude relative to home.", required: true },
        },
        typedFields: {
            max_descent_m: {
                label: "Max Descent",
                units: "m",
                description: "Maximum additional descent allowed while placing.",
            },
        },
    },

    213: {
        id: 213,
        category: "navigation",
        summary: "Set a target yaw and forward speed for the navigation leg.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-nav-set-yaw-speed`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Yaw", units: "deg", description: "Target yaw angle.", required: true },
            param2: { label: "Speed", units: "m/s", description: "Requested speed along the leg." },
            param3: { label: "Relative", description: "Interpret yaw as a relative offset instead of absolute." },
        },
        typedFields: {
            angle_deg: {
                label: "Yaw",
                units: "deg",
                description: "Target yaw angle.",
                required: true,
            },
            speed_mps: {
                label: "Speed",
                units: "m/s",
                description: "Requested speed along the leg.",
            },
            relative: {
                label: "Relative",
                description: "Interpret yaw as a relative offset instead of absolute.",
            },
        },
    },

    42702: {
        id: 42702,
        category: "navigation",
        summary: "Run a script-controlled navigation action with timeout and four numeric arguments.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-nav-script-time`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Command", description: "Script command identifier.", required: true },
            param2: { label: "Timeout", units: "s", description: "Maximum run time before timeout." },
            param3: { label: "Arg 1", description: "Script argument 1." },
            param4: { label: "Arg 2", description: "Script argument 2." },
            x: { label: "Arg 3", description: "Script argument 3." },
            y: { label: "Arg 4", description: "Script argument 4." },
        },
        typedFields: {
            command: {
                label: "Command",
                description: "Script command identifier.",
                required: true,
            },
            timeout_s: {
                label: "Timeout",
                units: "s",
                description: "Maximum run time before timeout.",
            },
            arg1: { label: "Arg 1", description: "Script argument 1." },
            arg2: { label: "Arg 2", description: "Script argument 2." },
            arg3: { label: "Arg 3", description: "Script argument 3." },
            arg4: { label: "Arg 4", description: "Script argument 4." },
        },
    },

    42703: {
        id: 42703,
        category: "navigation",
        summary: "Hold an attitude target for a fixed time with an optional climb rate.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-nav-attitude-time`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Time", units: "s", description: "How long to hold the requested attitude.", required: true },
            param2: { label: "Roll", units: "deg", description: "Target roll angle." },
            param3: { label: "Pitch", units: "deg", description: "Target pitch angle." },
            param4: { label: "Yaw", units: "deg", description: "Target yaw angle." },
            x: { label: "Climb Rate", units: "m/s", description: "Requested climb or descent rate." },
        },
        typedFields: {
            time_s: {
                label: "Time",
                units: "s",
                description: "How long to hold the requested attitude.",
                required: true,
            },
            roll_deg: { label: "Roll", units: "deg", description: "Target roll angle." },
            pitch_deg: { label: "Pitch", units: "deg", description: "Target pitch angle." },
            yaw_deg: { label: "Yaw", units: "deg", description: "Target yaw angle." },
            climb_rate_mps: {
                label: "Climb Rate",
                units: "m/s",
                description: "Requested climb or descent rate.",
            },
        },
    },
};
