import type { MissionItem, MissionFrame, MissionPlan, MissionType, HomePosition } from "../mission";

export function defaultCommandForMissionType(missionType: MissionType): number {
  switch (missionType) {
    case "fence": return 5002; // NAV_FENCE_POLYGON_VERTEX_INCLUSION
    case "rally": return 5100; // NAV_RALLY_POINT
    default: return 16;       // NAV_WAYPOINT
  }
}

export function defaultFrameForMissionType(missionType: MissionType): MissionFrame {
  switch (missionType) {
    case "fence": return "global_int";
    default: return "global_relative_alt_int";
  }
}

let nextUiId = 1;

export function _resetUiIdCounter(): void {
  nextUiId = 1;
}

export function allocateUiId(): number {
  return nextUiId++;
}

export type DraftItem = {
  readonly uiId: number;
  readonly item: MissionItem;
};

export type DraftSnapshot = {
  readonly items: ReadonlyArray<DraftItem>;
  readonly home: HomePosition | null;
};

export type DraftState = {
  items: DraftItem[];
  selectedUiId: number | null;
  snapshot: DraftSnapshot;
};

export function wrapItem(item: MissionItem): DraftItem {
  return { uiId: allocateUiId(), item };
}

export function wrapItems(items: MissionItem[]): DraftItem[] {
  return items.map(wrapItem);
}

export function createEmptyDraft(): DraftState {
  return {
    items: [],
    selectedUiId: null,
    snapshot: { items: [], home: null },
  };
}

function resequenceItems(drafts: DraftItem[]): DraftItem[] {
  return drafts.map((d, index) => ({
    ...d,
    item: { ...d.item, seq: index, current: index === 0 },
  }));
}

function createDefaultItem(
  seq: number,
  latDeg: number,
  lonDeg: number,
  altitudeM: number,
  missionType: MissionType = "mission",
): MissionItem {
  return {
    seq,
    command: defaultCommandForMissionType(missionType),
    frame: defaultFrameForMissionType(missionType),
    current: seq === 0,
    autocontinue: true,
    param1: 0,
    param2: missionType === "mission" ? 1 : 0,
    param3: 0,
    param4: 0,
    x: Math.round(latDeg * 1e7),
    y: Math.round(lonDeg * 1e7),
    z: altitudeM,
  };
}

export function addWaypoint(state: DraftState, missionType: MissionType = "mission"): DraftState {
  const { items } = state;
  const last = items[items.length - 1];
  let newItem: MissionItem;
  if (!last) {
    newItem = createDefaultItem(0, 0, 0, 25, missionType);
  } else {
    newItem = createDefaultItem(
      items.length,
      last.item.x / 1e7 + 0.0004,
      last.item.y / 1e7 + 0.0004,
      last.item.z,
      missionType,
    );
  }
  const draft = wrapItem(newItem);
  const next = resequenceItems([...items, draft]);
  return { ...state, items: next, selectedUiId: draft.uiId };
}

export function addWaypointAt(
  state: DraftState,
  latDeg: number,
  lonDeg: number,
  missionType: MissionType = "mission",
): DraftState {
  const { items } = state;
  const alt = items[items.length - 1]?.item.z ?? 25;
  const newItem = createDefaultItem(items.length, latDeg, lonDeg, alt, missionType);
  const draft = wrapItem(newItem);
  const next = resequenceItems([...items, draft]);
  return { ...state, items: next, selectedUiId: draft.uiId };
}

export function insertBefore(state: DraftState, index: number, missionType: MissionType = "mission"): DraftState {
  const { items } = state;
  if (items.length === 0) {
    const draft = wrapItem(createDefaultItem(0, 0, 0, 25, missionType));
    return { ...state, items: [draft], selectedUiId: draft.uiId };
  }
  const insertAt = Math.max(0, Math.min(index, items.length));
  const before = items[insertAt - 1];
  const after = items[insertAt];
  const seed = before ?? after;
  if (!seed) {
    const draft = wrapItem(createDefaultItem(0, 0, 0, 25, missionType));
    return { ...state, items: [draft], selectedUiId: draft.uiId };
  }

  let lat = seed.item.x / 1e7;
  let lon = seed.item.y / 1e7;
  let alt = seed.item.z;
  if (before && after) {
    lat = (before.item.x + after.item.x) / 2 / 1e7;
    lon = (before.item.y + after.item.y) / 2 / 1e7;
    alt = (before.item.z + after.item.z) / 2;
  } else if (before) {
    lat += 0.0004;
    lon += 0.0004;
  } else {
    lat -= 0.0004;
    lon -= 0.0004;
  }

  const draft = wrapItem(createDefaultItem(0, lat, lon, alt, missionType));
  const next = [...items];
  next.splice(insertAt, 0, draft);
  return { ...state, items: resequenceItems(next), selectedUiId: draft.uiId };
}

export function insertAfter(state: DraftState, index: number, missionType: MissionType = "mission"): DraftState {
  return insertBefore(state, index + 1, missionType);
}

export function deleteAt(state: DraftState, index: number): DraftState {
  const { items, selectedUiId } = state;
  if (index < 0 || index >= items.length) return state;

  const next = [...items];
  next.splice(index, 1);
  const reseq = resequenceItems(next);

  const deletedUiId = items[index].uiId;
  let newSelectedUiId = selectedUiId;
  if (selectedUiId === deletedUiId) {
    if (reseq.length === 0) {
      newSelectedUiId = null;
    } else {
      const newIndex = Math.min(index, reseq.length - 1);
      newSelectedUiId = reseq[newIndex].uiId;
    }
  }

  return { ...state, items: reseq, selectedUiId: newSelectedUiId };
}

