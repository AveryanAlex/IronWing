import { createTypedDraftState, replaceActiveDraft } from "./core";
import { createDefaultFenceRegion, createDefaultMissionItem, createDraftItem, planItems } from "./draft-items";
import { insertTypedItemsAfter } from "./collection";

function domainTypeContracts() {
  const state = createTypedDraftState();
  const waypoint = createDefaultMissionItem(47, 8, 25);
  const region = createDefaultFenceRegion(47, 8);
  createDraftItem("mission", waypoint).document.command;
  // @ts-expect-error A fence entry cannot contain a mission item.
  createDraftItem("fence", waypoint);
  // @ts-expect-error Rally plans cannot be read as fence plans.
  planItems("fence", state.active.rally.document);
  // @ts-expect-error A mission draft cannot be replaced by a fence draft.
  replaceActiveDraft(state, "mission", state.active.fence);
  // @ts-expect-error The insertion domain determines the item type.
  insertTypedItemsAfter(state, "mission", 0, [region]);
}
void domainTypeContracts;
