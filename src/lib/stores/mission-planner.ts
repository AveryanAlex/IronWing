import { get, writable } from "svelte/store";

import type { FencePlan } from "../../fence";
import type { HomePosition, MissionIssue, MissionPlan, MissionState, TransferProgress } from "../../mission";
import type { RallyPlan } from "../../rally";
import type { SessionEnvelope } from "../../session";
import { shouldDropEvent } from "../../session";
import type { MissionCommand } from "../mavkit-types";
import {
  addTypedWaypoint,
  createTypedDraftState,
  deleteTypedAt,
  isTypedDraftDirty,
  moveTypedDown,
  moveTypedUp,
  moveTypedWaypointOnMap,
  replaceTypedDraftFromDownload,
  selectTypedDraftIndex,
  setTypedDraftScope,
  typedDraftItems,
  typedDraftPlan,
  typedDraftSelectedItem,
  updateTypedAltitude,
  updateTypedCommand,
  updateTypedLatitude,
  updateTypedLongitude,
  type SessionScope,
  type TypedDraftState,
} from "../mission-draft-typed";
import {
  createMissionPlanFileIo,
  type MissionPlanFileImportData,
  type MissionPlanFileIo,
} from "../mission-plan-file-io";
import { DEFAULT_CRUISE_SPEED_MPS, DEFAULT_HOVER_SPEED_MPS } from "../mission-plan-io/qgc-types";
import {
  createMissionPlannerService,
  type MissionPlannerService,
  type MissionPlannerWorkspaceTransfer,
} from "../platform/mission-planner";
import { isSameEnvelope } from "../scoped-session-events";
import {
  createSurveyDraftExtension,
  flattenRegionsToItems,
  hydrateSurveyRegion,
  toExportableSurveyRegion,
  type SurveyDraftExtension,
} from "../survey-region";
import {
  createMissionPlannerViewStore,
  type MissionPlannerViewStore,
} from "./mission-planner-view";
import { parseLatitude, parseLongitude } from "../mission-coordinates";
import type { SessionStore, SessionStorePhase, SessionStoreState } from "./session";
import { session } from "./session";

export type MissionPlannerDomainPhase =
  | "bootstrapping"
  | "ready"
  | "unavailable"
  | "stream-error"
  | "downloading"
  | "uploading"
  | "validating"
  | "clearing"
  | "importing"
  | "exporting"
  | "replace-prompt";

export type MissionPlannerActionKind = "download" | "upload" | "validate" | "clear" | "import" | "export";
export type MissionPlannerActionStatus = "pending" | "timed_out";

export type MissionPlannerActionState = {
  kind: MissionPlannerActionKind;
  status: MissionPlannerActionStatus;
  canCancel: boolean;
  scopeKey: string | null;
};

export type MissionPlannerMapMoveRejectReason =
  | "invalid-coordinate"
  | "home-missing"
  | "item-not-found"
  | "item-read-only"
  | "item-without-position";

export type MissionPlannerMapMoveResult =
  | {
    status: "applied";
    target: "home" | "mission-item";
    uiId: number | null;
    latitude_deg: number;
    longitude_deg: number;
  }
  | {
    status: "rejected";
    reason: MissionPlannerMapMoveRejectReason;
    message: string;
  };

export type MissionPlannerWorkspace = {
  mission: MissionPlan;
  fence: FencePlan;
  rally: RallyPlan;
  home: HomePosition | null;
  survey: SurveyDraftExtension;
  cruiseSpeed: number;
  hoverSpeed: number;
};

export type RecoverableMissionPlannerWorkspace = {
  scope: SessionScope;
  active: MissionPlannerWorkspace;
  snapshot: MissionPlannerWorkspace;
};

export type MissionPlannerSelection =
  | { kind: "home" }
  | { kind: "mission-item" }
  | { kind: "survey-block"; regionId: string };

export type MissionPlannerReplacePrompt =
  | {
    kind: "replace-active";
    action: "download" | "import" | "clear";
    incomingWorkspace: MissionPlannerWorkspace | null;
    fileWarnings: string[];
    fileName: string | null;
  }
  | {
    kind: "recoverable";
  };

export type MissionPlannerStoreState = {
  hydrated: boolean;
  workspaceMounted: boolean;
  selection: MissionPlannerSelection;
  phase: MissionPlannerDomainPhase;
  streamReady: boolean;
  streamError: string | null;
  sessionHydrated: boolean;
  sessionPhase: SessionStorePhase;
  activeEnvelope: SessionEnvelope | null;
  activeSource: SessionEnvelope["source_kind"] | null;
  missionState: MissionState | null;
  transferProgress: TransferProgress | null;
  activeAction: MissionPlannerActionState | null;
  replacePrompt: MissionPlannerReplacePrompt | null;
  recoverableWorkspace: RecoverableMissionPlannerWorkspace | null;
  draftState: TypedDraftState;
  home: HomePosition | null;
  homeSnapshot: HomePosition | null;
  survey: SurveyDraftExtension;
  surveySnapshot: SurveyDraftExtension;
  cruiseSpeed: number;
  hoverSpeed: number;
  cruiseSpeedSnapshot: number;
  hoverSpeedSnapshot: number;
  validationIssues: MissionIssue[];
  fileWarnings: string[];
  lastError: string | null;
};

