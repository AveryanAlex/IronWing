import type { Param, ParamType } from "../../../params";

export const INTEGER_PARAM_TYPES: readonly ParamType[] = [
  "uint8",
  "int8",
  "uint16",
  "int16",
  "uint32",
  "int32",
];

export function formatStagedValue(value: number, paramType?: ParamType): string {
  if (paramType && INTEGER_PARAM_TYPES.includes(paramType)) {
    return String(Math.round(value));
  }
  return String(value);
}

export function displayParamValue(param: Param): string {
  if (INTEGER_PARAM_TYPES.includes(param.param_type)) {
    return String(Math.round(param.value));
  }
  return String(param.value);
}
