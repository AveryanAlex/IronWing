import { pascalToDisplay } from "../mission-command-names";
import { COMMAND_DEFINITIONS, type CommandKey } from "../mission-command-definitions";
import type { CatalogEntry } from "./types";

export const COMMAND_CATALOG: CatalogEntry[] = (Object.keys(COMMAND_DEFINITIONS) as CommandKey[]).map((key) => {
  const [category, variant] = key.split(":");
  // Keys are checked against SDK unions in COMMAND_DEFINITIONS.
  return { category, variant, id: COMMAND_DEFINITIONS[key].id, label: pascalToDisplay(variant) } as CatalogEntry;
});

const CATALOG_BY_VARIANT = new Map<string, CatalogEntry>(
    COMMAND_CATALOG.map((entry) => [`${entry.category}:${entry.variant}`, entry] as const),
);
const CATALOG_BY_ID = new Map(COMMAND_CATALOG.map((entry) => [entry.id, entry] as const));

export function variantToCommandId(
    category: CatalogEntry["category"],
    variant: string,
): number | undefined {
    return CATALOG_BY_VARIANT.get(`${category}:${variant}`)?.id;
}

export function commandIdToVariant(id: number): CatalogEntry | undefined {
    const entry = CATALOG_BY_ID.get(id);
    return entry ? { ...entry } : undefined;
}

export function getCommandCatalog(): CatalogEntry[] {
    return COMMAND_CATALOG.map((entry) => ({ ...entry }));
}
