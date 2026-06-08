import { invoke } from "@platform/core";
import { listen, type UnlistenFn } from "@platform/event";
import type { ArgCommandName, InvokeArg, InvokeCommandMap, InvokeResult, NoArgCommandName } from "./command-types";
import type { EventPayload, EventPayloadMap } from "./event-types";

export type { UnlistenFn } from "@platform/event";

export function typedInvoke<C extends NoArgCommandName>(command: C): Promise<InvokeResult<C>>;
export function typedInvoke<C extends ArgCommandName>(command: C, args: InvokeArg<C>): Promise<InvokeResult<C>>;
export async function typedInvoke<C extends keyof InvokeCommandMap>(
  command: C,
  args?: InvokeCommandMap[C]["args"],
): Promise<InvokeResult<C>> {
  if (args === undefined) {
    return invoke<InvokeResult<C>>(command);
  }
  return invoke<InvokeResult<C>>(command, args as Record<string, unknown> | undefined);
}

export async function typedListen<E extends keyof EventPayloadMap>(
  eventName: E,
  handler: (event: { payload: EventPayload<E> }) => void,
): Promise<UnlistenFn> {
  return listen(eventName, handler);
}
