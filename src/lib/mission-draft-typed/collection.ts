import type { FenceRegion } from "../mavkit-types";

import { activeDraft, replaceActiveDraft, withActiveItems } from "./core";
import { createDraftItem, defaultItemForDomain, toDraftItems } from "./draft-items";
import { nearestSelectedUiId, singletonSelection } from "./selection";
import type { DraftSelectionState, DomainItemMap, FenceRegionType, MissionDomain, TypedDraftState } from "./types";

export function addTypedWaypoint(state: TypedDraftState, domain: MissionDomain): TypedDraftState {
    return withActiveItems(state, domain, (items) => {
        const last = items[items.length - 1];
        const lastPreview = last?.preview;
        const doc = defaultItemForDomain(
            domain,
            (lastPreview?.latitude_deg ?? 0) + (lastPreview ? 0.0004 : 0),
            (lastPreview?.longitude_deg ?? 0) + (lastPreview ? 0.0004 : 0),
            lastPreview?.altitude_m ?? 25,
        );
        const draftItem = createDraftItem(domain, doc, items.length);
        return { items: [...items, draftItem], selection: singletonSelection(draftItem.uiId) };
    });
}

export function addTypedWaypointAt(state: TypedDraftState, domain: MissionDomain, latDeg: number, lonDeg: number): TypedDraftState {
    return withActiveItems(state, domain, (items) => {
        const altitude = items[items.length - 1]?.preview.altitude_m ?? 25;
        const doc = defaultItemForDomain(domain, latDeg, lonDeg, altitude);
        const draftItem = createDraftItem(domain, doc, items.length);
        return { items: [...items, draftItem], selection: singletonSelection(draftItem.uiId) };
    });
}

/** Add a fence region of the given type centered at (lat, lon). Polygons get a small ~110m square; circles get a 50m radius. */
export function addFenceRegionAt(state: TypedDraftState, lat: number, lon: number, type: FenceRegionType): TypedDraftState {
    const offset = 0.0005;
    let region: FenceRegion;
    if (type === "inclusion_polygon") {
        region = {
            inclusion_polygon: {
                vertices: [
                    { latitude_deg: lat + offset, longitude_deg: lon - offset },
                    { latitude_deg: lat + offset, longitude_deg: lon + offset },
                    { latitude_deg: lat - offset, longitude_deg: lon + offset },
                    { latitude_deg: lat - offset, longitude_deg: lon - offset },
                ],
                inclusion_group: 0,
            },
        };
    } else if (type === "exclusion_polygon") {
        region = {
            exclusion_polygon: {
                vertices: [
                    { latitude_deg: lat + offset, longitude_deg: lon - offset },
                    { latitude_deg: lat + offset, longitude_deg: lon + offset },
                    { latitude_deg: lat - offset, longitude_deg: lon + offset },
                    { latitude_deg: lat - offset, longitude_deg: lon - offset },
                ],
            },
        };
    } else if (type === "inclusion_circle") {
        region = {
            inclusion_circle: {
                center: { latitude_deg: lat, longitude_deg: lon },
                radius_m: 50,
                inclusion_group: 0,
            },
        };
    } else {
        region = {
            exclusion_circle: {
                center: { latitude_deg: lat, longitude_deg: lon },
                radius_m: 50,
            },
        };
    }

    return withActiveItems(state, "fence", (items) => {
        const draftItem = createDraftItem("fence", region, items.length);
        return { items: [...items, draftItem], selection: singletonSelection(draftItem.uiId) };
    });
}

/** Set the fence return point. Passing null clears it. */
export function setFenceReturnPoint(state: TypedDraftState, point: { latitude_deg: number; longitude_deg: number } | null): TypedDraftState {
    const active = activeDraft(state, "fence");
    const document = { ...active.document, return_point: point };
    return replaceActiveDraft(state, "fence", {
        ...active,
        document,
    });
}

