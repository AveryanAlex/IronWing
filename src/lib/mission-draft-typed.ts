import type {
    FencePlan,
    FenceRegion,
    GeoPoint3d,
    MissionCommand,
    MissionItem,
    MissionPlan,
    RallyPlan,
} from "./mavkit-types";
import {
    commandPosition,
    defaultGeoPoint3d,
    geoPoint3dAltitude,
    geoPoint3dLatLon,
    withGeoPoint3dAltitude,
    withGeoPoint3dPosition,
} from "./mavkit-types";
import type { SourceKind } from "../session";

export type MissionDomain = "mission" | "fence" | "rally";

export type SessionScope = {
    session_id: string;
    source_kind: SourceKind;
    seek_epoch: number;
    reset_revision: number;
};

export type DomainPlanMap = {
    mission: MissionPlan;
    fence: FencePlan;
    rally: RallyPlan;
};

/** The concrete item type stored in each domain's draft entries. */
export type DomainItemMap = {
    mission: MissionItem;
    fence: FenceRegion;
    rally: GeoPoint3d;
};

export type TypedDraftPreview = {
    latitude_deg: number | null;
    longitude_deg: number | null;
    altitude_m: number | null;
};

export type TypedDraftItem = {
    readonly uiId: number;
    readonly index: number;
    readonly document: MissionItem | FenceRegion | GeoPoint3d;
    readonly readOnly: boolean;
    readonly preview: TypedDraftPreview;
};

type RecoverableDraft<T> = {
    document: T;
    scope: SessionScope;
};

type ActiveDraft<T> = RecoverableDraft<T> & {
    snapshot: T;
    draftItems: TypedDraftItem[];
    selectedUiIds: Set<number>;
    primarySelectedUiId: number | null;
    selectionAnchorUiId: number | null;
};

export type TypedDraftState = {
    active: {
        mission: ActiveDraft<MissionPlan>;
        fence: ActiveDraft<FencePlan>;
        rally: ActiveDraft<RallyPlan>;
    };
    recoverable: {
        mission: RecoverableDraft<MissionPlan> | null;
        fence: RecoverableDraft<FencePlan> | null;
        rally: RecoverableDraft<RallyPlan> | null;
    };
};

type DraftSelectionState = {
    selectedUiIds: Set<number>;
    primarySelectedUiId: number | null;
    selectionAnchorUiId: number | null;
};

let nextUiId = 1;

function allocateUiId(): number {
    return nextUiId++;
}

function emptySelection(): DraftSelectionState {
    return {
        selectedUiIds: new Set<number>(),
        primarySelectedUiId: null,
        selectionAnchorUiId: null,
    };
}

function cloneSelection(selection: DraftSelectionState): DraftSelectionState {
    return {
        selectedUiIds: new Set(selection.selectedUiIds),
        primarySelectedUiId: selection.primarySelectedUiId,
        selectionAnchorUiId: selection.selectionAnchorUiId,
    };
}

function firstSelectedUiId(items: TypedDraftItem[], selectedUiIds: Set<number>): number | null {
    for (const entry of items) {
        if (selectedUiIds.has(entry.uiId)) {
            return entry.uiId;
        }
    }
    return null;
}

