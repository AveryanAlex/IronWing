import {
  isWebSerialGrantAvailable,
  listGrantedWebSerialPorts,
  requestWebSerialPort,
} from "../serial/web-serial";
import { handled, WEB_COMMAND_UNHANDLED } from "./command-handler";
import type { WebCommandArgs, WebCommandResult } from "./command-handler";
import type { SerialPortInventoryResult } from "../../../serial-ports";

export async function tryHandleSerialPortCommand(cmd: string, _args?: WebCommandArgs): Promise<WebCommandResult> {
  switch (cmd) {
    case "list_serial_port_inventory": {
      if (!isWebSerialGrantAvailable()) {
        return handled({
          kind: "unsupported",
          can_request_web_serial: false,
        } satisfies SerialPortInventoryResult);
      }

      return handled({
        kind: "available",
        ports: await listGrantedWebSerialPorts(),
        can_request_web_serial: true,
      } satisfies SerialPortInventoryResult);
    }
    case "request_web_serial_port":
      return handled(isWebSerialGrantAvailable() ? await requestWebSerialPort() : null);
    default:
      return WEB_COMMAND_UNHANDLED;
  }
}
