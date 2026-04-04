import {
    ALT_CHANGE_ACTIONS,
    FENCE_ACTIONS,
    GRIPPER_ACTIONS,
    LOITER_DIRECTIONS,
    PARACHUTE_ACTIONS,
    SPEED_TYPES,
    WINCH_ACTIONS,
} from "../mission-command-enums";
import { pascalToDisplay } from "../mission-command-names";
import type { ConditionCommand, DoCommand, GeoPoint3d, MissionCommand, NavCommand } from "./mission-types";

function variantPayload(command: NavCommand | DoCommand | ConditionCommand): Record<string, unknown> | null {
    if (typeof command === "string") {
        return null;
    }

    const payload = Object.values(command)[0];
    return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
}

export function commandPosition(cmd: MissionCommand): GeoPoint3d | null {
    if ("Nav" in cmd) {
        const payload = variantPayload(cmd.Nav);
        if (payload && "position" in payload) {
            return payload.position as GeoPoint3d;
        }
        return null;
    }

    if ("Do" in cmd) {
        const payload = variantPayload(cmd.Do);
        if (payload && "position" in payload) {
            return payload.position as GeoPoint3d;
        }
        return null;
    }

    return null;
}

export function commandHasPosition(cmd: MissionCommand): boolean {
    return commandPosition(cmd) !== null;
}

export function commandCategory(
    cmd: MissionCommand,
): "nav" | "do" | "condition" | "other" {
    if ("Nav" in cmd) return "nav";
    if ("Do" in cmd) return "do";
    if ("Condition" in cmd) return "condition";
    return "other";
}

export function commandDisplayName(cmd: MissionCommand): string {
    if ("Nav" in cmd) {
        const nav = cmd.Nav;
        if (typeof nav === "string") return pascalToDisplay(nav);
        const key = Object.keys(nav)[0];
        return pascalToDisplay(key);
    }
    if ("Do" in cmd) {
        const d = cmd.Do;
        if (typeof d === "string") return pascalToDisplay(d);
        const key = Object.keys(d)[0];
        return pascalToDisplay(key);
    }
    if ("Condition" in cmd) {
        const c = cmd.Condition;
        const key = Object.keys(c)[0];
        return pascalToDisplay(key);
    }
    if ("Other" in cmd) {
        return `Command #${cmd.Other.command}`;
    }
    return "Unknown";
}

export function withCommandField(
    cmd: MissionCommand,
    fieldKey: string,
    value: unknown,
): MissionCommand {
    if ("Nav" in cmd) {
        const nav = cmd.Nav;
        if (typeof nav === "string") return cmd;
        const variantKey = Object.keys(nav)[0] as string;
        const inner = (nav as Record<string, Record<string, unknown>>)[variantKey];
        if (inner && fieldKey in inner) {
            return { Nav: { [variantKey]: { ...inner, [fieldKey]: value } } as unknown as NavCommand };
        }
        return cmd;
    }
    if ("Do" in cmd) {
        const d = cmd.Do;
        if (typeof d === "string") return cmd;
        const variantKey = Object.keys(d)[0] as string;
        const inner = (d as Record<string, Record<string, unknown>>)[variantKey];
        if (inner && fieldKey in inner) {
            return { Do: { [variantKey]: { ...inner, [fieldKey]: value } } as unknown as DoCommand };
        }
        return cmd;
    }
    if ("Condition" in cmd) {
        const c = cmd.Condition;
        const variantKey = Object.keys(c)[0] as string;
        const inner = (c as Record<string, Record<string, unknown>>)[variantKey];
        if (inner && fieldKey in inner) {
            return { Condition: { [variantKey]: { ...inner, [fieldKey]: value } } as unknown as ConditionCommand };
        }
        return cmd;
    }
    return cmd;
}

/** @deprecated Legacy field-level enum map retained for compatibility. */
export const COMMAND_ENUM_OPTIONS: Record<string, string[]> = {
    direction: [...LOITER_DIRECTIONS],
    action: [
        ...ALT_CHANGE_ACTIONS,
        ...FENCE_ACTIONS,
        ...PARACHUTE_ACTIONS,
        ...GRIPPER_ACTIONS,
        ...WINCH_ACTIONS,
    ],
    speed_type: [...SPEED_TYPES],
};