export type MissionPlannerStoreOptions = {
  actionTimeoutMs?: number;
};

type SessionReadable = Pick<SessionStore, "subscribe">;

type PendingActionScope = {
  requestId: number;
  envelope: SessionEnvelope | null;
};

const EMPTY_SCOPE: SessionScope = {
  session_id: "",
  source_kind: "live",
  seek_epoch: 0,
  reset_revision: 0,
};

const ACTION_TIMEOUT_MS = 15_000;

function createInitialState(): MissionPlannerStoreState {
  return {
    hydrated: false,
    workspaceMounted: false,
    selection: { kind: "home" },
    phase: "bootstrapping",
    streamReady: false,
    streamError: null,
    sessionHydrated: false,
    sessionPhase: "idle",
    activeEnvelope: null,
    activeSource: null,
    missionState: null,
    transferProgress: null,
    activeAction: null,
    replacePrompt: null,
    recoverableWorkspace: null,
    draftState: setTypedDraftScope(createTypedDraftState(), EMPTY_SCOPE),
    home: null,
    homeSnapshot: null,
    survey: createSurveyDraftExtension(),
    surveySnapshot: createSurveyDraftExtension(),
    cruiseSpeed: DEFAULT_CRUISE_SPEED_MPS,
    hoverSpeed: DEFAULT_HOVER_SPEED_MPS,
    cruiseSpeedSnapshot: DEFAULT_CRUISE_SPEED_MPS,
    hoverSpeedSnapshot: DEFAULT_HOVER_SPEED_MPS,
    validationIssues: [],
    fileWarnings: [],
    lastError: null,
  };
}

