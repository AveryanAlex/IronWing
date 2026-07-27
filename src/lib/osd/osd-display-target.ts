export const OSD_DISPLAY_TARGET_STORAGE_KEY = "ironwing.setup.osd.display_target";

export const OSD_TEXT_RESOLUTION_MODES = [0, 1, 2, 3] as const;

export type OsdTextResolutionMode = (typeof OSD_TEXT_RESOLUTION_MODES)[number];
export type OsdDisplayTargetSource = "preset" | "manual";
export type OsdDisplayTargetId =
  | "walksnail_avatar"
  | "hdzero"
  | "dji_wtfos"
  | "dji_native"
  | "generic";

export type OsdDisplayTargetSelection = {
  targetId: OsdDisplayTargetId;
  txtResMode: OsdTextResolutionMode;
  columns: number;
  rows: number;
  source: OsdDisplayTargetSource;
};

export type OsdDisplayTargetPreset = OsdDisplayTargetSelection & {
  source: "preset";
  label: string;
  description: string;
};

export type OsdDisplayGridOption = {
  id: string;
  columns: number;
  rows: number;
  label: string;
};

export type OsdDisplayTargetCompatibility = "verified" | "missing" | "mismatch";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const OSD_DISPLAY_GRID_OPTIONS: readonly OsdDisplayGridOption[] = [
  { id: "30x16", columns: 30, rows: 16, label: "30 × 16" },
  { id: "50x18", columns: 50, rows: 18, label: "50 × 18" },
  { id: "53x20", columns: 53, rows: 20, label: "53 × 20" },
  { id: "60x22", columns: 60, rows: 22, label: "60 × 22" },
];

export const OSD_DISPLAY_TARGET_PRESETS: readonly OsdDisplayTargetPreset[] = [
  {
    targetId: "walksnail_avatar",
    label: "Walksnail Avatar",
    description: "Avatar DisplayPort grid",
    txtResMode: 3,
    columns: 53,
    rows: 20,
    source: "preset",
  },
  {
    targetId: "hdzero",
    label: "HDZero",
    description: "HDZero DisplayPort grid",
    txtResMode: 1,
    columns: 50,
    rows: 18,
    source: "preset",
  },
  {
    targetId: "dji_wtfos",
    label: "DJI WTFOS / msp-osd",
    description: "WTFOS and msp-osd grid",
    txtResMode: 3,
    columns: 60,
    rows: 22,
    source: "preset",
  },
  {
    targetId: "dji_native",
    label: "DJI Native / Betaflight HD",
    description: "DJI native Betaflight-compatible HD grid",
    txtResMode: 3,
    columns: 53,
    rows: 20,
    source: "preset",
  },
];

export const OSD_DISPLAY_TARGET_OPTIONS = [
  ...OSD_DISPLAY_TARGET_PRESETS.map((preset) => ({
    value: preset.targetId,
    label: preset.label,
  })),
  { value: "generic", label: "Generic / manual" },
] as const;

export function osdDisplayTargetPreset(
  targetId: Exclude<OsdDisplayTargetId, "generic">,
): OsdDisplayTargetSelection {
  const preset = OSD_DISPLAY_TARGET_PRESETS.find((candidate) => candidate.targetId === targetId);
  if (!preset) {
    throw new Error(`Unknown OSD display target preset: ${targetId}`);
  }

  return selectionFromPreset(preset);
}

export function createManualOsdDisplayTarget(
  txtResMode: OsdTextResolutionMode,
  grid: Pick<OsdDisplayGridOption, "columns" | "rows">,
): OsdDisplayTargetSelection {
  return {
    targetId: "generic",
    txtResMode,
    columns: grid.columns,
    rows: grid.rows,
    source: "manual",
  };
}

export function osdDisplayTargetLabel(selection: OsdDisplayTargetSelection): string {
  if (selection.source === "manual") {
    return "Generic / manual";
  }

  return OSD_DISPLAY_TARGET_PRESETS.find((preset) => preset.targetId === selection.targetId)?.label
    ?? selection.targetId;
}

