import type { MissionDomain, TypedDraftItem, TypedDraftState, DraftSelectionState } from "./types";
import { replaceActiveDraft, withActiveItems } from "./core";

export function emptySelection(): DraftSelectionState {
    return {
        selectedUiIds: new Set<number>(),
        primarySelectedUiId: null,
        selectionAnchorUiId: null,
    };
}

export function cloneSelection(selection: DraftSelectionState): DraftSelectionState {
    return {
        selectedUiIds: new Set(selection.selectedUiIds),
        primarySelectedUiId: selection.primarySelectedUiId,
        selectionAnchorUiId: selection.selectionAnchorUiId,
    };
}

export function firstSelectedUiId(items: TypedDraftItem[], selectedUiIds: Set<number>): number | null {
    for (const entry of items) {
        if (selectedUiIds.has(entry.uiId)) {
            return entry.uiId;
        }
    }
    return null;
}

export function nearestSelectedUiId(items: TypedDraftItem[], selectedUiIds: Set<number>, preferredIndex: number): number | null {
    if (selectedUiIds.size === 0) return null;
    for (let offset = 0; offset < items.length; offset += 1) {
        const forward = preferredIndex + offset;
        if (forward >= 0 && forward < items.length && selectedUiIds.has(items[forward]?.uiId ?? -1)) {
            return items[forward]?.uiId ?? null;
        }
        const backward = preferredIndex - offset;
        if (backward >= 0 && backward < items.length && selectedUiIds.has(items[backward]?.uiId ?? -1)) {
            return items[backward]?.uiId ?? null;
        }
    }
    return firstSelectedUiId(items, selectedUiIds);
}

export function normalizeSelection(items: TypedDraftItem[], selection: DraftSelectionState): DraftSelectionState {
    const availableUiIds = new Set(items.map((entry) => entry.uiId));
    const selectedUiIds = new Set([...selection.selectedUiIds].filter((uiId) => availableUiIds.has(uiId)));

    let primarySelectedUiId = selection.primarySelectedUiId;
    if (primarySelectedUiId === null || !selectedUiIds.has(primarySelectedUiId)) {
        primarySelectedUiId = firstSelectedUiId(items, selectedUiIds);
    }

    if (primarySelectedUiId === null) {
        return emptySelection();
    }

    selectedUiIds.add(primarySelectedUiId);

    let selectionAnchorUiId = selection.selectionAnchorUiId;
    if (selectionAnchorUiId === null || !selectedUiIds.has(selectionAnchorUiId)) {
        selectionAnchorUiId = primarySelectedUiId;
    }

    return {
        selectedUiIds,
        primarySelectedUiId,
        selectionAnchorUiId,
    };
}

export function singletonSelection(uiId: number | null): DraftSelectionState {
    if (uiId === null) {
        return emptySelection();
    }
    return {
        selectedUiIds: new Set([uiId]),
        primarySelectedUiId: uiId,
        selectionAnchorUiId: uiId,
    };
}

export function typedDraftSelectedUiIds(state: TypedDraftState, domain: MissionDomain): Set<number> {
    return new Set(state.active[domain].selectedUiIds);
}

export function typedDraftSelectedIndices(state: TypedDraftState, domain: MissionDomain): number[] {
    const selectedUiIds = state.active[domain].selectedUiIds;
    return state.active[domain].draftItems
        .filter((entry) => selectedUiIds.has(entry.uiId))
        .map((entry) => entry.index);
}

export function typedDraftSelectionCount(state: TypedDraftState, domain: MissionDomain): number {
    return state.active[domain].selectedUiIds.size;
}

export function typedDraftSelectionAnchorIndex(state: TypedDraftState, domain: MissionDomain): number | null {
    const selectionAnchorUiId = state.active[domain].selectionAnchorUiId;
    if (selectionAnchorUiId === null) return null;
    const index = state.active[domain].draftItems.findIndex((entry) => entry.uiId === selectionAnchorUiId);
    return index === -1 ? null : index;
}

export function typedDraftSelectedIndex(state: TypedDraftState, domain: MissionDomain): number | null {
    const selectedUiId = state.active[domain].primarySelectedUiId;
    if (selectedUiId === null) return null;
    const index = state.active[domain].draftItems.findIndex((entry) => entry.uiId === selectedUiId);
    return index === -1 ? null : index;
}

export function typedDraftSelectedItem(state: TypedDraftState, domain: MissionDomain): TypedDraftItem | null {
    const index = typedDraftSelectedIndex(state, domain);
    return index === null ? null : state.active[domain].draftItems[index] ?? null;
}

export function typedDraftPreviousItem(state: TypedDraftState, domain: MissionDomain): TypedDraftItem | null {
    const index = typedDraftSelectedIndex(state, domain);
    return index === null || index <= 0 ? null : state.active[domain].draftItems[index - 1] ?? null;
}

export function selectTypedDraftIndex(state: TypedDraftState, domain: MissionDomain, index: number | null): TypedDraftState {
    const selectedUiId = index === null ? null : state.active[domain].draftItems[index]?.uiId ?? null;
    return replaceActiveDraft(state, domain, {
        ...state.active[domain],
        ...singletonSelection(selectedUiId),
    });
}

export function toggleTypedDraftSelection(state: TypedDraftState, domain: MissionDomain, index: number): TypedDraftState {
    return withActiveItems(state, domain, (items, selection) => {
        const target = items[index];
        if (!target) {
            return { items, selection };
        }

        const nextSelection = cloneSelection(selection);
        if (nextSelection.selectedUiIds.has(target.uiId)) {
            nextSelection.selectedUiIds.delete(target.uiId);
            if (nextSelection.selectedUiIds.size === 0) {
                return { items, selection: emptySelection() };
            }
            if (nextSelection.primarySelectedUiId === target.uiId) {
                nextSelection.primarySelectedUiId = nearestSelectedUiId(items, nextSelection.selectedUiIds, index);
            }
            if (nextSelection.selectionAnchorUiId === target.uiId || nextSelection.selectionAnchorUiId === null) {
                nextSelection.selectionAnchorUiId = nextSelection.primarySelectedUiId;
            }
            return { items, selection: nextSelection };
        }

        nextSelection.selectedUiIds.add(target.uiId);
        nextSelection.primarySelectedUiId = target.uiId;
        nextSelection.selectionAnchorUiId = target.uiId;
        return { items, selection: nextSelection };
    });
}

export function selectTypedDraftRange(state: TypedDraftState, domain: MissionDomain, fromIndex: number, toIndex: number): TypedDraftState {
    return withActiveItems(state, domain, (items) => {
        if (items.length === 0) {
            return { items, selection: emptySelection() };
        }
        const clampedFrom = Math.max(0, Math.min(fromIndex, items.length - 1));
        const clampedTo = Math.max(0, Math.min(toIndex, items.length - 1));
        const start = Math.min(clampedFrom, clampedTo);
        const end = Math.max(clampedFrom, clampedTo);
        const selectedUiIds = new Set(items.slice(start, end + 1).map((entry) => entry.uiId));
        const primarySelectedUiId = items[clampedTo]?.uiId ?? null;
        const selectionAnchorUiId = items[clampedFrom]?.uiId ?? primarySelectedUiId;
        return {
            items,
            selection: {
                selectedUiIds,
                primarySelectedUiId,
                selectionAnchorUiId,
            },
        };
    });
}
