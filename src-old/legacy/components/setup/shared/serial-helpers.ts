import {
  getStagedOrCurrent,
  type ParamInputParams,
} from "../primitives/param-helpers";

export const MAX_SERIAL_INDEX = 9;
export const GPS_PROTOCOL = 5;
export const RC_PROTOCOL = 23;

export function findPortsByProtocol(
  protocol: number,
  params: ParamInputParams,
): string[] {
  const ports: string[] = [];

  for (let index = 0; index <= MAX_SERIAL_INDEX; index++) {
    if (getStagedOrCurrent(`SERIAL${index}_PROTOCOL`, params) === protocol) {
      ports.push(`SERIAL${index}`);
    }
  }

  return ports;
}

export function findGpsSerialPorts(params: ParamInputParams): string[] {
  return findPortsByProtocol(GPS_PROTOCOL, params);
}

export function findRcSerialPorts(params: ParamInputParams): string[] {
  return findPortsByProtocol(RC_PROTOCOL, params);
}
