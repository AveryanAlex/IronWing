import type { ParamStore } from "../../params";
import type { StagedParameterEdit } from "../stores/params";

export const OSD_DEFAULT_COLUMNS = 30;
export const OSD_DEFAULT_ROWS = 16;

export type OsdParamRole = "enable" | "x" | "y";

export type OsdItemParamNames = {
  enable: string | null;
  x: string | null;
  y: string | null;
};

export type OsdItemModel = {
  key: string;
  label: string;
  screen: number;
  enabled: boolean;
  x: number;
  y: number;
  displayX: number;
  displayY: number;
  rawX: number | null;
  rawY: number | null;
  xOutOfRange: boolean;
  yOutOfRange: boolean;
  params: OsdItemParamNames;
  complete: boolean;
  staged: {
    enable: boolean;
    x: boolean;
    y: boolean;
  };
};

export type OsdScreenModel = {
  screen: number;
  label: string;
  enabled: boolean | null;
  enableParamName: string | null;
  txtResParamName: string | null;
  txtResValue: number | null;
  txtResStaged: boolean;
  grid: OsdGridModel;
  items: OsdItemModel[];
  enabledItems: OsdItemModel[];
};

export type OsdGridModel = {
  columns: number;
  rows: number;
  label: string;
};

export type ArduPilotOsdModel = {
  grid: OsdGridModel;
  screens: OsdScreenModel[];
  itemCount: number;
  enabledItemCount: number;
  hasOsdParams: boolean;
};

type DetectedItem = {
  key: string;
  params: OsdItemParamNames;
};

const ITEM_PARAM_PATTERN = /^OSD([1-4])_(.+)_(EN|X|Y)$/;
const SCREEN_ENABLE_PATTERN = /^OSD([1-4])_ENABLE$/;
const SCREEN_TEXT_RES_PATTERN = /^OSD([1-4])_TXT_RES$/;
const DEFAULT_GRID: OsdGridModel = {
  columns: OSD_DEFAULT_COLUMNS,
  rows: OSD_DEFAULT_ROWS,
  label: "SD 30 x 16",
};

export function buildArduPilotOsdModel(input: {
  paramStore: ParamStore | null;
  stagedEdits?: Record<string, Pick<StagedParameterEdit, "nextValue">>;
  columns?: number;
  rows?: number;
}): ArduPilotOsdModel {
  const stagedEdits = input.stagedEdits ?? {};
  const fallbackGrid = {
    columns: normalizeGridSize(input.columns, OSD_DEFAULT_COLUMNS),
    rows: normalizeGridSize(input.rows, OSD_DEFAULT_ROWS),
    label: input.columns || input.rows ? `${normalizeGridSize(input.columns, OSD_DEFAULT_COLUMNS)} x ${normalizeGridSize(input.rows, OSD_DEFAULT_ROWS)}` : DEFAULT_GRID.label,
  };
  const screenItems = new Map<number, Map<string, DetectedItem>>();
  const screenEnableNames = new Map<number, string>();
  const screenTextResNames = new Map<number, string>();
  const params = input.paramStore?.params ?? {};

  for (const name of Object.keys(params)) {
    const itemMatch = ITEM_PARAM_PATTERN.exec(name);
    if (itemMatch) {
      const screen = Number(itemMatch[1]);
      const key = itemMatch[2] ?? "";
      const role = roleFromSuffix(itemMatch[3]);
      if (!role || key.length === 0) {
        continue;
      }

      const byItem = screenItems.get(screen) ?? new Map<string, DetectedItem>();
      const item = byItem.get(key) ?? {
        key,
        params: { enable: null, x: null, y: null },
      };
      item.params[role] = name;
      byItem.set(key, item);
      screenItems.set(screen, byItem);
      continue;
    }

    const screenMatch = SCREEN_ENABLE_PATTERN.exec(name);
    if (screenMatch) {
      screenEnableNames.set(Number(screenMatch[1]), name);
      continue;
    }

    const txtResMatch = SCREEN_TEXT_RES_PATTERN.exec(name);
    if (txtResMatch) {
      screenTextResNames.set(Number(txtResMatch[1]), name);
    }
  }

  const screenNumbers = new Set<number>([
    ...screenItems.keys(),
    ...screenEnableNames.keys(),
    ...screenTextResNames.keys(),
  ]);
  const screens = [...screenNumbers]
    .sort((left, right) => left - right)
    .map((screen): OsdScreenModel => {
      const enableParamName = screenEnableNames.get(screen) ?? null;
      const txtResParamName = screenTextResNames.get(screen) ?? null;
      const txtResValue = txtResParamName ? effectiveParamValue(txtResParamName, params, stagedEdits) : null;
      const grid = resolveGridForTextResolution(txtResValue, fallbackGrid);
      const items = [...(screenItems.get(screen)?.values() ?? [])]
        .map((item) => buildOsdItem(item, screen, params, stagedEdits, grid))
        .sort((left, right) => left.y - right.y || left.x - right.x || left.label.localeCompare(right.label));

      return {
        screen,
        label: `Screen ${screen}`,
        enabled: enableParamName ? numericBoolean(effectiveParamValue(enableParamName, params, stagedEdits)) : null,
        enableParamName,
        txtResParamName,
        txtResValue,
        txtResStaged: txtResParamName ? txtResParamName in stagedEdits : false,
        grid,
        items,
        enabledItems: items.filter((item) => item.enabled),
      };
    });

  const itemCount = screens.reduce((count, screen) => count + screen.items.length, 0);
  const enabledItemCount = screens.reduce((count, screen) => count + screen.enabledItems.length, 0);

  return {
    grid: fallbackGrid,
    screens,
    itemCount,
    enabledItemCount,
    hasOsdParams: itemCount > 0,
  };
}

