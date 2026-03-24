import { useEffect, useState, useCallback, useMemo, useRef } from "react";
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
import type { Telemetry } from "../telemetry";
import { subscribeSessionState } from "../session";
import { asErrorMessage } from "./use-session-helpers";
import { toast } from "sonner";
import {
  addTypedWaypoint,
  addTypedWaypointAt,
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
  setTypedDraftScope,
  selectTypedDraftIndex,
  typedDraftPlan,
  typedDraftItems,
  typedDraftSelectedIndex,
  typedDraftSelectedItem,
  typedDraftPreviousItem,
  updateTypedAltitude,
  updateTypedCommand,
  updateTypedLatitude,
  updateTypedLongitude,
  updateFenceRegion,
  type MissionDomain,
  type SessionScope,
} from "../lib/mission-draft-typed";

type HomeSource = "vehicle" | "user" | "download" | null;

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

type DomainPlanMap = {
  mission: MissionPlan;
  fence: FencePlan;
  rally: RallyPlan;
};

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
  const [operations, setOperations] = useState<DomainOperations>(createEmptyOperations);
  const [currentScope, setCurrentScope] = useState<SessionScope | null>(null);

  const scopeRef = useRef<SessionScope | null>(null);
  const typedDraftStateRef = useRef(typedDraftState);
  const missionHomeStateRef = useRef(missionHomeState);
  const operationsRef = useRef(operations);
  const nextOperationTokenRef = useRef(1);

  useEffect(() => { typedDraftStateRef.current = typedDraftState; }, [typedDraftState]);
  useEffect(() => { missionHomeStateRef.current = missionHomeState; }, [missionHomeState]);
  useEffect(() => { operationsRef.current = operations; }, [operations]);

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
    setHomeSource(null);
    setHomeLatInput("");
    setHomeLonInput("");
    setHomeAltInput("");
  }, []);

  const syncHomeValue = useCallback((home: HomePosition | null, source: HomeSource) => {
    setMissionHomeState((prev) => replaceMissionHome(prev, home, { syncSnapshotWhenClean: source === "vehicle" }));
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
    }
  }, [cancelActiveTransfer, connected, resetOperations]);

  useEffect(() => {
    if (vehicleHomePosition && homeSource !== "user" && homeSource !== "download") {
      syncHomeValue(vehicleHomePosition, "vehicle");
    }
  }, [homeSource, syncHomeValue, vehicleHomePosition]);

  useEffect(() => {
    if (!bootstrapScope) return;
    scopeRef.current = bootstrapScope;
    setCurrentScope((prev) => scopeMatches(prev, bootstrapScope) ? prev : bootstrapScope);
    setTypedDraftState((prev) => setTypedDraftScope(prev, bootstrapScope));
    setMissionHomeState((prev) => setMissionHomeScope(prev, bootstrapScope));
    setMissionState(bootstrapMissionState);
  }, [bootstrapMissionState, bootstrapScope]);

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
              setTypedDraftState((prev) => setTypedDraftScope(prev, nextScope));
              setMissionHomeState((prev) => setMissionHomeScope(prev, nextScope));
              return;
            }
            if (scopeMatches(previousScope, nextScope)) {
              return;
            }

            cancelActiveTransfer();
            setMissionState(null);
            setTypedDraftState((prev) => moveDirtyDraftToRecoverable(prev, nextScope));
            setMissionHomeState((prev) => moveDirtyMissionHomeToRecoverable(prev, nextScope));
            resetOperations();
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
  }, [cancelActiveTransfer, resetHomeInputs, resetOperations]);

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
    setTypedDraftState((prev) => selectTypedDraftIndex(prev, domain, index));
  }, []);

  const mutateDomain = useCallback((domain: MissionDomain, update: (state: ReturnType<typeof createTypedDraftState>) => ReturnType<typeof createTypedDraftState>) => {
    if (rejectIfPlaybackReadonly(domain)) return;
    setTypedDraftState(update);
  }, [rejectIfPlaybackReadonly]);

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
      setTypedDraftState((prev) => replaceTypedDraftFromDownload(prev, domain, plan, operation.scope ?? EMPTY_SCOPE));
      if (domain === "mission") {
        const home = currentHome();
        setMissionHomeState((prev) => replaceMissionHomeFromDownload(prev, home, operation.scope ?? EMPTY_SCOPE));
      }
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
  }, [bridges, connected, currentHome, currentPlan, finishOperation, isCurrentOperation, rejectIfPlaybackReadonly, startOperation]);

  const download = useCallback(async (domain: MissionDomain) => {
    if (!connected) { toast.error("Connect to vehicle before download"); return; }
    const operation = startOperation(domain, "download");
    if (!operation) return;
    setProgress(null);
    try {
      const result = await bridges[domain].download();
      if (!isCurrentOperation(domain, operation.token, operation.scope)) return;
      setTypedDraftState((prev) => replaceTypedDraftFromDownload(prev, domain, result.plan, operation.scope ?? EMPTY_SCOPE));
      if (domain === "mission") {
        setMissionHomeState((prev) => replaceMissionHomeFromDownload(prev, result.home, operation.scope ?? EMPTY_SCOPE));
        setHomeSource(result.home ? "download" : null);
        setHomeLatInput(result.home ? result.home.latitude_deg.toFixed(6) : "");
        setHomeLonInput(result.home ? result.home.longitude_deg.toFixed(6) : "");
        setHomeAltInput(result.home ? result.home.altitude_m.toFixed(2) : "");
      }
      setIssues((prev) => ({ ...prev, [domain]: [] }));
      setLastOpStatus((prev) => ({ ...prev, [domain]: "Downloaded" }));
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
  }, [bridges, connected, finishOperation, isCurrentOperation, startOperation]);

  const clear = useCallback(async (domain: MissionDomain) => {
    if (!connected) { toast.error("Connect to vehicle before clear"); return; }
    if (rejectIfPlaybackReadonly(domain)) return;
    const operation = startOperation(domain, "clear");
    if (!operation) return;
    setProgress(null);
    try {
      await bridges[domain].clear();
      if (!isCurrentOperation(domain, operation.token, operation.scope)) return;
      setTypedDraftState((prev) => replaceTypedDraftFromDownload(prev, domain, emptyDomainPlan(domain), operation.scope ?? EMPTY_SCOPE));
      if (domain === "mission") {
        syncHomeValue(null, null);
        setMissionHomeState((prev) => replaceMissionHomeFromDownload(prev, null, operation.scope ?? EMPTY_SCOPE));
      }
      setIssues((prev) => ({ ...prev, [domain]: [] }));
      setLastOpStatus((prev) => ({ ...prev, [domain]: "Cleared" }));
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
  }, [bridges, connected, finishOperation, isCurrentOperation, rejectIfPlaybackReadonly, startOperation, syncHomeValue]);

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

  const updateHomeFromVehicle = useCallback(() => {
    if (rejectIfPlaybackReadonly("mission")) return;
    const lat = telemetry.latitude_deg;
    const lon = telemetry.longitude_deg;
    if (typeof lat !== "number" || typeof lon !== "number" || Number.isNaN(lat) || Number.isNaN(lon)) {
      toast.error("Vehicle position unavailable");
      return;
    }
    const altitude = typeof telemetry.altitude_m === "number" && !Number.isNaN(telemetry.altitude_m) ? telemetry.altitude_m : 0;
    syncHomeValue({ latitude_deg: lat, longitude_deg: lon, altitude_m: altitude }, "vehicle");
  }, [rejectIfPlaybackReadonly, syncHomeValue, telemetry]);

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
    syncHomeValue({ latitude_deg: lat, longitude_deg: lon, altitude_m: alt }, "user");
  }, [homeAltInput, homeLatInput, homeLonInput, rejectIfPlaybackReadonly, syncHomeValue]);

  const setHomeFromMap = useCallback((latDeg: number, lonDeg: number) => {
    if (rejectIfPlaybackReadonly("mission")) return;
    const alt = missionHomeStateRef.current.active?.altitude_m ?? 0;
    syncHomeValue({ latitude_deg: latDeg, longitude_deg: lonDeg, altitude_m: alt }, "user");
  }, [rejectIfPlaybackReadonly, syncHomeValue]);

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

  const mission = useMemo(() => {
    const domain: MissionDomain = "mission";
    const visible = currentScope === null || scopeMatches(typedDraftState.active.mission.scope, currentScope);
    const homeVisible = currentScope === null || scopeMatches(missionHomeState.scope, currentScope);
    const draftItems = visible ? typedDraftItems(typedDraftState, domain) : [];
    const selectedIndex = visible ? typedDraftSelectedIndex(typedDraftState, domain) : null;
    const selectedItem = visible ? typedDraftSelectedItem(typedDraftState, domain) : null;
    const previousItem = visible ? typedDraftPreviousItem(typedDraftState, domain) : null;
    const plan = visible ? typedDraftPlan(typedDraftState, domain) : emptyDomainPlan(domain);
    return {
      tab: domain,
      label: missionLabel(domain),
      draftItems,
      plan,
      selectedIndex,
      selectedItem,
      selectedPlanItem: selectedIndex === null ? null : plan.items[selectedIndex] ?? null,
      previousItem,
      displayTotal: draftItems.length,
      recoverableAvailable:
        recoverableScopeMatches(typedDraftState.recoverable.mission?.scope, currentScope)
        || recoverableScopeMatches(missionHomeState.recoverable?.scope, currentScope),
      isDirty: visible && (isTypedDraftDirty(typedDraftState, domain) || !sameHome(missionHomeState.active, missionHomeState.snapshot)),
      readOnly: isPlaybackScope(),
      issues: issues.mission,
      roundtripStatus: lastOpStatus.mission,
      transferUi: progressForDomain(progress, domain),
      operation: visibleOperations.mission,
      homePosition: homeVisible ? missionHomeState.active : null,
      homeSource,
      homeLatInput,
      homeLonInput,
      homeAltInput,
      select: (index: number | null) => setSelectedIndex(domain, index),
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
      insertGeneratedAfter: (index: number, newItems: MissionItem[]) => mutateDomain(domain, (prev) => insertTypedItemsAfter(prev, domain, index, newItems)),
      replaceAll: (newItems: MissionItem[]) => mutateDomain(domain, (prev) => replaceAllTypedItems(prev, domain, newItems)),
      validate: () => validate(domain),
      upload: () => upload(domain),
      download: () => download(domain),
      clear: () => clear(domain),
      cancel,
      setCurrent: (explicitIndex?: number) => setCurrent(domain, explicitIndex),
      updateHomeFromVehicle,
      setArbitraryHome,
      setHomeFromMap,
      setHomeLatInput: setHomeLatInputValue,
      setHomeLonInput: setHomeLonInputValue,
      setHomeAltInput: setHomeAltInputValue,
      recoverDraft: () => {
        setTypedDraftState((prev) => recoverTypedDraft(prev, domain, scopeRef.current ?? EMPTY_SCOPE));
        setMissionHomeState((prev) => recoverMissionHome(prev, scopeRef.current ?? EMPTY_SCOPE));
      },
    };
  }, [
    cancel,
    clear,
    currentScope,
    download,
    homeAltInput,
    homeLatInput,
    homeLonInput,
    homeSource,
    isPlaybackScope,
    issues.mission,
    lastOpStatus.mission,
    missionHomeState,
    mutateDomain,
    progress,
    setArbitraryHome,
    setCurrent,
    setHomeAltInputValue,
    setHomeFromMap,
    setHomeLatInputValue,
    setHomeLonInputValue,
    setSelectedIndex,
    typedDraftState,
    updateHomeFromVehicle,
    upload,
    validate,
    visibleOperations.mission,
  ]);

  const fence = useMemo(() => {
    const domain: MissionDomain = "fence";
    const visible = currentScope === null || scopeMatches(typedDraftState.active.fence.scope, currentScope);
    const draftItems = visible ? typedDraftItems(typedDraftState, domain) : [];
    const selectedIndex = visible ? typedDraftSelectedIndex(typedDraftState, domain) : null;
    const selectedItem = visible ? typedDraftSelectedItem(typedDraftState, domain) : null;
    const previousItem = visible ? typedDraftPreviousItem(typedDraftState, domain) : null;
    const plan = visible ? typedDraftPlan(typedDraftState, domain) : emptyDomainPlan(domain);
    return {
      tab: domain,
      label: missionLabel(domain),
      draftItems,
      plan,
      selectedIndex,
      selectedItem,
      selectedPlanItem: selectedIndex === null ? null : plan.regions[selectedIndex] ?? null,
      previousItem,
      displayTotal: draftItems.length,
      recoverableAvailable: recoverableScopeMatches(typedDraftState.recoverable.fence?.scope, currentScope),
      isDirty: visible && isTypedDraftDirty(typedDraftState, domain),
      readOnly: isPlaybackScope(),
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
      validate: () => validate(domain),
      upload: () => upload(domain),
      download: () => download(domain),
      clear: () => clear(domain),
      cancel,
      updateHomeFromVehicle: () => {},
      setArbitraryHome: () => {},
      setHomeFromMap: () => {},
      setHomeLatInput: () => {},
      setHomeLonInput: () => {},
      setHomeAltInput: () => {},
      recoverDraft: () => setTypedDraftState((prev) => recoverTypedDraft(prev, domain, scopeRef.current ?? EMPTY_SCOPE)),
    };
  }, [cancel, clear, currentScope, download, isPlaybackScope, issues.fence, lastOpStatus.fence, mutateDomain, progress, setSelectedIndex, typedDraftState, upload, validate, visibleOperations.fence]);

  const rally = useMemo(() => {
    const domain: MissionDomain = "rally";
    const visible = currentScope === null || scopeMatches(typedDraftState.active.rally.scope, currentScope);
    const draftItems = visible ? typedDraftItems(typedDraftState, domain) : [];
    const selectedIndex = visible ? typedDraftSelectedIndex(typedDraftState, domain) : null;
    const selectedItem = visible ? typedDraftSelectedItem(typedDraftState, domain) : null;
    const previousItem = visible ? typedDraftPreviousItem(typedDraftState, domain) : null;
    const plan = visible ? typedDraftPlan(typedDraftState, domain) : emptyDomainPlan(domain);
    return {
      tab: domain,
      label: missionLabel(domain),
      draftItems,
      plan,
      selectedIndex,
      selectedItem,
      selectedPlanItem: selectedIndex === null ? null : plan.points[selectedIndex] ?? null,
      previousItem,
      displayTotal: draftItems.length,
      recoverableAvailable: recoverableScopeMatches(typedDraftState.recoverable.rally?.scope, currentScope),
      isDirty: visible && isTypedDraftDirty(typedDraftState, domain),
      readOnly: isPlaybackScope(),
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
      validate: () => validate(domain),
      upload: () => upload(domain),
      download: () => download(domain),
      clear: () => clear(domain),
      cancel,
      updateHomeFromVehicle: () => {},
      setArbitraryHome: () => {},
      setHomeFromMap: () => {},
      setHomeLatInput: () => {},
      setHomeLonInput: () => {},
      setHomeAltInput: () => {},
      recoverDraft: () => setTypedDraftState((prev) => recoverTypedDraft(prev, domain, scopeRef.current ?? EMPTY_SCOPE)),
    };
  }, [cancel, clear, currentScope, download, isPlaybackScope, issues.rally, lastOpStatus.rally, mutateDomain, progress, setSelectedIndex, typedDraftState, upload, validate, visibleOperations.rally]);

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
  };
}
