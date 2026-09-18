import type { ParamMetadataMap } from "../../param-metadata";
import { isNonNullParam, type NonNullParam, type ParamStore } from "../../params";
import {
  buildParameterItemModel,
  buildParameterItemModels,
  type ParameterItemModel,
} from "./parameter-item-model";

export type ParameterWorkspaceItem = ParameterItemModel;

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

  const paramsByName = new Map(
    Object.values(paramStore.params ?? {})
      .filter(isNonNullParam)
      .map((param) => [param.name, param]),
  );
  const sections = starterSections
    .map((section) => {
      const items = section.paramNames
        .map((name) => paramsByName.get(name) ?? null)
        .filter((param): param is NonNullParam => param !== null)
        .map((param) => buildParameterItemModel(param, metadata));

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

  const fallbackItems = buildParameterItemModels(paramStore, metadata).slice(0, 6);

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