export function bulkDelete(state: TypedDraftState, domain: MissionDomain, uiIds: Iterable<number>): TypedDraftState {
    return withActiveItems(state, domain, (items, selection) => {
        const deleteUiIds = new Set(uiIds);
        if (deleteUiIds.size === 0) {
            return { items, selection };
        }

        let firstDeletedIndex = -1;
        const nextItems = items.filter((entry, index) => {
            const keep = !deleteUiIds.has(entry.uiId);
            if (!keep && firstDeletedIndex === -1) {
                firstDeletedIndex = index;
            }
            return keep;
        });

        if (nextItems.length === items.length) {
            return { items, selection };
        }

        const nextSelection = {
            selectedUiIds: new Set([...selection.selectedUiIds].filter((uiId) => !deleteUiIds.has(uiId))),
            primarySelectedUiId:
                selection.primarySelectedUiId !== null && !deleteUiIds.has(selection.primarySelectedUiId) ? selection.primarySelectedUiId : null,
            selectionAnchorUiId:
                selection.selectionAnchorUiId !== null && !deleteUiIds.has(selection.selectionAnchorUiId) ? selection.selectionAnchorUiId : null,
        } satisfies DraftSelectionState;

        if (nextSelection.selectedUiIds.size === 0) {
            const fallbackIndex = Math.min(firstDeletedIndex, nextItems.length - 1);
            const fallbackUiId = fallbackIndex >= 0 ? nextItems[fallbackIndex]?.uiId ?? null : null;
            return { items: nextItems, selection: singletonSelection(fallbackUiId) };
        }

        if (nextSelection.primarySelectedUiId === null) {
            nextSelection.primarySelectedUiId = nearestSelectedUiId(items, nextSelection.selectedUiIds, Math.max(0, firstDeletedIndex));
        }
        if (nextSelection.selectionAnchorUiId === null) {
            nextSelection.selectionAnchorUiId = nextSelection.primarySelectedUiId;
        }

        return { items: nextItems, selection: nextSelection };
    });
}

export function deleteTypedAt(state: TypedDraftState, domain: MissionDomain, index: number): TypedDraftState {
    const uiId = state.active[domain].draftItems[index]?.uiId;
    return uiId === undefined ? state : bulkDelete(state, domain, [uiId]);
}

export function moveTypedUp(state: TypedDraftState, domain: MissionDomain, index: number): TypedDraftState {
    return withActiveItems(state, domain, (items, selection) => {
        if (index <= 0 || index >= items.length) {
            return { items, selection };
        }
        const nextItems = [...items];
        const [moved] = nextItems.splice(index, 1);
        if (!moved) return { items, selection };
        nextItems.splice(index - 1, 0, moved);
        return { items: nextItems, selection };
    });
}

export function moveTypedDown(state: TypedDraftState, domain: MissionDomain, index: number): TypedDraftState {
    return withActiveItems(state, domain, (items, selection) => {
        if (index < 0 || index >= items.length - 1) {
            return { items, selection };
        }
        const nextItems = [...items];
        const [moved] = nextItems.splice(index, 1);
        if (!moved) return { items, selection };
        nextItems.splice(index + 1, 0, moved);
        return { items: nextItems, selection };
    });
}

export function reorderTypedItems(state: TypedDraftState, domain: MissionDomain, fromUiId: number, toUiId: number): TypedDraftState {
    return withActiveItems(state, domain, (items, selection) => {
        const fromIndex = items.findIndex((entry) => entry.uiId === fromUiId);
        const toIndex = items.findIndex((entry) => entry.uiId === toUiId);
        if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
            return { items, selection };
        }
        const nextItems = [...items];
        const [moved] = nextItems.splice(fromIndex, 1);
        if (!moved) return { items, selection };
        nextItems.splice(toIndex, 0, moved);
        return { items: nextItems, selection };
    });
}

export function reorderTypedItemsByUiIds(state: TypedDraftState, domain: MissionDomain, orderedUiIds: readonly number[]): TypedDraftState {
    return withActiveItems(state, domain, (items, selection) => {
        if (orderedUiIds.length !== items.length) {
            return { items, selection };
        }

        const itemsByUiId = new Map(items.map((item) => [item.uiId, item]));
        const seenUiIds = new Set<number>();
        const nextItems = orderedUiIds.flatMap((uiId) => {
            const item = itemsByUiId.get(uiId);
            if (!item || seenUiIds.has(uiId)) {
                return [];
            }

            seenUiIds.add(uiId);
            return [item];
        });

        if (nextItems.length !== items.length) {
            return { items, selection };
        }

        const unchanged = nextItems.every((item, index) => item.uiId === items[index]?.uiId);
        return unchanged ? { items, selection } : { items: nextItems, selection };
    });
}

/** Insert typed items after the given index. Accepts domain-specific items directly. */
export function insertTypedItemsAfter<D extends MissionDomain>(
    state: TypedDraftState,
    domain: D,
    index: number,
    newItems: DomainItemMap[NoInfer<D>][],
): TypedDraftState {
    if (newItems.length === 0) return state;
    return withActiveItems(state, domain, (items) => {
        const insertAt = Math.max(0, index + 1);
        const inserted = toDraftItems(domain, newItems);
        const nextItems = [...items];
        nextItems.splice(insertAt, 0, ...inserted);
        return { items: nextItems, selection: singletonSelection(inserted[0]?.uiId ?? null) };
    });
}

/** Replace all items in the draft. Accepts domain-specific items directly. */
export function replaceAllTypedItems<D extends MissionDomain>(
    state: TypedDraftState,
    domain: D,
    newItems: DomainItemMap[NoInfer<D>][],
): TypedDraftState {
    return withActiveItems(state, domain, () => ({
        items: toDraftItems(domain, newItems),
        selection: singletonSelection(null),
    }));
}
