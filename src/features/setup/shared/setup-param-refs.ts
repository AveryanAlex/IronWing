import type { ParameterItemModel } from "../../../lib/params/parameter-item-model";

export type SetupParamRef = Readonly<{
  id: string;
  aliases?: readonly string[];
}>;

export function resolveSetupParamRef(
  ref: SetupParamRef,
  itemIndex: ReadonlyMap<string, ParameterItemModel>,
): ParameterItemModel | null {
  for (const id of [ref.id, ...(ref.aliases ?? [])]) {
    const item = itemIndex.get(id);
    if (item) {
      return item;
    }
  }

  return null;
}

export function resolveSetupParamRefs(
  refs: readonly SetupParamRef[],
  itemIndex: ReadonlyMap<string, ParameterItemModel>,
): ParameterItemModel[] {
  return refs.flatMap((ref) => {
    const item = resolveSetupParamRef(ref, itemIndex);
    return item ? [item] : [];
  });
}

export function indexedSetupParamRefs(
  prefix: string,
  index: number,
  suffixes: readonly string[],
): SetupParamRef[] {
  const indexedPrefix = `${prefix}${index === 1 ? "" : index}_`;
  return suffixes.map((suffix) => ({ id: `${indexedPrefix}${suffix}` }));
}

export function discoverIndexedSetupParamNumbers(names: Iterable<string>, prefix: string): number[] {
  const pattern = new RegExp(`^${escapeRegExp(prefix)}(\\d*)_`);
  const indexes = new Set<number>();

  for (const name of names) {
    const match = pattern.exec(name);
    if (!match) {
      continue;
    }

    const index = match[1] ? Number(match[1]) : 1;
    if (Number.isInteger(index) && index > 0) {
      indexes.add(index);
    }
  }

  return [...indexes].sort((left, right) => left - right);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
