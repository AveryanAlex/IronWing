import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readFile, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import {
    cancelMissionTransfer,
    clearMission,
    downloadMission,
    subscribeMissionState,
    setCurrentMissionItem,
    subscribeMissionProgress,
    uploadMission,
    validateMission,
    type HomePosition,
    type MissionState,
    type MissionIssue,
    type TransferProgress,
    type MissionPlan,
    type MissionCommand,
    type MissionItem,
} from "../mission";
import {
    clearFence,
    downloadFence,
    uploadFence,
    type FencePlan,
    type FenceRegion,
} from "../fence";
import {
    clearRally,
    downloadRally,
    uploadRally,
    type RallyPlan,
} from "../rally";
import { exportPlanFile as exportQgcPlanFile, parsePlanFile, type ExportDomain, type PlanParseResult } from "../lib/mission-plan-io";
import { parseKml, parseKmz } from "../lib/mission-kml-io";
import type { Telemetry } from "../telemetry";
import { subscribeSessionState } from "../session";
import { asErrorMessage } from "./use-session-helpers";
import { toast } from "sonner";
import {
    addTypedWaypoint,
    addTypedWaypointAt,
    bulkDelete,
    bulkUpdateAltitude,
    createTypedDraftState,
    deleteTypedAt,
    insertTypedAfter,
    insertTypedBefore,
    insertTypedItemsAfter,
    isTypedDraftDirty,
    moveDirtyDraftToRecoverable,
    moveTypedDown,
    moveTypedUp,
    moveTypedWaypointOnMap,
    recoverTypedDraft,
    reorderTypedItems,
    replaceAllTypedItems,
    replaceTypedDraftFromDownload,
    selectTypedDraftRange,
    setTypedDraftScope,
    selectTypedDraftIndex,
    toggleTypedDraftSelection,
    typedDraftPlan,
    typedDraftItems,
    typedDraftSelectedIndex,
    typedDraftSelectedIndices,
    typedDraftSelectedItem,
    typedDraftSelectedUiIds,
    typedDraftSelectionAnchorIndex,
    typedDraftSelectionCount,
    typedDraftPreviousItem,
    updateTypedAltitude,
    updateTypedCommand,
    updateTypedLatitude,
    updateTypedLongitude,
    updateFenceRegion,
    updateRallyAltitudeFrame,
    addFenceRegionAt,
    setFenceReturnPoint,
    type MissionDomain,
    type SessionScope,
    type FenceRegionType,
    type TypedDraftState,
} from "../lib/mission-draft-typed";

type HomeSource = "vehicle" | "user" | "download" | null;

type PendingExport = {
    path: string;
    mission: MissionPlan;
    home: HomePosition | null;
    fence: FencePlan;
    rally: RallyPlan;
    cruiseSpeed: number | undefined;
    hoverSpeed: number | undefined;
};

export type TransferUi = {
    active: boolean;
    hasProgress: boolean;
    progressPct: number;
    direction: "upload" | "download" | null;
    completedItems: number;
    totalItems: number;
};

type DomainOperationKind = "validate" | "upload" | "download" | "clear";

type DomainOperationState = {
    active: boolean;
    kind: DomainOperationKind | null;
    scopeKey: string | null;
    token: number | null;
};

type DomainOperations = Record<MissionDomain, DomainOperationState>;
type DomainIssues = Record<MissionDomain, MissionIssue[]>;

type DomainBridge = {
    validate: (plan: MissionPlan | FencePlan | RallyPlan) => Promise<MissionIssue[]>;
    upload: (plan: MissionPlan | FencePlan | RallyPlan) => Promise<void>;
    download: () => Promise<{ plan: MissionPlan | FencePlan | RallyPlan; home: HomePosition | null }>;
    clear: () => Promise<void>;
};

type RecoverableHome = {
    home: HomePosition | null;
    scope: SessionScope;
};

type MissionHomeState = {
    active: HomePosition | null;
    snapshot: HomePosition | null;
    recoverable: RecoverableHome | null;
    scope: SessionScope;
};

type MissionTab = {
    id: MissionDomain;
    label: string;
};

type MissionPlanningSpeeds = {
    cruiseSpeedMps: number;
    hoverSpeedMps: number;
};

type DomainPlanMap = {
    mission: MissionPlan;
    fence: FencePlan;
    rally: RallyPlan;
};

type DomainHistorySnapshot = {
    draft: TypedDraftState["active"][MissionDomain];
    homeState: MissionHomeState | null;
    homeSource: HomeSource;
};

type DomainHistory = {
    past: DomainHistorySnapshot[];
    future: DomainHistorySnapshot[];
};

type DraftHistoryState = Record<MissionDomain, DomainHistory>;

const HISTORY_LIMIT = 50;

const EMPTY_SCOPE: SessionScope = { session_id: "", source_kind: "live", seek_epoch: 0, reset_revision: 0 };
const MISSION_TABS: MissionTab[] = [
    { id: "mission", label: "Mission" },
    { id: "fence", label: "Fence" },
    { id: "rally", label: "Rally" },
];

function createEmptyOperations(): DomainOperations {
    return {
        mission: { active: false, kind: null, scopeKey: null, token: null },
        fence: { active: false, kind: null, scopeKey: null, token: null },
        rally: { active: false, kind: null, scopeKey: null, token: null },
    };
}

function createEmptyIssues(): DomainIssues {
    return { mission: [], fence: [], rally: [] };
}

function missionLabel(domain: MissionDomain): string {
    return domain === "mission" ? "Mission" : domain === "fence" ? "Fence" : "Rally";
}

function emptyDomainPlan<T extends MissionDomain>(domain: T): DomainPlanMap[T] {
    if (domain === "fence") return { return_point: null, regions: [] } as unknown as DomainPlanMap[T];
    if (domain === "rally") return { points: [] } as unknown as DomainPlanMap[T];
    return { items: [] } as unknown as DomainPlanMap[T];
}

function planItemCount(domain: MissionDomain, plan: DomainPlanMap[MissionDomain]): number {
    if (domain === "mission") return (plan as MissionPlan).items.length;
    if (domain === "fence") return (plan as FencePlan).regions.length;
    return (plan as RallyPlan).points.length;
}

function scopeKey(scope: SessionScope | null): string {
    if (!scope) return "";
    return `${scope.session_id}:${scope.source_kind}:${scope.seek_epoch}:${scope.reset_revision}`;
}

function scopeMatches(left: SessionScope | null, right: SessionScope | null): boolean {
    return scopeKey(left) === scopeKey(right);
}

function recoverableScopeMatches(recoverable: SessionScope | null | undefined, currentScope: SessionScope | null): boolean {
    if (!recoverable || !currentScope) return false;
    return recoverable.session_id === currentScope.session_id && recoverable.source_kind === currentScope.source_kind;
}

function sameHome(left: HomePosition | null, right: HomePosition | null): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

function createMissionHomeState(): MissionHomeState {
    return {
        active: null,
        snapshot: null,
        recoverable: null,
        scope: EMPTY_SCOPE,
    };
}

function createEmptyHistory(): DraftHistoryState {
    return {
        mission: { past: [], future: [] },
        fence: { past: [], future: [] },
        rally: { past: [], future: [] },
    };
}

