import { ensureSocket, listeners } from "./socket";

export type UnlistenFn = () => void;

export async function listen<T>(
  event: string,
  handler: (event: { payload: T }) => void,
): Promise<UnlistenFn> {
  await ensureSocket();

  const messageHandler = ({ data }: MessageEvent) => {
    handler(data as { payload: T });
  };

  listeners.addEventListener(event, messageHandler as EventListener);

  return () => {
    listeners.removeEventListener(event, messageHandler as EventListener);
  };
}
