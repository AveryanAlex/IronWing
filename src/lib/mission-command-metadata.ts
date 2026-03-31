import { pascalToDisplay } from "./mavkit-types";
import { MAV_CMD, commandFullName } from "./mav-commands";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Which MissionItem field a parameter descriptor maps to. */
export type ParamSlot = "param1" | "param2" | "param3" | "param4" | "x" | "y" | "z";

/**
 * Descriptor for a single parameter/field of a mission command.
 *
 * Used by the inspector (T10) to render labelled, typed inputs with
 * contextual help and validation hints.
 */
export type ParamDescriptor = {
    /** Human-readable label shown next to the input, e.g. "Hold (s)". */
    label: string;
    /** Unit suffix for display, e.g. "s", "m", "deg". */
    units?: string;
    /** Short help text shown as tooltip or inline hint. */
    description?: string;
    /** Whether this field is supported by ArduPilot for this command. */
    supported?: boolean;
    /** Whether this field should be hidden in the inspector. */
    hidden?: boolean;
    /** Whether this field must have a meaningful value for the command to be valid. */
    required?: boolean;
    /** Optional enumeration of valid discrete raw numeric values. */
    enumValues?: { value: number; label: string }[];
};

/**
 * Descriptor for a strongly-typed command struct field.
 *
 * Mirrors ParamDescriptor, but enum values are the string discriminants used by
 * the typed mavkit command structs rather than the raw numeric wire encoding.
 */
export type TypedFieldDescriptor = Omit<ParamDescriptor, "enumValues"> & {
    enumValues?: { value: string; label: string }[];
};

/**
 * Metadata for the `frame` field of a MissionItem.
 *
 * Most commands use `global_relative_alt_int` and the frame selector
 * should be hidden. Commands that support terrain-relative altitude
 * (Plane) or have no position component expose different defaults.
 */
export type FrameDescriptor = {
    label: string;
    hidden?: boolean;
    description?: string;
};

export type CatalogEntry = {
    variant: string;
    category: "Nav" | "Do" | "Condition";
    id: number;
    label: string;
};

/**
 * Full metadata for a single MAV_CMD used in mission planning.
 *
 * The `params` map is keyed by `ParamSlot` — only slots that are
 * meaningful for this command are included. Missing slots should not
 * be rendered in the inspector.
 */
export type CommandMetadata = {
    id: number;
    category: "navigation" | "condition" | "do";
    summary: string;
    docsUrl?: string;
    params: Partial<Record<ParamSlot, ParamDescriptor>>;
    typedFields?: Record<string, TypedFieldDescriptor>;
    frame?: FrameDescriptor;
    notes?: string[];
};

// ---------------------------------------------------------------------------
// Docs URL helpers
// ---------------------------------------------------------------------------

const COPTER_CMD_LIST =
    "https://ardupilot.org/copter/docs/mission-command-list.html";
const COMMON_CMD_REF =
    "https://ardupilot.org/planner/docs/common-mavlink-mission-command-messages-mav_cmd.html";

// ---------------------------------------------------------------------------
// Shared frame descriptors
// ---------------------------------------------------------------------------

const FRAME_RELATIVE_ALT: FrameDescriptor = {
    label: "Altitude Frame",
    hidden: true,
    description: "Altitude relative to home (global_relative_alt_int). Not user-editable for Copter.",
};

const FRAME_NONE: FrameDescriptor = {
    label: "Frame",
    hidden: true,
    description: "No position component — frame is irrelevant.",
};

// ---------------------------------------------------------------------------
// Shared typed enum values
// ---------------------------------------------------------------------------

const LOITER_DIRECTION_VALUES: NonNullable<TypedFieldDescriptor["enumValues"]> = [
    { value: "Clockwise", label: "CW" },
    { value: "CounterClockwise", label: "CCW" },
];

const SPEED_TYPE_VALUES: NonNullable<TypedFieldDescriptor["enumValues"]> = [
    { value: "Airspeed", label: "Airspeed" },
    { value: "Groundspeed", label: "Ground Speed" },
];

const YAW_DIRECTION_VALUES: NonNullable<TypedFieldDescriptor["enumValues"]> = [
    { value: "Clockwise", label: "CW" },
    { value: "CounterClockwise", label: "CCW" },
];

const ALT_CHANGE_ACTION_VALUES: NonNullable<TypedFieldDescriptor["enumValues"]> = [
    { value: "Neutral", label: "Neutral" },
    { value: "Climb", label: "Climb" },
    { value: "Descend", label: "Descend" },
];

