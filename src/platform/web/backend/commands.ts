import { tryHandleFirmwareCommand } from "./firmware";
import { tryHandleGuidedCommand } from "./guided";
import { tryHandleLogCommand } from "./logs";
import { tryHandleMissionCommand } from "./mission";
import { tryHandleParamCommand } from "./params";
import { tryHandleRecordingCommand } from "./recording";
import { tryHandleSerialPortCommand } from "./serial-ports";
import { tryHandleSessionCommand } from "./session";
import { tryHandleSetupActionCommand } from "./setup-actions";
import { unsupported } from "./unsupported";
import { tryHandleVehicleControlCommand } from "./vehicle-control";
import type { WebCommandArgs, WebCommandHandler } from "./command-handler";

const commandHandlers: WebCommandHandler[] = [
  tryHandleSessionCommand,
  tryHandleSerialPortCommand,
  tryHandleVehicleControlCommand,
  tryHandleGuidedCommand,
  tryHandleSetupActionCommand,
  tryHandleLogCommand,
  tryHandleRecordingCommand,
  tryHandleFirmwareCommand,
  tryHandleParamCommand,
  tryHandleMissionCommand,
];

export async function invokeWebCommand<T>(cmd: string, args?: WebCommandArgs): Promise<T> {
  for (const handleCommand of commandHandlers) {
    const result = await handleCommand(cmd, args);
    if (result.handled) {
      return await result.value as T;
    }
  }

  unsupported(cmd, "This feature is not supported in pure web mode.");
}
