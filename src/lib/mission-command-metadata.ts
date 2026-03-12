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
  /**
   * Whether this field is supported by ArduPilot for this command.
   * `false` means the field exists in the MAVLink spec but ArduPilot
   * ignores it — the inspector should show it greyed/disabled.
   * Defaults to `true` when omitted.
   */
  supported?: boolean;
  /**
   * Whether this field should be hidden in the inspector for the
   * primary (Copter) editing context. Hidden fields are still
   * preserved in the MissionItem — they are just not shown.
   * Defaults to `false` when omitted.
   */
  hidden?: boolean;
  /**
   * Whether this field must have a meaningful (non-zero) value for the
   * command to be valid. Defaults to `false` when omitted.
   */
  required?: boolean;
  /**
   * Optional enumeration of valid discrete values.
   * Used for fields like "rel/abs" or "direction".
   */
  enumValues?: { value: number; label: string }[];
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
  },

  20: {
    id: 20,
    category: "navigation",
    summary: "Return to launch point (or nearest Rally Point) and land.",
    docsUrl: `${COPTER_CMD_LIST}#return-to-launch`,
    frame: FRAME_NONE,
    params: {},
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
    notes: ["Cancels any active DO_SET_ROI_LOCATION."],
  },

  252: {
    id: 252,
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
    notes: ["Set distance to 0 to stop distance-based triggering."],
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
    category: "do", // safe default — DO commands have no position effect
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
