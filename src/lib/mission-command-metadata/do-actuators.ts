import {
    COMMON_CMD_REF,
    COPTER_CMD_LIST,
    FENCE_ACTION_VALUES,
    FRAME_NONE,
    GRIPPER_ACTION_VALUES,
    PARACHUTE_ACTION_VALUES,
    WINCH_ACTION_VALUES,
} from "./shared";
import type { CommandMetadata } from "./types";

export const DO_ACTUATOR_COMMAND_IDS = [181, 182, 183, 184, 207, 208, 210, 211, 212, 216, 42600] as const;

export const DO_ACTUATOR_COMMAND_METADATA: Record<number, CommandMetadata> = {
    181: {
        id: 181,
        category: "do",
        summary: "Set a relay output to a specific state.",
        docsUrl: `${COPTER_CMD_LIST}#do-set-relay`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Relay #", description: "Relay index to update.", required: true },
            param2: { label: "State", description: "Desired relay state." },
        },
        typedFields: {
            number: {
                label: "Relay #",
                description: "Relay index to update.",
                required: true,
            },
            state: {
                label: "State",
                description: "Desired relay state.",
            },
        },
    },

    182: {
        id: 182,
        category: "do",
        summary: "Toggle a relay on a repeating cycle.",
        docsUrl: `${COPTER_CMD_LIST}#do-repeat-relay`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Relay #", description: "Relay index to toggle.", required: true },
            param2: { label: "Count", description: "Number of toggle cycles to run.", required: true },
            param3: { label: "Cycle Time", units: "s", description: "Seconds between toggles." },
        },
        typedFields: {
            number: {
                label: "Relay #",
                description: "Relay index to toggle.",
                required: true,
            },
            count: {
                label: "Count",
                description: "Number of toggle cycles to run.",
                required: true,
            },
            cycle_time_s: {
                label: "Cycle Time",
                units: "s",
                description: "Seconds between toggles.",
            },
        },
    },

    183: {
        id: 183,
        category: "do",
        summary: "Set a servo output to a target PWM value.",
        docsUrl: `${COPTER_CMD_LIST}#do-set-servo`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Channel", description: "Servo output channel.", required: true },
            param2: { label: "PWM", units: "µs", description: "Target PWM pulse width.", required: true },
        },
        typedFields: {
            channel: {
                label: "Channel",
                description: "Servo output channel.",
                required: true,
            },
            pwm: {
                label: "PWM",
                units: "µs",
                description: "Target PWM pulse width.",
                required: true,
            },
        },
    },

    184: {
        id: 184,
        category: "do",
        summary: "Drive a servo output through a repeated PWM cycle.",
        docsUrl: `${COPTER_CMD_LIST}#do-repeat-servo`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Channel", description: "Servo output channel.", required: true },
            param2: { label: "PWM", units: "µs", description: "Target PWM pulse width.", required: true },
            param3: { label: "Count", description: "Number of cycles to run.", required: true },
            param4: { label: "Cycle Time", units: "s", description: "Seconds between pulse changes." },
        },
        typedFields: {
            channel: {
                label: "Channel",
                description: "Servo output channel.",
                required: true,
            },
            pwm: {
                label: "PWM",
                units: "µs",
                description: "Target PWM pulse width.",
                required: true,
            },
            count: {
                label: "Count",
                description: "Number of cycles to run.",
                required: true,
            },
            cycle_time_s: {
                label: "Cycle Time",
                units: "s",
                description: "Seconds between pulse changes.",
            },
        },
    },

    207: {
        id: 207,
        category: "do",
        summary: "Enable or disable the fence system.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-fence-enable`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Action", description: "Fence action to apply." },
        },
        typedFields: {
            action: {
                label: "Action",
                description: "Fence action to apply.",
                enumValues: FENCE_ACTION_VALUES,
            },
        },
    },

    208: {
        id: 208,
        category: "do",
        summary: "Control the parachute system.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-parachute`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Action", description: "Parachute action to apply." },
        },
        typedFields: {
            action: {
                label: "Action",
                description: "Parachute action to apply.",
                enumValues: PARACHUTE_ACTION_VALUES,
            },
        },
        notes: ["Use Release only when the parachute system is armed and ready."],
    },

    210: {
        id: 210,
        category: "do",
        summary: "Enable or disable inverted flight.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-inverted-flight`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Inverted", description: "Whether inverted flight should be enabled." },
        },
        typedFields: {
            inverted: {
                label: "Inverted",
                description: "Whether inverted flight should be enabled.",
            },
        },
    },

    211: {
        id: 211,
        category: "do",
        summary: "Open or close a gripper output.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-gripper`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Gripper #", description: "Gripper index to control." },
            param2: { label: "Action", description: "Gripper action to apply." },
        },
        typedFields: {
            number: {
                label: "Gripper #",
                description: "Gripper index to control.",
            },
            action: {
                label: "Action",
                description: "Gripper action to apply.",
                enumValues: GRIPPER_ACTION_VALUES,
            },
        },
    },

    212: {
        id: 212,
        category: "do",
        summary: "Enable or disable the autotune controller.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-autotune-enable`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Enabled", description: "Whether autotune should be enabled." },
        },
        typedFields: {
            enabled: {
                label: "Enabled",
                description: "Whether autotune should be enabled.",
            },
        },
    },

    216: {
        id: 216,
        category: "do",
        summary: "Enable or disable the sprayer system.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-sprayer`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Enabled", description: "Whether the sprayer should be enabled." },
        },
        typedFields: {
            enabled: {
                label: "Enabled",
                description: "Whether the sprayer should be enabled.",
            },
        },
    },

    42600: {
        id: 42600,
        category: "do",
        summary: "Control a winch output and optional release profile.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-winch`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Winch #", description: "Winch instance to control." },
            param2: { label: "Action", description: "Winch action to apply." },
            param3: { label: "Release Length", units: "m", description: "Cable length to release." },
            param4: { label: "Release Rate", units: "m/s", description: "Cable release rate." },
        },
        typedFields: {
            number: { label: "Winch #", description: "Winch instance to control." },
            action: {
                label: "Action",
                description: "Winch action to apply.",
                enumValues: WINCH_ACTION_VALUES,
            },
            release_length_m: {
                label: "Release Length",
                units: "m",
                description: "Cable length to release.",
            },
            release_rate_mps: {
                label: "Release Rate",
                units: "m/s",
                description: "Cable release rate.",
            },
        },
    },
};
