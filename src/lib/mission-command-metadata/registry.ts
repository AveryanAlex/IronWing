export type {
    CatalogEntry,
    CommandMetadata,
    FrameDescriptor,
    ParamDescriptor,
    ParamSlot,
    TypedFieldDescriptor,
} from "./types";

export {
    COMMAND_CATALOG,
    commandIdToVariant,
    getCommandCatalog,
    variantToCommandId,
} from "./catalog";

import { CONDITION_COMMAND_METADATA } from "./condition";
import { DO_ACTUATOR_COMMAND_METADATA } from "./do-actuators";
import { DO_CAMERA_COMMAND_METADATA } from "./do-camera";
import { DO_MISSION_COMMAND_METADATA } from "./do-mission";
import { rawFallbackParams } from "./fallback";
import { NAVIGATION_COMMAND_METADATA } from "./navigation";
import type { CommandMetadata } from "./types";

const COMMAND_METADATA: Record<number, CommandMetadata> = {
    ...NAVIGATION_COMMAND_METADATA,
    ...CONDITION_COMMAND_METADATA,
    ...DO_MISSION_COMMAND_METADATA,
    ...DO_CAMERA_COMMAND_METADATA,
    ...DO_ACTUATOR_COMMAND_METADATA,
};

const MAPPED_COMMAND_IDS = [
    16, 22, 21, 17, 18, 19, 20, 82, 93,
    112, 114, 115,
    177, 178, 179, 195, 197, 206,
    30, 31, 36, 83, 84, 85, 92, 94, 213, 42702, 42703,
    181, 182, 183, 184, 188, 189, 191, 193, 194, 201, 202, 203, 205,
    207, 208, 210, 211, 212, 215, 216, 217, 218, 222, 223, 531, 532, 534,
    600, 601, 1000, 2000, 2001, 2500, 2501, 3000, 42600,
] as const;

/**
 * Look up rich metadata for a mission command.
 * Returns `undefined` for unmapped commands — use `rawFallbackParams()`
 * to get generic descriptors for those.
 */
export function getCommandMetadata(cmd: number): CommandMetadata | undefined {
    return COMMAND_METADATA[cmd];
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
    return [...MAPPED_COMMAND_IDS];
}

export { rawFallbackParams };