export function createMissionPlannerStore(
  sessionStore: SessionReadable = session,
  service: MissionPlannerService = createMissionPlannerService(),
  fileIo: MissionPlanFileIo = createMissionPlanFileIo(),
  options: MissionPlannerStoreOptions = {},
) {
  const actionTimeoutMs = options.actionTimeoutMs ?? ACTION_TIMEOUT_MS;
  const store = writable<MissionPlannerStoreState>(createInitialState());
  let initializePromise: Promise<void> | null = null;
  let stopSession: (() => void) | null = null;
  let stopStreams: (() => void) | null = null;
  let actionRequestId = 0;

  async function initialize() {
    if (initializePromise) {
      return initializePromise;
    }

    initializePromise = (async () => {
      stopSession = sessionStore.subscribe(handleSessionState);

      try {
        stopStreams = await service.subscribeAll({
          onMissionState: applyMissionStateEvent,
          onMissionProgress: applyMissionProgressEvent,
        });

        store.update((state) => withResolvedPhase({
          ...state,
          hydrated: true,
          streamReady: true,
          streamError: null,
        }));
      } catch (error) {
        store.update((state) => withResolvedPhase({
          ...state,
          hydrated: true,
          streamReady: false,
          streamError: service.formatError(error),
          lastError: service.formatError(error),
        }));
      }
    })();

    return initializePromise;
  }

  function handleSessionState(sessionState: SessionStoreState) {
    const nextEnvelope = sessionState.activeEnvelope;
    const current = get(store);
    const envelopeChanged = !areEnvelopesEqual(current.activeEnvelope, nextEnvelope);
    if (envelopeChanged) {
      actionRequestId += 1;
    }

    store.update((state) => {
      const base = {
        ...state,
        sessionHydrated: sessionState.hydrated,
        sessionPhase: sessionState.lastPhase,
      } satisfies MissionPlannerStoreState;

      if (!envelopeChanged) {
        return withResolvedPhase({
          ...base,
          activeEnvelope: nextEnvelope,
          activeSource: nextEnvelope?.source_kind ?? null,
          missionState: nextEnvelope ? (sessionState.bootstrap.missionState ?? state.missionState) : null,
        });
      }

      const nextScope = scopeFromEnvelope(nextEnvelope);
      const nextRecoverable = plannerIsDirty(state)
        ? {
          scope: currentScope(state),
          active: captureActiveWorkspace(state),
          snapshot: captureSnapshotWorkspace(state),
        }
        : state.recoverableWorkspace;

      const reset = applyWorkspacePair(
        base,
        {
          active: createEmptyMissionPlannerWorkspace(),
          snapshot: createEmptyMissionPlannerWorkspace(),
        },
        nextScope,
      );
      const recoverablePrompt = nextRecoverable && scopeMatches(nextRecoverable.scope, nextScope)
        ? ({ kind: "recoverable" } satisfies MissionPlannerReplacePrompt)
        : null;

      return withResolvedPhase({
        ...reset,
        workspaceMounted: false,
        selection: { kind: "home" },
        activeEnvelope: nextEnvelope,
        activeSource: nextEnvelope?.source_kind ?? null,
        missionState: nextEnvelope ? sessionState.bootstrap.missionState : null,
        transferProgress: null,
        activeAction: null,
        replacePrompt: recoverablePrompt,
        recoverableWorkspace: nextRecoverable,
        validationIssues: [],
        fileWarnings: [],
        lastError: null,
      });
    });
  }

  function applyMissionStateEvent(event: { envelope: SessionEnvelope; value: MissionState }) {
    store.update((state) => {
      if (!state.activeEnvelope || shouldDropEvent(state.activeEnvelope, event.envelope) || !isSameEnvelope(state.activeEnvelope, event.envelope)) {
        return state;
      }

      return withResolvedPhase({
        ...state,
        missionState: event.value,
      });
    });
  }

  function applyMissionProgressEvent(event: { envelope: SessionEnvelope; value: TransferProgress }) {
    store.update((state) => {
      if (!state.activeEnvelope || shouldDropEvent(state.activeEnvelope, event.envelope) || !isSameEnvelope(state.activeEnvelope, event.envelope)) {
        return state;
      }

      return withResolvedPhase({
        ...state,
        transferProgress: event.value,
        activeAction: event.value.phase === "completed" || event.value.phase === "failed" || event.value.phase === "cancelled"
          ? null
          : state.activeAction,
      });
    });
  }

  function replaceWorkspace(workspace: MissionPlannerWorkspace) {
    store.update((state) => withResolvedPhase(applyWorkspacePair(state, {
      active: workspace,
      snapshot: workspace,
    }, currentScope(state))));
  }

  function setHome(home: HomePosition | null) {
    store.update((state) => withResolvedPhase({
      ...state,
      home: cloneValue(home),
      selection: { kind: "home" },
      validationIssues: [],
      lastError: null,
    }));
  }

  function setPlanningSpeeds(args: { cruiseSpeed?: number; hoverSpeed?: number }) {
    store.update((state) => withResolvedPhase({
      ...state,
      cruiseSpeed: typeof args.cruiseSpeed === "number" && Number.isFinite(args.cruiseSpeed)
        ? args.cruiseSpeed
        : state.cruiseSpeed,
      hoverSpeed: typeof args.hoverSpeed === "number" && Number.isFinite(args.hoverSpeed)
        ? args.hoverSpeed
        : state.hoverSpeed,
      validationIssues: [],
      lastError: null,
    }));
  }

  function replaceSurveyExtension(survey: SurveyDraftExtension) {
    store.update((state) => withResolvedPhase({
      ...state,
      survey: cloneValue(survey),
      validationIssues: [],
      lastError: null,
    }));
  }

  function updateMissionDraft(
    updater: (draftState: TypedDraftState) => TypedDraftState,
    selection: MissionPlannerSelection = { kind: "mission-item" },
  ) {
    store.update((state) => withResolvedPhase({
      ...state,
      draftState: updater(state.draftState),
      selection,
      validationIssues: [],
      lastError: null,
    }));
  }

  function selectHome() {
    store.update((state) => withResolvedPhase({
      ...state,
      selection: { kind: "home" },
    }));
  }

  function selectMissionItem(index: number | null) {
    updateMissionDraft(
      (draftState) => selectTypedDraftIndex(draftState, "mission", index),
      index === null ? { kind: "home" } : { kind: "mission-item" },
    );
  }

  function selectMissionItemByUiId(uiId: number): boolean {
    const missionItem = get(store).draftState.active.mission.draftItems.find((item) => item.uiId === uiId);
    if (!missionItem) {
      return false;
    }

    selectMissionItem(missionItem.index);
    return true;
  }

  function selectSurveyRegion(regionId: string) {
    store.update((state) => withResolvedPhase({
      ...state,
      selection: { kind: "survey-block", regionId },
    }));
  }

  function addMissionItem() {
    updateMissionDraft((draftState) => addTypedWaypoint(draftState, "mission"));
  }

  function deleteMissionItem(index: number) {
    updateMissionDraft((draftState) => deleteTypedAt(draftState, "mission", index));
  }

  function moveMissionItemUpByIndex(index: number) {
    updateMissionDraft((draftState) => moveTypedUp(draftState, "mission", index));
  }

  function moveMissionItemDownByIndex(index: number) {
    updateMissionDraft((draftState) => moveTypedDown(draftState, "mission", index));
  }

  function updateMissionItemCommand(index: number, command: MissionCommand) {
    updateMissionDraft((draftState) => updateTypedCommand(draftState, "mission", index, command));
  }

  function updateMissionItemLatitude(index: number, latitudeDeg: number) {
    updateMissionDraft((draftState) => updateTypedLatitude(draftState, "mission", index, latitudeDeg));
  }

  function updateMissionItemLongitude(index: number, longitudeDeg: number) {
    updateMissionDraft((draftState) => updateTypedLongitude(draftState, "mission", index, longitudeDeg));
  }

  function updateMissionItemAltitude(index: number, altitudeM: number) {
    updateMissionDraft((draftState) => updateTypedAltitude(draftState, "mission", index, altitudeM));
  }

  function moveHomeOnMap(latitudeDeg: number, longitudeDeg: number): MissionPlannerMapMoveResult {
    if (!isCoordinatePairValid(latitudeDeg, longitudeDeg)) {
      return rejectedMapMove("invalid-coordinate", "Ignored the Home drag because the map emitted invalid coordinates.");
    }

    const currentHome = get(store).home;
    if (!currentHome) {
      return rejectedMapMove("home-missing", "Ignored the Home drag because this draft does not have a Home marker yet.");
    }

    store.update((state) => withResolvedPhase({
      ...state,
      home: {
        latitude_deg: latitudeDeg,
        longitude_deg: longitudeDeg,
        altitude_m: state.home?.altitude_m ?? currentHome.altitude_m,
      },
      selection: { kind: "home" },
      validationIssues: [],
      lastError: null,
    }));

    return {
      status: "applied",
      target: "home",
      uiId: null,
      latitude_deg: latitudeDeg,
      longitude_deg: longitudeDeg,
    };
  }

  function moveMissionItemOnMapByUiId(
    uiId: number,
    latitudeDeg: number,
    longitudeDeg: number,
  ): MissionPlannerMapMoveResult {
    if (!isCoordinatePairValid(latitudeDeg, longitudeDeg)) {
      return rejectedMapMove("invalid-coordinate", "Ignored the waypoint drag because the map emitted invalid coordinates.");
    }

    const missionItem = get(store).draftState.active.mission.draftItems.find((item) => item.uiId === uiId);
    if (!missionItem) {
      return rejectedMapMove("item-not-found", "Ignored a stale waypoint drag because that mission item is no longer active.");
    }

    if (missionItem.readOnly) {
      return rejectedMapMove("item-read-only", "Ignored the waypoint drag because preserved read-only mission items cannot be repositioned on the map.");
    }

    if (missionItem.preview.latitude_deg === null || missionItem.preview.longitude_deg === null) {
      return rejectedMapMove("item-without-position", "Ignored the waypoint drag because this mission item does not expose a draggable position.");
    }

    store.update((state) => withResolvedPhase({
      ...state,
      draftState: selectTypedDraftIndex(
        moveTypedWaypointOnMap(state.draftState, "mission", missionItem.index, latitudeDeg, longitudeDeg),
        "mission",
        missionItem.index,
      ),
      selection: { kind: "mission-item" },
      validationIssues: [],
      lastError: null,
    }));

    return {
      status: "applied",
      target: "mission-item",
      uiId,
      latitude_deg: latitudeDeg,
      longitude_deg: longitudeDeg,
    };
  }

  async function downloadFromVehicle(force = false) {
    const pending = beginAction("download", true);

    try {
      const downloaded = await withTimeout(
        service.downloadWorkspace(),
        actionTimeoutMs,
        new Error("Mission download timed out. The transfer is still pending; cancel it or wait for the vehicle to respond."),
      );
      if (!isCurrentAction(pending)) {
        return;
      }

      const incomingWorkspace = workspaceFromTransfer(downloaded);
      const state = get(store);
      if (plannerIsDirty(state) && !force) {
        store.update((current) => withResolvedPhase({
          ...current,
          activeAction: null,
          replacePrompt: {
            kind: "replace-active",
            action: "download",
            incomingWorkspace,
            fileWarnings: [],
            fileName: null,
          },
        }));
        return;
      }

      store.update((state) => withResolvedPhase(applyWorkspacePair(state, {
        active: incomingWorkspace,
        snapshot: incomingWorkspace,
      }, currentScope(state))));
    } catch (error) {
      handleActionFailure("download", pending, error, true);
    }
  }

  async function importFromPicker() {
    const pending = beginAction("import", false);

    try {
      const imported = await fileIo.importFromPicker();
      if (!isCurrentAction(pending)) {
        return;
      }

      if (imported.status === "cancelled") {
        clearAction(pending);
        return;
      }

      const incomingWorkspace = workspaceFromImport(imported.data);
      const state = get(store);
      if (plannerIsDirty(state)) {
        store.update((current) => withResolvedPhase({
          ...current,
          activeAction: null,
          replacePrompt: {
            kind: "replace-active",
            action: "import",
            incomingWorkspace,
            fileWarnings: [...imported.warnings],
            fileName: imported.fileName,
          },
        }));
        return;
      }

      store.update((state) => withResolvedPhase({
        ...applyWorkspacePair(state, {
          active: incomingWorkspace,
          snapshot: incomingWorkspace,
        }, currentScope(state)),
        fileWarnings: [...imported.warnings],
      }));
    } catch (error) {
      handleActionFailure("import", pending, error, false);
    }
  }

  async function exportToPicker() {
    const pending = beginAction("export", false);

    try {
      const state = get(store);
      const result = await fileIo.exportToPicker({
        mission: typedDraftPlan(state.draftState, "mission"),
        surveyRegions: exportSurveyRegions(state.survey),
        home: cloneValue(state.home),
        fence: typedDraftPlan(state.draftState, "fence"),
        rally: typedDraftPlan(state.draftState, "rally"),
        cruiseSpeed: state.cruiseSpeed,
        hoverSpeed: state.hoverSpeed,
      });
      if (!isCurrentAction(pending)) {
        return;
      }

      if (result.status === "cancelled") {
        clearAction(pending);
        return;
      }

      store.update((current) => withResolvedPhase({
        ...current,
        activeAction: null,
        fileWarnings: [...result.warnings],
        lastError: null,
      }));
    } catch (error) {
      handleActionFailure("export", pending, error, false);
    }
  }

  async function validateCurrentMission() {
    const pending = beginAction("validate", false);

    try {
      const state = get(store);
      const issues = await withTimeout(
        service.validateMission(activeTransferMissionPlan(state)),
        actionTimeoutMs,
        new Error("Mission validation timed out. Review the pending transfer state and retry when the vehicle responds."),
      );
      if (!isCurrentAction(pending)) {
        return;
      }

      store.update((current) => withResolvedPhase({
        ...current,
        activeAction: null,
        validationIssues: issues,
        lastError: null,
      }));
    } catch (error) {
      handleActionFailure("validate", pending, error, false);
    }
  }

  async function uploadToVehicle() {
    const pending = beginAction("upload", true);

    try {
      const state = get(store);
      await withTimeout(
        service.uploadWorkspace({
          mission: activeTransferMissionPlan(state),
          fence: typedDraftPlan(state.draftState, "fence"),
          rally: typedDraftPlan(state.draftState, "rally"),
          home: cloneValue(state.home),
        }),
        actionTimeoutMs,
        new Error("Mission upload timed out. The transfer is still pending; cancel it or wait for the vehicle to respond."),
      );
      if (!isCurrentAction(pending)) {
        return;
      }

      store.update((current) => withResolvedPhase({
        ...current,
        activeAction: null,
        lastError: null,
      }));
    } catch (error) {
      handleActionFailure("upload", pending, error, true);
    }
  }

  async function clearVehicle(force = false) {
    const state = get(store);
    if (plannerIsDirty(state) && !force) {
      store.update((current) => withResolvedPhase({
        ...current,
        replacePrompt: {
          kind: "replace-active",
          action: "clear",
          incomingWorkspace: null,
          fileWarnings: [],
          fileName: null,
        },
      }));
      return;
    }

    const pending = beginAction("clear", true);

    try {
      await withTimeout(
        service.clearWorkspace(),
        actionTimeoutMs,
        new Error("Mission clear timed out. The transfer is still pending; cancel it or wait for the vehicle to respond."),
      );
      if (!isCurrentAction(pending)) {
        return;
      }

      store.update((current) => withResolvedPhase(applyWorkspacePair(current, {
        active: createEmptyMissionPlannerWorkspace(),
        snapshot: createEmptyMissionPlannerWorkspace(),
      }, currentScope(current))));
    } catch (error) {
      handleActionFailure("clear", pending, error, true);
    }
  }

  async function cancelTransfer() {
    try {
      await service.cancelTransfer();
      store.update((state) => withResolvedPhase({
        ...state,
        activeAction: null,
        lastError: null,
      }));
    } catch (error) {
      store.update((state) => withResolvedPhase({
        ...state,
        lastError: service.formatError(error),
      }));
    }
  }

  function confirmReplacePrompt() {
    const prompt = get(store).replacePrompt;
    if (!prompt) {
      return;
    }

    if (prompt.kind === "recoverable") {
      store.update((state) => {
        const recoverable = state.recoverableWorkspace;
        if (!recoverable || !scopeMatches(recoverable.scope, currentScope(state))) {
          return withResolvedPhase({
            ...state,
            replacePrompt: null,
          });
        }

        return withResolvedPhase({
          ...applyWorkspacePair(state, recoverable, currentScope(state)),
          recoverableWorkspace: null,
          replacePrompt: null,
          lastError: null,
        });
      });
      return;
    }

    if (prompt.action === "clear") {
      store.update((state) => withResolvedPhase({
        ...state,
        replacePrompt: null,
      }));
      void clearVehicle(true);
      return;
    }

    const incomingWorkspace = prompt.incomingWorkspace;
    if (!incomingWorkspace) {
      return;
    }

    store.update((state) => withResolvedPhase({
      ...applyWorkspacePair(state, {
        active: incomingWorkspace,
        snapshot: incomingWorkspace,
      }, currentScope(state)),
      replacePrompt: null,
      fileWarnings: [...prompt.fileWarnings],
      lastError: null,
    }));
  }

  function dismissReplacePrompt() {
    store.update((state) => withResolvedPhase({
      ...state,
      replacePrompt: null,
    }));
  }

  function reset() {
    stopStreams?.();
    stopStreams = null;
    stopSession?.();
    stopSession = null;
    initializePromise = null;
    actionRequestId += 1;
    store.set(createInitialState());
  }

  function beginAction(kind: MissionPlannerActionKind, canCancel: boolean): PendingActionScope {
    const requestId = actionRequestId + 1;
    actionRequestId = requestId;
    const envelope = get(store).activeEnvelope;

    store.update((state) => withResolvedPhase({
      ...state,
      activeAction: {
        kind,
        status: "pending",
        canCancel,
        scopeKey: envelope ? scopedEnvelopeKey(envelope) : null,
      },
      replacePrompt: null,
      lastError: null,
    }));

    return { requestId, envelope };
  }

  function clearAction(scope: PendingActionScope) {
    if (!isCurrentAction(scope)) {
      return;
    }

    store.update((state) => withResolvedPhase({
      ...state,
      activeAction: null,
      lastError: null,
    }));
  }

  function handleActionFailure(
    _kind: MissionPlannerActionKind,
    scope: PendingActionScope,
    error: unknown,
    canRemainCancellable: boolean,
  ) {
    if (!isCurrentAction(scope)) {
      return;
    }

    const message = service.formatError(error);
    const timedOut = typeof message === "string" && /timed out/i.test(message);

    store.update((state) => withResolvedPhase({
      ...state,
      activeAction: timedOut && canRemainCancellable && state.activeAction
        ? {
          ...state.activeAction,
          status: "timed_out",
        }
        : null,
      lastError: message,
    }));
  }

  function isCurrentAction(scope: PendingActionScope): boolean {
    const current = get(store);
    return actionRequestId === scope.requestId
      && areEnvelopesEqual(current.activeEnvelope, scope.envelope);
  }

  return {
    subscribe: store.subscribe,
    initialize,
    replaceWorkspace,
    selectHome,
    selectMissionItem,
    selectMissionItemByUiId,
    selectSurveyRegion,
    addMissionItem,
    deleteMissionItem,
    moveMissionItemUpByIndex,
    moveMissionItemDownByIndex,
    updateMissionItemCommand,
    updateMissionItemLatitude,
    updateMissionItemLongitude,
    updateMissionItemAltitude,
    moveHomeOnMap,
    moveMissionItemOnMapByUiId,
    setHome,
    setPlanningSpeeds,
    replaceSurveyExtension,
    downloadFromVehicle,
    importFromPicker,
    exportToPicker,
    validateCurrentMission,
    uploadToVehicle,
    clearVehicle,
    cancelTransfer,
    confirmReplacePrompt,
    dismissReplacePrompt,
    reset,
  };
}

