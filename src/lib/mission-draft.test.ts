import { describe, it, expect, beforeEach } from "vitest";
import type { MissionItem, MissionType, HomePosition } from "../mission";
import {
  _resetUiIdCounter,
  allocateUiId,
  wrapItem,
  wrapItems,
  createEmptyDraft,
  addWaypoint,
  addWaypointAt,
  insertBefore,
  insertAfter,
  deleteAt,
  moveUp,
  moveDown,
  reorderItems,
  updateField,
  updateFrame,
  updateCoordinate,
  moveWaypointOnMap,
  setSelectedByUiId,
  selectBySeq,
  takeSnapshot,
  clearDraft,
  isDirty,
  deriveSelectedSeq,
  findIndexByUiId,
  displayTotal,
  buildPlan,
  rawItems,
  insertItemsAfter,
  replaceAllItems,
  defaultCommandForMissionType,
  defaultFrameForMissionType,
  type DraftState,
  type DraftItem,
} from "./mission-draft";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(seq: number, latDeg = 47.0, lonDeg = 8.0, altM = 25): MissionItem {
  return {
    seq,
    command: 16,
    frame: "global_relative_alt_int",
    current: seq === 0,
    autocontinue: true,
    param1: 0,
    param2: 1,
    param3: 0,
    param4: 0,
    x: Math.round(latDeg * 1e7),
    y: Math.round(lonDeg * 1e7),
    z: altM,
  };
}

function makeHome(lat = 47.0, lon = 8.0, alt = 0): HomePosition {
  return { latitude_deg: lat, longitude_deg: lon, altitude_m: alt };
}

/** Build a draft with N waypoints at incrementing positions. */
function draftWithItems(count: number): DraftState {
  let state = createEmptyDraft();
  for (let i = 0; i < count; i++) {
    state = addWaypoint(state);
  }
  return state;
}

// ---------------------------------------------------------------------------
// Stable identity (uiId)
// ---------------------------------------------------------------------------

describe("stable identity — uiId allocation", () => {
  beforeEach(() => _resetUiIdCounter());

  it("allocateUiId returns monotonically increasing integers", () => {
    const a = allocateUiId();
    const b = allocateUiId();
    const c = allocateUiId();
    expect(a).toBe(1);
    expect(b).toBe(2);
    expect(c).toBe(3);
  });

  it("_resetUiIdCounter resets the counter to 1", () => {
    allocateUiId();
    allocateUiId();
    _resetUiIdCounter();
    expect(allocateUiId()).toBe(1);
  });

  it("wrapItem assigns a unique uiId to each item", () => {
    const a = wrapItem(makeItem(0));
    const b = wrapItem(makeItem(1));
    expect(a.uiId).not.toBe(b.uiId);
  });

  it("wrapItems assigns sequential uiIds", () => {
    const items = wrapItems([makeItem(0), makeItem(1), makeItem(2)]);
    expect(items).toHaveLength(3);
    expect(items[0].uiId).toBe(1);
    expect(items[1].uiId).toBe(2);
    expect(items[2].uiId).toBe(3);
  });

  it("uiId is preserved across reorder operations", () => {
    let state = draftWithItems(3);
    const originalIds = state.items.map((d) => d.uiId);
    state = moveDown(state, 0);
    // The item that was at index 0 should now be at index 1, same uiId
    expect(state.items[1].uiId).toBe(originalIds[0]);
    expect(state.items[0].uiId).toBe(originalIds[1]);
  });

  it("uiId survives field updates", () => {
    let state = draftWithItems(2);
    const id = state.items[0].uiId;
    state = updateField(state, 0, "z", 100);
    expect(state.items[0].uiId).toBe(id);
  });
});

// ---------------------------------------------------------------------------
// createEmptyDraft
// ---------------------------------------------------------------------------

