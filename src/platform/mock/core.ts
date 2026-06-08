import { invokeMockCommand } from "./backend";

export { openBrowserUrl as openUrl } from "../shared/open-url";

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  return invokeMockCommand<T>(cmd, args);
}
