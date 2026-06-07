import { invoke } from "@platform/core";

export type SerialPortInfo = {
  port_name: string;
  vid: number | null;
  pid: number | null;
  serial_number: string | null;
  manufacturer: string | null;
  product: string | null;
  location: string | null;
};

export type SerialPortInventoryResult =
  | { kind: "available"; ports: SerialPortInfo[]; can_request_web_serial: boolean }
  | { kind: "unsupported"; can_request_web_serial: boolean };

function isUnsupportedCommandError(error: unknown, command: string): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return message.includes(command)
    && (normalized.includes("unmocked command")
      || normalized.includes("unknown command")
      || normalized.includes("command not found")
      || normalized.includes("not found"));
}

export async function listSerialPortInventory(): Promise<SerialPortInventoryResult> {
  return invoke<SerialPortInventoryResult>("list_serial_port_inventory");
}

export async function requestWebSerialPort(): Promise<SerialPortInfo | null> {
  try {
    return await invoke<SerialPortInfo | null>("request_web_serial_port");
  } catch (error) {
    if (isUnsupportedCommandError(error, "request_web_serial_port")) {
      return null;
    }
    throw error;
  }
}