function appendLimited<T>(items: T[], nextItem: T): T[] {
    const next = [...items, nextItem];
    return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

function sameDomainDocument(left: TypedDraftState["active"][MissionDomain], right: TypedDraftState["active"][MissionDomain]): boolean {
    return JSON.stringify(left.document) === JSON.stringify(right.document);
}

function setMissionHomeScope(state: MissionHomeState, scope: SessionScope): MissionHomeState {
    return { ...state, scope };
}

function replaceMissionHomeFromDownload(
    state: MissionHomeState,
    home: HomePosition | null,
    scope: SessionScope,
    options?: { markDirty?: boolean },
): MissionHomeState {
    return {
        ...state,
        active: home,
        snapshot: options?.markDirty ? state.snapshot : home,
        scope,
    };
}

function replaceMissionHome(
    state: MissionHomeState,
    home: HomePosition | null,
    options?: { syncSnapshotWhenClean?: boolean },
): MissionHomeState {
    const next = { ...state, active: home };
    if (options?.syncSnapshotWhenClean && sameHome(state.active, state.snapshot)) {
        next.snapshot = home;
    }
    return next;
}

function moveDirtyMissionHomeToRecoverable(state: MissionHomeState, nextScope: SessionScope): MissionHomeState {
    return {
        active: null,
        snapshot: null,
        scope: nextScope,
        recoverable: !sameHome(state.active, state.snapshot)
            ? { home: state.active, scope: state.scope }
            : state.recoverable,
    };
}

function recoverMissionHome(state: MissionHomeState, scope: SessionScope): MissionHomeState {
    const recoverable = state.recoverable;
    if (!recoverable) return state;
    if (recoverable.scope.session_id !== scope.session_id || recoverable.scope.source_kind !== scope.source_kind) {
        return state;
    }
    return {
        active: recoverable.home,
        snapshot: state.snapshot,
        scope,
        recoverable: null,
    };
}

function progressForDomain(progress: TransferProgress | null, domain: MissionDomain): TransferUi {
    const matches = progress?.mission_type === domain;
    const active = matches && (
        progress.phase === "request_count"
        || progress.phase === "transfer_items"
        || progress.phase === "await_ack"
    );
    const hasProgress = matches && (progress.phase === "transfer_items" || progress.phase === "request_count");
    const progressPct = matches && progress.total_items > 0
        ? (progress.completed_items / progress.total_items) * 100
        : 0;
    return {
        active,
        hasProgress,
        progressPct,
        direction: matches ? progress.direction : null,
        completedItems: matches ? progress.completed_items : 0,
        totalItems: matches ? progress.total_items : 0,
    };
}

export function useMission(
    connected: boolean,
    telemetry: Telemetry,
    vehicleHomePosition: HomePosition | null,
    bootstrapScope: SessionScope | null = null,
    bootstrapMissionState: MissionState | null = null,
) {
    const [selectedTab, setSelectedTab] = useState<MissionDomain>("mission");
    const [homeSource, setHomeSource] = useState<HomeSource>(null);
    const [homeLatInput, setHomeLatInput] = useState("");
    const [homeLonInput, setHomeLonInput] = useState("");
    const [homeAltInput, setHomeAltInput] = useState("");
    const [issues, setIssues] = useState<DomainIssues>(createEmptyIssues);
    const [progress, setProgress] = useState<TransferProgress | null>(null);
    const [missionState, setMissionState] = useState<MissionState | null>(null);
    const [lastOpStatus, setLastOpStatus] = useState<Record<MissionDomain, string>>({ mission: "", fence: "", rally: "" });
    const [typedDraftState, setTypedDraftState] = useState(createTypedDraftState);
    const [missionHomeState, setMissionHomeState] = useState(createMissionHomeState);
    const [history, setHistory] = useState<DraftHistoryState>(createEmptyHistory);
    const [operations, setOperations] = useState<DomainOperations>(createEmptyOperations);
    const [currentScope, setCurrentScope] = useState<SessionScope | null>(null);
    const [importedMissionSpeeds, setImportedMissionSpeeds] = useState<MissionPlanningSpeeds | null>(null);
    const [pendingImport, setPendingImport] = useState<PlanParseResult | null>(null);
    const [pendingExport, setPendingExport] = useState<PendingExport | null>(null);
    const [importError, setImportError] = useState<{ title: string; details: string } | null>(null);

    const scopeRef = useRef<SessionScope | null>(null);
    const typedDraftStateRef = useRef(typedDraftState);
    const missionHomeStateRef = useRef(missionHomeState);
    const historyRef = useRef(history);
    const homeSourceRef = useRef(homeSource);
    const operationsRef = useRef(operations);
    const nextOperationTokenRef = useRef(1);
    const exportMissionSpeedsRef = useRef<MissionPlanningSpeeds | null>(null);

    useEffect(() => { typedDraftStateRef.current = typedDraftState; }, [typedDraftState]);
    useEffect(() => { missionHomeStateRef.current = missionHomeState; }, [missionHomeState]);
    useEffect(() => { historyRef.current = history; }, [history]);
    useEffect(() => { homeSourceRef.current = homeSource; }, [homeSource]);
    useEffect(() => { operationsRef.current = operations; }, [operations]);

    const commitTypedDraftState = useCallback((nextState: TypedDraftState) => {
        typedDraftStateRef.current = nextState;
        setTypedDraftState(nextState);
    }, []);

    const syncHomeInputs = useCallback((home: HomePosition | null, source: HomeSource) => {
        homeSourceRef.current = source;
        setHomeSource(source);
        if (home) {
            setHomeLatInput(home.latitude_deg.toFixed(6));
            setHomeLonInput(home.longitude_deg.toFixed(6));
            setHomeAltInput(home.altitude_m.toFixed(2));
            return;
        }
        setHomeLatInput("");
        setHomeLonInput("");
        setHomeAltInput("");
    }, []);

    const commitMissionHomeState = useCallback((nextState: MissionHomeState, source: HomeSource) => {
        missionHomeStateRef.current = nextState;
        setMissionHomeState(nextState);
        syncHomeInputs(nextState.active, source);
    }, [syncHomeInputs]);

    const commitHistory = useCallback((nextHistory: DraftHistoryState) => {
        historyRef.current = nextHistory;
        setHistory(nextHistory);
    }, []);

    const resetHistory = useCallback((domain?: MissionDomain) => {
        if (!domain) {
            commitHistory(createEmptyHistory());
            return;
        }
        commitHistory({
            ...historyRef.current,
            [domain]: { past: [], future: [] },
        });
    }, [commitHistory]);

    const captureHistorySnapshot = useCallback((domain: MissionDomain): DomainHistorySnapshot => {
        return {
            draft: structuredClone(typedDraftStateRef.current.active[domain]),
            homeState: domain === "mission" ? structuredClone(missionHomeStateRef.current) : null,
            homeSource: domain === "mission" ? homeSourceRef.current : null,
        };
    }, []);

    const pushHistorySnapshot = useCallback((domain: MissionDomain, snapshot: DomainHistorySnapshot) => {
        const domainHistory = historyRef.current[domain];
        commitHistory({
            ...historyRef.current,
            [domain]: {
                past: appendLimited(domainHistory.past, snapshot),
                future: [],
            },
        });
    }, [commitHistory]);

    const restoreHistorySnapshot = useCallback((domain: MissionDomain, snapshot: DomainHistorySnapshot) => {
        commitTypedDraftState({
            ...typedDraftStateRef.current,
            active: {
                ...typedDraftStateRef.current.active,
                [domain]: structuredClone(snapshot.draft),
            },
        });
        if (domain === "mission" && snapshot.homeState) {
            commitMissionHomeState(structuredClone(snapshot.homeState), snapshot.homeSource);
        }
    }, [commitMissionHomeState, commitTypedDraftState]);

    const undoDomain = useCallback((domain: MissionDomain) => {
        if (historyRef.current[domain].past.length === 0) return;
        const previous = captureHistorySnapshot(domain);
        const domainHistory = historyRef.current[domain];
        const snapshot = domainHistory.past[domainHistory.past.length - 1];
        if (!snapshot) return;
        commitHistory({
            ...historyRef.current,
            [domain]: {
                past: domainHistory.past.slice(0, -1),
                future: appendLimited(domainHistory.future, previous),
            },
        });
        restoreHistorySnapshot(domain, snapshot);
    }, [captureHistorySnapshot, commitHistory, restoreHistorySnapshot]);

    const redoDomain = useCallback((domain: MissionDomain) => {
        if (historyRef.current[domain].future.length === 0) return;
        const previous = captureHistorySnapshot(domain);
        const domainHistory = historyRef.current[domain];
        const snapshot = domainHistory.future[domainHistory.future.length - 1];
        if (!snapshot) return;
        commitHistory({
            ...historyRef.current,
            [domain]: {
                past: appendLimited(domainHistory.past, previous),
                future: domainHistory.future.slice(0, -1),
            },
        });
        restoreHistorySnapshot(domain, snapshot);
    }, [captureHistorySnapshot, commitHistory, restoreHistorySnapshot]);

    const visibleOperations = useMemo<DomainOperations>(() => {
        const activeScopeKey = scopeKey(currentScope);
        return {
            mission: { ...operations.mission, active: operations.mission.active && operations.mission.scopeKey === activeScopeKey },
            fence: { ...operations.fence, active: operations.fence.active && operations.fence.scopeKey === activeScopeKey },
            rally: { ...operations.rally, active: operations.rally.active && operations.rally.scopeKey === activeScopeKey },
        };
    }, [currentScope, operations]);

    const bridges: Record<MissionDomain, DomainBridge> = useMemo(() => ({
        mission: {
            validate: (plan) => validateMission(plan as MissionPlan),
            upload: (plan) => uploadMission(plan as MissionPlan),
            download: async () => {
                const result = await downloadMission();
                return { plan: result.plan, home: result.home };
            },
            clear: clearMission,
        },
        fence: {
            validate: async () => [],
            upload: (plan) => uploadFence(plan as FencePlan),
            download: async () => ({ plan: await downloadFence(), home: null }),
            clear: clearFence,
        },
        rally: {
            validate: async () => [],
            upload: (plan) => uploadRally(plan as RallyPlan),
            download: async () => ({ plan: await downloadRally(), home: null }),
            clear: clearRally,
        },
    }), []);

    const resetHomeInputs = useCallback(() => {
        syncHomeInputs(null, null);
    }, [syncHomeInputs]);

    const setMissionHomeValue = useCallback((
        home: HomePosition | null,
        source: HomeSource,
        options?: { recordHistory?: boolean; syncSnapshotWhenClean?: boolean },
    ) => {
        const previousHomeState = missionHomeStateRef.current;
        const previousSource = homeSourceRef.current;
        const nextHomeState = replaceMissionHome(previousHomeState, home, { syncSnapshotWhenClean: options?.syncSnapshotWhenClean });
        if (sameHome(previousHomeState.active, nextHomeState.active) && previousSource === source) {
            return;
        }
        if (options?.recordHistory) {
            pushHistorySnapshot("mission", captureHistorySnapshot("mission"));
        }
        commitMissionHomeState(nextHomeState, source);
    }, [captureHistorySnapshot, commitMissionHomeState, pushHistorySnapshot]);

    const startOperation = useCallback((domain: MissionDomain, kind: DomainOperationKind): { token: number; scope: SessionScope | null } | null => {
        if (operationsRef.current[domain].active) {
            toast.error(`${missionLabel(domain)} operation already in progress`);
            return null;
        }

        const token = nextOperationTokenRef.current++;
        const scope = scopeRef.current;
        const next = {
            ...operationsRef.current,
            [domain]: { active: true, kind, scopeKey: scopeKey(scope), token },
        };
        operationsRef.current = next;
        setOperations(next);
        return { token, scope };
    }, []);

    const finishOperation = useCallback((domain: MissionDomain, kind: DomainOperationKind, token: number) => {
        setOperations((prev) => {
            if (prev[domain].kind !== kind || prev[domain].token !== token) {
                return prev;
            }
            const next = {
                ...prev,
                [domain]: { active: false, kind: null, scopeKey: null, token: null },
            };
            operationsRef.current = next;
            return next;
        });
    }, []);

    const resetOperations = useCallback(() => {
        const next = createEmptyOperations();
        operationsRef.current = next;
        setOperations(next);
    }, []);

    const resetMissionPlanningSpeeds = useCallback(() => {
        exportMissionSpeedsRef.current = null;
        setImportedMissionSpeeds(null);
    }, []);

    const setExportSpeeds = useCallback((speeds: MissionPlanningSpeeds) => {
        exportMissionSpeedsRef.current = speeds;
    }, []);

    const cancelActiveTransfer = useCallback(() => {
        void Promise.resolve(cancelMissionTransfer()).catch(() => {
            // Best-effort transfer abort; stale-result guards still prevent mutation.
        });
    }, []);

    useEffect(() => {
        if (!connected) {
            cancelActiveTransfer();
            scopeRef.current = null;
            setCurrentScope(null);
            setMissionState(null);
            setProgress(null);
            resetOperations();
            resetHistory();
            resetMissionPlanningSpeeds();
        }
    }, [cancelActiveTransfer, connected, resetHistory, resetMissionPlanningSpeeds, resetOperations]);

    useEffect(() => {
        if (vehicleHomePosition && homeSource !== "user" && homeSource !== "download") {
            setMissionHomeValue(vehicleHomePosition, "vehicle", { syncSnapshotWhenClean: true });
        }
    }, [homeSource, setMissionHomeValue, vehicleHomePosition]);

    useEffect(() => {
        if (!bootstrapScope) return;
        if (!scopeMatches(scopeRef.current, bootstrapScope)) {
            resetHistory();
            resetMissionPlanningSpeeds();
        }
        scopeRef.current = bootstrapScope;
        setCurrentScope((prev) => scopeMatches(prev, bootstrapScope) ? prev : bootstrapScope);
        commitTypedDraftState(setTypedDraftScope(typedDraftStateRef.current, bootstrapScope));
        commitMissionHomeState(setMissionHomeScope(missionHomeStateRef.current, bootstrapScope), homeSourceRef.current);
        setMissionState(bootstrapMissionState);
    }, [bootstrapMissionState, bootstrapScope, commitMissionHomeState, commitTypedDraftState, resetHistory, resetMissionPlanningSpeeds]);

    useEffect(() => {
        let cancelled = false;
        const disposers: Array<() => void> = [];

        const registerDisposer = (dispose: () => void) => {
            if (cancelled) {
                dispose();
                return;
            }

            disposers.push(dispose);
        };

        const setupSubscriptions = async () => {
            try {
                const [stopProgress, stopState, stopSession] = await Promise.all([
                    subscribeMissionProgress((event) => {
                        if (!scopeMatches(event.envelope, scopeRef.current)) {
                            return;
                        }

                        setProgress(event.value);
                    }),
                    subscribeMissionState((event) => {
                        if (!scopeMatches(event.envelope, scopeRef.current)) {
                            return;
                        }

                        setMissionState(event.value);
                    }),
                    subscribeSessionState((event) => {
                        const nextScope = event.envelope;
                        const previousScope = scopeRef.current;
                        scopeRef.current = nextScope;
                        setCurrentScope(nextScope);
                        if (!previousScope) {
                            commitTypedDraftState(setTypedDraftScope(typedDraftStateRef.current, nextScope));
                            commitMissionHomeState(setMissionHomeScope(missionHomeStateRef.current, nextScope), homeSourceRef.current);
                            resetHistory();
                            return;
                        }
                        if (scopeMatches(previousScope, nextScope)) {
                            return;
                        }

                        cancelActiveTransfer();
                        setMissionState(null);
                        commitTypedDraftState(moveDirtyDraftToRecoverable(typedDraftStateRef.current, nextScope));
                        commitMissionHomeState(moveDirtyMissionHomeToRecoverable(missionHomeStateRef.current, nextScope), null);
                        resetOperations();
                        resetHistory();
                        resetMissionPlanningSpeeds();
                        setProgress(null);
                        setIssues(createEmptyIssues());
                        setLastOpStatus({ mission: "", fence: "", rally: "" });
                        resetHomeInputs();
                    }),
                ]);

                registerDisposer(stopProgress);
                registerDisposer(stopState);
                registerDisposer(stopSession);
            } catch (error) {
                if (!cancelled) {
                    console.warn("Mission subscription setup failed", error);
                }
            }
        };

        void setupSubscriptions();

        return () => {
            cancelled = true;
            for (const dispose of disposers.splice(0).reverse()) {
                dispose();
            }
        };
    }, [cancelActiveTransfer, commitMissionHomeState, commitTypedDraftState, resetHistory, resetHomeInputs, resetMissionPlanningSpeeds, resetOperations]);

    const isPlaybackScope = useCallback(() => scopeRef.current?.source_kind === "playback", []);

    const rejectIfPlaybackReadonly = useCallback((domain: MissionDomain): boolean => {
        if (!isPlaybackScope()) return false;
        toast.error(`${missionLabel(domain)} is read-only in playback`);
        return true;
    }, [isPlaybackScope]);

    const isCurrentOperation = useCallback((domain: MissionDomain, token: number, scope: SessionScope | null) => {
        const active = operationsRef.current[domain];
        return active.token === token && scopeMatches(scope, scopeRef.current);
    }, []);

    const domainVisible = useCallback((domain: MissionDomain) => {
        return currentScope === null || scopeMatches(typedDraftStateRef.current.active[domain].scope, currentScope);
    }, [currentScope]);

    const currentPlan = useCallback(<T extends MissionDomain>(domain: T): DomainPlanMap[T] => {
        if (!domainVisible(domain)) {
            return emptyDomainPlan(domain);
        }
        return typedDraftStateRef.current.active[domain].document as DomainPlanMap[T];
    }, [domainVisible]);

    const currentHome = useCallback(() => {
        if (currentScope !== null && !scopeMatches(missionHomeStateRef.current.scope, currentScope)) {
            return null;
        }
        return missionHomeStateRef.current.active;
    }, [currentScope]);

    const setSelectedIndex = useCallback((domain: MissionDomain, index: number | null) => {
        commitTypedDraftState(selectTypedDraftIndex(typedDraftStateRef.current, domain, index));
    }, [commitTypedDraftState]);

    const toggleSelectedIndex = useCallback((domain: MissionDomain, index: number) => {
        commitTypedDraftState(toggleTypedDraftSelection(typedDraftStateRef.current, domain, index));
    }, [commitTypedDraftState]);

    const selectRange = useCallback((domain: MissionDomain, fromIndex: number, toIndex: number) => {
        commitTypedDraftState(selectTypedDraftRange(typedDraftStateRef.current, domain, fromIndex, toIndex));
    }, [commitTypedDraftState]);

    const mutateDomain = useCallback((domain: MissionDomain, update: (state: ReturnType<typeof createTypedDraftState>) => ReturnType<typeof createTypedDraftState>) => {
        if (rejectIfPlaybackReadonly(domain)) return;
        const previousState = typedDraftStateRef.current;
        const nextState = update(previousState);
        if (sameDomainDocument(previousState.active[domain], nextState.active[domain])) {
            return;
        }
        pushHistorySnapshot(domain, captureHistorySnapshot(domain));
        commitTypedDraftState(nextState);
    }, [captureHistorySnapshot, commitTypedDraftState, pushHistorySnapshot, rejectIfPlaybackReadonly]);

    const bulkUpdateSelectedAltitude = useCallback((domain: MissionDomain, altitudeM: number) => {
        mutateDomain(domain, (prev) => bulkUpdateAltitude(prev, domain, typedDraftSelectedUiIds(prev, domain), altitudeM));
    }, [mutateDomain]);

    const bulkDeleteSelected = useCallback((domain: MissionDomain) => {
        mutateDomain(domain, (prev) => bulkDelete(prev, domain, typedDraftSelectedUiIds(prev, domain)));
    }, [mutateDomain]);

    const validate = useCallback(async (domain: MissionDomain) => {
        const operation = startOperation(domain, "validate");
        if (!operation) return;
        try {
            const result = await bridges[domain].validate(currentPlan(domain));
            if (!isCurrentOperation(domain, operation.token, operation.scope)) return;
            setIssues((prev) => ({ ...prev, [domain]: result }));
            if (result.length === 0) toast.success(`${missionLabel(domain)} valid`);
        } catch (err) {
            if (!isCurrentOperation(domain, operation.token, operation.scope)) return;
            toast.error("Validation failed", { description: asErrorMessage(err) });
        } finally {
            finishOperation(domain, "validate", operation.token);
        }
    }, [bridges, currentPlan, finishOperation, isCurrentOperation, startOperation]);

    const upload = useCallback(async (domain: MissionDomain) => {
        if (!connected) { toast.error("Connect to vehicle before upload"); return; }
        if (rejectIfPlaybackReadonly(domain)) return;
        const operation = startOperation(domain, "upload");
        if (!operation) return;
        setProgress(null);
        try {
            const plan = currentPlan(domain);
            await bridges[domain].upload(plan);
            if (!isCurrentOperation(domain, operation.token, operation.scope)) return;
            commitTypedDraftState(replaceTypedDraftFromDownload(typedDraftStateRef.current, domain, plan, operation.scope ?? EMPTY_SCOPE));
            if (domain === "mission") {
                const home = currentHome();
                commitMissionHomeState(
                    replaceMissionHomeFromDownload(missionHomeStateRef.current, home, operation.scope ?? EMPTY_SCOPE),
                    homeSourceRef.current,
                );
            }
            resetHistory(domain);
            toast.success(`${missionLabel(domain)} uploaded`, { description: `${planItemCount(domain, plan)} items` });
        } catch (err) {
            if (!isCurrentOperation(domain, operation.token, operation.scope)) return;
            setProgress((prev) => prev && prev.phase !== "completed" && prev.phase !== "failed"
                ? { ...prev, phase: "failed" }
                : prev);
            toast.error("Upload failed", { description: asErrorMessage(err) });
        } finally {
            finishOperation(domain, "upload", operation.token);
        }
    }, [bridges, commitMissionHomeState, commitTypedDraftState, connected, currentHome, currentPlan, finishOperation, isCurrentOperation, rejectIfPlaybackReadonly, resetHistory, startOperation]);

    const download = useCallback(async (domain: MissionDomain) => {
        if (!connected) { toast.error("Connect to vehicle before download"); return; }
        const operation = startOperation(domain, "download");
        if (!operation) return;
        setProgress(null);
        try {
            const result = await bridges[domain].download();
            if (!isCurrentOperation(domain, operation.token, operation.scope)) return;
            // Capture before replacing so Ctrl+Z restores the pre-download state.
            const downloadSnapshot = captureHistorySnapshot(domain);
            commitTypedDraftState(replaceTypedDraftFromDownload(typedDraftStateRef.current, domain, result.plan, operation.scope ?? EMPTY_SCOPE));
            if (domain === "mission") {
                commitMissionHomeState(
                    replaceMissionHomeFromDownload(missionHomeStateRef.current, result.home, operation.scope ?? EMPTY_SCOPE),
                    result.home ? "download" : null,
                );
                resetMissionPlanningSpeeds();
            }
            pushHistorySnapshot(domain, downloadSnapshot);
            setIssues((prev) => ({ ...prev, [domain]: [] }));
            setLastOpStatus((prev) => ({ ...prev, [domain]: "Downloaded" }));
            setTimeout(() => {
              setLastOpStatus((prev) => prev[domain] === "Downloaded" ? { ...prev, [domain]: null } : prev);
            }, 3000);
            toast.success(`${missionLabel(domain)} downloaded`, { description: `${planItemCount(domain, result.plan)} items` });
        } catch (err) {
            if (!isCurrentOperation(domain, operation.token, operation.scope)) return;
            setProgress((prev) => prev && prev.phase !== "completed" && prev.phase !== "failed"
                ? { ...prev, phase: "failed" }
                : prev);
            toast.error("Download failed", { description: asErrorMessage(err) });
        } finally {
            finishOperation(domain, "download", operation.token);
        }
    }, [bridges, captureHistorySnapshot, commitMissionHomeState, commitTypedDraftState, connected, finishOperation, isCurrentOperation, pushHistorySnapshot, resetMissionPlanningSpeeds, startOperation]);

    const clear = useCallback(async (domain: MissionDomain) => {
        if (!connected) { toast.error("Connect to vehicle before clear"); return; }
        if (rejectIfPlaybackReadonly(domain)) return;
        const operation = startOperation(domain, "clear");
        if (!operation) return;
        setProgress(null);
        try {
            await bridges[domain].clear();
            if (!isCurrentOperation(domain, operation.token, operation.scope)) return;
            // Capture before replacing so Ctrl+Z restores the pre-clear state.
            const clearSnapshot = captureHistorySnapshot(domain);
            commitTypedDraftState(replaceTypedDraftFromDownload(typedDraftStateRef.current, domain, emptyDomainPlan(domain), operation.scope ?? EMPTY_SCOPE));
            if (domain === "mission") {
                commitMissionHomeState(
                    replaceMissionHomeFromDownload(missionHomeStateRef.current, null, operation.scope ?? EMPTY_SCOPE),
                    null,
                );
                resetMissionPlanningSpeeds();
            }
            pushHistorySnapshot(domain, clearSnapshot);
            setIssues((prev) => ({ ...prev, [domain]: [] }));
            setLastOpStatus((prev) => ({ ...prev, [domain]: "Cleared" }));
            setTimeout(() => {
              setLastOpStatus((prev) => prev[domain] === "Cleared" ? { ...prev, [domain]: null } : prev);
            }, 3000);
            toast.success(`${missionLabel(domain)} cleared`);
        } catch (err) {
            if (!isCurrentOperation(domain, operation.token, operation.scope)) return;
            setProgress((prev) => prev && prev.phase !== "completed" && prev.phase !== "failed"
                ? { ...prev, phase: "failed" }
                : prev);
            toast.error("Clear failed", { description: asErrorMessage(err) });
        } finally {
            finishOperation(domain, "clear", operation.token);
        }
    }, [bridges, captureHistorySnapshot, commitMissionHomeState, commitTypedDraftState, connected, finishOperation, isCurrentOperation, pushHistorySnapshot, rejectIfPlaybackReadonly, resetMissionPlanningSpeeds, startOperation]);

    const cancel = useCallback(async () => {
        if (!connected) return;
        try {
            await cancelMissionTransfer();
        } catch (err) {
            toast.error("Cancel failed", { description: asErrorMessage(err) });
        } finally {
            resetOperations();
            setProgress((prev) => prev && prev.phase !== "completed" && prev.phase !== "failed" && prev.phase !== "cancelled"
                ? { ...prev, phase: "cancelled" }
                : prev);
        }
    }, [connected, resetOperations]);

    const setCurrent = useCallback(async (domain: MissionDomain, explicitIndex?: number) => {
        if (!connected) { toast.error("Connect first"); return; }
        if (domain !== "mission") {
            toast.error("Set current is only available in Mission mode");
            return;
        }
        if (rejectIfPlaybackReadonly("mission")) return;
        const index = explicitIndex ?? typedDraftSelectedIndex(typedDraftStateRef.current, "mission");
        if (index === null) { toast.error("Select a waypoint first"); return; }
        try {
            await setCurrentMissionItem(index);
        } catch (err) {
            toast.error("Set current failed", { description: asErrorMessage(err) });
        }
    }, [connected, rejectIfPlaybackReadonly]);

    const undo = useCallback((domain: MissionDomain) => {
        if (rejectIfPlaybackReadonly(domain)) return;
        undoDomain(domain);
    }, [rejectIfPlaybackReadonly, undoDomain]);

    const redo = useCallback((domain: MissionDomain) => {
        if (rejectIfPlaybackReadonly(domain)) return;
        redoDomain(domain);
    }, [redoDomain, rejectIfPlaybackReadonly]);

    const updateHomeFromVehicle = useCallback(() => {
        if (rejectIfPlaybackReadonly("mission")) return;
        const lat = telemetry.latitude_deg;
        const lon = telemetry.longitude_deg;
        if (typeof lat !== "number" || typeof lon !== "number" || Number.isNaN(lat) || Number.isNaN(lon)) {
            toast.error("Vehicle position unavailable");
            return;
        }
        const altitude = typeof telemetry.altitude_m === "number" && !Number.isNaN(telemetry.altitude_m) ? telemetry.altitude_m : 0;
        setMissionHomeValue({ latitude_deg: lat, longitude_deg: lon, altitude_m: altitude }, "vehicle", { recordHistory: true });
    }, [rejectIfPlaybackReadonly, setMissionHomeValue, telemetry]);

    const setArbitraryHome = useCallback(() => {
        if (rejectIfPlaybackReadonly("mission")) return;
        const lat = Number(homeLatInput);
        const lon = Number(homeLonInput);
        const alt = Number(homeAltInput || "0");
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(alt)) {
            toast.error("Home inputs must be valid numbers");
            return;
        }
        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
            toast.error("Home coordinates out of range");
            return;
        }
        setMissionHomeValue({ latitude_deg: lat, longitude_deg: lon, altitude_m: alt }, "user", { recordHistory: true });
    }, [homeAltInput, homeLatInput, homeLonInput, rejectIfPlaybackReadonly, setMissionHomeValue]);

    const setHomeFromMap = useCallback((latDeg: number, lonDeg: number) => {
        if (rejectIfPlaybackReadonly("mission")) return;
        const alt = missionHomeStateRef.current.active?.altitude_m ?? 0;
        setMissionHomeValue({ latitude_deg: latDeg, longitude_deg: lonDeg, altitude_m: alt }, "user", { recordHistory: true });
    }, [rejectIfPlaybackReadonly, setMissionHomeValue]);

    const setWaypointFromVehicle = useCallback((index: number) => {
        if (rejectIfPlaybackReadonly("mission")) return;
        const lat = telemetry.latitude_deg;
        const lon = telemetry.longitude_deg;
        if (typeof lat !== "number" || typeof lon !== "number" || Number.isNaN(lat) || Number.isNaN(lon)) {
            toast.error("Vehicle position unavailable");
            return;
        }
        mutateDomain("mission", (prev) => moveTypedWaypointOnMap(prev, "mission", index, lat, lon));
    }, [mutateDomain, rejectIfPlaybackReadonly, telemetry]);

    const setHomeLatInputValue = useCallback((value: string) => {
        if (rejectIfPlaybackReadonly("mission")) return;
        setHomeLatInput(value);
    }, [rejectIfPlaybackReadonly]);

    const setHomeLonInputValue = useCallback((value: string) => {
        if (rejectIfPlaybackReadonly("mission")) return;
        setHomeLonInput(value);
    }, [rejectIfPlaybackReadonly]);

    const setHomeAltInputValue = useCallback((value: string) => {
        if (rejectIfPlaybackReadonly("mission")) return;
        setHomeAltInput(value);
    }, [rejectIfPlaybackReadonly]);

    const anyTransferActive = useMemo(() => {
        return progressForDomain(progress, "mission").active
            || progressForDomain(progress, "fence").active
            || progressForDomain(progress, "rally").active;
    }, [progress]);

    const applyPlanImport = useCallback((result: PlanParseResult, choice: "replace" | "append") => {
        const scope = scopeRef.current ?? EMPTY_SCOPE;
        const nextImportedSpeeds = {
            cruiseSpeedMps: result.cruiseSpeed,
            hoverSpeedMps: result.hoverSpeed,
        };

        if (choice === "replace") {
            // Capture all domain snapshots before replacing so Ctrl+Z restores pre-import state.
            const missionSnapshot = captureHistorySnapshot("mission");
            const fenceSnapshot = captureHistorySnapshot("fence");
            const rallySnapshot = captureHistorySnapshot("rally");
            const nextState = replaceTypedDraftFromDownload(
                replaceTypedDraftFromDownload(
                    replaceTypedDraftFromDownload(typedDraftStateRef.current, "mission", result.mission, scope),
                    "fence",
                    result.fence,
                    scope,
                ),
                "rally",
                result.rally,
                scope,
            );
            commitTypedDraftState(nextState);
            commitMissionHomeState(
                replaceMissionHomeFromDownload(missionHomeStateRef.current, result.home, scope),
                result.home ? "download" : null,
            );
            pushHistorySnapshot("mission", missionSnapshot);
            pushHistorySnapshot("fence", fenceSnapshot);
            pushHistorySnapshot("rally", rallySnapshot);
            setLastOpStatus({ mission: "Imported", fence: "Imported", rally: "Imported" });
        } else {
            // Append: insert new items after the last existing item in each domain.
            let nextState = typedDraftStateRef.current;
            const existingMissionCount = typedDraftItems(nextState, "mission").length;
            const existingFenceCount = typedDraftItems(nextState, "fence").length;
            const existingRallyCount = typedDraftItems(nextState, "rally").length;
            if (result.mission.items.length > 0) {
                nextState = insertTypedItemsAfter(nextState, "mission", existingMissionCount - 1, result.mission.items);
            }
            if (result.fence.regions.length > 0) {
                nextState = insertTypedItemsAfter(nextState, "fence", existingFenceCount - 1, result.fence.regions);
            }
            if (result.rally.points.length > 0) {
                nextState = insertTypedItemsAfter(nextState, "rally", existingRallyCount - 1, result.rally.points);
            }
            commitTypedDraftState(nextState);
            setLastOpStatus({ mission: "Appended", fence: "Appended", rally: "Appended" });
        }

        setImportedMissionSpeeds(nextImportedSpeeds);
        exportMissionSpeedsRef.current = nextImportedSpeeds;
        setIssues(createEmptyIssues());

        const countsDescription = `Mission ${result.mission.items.length} • Fence ${result.fence.regions.length} • Rally ${result.rally.points.length}`;
        if (result.warnings.length > 0) {
            toast.warning("Plan imported with warnings", {
                description: `${countsDescription} • ${result.warnings.join(" ")}`,
            });
        } else {
            toast.success("Plan imported", { description: countsDescription });
        }
    }, [captureHistorySnapshot, commitMissionHomeState, commitTypedDraftState, pushHistorySnapshot]);

    const importPlanFile = useCallback(async () => {
        if (isPlaybackScope()) {
            toast.error("Mission planning is read-only in playback");
            return;
        }
        if (anyTransferActive) {
            toast.error("Wait for the active transfer to finish before importing");
            return;
        }
        try {
            const path = await open({
                filters: [{ name: "QGC Plan", extensions: ["plan"] }],
                multiple: false,
            });
            if (!path || Array.isArray(path)) return;

            const contents = await readTextFile(path);
            const result = parsePlanFile(contents);

            // If the editor already has content, pause and ask the user whether to
            // replace or append. Auto-replace when the editor is empty.
            const hasExistingContent =
                typedDraftItems(typedDraftStateRef.current, "mission").length > 0
                || typedDraftItems(typedDraftStateRef.current, "fence").length > 0
                || typedDraftItems(typedDraftStateRef.current, "rally").length > 0;

            if (hasExistingContent) {
                setPendingImport(result);
                return;
            }

            applyPlanImport(result, "replace");
        } catch (err) {
            setImportError({ title: "Failed to import plan", details: asErrorMessage(err) });
        }
    }, [anyTransferActive, applyPlanImport, isPlaybackScope]);

    const confirmImport = useCallback((choice: "replace" | "append" | "cancel") => {
        const result = pendingImport;
        setPendingImport(null);
        if (choice === "cancel" || !result) return;
        applyPlanImport(result, choice);
    }, [applyPlanImport, pendingImport]);

    const writeExport = useCallback(async (pending: PendingExport, excludeDomains: ExportDomain[]) => {
        const result = exportQgcPlanFile({
            mission: pending.mission,
            home: pending.home,
            fence: pending.fence,
            rally: pending.rally,
            cruiseSpeed: pending.cruiseSpeed,
            hoverSpeed: pending.hoverSpeed,
            excludeDomains,
        });
        await writeTextFile(pending.path, `${JSON.stringify(result.json, null, 2)}\n`);

        if (result.warnings.length > 0) {
            toast.warning("Plan exported with warnings", {
                description: `${pending.path} • ${result.warnings.join(" ")}`,
            });
        } else {
            toast.success("Plan exported", { description: pending.path });
        }
    }, []);

    const exportPlanFile = useCallback(async (overrides?: MissionPlanningSpeeds) => {
        if (anyTransferActive) {
            toast.error("Wait for the active transfer to finish before exporting");
            return;
        }
        try {
            const path = await save({
                filters: [{ name: "QGC Plan", extensions: ["plan"] }],
                defaultPath: "mission.plan",
            });
            if (!path) return;

            const missionPlanningSpeeds = overrides ?? exportMissionSpeedsRef.current ?? importedMissionSpeeds;
            const fence = currentPlan("fence") as FencePlan;
            const rally = currentPlan("rally") as RallyPlan;

            // When the plan has fence or rally data, show a chooser dialog so the user
            // can opt-out of exporting domains they don't need in this file.
            if (fence.regions.length > 0 || rally.points.length > 0) {
                setPendingExport({
                    path,
                    mission: currentPlan("mission") as MissionPlan,
                    home: currentHome(),
                    fence,
                    rally,
                    cruiseSpeed: missionPlanningSpeeds?.cruiseSpeedMps,
                    hoverSpeed: missionPlanningSpeeds?.hoverSpeedMps,
                });
                return;
            }

            await writeExport({
                path,
                mission: currentPlan("mission") as MissionPlan,
                home: currentHome(),
                fence,
                rally,
                cruiseSpeed: missionPlanningSpeeds?.cruiseSpeedMps,
                hoverSpeed: missionPlanningSpeeds?.hoverSpeedMps,
            }, []);
        } catch (err) {
            toast.error("Failed to export plan", { description: asErrorMessage(err) });
        }
    }, [anyTransferActive, currentHome, currentPlan, importedMissionSpeeds, writeExport]);

    const confirmExport = useCallback(async (excludeDomains: ExportDomain[]) => {
        const pending = pendingExport;
        setPendingExport(null);
        if (!pending) return;
        try {
            await writeExport(pending, excludeDomains);
        } catch (err) {
            toast.error("Failed to export plan", { description: asErrorMessage(err) });
        }
    }, [pendingExport, writeExport]);

    const cancelExport = useCallback(() => {
        setPendingExport(null);
    }, []);

    const clearImportError = useCallback(() => {
        setImportError(null);
    }, []);

    const importKmlFile = useCallback(async () => {
        if (isPlaybackScope()) {
            toast.error("Mission planning is read-only in playback");
            return;
        }
        if (anyTransferActive) {
            toast.error("Wait for the active transfer to finish before importing");
            return;
        }
        try {
            const path = await open({
                filters: [{ name: "KML/KMZ", extensions: ["kml", "kmz"] }],
                multiple: false,
            });
            if (!path || Array.isArray(path)) return;

            const result = path.toLowerCase().endsWith(".kmz")
                ? parseKmz(await readFile(path))
                : parseKml(await readTextFile(path));

            if (result.fenceRegions.length === 0 && result.missionItems.length === 0) {
                toast.warning("KML import found no supported geometry", {
                    description: result.warnings.join(" ") || path,
                });
                return;
            }

            const scope = scopeRef.current ?? EMPTY_SCOPE;
            let nextState = typedDraftStateRef.current;
            const affectedDomains: MissionDomain[] = [];

            if (result.missionItems.length > 0) {
                nextState = replaceTypedDraftFromDownload(nextState, "mission", { items: result.missionItems }, scope);
                affectedDomains.push("mission");
            }
            if (result.fenceRegions.length > 0) {
                nextState = replaceTypedDraftFromDownload(nextState, "fence", { return_point: null, regions: result.fenceRegions }, scope);
                affectedDomains.push("fence");
            }

            // Capture snapshots before replacing so Ctrl+Z restores the pre-import state.
            const kmlSnapshots = new Map(affectedDomains.map((d) => [d, captureHistorySnapshot(d)]));
            commitTypedDraftState(nextState);
            if (affectedDomains.includes("mission")) {
                resetMissionPlanningSpeeds();
            }
            for (const domain of affectedDomains) {
                pushHistorySnapshot(domain, kmlSnapshots.get(domain)!);
            }
            setIssues((prev) => ({
                ...prev,
                mission: affectedDomains.includes("mission") ? [] : prev.mission,
                fence: affectedDomains.includes("fence") ? [] : prev.fence,
            }));
            setLastOpStatus((prev) => ({
                ...prev,
                mission: affectedDomains.includes("mission") ? "Imported" : prev.mission,
                fence: affectedDomains.includes("fence") ? "Imported" : prev.fence,
            }));

            const importedCounts: string[] = [];
            if (result.missionItems.length > 0) importedCounts.push(`Mission ${result.missionItems.length}`);
            if (result.fenceRegions.length > 0) importedCounts.push(`Fence ${result.fenceRegions.length}`);
            const description = importedCounts.join(" • ");
            if (result.warnings.length > 0) {
                toast.warning("KML imported with warnings", {
                    description: `${description} • ${result.warnings.join(" ")}`,
                });
            } else {
                toast.success("KML imported", { description });
            }
        } catch (err) {
            setImportError({ title: "Failed to import KML/KMZ", details: asErrorMessage(err) });
        }
    }, [anyTransferActive, captureHistorySnapshot, commitTypedDraftState, isPlaybackScope, pushHistorySnapshot, resetMissionPlanningSpeeds]);

    const mission = useMemo(() => {
        const domain: MissionDomain = "mission";
        const visible = currentScope === null || scopeMatches(typedDraftState.active.mission.scope, currentScope);
        const homeVisible = currentScope === null || scopeMatches(missionHomeState.scope, currentScope);
        const draftItems = visible ? typedDraftItems(typedDraftState, domain) : [];
        const selectedUiIds = visible ? typedDraftSelectedUiIds(typedDraftState, domain) : new Set<number>();
        const selectedIndex = visible ? typedDraftSelectedIndex(typedDraftState, domain) : null;
        const selectedIndices = visible ? typedDraftSelectedIndices(typedDraftState, domain) : [];
        const selectionAnchorIndex = visible ? typedDraftSelectionAnchorIndex(typedDraftState, domain) : null;
        const selectedCount = visible ? typedDraftSelectionCount(typedDraftState, domain) : 0;
        const selectedItem = visible ? typedDraftSelectedItem(typedDraftState, domain) : null;
        const previousItem = visible ? typedDraftPreviousItem(typedDraftState, domain) : null;
        const plan = visible ? typedDraftPlan(typedDraftState, domain) : emptyDomainPlan(domain);
        return {
            tab: domain,
            label: missionLabel(domain),
            draftItems,
            plan,
            selectedUiIds,
            selectedIndex,
            selectedIndices,
            selectionAnchorIndex,
            selectedCount,
            selectedItem,
            selectedPlanItem: selectedIndex === null ? null : plan.items[selectedIndex] ?? null,
            previousItem,
            displayTotal: draftItems.length,
            recoverableAvailable:
                recoverableScopeMatches(typedDraftState.recoverable.mission?.scope, currentScope)
                || recoverableScopeMatches(missionHomeState.recoverable?.scope, currentScope),
            isDirty: visible && (isTypedDraftDirty(typedDraftState, domain) || !sameHome(missionHomeState.active, missionHomeState.snapshot)),
            readOnly: isPlaybackScope(),
            canUndo: history.mission.past.length > 0,
            undoCount: history.mission.past.length,
            canRedo: history.mission.future.length > 0,
            redoCount: history.mission.future.length,
            issues: issues.mission,
            roundtripStatus: lastOpStatus.mission,
            transferUi: progressForDomain(progress, domain),
            operation: visibleOperations.mission,
            homePosition: homeVisible ? missionHomeState.active : null,
            homeSource,
            homeLatInput,
            homeLonInput,
            homeAltInput,
            importedSpeeds: importedMissionSpeeds,
            setExportSpeeds,
            select: (index: number | null) => setSelectedIndex(domain, index),
            toggleSelect: (index: number) => toggleSelectedIndex(domain, index),
            selectRange: (fromIndex: number, toIndex: number) => selectRange(domain, fromIndex, toIndex),
            deselectAll: () => setSelectedIndex(domain, null),
            addWaypoint: () => mutateDomain(domain, (prev) => addTypedWaypoint(prev, domain)),
            addWaypointAt: (latDeg: number, lonDeg: number) => mutateDomain(domain, (prev) => addTypedWaypointAt(prev, domain, latDeg, lonDeg)),
            insertBefore: (index: number) => mutateDomain(domain, (prev) => insertTypedBefore(prev, domain, index)),
            insertAfter: (index: number) => mutateDomain(domain, (prev) => insertTypedAfter(prev, domain, index)),
            deleteAt: (index: number) => mutateDomain(domain, (prev) => deleteTypedAt(prev, domain, index)),
            moveUp: (index: number) => mutateDomain(domain, (prev) => moveTypedUp(prev, domain, index)),
            moveDown: (index: number) => mutateDomain(domain, (prev) => moveTypedDown(prev, domain, index)),
            reorderItems: (fromUiId: number, toUiId: number) => mutateDomain(domain, (prev) => reorderTypedItems(prev, domain, fromUiId, toUiId)),
            updateCommand: (index: number, command: MissionCommand) => mutateDomain(domain, (prev) => updateTypedCommand(prev, domain, index, command)),
            updateAltitude: (index: number, altitudeM: number) => mutateDomain(domain, (prev) => updateTypedAltitude(prev, domain, index, altitudeM)),
            updateCoordinate: (index: number, field: "latitude_deg" | "longitude_deg", valueDeg: number) => mutateDomain(domain, (prev) => field === "latitude_deg"
                ? updateTypedLatitude(prev, domain, index, valueDeg)
                : updateTypedLongitude(prev, domain, index, valueDeg)),
            moveWaypointOnMap: (index: number, latDeg: number, lonDeg: number) => mutateDomain(domain, (prev) => moveTypedWaypointOnMap(prev, domain, index, latDeg, lonDeg)),
            setWaypointFromVehicle,
            bulkUpdateAltitude: (altitudeM: number) => bulkUpdateSelectedAltitude(domain, altitudeM),
            bulkDelete: () => bulkDeleteSelected(domain),
            insertGeneratedAfter: (index: number, newItems: MissionItem[]) => mutateDomain(domain, (prev) => insertTypedItemsAfter(prev, domain, index, newItems)),
            replaceAll: (newItems: MissionItem[]) => mutateDomain(domain, (prev) => replaceAllTypedItems(prev, domain, newItems)),
            validate: () => validate(domain),
            upload: () => upload(domain),
            download: () => download(domain),
            clear: () => clear(domain),
            cancel,
            undo: () => undo(domain),
            redo: () => redo(domain),
            setCurrent: (explicitIndex?: number) => setCurrent(domain, explicitIndex),
            updateHomeFromVehicle,
            setArbitraryHome,
            setHomeFromMap,
            setHomeLatInput: setHomeLatInputValue,
            setHomeLonInput: setHomeLonInputValue,
            setHomeAltInput: setHomeAltInputValue,
            recoverDraft: () => {
                const nextScope = scopeRef.current ?? EMPTY_SCOPE;
                commitTypedDraftState(recoverTypedDraft(typedDraftStateRef.current, domain, nextScope));
                const recoveredHomeState = recoverMissionHome(missionHomeStateRef.current, nextScope);
                commitMissionHomeState(recoveredHomeState, recoveredHomeState.active ? (homeSourceRef.current ?? "user") : null);
                resetHistory(domain);
            },
        };
    }, [
        cancel,
        clear,
        commitMissionHomeState,
        commitTypedDraftState,
        currentScope,
        download,
        history.mission.future.length,
        history.mission.past.length,
        homeAltInput,
        homeLatInput,
        homeLonInput,
        homeSource,
        importedMissionSpeeds,
        isPlaybackScope,
        issues.mission,
        lastOpStatus.mission,
        missionHomeState,
        mutateDomain,
        progress,
        redo,
        setArbitraryHome,
        setCurrent,
        setExportSpeeds,
        setHomeAltInputValue,
        setHomeFromMap,
        setHomeLatInputValue,
        setHomeLonInputValue,
        setSelectedIndex,
        setWaypointFromVehicle,
        toggleSelectedIndex,
        selectRange,
        bulkUpdateSelectedAltitude,
        bulkDeleteSelected,
        typedDraftState,
        undo,
        updateHomeFromVehicle,
        upload,
        validate,
        visibleOperations.mission,
        resetHistory,
    ]);

    const fence = useMemo(() => {
        const domain: MissionDomain = "fence";
        const visible = currentScope === null || scopeMatches(typedDraftState.active.fence.scope, currentScope);
        const draftItems = visible ? typedDraftItems(typedDraftState, domain) : [];
        const selectedUiIds = visible ? typedDraftSelectedUiIds(typedDraftState, domain) : new Set<number>();
        const selectedIndex = visible ? typedDraftSelectedIndex(typedDraftState, domain) : null;
        const selectedIndices = visible ? typedDraftSelectedIndices(typedDraftState, domain) : [];
        const selectionAnchorIndex = visible ? typedDraftSelectionAnchorIndex(typedDraftState, domain) : null;
        const selectedCount = visible ? typedDraftSelectionCount(typedDraftState, domain) : 0;
        const selectedItem = visible ? typedDraftSelectedItem(typedDraftState, domain) : null;
        const previousItem = visible ? typedDraftPreviousItem(typedDraftState, domain) : null;
        const plan = visible ? typedDraftPlan(typedDraftState, domain) : emptyDomainPlan(domain);
        const fencePlan = plan as FencePlan;
        return {
            tab: domain,
            label: missionLabel(domain),
            draftItems,
            plan,
            returnPoint: fencePlan.return_point,
            selectedUiIds,
            selectedIndex,
            selectedIndices,
            selectionAnchorIndex,
            selectedCount,
            selectedItem,
            selectedPlanItem: selectedIndex === null ? null : fencePlan.regions[selectedIndex] ?? null,
            previousItem,
            displayTotal: draftItems.length,
            recoverableAvailable: recoverableScopeMatches(typedDraftState.recoverable.fence?.scope, currentScope),
            isDirty: visible && isTypedDraftDirty(typedDraftState, domain),
            readOnly: isPlaybackScope(),
            canUndo: history.fence.past.length > 0,
            undoCount: history.fence.past.length,
            canRedo: history.fence.future.length > 0,
            redoCount: history.fence.future.length,
            issues: issues.fence,
            roundtripStatus: lastOpStatus.fence,
            transferUi: progressForDomain(progress, domain),
            operation: visibleOperations.fence,
            homePosition: null,
            homeSource: null,
            homeLatInput: "",
            homeLonInput: "",
            homeAltInput: "",
            select: (index: number | null) => setSelectedIndex(domain, index),
            toggleSelect: (index: number) => toggleSelectedIndex(domain, index),
            selectRange: (fromIndex: number, toIndex: number) => selectRange(domain, fromIndex, toIndex),
            deselectAll: () => setSelectedIndex(domain, null),
            addWaypoint: () => mutateDomain(domain, (prev) => addTypedWaypoint(prev, domain)),
            addWaypointAt: (latDeg: number, lonDeg: number) => mutateDomain(domain, (prev) => addTypedWaypointAt(prev, domain, latDeg, lonDeg)),
            insertBefore: (index: number) => mutateDomain(domain, (prev) => insertTypedBefore(prev, domain, index)),
            insertAfter: (index: number) => mutateDomain(domain, (prev) => insertTypedAfter(prev, domain, index)),
            deleteAt: (index: number) => mutateDomain(domain, (prev) => deleteTypedAt(prev, domain, index)),
            moveUp: (index: number) => mutateDomain(domain, (prev) => moveTypedUp(prev, domain, index)),
            moveDown: (index: number) => mutateDomain(domain, (prev) => moveTypedDown(prev, domain, index)),
            reorderItems: (fromUiId: number, toUiId: number) => mutateDomain(domain, (prev) => reorderTypedItems(prev, domain, fromUiId, toUiId)),
            updateAltitude: (index: number, altitudeM: number) => mutateDomain(domain, (prev) => updateTypedAltitude(prev, domain, index, altitudeM)),
            updateCoordinate: (index: number, field: "latitude_deg" | "longitude_deg", valueDeg: number) => mutateDomain(domain, (prev) => field === "latitude_deg"
                ? updateTypedLatitude(prev, domain, index, valueDeg)
                : updateTypedLongitude(prev, domain, index, valueDeg)),
            moveWaypointOnMap: (index: number, latDeg: number, lonDeg: number) => mutateDomain(domain, (prev) => moveTypedWaypointOnMap(prev, domain, index, latDeg, lonDeg)),
            updateRegion: (index: number, region: FenceRegion) => mutateDomain(domain, (prev) => updateFenceRegion(prev, index, region)),
            addRegionAt: (latDeg: number, lonDeg: number, type: FenceRegionType) => mutateDomain(domain, (prev) => addFenceRegionAt(prev, latDeg, lonDeg, type)),
            setReturnPoint: (latDeg: number, lonDeg: number) => mutateDomain(domain, (prev) => setFenceReturnPoint(prev, { latitude_deg: latDeg, longitude_deg: lonDeg })),
            bulkUpdateAltitude: (altitudeM: number) => bulkUpdateSelectedAltitude(domain, altitudeM),
            bulkDelete: () => bulkDeleteSelected(domain),
            validate: () => validate(domain),
            upload: () => upload(domain),
            download: () => download(domain),
            clear: () => clear(domain),
            cancel,
            undo: () => undo(domain),
            redo: () => redo(domain),
            updateHomeFromVehicle: () => { },
            setArbitraryHome: () => { },
            setHomeFromMap: () => { },
            setHomeLatInput: () => { },
            setHomeLonInput: () => { },
            setHomeAltInput: () => { },
            recoverDraft: () => {
                commitTypedDraftState(recoverTypedDraft(typedDraftStateRef.current, domain, scopeRef.current ?? EMPTY_SCOPE));
                resetHistory(domain);
            },
        };
    }, [cancel, clear, commitTypedDraftState, currentScope, download, history.fence.future.length, history.fence.past.length, isPlaybackScope, issues.fence, lastOpStatus.fence, mutateDomain, progress, redo, resetHistory, setSelectedIndex, toggleSelectedIndex, selectRange, bulkUpdateSelectedAltitude, bulkDeleteSelected, typedDraftState, undo, upload, validate, visibleOperations.fence]);

    const rally = useMemo(() => {
        const domain: MissionDomain = "rally";
        const visible = currentScope === null || scopeMatches(typedDraftState.active.rally.scope, currentScope);
        const draftItems = visible ? typedDraftItems(typedDraftState, domain) : [];
        const selectedUiIds = visible ? typedDraftSelectedUiIds(typedDraftState, domain) : new Set<number>();
        const selectedIndex = visible ? typedDraftSelectedIndex(typedDraftState, domain) : null;
        const selectedIndices = visible ? typedDraftSelectedIndices(typedDraftState, domain) : [];
        const selectionAnchorIndex = visible ? typedDraftSelectionAnchorIndex(typedDraftState, domain) : null;
        const selectedCount = visible ? typedDraftSelectionCount(typedDraftState, domain) : 0;
        const selectedItem = visible ? typedDraftSelectedItem(typedDraftState, domain) : null;
        const previousItem = visible ? typedDraftPreviousItem(typedDraftState, domain) : null;
        const plan = visible ? typedDraftPlan(typedDraftState, domain) : emptyDomainPlan(domain);
        return {
            tab: domain,
            label: missionLabel(domain),
            draftItems,
            plan,
            selectedUiIds,
            selectedIndex,
            selectedIndices,
            selectionAnchorIndex,
            selectedCount,
            selectedItem,
            selectedPlanItem: selectedIndex === null ? null : plan.points[selectedIndex] ?? null,
            previousItem,
            displayTotal: draftItems.length,
            recoverableAvailable: recoverableScopeMatches(typedDraftState.recoverable.rally?.scope, currentScope),
            isDirty: visible && isTypedDraftDirty(typedDraftState, domain),
            readOnly: isPlaybackScope(),
            canUndo: history.rally.past.length > 0,
            undoCount: history.rally.past.length,
            canRedo: history.rally.future.length > 0,
            redoCount: history.rally.future.length,
            issues: issues.rally,
            roundtripStatus: lastOpStatus.rally,
            transferUi: progressForDomain(progress, domain),
            operation: visibleOperations.rally,
            homePosition: null,
            homeSource: null,
            homeLatInput: "",
            homeLonInput: "",
            homeAltInput: "",
            select: (index: number | null) => setSelectedIndex(domain, index),
            toggleSelect: (index: number) => toggleSelectedIndex(domain, index),
            selectRange: (fromIndex: number, toIndex: number) => selectRange(domain, fromIndex, toIndex),
            deselectAll: () => setSelectedIndex(domain, null),
            addWaypoint: () => mutateDomain(domain, (prev) => addTypedWaypoint(prev, domain)),
            addWaypointAt: (latDeg: number, lonDeg: number) => mutateDomain(domain, (prev) => addTypedWaypointAt(prev, domain, latDeg, lonDeg)),
            insertBefore: (index: number) => mutateDomain(domain, (prev) => insertTypedBefore(prev, domain, index)),
            insertAfter: (index: number) => mutateDomain(domain, (prev) => insertTypedAfter(prev, domain, index)),
            deleteAt: (index: number) => mutateDomain(domain, (prev) => deleteTypedAt(prev, domain, index)),
            moveUp: (index: number) => mutateDomain(domain, (prev) => moveTypedUp(prev, domain, index)),
            moveDown: (index: number) => mutateDomain(domain, (prev) => moveTypedDown(prev, domain, index)),
            reorderItems: (fromUiId: number, toUiId: number) => mutateDomain(domain, (prev) => reorderTypedItems(prev, domain, fromUiId, toUiId)),
            updateAltitude: (index: number, altitudeM: number) => mutateDomain(domain, (prev) => updateTypedAltitude(prev, domain, index, altitudeM)),
            updateCoordinate: (index: number, field: "latitude_deg" | "longitude_deg", valueDeg: number) => mutateDomain(domain, (prev) => field === "latitude_deg"
                ? updateTypedLatitude(prev, domain, index, valueDeg)
                : updateTypedLongitude(prev, domain, index, valueDeg)),
            moveWaypointOnMap: (index: number, latDeg: number, lonDeg: number) => mutateDomain(domain, (prev) => moveTypedWaypointOnMap(prev, domain, index, latDeg, lonDeg)),
            updateAltitudeFrame: (index: number, frame: "msl" | "rel_home" | "terrain") => mutateDomain(domain, (prev) => updateRallyAltitudeFrame(prev, index, frame)),
            bulkUpdateAltitude: (altitudeM: number) => bulkUpdateSelectedAltitude(domain, altitudeM),
            bulkDelete: () => bulkDeleteSelected(domain),
            validate: () => validate(domain),
            upload: () => upload(domain),
            download: () => download(domain),
            clear: () => clear(domain),
            cancel,
            undo: () => undo(domain),
            redo: () => redo(domain),
            updateHomeFromVehicle: () => { },
            setArbitraryHome: () => { },
            setHomeFromMap: () => { },
            setHomeLatInput: () => { },
            setHomeLonInput: () => { },
            setHomeAltInput: () => { },
            recoverDraft: () => {
                commitTypedDraftState(recoverTypedDraft(typedDraftStateRef.current, domain, scopeRef.current ?? EMPTY_SCOPE));
                resetHistory(domain);
            },
        };
    }, [cancel, clear, commitTypedDraftState, currentScope, download, history.rally.future.length, history.rally.past.length, isPlaybackScope, issues.rally, lastOpStatus.rally, mutateDomain, progress, redo, resetHistory, setSelectedIndex, toggleSelectedIndex, selectRange, bulkUpdateSelectedAltitude, bulkDeleteSelected, typedDraftState, undo, upload, validate, visibleOperations.rally]);

    const current = selectedTab === "mission" ? mission : selectedTab === "fence" ? fence : rally;
    const vehicle = useMemo(() => ({
        connected,
        missionState,
        activeSeq: missionState?.current_index ?? null,
    }), [connected, missionState]);

    return {
        tabs: MISSION_TABS,
        selectedTab,
        selectTab: setSelectedTab,
        current,
        mission,
        fence,
        rally,
        vehicle,
        importPlanFile,
        exportPlanFile,
        importKmlFile,
        pendingImport,
        confirmImport,
        pendingExport,
        confirmExport,
        cancelExport,
        importError,
        clearImportError,
    };
}
