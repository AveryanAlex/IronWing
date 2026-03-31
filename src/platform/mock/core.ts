import { invokeMockCommand } from "./backend";

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return invokeMockCommand<T>(cmd, args);
}

export async function openUrl(url: string): Promise<void> {
  window.open(url, "_blank", "noopener,noreferrer");
}
