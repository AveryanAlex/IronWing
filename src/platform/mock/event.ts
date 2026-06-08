import { listenMockEvent } from "./backend";
import type { EventPayload, EventPayloadMap } from "../../lib/ipc/event-types";

export type UnlistenFn = () => void;

export async function listen<E extends keyof EventPayloadMap>(
  event: E,
  handler: (event: { payload: EventPayload<E> }) => void,
): Promise<UnlistenFn>;
export async function listen<T>(
  event: string,
  handler: (event: { payload: T }) => void,
): Promise<UnlistenFn>;
export async function listen<T>(
  event: string,
  handler: (event: { payload: T }) => void,
): Promise<UnlistenFn> {
  return listenMockEvent<T>(event, (payload) => {
    handler({ payload });
  });
}
