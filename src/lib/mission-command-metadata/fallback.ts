import { MAV_CMD, commandFullName } from "../mav-commands";
import type { CommandMetadata } from "./types";

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
