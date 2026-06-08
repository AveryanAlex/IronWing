import type { EventPayload, EventPayloadMap } from "../../lib/ipc/event-types";

export type UnlistenFn = () => void;

const eventTarget = new EventTarget();

export function emitWebEvent<E extends keyof EventPayloadMap>(event: E, payload: EventPayload<E>): void {
  eventTarget.dispatchEvent(new CustomEvent(event, { detail: payload }));
}

export async function listen<E extends keyof EventPayloadMap>(event: E, handler: (event: { payload: EventPayload<E> }) => void): Promise<UnlistenFn>;
export async function listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<UnlistenFn> {
  const listener = (value: Event) => {
    handler({ payload: (value as CustomEvent<T>).detail });
  };
  eventTarget.addEventListener(event, listener);
  return () => eventTarget.removeEventListener(event, listener);
}
