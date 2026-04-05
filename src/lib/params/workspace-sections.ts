import type { ParamMetadataMap } from "../../param-metadata";
import type { ParamStore } from "../../params";
import {
  buildParameterItemIndex,
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

  const itemIndex = buildParameterItemIndex(paramStore, metadata);
  const sorted = buildParameterItemModels(paramStore, metadata);
  const used = new Set<string>();
  const sections = starterSections
    .map((section) => {
      const items = section.paramNames
        .map((name) => itemIndex.get(name) ?? null)
        .filter((item): item is ParameterWorkspaceItem => Boolean(item))
        .map((item) => {
          used.add(item.name);
          return item;
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
    .filter((item) => !used.has(item.name))
    .slice(0, 6);

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
