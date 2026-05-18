import { ensureWasmRuntime } from "../wasm";
import { webBackendRuntime } from "./runtime";
import { unsupported } from "./unsupported";

export async function invokeWebCommand<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    case "available_transports":
      return [] as T;
    case "open_session_snapshot": {
      const runtime = await ensureWasmRuntime();
      webBackendRuntime.runtimeLoaded = true;
      return runtime.openSessionSnapshot(String(args?.sourceKind ?? "live")) as T;
    }
    case "ack_session_snapshot": {
      const runtime = await ensureWasmRuntime();
      webBackendRuntime.runtimeLoaded = true;
      return runtime.ackSessionSnapshot(
        String(args?.sessionId ?? ""),
        Number(args?.seekEpoch ?? 0),
        Number(args?.resetRevision ?? 0),
      ) as T;
    }
    case "disconnect_link": {
      if (webBackendRuntime.runtimeLoaded) {
        const runtime = await ensureWasmRuntime();
        await runtime.disconnectLink();
      }
      return undefined as T;
    }
    case "connect_link":
      unsupported(cmd, "browser transport wiring is not implemented yet");
    default:
      unsupported(cmd, "this command has not been wired into the web backend yet");
  }
}
