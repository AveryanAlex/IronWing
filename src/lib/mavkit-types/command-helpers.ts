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
    if ("QgcPassthrough" in cmd) {
        return `Command #${cmd.QgcPassthrough.command} (file only)`;
    }
    return "Unknown";
}

type PayloadOf<C> = C extends object ? C[keyof C] extends infer V
    ? V extends object ? V[keyof V] : never : never : never;
type FieldOf<T> = T extends unknown ? keyof T & string : never;
type ValueOf<T, F extends string> = T extends unknown ? F extends keyof T ? T[F] : never : never;

export function withCommandField<C extends MissionCommand, F extends FieldOf<PayloadOf<C>>>(
    cmd: C, fieldKey: F, value: ValueOf<PayloadOf<NoInfer<C>>, F>,
): C {
    return withDynamicCommandField(cmd, fieldKey, value) as C;
}

/** Boundary for inspector inputs and decoded file fields; shape is checked before updating. */
export function withDynamicCommandField(cmd: MissionCommand, fieldKey: string, value: unknown): MissionCommand {
    const [category, variant] = Object.entries(cmd)[0];
    if (category === "Other" || category === "QgcPassthrough" || typeof variant !== "object" || variant === null) return cmd;
    const [variantKey, inner] = Object.entries(variant)[0];
    if (!inner || typeof inner !== "object" || !(fieldKey in inner)) return cmd;
    const payload = inner as Record<string, unknown>;
    if (typeof payload[fieldKey] !== typeof value) throw new TypeError(`Invalid value for ${category}:${variantKey}.${fieldKey}`);
    // The existing SDK variant and its payload are retained; only a checked field is replaced.
    return { [category]: { [variantKey]: { ...payload, [fieldKey]: value } } } as MissionCommand;
}
