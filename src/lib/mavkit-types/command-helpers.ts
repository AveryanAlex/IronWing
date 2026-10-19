import type { CommandCategory } from "../mission-command-definitions";
import { pascalToDisplay } from "../mission-command-names";
import type { ConditionCommand, DoCommand, GeoPoint3d, MissionCommand, NavCommand } from "./mission-types";

export function commandVariant(command: MissionCommand): {
    category: CommandCategory; variant: string; payload: Record<string, unknown> | null;
} | null {
    const describe = (category: CommandCategory, value: NavCommand | DoCommand | ConditionCommand) => {
        if (typeof value === "string") return { category, variant: value, payload: null };
        const entry = Object.entries(value)[0];
        if (!entry) return null;
        const [variant, payload] = entry;
        return { category, variant, payload: payload as Record<string, unknown> };
    };
    if ("Nav" in command) return describe("Nav", command.Nav);
    if ("Do" in command) return describe("Do", command.Do);
    if ("Condition" in command) return describe("Condition", command.Condition);
    return null;
}

export function commandPayload(command: MissionCommand): Record<string, unknown> | null {
    return commandVariant(command)?.payload ?? null;
}

export function commandPosition(cmd: MissionCommand): GeoPoint3d | null {
    const payload = commandPayload(cmd);
    return payload && "position" in payload ? payload.position as GeoPoint3d : null;
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
    const descriptor = commandVariant(cmd);
    if (descriptor) return pascalToDisplay(descriptor.variant);
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
    const descriptor = commandVariant(cmd);
    const payload = descriptor?.payload;
    if (!descriptor || !payload || !(fieldKey in payload)) return cmd;
    if (typeof payload[fieldKey] !== typeof value) throw new TypeError(
        `Invalid value for ${descriptor.category}:${descriptor.variant}.${fieldKey}`,
    );
    return { [descriptor.category]: { [descriptor.variant]: { ...payload, [fieldKey]: value } } } as MissionCommand;
}
