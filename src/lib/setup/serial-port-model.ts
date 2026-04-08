import type { ParamMetadataMap } from "../../param-metadata";
import type { ParamStore } from "../../params";

export const MAX_SERIAL_INDEX = 9;
export const GPS_PROTOCOL = 5;
export const RC_PROTOCOL = 23;

export const SERIAL_PORT_LABELS: Record<number, string> = {
  0: "USB",
  1: "TELEM1",
  2: "TELEM2",
  3: "GPS1",
  4: "GPS2",
  5: "USER",
};

export const EXCLUSIVE_PROTOCOLS: Record<number, string> = {
  5: "GPS",
  23: "RCInput",
  28: "Scripting",
};

export type SerialPortModelInput = {
  paramStore: ParamStore | null;
  metadata: ParamMetadataMap | null;
  stagedEdits: Record<string, { nextValue: number } | undefined>;
};

export type SerialPortOption = {
  code: number;
  label: string;
};

export type SerialProtocolConflict = {
  protocol: number;
  protocolLabel: string;
  ports: string[];
  message: string;
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
  conflicts: SerialProtocolConflict[];
  gpsPorts: string[];
  rcPorts: string[];
  hasPendingChanges: boolean;
  configuredPortCount: number;
  summaryText: string;
  rebootWarningText: string;
  recoveryReasons: string[];
  recoveryText: string | null;
};

function hasParam(input: SerialPortModelInput, name: string): boolean {
  return input.paramStore?.params[name] !== undefined;
}

function currentValue(input: SerialPortModelInput, name: string): number | null {
  return input.paramStore?.params[name]?.value ?? null;
}

function stagedOrCurrentValue(input: SerialPortModelInput, name: string): number | null {
  const stagedValue = input.stagedEdits[name]?.nextValue;
  if (typeof stagedValue === "number" && Number.isFinite(stagedValue)) {
    return stagedValue;
  }

  return currentValue(input, name);
}

function hasPendingChange(input: SerialPortModelInput, name: string): boolean {
  const stagedValue = input.stagedEdits[name]?.nextValue;
  const storedValue = currentValue(input, name);

  return typeof stagedValue === "number"
    && Number.isFinite(stagedValue)
    && stagedValue !== storedValue;
}

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
    reasons.push(`${row.prefix}_PROTOCOL metadata is missing or malformed, so protocol edits stay read-only.`);
  }

  if (!row.hasBaudParam) {
    reasons.push(`${row.prefix}_BAUD is unavailable for this port on the current scope.`);
  } else if (!row.baudMetadataReady) {
    reasons.push(`${row.prefix}_BAUD metadata is missing or malformed, so baud edits stay read-only.`);
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
    const protocolPresent = hasParam(input, protocolParamName);
    const baudPresent = hasParam(input, baudParamName);

    if (!protocolPresent && !baudPresent) {
      continue;
    }

    const protocolOptions = normalizeOptions(input.metadata?.get(protocolParamName)?.values);
    const baudOptions = normalizeOptions(input.metadata?.get(baudParamName)?.values);
    const protocolValue = stagedOrCurrentValue(input, protocolParamName);
    const baudValue = stagedOrCurrentValue(input, baudParamName);
    const pendingProtocolChange = hasPendingChange(input, protocolParamName);
    const pendingBaudChange = hasPendingChange(input, baudParamName);

    const row: SerialPortRow = {
      index,
      prefix,
      boardLabel: SERIAL_PORT_LABELS[index] ?? null,
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

export function detectSerialProtocolConflicts(rows: SerialPortRow[]): SerialProtocolConflict[] {
  const usage = new Map<number, string[]>();

  for (const row of rows) {
    const protocol = row.protocolValue;
    if (protocol === null || protocol === 0 || protocol === -1) {
      continue;
    }

    if (EXCLUSIVE_PROTOCOLS[protocol] === undefined) {
      continue;
    }

    const ports = usage.get(protocol) ?? [];
    ports.push(row.prefix);
    usage.set(protocol, ports);
  }

  return [...usage.entries()]
    .filter(([, ports]) => ports.length > 1)
    .map(([protocol, ports]) => ({
      protocol,
      protocolLabel: EXCLUSIVE_PROTOCOLS[protocol] ?? `Protocol ${protocol}`,
      ports,
      message: `${EXCLUSIVE_PROTOCOLS[protocol] ?? `Protocol ${protocol}`} is assigned to ${ports.join(", ")}. Keep this exclusive protocol on one port only before applying or rebooting.`,
    }))
    .sort((left, right) => left.protocol - right.protocol);
}

function buildModelSummary(rows: SerialPortRow[], gpsPorts: string[], rcPorts: string[], conflicts: SerialProtocolConflict[]): string {
  if (rows.length === 0) {
    return "No SERIALn_* rows are available for this scope.";
  }

  const configuredPortCount = rows.filter((row) => row.protocolValue !== null && row.protocolValue !== 0 && row.protocolValue !== -1).length;
  const parts = [`${rows.length} detected`, `${configuredPortCount} configured`];

  if (gpsPorts.length > 0) {
    parts.push(`GPS on ${gpsPorts.join(", ")}`);
  }

  if (rcPorts.length > 0) {
    parts.push(`RCInput on ${rcPorts.join(", ")}`);
  }

  if (conflicts.length > 0) {
    parts.push(`${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"}`);
  }

  return parts.join(" · ");
}

export function buildSerialPortModel(input: SerialPortModelInput): SerialPortModel {
  const ports = detectSerialPorts(input);
  const conflicts = detectSerialProtocolConflicts(ports);
  const gpsPorts = ports.filter((row) => row.protocolValue === GPS_PROTOCOL).map((row) => row.prefix);
  const rcPorts = ports.filter((row) => row.protocolValue === RC_PROTOCOL).map((row) => row.prefix);
  const hasPendingChanges = ports.some((row) => row.hasPendingChange);
  const configuredPortCount = ports.filter((row) => row.protocolValue !== null && row.protocolValue !== 0 && row.protocolValue !== -1).length;
  const recoveryReasons = [
    ...new Set(
      ports.flatMap((row) => row.recoveryText ? [row.recoveryText] : []),
    ),
  ];
  const recoveryText = recoveryReasons.length > 0
    ? `${recoveryReasons.join(" ")} Use Full Parameters recovery if this scope is missing labels or port rows.`
    : null;

  return {
    ports,
    conflicts,
    gpsPorts,
    rcPorts,
    hasPendingChanges,
    configuredPortCount,
    summaryText: buildModelSummary(ports, gpsPorts, rcPorts, conflicts),
    rebootWarningText: hasPendingChanges
      ? "Queued serial protocol or baud changes stay in the shared review tray and require a reboot before the new port map is truthful."
      : "Serial protocol and baud changes take effect only after the shared review tray applies them and the vehicle reboots.",
    recoveryReasons,
    recoveryText,
  };
}
