import { COMMON_CMD_REF, COPTER_CMD_LIST, FRAME_NONE, FRAME_RELATIVE_ALT, SPEED_TYPE_VALUES } from "./shared";
import type { CommandMetadata } from "./types";

export const DO_MISSION_COMMAND_IDS = [177, 178, 179, 188, 189, 191, 193, 194, 215, 217, 218, 222, 223, 3000, 600, 601] as const;

export const DO_MISSION_COMMAND_METADATA: Record<number, CommandMetadata> = {
    177: {
        id: 177,
        category: "do",
        summary: "Jump to a waypoint and repeat a specified number of times.",
        docsUrl: `${COPTER_CMD_LIST}#do-jump`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Waypoint #", description: "Target waypoint sequence number (1-indexed).", required: true },
            param2: { label: "Repeat", description: "-1 = loop forever. 0 = advance immediately.", required: true },
        },
        typedFields: {
            target_index: {
                label: "Waypoint #",
                description: "Target waypoint sequence number (1-indexed).",
                required: true,
            },
            repeat_count: {
                label: "Repeat",
                description: "-1 = loop forever. 0 = advance immediately.",
                required: true,
            },
        },
        notes: [
            "Despite its name, DO_JUMP is treated as a NAV command — CONDITION commands do NOT gate it.",
            "Maximum 100 DO_JUMPs per mission (15 on boards with <500 KB RAM).",
        ],
    },

    178: {
        id: 178,
        category: "do",
        summary: "Change the target speed.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-change-speed`,
        frame: FRAME_NONE,
        params: {
            param1: {
                label: "Speed Type",
                description: "0 = airspeed, 1 = ground speed.",
                enumValues: [
                    { value: 0, label: "Airspeed" },
                    { value: 1, label: "Ground speed" },
                ],
            },
            param2: { label: "Speed", units: "m/s", description: "Target speed. -1 = no change.", required: true },
            param3: { label: "Throttle", units: "%", description: "Throttle percentage. -1 = no change." },
        },
        typedFields: {
            speed_type: {
                label: "Speed Type",
                description: "Speed reference used by the controller.",
                enumValues: SPEED_TYPE_VALUES,
            },
            speed_mps: {
                label: "Speed",
                units: "m/s",
                description: "Target speed. -1 = no change.",
                required: true,
            },
            throttle_pct: {
                label: "Throttle",
                units: "%",
                description: "Throttle percentage. -1 = no change.",
            },
        },
    },

    179: {
        id: 179,
        category: "do",
        summary: "Set the home position.",
        docsUrl: `${COPTER_CMD_LIST}#do-set-home`,
        frame: FRAME_RELATIVE_ALT,
        params: {
            param1: {
                label: "Use Current",
                description: "1 = use current location, 0 = use specified coordinates.",
                enumValues: [
                    { value: 1, label: "Current location" },
                    { value: 0, label: "Specified" },
                ],
            },
            x: { label: "Latitude", units: "degE7", description: "Only used when param1 = 0." },
            y: { label: "Longitude", units: "degE7", description: "Only used when param1 = 0." },
            z: { label: "Altitude", units: "m", description: "Only used when param1 = 0." },
        },
        typedFields: {
            use_current: {
                label: "Use Current",
                description: "Use the vehicle's current location instead of the supplied coordinates.",
            },
        },
        notes: ["Avoid if possible — use Rally Points instead."],
    },

    188: {
        id: 188,
        category: "do",
        summary: "Mark the start of a return path segment for later reuse.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-return-path-start`,
        frame: FRAME_RELATIVE_ALT,
        params: {
            x: { label: "Latitude", units: "degE7" },
            y: { label: "Longitude", units: "degE7" },
            z: { label: "Altitude", units: "m", description: "Reference altitude relative to home." },
        },
        typedFields: {},
    },

    189: {
        id: 189,
        category: "do",
        summary: "Mark the point where the landing sequence begins.",
        docsUrl: `${COPTER_CMD_LIST}#do-land-start`,
        frame: FRAME_RELATIVE_ALT,
        params: {
            x: { label: "Latitude", units: "degE7" },
            y: { label: "Longitude", units: "degE7" },
            z: { label: "Altitude", units: "m", description: "Landing-sequence reference altitude relative to home." },
        },
        typedFields: {},
        notes: ["This command is used by fixed-wing/VTOL landing flows to identify the start of the landing pattern."],
    },

    191: {
        id: 191,
        category: "do",
        summary: "Command a go-around point for an aborted landing.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-go-around`,
        frame: FRAME_RELATIVE_ALT,
        params: {
            x: { label: "Latitude", units: "degE7" },
            y: { label: "Longitude", units: "degE7" },
            z: { label: "Altitude", units: "m", description: "Go-around altitude relative to home." },
        },
        typedFields: {},
    },

    193: {
        id: 193,
        category: "do",
        summary: "Pause the mission or resume mission execution.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-pause-continue`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Pause", description: "Whether the mission should pause at this point." },
        },
        typedFields: {
            pause: {
                label: "Pause",
                description: "Whether the mission should pause at this point.",
            },
        },
    },

    194: {
        id: 194,
        category: "do",
        summary: "Allow or disallow reverse movement along the mission path.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-set-reverse`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Reverse", description: "Whether reverse movement should be enabled." },
        },
        typedFields: {
            reverse: {
                label: "Reverse",
                description: "Whether reverse movement should be enabled.",
            },
        },
    },

    215: {
        id: 215,
        category: "do",
        summary: "Set how far back the mission may resume after interruption.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-set-resume-repeat-dist`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Distance", units: "m", description: "Resume look-back distance.", required: true },
        },
        typedFields: {
            distance_m: {
                label: "Distance",
                units: "m",
                description: "Resume look-back distance.",
                required: true,
            },
        },
    },

    217: {
        id: 217,
        category: "do",
        summary: "Send a message payload to an onboard script.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-send-script-message`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "ID", description: "Script message identifier.", required: true },
            param2: { label: "P1", description: "Script message parameter 1." },
            param3: { label: "P2", description: "Script message parameter 2." },
            param4: { label: "P3", description: "Script message parameter 3." },
        },
        typedFields: {
            id: {
                label: "ID",
                description: "Script message identifier.",
                required: true,
            },
            p1: { label: "P1", description: "Script message parameter 1." },
            p2: { label: "P2", description: "Script message parameter 2." },
            p3: { label: "P3", description: "Script message parameter 3." },
        },
    },

    218: {
        id: 218,
        category: "do",
        summary: "Drive an auxiliary function to a switch position.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-aux-function`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Function", description: "Auxiliary function number." },
            param2: { label: "Switch Pos", description: "Requested switch position." },
        },
        typedFields: {
            function: {
                label: "Function",
                description: "Auxiliary function number.",
            },
            switch_pos: {
                label: "Switch Pos",
                description: "Requested switch position.",
            },
        },
    },

    222: {
        id: 222,
        category: "do",
        summary: "Set guided-mode time, altitude, and distance limits.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-guided-limits`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Max Time", units: "s", description: "Maximum guided-mode duration." },
            param2: { label: "Min Alt", units: "m", description: "Minimum allowed altitude." },
            param3: { label: "Max Alt", units: "m", description: "Maximum allowed altitude." },
            param4: { label: "Max Horiz", units: "m", description: "Maximum horizontal distance from the start point." },
        },
        typedFields: {
            max_time_s: { label: "Max Time", units: "s", description: "Maximum guided-mode duration." },
            min_alt_m: { label: "Min Alt", units: "m", description: "Minimum allowed altitude." },
            max_alt_m: { label: "Max Alt", units: "m", description: "Maximum allowed altitude." },
            max_horiz_m: { label: "Max Horiz", units: "m", description: "Maximum horizontal distance from the start point." },
        },
    },

    223: {
        id: 223,
        category: "do",
        summary: "Start or stop the engine with optional safety flags.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-engine-control`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Start", description: "Whether the engine should start." },
            param2: { label: "Cold Start", description: "Use cold-start behavior when starting." },
            param3: { label: "Height Delay", units: "m", description: "Delay start/stop until above this height." },
            param4: { label: "Allow Disarmed", description: "Permit engine control while disarmed." },
        },
        typedFields: {
            start: { label: "Start", description: "Whether the engine should start." },
            cold_start: { label: "Cold Start", description: "Use cold-start behavior when starting." },
            height_delay_m: {
                label: "Height Delay",
                units: "m",
                description: "Delay start/stop until above this height.",
            },
            allow_disarmed: {
                label: "Allow Disarmed",
                description: "Permit engine control while disarmed.",
            },
        },
    },

    3000: {
        id: 3000,
        category: "do",
        summary: "Transition a VTOL vehicle to a target flight state.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-vtol-transition`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Target State", description: "Vehicle-defined VTOL transition state." },
        },
        typedFields: {
            target_state: {
                label: "Target State",
                description: "Vehicle-defined VTOL transition state.",
            },
        },
    },

    600: {
        id: 600,
        category: "do",
        summary: "Create a mission tag that jump-tag commands can target.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-jump-tag`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Tag", description: "Mission tag identifier.", required: true },
        },
        typedFields: {
            tag: {
                label: "Tag",
                description: "Mission tag identifier.",
                required: true,
            },
        },
    },

    601: {
        id: 601,
        category: "do",
        summary: "Jump to a named mission tag and repeat a set number of times.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-jump-tag`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Tag", description: "Mission tag identifier to jump to.", required: true },
            param2: { label: "Repeat", description: "-1 = loop forever. 0 = advance immediately.", required: true },
        },
        typedFields: {
            tag: {
                label: "Tag",
                description: "Mission tag identifier to jump to.",
                required: true,
            },
            repeat_count: {
                label: "Repeat",
                description: "-1 = loop forever. 0 = advance immediately.",
                required: true,
            },
        },
    },
};
