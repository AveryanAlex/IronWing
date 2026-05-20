import {
  wasmStartGuidedSession,
  wasmStopGuidedSession,
  wasmUpdateGuidedSession,
} from "../wasm";
import { handled, WEB_COMMAND_UNHANDLED } from "./command-handler";
import type { WebCommandArgs, WebCommandResult } from "./command-handler";
import type { StartGuidedSessionRequest, UpdateGuidedSessionRequest } from "../../../guided";

export async function tryHandleGuidedCommand(cmd: string, args?: WebCommandArgs): Promise<WebCommandResult> {
  switch (cmd) {
    case "start_guided_session":
      return handled(await wasmStartGuidedSession(guidedRequestArg<StartGuidedSessionRequest>(args, cmd)));
    case "update_guided_session":
      return handled(await wasmUpdateGuidedSession(guidedRequestArg<UpdateGuidedSessionRequest>(args, cmd)));
    case "stop_guided_session":
      return handled(await wasmStopGuidedSession());
    default:
      return WEB_COMMAND_UNHANDLED;
  }
}

function guidedRequestArg<T>(args: WebCommandArgs, command: string): T {
  if (!args?.request || typeof args.request !== "object" || Array.isArray(args.request)) {
    throw new Error(`missing or invalid ${command}.request`);
  }

  return args.request as T;
}
