import { get, writable } from "svelte/store";

import type { FencePlan } from "../../fence";
import type { HomePosition, MissionIssue, MissionPlan, MissionState, TransferProgress } from "../../mission";
import type { RallyPlan } from "../../rally";
import type { SessionEnvelope } from "../../session";
import { shouldDropEvent } from "../../session";
import { parseLatitude, parseLongitude } from "../mission-coordinates";
import {
  createMissionKmlFileIo,
  type MissionKmlFileImportData,
  type MissionKmlFileIo,
} from "../mission-kml-file-io";
import type { FenceRegion, MissionCommand, GeoPoint2d, MissionItem } from "../mavkit-types";
import {
  addFenceRegionAt,
  addTypedWaypoint,
  addTypedWaypointAt,
  createTypedDraftState,
  deleteTypedAt,
  insertTypedItemsAfter,
  isTypedDraftDirty,
  moveTypedDown,
  moveTypedUp,
  moveTypedWaypointOnMap,
  replaceTypedDraftFromDownload,
  selectTypedDraftIndex,
  setFenceReturnPoint as setTypedFenceReturnPoint,
  setTypedDraftScope,
  typedDraftItems,
  typedDraftPlan,
  typedDraftSelectedIndex,
  typedDraftSelectedItem,
  updateFenceRegion as updateTypedFenceRegion,
  updateRallyAltitudeFrame,
  updateTypedAltitude,
  updateTypedCommand,
  updateTypedLatitude,
  updateTypedLongitude,
  type FenceRegionType,
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
  applyGenerationResult,
  createCorridorRegion,
  createStructureRegion,
  createSurveyDraftExtension,
  createSurveyRegion,
  dissolveSurveyRegion,
  flattenRegionsToItems,
  hydrateSurveyRegion,
  insertSurveyRegion,
  markItemEdited,
  removeSurveyRegion,
  setSurveyRegionGenerationState,
  toExportableSurveyRegion,
  updateSurveyRegion,
  type SurveyDraftExtension,
  type SurveyPatternType,
  type SurveyRegion,
} from "../survey-region";
import {
  buildSurveyGenerationRequest,
  createSurveyDissolvePrompt,
  createSurveyRegeneratePrompt,
  normalizeSurveyAuthoringExtension,
  reindexSurveyBlocksAfterDissolve,
  resolveSurveyInsertionSite,
  runSurveyGenerationRequest,
  type SurveyAuthoringPrompt,
  type SurveyAuthoringSelection,
  type SurveyEngineRunners,
} from "../mission-survey-authoring";
import type { SessionStore, SessionStorePhase, SessionStoreState } from "./session";
import { session } from "./session";
import {
  createMissionPlannerViewStore,
  type MissionPlannerViewStore,
} from "./mission-planner-view";

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
  | "replace-prompt"
  | "reviewing-import"
  | "reviewing-export";

export type MissionPlannerMode = "mission" | "fence" | "rally";
export type MissionPlannerAttachmentKind = "live-attached" | "playback-readonly" | "detached-local" | "local-draft";
export type MissionPlannerImportDomain = "mission" | "fence" | "rally";
export type MissionPlannerImportSource = "plan" | "kml" | "kmz";

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
    target: "home" | "mission-item" | "rally-point";
    uiId: number | null;
    latitude_deg: number;
    longitude_deg: number;
  }
  | {
    status: "rejected";
    reason: MissionPlannerMapMoveRejectReason;
    message: string;
  };

export type MissionPlannerFenceSelection =
  | { kind: "none" }
  | { kind: "region"; regionUiId: number | null }
  | { kind: "return-point" };

export type MissionPlannerRallySelection =
  | { kind: "none" }
  | { kind: "point"; pointUiId: number | null };

export type MissionPlannerWarningActionTarget =
  | { kind: "fence-region"; regionUiId: number | null }
  | { kind: "fence-return-point" }
  | { kind: "rally-point"; pointUiId: number | null };

export type MissionPlannerFenceMutationRejectReason =
  | "invalid-coordinate"
  | "invalid-geometry"
  | "invalid-radius"
  | "read-only"
  | "region-not-found"
  | "return-point-missing";

export type MissionPlannerFenceMutationResult =
  | {
    status: "applied";
    target: "region" | "return-point" | "none";
    regionUiId: number | null;
  }
  | {
    status: "rejected";
    reason: MissionPlannerFenceMutationRejectReason;
    message: string;
  };

export type MissionPlannerRallyMutationRejectReason =
  | "invalid-altitude"
  | "invalid-altitude-frame"
  | "invalid-coordinate"
  | "point-not-found"
  | "read-only";

export type MissionPlannerRallyMutationResult =
  | {
    status: "applied";
    target: "point" | "none";
    pointUiId: number | null;
  }
  | {
    status: "rejected";
    reason: MissionPlannerRallyMutationRejectReason;
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
    action: "download" | "clear";
    incomingWorkspace: MissionPlannerWorkspace | null;
    fileWarnings: string[];
    fileName: string | null;
  }
  | {
    kind: "recoverable";
  };

export type MissionPlannerImportReviewChoice = {
  domain: MissionPlannerImportDomain;
  label: string;
  replace: boolean;
  currentSummary: string;
  incomingSummary: string;
};

export type MissionPlannerImportReview = {
  source: MissionPlannerImportSource;
  fileName: string | null;
  warnings: string[];
  incomingWorkspace: MissionPlannerWorkspace;
  choices: MissionPlannerImportReviewChoice[];
};

export type MissionPlannerExportReviewChoice = {
  domain: MissionPlannerImportDomain;
  label: string;
  selected: boolean;
  summary: string;
};

export type MissionPlannerExportReview = {
  choices: MissionPlannerExportReviewChoice[];
};

export type MissionPlannerAttachmentState = {
  kind: MissionPlannerAttachmentKind;
  label: string;
  detail: string;
  readOnly: boolean;
  canEdit: boolean;
  canUseVehicleActions: boolean;
};

export type MissionPlannerSurveyPrompt = SurveyAuthoringPrompt;

