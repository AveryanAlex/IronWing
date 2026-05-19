import { WebBackendUnsupportedError } from "./errors";

export function unsupported(command: string, reason: string): never {
  throw new WebBackendUnsupportedError(`${command} is not available in the browser-only web runtime. ${reason}`);
}