export function clampOsdCoordinate(value: number, axis: "x" | "y", grid: OsdGridModel): number {
  const max = axis === "x" ? grid.columns - 1 : grid.rows - 1;
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(max, Math.round(value)));
}

function buildOsdItem(
  item: DetectedItem,
  screen: number,
  params: ParamStore["params"],
  stagedEdits: Record<string, Pick<StagedParameterEdit, "nextValue">>,
  grid: OsdGridModel,
): OsdItemModel {
  const enableValue = item.params.enable ? effectiveParamValue(item.params.enable, params, stagedEdits) : null;
  const rawX = item.params.x ? effectiveParamValue(item.params.x, params, stagedEdits) : null;
  const rawY = item.params.y ? effectiveParamValue(item.params.y, params, stagedEdits) : null;
  const x = normalizeCoordinateValue(rawX);
  const y = normalizeCoordinateValue(rawY);

  return {
    key: item.key,
    label: formatItemLabel(item.key),
    screen,
    enabled: numericBoolean(enableValue) ?? false,
    x,
    y,
    displayX: clampOsdCoordinate(x, "x", grid),
    displayY: clampOsdCoordinate(y, "y", grid),
    rawX,
    rawY,
    xOutOfRange: isOutOfRange(x, "x", grid),
    yOutOfRange: isOutOfRange(y, "y", grid),
    params: item.params,
    complete: item.params.enable !== null && item.params.x !== null && item.params.y !== null,
    staged: {
      enable: item.params.enable ? item.params.enable in stagedEdits : false,
      x: item.params.x ? item.params.x in stagedEdits : false,
      y: item.params.y ? item.params.y in stagedEdits : false,
    },
  };
}

function effectiveParamValue(
  name: string,
  params: ParamStore["params"],
  stagedEdits: Record<string, Pick<StagedParameterEdit, "nextValue">>,
): number | null {
  const staged = stagedEdits[name]?.nextValue;
  if (typeof staged === "number" && Number.isFinite(staged)) {
    return staged;
  }

  const value = params[name]?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numericBoolean(value: number | null): boolean | null {
  return value === null ? null : value !== 0;
}

function roleFromSuffix(suffix: string | undefined): OsdParamRole | null {
  switch (suffix) {
    case "EN":
      return "enable";
    case "X":
      return "x";
    case "Y":
      return "y";
    default:
      return null;
  }
}

function normalizeGridSize(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function normalizeCoordinateValue(value: number | null): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
}

function isOutOfRange(value: number, axis: "x" | "y", grid: OsdGridModel): boolean {
  const max = axis === "x" ? grid.columns - 1 : grid.rows - 1;
  return value < 0 || value > max;
}

function resolveGridForTextResolution(value: number | null, fallbackGrid: OsdGridModel): OsdGridModel {
  switch (value) {
    case 0:
      return DEFAULT_GRID;
    case 1:
      return { columns: 50, rows: 18, label: "HD 50 x 18" };
    case 3:
      return { columns: 60, rows: 22, label: "HD 60 x 22" };
    default:
      return fallbackGrid;
  }
}

function formatItemLabel(key: string): string {
  return key
    .split("_")
    .filter(Boolean)
    .map((part) => part.slice(0, 1) + part.slice(1).toLowerCase())
    .join(" ");
}