describe("createEmptyDraft", () => {
  beforeEach(() => _resetUiIdCounter());

  it("returns empty items, null selection, empty snapshot", () => {
    const draft = createEmptyDraft();
    expect(draft.items).toEqual([]);
    expect(draft.selectedUiId).toBeNull();
    expect(draft.snapshot.items).toEqual([]);
    expect(draft.snapshot.home).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// addWaypoint
// ---------------------------------------------------------------------------

describe("addWaypoint", () => {
  beforeEach(() => _resetUiIdCounter());

  it("adds a waypoint at (0,0,25) when list is empty", () => {
    const state = addWaypoint(createEmptyDraft());
    expect(state.items).toHaveLength(1);
    expect(state.items[0].item.x).toBe(0);
    expect(state.items[0].item.y).toBe(0);
    expect(state.items[0].item.z).toBe(25);
  });

  it("offsets from last item when list is non-empty", () => {
    let state = addWaypoint(createEmptyDraft());
    state = addWaypoint(state);
    expect(state.items).toHaveLength(2);
    // Second item should be offset from first
    expect(state.items[1].item.x).not.toBe(state.items[0].item.x);
    expect(state.items[1].item.y).not.toBe(state.items[0].item.y);
    // Altitude inherited
    expect(state.items[1].item.z).toBe(state.items[0].item.z);
  });

  it("selects the newly added item", () => {
    let state = addWaypoint(createEmptyDraft());
    expect(state.selectedUiId).toBe(state.items[0].uiId);
    state = addWaypoint(state);
    expect(state.selectedUiId).toBe(state.items[1].uiId);
  });

  it("resequences all items after add", () => {
    const state = draftWithItems(3);
    state.items.forEach((d, i) => {
      expect(d.item.seq).toBe(i);
    });
    expect(state.items[0].item.current).toBe(true);
    expect(state.items[1].item.current).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// addWaypointAt
// ---------------------------------------------------------------------------

describe("addWaypointAt", () => {
  beforeEach(() => _resetUiIdCounter());

  it("adds a waypoint at specified lat/lon", () => {
    const state = addWaypointAt(createEmptyDraft(), 47.5, 8.5);
    expect(state.items).toHaveLength(1);
    expect(state.items[0].item.x).toBe(Math.round(47.5 * 1e7));
    expect(state.items[0].item.y).toBe(Math.round(8.5 * 1e7));
  });

  it("inherits altitude from last item or defaults to 25", () => {
    // Empty → default 25
    const s1 = addWaypointAt(createEmptyDraft(), 47.0, 8.0);
    expect(s1.items[0].item.z).toBe(25);

    // Non-empty → inherit
    let s2 = addWaypointAt(createEmptyDraft(), 47.0, 8.0);
    s2 = updateField(s2, 0, "z", 50);
    s2 = addWaypointAt(s2, 47.1, 8.1);
    expect(s2.items[1].item.z).toBe(50);
  });

  it("selects the newly added item", () => {
    const state = addWaypointAt(createEmptyDraft(), 47.0, 8.0);
    expect(state.selectedUiId).toBe(state.items[0].uiId);
  });
});

// ---------------------------------------------------------------------------
// insertBefore / insertAfter
// ---------------------------------------------------------------------------

describe("insertBefore", () => {
  beforeEach(() => _resetUiIdCounter());

  it("inserts at the beginning when index is 0", () => {
    let state = draftWithItems(2);
    const originalFirst = state.items[0].uiId;
    state = insertBefore(state, 0);
    expect(state.items).toHaveLength(3);
    // Original first item is now at index 1
    expect(state.items[1].uiId).toBe(originalFirst);
    // New item is selected
    expect(state.selectedUiId).toBe(state.items[0].uiId);
  });

  it("interpolates coordinates between neighbors", () => {
    let state = createEmptyDraft();
    state = addWaypointAt(state, 47.0, 8.0);
    state = addWaypointAt(state, 47.002, 8.002);
    state = insertBefore(state, 1);
    // Inserted item should be between the two
    const inserted = state.items[1].item;
    expect(inserted.x / 1e7).toBeCloseTo(47.001, 3);
    expect(inserted.y / 1e7).toBeCloseTo(8.001, 3);
  });

  it("handles empty list by creating a default waypoint", () => {
    const state = insertBefore(createEmptyDraft(), 0);
    expect(state.items).toHaveLength(1);
    expect(state.items[0].item.z).toBe(25);
  });

  it("clamps index to valid range", () => {
    let state = draftWithItems(2);
    // Index beyond length should insert at end
    state = insertBefore(state, 100);
    expect(state.items).toHaveLength(3);
  });
});

describe("insertAfter", () => {
  beforeEach(() => _resetUiIdCounter());

  it("delegates to insertBefore(index + 1)", () => {
    let state = draftWithItems(2);
    const originalSecond = state.items[1].uiId;
    state = insertAfter(state, 0);
    expect(state.items).toHaveLength(3);
    // Original second item should now be at index 2
    expect(state.items[2].uiId).toBe(originalSecond);
  });
});

// ---------------------------------------------------------------------------
// deleteAt — selection behavior
// ---------------------------------------------------------------------------

describe("deleteAt", () => {
  beforeEach(() => _resetUiIdCounter());

  it("removes the item at the given index", () => {
    let state = draftWithItems(3);
    state = deleteAt(state, 1);
    expect(state.items).toHaveLength(2);
  });

  it("resequences after deletion", () => {
    let state = draftWithItems(3);
    state = deleteAt(state, 0);
    expect(state.items[0].item.seq).toBe(0);
    expect(state.items[1].item.seq).toBe(1);
    expect(state.items[0].item.current).toBe(true);
  });

  it("moves selection to next item when selected item is deleted", () => {
    let state = draftWithItems(3);
    // Select item at index 1
    state = setSelectedByUiId(state, state.items[1].uiId);
    const nextUiId = state.items[2].uiId;
    state = deleteAt(state, 1);
    // Selection should move to the item now at index 1 (was index 2)
    expect(state.selectedUiId).toBe(nextUiId);
  });

  it("moves selection to last item when deleting the last item", () => {
    let state = draftWithItems(3);
    // Select last item
    state = setSelectedByUiId(state, state.items[2].uiId);
    state = deleteAt(state, 2);
    // Selection should move to new last item (index 1)
    expect(state.selectedUiId).toBe(state.items[1].uiId);
  });

  it("sets selection to null when deleting the only item", () => {
    let state = draftWithItems(1);
    state = deleteAt(state, 0);
    expect(state.items).toHaveLength(0);
    expect(state.selectedUiId).toBeNull();
  });

  it("preserves selection when a non-selected item is deleted", () => {
    let state = draftWithItems(3);
    const selectedId = state.items[0].uiId;
    state = setSelectedByUiId(state, selectedId);
    state = deleteAt(state, 2);
    expect(state.selectedUiId).toBe(selectedId);
  });

  it("returns state unchanged for out-of-bounds index", () => {
    const state = draftWithItems(2);
    expect(deleteAt(state, -1)).toBe(state);
    expect(deleteAt(state, 5)).toBe(state);
  });
});

// ---------------------------------------------------------------------------
// moveUp / moveDown — reorder behavior
// ---------------------------------------------------------------------------

describe("moveUp / moveDown", () => {
  beforeEach(() => _resetUiIdCounter());

  it("moveUp swaps item with its predecessor", () => {
    let state = draftWithItems(3);
    const id1 = state.items[1].uiId;
    state = moveUp(state, 1);
    expect(state.items[0].uiId).toBe(id1);
  });

  it("moveUp at index 0 is a no-op", () => {
    const state = draftWithItems(3);
    expect(moveUp(state, 0)).toBe(state);
  });

  it("moveDown swaps item with its successor", () => {
    let state = draftWithItems(3);
    const id0 = state.items[0].uiId;
    state = moveDown(state, 0);
    expect(state.items[1].uiId).toBe(id0);
  });

  it("moveDown at last index is a no-op", () => {
    const state = draftWithItems(3);
    expect(moveDown(state, 2)).toBe(state);
  });

  it("resequences after move", () => {
    let state = draftWithItems(3);
    state = moveDown(state, 0);
    state.items.forEach((d, i) => {
      expect(d.item.seq).toBe(i);
    });
    expect(state.items[0].item.current).toBe(true);
    expect(state.items[1].item.current).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// reorderItems (dnd-kit style)
// ---------------------------------------------------------------------------

describe("reorderItems", () => {
  beforeEach(() => _resetUiIdCounter());

  it("moves item from one position to another by uiId", () => {
    let state = draftWithItems(4);
    const fromId = state.items[0].uiId;
    const toId = state.items[3].uiId;
    state = reorderItems(state, fromId, toId);
    // Item that was first should now be at index 3
    expect(state.items[3].uiId).toBe(fromId);
  });

  it("is a no-op when fromUiId === toUiId", () => {
    const state = draftWithItems(3);
    const id = state.items[1].uiId;
    expect(reorderItems(state, id, id)).toBe(state);
  });

  it("is a no-op when uiId not found", () => {
    const state = draftWithItems(3);
    expect(reorderItems(state, 999, 998)).toBe(state);
  });

  it("resequences after reorder", () => {
    let state = draftWithItems(4);
    const fromId = state.items[3].uiId;
    const toId = state.items[0].uiId;
    state = reorderItems(state, fromId, toId);
    state.items.forEach((d, i) => {
      expect(d.item.seq).toBe(i);
    });
  });
});

// ---------------------------------------------------------------------------
// updateField / updateFrame / updateCoordinate
// ---------------------------------------------------------------------------

describe("field updates", () => {
  beforeEach(() => _resetUiIdCounter());

  it("updateField changes the specified numeric field", () => {
    let state = draftWithItems(2);
    state = updateField(state, 0, "z", 100);
    expect(state.items[0].item.z).toBe(100);
    // Other item unchanged
    expect(state.items[1].item.z).toBe(25);
  });

  it("updateField works for all NumericItemField values", () => {
    let state = draftWithItems(1);
    state = updateField(state, 0, "command", 22);
    expect(state.items[0].item.command).toBe(22);
    state = updateField(state, 0, "param1", 5);
    expect(state.items[0].item.param1).toBe(5);
    state = updateField(state, 0, "param2", 10);
    expect(state.items[0].item.param2).toBe(10);
    state = updateField(state, 0, "param3", 15);
    expect(state.items[0].item.param3).toBe(15);
    state = updateField(state, 0, "param4", 20);
    expect(state.items[0].item.param4).toBe(20);
  });

  it("updateFrame changes the frame", () => {
    let state = draftWithItems(1);
    state = updateFrame(state, 0, "global_terrain_alt_int");
    expect(state.items[0].item.frame).toBe("global_terrain_alt_int");
  });

  it("updateCoordinate encodes degrees to degE7", () => {
    let state = draftWithItems(1);
    state = updateCoordinate(state, 0, "x", 47.5);
    expect(state.items[0].item.x).toBe(Math.round(47.5 * 1e7));
    state = updateCoordinate(state, 0, "y", 8.5);
    expect(state.items[0].item.y).toBe(Math.round(8.5 * 1e7));
  });
});

// ---------------------------------------------------------------------------
// moveWaypointOnMap
// ---------------------------------------------------------------------------

describe("moveWaypointOnMap", () => {
  beforeEach(() => _resetUiIdCounter());

  it("updates coordinates of the item matching the given seq", () => {
    let state = draftWithItems(3);
    state = moveWaypointOnMap(state, 1, 48.0, 9.0);
    expect(state.items[1].item.x).toBe(Math.round(48.0 * 1e7));
    expect(state.items[1].item.y).toBe(Math.round(9.0 * 1e7));
  });

  it("does not affect other items", () => {
    let state = draftWithItems(3);
    const origX = state.items[0].item.x;
    state = moveWaypointOnMap(state, 1, 48.0, 9.0);
    expect(state.items[0].item.x).toBe(origX);
  });

  it("preserves uiId of moved item", () => {
    let state = draftWithItems(2);
    const id = state.items[0].uiId;
    state = moveWaypointOnMap(state, 0, 48.0, 9.0);
    expect(state.items[0].uiId).toBe(id);
  });
});

// ---------------------------------------------------------------------------
// Selection helpers
// ---------------------------------------------------------------------------

describe("selection helpers", () => {
  beforeEach(() => _resetUiIdCounter());

  it("setSelectedByUiId sets the selectedUiId", () => {
    let state = draftWithItems(3);
    state = setSelectedByUiId(state, state.items[2].uiId);
    expect(state.selectedUiId).toBe(state.items[2].uiId);
  });

  it("setSelectedByUiId accepts null", () => {
    let state = draftWithItems(2);
    state = setSelectedByUiId(state, null);
    expect(state.selectedUiId).toBeNull();
  });

  it("selectBySeq finds the item at the given seq", () => {
    let state = draftWithItems(3);
    state = selectBySeq(state, 2);
    expect(state.selectedUiId).toBe(state.items[2].uiId);
  });

  it("selectBySeq with null clears selection", () => {
    let state = draftWithItems(2);
    state = selectBySeq(state, 0);
    state = selectBySeq(state, null);
    expect(state.selectedUiId).toBeNull();
  });

  it("selectBySeq with non-existent seq sets null", () => {
    let state = draftWithItems(2);
    state = selectBySeq(state, 99);
    expect(state.selectedUiId).toBeNull();
  });

  it("deriveSelectedSeq returns the index of the selected item", () => {
    let state = draftWithItems(3);
    state = setSelectedByUiId(state, state.items[1].uiId);
    expect(deriveSelectedSeq(state)).toBe(1);
  });

  it("deriveSelectedSeq returns null when nothing selected", () => {
    const state = createEmptyDraft();
    expect(deriveSelectedSeq(state)).toBeNull();
  });

  it("deriveSelectedSeq returns null when selectedUiId is stale", () => {
    let state = draftWithItems(2);
    state = { ...state, selectedUiId: 99999 };
    expect(deriveSelectedSeq(state)).toBeNull();
  });

  it("findIndexByUiId returns the correct index", () => {
    const state = draftWithItems(3);
    expect(findIndexByUiId(state, state.items[2].uiId)).toBe(2);
  });

  it("findIndexByUiId returns -1 for unknown uiId", () => {
    const state = draftWithItems(2);
    expect(findIndexByUiId(state, 99999)).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// Snapshot / dirty tracking
// ---------------------------------------------------------------------------

describe("snapshot and dirty tracking", () => {
  beforeEach(() => _resetUiIdCounter());

  it("fresh draft is not dirty", () => {
    const state = createEmptyDraft();
    expect(isDirty(state, null)).toBe(false);
  });

  it("adding an item without snapshot makes it dirty", () => {
    const state = addWaypoint(createEmptyDraft());
    expect(isDirty(state, null)).toBe(true);
  });

  it("taking a snapshot after add makes it clean", () => {
    let state = addWaypoint(createEmptyDraft());
    state = takeSnapshot(state, null);
    expect(isDirty(state, null)).toBe(false);
  });

  it("modifying a field after snapshot makes it dirty", () => {
    let state = draftWithItems(2);
    state = takeSnapshot(state, null);
    expect(isDirty(state, null)).toBe(false);
    state = updateField(state, 0, "z", 999);
    expect(isDirty(state, null)).toBe(true);
  });

  it("changing item count makes it dirty", () => {
    let state = draftWithItems(2);
    state = takeSnapshot(state, null);
    state = addWaypoint(state);
    expect(isDirty(state, null)).toBe(true);
  });

  it("deleting an item after snapshot makes it dirty", () => {
    let state = draftWithItems(3);
    state = takeSnapshot(state, null);
    state = deleteAt(state, 1);
    expect(isDirty(state, null)).toBe(true);
  });

  it("reordering items after snapshot makes it dirty (different coords at same index)", () => {
    let state = draftWithItems(3);
    state = takeSnapshot(state, null);
    state = moveDown(state, 0);
    expect(isDirty(state, null)).toBe(true);
  });

  it("changing home position makes it dirty", () => {
    let state = draftWithItems(1);
    const home = makeHome(47.0, 8.0, 100);
    state = takeSnapshot(state, home);
    expect(isDirty(state, home)).toBe(false);
    const newHome = makeHome(47.1, 8.1, 200);
    expect(isDirty(state, newHome)).toBe(true);
  });

  it("home null → non-null is dirty", () => {
    let state = draftWithItems(1);
    state = takeSnapshot(state, null);
    expect(isDirty(state, makeHome())).toBe(true);
  });

  it("home non-null → null is dirty", () => {
    let state = draftWithItems(1);
    state = takeSnapshot(state, makeHome());
    expect(isDirty(state, null)).toBe(true);
  });

  it("snapshot stores a copy of items (not a reference)", () => {
    let state = draftWithItems(2);
    state = takeSnapshot(state, null);
    // Mutating items after snapshot should make it dirty
    state = updateField(state, 0, "z", 999);
    expect(isDirty(state, null)).toBe(true);
    // Snapshot items should still have original value
    expect(state.snapshot.items[0].item.z).toBe(25);
  });

  it("isDirty compares all relevant item fields", () => {
    let state = draftWithItems(1);
    state = takeSnapshot(state, null);

    // Each field change should trigger dirty
    expect(isDirty(updateField(state, 0, "command", 22), null)).toBe(true);
    expect(isDirty(updateFrame(state, 0, "global_int"), null)).toBe(true);
    expect(isDirty(updateCoordinate(state, 0, "x", 48.0), null)).toBe(true);
    expect(isDirty(updateCoordinate(state, 0, "y", 9.0), null)).toBe(true);
    expect(isDirty(updateField(state, 0, "z", 50), null)).toBe(true);
    expect(isDirty(updateField(state, 0, "param1", 1), null)).toBe(true);
    expect(isDirty(updateField(state, 0, "param2", 2), null)).toBe(true);
    expect(isDirty(updateField(state, 0, "param3", 3), null)).toBe(true);
    expect(isDirty(updateField(state, 0, "param4", 4), null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// clearDraft
// ---------------------------------------------------------------------------

describe("clearDraft", () => {
  beforeEach(() => _resetUiIdCounter());

  it("returns a fresh empty draft", () => {
    const state = clearDraft();
    expect(state.items).toEqual([]);
    expect(state.selectedUiId).toBeNull();
    expect(state.snapshot.items).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// displayTotal
// ---------------------------------------------------------------------------

describe("displayTotal", () => {
  beforeEach(() => _resetUiIdCounter());

  it("returns the number of items", () => {
    expect(displayTotal(createEmptyDraft())).toBe(0);
    expect(displayTotal(draftWithItems(5))).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// buildPlan — strips UI-only identity
// ---------------------------------------------------------------------------

describe("buildPlan", () => {
  beforeEach(() => _resetUiIdCounter());

  it("returns a MissionPlan with correct mission_type", () => {
    const state = draftWithItems(2);
    const plan = buildPlan(state, "mission", makeHome());
    expect(plan.mission_type).toBe("mission");
  });

  it("includes home for mission type", () => {
    const home = makeHome(47.0, 8.0, 100);
    const plan = buildPlan(draftWithItems(1), "mission", home);
    expect(plan.home).toEqual(home);
  });

  it("excludes home for fence type", () => {
    const plan = buildPlan(draftWithItems(1), "fence", makeHome());
    expect(plan.home).toBeNull();
  });

  it("excludes home for rally type", () => {
    const plan = buildPlan(draftWithItems(1), "rally", makeHome());
    expect(plan.home).toBeNull();
  });

  it("strips uiId from output items (pure MissionItem[])", () => {
    const state = draftWithItems(3);
    const plan = buildPlan(state, "mission", null);
    for (const item of plan.items) {
      expect(item).not.toHaveProperty("uiId");
      // Should have standard MissionItem fields
      expect(item).toHaveProperty("seq");
      expect(item).toHaveProperty("command");
      expect(item).toHaveProperty("frame");
      expect(item).toHaveProperty("x");
      expect(item).toHaveProperty("y");
      expect(item).toHaveProperty("z");
    }
  });

  it("resequences items starting from 0", () => {
    let state = draftWithItems(3);
    // Reorder to scramble internal seq
    state = moveDown(state, 0);
    const plan = buildPlan(state, "mission", null);
    plan.items.forEach((item, i) => {
      expect(item.seq).toBe(i);
    });
    expect(plan.items[0].current).toBe(true);
    expect(plan.items[1].current).toBe(false);
  });

  it("handles empty draft", () => {
    const plan = buildPlan(createEmptyDraft(), "mission", null);
    expect(plan.items).toEqual([]);
    expect(plan.home).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// rawItems
// ---------------------------------------------------------------------------

describe("rawItems", () => {
  beforeEach(() => _resetUiIdCounter());

  it("returns MissionItem[] without uiId", () => {
    const state = draftWithItems(2);
    const items = rawItems(state);
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item).not.toHaveProperty("uiId");
      expect(item).toHaveProperty("seq");
    }
  });
});

// ---------------------------------------------------------------------------
// insertItemsAfter — bulk insertion
// ---------------------------------------------------------------------------

describe("insertItemsAfter", () => {
  beforeEach(() => _resetUiIdCounter());

  it("inserts multiple items after the given index", () => {
    let state = draftWithItems(2);
    const newItems = [makeItem(0, 48.0, 9.0, 50), makeItem(0, 48.001, 9.001, 50)];
    state = insertItemsAfter(state, 0, newItems);
    expect(state.items).toHaveLength(4);
    // Original item 0 stays at 0, new items at 1 and 2, original item 1 at 3
    expect(state.items[1].item.x).toBe(Math.round(48.0 * 1e7));
    expect(state.items[2].item.x).toBe(Math.round(48.001 * 1e7));
  });

  it("resequences all items after insertion", () => {
    let state = draftWithItems(2);
    const newItems = [makeItem(0, 48.0, 9.0, 50), makeItem(0, 48.001, 9.001, 50)];
    state = insertItemsAfter(state, 0, newItems);
    state.items.forEach((d, i) => {
      expect(d.item.seq).toBe(i);
    });
    expect(state.items[0].item.current).toBe(true);
    expect(state.items[1].item.current).toBe(false);
  });

  it("selects the first newly inserted item", () => {
    let state = draftWithItems(2);
    const newItems = [makeItem(0, 48.0, 9.0, 50), makeItem(0, 48.001, 9.001, 50)];
    state = insertItemsAfter(state, 0, newItems);
    expect(state.selectedUiId).toBe(state.items[1].uiId);
  });

  it("appends to end when index equals last item index", () => {
    let state = draftWithItems(2);
    const newItems = [makeItem(0, 48.0, 9.0, 50)];
    state = insertItemsAfter(state, 1, newItems);
    expect(state.items).toHaveLength(3);
    expect(state.items[2].item.x).toBe(Math.round(48.0 * 1e7));
  });

  it("inserts at beginning when index is -1", () => {
    let state = draftWithItems(2);
    const newItems = [makeItem(0, 48.0, 9.0, 50)];
    state = insertItemsAfter(state, -1, newItems);
    expect(state.items).toHaveLength(3);
    expect(state.items[0].item.x).toBe(Math.round(48.0 * 1e7));
  });

  it("handles insertion into empty draft", () => {
    let state = createEmptyDraft();
    const newItems = [makeItem(0, 48.0, 9.0, 50), makeItem(0, 48.001, 9.001, 50)];
    state = insertItemsAfter(state, -1, newItems);
    expect(state.items).toHaveLength(2);
    expect(state.items[0].item.seq).toBe(0);
    expect(state.items[1].item.seq).toBe(1);
  });

  it("assigns unique uiIds to each inserted item", () => {
    let state = draftWithItems(1);
    const newItems = [makeItem(0, 48.0, 9.0, 50), makeItem(0, 48.001, 9.001, 50)];
    state = insertItemsAfter(state, 0, newItems);
    const uiIds = state.items.map((d) => d.uiId);
    expect(new Set(uiIds).size).toBe(uiIds.length);
  });

  it("is a no-op when given empty items array", () => {
    const state = draftWithItems(2);
    const result = insertItemsAfter(state, 0, []);
    expect(result).toBe(state);
  });
});

// ---------------------------------------------------------------------------
// replaceAllItems — bulk replacement
// ---------------------------------------------------------------------------

describe("replaceAllItems", () => {
  beforeEach(() => _resetUiIdCounter());

  it("replaces all items with the given array", () => {
    let state = draftWithItems(3);
    const newItems = [makeItem(0, 48.0, 9.0, 50), makeItem(1, 48.001, 9.001, 50)];
    state = replaceAllItems(state, newItems);
    expect(state.items).toHaveLength(2);
    expect(state.items[0].item.x).toBe(Math.round(48.0 * 1e7));
    expect(state.items[1].item.x).toBe(Math.round(48.001 * 1e7));
  });

  it("resequences items from 0", () => {
    let state = draftWithItems(1);
    const newItems = [makeItem(5, 48.0, 9.0, 50), makeItem(10, 48.001, 9.001, 50)];
    state = replaceAllItems(state, newItems);
    expect(state.items[0].item.seq).toBe(0);
    expect(state.items[1].item.seq).toBe(1);
    expect(state.items[0].item.current).toBe(true);
  });

  it("clears selection", () => {
    let state = draftWithItems(3);
    state = selectBySeq(state, 1);
    expect(state.selectedUiId).not.toBeNull();
    const newItems = [makeItem(0, 48.0, 9.0, 50)];
    state = replaceAllItems(state, newItems);
    expect(state.selectedUiId).toBeNull();
  });

  it("can replace with empty array", () => {
    let state = draftWithItems(3);
    state = replaceAllItems(state, []);
    expect(state.items).toHaveLength(0);
    expect(state.selectedUiId).toBeNull();
  });

  it("assigns unique uiIds to all items", () => {
    let state = draftWithItems(1);
    const newItems = [makeItem(0, 48.0, 9.0, 50), makeItem(1, 48.001, 9.001, 50)];
    state = replaceAllItems(state, newItems);
    const uiIds = state.items.map((d) => d.uiId);
    expect(new Set(uiIds).size).toBe(uiIds.length);
  });
});

// ---------------------------------------------------------------------------
// Integration: multi-step editing workflow
// ---------------------------------------------------------------------------

describe("integration: multi-step editing workflow", () => {
  beforeEach(() => _resetUiIdCounter());

  it("add → select → move → delete → snapshot → verify clean", () => {
    // Start fresh
    let state = createEmptyDraft();

    // Add 4 waypoints
    state = addWaypointAt(state, 47.0, 8.0);
    state = addWaypointAt(state, 47.001, 8.001);
    state = addWaypointAt(state, 47.002, 8.002);
    state = addWaypointAt(state, 47.003, 8.003);
    expect(state.items).toHaveLength(4);

    // Select item 1
    state = selectBySeq(state, 1);
    expect(deriveSelectedSeq(state)).toBe(1);

    // Move item 1 up (becomes item 0)
    state = moveUp(state, 1);
    // The selected uiId should still be valid
    expect(deriveSelectedSeq(state)).not.toBeNull();

    // Delete item at index 2
    state = deleteAt(state, 2);
    expect(state.items).toHaveLength(3);

    // Take snapshot
    state = takeSnapshot(state, null);
    expect(isDirty(state, null)).toBe(false);

    // Build plan
    const plan = buildPlan(state, "mission", null);
    expect(plan.items).toHaveLength(3);
    plan.items.forEach((item, i) => {
      expect(item.seq).toBe(i);
      expect(item).not.toHaveProperty("uiId");
    });
  });

  it("download → snapshot → edit → verify dirty → upload → snapshot → verify clean", () => {
    // Simulate download: wrap raw items
    const downloaded = wrapItems([
      makeItem(0, 47.0, 8.0),
      makeItem(1, 47.001, 8.001),
    ]);
    let state: DraftState = {
      items: downloaded,
      selectedUiId: null,
      snapshot: { items: [], home: null },
    };

    // Take snapshot (simulates post-download)
    const home = makeHome(47.0, 8.0, 100);
    state = takeSnapshot(state, home);
    expect(isDirty(state, home)).toBe(false);

    // Edit: change altitude
    state = updateField(state, 0, "z", 50);
    expect(isDirty(state, home)).toBe(true);

    // "Upload" → take snapshot again
    state = takeSnapshot(state, home);
    expect(isDirty(state, home)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Mission-type-aware default commands
// ---------------------------------------------------------------------------

describe("defaultCommandForMissionType", () => {
  it("returns NAV_WAYPOINT (16) for mission type", () => {
    expect(defaultCommandForMissionType("mission")).toBe(16);
  });

  it("returns NAV_FENCE_POLYGON_VERTEX_INCLUSION (5002) for fence type", () => {
    expect(defaultCommandForMissionType("fence")).toBe(5002);
  });

  it("returns NAV_RALLY_POINT (5100) for rally type", () => {
    expect(defaultCommandForMissionType("rally")).toBe(5100);
  });
});

describe("defaultFrameForMissionType", () => {
  it("returns global_relative_alt_int for mission", () => {
    expect(defaultFrameForMissionType("mission")).toBe("global_relative_alt_int");
  });

  it("returns global_int for fence", () => {
    expect(defaultFrameForMissionType("fence")).toBe("global_int");
  });

  it("returns global_relative_alt_int for rally", () => {
    expect(defaultFrameForMissionType("rally")).toBe("global_relative_alt_int");
  });
});

describe("mission-type-aware item creation", () => {
  beforeEach(() => _resetUiIdCounter());

  it("addWaypoint creates fence items with command 5002 when missionType is fence", () => {
    const state = addWaypoint(createEmptyDraft(), "fence");
    expect(state.items[0].item.command).toBe(5002);
    expect(state.items[0].item.frame).toBe("global_int");
  });

  it("addWaypoint creates rally items with command 5100 when missionType is rally", () => {
    const state = addWaypoint(createEmptyDraft(), "rally");
    expect(state.items[0].item.command).toBe(5100);
  });

  it("addWaypoint defaults to command 16 when missionType is mission", () => {
    const state = addWaypoint(createEmptyDraft(), "mission");
    expect(state.items[0].item.command).toBe(16);
    expect(state.items[0].item.frame).toBe("global_relative_alt_int");
  });

  it("addWaypoint defaults to command 16 when missionType is omitted", () => {
    const state = addWaypoint(createEmptyDraft());
    expect(state.items[0].item.command).toBe(16);
  });

  it("addWaypointAt creates fence items with command 5002", () => {
    const state = addWaypointAt(createEmptyDraft(), 47.5, 8.5, "fence");
    expect(state.items[0].item.command).toBe(5002);
    expect(state.items[0].item.frame).toBe("global_int");
  });

  it("addWaypointAt creates rally items with command 5100", () => {
    const state = addWaypointAt(createEmptyDraft(), 47.5, 8.5, "rally");
    expect(state.items[0].item.command).toBe(5100);
  });

  it("insertBefore creates fence items with command 5002", () => {
    let state = addWaypoint(createEmptyDraft(), "fence");
    state = insertBefore(state, 0, "fence");
    expect(state.items[0].item.command).toBe(5002);
    expect(state.items[0].item.frame).toBe("global_int");
  });

  it("insertBefore creates rally items with command 5100", () => {
    let state = addWaypoint(createEmptyDraft(), "rally");
    state = insertBefore(state, 0, "rally");
    expect(state.items[0].item.command).toBe(5100);
  });
});
