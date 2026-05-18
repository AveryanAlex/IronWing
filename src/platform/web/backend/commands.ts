import { ensureWasmRuntime } from "../wasm";
import { createWebSocketTransport } from "../transports/websocket";
import { resetActiveConnection, webBackendRuntime } from "./runtime";
import { unsupported } from "./unsupported";

export async function invokeWebCommand<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    case "available_transports":
      return [
        {
          kind: "websocket",
          label: "WebSocket",
          available: typeof WebSocket !== "undefined",
          validation: { url_required: true },
          discovery_error:
            typeof WebSocket === "undefined" ? "WebSocket is not available in this browser" : undefined,
        },
      ] as T;
    case "connect_link": {
      const request = args?.request as { transport?: { kind?: string; url?: string } } | undefined;
      if (request?.transport?.kind !== "websocket") {
        unsupported(cmd, "only the WebSocket transport is wired in the web runtime right now");
      }

      const runtime = await ensureWasmRuntime();
      webBackendRuntime.runtimeLoaded = true;
      await resetActiveConnection();

      const bridge = runtime.beginConnect();
      const connectAbort = new AbortController();
      const transport = createWebSocketTransport(
        { kind: "websocket", url: String(request.transport.url ?? "") },
        bridge,
        connectAbort.signal,
      );

      webBackendRuntime.connectAbort = connectAbort;
      webBackendRuntime.activeTransport = transport;

      try {
        await transport.start();
        await runtime.waitConnect();
        return undefined as T;
      } catch (error) {
        await transport.close();
        webBackendRuntime.activeTransport = null;
        webBackendRuntime.connectAbort = null;
        throw error;
      }
    }
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
      await resetActiveConnection();
      if (webBackendRuntime.runtimeLoaded) {
        const runtime = await ensureWasmRuntime();
        await runtime.disconnectLink();
      }
      return undefined as T;
    }
    default:
      unsupported(cmd, "this command has not been wired into the web backend yet");
  }
}
