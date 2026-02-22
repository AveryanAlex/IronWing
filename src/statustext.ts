import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type StatusMessage = {
  text: string;
  severity: number;
};

export async function subscribeStatusText(
  cb: (msg: StatusMessage) => void,
): Promise<UnlistenFn> {
  return listen<StatusMessage>("statustext://message", (event) => cb(event.payload));
}