export type MissionPlannerStore = ReturnType<typeof createMissionPlannerStore>;
export type { MissionPlannerViewStore };
export { createMissionPlannerViewStore };

export const missionPlanner = createMissionPlannerStore();
export const missionPlannerView = createMissionPlannerViewStore(missionPlanner);

export function createEmptyMissionPlannerWorkspace(): MissionPlannerWorkspace {
  return {
    mission: { items: [] },
    fence: { return_point: null, regions: [] },
    rally: { points: [] },
    home: null,
    survey: createSurveyDraftExtension(),
    cruiseSpeed: DEFAULT_CRUISE_SPEED_MPS,
    hoverSpeed: DEFAULT_HOVER_SPEED_MPS,
  };
}

export function captureActiveWorkspace(state: MissionPlannerStoreState): MissionPlannerWorkspace {
  return {
    mission: cloneValue(typedDraftPlan(state.draftState, "mission")),
    fence: cloneValue(typedDraftPlan(state.draftState, "fence")),
    rally: cloneValue(typedDraftPlan(state.draftState, "rally")),
    home: cloneValue(state.home),
    survey: cloneValue(state.survey),
    cruiseSpeed: state.cruiseSpeed,
    hoverSpeed: state.hoverSpeed,
  };
}

export function captureSnapshotWorkspace(state: MissionPlannerStoreState): MissionPlannerWorkspace {
  return {
    mission: cloneValue(state.draftState.active.mission.snapshot),
    fence: cloneValue(state.draftState.active.fence.snapshot),
    rally: cloneValue(state.draftState.active.rally.snapshot),
    home: cloneValue(state.homeSnapshot),
    survey: cloneValue(state.surveySnapshot),
    cruiseSpeed: state.cruiseSpeedSnapshot,
    hoverSpeed: state.hoverSpeedSnapshot,
  };
}

