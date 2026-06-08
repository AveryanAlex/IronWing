export type { PlatformCommandHandlers } from "../../../lib/ipc/platform-handlers";
export {
  definePlatformCommandHandlers,
  hasPlatformCommandHandler,
  invokePlatformCommand,
} from "../../../lib/ipc/platform-handlers";

export type WebCommandArgs = Record<string, unknown> | undefined;
export type WebOnlyCommandHandler = (args?: WebCommandArgs) => Promise<unknown> | unknown;
export type WebOnlyCommandHandlers = Record<string, WebOnlyCommandHandler>;
