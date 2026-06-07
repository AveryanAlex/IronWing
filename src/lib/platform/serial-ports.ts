import {
  listSerialPortInventory,
  requestWebSerialPort,
  type SerialPortInfo,
  type SerialPortInventoryResult,
} from "../../serial-ports";
import { formatUnknownError } from "../error-format";

const MALFORMED_SERIAL_INVENTORY_MESSAGE = "Serial port inventory returned an unexpected payload.";
const MALFORMED_SERIAL_PORT_MESSAGE = "Serial port metadata returned an unexpected payload.";
const WEB_SERIAL_PORT_PREFIX = "webserial:";

export type AppSerialPortSource = "native" | "web_serial";

export type AppSerialPort = {
  id: string;
  source: AppSerialPortSource;
  transport: "serial" | "web_serial";
  portName: string;
  label: string;
  vid: number | null;
  pid: number | null;
  serialNumber: string | null;
  manufacturer: string | null;
  product: string | null;
  location: string | null;
  granted: boolean;
};

export type SerialPortInventoryService = {
  listPorts(): Promise<unknown>;
  requestWebSerialPort(): Promise<unknown>;
  formatError(error: unknown): string;
};

export function createSerialPortInventoryService(): SerialPortInventoryService {
  return {
    listPorts: listSerialPortInventory,
    requestWebSerialPort,
    formatError: formatUnknownError,
  };
}

export function normalizeSerialPortInventoryResult(value: unknown): SerialPortInventoryResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(MALFORMED_SERIAL_INVENTORY_MESSAGE);
  }

  const candidate = value as Record<string, unknown>;
  const canRequestWebSerial = requireBoolean(candidate.can_request_web_serial, MALFORMED_SERIAL_INVENTORY_MESSAGE);
  if (candidate.kind === "available") {
    return {
      kind: "available",
      ports: normalizeSerialPortInfoList(candidate.ports, MALFORMED_SERIAL_INVENTORY_MESSAGE),
      can_request_web_serial: canRequestWebSerial,
    };
  }

  if (candidate.kind === "unsupported") {
    return {
      kind: "unsupported",
      can_request_web_serial: canRequestWebSerial,
    };
  }

  throw new Error(MALFORMED_SERIAL_INVENTORY_MESSAGE);
}

export function normalizeSerialPortInfo(value: unknown): SerialPortInfo {
  return normalizeSerialPortInfoWithMessage(value, MALFORMED_SERIAL_PORT_MESSAGE);
}

export function toAppSerialPort(port: SerialPortInfo): AppSerialPort {
  const source = serialPortSource(port);
  const portName = port.port_name;
  return {
    id: `${source}:${portName}`,
    source,
    transport: source === "web_serial" ? "web_serial" : "serial",
    portName,
    label: serialPortLabel(port),
    vid: port.vid,
    pid: port.pid,
    serialNumber: port.serial_number,
    manufacturer: port.manufacturer,
    product: port.product,
    location: port.location,
    granted: source === "web_serial",
  };
}

export function serialPortLabel(port: Pick<SerialPortInfo, "port_name" | "product" | "manufacturer" | "serial_number">): string {
  const detail = [port.product, port.manufacturer, port.serial_number]
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .join(" · ");
  return detail ? `${port.port_name} · ${detail}` : port.port_name;
}

function serialPortSource(port: SerialPortInfo): AppSerialPortSource {
  return port.port_name.startsWith(WEB_SERIAL_PORT_PREFIX) ? "web_serial" : "native";
}

function normalizeSerialPortInfoList(value: unknown, message: string): SerialPortInfo[] {
  if (!Array.isArray(value)) {
    throw new Error(message);
  }

  return value.map((entry) => normalizeSerialPortInfoWithMessage(entry, message));
}

function normalizeSerialPortInfoWithMessage(value: unknown, message: string): SerialPortInfo {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }

  const candidate = value as Record<string, unknown>;
  return {
    port_name: requireString(candidate.port_name, message),
    vid: normalizeNullableInteger(candidate.vid, message),
    pid: normalizeNullableInteger(candidate.pid, message),
    serial_number: normalizeNullableString(candidate.serial_number, message),
    manufacturer: normalizeNullableString(candidate.manufacturer, message),
    product: normalizeNullableString(candidate.product, message),
    location: normalizeNullableString(candidate.location, message),
  };
}

function requireBoolean(value: unknown, message: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(message);
  }

  return value;
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== "string") {
    throw new Error(message);
  }

  return value;
}

function normalizeNullableString(value: unknown, message: string): string | null {
  if (value == null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(message);
  }

  return value;
}

function normalizeNullableInteger(value: unknown, message: string): number | null {
  if (value == null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(message);
  }

  return value;
}