export function activeTransferMissionPlan(state: MissionPlannerStoreState): MissionPlan {
  return {
    items: flattenRegionsToItems(typedDraftItems(state.draftState, "mission"), state.survey),
  };
}

export function plannerHasContent(state: MissionPlannerStoreState): boolean {
  return typedDraftPlan(state.draftState, "mission").items.length > 0
    || state.survey.surveyRegionOrder.length > 0
    || typedDraftPlan(state.draftState, "fence").regions.length > 0
    || typedDraftPlan(state.draftState, "rally").points.length > 0
    || state.home !== null;
}

export function plannerIsDirty(state: MissionPlannerStoreState): boolean {
  return isTypedDraftDirty(state.draftState, "mission")
    || isTypedDraftDirty(state.draftState, "fence")
    || isTypedDraftDirty(state.draftState, "rally")
    || !sameHome(state.home, state.homeSnapshot)
    || !sameSurvey(state.survey, state.surveySnapshot)
    || state.cruiseSpeed !== state.cruiseSpeedSnapshot
    || state.hoverSpeed !== state.hoverSpeedSnapshot;
}

export function plannerScopeLabel(state: Pick<MissionPlannerStoreState, "activeEnvelope">): string {
  const envelope = state.activeEnvelope;
  if (!envelope) {
    return "No active session";
  }

  return `${envelope.session_id} · ${envelope.source_kind} · rev ${envelope.reset_revision}`;
}

