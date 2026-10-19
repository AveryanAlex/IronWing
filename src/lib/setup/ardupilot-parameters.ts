import { RTL_PARAMETER_ENCODINGS, GPS_SOURCES, PRIMARY_GPS_TYPE_NAMES, PRIMARY_GNSS_MODE_NAMES } from "../generated/ardupilot-parameters";

export { PRIMARY_GPS_TYPE_NAMES, PRIMARY_GNSS_MODE_NAMES };
export type ParameterEncoding = typeof RTL_PARAMETER_ENCODINGS[number];

export function parameterEncoding(family: string, name: string): ParameterEncoding | null {
  return RTL_PARAMETER_ENCODINGS.find((entry) => entry.family === family && entry.name === name) ?? null;
}

export function resolveRtlParameter(family: string, role: string, availableNames: Iterable<string>): ParameterEncoding | null {
  const names = new Set(availableNames);
  return RTL_PARAMETER_ENCODINGS.find((entry) => entry.family === family && entry.role === role && names.has(entry.name)) ?? null;
}

export function parameterDisplayValue(encoding: ParameterEncoding, raw: number): number {
  return encoding.sentinels.some((sentinel) => sentinel === raw) ? raw : raw / encoding.raw_per_unit;
}

export function parameterRawValue(encoding: ParameterEncoding, display: number): number {
  return encoding.sentinels.some((sentinel) => sentinel === display) ? display : display * encoding.raw_per_unit;
}

export function primaryGpsParameter(names: readonly string[], available: Iterable<string>): string | null {
  const advertised = new Set(available);
  return names.find((name) => advertised.has(name)) ?? null;
}

export function gpsSource(value: number | null | undefined) {
  return GPS_SOURCES.find((source) => source.value === value) ?? null;
}