const FENCE_ACTION_VALUES: NonNullable<TypedFieldDescriptor["enumValues"]> = [
    { value: "Disable", label: "Disable" },
    { value: "Enable", label: "Enable" },
    { value: "DisableFloor", label: "Disable Floor" },
];

const PARACHUTE_ACTION_VALUES: NonNullable<TypedFieldDescriptor["enumValues"]> = [
    { value: "Disable", label: "Disable" },
    { value: "Enable", label: "Enable" },
    { value: "Release", label: "Release" },
];

const GRIPPER_ACTION_VALUES: NonNullable<TypedFieldDescriptor["enumValues"]> = [
    { value: "Release", label: "Release" },
    { value: "Grab", label: "Grab" },
];

const WINCH_ACTION_VALUES: NonNullable<TypedFieldDescriptor["enumValues"]> = [
    { value: "Relax", label: "Relax" },
    { value: "LengthControl", label: "Length Control" },
    { value: "RateControl", label: "Rate Control" },
];

// ---------------------------------------------------------------------------
// Unified picker/catalog source of truth
// ---------------------------------------------------------------------------

function catalogEntry(category: CatalogEntry["category"], variant: string, id: number): CatalogEntry {
    return { category, variant, id, label: pascalToDisplay(variant) };
}

export const COMMAND_CATALOG: CatalogEntry[] = [
    // Nav (20)
    catalogEntry("Nav", "Waypoint", 16),
    catalogEntry("Nav", "SplineWaypoint", 82),
    catalogEntry("Nav", "ArcWaypoint", 36),
    catalogEntry("Nav", "Takeoff", 22),
    catalogEntry("Nav", "Land", 21),
    catalogEntry("Nav", "LoiterUnlimited", 17),
    catalogEntry("Nav", "LoiterTurns", 18),
    catalogEntry("Nav", "LoiterTime", 19),
    catalogEntry("Nav", "LoiterToAlt", 31),
    catalogEntry("Nav", "ContinueAndChangeAlt", 30),
    catalogEntry("Nav", "VtolTakeoff", 84),
    catalogEntry("Nav", "VtolLand", 85),
    catalogEntry("Nav", "PayloadPlace", 94),
    catalogEntry("Nav", "ReturnToLaunch", 20),
    catalogEntry("Nav", "Delay", 93),
    catalogEntry("Nav", "GuidedEnable", 92),
    catalogEntry("Nav", "AltitudeWait", 83),
    catalogEntry("Nav", "SetYawSpeed", 213),
    catalogEntry("Nav", "ScriptTime", 42702),
    catalogEntry("Nav", "AttitudeTime", 42703),

    // Do (42)
    catalogEntry("Do", "Jump", 177),
    catalogEntry("Do", "JumpTag", 601),
    catalogEntry("Do", "Tag", 600),
    catalogEntry("Do", "PauseContinue", 193),
    catalogEntry("Do", "ChangeSpeed", 178),
    catalogEntry("Do", "SetReverse", 194),
    catalogEntry("Do", "SetHome", 179),
    catalogEntry("Do", "LandStart", 189),
    catalogEntry("Do", "ReturnPathStart", 188),
    catalogEntry("Do", "GoAround", 191),
    catalogEntry("Do", "SetRoiLocation", 195),
    catalogEntry("Do", "SetRoi", 201),
    catalogEntry("Do", "SetRoiNone", 197),
    catalogEntry("Do", "MountControl", 205),
    catalogEntry("Do", "GimbalManagerPitchYaw", 1000),
    catalogEntry("Do", "CamTriggerDistance", 206),
    catalogEntry("Do", "ImageStartCapture", 2000),
    catalogEntry("Do", "ImageStopCapture", 2001),
    catalogEntry("Do", "VideoStartCapture", 2500),
    catalogEntry("Do", "VideoStopCapture", 2501),
    catalogEntry("Do", "SetCameraZoom", 531),
    catalogEntry("Do", "SetCameraFocus", 532),
    catalogEntry("Do", "SetCameraSource", 534),
    catalogEntry("Do", "DigicamConfigure", 202),
    catalogEntry("Do", "DigicamControl", 203),
    catalogEntry("Do", "SetServo", 183),
    catalogEntry("Do", "SetRelay", 181),
    catalogEntry("Do", "RepeatServo", 184),
    catalogEntry("Do", "RepeatRelay", 182),
    catalogEntry("Do", "FenceEnable", 207),
    catalogEntry("Do", "Parachute", 208),
    catalogEntry("Do", "Gripper", 211),
    catalogEntry("Do", "Sprayer", 216),
    catalogEntry("Do", "Winch", 42600),
    catalogEntry("Do", "EngineControl", 223),
    catalogEntry("Do", "InvertedFlight", 210),
    catalogEntry("Do", "AutotuneEnable", 212),
    catalogEntry("Do", "VtolTransition", 3000),
    catalogEntry("Do", "GuidedLimits", 222),
    catalogEntry("Do", "SetResumeRepeatDist", 215),
    catalogEntry("Do", "AuxFunction", 218),
    catalogEntry("Do", "SendScriptMessage", 217),

    // Condition (3)
    catalogEntry("Condition", "Delay", 112),
    catalogEntry("Condition", "Distance", 114),
    catalogEntry("Condition", "Yaw", 115),
];

