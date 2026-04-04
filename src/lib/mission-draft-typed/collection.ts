import type { FencePlan, FenceRegion, GeoPoint3d, MissionItem } from "../mavkit-types";

import { activeDraft, replaceActiveDraft, withActiveItems } from "./core";
import { createDraftItem, defaultItemForDomain, toDraftItems } from "./draft-items";
import { nearestSelectedUiId, singletonSelection } from "./selection";
import type { DraftSelectionState, FenceRegionType, MissionDomain, TypedDraftState } from "./types";

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
    const document = { ...(active.document as FencePlan), return_point: point };
    return replaceActiveDraft(state, "fence", {
        ...active,
        document: document as typeof active.document,
    });
}

export function insertTypedBefore(state: TypedDraftState, domain: MissionDomain, index: number): TypedDraftState {
    return withActiveItems(state, domain, (items) => {
        if (items.length === 0) {
            const doc = defaultItemForDomain(domain, 0, 0, 25);
            const draftItem = createDraftItem(domain, doc, 0);
            return { items: [draftItem], selection: singletonSelection(draftItem.uiId) };
        }

        const insertAt = Math.max(0, Math.min(index, items.length));
        const before = items[insertAt - 1]?.preview;
        const after = items[insertAt]?.preview;
        const seed = before ?? after ?? { latitude_deg: 0, longitude_deg: 0, altitude_m: 25 };

        let latitude_deg = seed.latitude_deg ?? 0;
        let longitude_deg = seed.longitude_deg ?? 0;
        let altitude_m = seed.altitude_m ?? 25;

        if (before?.latitude_deg !== null && after?.latitude_deg !== null && before?.longitude_deg !== null && after?.longitude_deg !== null) {
            latitude_deg = (before.latitude_deg + after.latitude_deg) / 2;
            longitude_deg = (before.longitude_deg + after.longitude_deg) / 2;
            altitude_m = ((before.altitude_m ?? altitude_m) + (after.altitude_m ?? altitude_m)) / 2;
        } else if (before?.latitude_deg !== null && before?.longitude_deg !== null) {
            latitude_deg = before.latitude_deg + 0.0004;
            longitude_deg = before.longitude_deg + 0.0004;
            altitude_m = before.altitude_m ?? altitude_m;
        } else if (after?.latitude_deg !== null && after?.longitude_deg !== null) {
            latitude_deg = after.latitude_deg - 0.0004;
            longitude_deg = after.longitude_deg - 0.0004;
            altitude_m = after.altitude_m ?? altitude_m;
        }

        const doc = defaultItemForDomain(domain, latitude_deg, longitude_deg, altitude_m);
        const draftItem = createDraftItem(domain, doc, insertAt);
        const nextItems = [...items];
        nextItems.splice(insertAt, 0, draftItem);
        return { items: nextItems, selection: singletonSelection(draftItem.uiId) };
    });
}

export function insertTypedAfter(state: TypedDraftState, domain: MissionDomain, index: number): TypedDraftState {
    return insertTypedBefore(state, domain, index + 1);
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

/** Insert typed items after the given index. Accepts domain-specific items directly. */
export function insertTypedItemsAfter(
    state: TypedDraftState,
    domain: MissionDomain,
    index: number,
    newItems: MissionItem[] | FenceRegion[] | GeoPoint3d[],
): TypedDraftState {
    if ((newItems as unknown[]).length === 0) return state;
    return withActiveItems(state, domain, (items) => {
        const insertAt = Math.max(0, index + 1);
        const inserted = toDraftItems(domain, newItems as (MissionItem | FenceRegion | GeoPoint3d)[]);
        const nextItems = [...items];
        nextItems.splice(insertAt, 0, ...inserted);
        return { items: nextItems, selection: singletonSelection(inserted[0]?.uiId ?? null) };
    });
}

/** Replace all items in the draft. Accepts domain-specific items directly. */
export function replaceAllTypedItems(
    state: TypedDraftState,
    domain: MissionDomain,
    newItems: MissionItem[] | FenceRegion[] | GeoPoint3d[],
): TypedDraftState {
    const raw = newItems as (MissionItem | FenceRegion | GeoPoint3d)[];
    return withActiveItems(state, domain, () => ({
        items: toDraftItems(domain, raw),
        selection: singletonSelection(null),
    }));
}
