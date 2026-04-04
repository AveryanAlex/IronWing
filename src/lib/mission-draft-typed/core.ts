import type { DomainPlanMap, MissionDomain, TypedDraftItem, TypedDraftState, ActiveDraft, DraftSelectionState, SessionScope } from "./types";
import { documentFromDraftItems, emptyPlan, planItems, previewForDomain, sameDocument, toDraftItems, withCurrent } from "./draft-items";
import { cloneSelection, emptySelection, normalizeSelection } from "./selection";

export function activeDraft<T extends MissionDomain>(state: TypedDraftState, domain: T): TypedDraftState["active"][T] {
    return state.active[domain] as TypedDraftState["active"][T];
}

export function replaceActiveDraft<T extends MissionDomain>(
    state: TypedDraftState,
    domain: T,
    next: TypedDraftState["active"][T],
): TypedDraftState {
    return {
        ...state,
        active: {
            ...state.active,
            [domain]: next,
        },
    };
}

function scoped<T extends MissionDomain>(domain: T, scope: SessionScope | null): ActiveDraft<DomainPlanMap[T]> {
    return {
        document: emptyPlan(domain),
        snapshot: emptyPlan(domain),
        draftItems: [],
        ...emptySelection(),
        scope: scope ?? { session_id: "", source_kind: "live", seek_epoch: 0, reset_revision: 0 },
    };
}

export function withActiveItems<T extends MissionDomain>(
    state: TypedDraftState,
    domain: T,
    update: (items: TypedDraftItem[], selection: DraftSelectionState) => { items: TypedDraftItem[]; selection?: DraftSelectionState },
): TypedDraftState {
    const active = activeDraft(state, domain);
    const currentSelection = normalizeSelection(active.draftItems, {
        selectedUiIds: new Set(active.selectedUiIds),
        primarySelectedUiId: active.primarySelectedUiId,
        selectionAnchorUiId: active.selectionAnchorUiId,
    });
    const result = update(active.draftItems, cloneSelection(currentSelection));
    const draftItems = result.items.map((entry, index) => ({
        ...entry,
        index,
        document: withCurrent(domain, entry.document, index === 0),
        preview: previewForDomain(domain, entry.document),
    }));
    const selection = normalizeSelection(draftItems, result.selection ?? currentSelection);
    const document = documentFromDraftItems(domain, draftItems, active.document);
    return replaceActiveDraft(state, domain, {
        ...active,
        draftItems,
        document,
        selectedUiIds: selection.selectedUiIds,
        primarySelectedUiId: selection.primarySelectedUiId,
        selectionAnchorUiId: selection.selectionAnchorUiId,
    } as TypedDraftState["active"][T]);
}

export function createTypedDraftState(): TypedDraftState {
    return {
        active: { mission: scoped("mission", null), fence: scoped("fence", null), rally: scoped("rally", null) },
        recoverable: {
            mission: null,
            fence: null,
            rally: null,
        },
    };
}

export function replaceTypedDraftFromDownload<T extends MissionDomain>(
    state: TypedDraftState,
    domain: T,
    plan: DomainPlanMap[T],
    scope: SessionScope,
    options?: { markDirty?: boolean },
): TypedDraftState {
    const active = activeDraft(state, domain);
    const items = planItems(domain, plan as DomainPlanMap[MissionDomain]);
    return replaceActiveDraft(state, domain, {
        ...active,
        document: plan,
        snapshot: options?.markDirty ? active.snapshot : plan,
        draftItems: toDraftItems(domain, items),
        ...emptySelection(),
        scope,
    } as TypedDraftState["active"][T]);
}

export function moveDirtyDraftToRecoverable(state: TypedDraftState, scope: SessionScope): TypedDraftState {
    const next = createTypedDraftState();
    next.active.mission.scope = scope;
    next.active.fence.scope = scope;
    next.active.rally.scope = scope;

    next.recoverable.mission = !sameDocument(state.active.mission.document, state.active.mission.snapshot)
        ? { document: state.active.mission.document, scope: state.active.mission.scope }
        : state.recoverable.mission;
    next.recoverable.fence = !sameDocument(state.active.fence.document, state.active.fence.snapshot)
        ? { document: state.active.fence.document, scope: state.active.fence.scope }
        : state.recoverable.fence;
    next.recoverable.rally = !sameDocument(state.active.rally.document, state.active.rally.snapshot)
        ? { document: state.active.rally.document, scope: state.active.rally.scope }
        : state.recoverable.rally;

    return next;
}

export function setTypedDraftScope(state: TypedDraftState, scope: SessionScope): TypedDraftState {
    return {
        ...state,
        active: {
            mission: { ...state.active.mission, scope },
            fence: { ...state.active.fence, scope },
            rally: { ...state.active.rally, scope },
        },
    };
}

export function recoverTypedDraft<T extends MissionDomain>(state: TypedDraftState, domain: T, scope: SessionScope): TypedDraftState {
    const recoverable = state.recoverable[domain];
    if (!recoverable) {
        return state;
    }
    if (recoverable.scope.session_id !== scope.session_id || recoverable.scope.source_kind !== scope.source_kind) {
        return state;
    }

    const items = planItems(domain, recoverable.document as DomainPlanMap[MissionDomain]);
    return {
        active: {
            ...state.active,
            [domain]: {
                ...state.active[domain],
                document: recoverable.document,
                draftItems: toDraftItems(domain, items),
                ...emptySelection(),
                scope,
            },
        },
        recoverable: {
            ...state.recoverable,
            [domain]: null,
        },
    };
}

export function typedDraftItems(state: TypedDraftState, domain: MissionDomain): TypedDraftItem[] {
    return state.active[domain].draftItems;
}

export function typedDraftPlan<T extends MissionDomain>(state: TypedDraftState, domain: T): DomainPlanMap[T] {
    return state.active[domain].document as DomainPlanMap[T];
}

export function isTypedDraftDirty(state: TypedDraftState, domain: MissionDomain): boolean {
    return !sameDocument(state.active[domain].document, state.active[domain].snapshot);
}