function applyWorkspacePair(
  state: MissionPlannerStoreState,
  pair: Pick<RecoverableMissionPlannerWorkspace, "active" | "snapshot">,
  scope: SessionScope,
): MissionPlannerStoreState {
  let draftState = setTypedDraftScope(createTypedDraftState(), scope);
  draftState = replaceTypedDraftFromDownload(draftState, "mission", cloneValue(pair.snapshot.mission), scope);
  draftState = replaceTypedDraftFromDownload(draftState, "fence", cloneValue(pair.snapshot.fence), scope);
  draftState = replaceTypedDraftFromDownload(draftState, "rally", cloneValue(pair.snapshot.rally), scope);

  if (!samePlan(pair.active.mission, pair.snapshot.mission)) {
    draftState = replaceTypedDraftFromDownload(draftState, "mission", cloneValue(pair.active.mission), scope, { markDirty: true });
  }
  if (!sameFence(pair.active.fence, pair.snapshot.fence)) {
    draftState = replaceTypedDraftFromDownload(draftState, "fence", cloneValue(pair.active.fence), scope, { markDirty: true });
  }
  if (!sameRally(pair.active.rally, pair.snapshot.rally)) {
    draftState = replaceTypedDraftFromDownload(draftState, "rally", cloneValue(pair.active.rally), scope, { markDirty: true });
  }

  return {
    ...state,
    workspaceMounted: true,
    selection: { kind: "home" },
    draftState,
    home: cloneValue(pair.active.home),
    homeSnapshot: cloneValue(pair.snapshot.home),
    survey: cloneValue(pair.active.survey),
    surveySnapshot: cloneValue(pair.snapshot.survey),
    cruiseSpeed: pair.active.cruiseSpeed,
    hoverSpeed: pair.active.hoverSpeed,
    cruiseSpeedSnapshot: pair.snapshot.cruiseSpeed,
    hoverSpeedSnapshot: pair.snapshot.hoverSpeed,
    validationIssues: [],
    fileWarnings: [],
    lastError: null,
    activeAction: null,
  };
}

