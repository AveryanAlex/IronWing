import type { StagedParameterValues } from "../params/parameter-values";
import { hasParameter, hasPendingParameterEdit, readAppliedParameter, readProposedParameter } from "../params/parameter-values";
import { ArduPilotSerialProtocol, isConfiguredSerialProtocol, serialPortBoardLabel } from "../ardupilot/serial";
import type { ParamMetadataMap } from "../../param-metadata";
import type { ParamStore } from "../../params";

export const MAX_SERIAL_INDEX = 9;
export type SerialPortModelInput = {
  paramStore: ParamStore | null;
  metadata: ParamMetadataMap | null;
  stagedEdits: StagedParameterValues;
};

export type SerialPortOption = {
  code: number;
  label: string;
};

export type SerialPortRow = {
  index: number;
  prefix: string;
  boardLabel: string | null;
  protocolParamName: string;
  baudParamName: string;
  hasProtocolParam: boolean;
  hasBaudParam: boolean;
  protocolValue: number | null;
  protocolValueText: string;
  baudValue: number | null;
  baudValueText: string;
  protocolOptions: SerialPortOption[];
  baudOptions: SerialPortOption[];
  protocolMetadataReady: boolean;
  baudMetadataReady: boolean;
  recoveryText: string | null;
  summaryText: string;
  hasPendingChange: boolean;
  pendingChangeCount: number;
};

export type SerialPortModel = {
  ports: SerialPortRow[];
  gpsPorts: string[];
  rcPorts: string[];
  hasPendingChanges: boolean;
  configuredPortCount: number;
  summaryText: string;
  rebootWarningText: string;
  recoveryReasons: string[];
  recoveryText: string | null;
};

function normalizeOptions(values: { code: number; label: string }[] | undefined): SerialPortOption[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.filter((value) => Number.isFinite(value.code) && value.label.trim().length > 0);
}

function resolveOptionLabel(options: SerialPortOption[], value: number | null): string | null {
  if (value === null) {
    return null;
  }

  return options.find((option) => option.code === value)?.label ?? null;
}

function formatProtocolValue(value: number | null, options: SerialPortOption[]): string {
  if (value === null) {
    return "Unavailable";
  }

  return resolveOptionLabel(options, value) ?? `Protocol ${value}`;
}

function formatBaudValue(value: number | null, options: SerialPortOption[]): string {
  if (value === null) {
    return "Unavailable";
  }

  return resolveOptionLabel(options, value) ?? String(value);
}

function buildRowRecoveryReasons(row: Pick<SerialPortRow, "hasProtocolParam" | "hasBaudParam" | "protocolMetadataReady" | "baudMetadataReady" | "prefix">): string[] {
  const reasons: string[] = [];

  if (!row.hasProtocolParam) {
    reasons.push(`${row.prefix}_PROTOCOL is unavailable for this port on the current scope.`);
  } else if (!row.protocolMetadataReady) {
    reasons.push(`${row.prefix}_PROTOCOL option labels are unavailable, so protocol edits stay read-only in this guided view.`);
  }

  if (!row.hasBaudParam) {
    reasons.push(`${row.prefix}_BAUD is unavailable for this port on the current scope.`);
  } else if (!row.baudMetadataReady) {
    reasons.push(`${row.prefix}_BAUD option labels are unavailable, so baud edits stay read-only in this guided view.`);
  }

  return reasons;
}

function buildRowSummary(row: Pick<SerialPortRow, "boardLabel" | "protocolValueText" | "baudValueText">): string {
  const label = row.boardLabel ? `${row.boardLabel} · ` : "";
  return `${label}${row.protocolValueText} @ ${row.baudValueText}`;
}

