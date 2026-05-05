import { remoteEventUrl } from "./core";

export type UnlistenFn = () => void;

type RemoteEventMessage = {
  event: string;
  payload: unknown;
};

const listeners = new Map<string, Set<(payload: unknown) => void>>();
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
      handler(parsed.payload);
    }
  });
  eventSource.onerror = () => {
    console.warn("[ironwing/remote-ui] event stream disconnected; EventSource will retry");
  };
  return eventSource;
}

export async function listen<T>(
  event: string,
  handler: (event: { payload: T }) => void,
): Promise<UnlistenFn> {
  ensureEventSource();
  const wrapped = (payload: unknown) => handler({ payload: payload as T });
  const handlers = listeners.get(event) ?? new Set<(payload: unknown) => void>();
  handlers.add(wrapped);
  listeners.set(event, handlers);

  return () => {
    handlers.delete(wrapped);
    if (handlers.size === 0) {
      listeners.delete(event);
    }
  };
}
