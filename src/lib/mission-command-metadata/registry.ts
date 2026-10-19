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
    return Object.keys(COMMAND_METADATA).map(Number).sort((a, b) => a - b);
}

export { rawFallbackParams };