const CATALOG_BY_VARIANT = new Map(
    COMMAND_CATALOG.map((entry) => [`${entry.category}:${entry.variant}`, entry] as const),
);
const CATALOG_BY_ID = new Map(COMMAND_CATALOG.map((entry) => [entry.id, entry] as const));

export function variantToCommandId(
    category: CatalogEntry["category"],
    variant: string,
): number | undefined {
    return CATALOG_BY_VARIANT.get(`${category}:${variant}`)?.id;
}

export function commandIdToVariant(id: number): CatalogEntry | undefined {
    const entry = CATALOG_BY_ID.get(id);
    return entry ? { ...entry } : undefined;
}

export function getCommandCatalog(): CatalogEntry[] {
    return COMMAND_CATALOG.map((entry) => ({ ...entry }));
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const COMMAND_METADATA: Record<number, CommandMetadata> = {
    // ── Navigation ──────────────────────────────────────────────────────

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
                description: "Time to hold at waypoint before advancing. Even 1 s causes a full stop.",
            },
            param2: {
                label: "Accept Radius",
                units: "m",
                description: "Not supported — use WP_RADIUS_M parameter instead.",
                supported: false,
            },
            param3: {
                label: "Pass Radius",
                units: "m",
                description: "Not supported by ArduPilot.",
                supported: false,
            },
            param4: {
                label: "Yaw",
                units: "deg",
                description: "Not supported — use CONDITION_YAW instead.",
                supported: false,
            },
            x: { label: "Latitude", units: "degE7", description: "0 = use current location." },
            y: { label: "Longitude", units: "degE7", description: "0 = use current location." },
            z: { label: "Altitude", units: "m", description: "Relative to home.", required: true },
        },
        typedFields: {
            hold_time_s: {
                label: "Hold",
                units: "s",
                description: "Time to hold at waypoint before advancing. Even 1 s causes a full stop.",
            },
            acceptance_radius_m: {
                label: "Accept Radius",
                units: "m",
                description: "Not supported — use WP_RADIUS_M parameter instead.",
                supported: false,
            },
            pass_radius_m: {
                label: "Pass Radius",
                units: "m",
                description: "Not supported by ArduPilot.",
                supported: false,
            },
            yaw_deg: {
                label: "Yaw",
                units: "deg",
                description: "Not supported — use CONDITION_YAW instead.",
                supported: false,
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

    // ── Condition ───────────────────────────────────────────────────────

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

    // ── Do ──────────────────────────────────────────────────────────────

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

    195: {
        id: 195,
        category: "do",
        summary: "Point the nose/gimbal at a location (persists until cleared).",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-set-roi-location`,
        frame: FRAME_RELATIVE_ALT,
        params: {
            x: { label: "Latitude", units: "degE7" },
            y: { label: "Longitude", units: "degE7" },
            z: { label: "Altitude", units: "m", description: "Relative to home." },
        },
        typedFields: {},
        notes: [
            "ROI persists until end of mission or until cleared with DO_SET_ROI_NONE.",
        ],
    },

    197: {
        id: 197,
        category: "do",
        summary: "Clear the current ROI (region of interest).",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-set-roi-none`,
        frame: FRAME_NONE,
        params: {},
        typedFields: {},
        notes: ["Cancels any active DO_SET_ROI_LOCATION."],
    },

    206: {
        id: 206,
        category: "do",
        summary: "Trigger the camera shutter at a distance interval.",
        docsUrl: `${COPTER_CMD_LIST}#do-set-cam-trigg-dist`,
        frame: FRAME_NONE,
        params: {
            param1: {
                label: "Distance",
                units: "m",
                required: true,
                description: "Trigger every N meters. 0 = stop triggering.",
            },
            param3: {
                label: "Trigger Once",
                description: "1 = trigger once immediately, 0 = off.",
                enumValues: [
                    { value: 1, label: "Yes" },
                    { value: 0, label: "No" },
                ],
            },
        },
        typedFields: {
            meters: {
                label: "Distance",
                units: "m",
                required: true,
                description: "Trigger every N meters. 0 = stop triggering.",
            },
            trigger_now: {
                label: "Trigger Once",
                description: "Trigger the shutter immediately when the command executes.",
            },
        },
        notes: ["Set distance to 0 to stop distance-based triggering."],
    },

    // ── Additional navigation coverage ─────────────────────────────────

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

    // ── Additional do coverage ─────────────────────────────────────────

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

    201: {
        id: 201,
        category: "do",
        summary: "Set a region-of-interest target with an explicit mode and location.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-set-roi`,
        frame: FRAME_RELATIVE_ALT,
        params: {
            param1: { label: "Mode", description: "ROI operating mode to use." },
            x: { label: "Latitude", units: "degE7" },
            y: { label: "Longitude", units: "degE7" },
            z: { label: "Altitude", units: "m", description: "ROI altitude relative to home." },
        },
        typedFields: {
            mode: {
                label: "Mode",
                description: "ROI operating mode to use.",
            },
        },
        notes: ["Like other ROI commands, this state persists until cleared or replaced."],
    },

    202: {
        id: 202,
        category: "do",
        summary: "Configure camera shooting parameters for a digital camera.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-digicam-configure`,
        frame: FRAME_NONE,
        params: {},
        typedFields: {
            shooting_mode: { label: "Shooting Mode", description: "Camera shooting mode selector." },
            shutter_speed: { label: "Shutter Speed", description: "Camera shutter speed setting." },
            aperture: { label: "Aperture", description: "Lens aperture setting." },
            iso: { label: "ISO", description: "Camera ISO sensitivity." },
            exposure_type: { label: "Exposure Type", description: "Exposure program selection." },
            cmd_id: { label: "Command ID", description: "Camera-specific command identifier." },
            cutoff_time: { label: "Cutoff Time", description: "Additional camera cutoff timing parameter." },
        },
    },

    203: {
        id: 203,
        category: "do",
        summary: "Issue an immediate digital camera control command.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-digicam-control`,
        frame: FRAME_NONE,
        params: {},
        typedFields: {
            session: { label: "Session", description: "Camera session control value." },
            zoom_pos: { label: "Zoom Position", description: "Absolute zoom position." },
            zoom_step: { label: "Zoom Step", description: "Relative zoom step command." },
            focus_lock: { label: "Focus Lock", description: "Whether focus should be locked." },
            shooting_cmd: { label: "Shooting Command", description: "Immediate shooting command value." },
            cmd_id: { label: "Command ID", description: "Camera-specific command identifier." },
        },
    },

    205: {
        id: 205,
        category: "do",
        summary: "Command gimbal mount pitch, roll, and yaw angles.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-mount-control`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Pitch", units: "deg", description: "Target mount pitch angle." },
            param2: { label: "Roll", units: "deg", description: "Target mount roll angle." },
            param3: { label: "Yaw", units: "deg", description: "Target mount yaw angle." },
        },
        typedFields: {
            pitch_deg: { label: "Pitch", units: "deg", description: "Target mount pitch angle." },
            roll_deg: { label: "Roll", units: "deg", description: "Target mount roll angle." },
            yaw_deg: { label: "Yaw", units: "deg", description: "Target mount yaw angle." },
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

    531: {
        id: 531,
        category: "do",
        summary: "Adjust the camera zoom mode and zoom amount.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-set-camera-zoom`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Zoom Type", description: "Camera zoom control mode." },
            param2: { label: "Zoom Value", description: "Zoom amount or level." },
        },
        typedFields: {
            zoom_type: { label: "Zoom Type", description: "Camera zoom control mode." },
            zoom_value: { label: "Zoom Value", description: "Zoom amount or level." },
        },
    },

    532: {
        id: 532,
        category: "do",
        summary: "Adjust the camera focus mode and focus amount.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-set-camera-focus`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Focus Type", description: "Camera focus control mode." },
            param2: { label: "Focus Value", description: "Focus amount or target." },
        },
        typedFields: {
            focus_type: { label: "Focus Type", description: "Camera focus control mode." },
            focus_value: { label: "Focus Value", description: "Focus amount or target." },
        },
    },

    534: {
        id: 534,
        category: "do",
        summary: "Select the active primary and secondary camera sources.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-set-camera-source`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Instance", description: "Camera instance to address." },
            param2: { label: "Primary", description: "Primary camera source." },
            param3: { label: "Secondary", description: "Secondary camera source." },
        },
        typedFields: {
            instance: { label: "Instance", description: "Camera instance to address." },
            primary: { label: "Primary", description: "Primary camera source." },
            secondary: { label: "Secondary", description: "Secondary camera source." },
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

    1000: {
        id: 1000,
        category: "do",
        summary: "Command a gimbal manager pitch/yaw target and rates.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-do-gimbal-manager-pitchyaw`,
        frame: FRAME_NONE,
        params: {},
        typedFields: {
            pitch_deg: { label: "Pitch", units: "deg", description: "Target gimbal pitch angle." },
            yaw_deg: { label: "Yaw", units: "deg", description: "Target gimbal yaw angle." },
            pitch_rate_dps: { label: "Pitch Rate", units: "deg/s", description: "Pitch slew rate limit." },
            yaw_rate_dps: { label: "Yaw Rate", units: "deg/s", description: "Yaw slew rate limit." },
            flags: { label: "Flags", description: "Gimbal-manager behavior flags." },
            gimbal_id: { label: "Gimbal ID", description: "Specific gimbal instance to control." },
        },
    },

    2000: {
        id: 2000,
        category: "do",
        summary: "Start an image capture sequence.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-image-start-capture`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Instance", description: "Camera instance to use." },
            param2: { label: "Interval", units: "s", description: "Time between captures." },
            param3: { label: "Total Images", description: "0 = capture until stopped." },
            param4: { label: "Start Number", description: "Image sequence start number." },
        },
        typedFields: {
            instance: { label: "Instance", description: "Camera instance to use." },
            interval_s: { label: "Interval", units: "s", description: "Time between captures." },
            total_images: { label: "Total Images", description: "0 = capture until stopped." },
            start_number: { label: "Start Number", description: "Image sequence start number." },
        },
    },

    2001: {
        id: 2001,
        category: "do",
        summary: "Stop an active image capture sequence.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-image-stop-capture`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Instance", description: "Camera instance to stop." },
        },
        typedFields: {
            instance: { label: "Instance", description: "Camera instance to stop." },
        },
    },

    2500: {
        id: 2500,
        category: "do",
        summary: "Start video capture on a stream.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-video-start-capture`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Stream ID", description: "Video stream identifier." },
        },
        typedFields: {
            stream_id: { label: "Stream ID", description: "Video stream identifier." },
        },
    },

    2501: {
        id: 2501,
        category: "do",
        summary: "Stop video capture on a stream.",
        docsUrl: `${COMMON_CMD_REF}#mav-cmd-video-stop-capture`,
        frame: FRAME_NONE,
        params: {
            param1: { label: "Stream ID", description: "Video stream identifier." },
        },
        typedFields: {
            stream_id: { label: "Stream ID", description: "Video stream identifier." },
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Look up rich metadata for a mission command.
 * Returns `undefined` for unmapped commands — use `rawFallbackParams()`
 * to get generic descriptors for those.
 */
export function getCommandMetadata(cmd: number): CommandMetadata | undefined {
    return COMMAND_METADATA[cmd];
}

/**
 * Generate generic "Param 1" … "Param 4" + coordinate descriptors
 * for any command that lacks a dedicated metadata entry.
 *
 * The returned object always includes all 7 slots so the inspector
 * can render a complete editing row for unknown commands.
 */
export function rawFallbackParams(cmd: number): CommandMetadata {
    const entry = MAV_CMD[cmd];
    const name = entry?.name ?? `MAV_CMD_${cmd}`;
    return {
        id: cmd,
        category: "do",
        summary: `${commandFullName(cmd)} (no detailed metadata available)`,
        params: {
            param1: { label: "Param 1" },
            param2: { label: "Param 2" },
            param3: { label: "Param 3" },
            param4: { label: "Param 4" },
            x: { label: "Latitude", units: "degE7" },
            y: { label: "Longitude", units: "degE7" },
            z: { label: "Altitude", units: "m" },
        },
        notes: [`Raw parameter view for ${name}. Refer to MAVLink documentation for field semantics.`],
    };
}

/**
 * Resolve metadata for any command — returns rich metadata when
 * available, raw fallback otherwise. Never returns `undefined`.
 */
export function resolveCommandMetadata(cmd: number): CommandMetadata {
    return COMMAND_METADATA[cmd] ?? rawFallbackParams(cmd);
}

/**
 * List all command IDs that have dedicated metadata entries.
 */
export function mappedCommandIds(): number[] {
    return Object.keys(COMMAND_METADATA).map(Number);
}
