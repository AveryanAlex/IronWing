import { listenMockEvent } from "./backend";

export type UnlistenFn = () => void;

export async function listen<T>(
  event: string,
  handler: (event: { payload: T }) => void,
): Promise<UnlistenFn> {
  return listenMockEvent<T>(event, (payload) => {
    handler({ payload });
  });
}
