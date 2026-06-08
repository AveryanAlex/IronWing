import {
  wasmStartGuidedSession,
  wasmStopGuidedSession,
  wasmUpdateGuidedSession,
} from "../wasm";
import { definePlatformCommandHandlers } from "./command-handler";

export const guidedCommandHandlers = definePlatformCommandHandlers({
  start_guided_session: async ({ request }) => wasmStartGuidedSession(request),
  update_guided_session: async ({ request }) => wasmUpdateGuidedSession(request),
  stop_guided_session: async () => wasmStopGuidedSession(),
});
