/** SERIALx_PROTOCOL wire values. Firmware metadata remains authoritative for editable options. */
export enum ArduPilotSerialProtocol {
  Disabled = -1,
  Mavlink1 = 1,
  Mavlink2 = 2,
  Gps = 5,
  RcInput = 23,
  Scripting = 28,
  Msp = 32,
  DjiFpv = 33,
  MspDisplayPort = 42,
}

/** SERIALx_BAUD uses encoded values, not bits per second. */
export enum ArduPilotSerialBaud {
  Baud115200 = 115,
}

export function isConfiguredSerialProtocol(protocol: number | null): boolean {
  return protocol !== null && protocol !== 0 && protocol !== ArduPilotSerialProtocol.Disabled;
}

export function isMspOsdProtocol(protocol: number | null): boolean {
  return protocol === ArduPilotSerialProtocol.Msp
    || protocol === ArduPilotSerialProtocol.DjiFpv
    || protocol === ArduPilotSerialProtocol.MspDisplayPort;
}

// SERIAL numbers are logical; physical UART/pad names require board-specific information.
export function serialPortBoardLabel(index: number): string | null {
  return index === 0 ? "USB" : null;
}
