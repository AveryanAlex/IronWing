export type TriState = "all" | "some" | "none";

export function computeTriState(items: readonly string[], selected: ReadonlySet<string>): TriState {
  if (items.length === 0) return "none";
  let count = 0;
  for (const item of items) {
    if (selected.has(item)) count++;
  }
  if (count === 0) return "none";
  if (count === items.length) return "all";
  return "some";
}

/** Toggle a group: all selected → deselect all; otherwise → select all. */
export function toggleGroup(
  groupItems: readonly string[],
  selected: ReadonlySet<string>,
): Set<string> {
  const next = new Set(selected);
  const state = computeTriState(groupItems, selected);
  if (state === "all") {
    for (const item of groupItems) next.delete(item);
  } else {
    for (const item of groupItems) next.add(item);
  }
  return next;
}

export function toggleItem(name: string, selected: ReadonlySet<string>): Set<string> {
  const next = new Set(selected);
  if (next.has(name)) {
    next.delete(name);
  } else {
    next.add(name);
  }
  return next;
}

export function selectAll(allItems: readonly string[]): Set<string> {
  return new Set(allItems);
}

export function selectNone(): Set<string> {
  return new Set();
}
