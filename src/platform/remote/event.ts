import { remoteEventUrl } from "./core";
import type { EventPayload, EventPayloadMap } from "../../lib/ipc/event-types";

export type UnlistenFn = () => void;

type RemoteEventMessage = {
  [E in keyof EventPayloadMap]: {
    event: E;
    payload: EventPayload<E>;
  };
}[keyof EventPayloadMap];

const listeners = new Map<string, Set<(payload: EventPayload<keyof EventPayloadMap>) => void>>();
let eventSource: EventSource | null = null;

function ensureEventSource() {
  if (eventSource) {
    return eventSource;
  }

  eventSource = new EventSource(remoteEventUrl());
  eventSource.addEventListener("ironwing", (message) => {
    const parsed = JSON.parse(message.data) as RemoteEventMessage;
    const handlers = listeners.get(parsed.event);
    if (!handlers) {
      return;
    }

    for (const handler of handlers) {
      handler(parsed.payload as EventPayload<keyof EventPayloadMap>);
    }
  });
  eventSource.onerror = () => {
    console.warn("[ironwing/remote-ui] event stream disconnected; EventSource will retry");
  };
  return eventSource;
}

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
  ensureEventSource();
  const wrapped = (payload: EventPayload<keyof EventPayloadMap>) => handler({ payload: payload as T });
  const handlers = listeners.get(event) ?? new Set<(payload: EventPayload<keyof EventPayloadMap>) => void>();
  handlers.add(wrapped);
  listeners.set(event, handlers);

  return () => {
    handlers.delete(wrapped);
    if (handlers.size === 0) {
      listeners.delete(event);
    }
  };
}
