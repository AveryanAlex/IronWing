import type { ParamMetadataMap } from "../../param-metadata";
import type { Param, ParamStore } from "../../params";

export type ParameterWorkspaceItem = {
  name: string;
  label: string;
  description: string | null;
  value: number;
  valueText: string;
  units: string | null;
  rebootRequired: boolean;
  rawName: string;
  order: number;
  increment: number | null;
  range: { min: number; max: number } | null;
  readOnly: boolean;
};

export type ParameterWorkspaceSection = {
  id: string;
  title: string;
  description: string;
  items: ParameterWorkspaceItem[];
  mode: "curated" | "fallback";
};

type ParameterWorkspaceSectionDefinition = {
  id: string;
  title: string;
  description: string;
  paramNames: string[];
};

const starterSections: ParameterWorkspaceSectionDefinition[] = [
  {
    id: "safety",
    title: "Safety and arming",
    description: "Frequently used settings for arming checks and failsafe behavior.",
    paramNames: ["ARMING_CHECK", "FS_THR_ENABLE", "BATT_MONITOR"],
  },
  {
    id: "flight-feel",
    title: "Pilot feel",
    description: "Common flight-response settings pilots usually adjust together.",
    paramNames: ["PILOT_THR_FILT", "ANGLE_MAX", "CRUISE_SPEED"],
  },
  {
    id: "navigation",
    title: "Navigation defaults",
    description: "Common navigation values often checked before flight.",
    paramNames: ["RTL_ALT", "WPNAV_SPEED", "WP_RADIUS"],
  },
];

const fallbackSection: Pick<ParameterWorkspaceSection, "id" | "title" | "description" | "mode"> = {
  id: "available-now",
  title: "Available now",
  description: "Showing a short list of reported settings available for review now.",
  mode: "fallback",
};

export function buildParameterWorkspaceSections(
  paramStore: ParamStore | null,
  metadata: ParamMetadataMap | null,
): ParameterWorkspaceSection[] {
  if (!paramStore) {
    return [];
  }

  const sorted = Object.values(paramStore.params ?? {}).sort((left, right) => left.index - right.index);
  const used = new Set<string>();
  const sections = starterSections
    .map((section) => {
      const items = section.paramNames
        .map((name) => paramStore.params[name])
        .filter((param): param is Param => Boolean(param))
        .map((param) => {
          used.add(param.name);
          return toWorkspaceItem(param, metadata);
        });

      return {
        id: section.id,
        title: section.title,
        description: section.description,
        items,
        mode: "curated" as const,
      };
    })
    .filter((section) => section.items.length > 0);

  if (sections.length > 0) {
    return sections;
  }

  const fallbackItems = sorted
    .filter((param) => !used.has(param.name))
    .slice(0, 6)
    .map((param) => toWorkspaceItem(param, metadata));

  if (fallbackItems.length === 0) {
    return [];
  }

  return [
    {
      ...fallbackSection,
      items: fallbackItems,
    },
  ];
}

function toWorkspaceItem(param: Param, metadata: ParamMetadataMap | null): ParameterWorkspaceItem {
  const meta = metadata?.get(param.name);

  return {
    name: param.name,
    rawName: param.name,
    label: meta?.humanName?.trim() || param.name,
    description: meta?.description?.trim() || null,
    value: param.value,
    valueText: formatParamValue(param.value),
    units: meta?.unitText?.trim() || meta?.units?.trim() || null,
    rebootRequired: meta?.rebootRequired === true,
    order: param.index,
    increment: typeof meta?.increment === "number" && Number.isFinite(meta.increment) ? meta.increment : null,
    range:
      typeof meta?.range?.min === "number"
      && Number.isFinite(meta.range.min)
      && typeof meta?.range?.max === "number"
      && Number.isFinite(meta.range.max)
        ? { min: meta.range.min, max: meta.range.max }
        : null,
    readOnly: meta?.readOnly === true,
  };
}

export function formatParamValue(value: number): string {
  if (!Number.isFinite(value)) {
    return "--";
  }

  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(3).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}
