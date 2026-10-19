import type { GeoPoint3d, MissionCommand } from "./mission-types";
import {
  createDefaultCommand,
  type CommandCategory,
  type CommandVariant,
  type CommandForKey,
  type CommandKey,
} from "../mission-command-definitions";

export function defaultCommand<C extends CommandCategory, V extends CommandVariant<C>>(
  category: C,
  variant: V,
  position?: GeoPoint3d,
): CommandForKey<Extract<`${C}:${V}`, CommandKey>>;
export function defaultCommand(category: CommandCategory, variant: string, position?: GeoPoint3d): MissionCommand {
  return createDefaultCommand(category, variant, position);
}
