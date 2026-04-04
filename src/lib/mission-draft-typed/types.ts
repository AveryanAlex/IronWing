import type { SourceKind } from "../../session";
import type { FencePlan, FenceRegion, GeoPoint3d, MissionItem, MissionPlan, RallyPlan } from "../mavkit-types";

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

export type FenceRegionType = "inclusion_polygon" | "exclusion_polygon" | "inclusion_circle" | "exclusion_circle";

export type RecoverableDraft<T> = {
    document: T;
    scope: SessionScope;
};

export type ActiveDraft<T> = RecoverableDraft<T> & {
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

export type DraftSelectionState = {
    selectedUiIds: Set<number>;
    primarySelectedUiId: number | null;
    selectionAnchorUiId: number | null;
};
