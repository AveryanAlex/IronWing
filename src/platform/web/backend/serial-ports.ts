import {
  isWebSerialGrantAvailable,
  listGrantedWebSerialPorts,
  requestWebSerialPort,
} from "../serial/web-serial";
import { definePlatformCommandHandlers } from "./command-handler";
import type { SerialPortInventoryResult } from "../../../serial-ports";

export const serialPortCommandHandlers = definePlatformCommandHandlers({
  list_serial_port_inventory: async () => {
    if (!isWebSerialGrantAvailable()) {
      return {
        kind: "unsupported",
        can_request_web_serial: false,
      } satisfies SerialPortInventoryResult;
    }

    return {
      kind: "available",
      ports: await listGrantedWebSerialPorts(),
      can_request_web_serial: true,
    } satisfies SerialPortInventoryResult;
  },
  request_web_serial_port: async () => isWebSerialGrantAvailable() ? await requestWebSerialPort() : null,
});
