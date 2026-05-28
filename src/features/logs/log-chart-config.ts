import type { ChartSeriesSelector, LogLibraryEntry } from "../../logs";

export type LogChartGroup = {
  key: string;
  title: string;
  description: string;
  selectors: ChartSeriesSelector[];
  supported: boolean;
  emptyReason: string;
  supportsAltitudePreview: boolean;
};

type SelectorSeed = {
  messageType: string;
  field: string;
  label: string;
  unit: string | null;
};

type GroupSeed = {
  key: string;
  title: string;
  description: string;
  supportsAltitudePreview?: boolean;
  selectorSeeds: SelectorSeed[];
};

const TLOG_GROUPS: GroupSeed[] = [
  {
    key: "attitude",
    title: "Attitude",
    description: "Roll, pitch, and yaw from replay-safe attitude messages.",
    selectorSeeds: [
      { messageType: "ATTITUDE", field: "roll", label: "Roll", unit: "rad" },
      { messageType: "ATTITUDE", field: "pitch", label: "Pitch", unit: "rad" },
      { messageType: "ATTITUDE", field: "yaw", label: "Yaw", unit: "rad" },
    ],
  },
  {
    key: "altitude",
    title: "Altitude preview",
    description: "Bounded altitude context for the active replay window and range export.",
    supportsAltitudePreview: true,
    selectorSeeds: [
      { messageType: "VFR_HUD", field: "alt", label: "Altitude", unit: "m" },
      { messageType: "GLOBAL_POSITION_INT", field: "relative_alt", label: "Relative altitude", unit: "mm" },
    ],
  },
  {
    key: "power",
    title: "Power",
    description: "Battery voltage, current, and remaining percentage when present.",
    selectorSeeds: [
      { messageType: "SYS_STATUS", field: "voltage_battery", label: "Voltage", unit: "mV" },
      { messageType: "SYS_STATUS", field: "current_battery", label: "Current", unit: "cA" },
      { messageType: "SYS_STATUS", field: "battery_remaining", label: "Remaining", unit: "%" },
    ],
  },
];

const BIN_GROUPS: GroupSeed[] = [
  {
    key: "attitude",
    title: "Attitude",
    description: "Roll, pitch, and yaw from indexed BIN attitude packets.",
    selectorSeeds: [
      { messageType: "ATT", field: "Roll", label: "Roll", unit: "deg" },
      { messageType: "ATT", field: "Pitch", label: "Pitch", unit: "deg" },
      { messageType: "ATT", field: "Yaw", label: "Yaw", unit: "deg" },
    ],
  },
  {
    key: "altitude",
    title: "Altitude preview",
    description: "Altitude preview stays bounded to the selected replay range.",
    supportsAltitudePreview: true,
    selectorSeeds: [
      { messageType: "CTUN", field: "Alt", label: "Altitude", unit: "m" },
      { messageType: "BARO", field: "Alt", label: "Barometer altitude", unit: "m" },
    ],
  },
  {
    key: "power",
    title: "Power",
    description: "Voltage and current trends from battery packets.",
    selectorSeeds: [
      { messageType: "BAT", field: "Volt", label: "Voltage", unit: "V" },
      { messageType: "BAT", field: "Curr", label: "Current", unit: "A" },
      { messageType: "BAT", field: "RemPct", label: "Remaining", unit: "%" },
    ],
  },
];

function createSelector(seed: SelectorSeed): ChartSeriesSelector {
  return {
    message_type: seed.messageType,
    field: seed.field,
    label: seed.label,
    unit: seed.unit,
  };
}

function isChartQueryable(entry: LogLibraryEntry): boolean {
  const replayableStatus = entry.status === "ready" || entry.status === "partial";
  return replayableStatus && entry.source.status.kind === "available" && entry.index !== null;
}

export function getLogChartGroups(entry: LogLibraryEntry | null): LogChartGroup[] {
  if (!entry) {
    return [];
  }

  const availableMessageTypes = new Set(Object.keys(entry.metadata.message_types));
  const groups = entry.metadata.format === "bin" ? BIN_GROUPS : TLOG_GROUPS;
  const chartQueryable = isChartQueryable(entry);

  return groups.map((group) => {
    const selectors = group.selectorSeeds
      .filter((seed) => availableMessageTypes.has(seed.messageType))
      .map(createSelector);
    const hasSupportedSelectors = selectors.length > 0;
    const supported = chartQueryable && hasSupportedSelectors;

    return {
      key: group.key,
      title: group.title,
      description: group.description,
      selectors,
      supported,
      emptyReason: !hasSupportedSelectors
        ? `No indexed ${group.selectorSeeds.map((seed) => seed.messageType).join("/")} data is available for this ${entry.metadata.format.toUpperCase()} log.`
        : !chartQueryable
          ? "Charts stay disabled until the selected log is ready, linked, and indexed for replay-safe queries."
          : "",
      supportsAltitudePreview: Boolean(group.supportsAltitudePreview),
    } satisfies LogChartGroup;
  });
}

export function getDefaultChartGroupKey(groups: LogChartGroup[]): string | null {
  return groups.find((group) => group.supported)?.key ?? null;
}

export function getChartMessageTypeFilters(group: LogChartGroup | null): string[] {
  if (!group) {
    return [];
  }

  return [...new Set(group.selectors.map((selector) => selector.message_type))];
}