export function osdDisplayTargetGridLabel(selection: OsdDisplayTargetSelection): string {
  return `${osdDisplayTargetLabel(selection)} ${selection.columns} x ${selection.rows}`;
}

export function osdDisplayGridOption(selection: Pick<OsdDisplayTargetSelection, "columns" | "rows">): OsdDisplayGridOption | null {
  return OSD_DISPLAY_GRID_OPTIONS.find((grid) => (
    grid.columns === selection.columns && grid.rows === selection.rows
  )) ?? null;
}

export function osdDisplayTargetCompatibility(
  selection: OsdDisplayTargetSelection | null,
  effectiveTxtResMode: number | null,
): OsdDisplayTargetCompatibility {
  if (!selection) {
    return "missing";
  }

  return effectiveTxtResMode === selection.txtResMode ? "verified" : "mismatch";
}

export function loadOsdDisplayTargetSelection(
  storage: StorageLike | null = browserStorage(),
): OsdDisplayTargetSelection | null {
  if (!storage) {
    return null;
  }

  let raw: string | null = null;
  try {
    raw = storage.getItem(OSD_DISPLAY_TARGET_STORAGE_KEY);
    if (raw === null) {
      return null;
    }

    const selection = parseOsdDisplayTargetSelection(JSON.parse(raw));
    if (selection) {
      return selection;
    }
  } catch {
    // Invalid or unavailable storage is handled like a missing preference.
  }

  try {
    storage.removeItem(OSD_DISPLAY_TARGET_STORAGE_KEY);
  } catch {
    // The invalid preference remains harmless when storage cannot be changed.
  }
  return null;
}

export function saveOsdDisplayTargetSelection(
  selection: OsdDisplayTargetSelection | null,
  storage: StorageLike | null = browserStorage(),
): void {
  if (!storage) {
    return;
  }

  try {
    if (selection === null) {
      storage.removeItem(OSD_DISPLAY_TARGET_STORAGE_KEY);
      return;
    }

    const validated = parseOsdDisplayTargetSelection(selection);
    if (!validated) {
      storage.removeItem(OSD_DISPLAY_TARGET_STORAGE_KEY);
      return;
    }

    storage.setItem(OSD_DISPLAY_TARGET_STORAGE_KEY, JSON.stringify(validated));
  } catch {
    // The in-memory preference remains usable when persistence is unavailable.
  }
}

export function parseOsdDisplayTargetSelection(value: unknown): OsdDisplayTargetSelection | null {
  if (!isRecord(value)) {
    return null;
  }

  const { targetId, txtResMode, columns, rows, source } = value;
  if (!isTextResolutionMode(txtResMode) || !Number.isInteger(columns) || !Number.isInteger(rows)) {
    return null;
  }

  if (source === "manual" && targetId === "generic") {
    const grid = OSD_DISPLAY_GRID_OPTIONS.find((candidate) => (
      candidate.columns === columns && candidate.rows === rows
    ));
    return grid ? createManualOsdDisplayTarget(txtResMode, grid) : null;
  }

  if (source !== "preset" || typeof targetId !== "string") {
    return null;
  }

  const preset = OSD_DISPLAY_TARGET_PRESETS.find((candidate) => candidate.targetId === targetId);
  if (
    !preset
    || preset.txtResMode !== txtResMode
    || preset.columns !== columns
    || preset.rows !== rows
  ) {
    return null;
  }

  return selectionFromPreset(preset);
}

function selectionFromPreset(preset: OsdDisplayTargetPreset): OsdDisplayTargetSelection {
  return {
    targetId: preset.targetId,
    txtResMode: preset.txtResMode,
    columns: preset.columns,
    rows: preset.rows,
    source: preset.source,
  };
}

function isTextResolutionMode(value: unknown): value is OsdTextResolutionMode {
  return typeof value === "number"
    && OSD_TEXT_RESOLUTION_MODES.some((candidate) => candidate === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function browserStorage(): StorageLike | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}
