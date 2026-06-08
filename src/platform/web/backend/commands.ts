import { firmwareCommandHandlers, webFirmwareCommandHandlers } from "./firmware";
import { guidedCommandHandlers } from "./guided";
import { logCommandHandlers } from "./logs";
import { missionCommandHandlers } from "./mission";
import { paramCommandHandlers } from "./params";
import { recordingCommandHandlers } from "./recording";
import { serialPortCommandHandlers } from "./serial-ports";
import { sessionCommandHandlers, webSessionCommandHandlers } from "./session";
import { setupActionCommandHandlers } from "./setup-actions";
import { unsupported } from "./unsupported";
import { vehicleControlCommandHandlers } from "./vehicle-control";
import {
  hasPlatformCommandHandler,
  invokePlatformCommand,
  type PlatformCommandHandlers,
  type WebCommandArgs,
  type WebOnlyCommandHandlers,
} from "./command-handler";

const commandHandlers: PlatformCommandHandlers = Object.assign(
  {},
  sessionCommandHandlers,
  serialPortCommandHandlers,
  vehicleControlCommandHandlers,
  guidedCommandHandlers,
  setupActionCommandHandlers,
  logCommandHandlers,
  recordingCommandHandlers,
  firmwareCommandHandlers,
  paramCommandHandlers,
  missionCommandHandlers,
);

const webOnlyCommandHandlers: WebOnlyCommandHandlers = Object.assign(
  {},
  webSessionCommandHandlers,
  webFirmwareCommandHandlers,
);

export async function invokeWebCommand<T>(cmd: string, args?: WebCommandArgs): Promise<T> {
  if (hasPlatformCommandHandler(commandHandlers, cmd)) {
    return await invokePlatformCommand(commandHandlers, cmd as never, args as never) as T;
  }

  const webOnlyHandler = webOnlyCommandHandlers[cmd];
  if (webOnlyHandler) {
    return await webOnlyHandler(args) as T;
  }

  unsupported(cmd, "This feature is not supported in pure web mode.");
}