function workspaceFromTransfer(input: MissionPlannerWorkspaceTransfer): MissionPlannerWorkspace {
  return {
    mission: cloneValue(input.mission),
    fence: cloneValue(input.fence),
    rally: cloneValue(input.rally),
    home: cloneValue(input.home),
    survey: createSurveyDraftExtension(),
    cruiseSpeed: DEFAULT_CRUISE_SPEED_MPS,
    hoverSpeed: DEFAULT_HOVER_SPEED_MPS,
  };
}

function workspaceFromImport(input: MissionPlanFileImportData): MissionPlannerWorkspace {
  const survey = createSurveyDraftExtension();
  for (const parsed of input.surveyRegions) {
    const region = hydrateSurveyRegion(parsed);
    survey.surveyRegions.set(region.id, region);
    survey.surveyRegionOrder.push({ regionId: region.id, position: normalizePosition(parsed.position) });
  }

  survey.surveyRegionOrder.sort((left, right) => left.position - right.position || left.regionId.localeCompare(right.regionId));

  return {
    mission: cloneValue(input.mission),
    fence: cloneValue(input.fence),
    rally: cloneValue(input.rally),
    home: cloneValue(input.home),
    survey,
    cruiseSpeed: input.cruiseSpeed,
    hoverSpeed: input.hoverSpeed,
  };
}

