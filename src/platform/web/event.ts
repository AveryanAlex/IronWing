export type UnlistenFn = () => void;

const eventTarget = new EventTarget();

export function emitWebEvent(event: string, payload: unknown): void {
  eventTarget.dispatchEvent(new CustomEvent(event, { detail: payload }));
}

export async function listen<T>(event: string, handler: (event: { payload: T }) => void): Promise<UnlistenFn> {
  const listener = (value: Event) => {
    handler({ payload: (value as CustomEvent<T>).detail });
  };
  eventTarget.addEventListener(event, listener);
  return () => eventTarget.removeEventListener(event, listener);
}
