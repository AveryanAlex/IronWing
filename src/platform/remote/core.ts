const DEFAULT_REMOTE_BRIDGE_URL = "http://127.0.0.1:14242";

export { openBrowserUrl as openUrl } from "../shared/open-url";

function remoteBridgeUrl() {
  return (import.meta.env.VITE_IRONWING_REMOTE_UI_URL ?? DEFAULT_REMOTE_BRIDGE_URL).replace(/\/$/, "");
}

type InvokeResponse<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${remoteBridgeUrl()}/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cmd, args: args ?? {} }),
  });

  const result = await response.json() as InvokeResponse<T>;
  if (!response.ok || !result.ok) {
    throw new Error(result.ok ? `remote invoke ${cmd} failed` : result.error);
  }

  return result.value;
}

export function remoteEventUrl() {
  return `${remoteBridgeUrl()}/events`;
}