function nearestSelectedUiId(items: TypedDraftItem[], selectedUiIds: Set<number>, preferredIndex: number): number | null {
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

function normalizeSelection(items: TypedDraftItem[], selection: DraftSelectionState): DraftSelectionState {
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

function singletonSelection(uiId: number | null): DraftSelectionState {
    if (uiId === null) {
        return emptySelection();
    }
    return {
        selectedUiIds: new Set([uiId]),
        primarySelectedUiId: uiId,
        selectionAnchorUiId: uiId,
    };
}

// ---------------------------------------------------------------------------
// Empty / default plan factories
// ---------------------------------------------------------------------------

function emptyPlan<T extends MissionDomain>(_domain: T): DomainPlanMap[T] {
    if (_domain === "fence") {
        return { return_point: null, regions: [] } as unknown as DomainPlanMap[T];
    }
    if (_domain === "rally") {
        return { points: [] } as unknown as DomainPlanMap[T];
    }
    return { items: [] } as unknown as DomainPlanMap[T];
}

function sameDocument<T>(left: T, right: T): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

// ---------------------------------------------------------------------------
// Default item factories per domain
// ---------------------------------------------------------------------------

function createDefaultMissionItem(lat: number, lon: number, alt: number): MissionItem {
    return {
        command: {
            Nav: {
                Waypoint: {
                    position: defaultGeoPoint3d(lat, lon, alt),
                    hold_time_s: 0,
                    acceptance_radius_m: 1,
                    pass_radius_m: 0,
                    yaw_deg: 0,
                },
            },
        },
        current: false,
        autocontinue: true,
    };
}

function createDefaultFenceRegion(lat: number, lon: number): FenceRegion {
    return {
        inclusion_polygon: {
            vertices: [
                { latitude_deg: lat - 0.001, longitude_deg: lon - 0.001 },
                { latitude_deg: lat + 0.001, longitude_deg: lon - 0.001 },
                { latitude_deg: lat + 0.001, longitude_deg: lon + 0.001 },
                { latitude_deg: lat - 0.001, longitude_deg: lon + 0.001 },
            ],
            inclusion_group: 0,
        },
    };
}

function createDefaultRallyPoint(lat: number, lon: number, alt: number): GeoPoint3d {
    return defaultGeoPoint3d(lat, lon, alt);
}

// ---------------------------------------------------------------------------
// Preview extraction
// ---------------------------------------------------------------------------

function previewFromMissionItem(item: MissionItem): TypedDraftPreview {
    const pos = commandPosition(item.command);
    if (!pos) return { latitude_deg: null, longitude_deg: null, altitude_m: null };
    const { latitude_deg, longitude_deg } = geoPoint3dLatLon(pos);
    const { value: altitude_m } = geoPoint3dAltitude(pos);
    return { latitude_deg, longitude_deg, altitude_m };
}

function previewFromFenceRegion(region: FenceRegion): TypedDraftPreview {
    if ("inclusion_polygon" in region) {
        const verts = region.inclusion_polygon.vertices;
        if (verts.length === 0) return { latitude_deg: null, longitude_deg: null, altitude_m: null };
        const lat = verts.reduce((s, v) => s + v.latitude_deg, 0) / verts.length;
        const lon = verts.reduce((s, v) => s + v.longitude_deg, 0) / verts.length;
        return { latitude_deg: lat, longitude_deg: lon, altitude_m: null };
    }
    if ("exclusion_polygon" in region) {
        const verts = region.exclusion_polygon.vertices;
        if (verts.length === 0) return { latitude_deg: null, longitude_deg: null, altitude_m: null };
        const lat = verts.reduce((s, v) => s + v.latitude_deg, 0) / verts.length;
        const lon = verts.reduce((s, v) => s + v.longitude_deg, 0) / verts.length;
        return { latitude_deg: lat, longitude_deg: lon, altitude_m: null };
    }
    if ("inclusion_circle" in region) {
        return {
            latitude_deg: region.inclusion_circle.center.latitude_deg,
            longitude_deg: region.inclusion_circle.center.longitude_deg,
            altitude_m: null,
        };
    }
    // exclusion_circle
    const circle = (region as { exclusion_circle: { center: { latitude_deg: number; longitude_deg: number }; radius_m: number } }).exclusion_circle;
    return {
        latitude_deg: circle.center.latitude_deg,
        longitude_deg: circle.center.longitude_deg,
        altitude_m: null,
    };
}

function previewFromRallyPoint(pt: GeoPoint3d): TypedDraftPreview {
    const { latitude_deg, longitude_deg } = geoPoint3dLatLon(pt);
    const { value: altitude_m } = geoPoint3dAltitude(pt);
    return { latitude_deg, longitude_deg, altitude_m };
}

function previewForDomain(domain: MissionDomain, doc: MissionItem | FenceRegion | GeoPoint3d): TypedDraftPreview {
    if (domain === "mission") return previewFromMissionItem(doc as MissionItem);
    if (domain === "fence") return previewFromFenceRegion(doc as FenceRegion);
    return previewFromRallyPoint(doc as GeoPoint3d);
}

// ---------------------------------------------------------------------------
// Read-only detection
// ---------------------------------------------------------------------------

function isReadOnly(domain: MissionDomain, doc: MissionItem | FenceRegion | GeoPoint3d): boolean {
    if (domain !== "mission") return false;
    const item = doc as MissionItem;
    return "Other" in item.command;
}

// ---------------------------------------------------------------------------
// Current-flag handling (mission items only)
// ---------------------------------------------------------------------------

function withCurrent(domain: MissionDomain, doc: MissionItem | FenceRegion | GeoPoint3d, current: boolean): MissionItem | FenceRegion | GeoPoint3d {
    if (domain !== "mission") return doc;
    return { ...(doc as MissionItem), current };
}

// ---------------------------------------------------------------------------
// Plan items extraction / reconstruction
// ---------------------------------------------------------------------------

function planItems(domain: MissionDomain, plan: DomainPlanMap[MissionDomain]): (MissionItem | FenceRegion | GeoPoint3d)[] {
    if (domain === "mission") return (plan as MissionPlan).items;
    if (domain === "fence") return (plan as FencePlan).regions;
    return (plan as RallyPlan).points;
}

function planFromItems(domain: MissionDomain, items: (MissionItem | FenceRegion | GeoPoint3d)[], existingPlan: DomainPlanMap[MissionDomain]): DomainPlanMap[MissionDomain] {
    if (domain === "mission") {
        return { items: items as MissionItem[] } as DomainPlanMap[typeof domain];
    }
    if (domain === "fence") {
        return { return_point: (existingPlan as FencePlan).return_point, regions: items as FenceRegion[] } as DomainPlanMap[typeof domain];
    }
    return { points: items as GeoPoint3d[] } as DomainPlanMap[typeof domain];
}

// ---------------------------------------------------------------------------
// Draft items conversion
// ---------------------------------------------------------------------------

function toDraftItems(domain: MissionDomain, items: (MissionItem | FenceRegion | GeoPoint3d)[]): TypedDraftItem[] {
    return items.map((doc, index) => ({
        uiId: allocateUiId(),
        index,
        document: domain === "mission" ? withCurrent(domain, doc, index === 0) : doc,
        readOnly: isReadOnly(domain, doc),
        preview: previewForDomain(domain, doc),
    }));
}

function documentFromDraftItems(
    domain: MissionDomain,
    draftItems: TypedDraftItem[],
    existingPlan: DomainPlanMap[MissionDomain],
): DomainPlanMap[MissionDomain] {
    const docs = draftItems.map((entry, index) => withCurrent(domain, entry.document, index === 0));
    return planFromItems(domain, docs, existingPlan);
}

// ---------------------------------------------------------------------------
// Active draft accessors
// ---------------------------------------------------------------------------

function activeDraft<T extends MissionDomain>(state: TypedDraftState, domain: T): TypedDraftState["active"][T] {
    return state.active[domain] as TypedDraftState["active"][T];
}

function replaceActiveDraft<T extends MissionDomain>(
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

// ---------------------------------------------------------------------------
// Core update helper
// ---------------------------------------------------------------------------

function withActiveItems<T extends MissionDomain>(
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

// ---------------------------------------------------------------------------
// Public API: state management
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Public API: queries
// ---------------------------------------------------------------------------

export function typedDraftItems(state: TypedDraftState, domain: MissionDomain): TypedDraftItem[] {
    return state.active[domain].draftItems;
}

export function typedDraftPlan<T extends MissionDomain>(state: TypedDraftState, domain: T): DomainPlanMap[T] {
    return state.active[domain].document as DomainPlanMap[T];
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

export function isTypedDraftDirty(state: TypedDraftState, domain: MissionDomain): boolean {
    return !sameDocument(state.active[domain].document, state.active[domain].snapshot);
}

// ---------------------------------------------------------------------------
// Public API: selection
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Public API: add / insert / delete / reorder
// ---------------------------------------------------------------------------

function defaultItemForDomain(domain: MissionDomain, lat: number, lon: number, alt: number): MissionItem | FenceRegion | GeoPoint3d {
    if (domain === "mission") return createDefaultMissionItem(lat, lon, alt);
    if (domain === "fence") return createDefaultFenceRegion(lat, lon);
    return createDefaultRallyPoint(lat, lon, alt);
}

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
        const draftItem = {
            uiId: allocateUiId(),
            index: items.length,
            document: doc,
            readOnly: false,
            preview: { latitude_deg: null, longitude_deg: null, altitude_m: null },
        } satisfies TypedDraftItem;
        return { items: [...items, draftItem], selection: singletonSelection(draftItem.uiId) };
    });
}

export function addTypedWaypointAt(state: TypedDraftState, domain: MissionDomain, latDeg: number, lonDeg: number): TypedDraftState {
    return withActiveItems(state, domain, (items) => {
        const altitude = items[items.length - 1]?.preview.altitude_m ?? 25;
        const doc = defaultItemForDomain(domain, latDeg, lonDeg, altitude);
        const draftItem = {
            uiId: allocateUiId(),
            index: items.length,
            document: doc,
            readOnly: false,
            preview: { latitude_deg: null, longitude_deg: null, altitude_m: null },
        } satisfies TypedDraftItem;
        return { items: [...items, draftItem], selection: singletonSelection(draftItem.uiId) };
    });
}

export type FenceRegionType = "inclusion_polygon" | "exclusion_polygon" | "inclusion_circle" | "exclusion_circle";

/** Add a fence region of the given type centered at (lat, lon). Polygons get a small ~110m square; circles get a 50m radius. */
export function addFenceRegionAt(
    state: TypedDraftState,
    lat: number,
    lon: number,
    type: FenceRegionType,
): TypedDraftState {
    const offset = 0.0005; // ~55m at mid-latitudes per axis
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
        const draftItem = {
            uiId: allocateUiId(),
            index: items.length,
            document: region,
            readOnly: false,
            preview: { latitude_deg: null, longitude_deg: null, altitude_m: null },
        } satisfies TypedDraftItem;
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
            const draftItem = {
                uiId: allocateUiId(),
                index: 0,
                document: doc,
                readOnly: false,
                preview: { latitude_deg: null, longitude_deg: null, altitude_m: null },
            } satisfies TypedDraftItem;
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
        const draftItem = {
            uiId: allocateUiId(),
            index: insertAt,
            document: doc,
            readOnly: false,
            preview: { latitude_deg: null, longitude_deg: null, altitude_m: null },
        } satisfies TypedDraftItem;
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
            primarySelectedUiId: selection.primarySelectedUiId !== null && !deleteUiIds.has(selection.primarySelectedUiId)
                ? selection.primarySelectedUiId
                : null,
            selectionAnchorUiId: selection.selectionAnchorUiId !== null && !deleteUiIds.has(selection.selectionAnchorUiId)
                ? selection.selectionAnchorUiId
                : null,
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

// ---------------------------------------------------------------------------
// Public API: mutations
// ---------------------------------------------------------------------------

/** Replace a fence region at the given index with a new FenceRegion and recompute its preview. */
export function updateFenceRegion(state: TypedDraftState, index: number, region: FenceRegion): TypedDraftState {
    return withActiveItems(state, "fence", (items, selection) => ({
        items: items.map((entry, i) => {
            if (i !== index) return entry;
            return { ...entry, document: region, preview: previewFromFenceRegion(region) };
        }),
        selection,
    }));
}

/** Replace the command on a mission-domain item at the given index. */
export function updateTypedCommand(state: TypedDraftState, domain: MissionDomain, index: number, command: MissionCommand): TypedDraftState {
    if (domain !== "mission") return state;
    return withActiveItems(state, domain, (items, selection) => ({
        items: items.map((entry, i) => {
            if (i !== index || entry.readOnly) return entry;
            const item = entry.document as MissionItem;
            return { ...entry, document: { ...item, command } };
        }),
        selection,
    }));
}

/** Update the altitude on a mission or rally item's GeoPoint3d. */
export function updateTypedAltitude(state: TypedDraftState, domain: MissionDomain, index: number, altitudeM: number): TypedDraftState {
    if (domain === "fence") return state;
    return withActiveItems(state, domain, (items, selection) => ({
        items: items.map((entry, i) => {
            if (i !== index || entry.readOnly) return entry;
            if (domain === "rally") {
                return { ...entry, document: withGeoPoint3dAltitude(entry.document as GeoPoint3d, altitudeM) };
            }
            // mission
            const item = entry.document as MissionItem;
            const pos = commandPosition(item.command);
            if (!pos) return entry;
            return {
                ...entry,
                document: { ...item, command: withCommandPosition(item.command, withGeoPoint3dAltitude(pos, altitudeM)) },
            };
        }),
        selection,
    }));
}

export function bulkUpdateAltitude(
    state: TypedDraftState,
    domain: MissionDomain,
    uiIds: Iterable<number>,
    altitudeM: number,
): TypedDraftState {
    if (domain === "fence") return state;
    const targetUiIds = new Set(uiIds);
    if (targetUiIds.size === 0) return state;
    return withActiveItems(state, domain, (items, selection) => ({
        items: items.map((entry) => {
            if (!targetUiIds.has(entry.uiId) || entry.readOnly) return entry;
            if (domain === "rally") {
                return { ...entry, document: withGeoPoint3dAltitude(entry.document as GeoPoint3d, altitudeM) };
            }
            const item = entry.document as MissionItem;
            const pos = commandPosition(item.command);
            if (!pos) return entry;
            return {
                ...entry,
                document: { ...item, command: withCommandPosition(item.command, withGeoPoint3dAltitude(pos, altitudeM)) },
            };
        }),
        selection,
    }));
}

/** Update the latitude on a mission or rally item. */
export function updateTypedLatitude(state: TypedDraftState, domain: MissionDomain, index: number, latitudeDeg: number): TypedDraftState {
    if (domain === "fence") return state;
    return withActiveItems(state, domain, (items, selection) => ({
        items: items.map((entry, i) => {
            if (i !== index || entry.readOnly) return entry;
            if (domain === "rally") {
                const pt = entry.document as GeoPoint3d;
                const { longitude_deg } = geoPoint3dLatLon(pt);
                return { ...entry, document: withGeoPoint3dPosition(pt, latitudeDeg, longitude_deg) };
            }
            const item = entry.document as MissionItem;
            const pos = commandPosition(item.command);
            if (!pos) return entry;
            const { longitude_deg } = geoPoint3dLatLon(pos);
            return {
                ...entry,
                document: { ...item, command: withCommandPosition(item.command, withGeoPoint3dPosition(pos, latitudeDeg, longitude_deg)) },
            };
        }),
        selection,
    }));
}

/** Update the longitude on a mission or rally item. */
export function updateTypedLongitude(state: TypedDraftState, domain: MissionDomain, index: number, longitudeDeg: number): TypedDraftState {
    if (domain === "fence") return state;
    return withActiveItems(state, domain, (items, selection) => ({
        items: items.map((entry, i) => {
            if (i !== index || entry.readOnly) return entry;
            if (domain === "rally") {
                const pt = entry.document as GeoPoint3d;
                const { latitude_deg } = geoPoint3dLatLon(pt);
                return { ...entry, document: withGeoPoint3dPosition(pt, latitude_deg, longitudeDeg) };
            }
            const item = entry.document as MissionItem;
            const pos = commandPosition(item.command);
            if (!pos) return entry;
            const { latitude_deg } = geoPoint3dLatLon(pos);
            return {
                ...entry,
                document: { ...item, command: withCommandPosition(item.command, withGeoPoint3dPosition(pos, latitude_deg, longitudeDeg)) },
            };
        }),
        selection,
    }));
}

/** Move a waypoint to a new lat/lon (e.g., map drag). */
export function moveTypedWaypointOnMap(state: TypedDraftState, domain: MissionDomain, index: number, latDeg: number, lonDeg: number): TypedDraftState {
    if (domain === "fence") return state;
    return withActiveItems(state, domain, (items, selection) => ({
        items: items.map((entry, i) => {
            if (i !== index || entry.readOnly) return entry;
            if (domain === "rally") {
                return { ...entry, document: withGeoPoint3dPosition(entry.document as GeoPoint3d, latDeg, lonDeg) };
            }
            const item = entry.document as MissionItem;
            const pos = commandPosition(item.command);
            if (!pos) return entry;
            return {
                ...entry,
                document: { ...item, command: withCommandPosition(item.command, withGeoPoint3dPosition(pos, latDeg, lonDeg)) },
            };
        }),
        selection,
    }));
}

// ---------------------------------------------------------------------------
// Public API: bulk operations
// ---------------------------------------------------------------------------

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
    const active = activeDraft(state, domain);
    const raw = newItems as (MissionItem | FenceRegion | GeoPoint3d)[];
    const plan = planFromItems(domain, raw, active.document);
    return replaceActiveDraft(state, domain, {
        ...active,
        document: plan as typeof active.document,
        draftItems: toDraftItems(domain, raw),
        ...emptySelection(),
    } as typeof active);
}

// ---------------------------------------------------------------------------
// Public API: preview / coordinate helpers
// ---------------------------------------------------------------------------

export function typedPreviewCoordinates(item: TypedDraftItem): { latitude_deg: number; longitude_deg: number } | null {
    if (item.preview.latitude_deg === null || item.preview.longitude_deg === null) {
        return null;
    }
    return {
        latitude_deg: item.preview.latitude_deg,
        longitude_deg: item.preview.longitude_deg,
    };
}

/** Change the altitude frame on a rally point, preserving lat/lon and resetting altitude to 0. */
export function updateRallyAltitudeFrame(
    state: TypedDraftState,
    index: number,
    frame: "msl" | "rel_home" | "terrain",
): TypedDraftState {
    return withActiveItems(state, "rally", (items, selection) => ({
        items: items.map((entry, i) => {
            if (i !== index || entry.readOnly) return entry;
            const pt = entry.document as GeoPoint3d;
            const { latitude_deg, longitude_deg } = geoPoint3dLatLon(pt);
            let newPt: GeoPoint3d;
            if (frame === "msl") {
                newPt = { Msl: { latitude_deg, longitude_deg, altitude_msl_m: 0 } };
            } else if (frame === "rel_home") {
                newPt = { RelHome: { latitude_deg, longitude_deg, relative_alt_m: 0 } };
            } else {
                newPt = { Terrain: { latitude_deg, longitude_deg, altitude_terrain_m: 0 } };
            }
            return { ...entry, document: newPt };
        }),
        selection,
    }));
}

// ---------------------------------------------------------------------------
// Internal: command position replacement
// ---------------------------------------------------------------------------

/**
 * Replace the position field inside a MissionCommand with a new GeoPoint3d.
 * Returns the original command unchanged when the variant has no position.
 */
function withCommandPosition(cmd: MissionCommand, newPos: GeoPoint3d): MissionCommand {
    if ("Nav" in cmd) {
        const nav = cmd.Nav;
        if (typeof nav === "string") return cmd;
        const key = Object.keys(nav)[0] as string;
        const inner = (nav as Record<string, Record<string, unknown>>)[key];
        if (inner && "position" in inner) {
            return { Nav: { [key]: { ...inner, position: newPos } } as unknown as import("./mavkit-types").NavCommand };
        }
        return cmd;
    }
    if ("Do" in cmd) {
        const d = cmd.Do;
        if (typeof d === "string") return cmd;
        const key = Object.keys(d)[0] as string;
        const inner = (d as Record<string, Record<string, unknown>>)[key];
        if (inner && "position" in inner) {
            return { Do: { [key]: { ...inner, position: newPos } } as unknown as import("./mavkit-types").DoCommand };
        }
        return cmd;
    }
    return cmd;
}