function exportSurveyRegions(extension: SurveyDraftExtension) {
  return [...extension.surveyRegionOrder]
    .sort((left, right) => left.position - right.position || left.regionId.localeCompare(right.regionId))
    .flatMap((block) => {
      const region = extension.surveyRegions.get(block.regionId);
      return region ? [toExportableSurveyRegion(region, block.position)] : [];
    });
}

function sameHome(left: HomePosition | null, right: HomePosition | null): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return left === right;
  }

  return left.latitude_deg === right.latitude_deg
    && left.longitude_deg === right.longitude_deg
    && left.altitude_m === right.altitude_m;
}

function sameSurvey(left: SurveyDraftExtension, right: SurveyDraftExtension): boolean {
  return JSON.stringify(serializeSurvey(left)) === JSON.stringify(serializeSurvey(right));
}

function serializeSurvey(extension: SurveyDraftExtension) {
  return [...extension.surveyRegionOrder]
    .sort((left, right) => left.position - right.position || left.regionId.localeCompare(right.regionId))
    .map((block) => {
      const region = extension.surveyRegions.get(block.regionId);
      return {
        position: block.position,
        regionId: block.regionId,
        importWarnings: region?.importWarnings ?? [],
        exportable: region ? toExportableSurveyRegion(region, block.position) : null,
      };
    });
}

function samePlan(left: MissionPlan, right: MissionPlan): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameFence(left: FencePlan, right: FencePlan): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameRally(left: RallyPlan, right: RallyPlan): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function scopeFromEnvelope(envelope: SessionEnvelope | null): SessionScope {
  if (!envelope) {
    return EMPTY_SCOPE;
  }

  return {
    session_id: envelope.session_id,
    source_kind: envelope.source_kind,
    seek_epoch: envelope.seek_epoch,
    reset_revision: envelope.reset_revision,
  };
}

function currentScope(state: MissionPlannerStoreState): SessionScope {
  return state.activeEnvelope ? scopeFromEnvelope(state.activeEnvelope) : state.draftState.active.mission.scope;
}

function scopeMatches(left: SessionScope, right: SessionScope): boolean {
  return left.session_id === right.session_id && left.source_kind === right.source_kind;
}

function areEnvelopesEqual(left: SessionEnvelope | null, right: SessionEnvelope | null): boolean {
  if (!left || !right) {
    return left === right;
  }

  return isSameEnvelope(left, right);
}

function scopedEnvelopeKey(envelope: SessionEnvelope): string {
  return `${envelope.source_kind}:${envelope.session_id}:${envelope.seek_epoch}:${envelope.reset_revision}`;
}

function normalizePosition(position: number): number {
  if (!Number.isFinite(position)) {
    return 0;
  }

  return Math.max(0, Math.trunc(position));
}

function withResolvedPhase(state: MissionPlannerStoreState): MissionPlannerStoreState {
  const normalized = normalizeSelection(state);
  return {
    ...normalized,
    phase: resolvePhase(normalized),
  };
}

function normalizeSelection(state: MissionPlannerStoreState): MissionPlannerStoreState {
  if (state.selection.kind === "home") {
    return state;
  }

  if (state.selection.kind === "mission-item") {
    return typedDraftSelectedItem(state.draftState, "mission")
      ? state
      : {
        ...state,
        selection: { kind: "home" },
      };
  }

  return state.survey.surveyRegions.has(state.selection.regionId)
    ? state
    : {
      ...state,
      selection: { kind: "home" },
    };
}

function resolvePhase(state: MissionPlannerStoreState): MissionPlannerDomainPhase {
  if (state.activeAction) {
    switch (state.activeAction.kind) {
      case "download":
        return "downloading";
      case "upload":
        return "uploading";
      case "validate":
        return "validating";
      case "clear":
        return "clearing";
      case "import":
        return "importing";
      case "export":
        return "exporting";
    }
  }

  if (state.replacePrompt) {
    return "replace-prompt";
  }

  if (!state.sessionHydrated || state.sessionPhase === "subscribing" || state.sessionPhase === "bootstrapping") {
    return "bootstrapping";
  }

  if (!state.activeEnvelope) {
    return "unavailable";
  }

  if (!state.streamReady && state.missionState === null) {
    return "stream-error";
  }

  return "ready";
}

function isCoordinatePairValid(latitudeDeg: number, longitudeDeg: number): boolean {
  return parseLatitude(latitudeDeg).ok && parseLongitude(longitudeDeg).ok;
}

function rejectedMapMove(
  reason: MissionPlannerMapMoveRejectReason,
  message: string,
): MissionPlannerMapMoveResult {
  return {
    status: "rejected",
    reason,
    message,
  };
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, error: Error): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(error), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (reason) => {
        window.clearTimeout(timer);
        reject(reason);
      },
    );
  });
}
