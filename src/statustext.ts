import { listen, type UnlistenFn } from "@platform/event";

export type StatusMessage = {
  text: string;
  severity: string;
};

export async function subscribeStatusText(
  cb: (msg: StatusMessage) => void,
): Promise<UnlistenFn> {
  return listen<StatusMessage>("statustext://message", (event) => cb(event.payload));
}