export function moveUp(state: DraftState, index: number): DraftState {
  if (index <= 0) return state;
  const { items } = state;
  const next = [...items];
  const [moved] = next.splice(index, 1);
  if (!moved) return state;
  next.splice(index - 1, 0, moved);
  return { ...state, items: resequenceItems(next) };
}

export function moveDown(state: DraftState, index: number): DraftState {
  const { items } = state;
  if (index >= items.length - 1) return state;
  const next = [...items];
  const [moved] = next.splice(index, 1);
  if (!moved) return state;
  next.splice(index + 1, 0, moved);
  return { ...state, items: resequenceItems(next) };
}

export function reorderItems(
  state: DraftState,
  fromUiId: number,
  toUiId: number,
): DraftState {
  const { items } = state;
  const fromIndex = items.findIndex((d) => d.uiId === fromUiId);
  const toIndex = items.findIndex((d) => d.uiId === toUiId);
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return state;

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return { ...state, items: resequenceItems(next) };
}

export function insertItemsAfter(
  state: DraftState,
  index: number,
  newMissionItems: MissionItem[],
): DraftState {
  if (newMissionItems.length === 0) return state;
  const wrapped = wrapItems(newMissionItems);
  const insertAt = Math.max(0, index + 1);
  const next = [...state.items];
  next.splice(insertAt, 0, ...wrapped);
  return { ...state, items: resequenceItems(next), selectedUiId: wrapped[0].uiId };
}

export function replaceAllItems(
  state: DraftState,
  newMissionItems: MissionItem[],
): DraftState {
  const wrapped = wrapItems(newMissionItems);
  return { ...state, items: resequenceItems(wrapped), selectedUiId: null };
}

export type NumericItemField = "command" | "z" | "param1" | "param2" | "param3" | "param4";

export function updateField(
  state: DraftState,
  index: number,
  field: NumericItemField,
  value: number,
): DraftState {
  const { items } = state;
  return {
    ...state,
    items: items.map((d, i) =>
      i === index ? { ...d, item: { ...d.item, [field]: value } } : d,
    ),
  };
}

export function updateFrame(
  state: DraftState,
  index: number,
  frame: MissionFrame,
): DraftState {
  const { items } = state;
  return {
    ...state,
    items: items.map((d, i) =>
      i === index ? { ...d, item: { ...d.item, frame } } : d,
    ),
  };
}

export function updateCoordinate(
  state: DraftState,
  index: number,
  field: "x" | "y",
  valueDeg: number,
): DraftState {
  const encoded = Math.round(valueDeg * 1e7);
  const { items } = state;
  return {
    ...state,
    items: items.map((d, i) =>
      i === index ? { ...d, item: { ...d.item, [field]: encoded } } : d,
    ),
  };
}

export function moveWaypointOnMap(
  state: DraftState,
  seq: number,
  latDeg: number,
  lonDeg: number,
): DraftState {
  const { items } = state;
  return {
    ...state,
    items: items.map((d) =>
      d.item.seq === seq
        ? { ...d, item: { ...d.item, x: Math.round(latDeg * 1e7), y: Math.round(lonDeg * 1e7) } }
        : d,
    ),
  };
}

export function setSelectedByUiId(
  state: DraftState,
  uiId: number | null,
): DraftState {
  return { ...state, selectedUiId: uiId };
}

export function selectBySeq(
  state: DraftState,
  seq: number | null,
): DraftState {
  if (seq === null) return { ...state, selectedUiId: null };
  const found = state.items.find((d) => d.item.seq === seq);
  return { ...state, selectedUiId: found?.uiId ?? null };
}

export function takeSnapshot(
  state: DraftState,
  home: HomePosition | null,
): DraftState {
  return {
    ...state,
    snapshot: { items: [...state.items], home },
  };
}

export function clearDraft(): DraftState {
  return createEmptyDraft();
}

export function isDirty(state: DraftState, currentHome: HomePosition | null): boolean {
  const { items, snapshot } = state;

  if (items.length !== snapshot.items.length) return true;

  for (let i = 0; i < items.length; i++) {
    const a = items[i].item;
    const b = snapshot.items[i].item;
    if (
      a.command !== b.command ||
      a.frame !== b.frame ||
      a.x !== b.x ||
      a.y !== b.y ||
      a.z !== b.z ||
      a.param1 !== b.param1 ||
      a.param2 !== b.param2 ||
      a.param3 !== b.param3 ||
      a.param4 !== b.param4
    ) {
      return true;
    }
  }

  const sh = snapshot.home;
  if (currentHome === null && sh === null) return false;
  if (currentHome === null || sh === null) return true;
  return (
    currentHome.latitude_deg !== sh.latitude_deg ||
    currentHome.longitude_deg !== sh.longitude_deg ||
    currentHome.altitude_m !== sh.altitude_m
  );
}

export function deriveSelectedSeq(state: DraftState): number | null {
  if (state.selectedUiId === null) return null;
  const index = state.items.findIndex((d) => d.uiId === state.selectedUiId);
  return index === -1 ? null : index;
}

export function findIndexByUiId(state: DraftState, uiId: number): number {
  return state.items.findIndex((d) => d.uiId === uiId);
}

export function displayTotal(state: DraftState): number {
  return state.items.length;
}

export function buildPlan(
  state: DraftState,
  missionType: MissionType,
  home: HomePosition | null,
): MissionPlan {
  const items = resequenceItems(state.items).map((d) => d.item);
  return {
    mission_type: missionType,
    home: missionType === "mission" ? home : null,
    items,
  };
}

export function rawItems(state: DraftState): MissionItem[] {
  return state.items.map((d) => d.item);
}