export type MissionPlannerStoreState = {
  hydrated: boolean;
  workspaceMounted: boolean;
  mode: MissionPlannerMode;
  selection: MissionPlannerSelection;
  fenceSelection: MissionPlannerFenceSelection;
  rallySelection: MissionPlannerRallySelection;
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
  pendingImportReview: MissionPlannerImportReview | null;
  pendingExportReview: MissionPlannerExportReview | null;
  surveyPrompt: MissionPlannerSurveyPrompt | null;
  recoverableWorkspace: RecoverableMissionPlannerWorkspace | null;
  dismissedWarningIds: string[];
  blockedReason: string | null;
  blockedMode: MissionPlannerMode | null;
  blockedWarningTarget: MissionPlannerWarningActionTarget | null;
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
  surveyGenerationTimeoutMs?: number;
  surveyEngines?: SurveyEngineRunners;
  kmlFileIo?: MissionKmlFileIo;
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
const ALL_IMPORT_DOMAINS = ["mission", "fence", "rally"] as const satisfies readonly MissionPlannerImportDomain[];

function createInitialState(): MissionPlannerStoreState {
  return {
    hydrated: false,
    workspaceMounted: false,
    mode: "mission",
    selection: { kind: "home" },
    fenceSelection: { kind: "none" },
    rallySelection: { kind: "none" },
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
    pendingImportReview: null,
    pendingExportReview: null,
    surveyPrompt: null,
    recoverableWorkspace: null,
    dismissedWarningIds: [],
    blockedReason: null,
    blockedMode: null,
    blockedWarningTarget: null,
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
  const surveyGenerationTimeoutMs = options.surveyGenerationTimeoutMs ?? actionTimeoutMs;
  const surveyEngines = options.surveyEngines;
  const kmlFileIo = options.kmlFileIo ?? createMissionKmlFileIo();
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
      const currentDraftScope = attachedDraftScope(state);
      const nextRecoverable = state.workspaceMounted && plannerHasContent(state)
        ? {
          scope: currentDraftScope,
          active: captureActiveWorkspace(state),
          snapshot: captureSnapshotWorkspace(state),
        }
        : state.recoverableWorkspace;
      const recoverablePrompt = nextRecoverable
        && scopeMatchesIdentity(nextRecoverable.scope, nextScope)
        && !scopeMatchesExact(currentDraftScope, nextScope)
        ? ({ kind: "recoverable" } satisfies MissionPlannerReplacePrompt)
        : null;

      return withResolvedPhase({
        ...base,
        activeEnvelope: nextEnvelope,
        activeSource: nextEnvelope?.source_kind ?? null,
        missionState: nextEnvelope ? sessionState.bootstrap.missionState : null,
        transferProgress: null,
        activeAction: null,
        replacePrompt: recoverablePrompt,
        recoverableWorkspace: nextRecoverable,
        dismissedWarningIds: clearDismissedWarningIds(state.dismissedWarningIds, ["attachment:"]),
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

  function setMode(mode: MissionPlannerMode) {
    store.update((state) => withResolvedPhase({
      ...state,
      mode,
    }));
  }

  function withBlockedReason(
    state: MissionPlannerStoreState,
    message: string,
    target: MissionPlannerWarningActionTarget | null = warningTargetFromMode(state.mode, state),
  ): MissionPlannerStoreState {
    return withResolvedPhase({
      ...state,
      blockedReason: message,
      blockedMode: state.mode,
      blockedWarningTarget: target,
      dismissedWarningIds: clearDismissedWarningIds(state.dismissedWarningIds, ["blocked:"]),
    });
  }

  function replaceWorkspace(workspace: MissionPlannerWorkspace) {
    store.update((state) => withResolvedPhase({
      ...applyWorkspacePair(state, {
        active: workspace,
        snapshot: workspace,
      }, currentScope(state)),
      replacePrompt: null,
      pendingImportReview: null,
      pendingExportReview: null,
      blockedReason: null,
      blockedMode: null,
      blockedWarningTarget: null,
    }));
  }

  function setHome(home: HomePosition | null) {
    store.update((state) => {
      if (!canEditWorkspace(state)) {
        return withBlockedReason(state, readOnlyMutationMessage(state, "Home updates"));
      }

      return withResolvedPhase({
        ...state,
        home: cloneValue(home),
        selection: { kind: "home" },
        validationIssues: [],
      });
    });
  }

  function setPlanningSpeeds(args: { cruiseSpeed?: number; hoverSpeed?: number }) {
    store.update((state) => {
      if (!canEditWorkspace(state)) {
        return withBlockedReason(state, readOnlyMutationMessage(state, "Planner speed changes"));
      }

      return withResolvedPhase({
        ...state,
        cruiseSpeed: typeof args.cruiseSpeed === "number" && Number.isFinite(args.cruiseSpeed)
          ? args.cruiseSpeed
          : state.cruiseSpeed,
        hoverSpeed: typeof args.hoverSpeed === "number" && Number.isFinite(args.hoverSpeed)
          ? args.hoverSpeed
          : state.hoverSpeed,
        validationIssues: [],
      });
    });
  }

  function normalizePlannerSurveyExtension(survey: SurveyDraftExtension): SurveyDraftExtension {
    return normalizeSurveyAuthoringExtension(cloneValue(survey));
  }

  function nextSurveySelection(
    selection: MissionPlannerSelection,
    survey: SurveyDraftExtension,
  ): MissionPlannerSelection {
    return selection.kind === "survey-block" && !survey.surveyRegions.has(selection.regionId)
      ? { kind: "home" }
      : selection;
  }

  function replaceSurveyExtension(survey: SurveyDraftExtension) {
    const nextSurvey = normalizePlannerSurveyExtension(survey);
    store.update((state) => {
      if (!canEditWorkspace(state)) {
        return withBlockedReason(state, readOnlyMutationMessage(state, "Survey changes"));
      }

      return withResolvedPhase({
        ...state,
        survey: nextSurvey,
        selection: nextSurveySelection(state.selection, nextSurvey),
        surveyPrompt: null,
        validationIssues: [],
      });
    });
  }

  function updateSurveyState(
    updater: (survey: SurveyDraftExtension) => SurveyDraftExtension,
    options: {
      selection?: MissionPlannerSelection;
      surveyPrompt?: MissionPlannerSurveyPrompt | null;
      lastError?: string | null;
      normalizeSurvey?: boolean;
      allowWhenReadOnly?: boolean;
    } = {},
  ) {
    store.update((state) => {
      if (!options.allowWhenReadOnly && !canEditWorkspace(state)) {
        return withBlockedReason(state, readOnlyMutationMessage(state, "Survey changes"));
      }

      const nextSurvey = updater(state.survey);
      const survey = options.normalizeSurvey === false
        ? cloneValue(nextSurvey)
        : normalizeSurveyAuthoringExtension(nextSurvey);
      const selection = nextSurveySelection(options.selection ?? state.selection, survey);

      return withResolvedPhase({
        ...state,
        survey,
        selection,
        surveyPrompt: options.surveyPrompt ?? null,
        validationIssues: [],
        lastError: options.lastError ?? state.lastError,
      });
    });
  }

  function updateSurveyRegionState(
    regionId: string,
    updater: (region: SurveyRegion) => SurveyRegion,
    options: {
      selection?: MissionPlannerSelection;
      surveyPrompt?: MissionPlannerSurveyPrompt | null;
      lastError?: string | null;
      normalizeSurvey?: boolean;
    } = {},
  ) {
    updateSurveyState(
      (survey) => updateSurveyRegion(survey, regionId, updater),
      {
        ...options,
        selection: options.selection ?? { kind: "survey-block", regionId },
      },
    );
  }

  function createSurveyBlock(patternType: SurveyPatternType, geometry: GeoPoint2d[]) {
    const state = get(store);
    const selection: SurveyAuthoringSelection = state.selection.kind === "mission-item"
      ? { kind: "mission-item", index: typedDraftSelectedIndex(state.draftState, "mission") }
      : state.selection.kind === "survey-block"
        ? state.selection
        : { kind: "home" };
    const site = resolveSurveyInsertionSite(selection, state.survey);
    const region = patternType === "corridor"
      ? createCorridorRegion(geometry)
      : patternType === "structure"
        ? createStructureRegion(geometry)
        : createSurveyRegion(geometry);

    updateSurveyState(
      (survey) => insertSurveyRegion(survey, region, site.position, site.orderIndex),
      {
        selection: { kind: "survey-block", regionId: region.id },
      },
    );

    return region.id;
  }

  function updateAuthoredSurveyRegion(
    regionId: string,
    updater: (region: SurveyRegion) => SurveyRegion,
  ) {
    updateSurveyRegionState(regionId, (region) => {
      const next = updater(region);
      return reconcileRegionAfterAuthoringEdit(next);
    });
  }

  function setSurveyRegionCollapsed(regionId: string, collapsed: boolean) {
    updateSurveyRegionState(regionId, (region) => ({
      ...region,
      collapsed,
    }));
  }

  function deleteSurveyRegionById(regionId: string) {
    updateSurveyState((survey) => removeSurveyRegion(survey, regionId), {
      selection: { kind: "home" },
    });
  }

  function markSurveyRegionItemAsEdited(regionId: string, localIndex: number, editedItem: MissionItem) {
    updateSurveyRegionState(regionId, (region) => reconcileRegionAfterAuthoringEdit(markItemEdited(region, localIndex, editedItem)));
  }

  function promptDissolveSurveyRegion(regionId: string) {
    const region = get(store).survey.surveyRegions.get(regionId);
    if (!region) {
      return { status: "missing" as const };
    }

    updateSurveyRegionState(regionId, (current) => current, {
      surveyPrompt: createSurveyDissolvePrompt(region),
    });
    return { status: "prompted" as const };
  }

  async function generateSurveyRegion(regionId: string, force = false) {
    const current = get(store).survey.surveyRegions.get(regionId);
    if (!current) {
      return { status: "missing" as const };
    }

    const regeneratePrompt = !force ? createSurveyRegeneratePrompt(current) : null;
    if (regeneratePrompt) {
      updateSurveyRegionState(regionId, (region) => region, { surveyPrompt: regeneratePrompt });
      return { status: "prompted" as const };
    }

    const request = buildSurveyGenerationRequest(current);
    if (!request.ok) {
      updateSurveyRegionState(
        regionId,
        (region) => setSurveyRegionGenerationState(region, "blocked", request.blockedReason.message),
      );
      return { status: "blocked" as const, message: request.blockedReason.message };
    }

    updateSurveyRegionState(regionId, (region) => setSurveyRegionGenerationState(region, "generating", null));

    try {
      const result = await withTimeout(
        runSurveyGenerationRequest(request.request, surveyEngines),
        surveyGenerationTimeoutMs,
        new Error("Survey generation timed out. The region was left unchanged; retry when the planner is ready."),
      );

      updateSurveyRegionState(regionId, (region) => applyGenerationResult(region, result));
      return { status: "generated" as const, ok: result.ok };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      updateSurveyRegionState(
        regionId,
        (region) => setSurveyRegionGenerationState(region, "blocked", message),
        { lastError: message, normalizeSurvey: false },
      );
      return { status: "error" as const, message };
    }
  }

  function reconcileRegionAfterAuthoringEdit(region: SurveyRegion): SurveyRegion {
    const clearedRegion: SurveyRegion = {
      ...region,
      errors: [],
    };

    return normalizeSurveyAuthoringExtension({
      surveyRegions: new Map([[region.id, clearedRegion]]),
      surveyRegionOrder: [{ regionId: region.id, position: 0 }],
    }).surveyRegions.get(region.id) ?? clearedRegion;
  }

  function dissolveSurveyRegionToMissionItems(regionId: string) {
    const state = get(store);
    if (!canEditWorkspace(state)) {
      return { status: "blocked" as const, message: readOnlyMutationMessage(state, "Dissolving survey blocks") };
    }

    const region = state.survey.surveyRegions.get(regionId);
    if (!region) {
      return { status: "missing" as const };
    }

    const dissolved = dissolveSurveyRegion(state.survey, regionId);
    const draftState = insertTypedItemsAfter(
      state.draftState,
      "mission",
      Math.max(-1, (state.survey.surveyRegionOrder.find((entry) => entry.regionId === regionId)?.position ?? 0) - 1),
      dissolved.dissolvedItems,
    );
    const reindexedSurvey = reindexSurveyBlocksAfterDissolve(
      state.survey,
      state.draftState.active.mission.draftItems.length,
      regionId,
      dissolved.dissolvedItems.length,
    );
    const survey = normalizeSurveyAuthoringExtension({
      surveyRegions: new Map(dissolved.extension.surveyRegions),
      surveyRegionOrder: reindexedSurvey.surveyRegionOrder,
    });

    store.update((current) => withResolvedPhase({
      ...current,
      draftState,
      survey,
      selection: dissolved.dissolvedItems.length > 0 ? { kind: "mission-item" } : { kind: "home" },
      surveyPrompt: null,
      validationIssues: [],
    }));

    return {
      status: "dissolved" as const,
      itemCount: dissolved.dissolvedItems.length,
    };
  }

  function updateMissionDraft(
    updater: (draftState: TypedDraftState) => TypedDraftState,
    selection: MissionPlannerSelection = { kind: "mission-item" },
  ) {
    store.update((state) => {
      if (!canEditWorkspace(state)) {
        return withBlockedReason(state, readOnlyMutationMessage(state, "Mission draft edits"));
      }

      return withResolvedPhase({
        ...state,
        draftState: updater(state.draftState),
        selection,
        validationIssues: [],
      });
    });
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

    const state = get(store);
    if (!canEditWorkspace(state)) {
      store.update((current) => withBlockedReason(current, readOnlyMutationMessage(current, "Home drags")));
      return rejectedMapMove("item-read-only", readOnlyMutationMessage(state, "Home drags"));
    }

    const currentHome = state.home;
    if (!currentHome) {
      return rejectedMapMove("home-missing", "Ignored the Home drag because this draft does not have a Home marker yet.");
    }

    store.update((current) => withResolvedPhase({
      ...current,
      home: {
        latitude_deg: latitudeDeg,
        longitude_deg: longitudeDeg,
        altitude_m: current.home?.altitude_m ?? currentHome.altitude_m,
      },
      selection: { kind: "home" },
      validationIssues: [],
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

    const state = get(store);
    if (!canEditWorkspace(state)) {
      store.update((current) => withBlockedReason(current, readOnlyMutationMessage(current, "Waypoint drags")));
      return rejectedMapMove("item-read-only", readOnlyMutationMessage(state, "Waypoint drags"));
    }

    const missionItem = state.draftState.active.mission.draftItems.find((item) => item.uiId === uiId);
    if (!missionItem) {
      return rejectedMapMove("item-not-found", "Ignored a stale waypoint drag because that mission item is no longer active.");
    }

    if (missionItem.readOnly) {
      return rejectedMapMove("item-read-only", "Ignored the waypoint drag because preserved read-only mission items cannot be repositioned on the map.");
    }

    if (missionItem.preview.latitude_deg === null || missionItem.preview.longitude_deg === null) {
      return rejectedMapMove("item-without-position", "Ignored the waypoint drag because this mission item does not expose a draggable position.");
    }

    store.update((current) => withResolvedPhase({
      ...current,
      draftState: selectTypedDraftIndex(
        moveTypedWaypointOnMap(current.draftState, "mission", missionItem.index, latitudeDeg, longitudeDeg),
        "mission",
        missionItem.index,
      ),
      selection: { kind: "mission-item" },
      validationIssues: [],
    }));

    return {
      status: "applied",
      target: "mission-item",
      uiId,
      latitude_deg: latitudeDeg,
      longitude_deg: longitudeDeg,
    };
  }

  function selectFenceRegionByUiId(uiId: number): MissionPlannerFenceMutationResult {
    const state = get(store);
    const region = state.draftState.active.fence.draftItems.find((item) => item.uiId === uiId);
    if (!region) {
      store.update((current) => withBlockedReason(current, "Ignored a stale fence selection because that region is no longer present in the active draft."));
      return rejectedFenceMutation("region-not-found", "Ignored a stale fence selection because that region is no longer present in the active draft.");
    }

    store.update((current) => withResolvedPhase({
      ...current,
      draftState: selectTypedDraftIndex(current.draftState, "fence", region.index),
      fenceSelection: { kind: "region", regionUiId: uiId },
      blockedReason: null,
      blockedMode: null,
      blockedWarningTarget: null,
      dismissedWarningIds: clearDismissedWarningIds(current.dismissedWarningIds, ["blocked:"]),
    }));

    return {
      status: "applied",
      target: "region",
      regionUiId: uiId,
    };
  }

  function selectFenceReturnPoint(): MissionPlannerFenceMutationResult {
    const state = get(store);
    if (!state.draftState.active.fence.document.return_point) {
      store.update((current) => withBlockedReason(current, "Ignored a stale fence return-point selection because this draft does not have a return point yet."));
      return rejectedFenceMutation("return-point-missing", "Ignored a stale fence return-point selection because this draft does not have a return point yet.");
    }

    store.update((current) => withResolvedPhase({
      ...current,
      fenceSelection: { kind: "return-point" },
      blockedReason: null,
      blockedMode: null,
      blockedWarningTarget: null,
      dismissedWarningIds: clearDismissedWarningIds(current.dismissedWarningIds, ["blocked:"]),
    }));

    return {
      status: "applied",
      target: "return-point",
      regionUiId: null,
    };
  }

  function addFenceRegion(
    type: FenceRegionType,
    latitudeDeg?: number,
    longitudeDeg?: number,
  ): MissionPlannerFenceMutationResult {
    const state = get(store);
    if (!canEditWorkspace(state)) {
      store.update((current) => withBlockedReason(current, readOnlyMutationMessage(current, "Fence edits")));
      return rejectedFenceMutation("read-only", readOnlyMutationMessage(state, "Fence edits"));
    }

    const anchor = resolveFenceAnchorPoint(state);
    const nextLatitude = typeof latitudeDeg === "number" ? latitudeDeg : anchor.latitude_deg;
    const nextLongitude = typeof longitudeDeg === "number" ? longitudeDeg : anchor.longitude_deg;
    if (!isCoordinatePairValid(nextLatitude, nextLongitude)) {
      store.update((current) => withBlockedReason(current, "Ignored the fence add because the requested map position was invalid."));
      return rejectedFenceMutation("invalid-coordinate", "Ignored the fence add because the requested map position was invalid.");
    }

    const draftState = addFenceRegionAt(state.draftState, nextLatitude, nextLongitude, type);
    const regionUiId = draftState.active.fence.primarySelectedUiId;

    store.update((current) => withResolvedPhase({
      ...current,
      draftState,
      fenceSelection: regionUiId === null ? { kind: "none" } : { kind: "region", regionUiId },
      blockedReason: null,
      blockedMode: null,
      blockedWarningTarget: null,
      dismissedWarningIds: clearDismissedWarningIds(current.dismissedWarningIds, ["blocked:"]),
    }));

    return {
      status: "applied",
      target: regionUiId === null ? "none" : "region",
      regionUiId,
    };
  }

  function deleteFenceRegionByUiId(uiId: number): MissionPlannerFenceMutationResult {
    const state = get(store);
    if (!canEditWorkspace(state)) {
      store.update((current) => withBlockedReason(current, readOnlyMutationMessage(current, "Fence deletes")));
      return rejectedFenceMutation("read-only", readOnlyMutationMessage(state, "Fence deletes"));
    }

    const region = state.draftState.active.fence.draftItems.find((item) => item.uiId === uiId);
    if (!region) {
      store.update((current) => withBlockedReason(current, "Ignored a stale fence delete because that region is no longer present in the active draft."));
      return rejectedFenceMutation("region-not-found", "Ignored a stale fence delete because that region is no longer present in the active draft.");
    }

    const draftState = deleteTypedAt(state.draftState, "fence", region.index);
    const nextRegion = typedDraftSelectedItem(draftState, "fence");
    const nextReturnPoint = typedDraftPlan(draftState, "fence").return_point;
    const fenceSelection = nextRegion
      ? ({ kind: "region", regionUiId: nextRegion.uiId } satisfies MissionPlannerFenceSelection)
      : nextReturnPoint
        ? ({ kind: "return-point" } satisfies MissionPlannerFenceSelection)
        : ({ kind: "none" } satisfies MissionPlannerFenceSelection);

    store.update((current) => withResolvedPhase({
      ...current,
      draftState,
      fenceSelection,
      blockedReason: null,
      blockedMode: null,
      blockedWarningTarget: null,
      dismissedWarningIds: clearDismissedWarningIds(current.dismissedWarningIds, ["blocked:"]),
    }));

    return {
      status: "applied",
      target: fenceSelection.kind === "region" ? "region" : fenceSelection.kind === "return-point" ? "return-point" : "none",
      regionUiId: fenceSelection.kind === "region" ? fenceSelection.regionUiId : null,
    };
  }

  function updateFenceRegionByUiId(uiId: number, region: FenceRegion): MissionPlannerFenceMutationResult {
    const validation = validateFenceRegion(region);
    if (!validation.ok) {
      store.update((current) => withBlockedReason(current, validation.message));
      return rejectedFenceMutation("invalid-geometry", validation.message);
    }

    const state = get(store);
    if (!canEditWorkspace(state)) {
      store.update((current) => withBlockedReason(current, readOnlyMutationMessage(current, "Fence edits")));
      return rejectedFenceMutation("read-only", readOnlyMutationMessage(state, "Fence edits"));
    }

    const activeRegion = state.draftState.active.fence.draftItems.find((item) => item.uiId === uiId);
    if (!activeRegion) {
      store.update((current) => withBlockedReason(current, "Ignored a stale fence edit because that region is no longer present in the active draft."));
      return rejectedFenceMutation("region-not-found", "Ignored a stale fence edit because that region is no longer present in the active draft.");
    }

    const draftState = selectTypedDraftIndex(
      updateTypedFenceRegion(state.draftState, activeRegion.index, cloneValue(region)),
      "fence",
      activeRegion.index,
    );

    store.update((current) => withResolvedPhase({
      ...current,
      draftState,
      fenceSelection: { kind: "region", regionUiId: uiId },
      blockedReason: null,
      blockedMode: null,
      blockedWarningTarget: null,
      dismissedWarningIds: clearDismissedWarningIds(current.dismissedWarningIds, ["blocked:"]),
    }));

    return {
      status: "applied",
      target: "region",
      regionUiId: uiId,
    };
  }

  function setFenceReturnPoint(point: GeoPoint2d | null): MissionPlannerFenceMutationResult {
    const state = get(store);
    if (!canEditWorkspace(state)) {
      store.update((current) => withBlockedReason(current, readOnlyMutationMessage(current, point ? "Fence return-point edits" : "Fence return-point clears")));
      return rejectedFenceMutation("read-only", readOnlyMutationMessage(state, point ? "Fence return-point edits" : "Fence return-point clears"));
    }

    if (point !== null && !isCoordinatePairValid(point.latitude_deg, point.longitude_deg)) {
      store.update((current) => withBlockedReason(current, "Ignored the fence return-point update because the requested coordinate was invalid."));
      return rejectedFenceMutation("invalid-coordinate", "Ignored the fence return-point update because the requested coordinate was invalid.");
    }

    const draftState = setTypedFenceReturnPoint(state.draftState, point ? cloneValue(point) : null);
    const nextSelection = point
      ? ({ kind: "return-point" } satisfies MissionPlannerFenceSelection)
      : normalizeFenceSelectionState({
        ...state,
        draftState,
        fenceSelection: state.fenceSelection.kind === "return-point" ? { kind: "none" } : state.fenceSelection,
      }).fenceSelection;

    store.update((current) => withResolvedPhase({
      ...current,
      draftState,
      fenceSelection: nextSelection,
      blockedReason: null,
      blockedMode: null,
      blockedWarningTarget: null,
      dismissedWarningIds: clearDismissedWarningIds(current.dismissedWarningIds, ["blocked:"]),
    }));

    return {
      status: "applied",
      target: nextSelection.kind === "region" ? "region" : nextSelection.kind === "return-point" ? "return-point" : "none",
      regionUiId: nextSelection.kind === "region" ? nextSelection.regionUiId : null,
    };
  }

  function moveFenceVertexByUiId(
    uiId: number,
    vertexIndex: number,
    latitudeDeg: number,
    longitudeDeg: number,
  ): MissionPlannerFenceMutationResult {
    if (!isCoordinatePairValid(latitudeDeg, longitudeDeg)) {
      store.update((current) => withBlockedReason(current, "Ignored the fence vertex drag because the map emitted invalid coordinates."));
      return rejectedFenceMutation("invalid-coordinate", "Ignored the fence vertex drag because the map emitted invalid coordinates.");
    }

    const state = get(store);
    const region = state.draftState.active.fence.draftItems.find((item) => item.uiId === uiId)?.document as FenceRegion | undefined;
    if (!region) {
      store.update((current) => withBlockedReason(current, "Ignored a stale fence-vertex drag because that region is no longer present in the active draft."));
      return rejectedFenceMutation("region-not-found", "Ignored a stale fence-vertex drag because that region is no longer present in the active draft.");
    }

    if ("inclusion_polygon" in region) {
      const nextVertices = [...region.inclusion_polygon.vertices];
      if (!nextVertices[vertexIndex]) {
        store.update((current) => withBlockedReason(current, "Ignored a stale fence-vertex drag because that vertex is no longer present in the active region."));
        return rejectedFenceMutation("invalid-geometry", "Ignored a stale fence-vertex drag because that vertex is no longer present in the active region.");
      }
      nextVertices[vertexIndex] = { latitude_deg: latitudeDeg, longitude_deg: longitudeDeg };
      return updateFenceRegionByUiId(uiId, {
        inclusion_polygon: {
          ...region.inclusion_polygon,
          vertices: nextVertices,
        },
      });
    }

    if ("exclusion_polygon" in region) {
      const nextVertices = [...region.exclusion_polygon.vertices];
      if (!nextVertices[vertexIndex]) {
        store.update((current) => withBlockedReason(current, "Ignored a stale fence-vertex drag because that vertex is no longer present in the active region."));
        return rejectedFenceMutation("invalid-geometry", "Ignored a stale fence-vertex drag because that vertex is no longer present in the active region.");
      }
      nextVertices[vertexIndex] = { latitude_deg: latitudeDeg, longitude_deg: longitudeDeg };
      return updateFenceRegionByUiId(uiId, {
        exclusion_polygon: {
          ...region.exclusion_polygon,
          vertices: nextVertices,
        },
      });
    }

    store.update((current) => withBlockedReason(current, "Ignored the fence-vertex drag because only polygon regions expose editable vertices on the planner map."));
    return rejectedFenceMutation("invalid-geometry", "Ignored the fence-vertex drag because only polygon regions expose editable vertices on the planner map.");
  }

  function moveFenceCircleCenterByUiId(
    uiId: number,
    latitudeDeg: number,
    longitudeDeg: number,
  ): MissionPlannerFenceMutationResult {
    if (!isCoordinatePairValid(latitudeDeg, longitudeDeg)) {
      store.update((current) => withBlockedReason(current, "Ignored the fence-region drag because the map emitted invalid coordinates."));
      return rejectedFenceMutation("invalid-coordinate", "Ignored the fence-region drag because the map emitted invalid coordinates.");
    }

    const state = get(store);
    const region = state.draftState.active.fence.draftItems.find((item) => item.uiId === uiId)?.document as FenceRegion | undefined;
    if (!region) {
      store.update((current) => withBlockedReason(current, "Ignored a stale fence-region drag because that region is no longer present in the active draft."));
      return rejectedFenceMutation("region-not-found", "Ignored a stale fence-region drag because that region is no longer present in the active draft.");
    }

    if ("inclusion_circle" in region) {
      return updateFenceRegionByUiId(uiId, {
        inclusion_circle: {
          ...region.inclusion_circle,
          center: { latitude_deg: latitudeDeg, longitude_deg: longitudeDeg },
        },
      });
    }

    if ("exclusion_circle" in region) {
      return updateFenceRegionByUiId(uiId, {
        exclusion_circle: {
          ...region.exclusion_circle,
          center: { latitude_deg: latitudeDeg, longitude_deg: longitudeDeg },
        },
      });
    }

    store.update((current) => withBlockedReason(current, "Ignored the fence-region drag because only circle regions expose a movable center handle on the planner map."));
    return rejectedFenceMutation("invalid-geometry", "Ignored the fence-region drag because only circle regions expose a movable center handle on the planner map.");
  }

  function updateFenceCircleRadiusByUiId(uiId: number, radiusM: number): MissionPlannerFenceMutationResult {
    if (!Number.isFinite(radiusM) || radiusM <= 0) {
      store.update((current) => withBlockedReason(current, "Ignored the fence radius edit because the resulting radius was not greater than zero."));
      return rejectedFenceMutation("invalid-radius", "Ignored the fence radius edit because the resulting radius was not greater than zero.");
    }

    const state = get(store);
    const region = state.draftState.active.fence.draftItems.find((item) => item.uiId === uiId)?.document as FenceRegion | undefined;
    if (!region) {
      store.update((current) => withBlockedReason(current, "Ignored a stale fence radius edit because that region is no longer present in the active draft."));
      return rejectedFenceMutation("region-not-found", "Ignored a stale fence radius edit because that region is no longer present in the active draft.");
    }

    if ("inclusion_circle" in region) {
      return updateFenceRegionByUiId(uiId, {
        inclusion_circle: {
          ...region.inclusion_circle,
          radius_m: radiusM,
        },
      });
    }

    if ("exclusion_circle" in region) {
      return updateFenceRegionByUiId(uiId, {
        exclusion_circle: {
          ...region.exclusion_circle,
          radius_m: radiusM,
        },
      });
    }

    store.update((current) => withBlockedReason(current, "Ignored the fence radius edit because only circle regions expose a radius handle on the planner map."));
    return rejectedFenceMutation("invalid-geometry", "Ignored the fence radius edit because only circle regions expose a radius handle on the planner map.");
  }

  function selectRallyPointByUiId(uiId: number): MissionPlannerRallyMutationResult {
    const state = get(store);
    const point = state.draftState.active.rally.draftItems.find((item) => item.uiId === uiId);
    if (!point) {
      store.update((current) => withBlockedReason(
        current,
        "Ignored a stale rally selection because that point is no longer present in the active draft.",
        { kind: "rally-point", pointUiId: uiId },
      ));
      return rejectedRallyMutation("point-not-found", "Ignored a stale rally selection because that point is no longer present in the active draft.");
    }

    store.update((current) => withResolvedPhase({
      ...current,
      draftState: selectTypedDraftIndex(current.draftState, "rally", point.index),
      rallySelection: { kind: "point", pointUiId: uiId },
      blockedReason: null,
      blockedMode: null,
      blockedWarningTarget: null,
      dismissedWarningIds: clearDismissedWarningIds(current.dismissedWarningIds, ["blocked:"]),
    }));

    return {
      status: "applied",
      target: "point",
      pointUiId: uiId,
    };
  }

  function addRallyPoint(
    latitudeDeg?: number,
    longitudeDeg?: number,
  ): MissionPlannerRallyMutationResult {
    const state = get(store);
    if (!canEditWorkspace(state)) {
      store.update((current) => withBlockedReason(current, readOnlyMutationMessage(current, "Rally edits")));
      return rejectedRallyMutation("read-only", readOnlyMutationMessage(state, "Rally edits"));
    }

    const anchor = resolveRallyAnchorPoint(state);
    const nextLatitude = typeof latitudeDeg === "number" ? latitudeDeg : anchor.latitude_deg;
    const nextLongitude = typeof longitudeDeg === "number" ? longitudeDeg : anchor.longitude_deg;
    if (!isCoordinatePairValid(nextLatitude, nextLongitude)) {
      store.update((current) => withBlockedReason(current, "Ignored the rally add because the requested map position was invalid."));
      return rejectedRallyMutation("invalid-coordinate", "Ignored the rally add because the requested map position was invalid.");
    }

    const draftState = addTypedWaypointAt(state.draftState, "rally", nextLatitude, nextLongitude);
    const pointUiId = draftState.active.rally.primarySelectedUiId;

    store.update((current) => withResolvedPhase({
      ...current,
      draftState,
      rallySelection: pointUiId === null ? { kind: "none" } : { kind: "point", pointUiId },
      blockedReason: null,
      blockedMode: null,
      blockedWarningTarget: null,
      dismissedWarningIds: clearDismissedWarningIds(current.dismissedWarningIds, ["blocked:"]),
    }));

    return {
      status: "applied",
      target: pointUiId === null ? "none" : "point",
      pointUiId,
    };
  }

  function deleteRallyPointByUiId(uiId: number): MissionPlannerRallyMutationResult {
    const state = get(store);
    if (!canEditWorkspace(state)) {
      store.update((current) => withBlockedReason(current, readOnlyMutationMessage(current, "Rally deletes")));
      return rejectedRallyMutation("read-only", readOnlyMutationMessage(state, "Rally deletes"));
    }

    const point = state.draftState.active.rally.draftItems.find((item) => item.uiId === uiId);
    if (!point) {
      store.update((current) => withBlockedReason(
        current,
        "Ignored a stale rally delete because that point is no longer present in the active draft.",
        { kind: "rally-point", pointUiId: uiId },
      ));
      return rejectedRallyMutation("point-not-found", "Ignored a stale rally delete because that point is no longer present in the active draft.");
    }

    const draftState = deleteTypedAt(state.draftState, "rally", point.index);
    const nextPoint = typedDraftSelectedItem(draftState, "rally");
    const rallySelection = nextPoint
      ? ({ kind: "point", pointUiId: nextPoint.uiId } satisfies MissionPlannerRallySelection)
      : ({ kind: "none" } satisfies MissionPlannerRallySelection);

    store.update((current) => withResolvedPhase({
      ...current,
      draftState,
      rallySelection,
      blockedReason: null,
      blockedMode: null,
      blockedWarningTarget: null,
      dismissedWarningIds: clearDismissedWarningIds(current.dismissedWarningIds, ["blocked:"]),
    }));

    return {
      status: "applied",
      target: rallySelection.kind === "point" ? "point" : "none",
      pointUiId: rallySelection.kind === "point" ? rallySelection.pointUiId : null,
    };
  }

  function applyRallyPointEditByUiId(
    uiId: number,
    blockedLabel: string,
    updater: (draftState: TypedDraftState, pointIndex: number) => TypedDraftState,
  ): MissionPlannerRallyMutationResult {
    const state = get(store);
    if (!canEditWorkspace(state)) {
      store.update((current) => withBlockedReason(current, readOnlyMutationMessage(current, blockedLabel)));
      return rejectedRallyMutation("read-only", readOnlyMutationMessage(state, blockedLabel));
    }

    const point = state.draftState.active.rally.draftItems.find((item) => item.uiId === uiId);
    if (!point) {
      store.update((current) => withBlockedReason(
        current,
        `Ignored a stale rally edit because point ${uiId} is no longer present in the active draft.`,
        { kind: "rally-point", pointUiId: uiId },
      ));
      return rejectedRallyMutation("point-not-found", `Ignored a stale rally edit because point ${uiId} is no longer present in the active draft.`);
    }

    const nextDraftState = updater(state.draftState, point.index);
    const nextPoint = nextDraftState.active.rally.draftItems.find((item) => item.uiId === uiId) ?? null;
    const draftState = nextPoint ? selectTypedDraftIndex(nextDraftState, "rally", nextPoint.index) : nextDraftState;
    const rallySelection = nextPoint
      ? ({ kind: "point", pointUiId: uiId } satisfies MissionPlannerRallySelection)
      : ({ kind: "none" } satisfies MissionPlannerRallySelection);

    store.update((current) => withResolvedPhase({
      ...current,
      draftState,
      rallySelection,
      blockedReason: null,
      blockedMode: null,
      blockedWarningTarget: null,
      dismissedWarningIds: clearDismissedWarningIds(current.dismissedWarningIds, ["blocked:"]),
      validationIssues: [],
    }));

    return {
      status: "applied",
      target: rallySelection.kind === "point" ? "point" : "none",
      pointUiId: rallySelection.kind === "point" ? rallySelection.pointUiId : null,
    };
  }

  function moveRallyPointUpByUiId(uiId: number): MissionPlannerRallyMutationResult {
    return applyRallyPointEditByUiId(uiId, "Rally reordering", (draftState, pointIndex) => moveTypedUp(draftState, "rally", pointIndex));
  }

  function moveRallyPointDownByUiId(uiId: number): MissionPlannerRallyMutationResult {
    return applyRallyPointEditByUiId(uiId, "Rally reordering", (draftState, pointIndex) => moveTypedDown(draftState, "rally", pointIndex));
  }

  function updateRallyPointLatitudeByUiId(uiId: number, latitudeDeg: number): MissionPlannerRallyMutationResult {
    if (!parseLatitude(latitudeDeg).ok) {
      store.update((current) => withBlockedReason(current, "Ignored the rally latitude edit because the coordinate was invalid.", {
        kind: "rally-point",
        pointUiId: uiId,
      }));
      return rejectedRallyMutation("invalid-coordinate", "Ignored the rally latitude edit because the coordinate was invalid.");
    }

    return applyRallyPointEditByUiId(uiId, "Rally edits", (draftState, pointIndex) => updateTypedLatitude(draftState, "rally", pointIndex, latitudeDeg));
  }

  function updateRallyPointLongitudeByUiId(uiId: number, longitudeDeg: number): MissionPlannerRallyMutationResult {
    if (!parseLongitude(longitudeDeg).ok) {
      store.update((current) => withBlockedReason(current, "Ignored the rally longitude edit because the coordinate was invalid.", {
        kind: "rally-point",
        pointUiId: uiId,
      }));
      return rejectedRallyMutation("invalid-coordinate", "Ignored the rally longitude edit because the coordinate was invalid.");
    }

    return applyRallyPointEditByUiId(uiId, "Rally edits", (draftState, pointIndex) => updateTypedLongitude(draftState, "rally", pointIndex, longitudeDeg));
  }

  function updateRallyPointAltitudeByUiId(uiId: number, altitudeM: number): MissionPlannerRallyMutationResult {
    if (!Number.isFinite(altitudeM)) {
      store.update((current) => withBlockedReason(current, "Ignored the rally altitude edit because the value was not finite.", {
        kind: "rally-point",
        pointUiId: uiId,
      }));
      return rejectedRallyMutation("invalid-altitude", "Ignored the rally altitude edit because the value was not finite.");
    }

    return applyRallyPointEditByUiId(uiId, "Rally edits", (draftState, pointIndex) => updateTypedAltitude(draftState, "rally", pointIndex, altitudeM));
  }

  function updateRallyPointAltitudeFrameByUiId(
    uiId: number,
    frame: "msl" | "rel_home" | "terrain" | string,
  ): MissionPlannerRallyMutationResult {
    if (frame !== "msl" && frame !== "rel_home" && frame !== "terrain") {
      store.update((current) => withBlockedReason(current, "Ignored the rally altitude-frame edit because the requested frame is unsupported.", {
        kind: "rally-point",
        pointUiId: uiId,
      }));
      return rejectedRallyMutation("invalid-altitude-frame", "Ignored the rally altitude-frame edit because the requested frame is unsupported.");
    }

    return applyRallyPointEditByUiId(uiId, "Rally edits", (draftState, pointIndex) => updateRallyAltitudeFrame(draftState, pointIndex, frame));
  }

  function moveRallyPointOnMapByUiId(
    uiId: number,
    latitudeDeg: number,
    longitudeDeg: number,
  ): MissionPlannerMapMoveResult {
    if (!isCoordinatePairValid(latitudeDeg, longitudeDeg)) {
      store.update((current) => withBlockedReason(current, "Ignored the rally drag because the map emitted invalid coordinates.", {
        kind: "rally-point",
        pointUiId: uiId,
      }));
      return rejectedMapMove("invalid-coordinate", "Ignored the rally drag because the map emitted invalid coordinates.");
    }

    const state = get(store);
    if (!canEditWorkspace(state)) {
      store.update((current) => withBlockedReason(current, readOnlyMutationMessage(current, "Rally drags"), {
        kind: "rally-point",
        pointUiId: uiId,
      }));
      return rejectedMapMove("item-read-only", readOnlyMutationMessage(state, "Rally drags"));
    }

    const point = state.draftState.active.rally.draftItems.find((item) => item.uiId === uiId);
    if (!point) {
      store.update((current) => withBlockedReason(current, "Ignored a stale rally drag because that point is no longer present in the active draft.", {
        kind: "rally-point",
        pointUiId: uiId,
      }));
      return rejectedMapMove("item-not-found", "Ignored a stale rally drag because that point is no longer present in the active draft.");
    }

    store.update((current) => withResolvedPhase({
      ...current,
      draftState: selectTypedDraftIndex(
        moveTypedWaypointOnMap(current.draftState, "rally", point.index, latitudeDeg, longitudeDeg),
        "rally",
        point.index,
      ),
      rallySelection: { kind: "point", pointUiId: uiId },
      validationIssues: [],
      blockedReason: null,
      blockedMode: null,
      blockedWarningTarget: null,
      dismissedWarningIds: clearDismissedWarningIds(current.dismissedWarningIds, ["blocked:"]),
    }));

    return {
      status: "applied",
      target: "rally-point",
      uiId,
      latitude_deg: latitudeDeg,
      longitude_deg: longitudeDeg,
    };
  }

  function beginImportReview(
    source: MissionPlannerImportSource,
    fileName: string | null,
    warnings: string[],
    incomingWorkspace: MissionPlannerWorkspace,
  ) {
    store.update((state) => withResolvedPhase({
      ...state,
      activeAction: null,
      pendingImportReview: {
        source,
        fileName,
        warnings: [...warnings],
        incomingWorkspace,
        choices: buildImportReviewChoices(captureActiveWorkspace(state), incomingWorkspace),
      },
      blockedReason: null,
      blockedMode: null,
      blockedWarningTarget: null,
      dismissedWarningIds: clearDismissedWarningIds(state.dismissedWarningIds, ["blocked:"]),
    }));
  }

  function setImportReviewChoice(domain: MissionPlannerImportDomain, replace: boolean) {
    store.update((state) => {
      if (!state.pendingImportReview) {
        return state;
      }

      return withResolvedPhase({
        ...state,
        pendingImportReview: {
          ...state.pendingImportReview,
          choices: state.pendingImportReview.choices.map((choice) => choice.domain === domain
            ? { ...choice, replace }
            : choice),
        },
        blockedReason: null,
      blockedMode: null,
      blockedWarningTarget: null,
      });
    });
  }

  async function confirmImportReview() {
    const review = get(store).pendingImportReview;
    if (!review) {
      return { status: "noop" as const };
    }

    const state = get(store);
    const mergedPair = mergeWorkspaceWithImportReview(
      captureActiveWorkspace(state),
      captureSnapshotWorkspace(state),
      review,
    );

    store.update((current) => withResolvedPhase({
      ...applyWorkspacePair(current, mergedPair, currentScope(current)),
      pendingImportReview: null,
      fileWarnings: [...review.warnings],
      dismissedWarningIds: clearDismissedWarningIds(current.dismissedWarningIds, ["file-warning:", "blocked:"]),
      blockedReason: null,
      blockedMode: null,
      blockedWarningTarget: null,
    }));

    return {
      status: "applied" as const,
      source: review.source,
      fileName: review.fileName,
      warningCount: review.warnings.length,
    };
  }

  function dismissImportReview() {
    store.update((state) => withResolvedPhase({
      ...state,
      pendingImportReview: null,
      blockedReason: null,
      blockedMode: null,
      blockedWarningTarget: null,
    }));
  }

  function setExportReviewChoice(domain: MissionPlannerImportDomain, selected: boolean) {
    store.update((state) => {
      if (!state.pendingExportReview) {
        return state;
      }

      return withResolvedPhase({
        ...state,
        pendingExportReview: {
          ...state.pendingExportReview,
          choices: state.pendingExportReview.choices.map((choice) => choice.domain === domain
            ? { ...choice, selected }
            : choice),
        },
        blockedReason: null,
      blockedMode: null,
      blockedWarningTarget: null,
      });
    });
  }

  function dismissExportReview() {
    store.update((state) => withResolvedPhase({
      ...state,
      pendingExportReview: null,
      blockedReason: null,
      blockedMode: null,
      blockedWarningTarget: null,
    }));
  }

  async function runExportToPicker(
    pending: PendingActionScope,
    selectedDomains: MissionPlannerImportDomain[],
  ) {
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
        excludeDomains: ALL_IMPORT_DOMAINS.filter((domain) => !selectedDomains.includes(domain)),
      });
      if (!isCurrentAction(pending)) {
        return { status: "stale" as const };
      }

      if (result.status === "cancelled") {
        clearAction(pending);
        return { status: "cancelled" as const };
      }

      store.update((current) => withResolvedPhase({
        ...current,
        activeAction: null,
        pendingExportReview: null,
        fileWarnings: [...result.warnings],
        dismissedWarningIds: clearDismissedWarningIds(current.dismissedWarningIds, ["file-warning:", "blocked:"]),
        blockedReason: null,
      blockedMode: null,
      blockedWarningTarget: null,
      }));

      return {
        status: "success" as const,
        fileName: result.fileName,
        warningCount: result.warningCount,
      };
    } catch (error) {
      handleActionFailure("export", pending, error, false);
      return { status: "error" as const };
    }
  }

  async function confirmExportReview() {
    const review = get(store).pendingExportReview;
    if (!review) {
      return { status: "noop" as const };
    }

    const selectedDomains = review.choices.filter((choice) => choice.selected).map((choice) => choice.domain);
    if (selectedDomains.length === 0) {
      store.update((state) => withBlockedReason(state, "Choose at least one planning domain before exporting a .plan file."));
      return { status: "blocked" as const };
    }

    const pending = beginAction("export", false);
    return runExportToPicker(pending, selectedDomains);
  }

  async function downloadFromVehicle(force = false) {
    const state = get(store);
    if (!canUseVehicleActions(state)) {
      store.update((current) => withBlockedReason(current, blockedVehicleActionMessage(current, "Reading from the vehicle")));
      return { status: "blocked" as const };
    }

    const pending = beginAction("download", true);

    try {
      const downloaded = await withTimeout(
        service.downloadWorkspace(),
        actionTimeoutMs,
        new Error("Mission download timed out. The transfer is still pending; cancel it or wait for the vehicle to respond."),
      );
      if (!isCurrentAction(pending)) {
        return { status: "stale" as const };
      }

      const incomingWorkspace = workspaceFromTransfer(downloaded);
      const latestState = get(store);
      if (plannerIsDirty(latestState) && !force) {
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
        return { status: "prompted" as const, action: "download" as const };
      }

      store.update((current) => withResolvedPhase({
        ...applyWorkspacePair(current, {
          active: incomingWorkspace,
          snapshot: incomingWorkspace,
        }, currentScope(current)),
        replacePrompt: null,
        pendingImportReview: null,
        pendingExportReview: null,
        blockedReason: null,
      blockedMode: null,
      blockedWarningTarget: null,
      }));
      return { status: "success" as const };
    } catch (error) {
      handleActionFailure("download", pending, error, true);
      return { status: "error" as const };
    }
  }

  async function importFromPicker() {
    const pending = beginAction("import", false);

    try {
      const imported = await fileIo.importFromPicker();
      if (!isCurrentAction(pending)) {
        return { status: "stale" as const };
      }

      if (imported.status === "cancelled") {
        clearAction(pending);
        return { status: "cancelled" as const };
      }

      const incomingWorkspace = workspaceFromImport(imported.data);
      const state = get(store);
      const requiresReview = imported.warningCount > 0
        || plannerIsDirty(state)
        || buildImportReviewChoices(captureActiveWorkspace(state), incomingWorkspace).length > 1;

      if (requiresReview) {
        beginImportReview("plan", imported.fileName, imported.warnings, incomingWorkspace);
        return {
          status: "prompted" as const,
          action: "import" as const,
          fileName: imported.fileName,
          warningCount: imported.warningCount,
        };
      }

      store.update((current) => withResolvedPhase({
        ...applyWorkspacePair(current, {
          active: incomingWorkspace,
          snapshot: incomingWorkspace,
        }, currentScope(current)),
        fileWarnings: [...imported.warnings],
        dismissedWarningIds: clearDismissedWarningIds(current.dismissedWarningIds, ["file-warning:", "blocked:"]),
        blockedReason: null,
      blockedMode: null,
      blockedWarningTarget: null,
      }));

      return {
        status: "success" as const,
        fileName: imported.fileName,
        warningCount: imported.warningCount,
      };
    } catch (error) {
      handleActionFailure("import", pending, error, false);
      return { status: "error" as const };
    }
  }

  async function importKmlFromPicker() {
    const pending = beginAction("import", false);

    try {
      const imported = await kmlFileIo.importFromPicker();
      if (!isCurrentAction(pending)) {
        return { status: "stale" as const };
      }

      if (imported.status === "cancelled") {
        clearAction(pending);
        return { status: "cancelled" as const };
      }

      const incomingWorkspace = workspaceFromKmlImport(imported.data);
      beginImportReview(imported.source, imported.fileName, imported.warnings, incomingWorkspace);

      return {
        status: "prompted" as const,
        action: "import" as const,
        fileName: imported.fileName,
        warningCount: imported.warningCount,
        source: imported.source,
      };
    } catch (error) {
      handleActionFailure("import", pending, error, false);
      return { status: "error" as const };
    }
  }

  async function exportToPicker() {
    const choices = buildExportReviewChoices(captureActiveWorkspace(get(store)));
    if (choices.length === 0) {
      return { status: "noop" as const };
    }

    if (choices.length > 1) {
      store.update((state) => withResolvedPhase({
        ...state,
        pendingExportReview: {
          choices,
        },
        blockedReason: null,
      blockedMode: null,
      blockedWarningTarget: null,
      }));
      return { status: "prompted" as const, action: "export" as const };
    }

    const pending = beginAction("export", false);
    return runExportToPicker(pending, [choices[0]!.domain]);
  }

  async function validateCurrentMission() {
    const state = get(store);
    if (!canUseVehicleActions(state)) {
      store.update((current) => withBlockedReason(current, blockedVehicleActionMessage(current, "Mission validation")));
      return { status: "blocked" as const };
    }

    const pending = beginAction("validate", false);

    try {
      const latestState = get(store);
      const issues = await withTimeout(
        service.validateMission(activeTransferMissionPlan(latestState)),
        actionTimeoutMs,
        new Error("Mission validation timed out. Review the pending transfer state and retry when the vehicle responds."),
      );
      if (!isCurrentAction(pending)) {
        return { status: "stale" as const };
      }

      store.update((current) => withResolvedPhase({
        ...current,
        activeAction: null,
        validationIssues: issues,
        dismissedWarningIds: clearDismissedWarningIds(current.dismissedWarningIds, ["validation-issue:", "blocked:"]),
        blockedReason: null,
      blockedMode: null,
      blockedWarningTarget: null,
      }));
      return { status: "success" as const, issueCount: issues.length };
    } catch (error) {
      handleActionFailure("validate", pending, error, false);
      return { status: "error" as const };
    }
  }

  async function uploadToVehicle() {
    const state = get(store);
    if (!canUseVehicleActions(state)) {
      store.update((current) => withBlockedReason(current, blockedVehicleActionMessage(current, "Uploading to the vehicle")));
      return { status: "blocked" as const };
    }

    const pending = beginAction("upload", true);

    try {
      const latestState = get(store);
      await withTimeout(
        service.uploadWorkspace({
          mission: activeTransferMissionPlan(latestState),
          fence: typedDraftPlan(latestState.draftState, "fence"),
          rally: typedDraftPlan(latestState.draftState, "rally"),
          home: cloneValue(latestState.home),
        }),
        actionTimeoutMs,
        new Error("Mission upload timed out. The transfer is still pending; cancel it or wait for the vehicle to respond."),
      );
      if (!isCurrentAction(pending)) {
        return { status: "stale" as const };
      }

      store.update((current) => withResolvedPhase({
        ...current,
        activeAction: null,
        blockedReason: null,
      blockedMode: null,
      blockedWarningTarget: null,
      }));
      return { status: "success" as const };
    } catch (error) {
      handleActionFailure("upload", pending, error, true);
      return { status: "error" as const };
    }
  }

  async function clearVehicle(force = false) {
    const state = get(store);
    if (!canUseVehicleActions(state)) {
      store.update((current) => withBlockedReason(current, blockedVehicleActionMessage(current, "Clearing the vehicle workspace")));
      return { status: "blocked" as const };
    }

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
      return { status: "prompted" as const };
    }

    const pending = beginAction("clear", true);

    try {
      await withTimeout(
        service.clearWorkspace(),
        actionTimeoutMs,
        new Error("Mission clear timed out. The transfer is still pending; cancel it or wait for the vehicle to respond."),
      );
      if (!isCurrentAction(pending)) {
        return { status: "stale" as const };
      }

      store.update((current) => withResolvedPhase({
        ...applyWorkspacePair(current, {
          active: createEmptyMissionPlannerWorkspace(),
          snapshot: createEmptyMissionPlannerWorkspace(),
        }, currentScope(current)),
        replacePrompt: null,
        pendingImportReview: null,
        pendingExportReview: null,
        blockedReason: null,
      blockedMode: null,
      blockedWarningTarget: null,
      }));
      return { status: "cleared" as const };
    } catch (error) {
      handleActionFailure("clear", pending, error, true);
      return { status: "error" as const };
    }
  }

  async function cancelTransfer() {
    try {
      await service.cancelTransfer();
      actionRequestId += 1;
      store.update((state) => withResolvedPhase({
        ...state,
        activeAction: null,
      }));
      return { status: "cancelled" as const };
    } catch (error) {
      store.update((state) => withResolvedPhase({
        ...state,
        lastError: service.formatError(error),
        dismissedWarningIds: clearDismissedWarningIds(state.dismissedWarningIds, ["last-error:"]),
      }));
      return { status: "error" as const };
    }
  }

  async function confirmReplacePrompt() {
    const prompt = get(store).replacePrompt;
    if (!prompt) {
      return { status: "noop" as const };
    }

    if (prompt.kind === "recoverable") {
      store.update((state) => {
        const recoverable = state.recoverableWorkspace;
        if (!recoverable || !scopeMatchesIdentity(recoverable.scope, currentScope(state))) {
          return withResolvedPhase({
            ...state,
            replacePrompt: null,
          });
        }

        return withResolvedPhase({
          ...applyWorkspacePair(state, recoverable, currentScope(state)),
          recoverableWorkspace: null,
          replacePrompt: null,
          blockedReason: null,
      blockedMode: null,
      blockedWarningTarget: null,
        });
      });
      return { status: "restored" as const };
    }

    if (prompt.action === "clear") {
      store.update((state) => withResolvedPhase({
        ...state,
        replacePrompt: null,
      }));
      return clearVehicle(true);
    }

    const incomingWorkspace = prompt.incomingWorkspace;
    if (!incomingWorkspace) {
      return { status: "noop" as const };
    }

    store.update((state) => withResolvedPhase({
      ...applyWorkspacePair(state, {
        active: incomingWorkspace,
        snapshot: incomingWorkspace,
      }, currentScope(state)),
      replacePrompt: null,
      fileWarnings: [...prompt.fileWarnings],
      dismissedWarningIds: clearDismissedWarningIds(state.dismissedWarningIds, ["file-warning:", "blocked:"]),
      blockedReason: null,
      blockedMode: null,
      blockedWarningTarget: null,
    }));

    return {
      status: "replaced" as const,
      action: prompt.action,
      warningCount: prompt.fileWarnings.length,
      fileName: prompt.fileName,
    };
  }

  function dismissReplacePrompt() {
    store.update((state) => withResolvedPhase({
      ...state,
      replacePrompt: null,
    }));
  }

  async function confirmSurveyPrompt() {
    const prompt = get(store).surveyPrompt;
    if (!prompt) {
      return { status: "noop" as const };
    }

    updateSurveyState((survey) => survey, { surveyPrompt: null, allowWhenReadOnly: true });

    if (prompt.kind === "confirm-regenerate") {
      return generateSurveyRegion(prompt.regionId, true);
    }

    return dissolveSurveyRegionToMissionItems(prompt.regionId);
  }

  function dismissSurveyPrompt() {
    updateSurveyState((survey) => survey, { surveyPrompt: null, allowWhenReadOnly: true });
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
      surveyPrompt: null,
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
      dismissedWarningIds: clearDismissedWarningIds(state.dismissedWarningIds, ["last-error:"]),
    }));
  }

  function isCurrentAction(scope: PendingActionScope): boolean {
    const current = get(store);
    return actionRequestId === scope.requestId
      && areEnvelopesEqual(current.activeEnvelope, scope.envelope);
  }

  function dismissWarning(id: string) {
    store.update((state) => {
      if (id.startsWith("last-error:")) {
        return withResolvedPhase({
          ...state,
          lastError: null,
        });
      }

      if (id.startsWith("blocked:")) {
        return withResolvedPhase({
          ...state,
          blockedReason: null,
      blockedMode: null,
      blockedWarningTarget: null,
        });
      }

      return state.dismissedWarningIds.includes(id)
        ? state
        : withResolvedPhase({
          ...state,
          dismissedWarningIds: [...state.dismissedWarningIds, id],
        });
    });
  }

  return {
    subscribe: store.subscribe,
    initialize,
    setMode,
    dismissWarning,
    replaceWorkspace,
    selectHome,
    selectMissionItem,
    selectMissionItemByUiId,
    selectSurveyRegion,
    selectFenceRegionByUiId,
    selectFenceReturnPoint,
    selectRallyPointByUiId,
    addMissionItem,
    addFenceRegion,
    addRallyPoint,
    deleteMissionItem,
    deleteFenceRegionByUiId,
    deleteRallyPointByUiId,
    moveMissionItemUpByIndex,
    moveMissionItemDownByIndex,
    moveRallyPointUpByUiId,
    moveRallyPointDownByUiId,
    updateMissionItemCommand,
    updateMissionItemLatitude,
    updateMissionItemLongitude,
    updateMissionItemAltitude,
    updateFenceRegionByUiId,
    updateRallyPointLatitudeByUiId,
    updateRallyPointLongitudeByUiId,
    updateRallyPointAltitudeByUiId,
    updateRallyPointAltitudeFrameByUiId,
    moveHomeOnMap,
    moveMissionItemOnMapByUiId,
    moveRallyPointOnMapByUiId,
    moveFenceVertexByUiId,
    moveFenceCircleCenterByUiId,
    updateFenceCircleRadiusByUiId,
    setHome,
    setFenceReturnPoint,
    setPlanningSpeeds,
    replaceSurveyExtension,
    createSurveyBlock,
    updateAuthoredSurveyRegion,
    setSurveyRegionCollapsed,
    deleteSurveyRegionById,
    generateSurveyRegion,
    promptDissolveSurveyRegion,
    markSurveyRegionItemAsEdited,
    downloadFromVehicle,
    importFromPicker,
    importKmlFromPicker,
    setImportReviewChoice,
    confirmImportReview,
    dismissImportReview,
    exportToPicker,
    setExportReviewChoice,
    confirmExportReview,
    dismissExportReview,
    validateCurrentMission,
    uploadToVehicle,
    clearVehicle,
    cancelTransfer,
    confirmReplacePrompt,
    dismissReplacePrompt,
    confirmSurveyPrompt,
    dismissSurveyPrompt,
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

export function resolveMissionPlannerAttachment(state: MissionPlannerStoreState): MissionPlannerAttachmentState {
  const draftScope = attachedDraftScope(state);

  if (state.activeEnvelope?.source_kind === "playback") {
    return {
      kind: "playback-readonly",
      label: "Playback read-only",
      detail: "Playback keeps the planner mounted for inspection, but vehicle actions and in-place draft edits stay blocked until you return to a live scope.",
      readOnly: true,
      canEdit: false,
      canUseVehicleActions: false,
    };
  }

  if (!state.workspaceMounted && state.activeEnvelope) {
    return {
      kind: "live-attached",
      label: "Live attached",
      detail: "A live session is available. Read from the vehicle, import a file, or start a new draft to mount the workspace in this scope.",
      readOnly: false,
      canEdit: true,
      canUseVehicleActions: true,
    };
  }

  if (state.activeEnvelope && scopeMatchesExact(scopeFromEnvelope(state.activeEnvelope), draftScope)) {
    return {
      kind: "live-attached",
      label: "Live attached",
      detail: "This draft belongs to the active live scope, so validation, upload, and clear actions stay available.",
      readOnly: false,
      canEdit: true,
      canUseVehicleActions: true,
    };
  }

  if (!state.activeEnvelope) {
    if (draftScope.session_id === "") {
      return {
        kind: "local-draft",
        label: "Local draft",
        detail: "No vehicle session is attached. You can keep editing locally, then reconnect later for live validation and transfer flows.",
        readOnly: false,
        canEdit: true,
        canUseVehicleActions: false,
      };
    }

    return {
      kind: "detached-local",
      label: "Detached local",
      detail: "This preserved draft came from another scope. Keep it mounted for reference, but start a new/imported draft or return to the original live scope before editing again.",
      readOnly: true,
      canEdit: false,
      canUseVehicleActions: false,
    };
  }

  return {
    kind: "detached-local",
    label: "Detached local",
    detail: `The planner kept the previous draft mounted instead of pretending it matches ${plannerScopeLabel({ activeEnvelope: state.activeEnvelope })}. Read from the vehicle, import a file, or start a new draft to work in this scope.`,
    readOnly: true,
    canEdit: false,
    canUseVehicleActions: false,
  };
}

function canEditWorkspace(state: MissionPlannerStoreState): boolean {
  return resolveMissionPlannerAttachment(state).canEdit;
}

function canUseVehicleActions(state: MissionPlannerStoreState): boolean {
  return resolveMissionPlannerAttachment(state).canUseVehicleActions;
}

function readOnlyMutationMessage(state: MissionPlannerStoreState, noun: string): string {
  const attachment = resolveMissionPlannerAttachment(state);
  return attachment.kind === "playback-readonly"
    ? `${noun} stay blocked during playback. Return to a live scope or start a new/imported draft before editing again.`
    : `${noun} stay blocked while this draft is detached from the active scope. Read from the vehicle, import a file, or start a new draft to resume editing here.`;
}

function blockedVehicleActionMessage(state: MissionPlannerStoreState, noun: string): string {
  const attachment = resolveMissionPlannerAttachment(state);
  switch (attachment.kind) {
    case "playback-readonly":
      return `${noun} is unavailable during playback. The current draft stays mounted for review only.`;
    case "detached-local":
      return `${noun} is unavailable while this draft is detached from the active live scope.`;
    case "local-draft":
      return `${noun} needs an active live session. Keep editing locally now, then reconnect when you need vehicle sync.`;
    case "live-attached":
    default:
      return `${noun} is unavailable right now.`;
  }
}

function missionBucketHasContent(workspace: MissionPlannerWorkspace): boolean {
  return workspace.mission.items.length > 0
    || workspace.survey.surveyRegionOrder.length > 0
    || workspace.home !== null;
}

function fenceBucketHasContent(workspace: MissionPlannerWorkspace): boolean {
  return workspace.fence.regions.length > 0 || workspace.fence.return_point !== null;
}

function rallyBucketHasContent(workspace: MissionPlannerWorkspace): boolean {
  return workspace.rally.points.length > 0;
}

function summarizeMissionBucket(workspace: MissionPlannerWorkspace): string {
  const parts: string[] = [];
  if (workspace.mission.items.length > 0) {
    parts.push(`${workspace.mission.items.length} mission item${workspace.mission.items.length === 1 ? "" : "s"}`);
  }
  if (workspace.survey.surveyRegionOrder.length > 0) {
    parts.push(`${workspace.survey.surveyRegionOrder.length} survey block${workspace.survey.surveyRegionOrder.length === 1 ? "" : "s"}`);
  }
  if (workspace.home) {
    parts.push("Home");
  }

  return parts.join(" · ") || "No mission, survey, or Home content";
}

function summarizeFenceBucket(workspace: MissionPlannerWorkspace): string {
  if (workspace.fence.regions.length === 0 && workspace.fence.return_point === null) {
    return "No fence content";
  }

  const parts: string[] = [];
  if (workspace.fence.regions.length > 0) {
    parts.push(`${workspace.fence.regions.length} fence region${workspace.fence.regions.length === 1 ? "" : "s"}`);
  }
  if (workspace.fence.return_point !== null) {
    parts.push("return point");
  }

  return parts.join(" · ");
}

function summarizeRallyBucket(workspace: MissionPlannerWorkspace): string {
  return workspace.rally.points.length > 0
    ? `${workspace.rally.points.length} rally point${workspace.rally.points.length === 1 ? "" : "s"}`
    : "No rally content";
}

function buildImportReviewChoices(
  currentWorkspace: MissionPlannerWorkspace,
  incomingWorkspace: MissionPlannerWorkspace,
): MissionPlannerImportReviewChoice[] {
  const choices: MissionPlannerImportReviewChoice[] = [];

  if (missionBucketHasContent(incomingWorkspace)) {
    choices.push({
      domain: "mission",
      label: "Mission + Home + Survey",
      replace: true,
      currentSummary: summarizeMissionBucket(currentWorkspace),
      incomingSummary: summarizeMissionBucket(incomingWorkspace),
    });
  }

  if (fenceBucketHasContent(incomingWorkspace)) {
    choices.push({
      domain: "fence",
      label: "Fence",
      replace: true,
      currentSummary: summarizeFenceBucket(currentWorkspace),
      incomingSummary: summarizeFenceBucket(incomingWorkspace),
    });
  }

  if (rallyBucketHasContent(incomingWorkspace)) {
    choices.push({
      domain: "rally",
      label: "Rally",
      replace: true,
      currentSummary: summarizeRallyBucket(currentWorkspace),
      incomingSummary: summarizeRallyBucket(incomingWorkspace),
    });
  }

  return choices;
}

function buildExportReviewChoices(workspace: MissionPlannerWorkspace): MissionPlannerExportReviewChoice[] {
  const choices: MissionPlannerExportReviewChoice[] = [];

  if (missionBucketHasContent(workspace)) {
    choices.push({
      domain: "mission",
      label: "Mission + Home + Survey",
      selected: true,
      summary: summarizeMissionBucket(workspace),
    });
  }

  if (fenceBucketHasContent(workspace)) {
    choices.push({
      domain: "fence",
      label: "Fence",
      selected: true,
      summary: summarizeFenceBucket(workspace),
    });
  }

  if (rallyBucketHasContent(workspace)) {
    choices.push({
      domain: "rally",
      label: "Rally",
      selected: true,
      summary: summarizeRallyBucket(workspace),
    });
  }

  return choices;
}

function mergeWorkspaceWithImportReview(
  activeWorkspace: MissionPlannerWorkspace,
  snapshotWorkspace: MissionPlannerWorkspace,
  review: MissionPlannerImportReview,
): Pick<RecoverableMissionPlannerWorkspace, "active" | "snapshot"> {
  const replaceDomains = new Set(review.choices.filter((choice) => choice.replace).map((choice) => choice.domain));
  const incoming = review.incomingWorkspace;

  return {
    active: {
      mission: replaceDomains.has("mission") ? cloneValue(incoming.mission) : cloneValue(activeWorkspace.mission),
      fence: replaceDomains.has("fence") ? cloneValue(incoming.fence) : cloneValue(activeWorkspace.fence),
      rally: replaceDomains.has("rally") ? cloneValue(incoming.rally) : cloneValue(activeWorkspace.rally),
      home: replaceDomains.has("mission") ? cloneValue(incoming.home) : cloneValue(activeWorkspace.home),
      survey: replaceDomains.has("mission") ? cloneValue(incoming.survey) : cloneValue(activeWorkspace.survey),
      cruiseSpeed: replaceDomains.has("mission") ? incoming.cruiseSpeed : activeWorkspace.cruiseSpeed,
      hoverSpeed: replaceDomains.has("mission") ? incoming.hoverSpeed : activeWorkspace.hoverSpeed,
    },
    snapshot: {
      mission: replaceDomains.has("mission") ? cloneValue(incoming.mission) : cloneValue(snapshotWorkspace.mission),
      fence: replaceDomains.has("fence") ? cloneValue(incoming.fence) : cloneValue(snapshotWorkspace.fence),
      rally: replaceDomains.has("rally") ? cloneValue(incoming.rally) : cloneValue(snapshotWorkspace.rally),
      home: replaceDomains.has("mission") ? cloneValue(incoming.home) : cloneValue(snapshotWorkspace.home),
      survey: replaceDomains.has("mission") ? cloneValue(incoming.survey) : cloneValue(snapshotWorkspace.survey),
      cruiseSpeed: replaceDomains.has("mission") ? incoming.cruiseSpeed : snapshotWorkspace.cruiseSpeed,
      hoverSpeed: replaceDomains.has("mission") ? incoming.hoverSpeed : snapshotWorkspace.hoverSpeed,
    },
  };
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

  const activeSurvey = normalizeSurveyAuthoringExtension(pair.active.survey);
  const snapshotSurvey = normalizeSurveyAuthoringExtension(pair.snapshot.survey);

  return {
    ...state,
    workspaceMounted: true,
    selection: { kind: "home" },
    fenceSelection: { kind: "none" },
    rallySelection: { kind: "none" },
    draftState,
    home: cloneValue(pair.active.home),
    homeSnapshot: cloneValue(pair.snapshot.home),
    survey: activeSurvey,
    surveySnapshot: snapshotSurvey,
    cruiseSpeed: pair.active.cruiseSpeed,
    hoverSpeed: pair.active.hoverSpeed,
    cruiseSpeedSnapshot: pair.snapshot.cruiseSpeed,
    hoverSpeedSnapshot: pair.snapshot.hoverSpeed,
    validationIssues: [],
    activeAction: null,
    surveyPrompt: null,
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

  return {
    mission: cloneValue(input.mission),
    fence: cloneValue(input.fence),
    rally: cloneValue(input.rally),
    home: cloneValue(input.home),
    survey: normalizeSurveyAuthoringExtension(survey),
    cruiseSpeed: input.cruiseSpeed,
    hoverSpeed: input.hoverSpeed,
  };
}

function workspaceFromKmlImport(input: MissionKmlFileImportData): MissionPlannerWorkspace {
  return {
    mission: cloneValue(input.mission),
    fence: cloneValue(input.fence),
    rally: { points: [] },
    home: null,
    survey: createSurveyDraftExtension(),
    cruiseSpeed: DEFAULT_CRUISE_SPEED_MPS,
    hoverSpeed: DEFAULT_HOVER_SPEED_MPS,
  };
}

function exportSurveyRegions(extension: SurveyDraftExtension) {
  return extension.surveyRegionOrder
    .map((block, index) => ({ block, index }))
    .sort((left, right) => left.block.position - right.block.position || left.index - right.index)
    .flatMap(({ block }) => {
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
  return extension.surveyRegionOrder
    .map((block, index) => ({ block, index }))
    .sort((left, right) => left.block.position - right.block.position || left.index - right.index)
    .map(({ block }) => {
      const region = extension.surveyRegions.get(block.regionId);
      let exportable: ReturnType<typeof toExportableSurveyRegion> | null = null;
      let exportError: string | null = null;

      if (region) {
        try {
          exportable = toExportableSurveyRegion(region, block.position);
        } catch (error) {
          exportError = error instanceof Error ? error.message : String(error);
        }
      }

      return {
        position: block.position,
        regionId: block.regionId,
        importWarnings: region?.importWarnings ?? [],
        generationState: region?.generationState ?? "idle",
        generationMessage: region?.generationMessage ?? null,
        exportable,
        exportError,
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
  return state.activeEnvelope ? scopeFromEnvelope(state.activeEnvelope) : attachedDraftScope(state);
}

function attachedDraftScope(state: MissionPlannerStoreState): SessionScope {
  return state.draftState.active.mission.scope;
}

function scopeMatchesIdentity(left: SessionScope, right: SessionScope): boolean {
  return left.session_id === right.session_id && left.source_kind === right.source_kind;
}

function scopeMatchesExact(left: SessionScope, right: SessionScope): boolean {
  return scopeMatchesIdentity(left, right)
    && left.seek_epoch === right.seek_epoch
    && left.reset_revision === right.reset_revision;
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

function clearDismissedWarningIds(ids: string[], prefixes: string[]): string[] {
  return ids.filter((id) => !prefixes.some((prefix) => id.startsWith(prefix)));
}

function withResolvedPhase(state: MissionPlannerStoreState): MissionPlannerStoreState {
  const normalized = normalizeRallySelectionState(normalizeFenceSelectionState(normalizeSelection(state)));
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

function normalizeFenceSelectionState(state: MissionPlannerStoreState): MissionPlannerStoreState {
  if (state.fenceSelection.kind === "none") {
    return state;
  }

  const selectedFenceRegion = typedDraftSelectedItem(state.draftState, "fence");
  const hasReturnPoint = state.draftState.active.fence.document.return_point !== null;

  if (state.fenceSelection.kind === "return-point") {
    return hasReturnPoint
      ? state
      : selectedFenceRegion
        ? {
          ...state,
          fenceSelection: { kind: "region", regionUiId: selectedFenceRegion.uiId },
        }
        : {
          ...state,
          fenceSelection: { kind: "none" },
        };
  }

  const selectedRegionUiId = state.fenceSelection.kind === "region" ? state.fenceSelection.regionUiId : null;
  const hasSelectedRegion = selectedRegionUiId !== null
    && state.draftState.active.fence.draftItems.some((item) => item.uiId === selectedRegionUiId);
  if (hasSelectedRegion) {
    return state;
  }

  return selectedFenceRegion
    ? {
      ...state,
      fenceSelection: { kind: "region", regionUiId: selectedFenceRegion.uiId },
    }
    : hasReturnPoint
      ? {
        ...state,
        fenceSelection: { kind: "return-point" },
      }
      : {
        ...state,
        fenceSelection: { kind: "none" },
      };
}

function warningTargetFromFenceSelection(
  selection: MissionPlannerFenceSelection,
): MissionPlannerWarningActionTarget | null {
  if (selection.kind === "region") {
    return { kind: "fence-region", regionUiId: selection.regionUiId };
  }

  if (selection.kind === "return-point") {
    return { kind: "fence-return-point" };
  }

  return null;
}

function normalizeRallySelectionState(state: MissionPlannerStoreState): MissionPlannerStoreState {
  if (state.rallySelection.kind === "none") {
    return state;
  }

  const selectedRallyPoint = typedDraftSelectedItem(state.draftState, "rally");
  const selectedPointUiId = state.rallySelection.kind === "point" ? state.rallySelection.pointUiId : null;
  const hasSelectedPoint = selectedPointUiId !== null
    && state.draftState.active.rally.draftItems.some((item) => item.uiId === selectedPointUiId);
  if (hasSelectedPoint) {
    return state;
  }

  return selectedRallyPoint
    ? {
      ...state,
      rallySelection: { kind: "point", pointUiId: selectedRallyPoint.uiId },
    }
    : {
      ...state,
      rallySelection: { kind: "none" },
    };
}

function warningTargetFromRallySelection(
  selection: MissionPlannerRallySelection,
): MissionPlannerWarningActionTarget | null {
  if (selection.kind === "point") {
    return { kind: "rally-point", pointUiId: selection.pointUiId };
  }

  return null;
}

function warningTargetFromMode(
  mode: MissionPlannerMode,
  state: Pick<MissionPlannerStoreState, "fenceSelection" | "rallySelection">,
): MissionPlannerWarningActionTarget | null {
  if (mode === "fence") {
    return warningTargetFromFenceSelection(state.fenceSelection);
  }

  if (mode === "rally") {
    return warningTargetFromRallySelection(state.rallySelection);
  }

  return null;
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

  if (state.pendingImportReview) {
    return "reviewing-import";
  }

  if (state.pendingExportReview) {
    return "reviewing-export";
  }

  if (state.replacePrompt) {
    return "replace-prompt";
  }

  if (!state.sessionHydrated || state.sessionPhase === "subscribing" || state.sessionPhase === "bootstrapping") {
    return "bootstrapping";
  }

  if (!state.activeEnvelope && !state.workspaceMounted) {
    return "unavailable";
  }

  if (state.activeEnvelope && !state.streamReady && state.missionState === null) {
    return "stream-error";
  }

  return "ready";
}

function resolveFenceAnchorPoint(state: MissionPlannerStoreState): GeoPoint2d {
  const selectedFenceRegionUiId = state.fenceSelection.kind === "region" ? state.fenceSelection.regionUiId : null;
  if (selectedFenceRegionUiId !== null) {
    const selectedFenceRegion = state.draftState.active.fence.draftItems.find((item) => item.uiId === selectedFenceRegionUiId);
    if (
      selectedFenceRegion
      && selectedFenceRegion.preview.latitude_deg !== null
      && selectedFenceRegion.preview.longitude_deg !== null
    ) {
      return {
        latitude_deg: selectedFenceRegion.preview.latitude_deg,
        longitude_deg: selectedFenceRegion.preview.longitude_deg,
      };
    }
  }

  if (state.draftState.active.fence.document.return_point) {
    return cloneValue(state.draftState.active.fence.document.return_point);
  }

  if (state.home) {
    return {
      latitude_deg: state.home.latitude_deg,
      longitude_deg: state.home.longitude_deg,
    };
  }

  const selectedMissionItem = typedDraftSelectedItem(state.draftState, "mission");
  if (
    selectedMissionItem
    && selectedMissionItem.preview.latitude_deg !== null
    && selectedMissionItem.preview.longitude_deg !== null
  ) {
    return {
      latitude_deg: selectedMissionItem.preview.latitude_deg,
      longitude_deg: selectedMissionItem.preview.longitude_deg,
    };
  }

  const firstMissionItem = state.draftState.active.mission.draftItems.find(
    (item) => item.preview.latitude_deg !== null && item.preview.longitude_deg !== null,
  );
  if (
    firstMissionItem
    && firstMissionItem.preview.latitude_deg !== null
    && firstMissionItem.preview.longitude_deg !== null
  ) {
    return {
      latitude_deg: firstMissionItem.preview.latitude_deg,
      longitude_deg: firstMissionItem.preview.longitude_deg,
    };
  }

  const firstFenceItem = state.draftState.active.fence.draftItems.find(
    (item) => item.preview.latitude_deg !== null && item.preview.longitude_deg !== null,
  );
  if (
    firstFenceItem
    && firstFenceItem.preview.latitude_deg !== null
    && firstFenceItem.preview.longitude_deg !== null
  ) {
    return {
      latitude_deg: firstFenceItem.preview.latitude_deg,
      longitude_deg: firstFenceItem.preview.longitude_deg,
    };
  }

  return {
    latitude_deg: 47.397742,
    longitude_deg: 8.545594,
  };
}

function resolveRallyAnchorPoint(state: MissionPlannerStoreState): GeoPoint2d {
  const selectedRallyPointUiId = state.rallySelection.kind === "point" ? state.rallySelection.pointUiId : null;
  if (selectedRallyPointUiId !== null) {
    const selectedRallyPoint = state.draftState.active.rally.draftItems.find((item) => item.uiId === selectedRallyPointUiId);
    if (
      selectedRallyPoint
      && selectedRallyPoint.preview.latitude_deg !== null
      && selectedRallyPoint.preview.longitude_deg !== null
    ) {
      return {
        latitude_deg: selectedRallyPoint.preview.latitude_deg,
        longitude_deg: selectedRallyPoint.preview.longitude_deg,
      };
    }
  }

  if (state.home) {
    return {
      latitude_deg: state.home.latitude_deg,
      longitude_deg: state.home.longitude_deg,
    };
  }

  const selectedMissionItem = typedDraftSelectedItem(state.draftState, "mission");
  if (
    selectedMissionItem
    && selectedMissionItem.preview.latitude_deg !== null
    && selectedMissionItem.preview.longitude_deg !== null
  ) {
    return {
      latitude_deg: selectedMissionItem.preview.latitude_deg,
      longitude_deg: selectedMissionItem.preview.longitude_deg,
    };
  }

  const firstMissionItem = state.draftState.active.mission.draftItems.find(
    (item) => item.preview.latitude_deg !== null && item.preview.longitude_deg !== null,
  );
  if (
    firstMissionItem
    && firstMissionItem.preview.latitude_deg !== null
    && firstMissionItem.preview.longitude_deg !== null
  ) {
    return {
      latitude_deg: firstMissionItem.preview.latitude_deg,
      longitude_deg: firstMissionItem.preview.longitude_deg,
    };
  }

  const firstRallyPoint = state.draftState.active.rally.draftItems.find(
    (item) => item.preview.latitude_deg !== null && item.preview.longitude_deg !== null,
  );
  if (
    firstRallyPoint
    && firstRallyPoint.preview.latitude_deg !== null
    && firstRallyPoint.preview.longitude_deg !== null
  ) {
    return {
      latitude_deg: firstRallyPoint.preview.latitude_deg,
      longitude_deg: firstRallyPoint.preview.longitude_deg,
    };
  }

  const firstFenceReturnPoint = state.draftState.active.fence.document.return_point;
  if (firstFenceReturnPoint) {
    return cloneValue(firstFenceReturnPoint);
  }

  const firstFenceItem = state.draftState.active.fence.draftItems.find(
    (item) => item.preview.latitude_deg !== null && item.preview.longitude_deg !== null,
  );
  if (
    firstFenceItem
    && firstFenceItem.preview.latitude_deg !== null
    && firstFenceItem.preview.longitude_deg !== null
  ) {
    return {
      latitude_deg: firstFenceItem.preview.latitude_deg,
      longitude_deg: firstFenceItem.preview.longitude_deg,
    };
  }

  return {
    latitude_deg: 47.397742,
    longitude_deg: 8.545594,
  };
}

function validateFenceRegion(region: FenceRegion): { ok: true } | { ok: false; message: string } {
  if ("inclusion_polygon" in region) {
    return validateFencePolygon(region.inclusion_polygon.vertices, "Fence inclusion polygons");
  }

  if ("exclusion_polygon" in region) {
    return validateFencePolygon(region.exclusion_polygon.vertices, "Fence exclusion polygons");
  }

  if ("inclusion_circle" in region) {
    return validateFenceCircle(region.inclusion_circle.center, region.inclusion_circle.radius_m, "Fence inclusion circles");
  }

  return validateFenceCircle(region.exclusion_circle.center, region.exclusion_circle.radius_m, "Fence exclusion circles");
}

function validateFencePolygon(
  vertices: GeoPoint2d[],
  label: string,
): { ok: true } | { ok: false; message: string } {
  if (vertices.length < 3) {
    return {
      ok: false,
      message: `${label} need at least three valid vertices before IronWing will update the active fence region.`,
    };
  }

  const invalidVertex = vertices.find((vertex) => !isCoordinatePairValid(vertex.latitude_deg, vertex.longitude_deg));
  if (invalidVertex) {
    return {
      ok: false,
      message: `${label} rejected malformed coordinates, so the previous fence geometry stayed visible and unchanged.`,
    };
  }

  return { ok: true };
}

function validateFenceCircle(
  center: GeoPoint2d,
  radiusM: number,
  label: string,
): { ok: true } | { ok: false; message: string } {
  if (!isCoordinatePairValid(center.latitude_deg, center.longitude_deg)) {
    return {
      ok: false,
      message: `${label} rejected malformed center coordinates, so the previous fence geometry stayed visible and unchanged.`,
    };
  }

  if (!Number.isFinite(radiusM) || radiusM <= 0) {
    return {
      ok: false,
      message: `${label} need a radius greater than zero before IronWing will update the active fence region.`,
    };
  }

  return { ok: true };
}

function rejectedFenceMutation(
  reason: MissionPlannerFenceMutationRejectReason,
  message: string,
): MissionPlannerFenceMutationResult {
  return {
    status: "rejected",
    reason,
    message,
  };
}

function rejectedRallyMutation(
  reason: MissionPlannerRallyMutationRejectReason,
  message: string,
): MissionPlannerRallyMutationResult {
  return {
    status: "rejected",
    reason,
    message,
  };
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