export function detectSerialPorts(input: SerialPortModelInput): SerialPortRow[] {
  const rows: SerialPortRow[] = [];

  for (let index = 0; index <= MAX_SERIAL_INDEX; index += 1) {
    const prefix = `SERIAL${index}`;
    const protocolParamName = `${prefix}_PROTOCOL`;
    const baudParamName = `${prefix}_BAUD`;
    const protocolPresent = hasParameter(input.paramStore, protocolParamName);
    const baudPresent = hasParameter(input.paramStore, baudParamName);

    if (!protocolPresent && !baudPresent) {
      continue;
    }

    const protocolOptions = normalizeOptions(input.metadata?.get(protocolParamName)?.values);
    const baudOptions = normalizeOptions(input.metadata?.get(baudParamName)?.values);
    const protocolValue = readProposedParameter(input, protocolParamName);
    const baudValue = readProposedParameter(input, baudParamName);
    const pendingProtocolChange = hasPendingParameterEdit(input, protocolParamName);
    const pendingBaudChange = hasPendingParameterEdit(input, baudParamName);

    const row: SerialPortRow = {
      index,
      prefix,
      boardLabel: serialPortBoardLabel(index),
      protocolParamName,
      baudParamName,
      hasProtocolParam: protocolPresent,
      hasBaudParam: baudPresent,
      protocolValue,
      protocolValueText: formatProtocolValue(protocolValue, protocolOptions),
      baudValue,
      baudValueText: formatBaudValue(baudValue, baudOptions),
      protocolOptions,
      baudOptions,
      protocolMetadataReady: protocolPresent && protocolOptions.length > 0,
      baudMetadataReady: baudPresent && baudOptions.length > 0,
      recoveryText: null,
      summaryText: "",
      hasPendingChange: pendingProtocolChange || pendingBaudChange,
      pendingChangeCount: Number(pendingProtocolChange) + Number(pendingBaudChange),
    };

    const recoveryReasons = buildRowRecoveryReasons(row);
    row.recoveryText = recoveryReasons.length > 0 ? recoveryReasons.join(" ") : null;
    row.summaryText = buildRowSummary(row);

    rows.push(row);
  }

  return rows.sort((left, right) => left.index - right.index);
}

export function findPortsByProtocol(protocol: number, input: SerialPortModelInput): string[] {
  return detectSerialPorts(input)
    .filter((row) => row.protocolValue === protocol)
    .map((row) => row.prefix);
}

function buildModelSummary(rows: SerialPortRow[], gpsPorts: string[], rcPorts: string[]): string {
  if (rows.length === 0) {
    return "No SERIALn_* rows are available for this scope.";
  }

  const configuredPortCount = rows.filter((row) => isConfiguredSerialProtocol(row.protocolValue)).length;
  const parts = [`${rows.length} detected`, `${configuredPortCount} configured`];

  if (gpsPorts.length > 0) {
    parts.push(`GPS on ${gpsPorts.join(", ")}`);
  }

  if (rcPorts.length > 0) {
    parts.push(`RCInput on ${rcPorts.join(", ")}`);
  }

  return parts.join(" · ");
}

export function buildSerialPortModel(input: SerialPortModelInput): SerialPortModel {
  const ports = detectSerialPorts(input);
  const gpsPorts = ports.filter((row) => row.protocolValue === ArduPilotSerialProtocol.Gps).map((row) => row.prefix);
  const rcPorts = ports.filter((row) => row.protocolValue === ArduPilotSerialProtocol.RcInput).map((row) => row.prefix);
  const hasPendingChanges = ports.some((row) => row.hasPendingChange);
  const configuredPortCount = ports.filter((row) => isConfiguredSerialProtocol(row.protocolValue)).length;
  const recoveryReasons = [
    ...new Set(
      ports.flatMap((row) => row.recoveryText ? [row.recoveryText] : []),
    ),
  ];
  const recoveryText = recoveryReasons.length > 0
    ? `${recoveryReasons.join(" ")} Use Parameters if this firmware needs a setting that is not shown here.`
    : null;

  return {
    ports,
    gpsPorts,
    rcPorts,
    hasPendingChanges,
    configuredPortCount,
    summaryText: buildModelSummary(ports, gpsPorts, rcPorts),
    rebootWarningText: hasPendingChanges
      ? "Queued serial protocol or baud changes require apply and reboot before the vehicle uses the new port map."
      : "Serial protocol and baud changes take effect after apply and vehicle reboot.",
    recoveryReasons,
    recoveryText,
  };
}
