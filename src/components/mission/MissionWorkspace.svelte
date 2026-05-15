<script lang="ts">
import { onDestroy } from "svelte";
import { fromStore, readable, type Readable } from "svelte/store";

import {
  getMissionPlannerStoreContext,
  getMissionPlannerViewStoreContext,
  getSessionViewStoreContext,
  getShellChromeStoreContext,
} from "../../app/shell/runtime-context";
import {
  captureActiveWorkspace,
  createEmptyMissionPlannerWorkspace,
  plannerHasContent,
  type MissionPlannerMode,
  type MissionPlannerStore,
  type MissionPlannerStoreState,
  type MissionPlannerWorkspace,
} from "../../lib/stores/mission-planner";
import type {
  MissionPlannerInlineStatus,
  MissionPlannerView,
  MissionPlannerWarningView,
} from "../../lib/stores/mission-planner-view";
import { buildMissionMapView, type MissionMapSelection } from "../../lib/mission-map-view";
import { missionPathPoints } from "../../lib/mission-path";
import type { ReplayMapOverlayState } from "../../lib/replay-map-overlay";
import { createMissionTerrainState } from "../../lib/mission-terrain-state";
import { localXYToLatLon } from "../../lib/mission-coordinates";
import type { FenceRegion, GeoPoint2d, GeoPoint3d } from "../../lib/mavkit-types";
import type { FenceRegionType } from "../../lib/mission-draft-typed";
import { settings, type Settings } from "../../lib/stores/settings";
import { createUiStateStore } from "../../lib/ui-state/ui-state";
import type { SurveyPatternType } from "../../lib/survey-region";
import MissionDraftList from "./MissionDraftList.svelte";
import MissionFenceDraftList from "./MissionFenceDraftList.svelte";
import MissionFenceInspector from "./MissionFenceInspector.svelte";
import MissionHomeCard from "./MissionHomeCard.svelte";
import MissionInspector from "./MissionInspector.svelte";
import MissionMap from "./MissionMap.svelte";
import MissionPlanningStatsPanel from "./MissionPlanningStatsPanel.svelte";
import MissionRallyDraftList from "./MissionRallyDraftList.svelte";
import MissionRallyInspector from "./MissionRallyInspector.svelte";
import MissionTerrainProfilePanel from "./MissionTerrainProfilePanel.svelte";
import MissionWorkspaceHeader from "./MissionWorkspaceHeader.svelte";
import { SplitPane, StickyWarningStack, WorkspaceShell } from "../ui";
import type { Warning } from "../../lib/warnings/warning-model";
import {
  missionWorkspaceFallbackChromeState,
  resolveMissionWorkspaceLayout,
  type MissionWorkspacePhoneSegment,
} from "./mission-workspace-layout";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

type Props = {
  replayMapOverlay?: ReplayMapOverlayState | null;
  onDismissReplayMapOverlay?: () => void;
};

type MissionWorkspaceSessionView = {
  vehiclePosition: (GeoPoint2d & { heading_deg?: number | null }) | null;
  homePosition: GeoPoint2d | null;
  telemetry: { heading_deg?: number | null };
};

let {
  replayMapOverlay = null,
  onDismissReplayMapOverlay = () => {},
}: Props = $props();

const missionPlannerStore: MissionPlannerStore = getMissionPlannerStoreContext();
const missionPlannerState = fromStore(missionPlannerStore);
const missionPlannerView = fromStore(getMissionPlannerViewStoreContext());
const sessionViewStore = fromStore(resolveMissionWorkspaceSessionViewStore());
const shellChromeStore = fromStore(resolveMissionWorkspaceChromeStore());
const terrainStateStore = createMissionTerrainState();
const terrainState = fromStore(terrainStateStore);
const settingsStore = fromStore(settings);

function resolveMissionWorkspaceChromeStore() {
  try {
    return getShellChromeStoreContext();
  } catch {
    return readable(missionWorkspaceFallbackChromeState);
  }
}

function resolveMissionWorkspaceSessionViewStore(): Readable<MissionWorkspaceSessionView> {
  try {
    return getSessionViewStoreContext() as Readable<MissionWorkspaceSessionView>;
  } catch {
    return readable({
      vehiclePosition: null,
      homePosition: null,
      telemetry: { heading_deg: 0 },
    });
  }
}

onDestroy(() => {
  terrainStateStore.reset();
});

const missionUiStateStorage = typeof localStorage === "undefined" ? null : localStorage;
const missionUiState = createUiStateStore({ storage: missionUiStateStorage });

function readStoredMissionSegment(): MissionWorkspacePhoneSegment | null {
  try {
    const raw = missionUiStateStorage?.getItem("ironwing.ui.mission.segment");
    if (!raw) return null;
  } catch {
    return null;
  }
  return missionUiState.getMissionSegment();
}

let missionPhoneSegment = $state<MissionWorkspacePhoneSegment>(
  readStoredMissionSegment() ??
    resolveMissionWorkspaceLayout(missionWorkspaceFallbackChromeState, "mission").phoneSegmentDefault ??
    "plan",
);

let planner = $derived(missionPlannerState.current);
let view = $derived(missionPlannerView.current);
let sessionView = $derived(sessionViewStore.current);
let sessionVehiclePosition = $derived(sessionView.vehiclePosition);
let sessionHomePosition = $derived(sessionView.homePosition);
let sessionVehicleHeadingDeg = $derived(sessionView.telemetry.heading_deg ?? sessionVehiclePosition?.heading_deg ?? null);
let shellChrome = $derived(shellChromeStore.current);
let workspaceLayout = $derived(resolveMissionWorkspaceLayout(shellChrome, view.mode));
let missionMapVisible = $derived(!workspaceLayout.showPhoneSegments || missionPhoneSegment === "map");
let missionPlanVisible = $derived(!workspaceLayout.showPhoneSegments || missionPhoneSegment === "plan");
let missionSegmentState = $derived(workspaceLayout.showPhoneSegments ? missionPhoneSegment : "all-visible");
let missionDetailGridClass = $derived(
  workspaceLayout.detailColumns === "split"
    ? "grid gap-4 grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]"
    : "grid gap-4",
);
let continuityDetailGridClass = $derived(
  workspaceLayout.detailColumns === "split"
    ? "grid gap-4 grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]"
    : "grid gap-4",
);
let missionSupportSidebar = $derived(workspaceLayout.supportPlacement === "sidebar");
let missionSupportLayoutClass = $derived(
  missionSupportSidebar
    ? "grid items-start gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(20rem,0.9fr)]"
    : "space-y-4",
);
let missionSupportPanelsClass = $derived(
  missionSupportSidebar ? "space-y-4" : "grid gap-4 lg:grid-cols-2",
);
let useHorizontalSplit = $derived(
  workspaceLayout.mode !== "phone-segmented" && workspaceLayout.mode !== "phone-stack",
);
let hasContent = $derived(plannerHasContent(planner));
let canUseVehicleActions = $derived(view.canUseVehicleActions);
let inlineCopy = $derived(resolveInlineStatusCopy(view, planner));
let missionItems = $derived(planner.draftState.active.mission.draftItems);
let terrain = $derived(terrainState.current);
let appSettings = $derived(settingsStore.current);
let terrainPathPoints = $derived(missionPathPoints(planner.home, missionItems));
let fenceItems = $derived(planner.draftState.active.fence.draftItems);
let rallyItems = $derived(planner.draftState.active.rally.draftItems);
let fenceRegions = $derived.by(() => fenceItems.map((item) => item.document as FenceRegion));
let rallyPoints = $derived.by(() => rallyItems.map((item) => item.document as GeoPoint3d));
let fenceReturnPoint = $derived(planner.draftState.active.fence.document.return_point);
let selectedMissionUiId = $derived(planner.draftState.active.mission.primarySelectedUiId);
let selectedRallyUiId = $derived(planner.rallySelection.kind === "point" ? planner.rallySelection.pointUiId : null);
let surveyBlocks = $derived.by(() =>
  planner.survey.surveyRegionOrder
    .map((block) => {
      const region = planner.survey.surveyRegions.get(block.regionId);
      return region ? { ...block, region } : null;
    })
    .filter((block): block is { regionId: string; position: number; region: NonNullable<(typeof block)>["region"] } => block !== null),
);
let selectedMissionItem = $derived.by(() => {
  if (planner.selection.kind !== "mission-item") {
    return null;
  }

  return missionItems.find((item) => item.uiId === selectedMissionUiId) ?? null;
});
let selectedFenceItem = $derived.by(() => {
  const { fenceSelection } = planner;
  if (fenceSelection.kind !== "region") {
    return null;
  }

  return fenceItems.find((item) => item.uiId === fenceSelection.regionUiId) ?? null;
});
let selectedRallyItem = $derived.by(() => {
  const { rallySelection } = planner;
  if (rallySelection.kind !== "point") {
    return null;
  }

  return rallyItems.find((item) => item.uiId === rallySelection.pointUiId) ?? null;
});
let previousMissionItem = $derived.by(() => {
  if (!selectedMissionItem || selectedMissionItem.index <= 0) {
    return null;
  }

  return missionItems[selectedMissionItem.index - 1] ?? null;
});
let selectedSurveyRegion = $derived(
  planner.selection.kind === "survey-block"
    ? planner.survey.surveyRegions.get(planner.selection.regionId) ?? null
    : null,
);
let homeSelected = $derived.by(() => {
  if (view.mode === "fence") {
    return planner.selection.kind === "home" && planner.fenceSelection.kind === "none";
  }

  if (view.mode === "rally") {
    return planner.selection.kind === "home" && planner.rallySelection.kind === "none";
  }

  return planner.selection.kind === "home";
});
let mapSelection = $derived.by<MissionMapSelection>(() => {
  if (view.mode === "rally") {
    if (planner.rallySelection.kind === "point") {
      return {
        kind: "rally-point",
        uiId: planner.rallySelection.pointUiId,
      };
    }

    return { kind: "home" };
  }

  if (planner.selection.kind === "home") {
    return { kind: "home" };
  }

  if (planner.selection.kind === "mission-item") {
    return {
      kind: "mission-item",
      uiId: selectedMissionUiId,
    };
  }

  return {
    kind: "survey-block",
    regionId: planner.selection.regionId,
  };
});
let mapCurrentSeq = $derived(planner.missionState?.current_index ?? null);
let mapView = $derived(buildMissionMapView({
  mode: view.mode,
  home: planner.home,
  missionItems,
  survey: planner.survey,
  selection: mapSelection,
  fenceDraftItems: fenceItems,
  fenceReturnPoint,
  fenceSelection: planner.fenceSelection,
  rallyDraftItems: rallyItems,
  rallySelection: planner.rallySelection,
  currentSeq: mapCurrentSeq,
}));
let showMissionEditor = $derived(view.mode === "mission");
let showFenceEditor = $derived(view.mode === "fence");
let showRallyEditor = $derived(view.mode === "rally");
let replayOverlayHasGeometry = $derived(
  replayMapOverlay !== null
  && (replayMapOverlay.path.length > 0 || replayMapOverlay.marker !== null),
);

function replayOverlayDetail(): string {
  if (!replayMapOverlay) {
    return "";
  }

  switch (replayMapOverlay.phase) {
    case "loading":
      return "Loading the replay path into the mission map. The overlay stays read-only and separate from the mission draft.";
    case "failed":
      return replayMapOverlay.error ?? "Unable to load the replay path into the mission map overlay.";
    case "ready":
      return `Showing ${replayMapOverlay.path.length.toLocaleString()} replay point${replayMapOverlay.path.length === 1 ? "" : "s"} from ${replayMapOverlay.entryId}. This overlay is read-only and does not change mission draft, undo, or upload state.`;
  }
}

const DEFAULT_SURVEY_ANCHOR: GeoPoint2d = {
  latitude_deg: 47.397742,
  longitude_deg: 8.545594,
};

function surveyRegionAnchor(region: NonNullable<typeof selectedSurveyRegion>): GeoPoint2d | null {
  const geometry = region.patternType === "corridor" ? region.polyline : region.polygon;
  if (geometry.length === 0) {
    return null;
  }

  const totals = geometry.reduce(
    (sum, point) => ({
      latitude_deg: sum.latitude_deg + point.latitude_deg,
      longitude_deg: sum.longitude_deg + point.longitude_deg,
    }),
    { latitude_deg: 0, longitude_deg: 0 },
  );

  return {
    latitude_deg: totals.latitude_deg / geometry.length,
    longitude_deg: totals.longitude_deg / geometry.length,
  };
}

function resolveSurveyCreationAnchor(state: MissionPlannerStoreState): GeoPoint2d {
  if (state.selection.kind === "survey-block") {
    const selectedRegion = state.survey.surveyRegions.get(state.selection.regionId) ?? null;
    const anchor = selectedRegion ? surveyRegionAnchor(selectedRegion) : null;
    if (anchor) {
      return anchor;
    }
  }

  if (state.selection.kind === "mission-item") {
    const selectedItem = state.draftState.active.mission.draftItems.find((item) => item.uiId === state.draftState.active.mission.primarySelectedUiId) ?? null;
    if (
      selectedItem
      && selectedItem.preview.latitude_deg !== null
      && selectedItem.preview.longitude_deg !== null
    ) {
      return {
        latitude_deg: selectedItem.preview.latitude_deg,
        longitude_deg: selectedItem.preview.longitude_deg,
      };
    }
  }

  if (state.home) {
    return {
      latitude_deg: state.home.latitude_deg,
      longitude_deg: state.home.longitude_deg,
    };
  }

  const firstMissionPoint = state.draftState.active.mission.draftItems.find(
    (item) => item.preview.latitude_deg !== null && item.preview.longitude_deg !== null,
  );
  if (
    firstMissionPoint
    && firstMissionPoint.preview.latitude_deg !== null
    && firstMissionPoint.preview.longitude_deg !== null
  ) {
    return {
      latitude_deg: firstMissionPoint.preview.latitude_deg,
      longitude_deg: firstMissionPoint.preview.longitude_deg,
    };
  }

  const firstSurveyBlock = state.survey.surveyRegionOrder[0]?.regionId;
  const firstSurveyRegion = firstSurveyBlock ? state.survey.surveyRegions.get(firstSurveyBlock) ?? null : null;
  const surveyAnchor = firstSurveyRegion ? surveyRegionAnchor(firstSurveyRegion) : null;
  return surveyAnchor ?? DEFAULT_SURVEY_ANCHOR;
}

function projectSurveySeed(anchor: GeoPoint2d, x_m: number, y_m: number): GeoPoint2d {
  const { lat, lon } = localXYToLatLon(anchor, x_m, y_m);
  return {
    latitude_deg: lat,
    longitude_deg: lon,
  };
}

function buildSurveySeedGeometry(patternType: SurveyPatternType, state: MissionPlannerStoreState): GeoPoint2d[] {
  const anchor = resolveSurveyCreationAnchor(state);

  if (patternType === "corridor") {
    return [
      projectSurveySeed(anchor, -40, 0),
      projectSurveySeed(anchor, 0, 20),
      projectSurveySeed(anchor, 40, 0),
    ];
  }

  const halfSpan = patternType === "structure" ? 20 : 35;
  return [
    projectSurveySeed(anchor, -halfSpan, -halfSpan),
    projectSurveySeed(anchor, halfSpan, -halfSpan),
    projectSurveySeed(anchor, halfSpan, halfSpan),
    projectSurveySeed(anchor, -halfSpan, halfSpan),
  ];
}

function replacePromptTitle(state: MissionPlannerStoreState): string {
  const prompt = state.replacePrompt;
  if (!prompt) {
    return "";
  }

  if (prompt.kind === "recoverable") {
    return "Restore the saved draft for this session family?";
  }

  return prompt.action === "download"
    ? "Replace the current draft with the vehicle workspace?"
    : "Clear the vehicle workspace and drop the current local draft?";
}

function replacePromptBody(state: MissionPlannerStoreState): string {
  const prompt = state.replacePrompt;
  if (!prompt) {
    return "";
  }

  if (prompt.kind === "recoverable") {
    return "A recoverable draft was preserved for this session family. Restore it explicitly instead of silently replacing the active workspace.";
  }

  if (prompt.action === "download") {
    return "Reading from the vehicle would overwrite unsaved local planning work. Keep the current draft or explicitly replace it.";
  }

  return "Clearing the vehicle would also replace the current draft with an empty workspace. Keep the current draft or explicitly replace it.";
}

function replacePromptConfirmLabel(state: MissionPlannerStoreState): string {
  return state.replacePrompt?.kind === "recoverable" ? "Restore draft" : "Replace draft";
}

function replacePromptDismissLabel(state: MissionPlannerStoreState): string {
  return state.replacePrompt?.kind === "recoverable" ? "Stay with current draft" : "Keep current draft";
}

function resolveInlineStatusCopy(currentView: MissionPlannerView, state: MissionPlannerStoreState) {
  if (currentView.lastError) {
    return null;
  }

  if (state.streamError) {
    return {
      tone: "warning",
      title: "Mission stream degraded",
      detail: `${state.streamError} Existing local planning data stays mounted instead of falling back to an empty placeholder shell.`,
    } as const;
  }

  if (currentView.inlineStatus.busy) {
    return busyStatusCopy(currentView.inlineStatus, currentView.activeTransfer);
  }

  return null;
}

function busyStatusCopy(
  inlineStatus: MissionPlannerInlineStatus,
  activeTransfer: MissionPlannerView["activeTransfer"],
) {
  if (inlineStatus.timedOut) {
    return {
      tone: "warning",
      title: "Planner action still pending",
      detail: "The last planner action timed out, but the underlying transfer may still be active. Cancel it or wait for the vehicle to respond before retrying.",
    } as const;
  }

  const transferDetail = activeTransfer
    ? `${activeTransfer.direction} ${activeTransfer.missionType} · ${activeTransfer.phase} · ${activeTransfer.completedItems}/${activeTransfer.totalItems} items · retries ${activeTransfer.retriesUsed}`
    : null;

  switch (inlineStatus.phase) {
    case "downloading":
      return {
        tone: "info",
        title: "Reading planning state from the vehicle",
        detail: transferDetail ?? "The current workspace stays mounted while the download completes.",
      } as const;
    case "uploading":
      return {
        tone: "info",
        title: "Uploading planning state to the vehicle",
        detail: transferDetail ?? "The planner keeps the draft visible while the upload completes.",
      } as const;
    case "validating":
      return {
        tone: "info",
        title: "Validating the mission bucket against the active vehicle",
        detail: "Validation stays mission-scoped, even while fence, rally, and Home continuity share the same planner shell.",
      } as const;
    case "clearing":
      return {
        tone: "info",
        title: "Clearing the vehicle workspace",
        detail: transferDetail ?? "The draft remains mounted until the clear request resolves.",
      } as const;
    case "importing":
      return {
        tone: "info",
        title: "Importing file content",
        detail: "The current draft stays intact until the parsed domains are reviewed and applied.",
      } as const;
    case "exporting":
      return {
        tone: "info",
        title: "Exporting the active planner workspace",
        detail: "The current workspace stays mounted while IronWing prepares a truthful mixed-domain .plan export.",
      } as const;
    default:
      return null;
  }
}

function statusClass(tone: "info" | "warning"): string {
  return tone === "warning"
    ? "border-warning/40 bg-warning/10 text-warning"
    : "border-accent/30 bg-accent/10 text-text-primary";
}

function warningTestId(warning: MissionPlannerWarningView, index: number): string {
  if (warning.id.startsWith("file-warning:")) {
    return missionWorkspaceTestIds.warningFile;
  }

  if (warning.id.startsWith("validation-issue:")) {
    return missionWorkspaceTestIds.warningValidation;
  }

  return `${missionWorkspaceTestIds.warningItemPrefix}-${index}`;
}

function toSharedWarning(warning: MissionPlannerWarningView, index: number): Warning {
  const action = warning.action;
  return {
    id: warning.id,
    severity: warning.tone,
    title: warning.title,
    message: warning.detail,
    source: warning.domain,
    details: warning.lines,
    actionLabel: action?.label,
    onAction: action ? () => handleWarningAction(action) : undefined,
    dismissible: true,
    onDismiss: () => handleDismissWarning(warning.id),
    testId: warningTestId(warning, index),
    actionTestId: action ? `${missionWorkspaceTestIds.warningActionPrefix}-${index}` : undefined,
    dismissTestId: `${missionWorkspaceTestIds.warningDismissPrefix}-${index}`,
  };
}

function importReviewChoiceTestId(domain: MissionPlannerMode): string {
  return `${missionWorkspaceTestIds.importReviewChoicePrefix}-${domain}`;
}

function exportReviewChoiceTestId(domain: MissionPlannerMode): string {
  return `${missionWorkspaceTestIds.exportReviewChoicePrefix}-${domain}`;
}

function modeShellTitle(mode: MissionPlannerMode): string {
  return mode === "fence" ? "Fence map editor" : "Rally continuity shell";
}

function modeShellBody(mode: MissionPlannerMode, currentView: MissionPlannerView): string {
  return mode === "fence"
    ? `Fence mode now exposes ${currentView.fenceRegionCount} region${currentView.fenceRegionCount === 1 ? "" : "s"} plus return-point truth inside the mounted planner workspace.`
    : `Rally data is already part of the mounted workspace (${currentView.rallyPointCount} point${currentView.rallyPointCount === 1 ? "" : "s"}), and sticky warnings / import review stay visible here. Dedicated rally editing lands in the next task.`;
}

function handleSelectMode(mode: MissionPlannerMode) {
  missionPlannerStore.setMode(mode);
}

function handleSelectMissionPhoneSegment(segment: MissionWorkspacePhoneSegment) {
  missionPhoneSegment = segment;
  missionUiState.setMissionSegment(segment);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

function handleUndo() {
  if (!view.canEdit || !view.canUndo || view.undoCount <= 0) {
    return false;
  }

  missionPlannerStore.undo(view.historyDomain);
  return true;
}

function handleRedo() {
  if (!view.canEdit || !view.canRedo || view.redoCount <= 0) {
    return false;
  }

  missionPlannerStore.redo(view.historyDomain);
  return true;
}

function handleWorkspaceKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented) {
    return;
  }

  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "z") {
    return;
  }

  const editable = isEditableTarget(event.target) || isEditableTarget(document.activeElement);
  if (editable) {
    return;
  }

  const handled = event.shiftKey ? handleRedo() : handleUndo();
  if (handled) {
    event.preventDefault();
  }
}

$effect(() => {
  terrainStateStore.load({
    enabled: view.mode === "mission" && view.workspaceMounted,
    pathPoints: terrainPathPoints,
    homeAltMsl: planner.home?.altitude_m ?? null,
    safetyMarginM: appSettings.terrainSafetyMarginM,
  });
});

async function handleRetryTerrain() {
  await terrainStateStore.retry();
}

function handleSelectTerrainWarning(index: number) {
  const target = missionItems.find((item) => item.index === index) ?? null;
  if (!target) {
    return;
  }

  missionPlannerStore.setMode("mission");
  missionPlannerStore.selectMissionItem(index);
}

async function handleReadFromVehicle() {
  await missionPlannerStore.downloadFromVehicle();
}

async function handleImportPlan() {
  await missionPlannerStore.importFromPicker();
}

async function handleToolbarImport() {
  await (missionPlannerStore as MissionPlannerStore & {
    importAnyFromPicker: () => Promise<unknown>;
  }).importAnyFromPicker();
}

async function handleImportKml() {
  await missionPlannerStore.importKmlFromPicker();
}

function handleNewMission() {
  // Clear scopes to the currently active mode. Home stays put across modes,
  // and the planner mode itself does not change. In mission mode we also
  // wipe the survey extension since survey regions live alongside mission
  // items.
  const captured = captureActiveWorkspace(planner);
  const empty = createEmptyMissionPlannerWorkspace();
  const next: MissionPlannerWorkspace = {
    mission: view.mode === "mission" ? empty.mission : captured.mission,
    fence: view.mode === "fence" ? empty.fence : captured.fence,
    rally: view.mode === "rally" ? empty.rally : captured.rally,
    home: captured.home,
    survey: view.mode === "mission" ? empty.survey : captured.survey,
    cruiseSpeed: appSettings.cruiseSpeedMps,
    hoverSpeed: appSettings.hoverSpeedMps,
  };
  missionPlannerStore.replaceWorkspace(next);
}

function handlePersistPlanningSpeeds(args: { cruiseSpeed?: number; hoverSpeed?: number }) {
  const patch: Partial<Settings> = {};

  if (typeof args.cruiseSpeed === "number" && Number.isFinite(args.cruiseSpeed)) {
    patch.cruiseSpeedMps = args.cruiseSpeed;
  }

  if (typeof args.hoverSpeed === "number" && Number.isFinite(args.hoverSpeed)) {
    patch.hoverSpeedMps = args.hoverSpeed;
  }

  if (Object.keys(patch).length > 0) {
    settings.updateSettings(patch);
  }
}

function handleCreateSurveyBlock(patternType: SurveyPatternType) {
  return missionPlannerStore.createSurveyBlock(patternType, buildSurveySeedGeometry(patternType, planner));
}

function handleStartSurveyDraw(patternType: SurveyPatternType) {
  return missionPlannerStore.createSurveyBlock(patternType, []);
}

function handleDeleteSurveyRegion(regionId: string) {
  missionPlannerStore.deleteSurveyRegionById(regionId);
}

function handleSelectMissionItemFromMap(uiId: number) {
  missionPlannerStore.selectMissionItemByUiId(uiId);
}

function handleSelectFenceRegion(uiId: number) {
  return missionPlannerStore.selectFenceRegionByUiId(uiId);
}

function handleSelectFenceReturnPoint() {
  return missionPlannerStore.selectFenceReturnPoint();
}

function handleAddFenceRegion(type: FenceRegionType, latitudeDeg?: number, longitudeDeg?: number) {
  return missionPlannerStore.addFenceRegion(type, latitudeDeg, longitudeDeg);
}

function handleDeleteFenceRegion(uiId: number) {
  return missionPlannerStore.deleteFenceRegionByUiId(uiId);
}

function handleUpdateFenceRegion(uiId: number, region: Parameters<typeof missionPlannerStore.updateFenceRegionByUiId>[1]) {
  return missionPlannerStore.updateFenceRegionByUiId(uiId, region);
}

function handleSetFenceReturnPoint(point: GeoPoint2d | null) {
  return missionPlannerStore.setFenceReturnPoint(point);
}

function handleMoveHomeFromMap(latitudeDeg: number, longitudeDeg: number) {
  return missionPlannerStore.moveHomeOnMap(latitudeDeg, longitudeDeg);
}

function handleMoveMissionItemFromMap(uiId: number, latitudeDeg: number, longitudeDeg: number) {
  return missionPlannerStore.moveMissionItemOnMapByUiId(uiId, latitudeDeg, longitudeDeg);
}

function handleAddWaypointAt(latitudeDeg: number, longitudeDeg: number) {
  missionPlannerStore.addMissionItem();
  const items = planner.draftState.active.mission.draftItems;
  const lastItem = items[items.length - 1];
  if (lastItem) {
    missionPlannerStore.updateMissionItemLatitude(lastItem.index, latitudeDeg);
    missionPlannerStore.updateMissionItemLongitude(lastItem.index, longitudeDeg);
  }
}

function handleSetHomeAt(latitudeDeg: number, longitudeDeg: number) {
  missionPlannerStore.setHome({
    latitude_deg: latitudeDeg,
    longitude_deg: longitudeDeg,
    altitude_m: planner.home?.altitude_m ?? 0,
  });
}

function handleSelectRallyPoint(uiId: number) {
  return missionPlannerStore.selectRallyPointByUiId(uiId);
}

function handleAddRallyPoint() {
  return missionPlannerStore.addRallyPoint();
}

function handleDeleteRallyPoint(uiId: number) {
  return missionPlannerStore.deleteRallyPointByUiId(uiId);
}

function handleMoveRallyPointUp(uiId: number) {
  return missionPlannerStore.moveRallyPointUpByUiId(uiId);
}

function handleMoveRallyPointDown(uiId: number) {
  return missionPlannerStore.moveRallyPointDownByUiId(uiId);
}

function handleUpdateRallyLatitude(uiId: number, latitudeDeg: number) {
  return missionPlannerStore.updateRallyPointLatitudeByUiId(uiId, latitudeDeg);
}

function handleUpdateRallyLongitude(uiId: number, longitudeDeg: number) {
  return missionPlannerStore.updateRallyPointLongitudeByUiId(uiId, longitudeDeg);
}

function handleUpdateRallyAltitude(uiId: number, altitudeM: number) {
  return missionPlannerStore.updateRallyPointAltitudeByUiId(uiId, altitudeM);
}

function handleUpdateRallyAltitudeFrame(uiId: number, frame: "msl" | "rel_home" | "terrain" | string) {
  return missionPlannerStore.updateRallyPointAltitudeFrameByUiId(uiId, frame);
}

function handleMoveRallyPointFromMap(uiId: number, latitudeDeg: number, longitudeDeg: number) {
  return missionPlannerStore.moveRallyPointOnMapByUiId(uiId, latitudeDeg, longitudeDeg);
}

function handleMoveFenceVertexFromMap(uiId: number, index: number, latitudeDeg: number, longitudeDeg: number) {
  return missionPlannerStore.moveFenceVertexByUiId(uiId, index, latitudeDeg, longitudeDeg);
}

function handleMoveFenceCircleCenterFromMap(uiId: number, latitudeDeg: number, longitudeDeg: number) {
  return missionPlannerStore.moveFenceCircleCenterByUiId(uiId, latitudeDeg, longitudeDeg);
}

function handleUpdateFenceCircleRadiusFromMap(uiId: number, radiusM: number) {
  return missionPlannerStore.updateFenceCircleRadiusByUiId(uiId, radiusM);
}

async function handleExportPlan() {
  await missionPlannerStore.exportToPicker();
}

async function handleConfirmImportReview() {
  await missionPlannerStore.confirmImportReview();
}

async function handleConfirmExportReview() {
  await missionPlannerStore.confirmExportReview();
}

async function handleUploadToVehicle() {
  await missionPlannerStore.uploadToVehicle();
}

async function handleCancelTransfer() {
  await missionPlannerStore.cancelTransfer();
}

function handleDismissWarning(id: string) {
  missionPlannerStore.dismissWarning(id);
}

function handleWarningAction(action: NonNullable<MissionPlannerWarningView["action"]>) {
  missionPlannerStore.setMode(action.mode);

  if (!action.target) {
    return;
  }

  if (action.target.kind === "fence-return-point") {
    missionPlannerStore.selectFenceReturnPoint();
    return;
  }

  if (action.target.kind === "rally-point") {
    if (action.target.pointUiId === null) {
      return;
    }

    missionPlannerStore.selectRallyPointByUiId(action.target.pointUiId);
    return;
  }

  if (action.target.regionUiId === null) {
    return;
  }

  missionPlannerStore.selectFenceRegionByUiId(action.target.regionUiId);
}

async function confirmPrompt() {
  await missionPlannerStore.confirmReplacePrompt();
}

function dismissPrompt() {
  missionPlannerStore.dismissReplacePrompt();
}

function buildEntryActionCards(status: MissionPlannerView["status"], vehicleReady: boolean, busy: boolean) {
  return [
    {
      key: "read",
      title: "Read from Vehicle",
      description: vehicleReady
        ? "Pull the live mission, fence, rally, and Home state into this workspace."
        : "Reconnect to enable live reads; local import and blank-draft entry stay available now.",
      disabled: busy || !vehicleReady,
      testId: missionWorkspaceTestIds.entryRead,
      onclick: handleReadFromVehicle,
      tone: vehicleReady ? "primary" : "secondary",
    },
    {
      key: "import-plan",
      title: "Import .plan",
      description: "Open a QGroundControl plan file with the browser-safe picker and review mission, fence, and rally domains explicitly.",
      disabled: busy,
      testId: missionWorkspaceTestIds.entryImport,
      onclick: handleImportPlan,
      tone: "secondary",
    },
    {
      key: "import-kml",
      title: "Import .kml / .kmz",
      description: "Bring KML or KMZ mission/fence geometry through the browser-safe picker and review supported domains before applying.",
      disabled: busy,
      testId: missionWorkspaceTestIds.entryImportKml,
      onclick: handleImportKml,
      tone: "secondary",
    },
    {
      key: "new",
      title: "New draft",
      description: status === "unavailable"
        ? "Start a disconnected local draft now, then reconnect later for validation and transfer flows."
        : "Start a blank local draft with Home, mission, fence, rally, and review surfaces mounted immediately.",
      disabled: busy,
      testId: missionWorkspaceTestIds.entryNew,
      onclick: handleNewMission,
      tone: "secondary",
    },
  ] as const;
}

let entryCards = $derived(buildEntryActionCards(view.status, canUseVehicleActions, view.inlineStatus.busy));
</script>

<svelte:window onkeydown={handleWorkspaceKeydown} />

<WorkspaceShell mode="split" testId={missionWorkspaceTestIds.root}>
<div
  class="mission-workspace"
  data-readiness={view.readiness}
  data-workspace-state={view.status}
>
  <MissionWorkspaceHeader
    attachment={view.attachment}
    busy={view.inlineStatus.busy}
    canCancel={view.inlineStatus.canCancel}
    canRedo={view.canRedo}
    canUndo={view.canUndo}
    canUseVehicleActions={canUseVehicleActions}
    hasContent={hasContent || view.workspaceMounted}
    mode={view.mode}
    onCancelTransfer={handleCancelTransfer}
    onExportPlan={handleExportPlan}
    onImport={handleToolbarImport}
    onNewMission={handleNewMission}
    onReadFromVehicle={handleReadFromVehicle}
    onRedo={handleRedo}
    onSelectMode={handleSelectMode}
    onUndo={handleUndo}
    onUploadToVehicle={handleUploadToVehicle}
    redoCount={view.redoCount}
    undoCount={view.undoCount}
  />

  <!-- Hidden diagnostics for E2E test anchors -->
  <div aria-hidden="true" class="hidden">
    <span data-testid={missionWorkspaceTestIds.state}>{view.status}</span>
    <span data-testid={missionWorkspaceTestIds.scope}>{view.activeEnvelopeText}</span>
    <span data-testid={missionWorkspaceTestIds.attachment}>{view.attachment.label}</span>
    <span data-testid={missionWorkspaceTestIds.attachmentDetail}>{view.attachment.detail}</span>
    <span data-testid={missionWorkspaceTestIds.countsMission}>Mission + Home + Survey · {view.missionItemCount} / {view.surveyRegionCount}</span>
    <span data-testid={missionWorkspaceTestIds.countsSurvey}>Survey blocks · {view.surveyRegionCount}</span>
    <span data-testid={missionWorkspaceTestIds.countsFence}>Fence regions · {view.fenceRegionCount}</span>
    <span data-testid={missionWorkspaceTestIds.countsRally}>Rally points · {view.rallyPointCount}</span>
    <span data-testid={missionWorkspaceTestIds.countsValidation}>Validation issues · {view.validationIssueCount}</span>
    <span data-testid={missionWorkspaceTestIds.countsWarnings}>Sticky warnings · {view.warningCount}</span>
  </div>

  {#if view.importReview}
    <section
      class="mt-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-4 text-sm text-warning"
      data-testid={missionWorkspaceTestIds.importReview}
    >
      <p class="text-xs font-semibold uppercase tracking-wide text-warning/80">Import review</p>
      <h3 class="mt-1 text-base font-semibold text-warning" data-testid={missionWorkspaceTestIds.importReviewTitle}>
        Review {view.importReview.fileName ?? `.${view.importReview.source}`} before replacing planner domains
      </h3>
      <p class="mt-2 text-warning/90">
        Keep or replace the incoming Mission + Home + Survey, Fence, and Rally buckets independently. Nothing changes until you apply this review.
      </p>

      {#if view.importReview.warnings.length > 0}
        <ul class="mt-3 list-inside list-disc space-y-1 text-xs">
          {#each view.importReview.warnings as warning, index (`${warning}-${index}`)}
            <li>{warning}</li>
          {/each}
        </ul>
      {/if}

      <div class="mt-4 grid gap-3 lg:grid-cols-3">
        {#each view.importReview.choices as choice (choice.domain)}
          <article
            class="rounded-lg border border-warning/30 bg-bg-primary/90 p-3 text-text-primary"
            data-testid={importReviewChoiceTestId(choice.domain)}
          >
            <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">{choice.label}</p>
            <p class="mt-2 text-xs text-text-secondary">Current · {choice.currentSummary}</p>
            <p class="mt-1 text-xs text-text-secondary">Incoming · {choice.incomingSummary}</p>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                class={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${!choice.replace
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-border bg-bg-secondary text-text-primary hover:border-success hover:text-success"}`}
                data-testid={`${missionWorkspaceTestIds.importReviewKeepPrefix}-${choice.domain}`}
                onclick={() => missionPlannerStore.setImportReviewChoice(choice.domain, false)}
                type="button"
              >
                Keep current
              </button>
              <button
                class={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${choice.replace
                  ? "border-warning/40 bg-warning/10 text-warning"
                  : "border-border bg-bg-secondary text-text-primary hover:border-warning hover:text-warning"}`}
                data-testid={`${missionWorkspaceTestIds.importReviewReplacePrefix}-${choice.domain}`}
                onclick={() => missionPlannerStore.setImportReviewChoice(choice.domain, true)}
                type="button"
              >
                Replace with incoming
              </button>
            </div>
          </article>
        {/each}
      </div>

      <div class="mt-4 flex flex-wrap gap-2">
        <button
          class="rounded-md border border-warning/40 bg-bg-primary px-4 py-2 text-sm font-semibold text-warning transition hover:brightness-105"
          data-testid={missionWorkspaceTestIds.importReviewConfirm}
          onclick={handleConfirmImportReview}
          type="button"
        >
          Apply review
        </button>
        <button
          class="rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
          data-testid={missionWorkspaceTestIds.importReviewDismiss}
          onclick={() => missionPlannerStore.dismissImportReview()}
          type="button"
        >
          Dismiss review
        </button>
      </div>
    </section>
  {/if}

  {#if view.exportReview}
    <section
      class="mt-4 rounded-lg border border-accent/30 bg-accent/10 px-4 py-4 text-sm text-text-primary"
      data-testid={missionWorkspaceTestIds.exportReview}
    >
      <p class="text-xs font-semibold uppercase tracking-wide text-accent/80">Export chooser</p>
      <h3 class="mt-1 text-base font-semibold" data-testid={missionWorkspaceTestIds.exportReviewTitle}>
        Choose which planner domains to include in the exported .plan file
      </h3>
      <p class="mt-2 text-text-secondary">
        Mission includes Home and Survey because QGroundControl stores those inside the mission bucket. Fence and Rally stay independent export buckets.
      </p>

      <div class="mt-4 grid gap-3 lg:grid-cols-3">
        {#each view.exportReview.choices as choice (choice.domain)}
          <label
            class="flex items-start gap-3 rounded-lg border border-border bg-bg-primary/90 p-3"
            data-testid={exportReviewChoiceTestId(choice.domain)}
          >
            <input
              checked={choice.selected}
              onchange={(event) => missionPlannerStore.setExportReviewChoice(choice.domain, (event.currentTarget as HTMLInputElement).checked)}
              type="checkbox"
            />
            <span>
              <span class="block text-xs font-semibold uppercase tracking-wide text-text-muted">{choice.label}</span>
              <span class="mt-2 block text-xs text-text-secondary">{choice.summary}</span>
            </span>
          </label>
        {/each}
      </div>

      <div class="mt-4 flex flex-wrap gap-2">
        <button
          class="rounded-md border border-accent/40 bg-bg-primary px-4 py-2 text-sm font-semibold text-accent transition hover:brightness-105"
          data-testid={missionWorkspaceTestIds.exportReviewConfirm}
          onclick={handleConfirmExportReview}
          type="button"
        >
          Save .plan
        </button>
        <button
          class="rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
          data-testid={missionWorkspaceTestIds.exportReviewDismiss}
          onclick={() => missionPlannerStore.dismissExportReview()}
          type="button"
        >
          Close chooser
        </button>
      </div>
    </section>
  {/if}

  {#if planner.replacePrompt}
    <section
      class="mt-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-4 text-sm text-warning"
      data-testid={missionWorkspaceTestIds.prompt}
    >
      <p class="text-xs font-semibold uppercase tracking-wide text-warning/80" data-testid={missionWorkspaceTestIds.promptKind}>
        {planner.replacePrompt.kind === "recoverable" ? "recoverable-draft" : `${planner.replacePrompt.action}-replace`}
      </p>
      <h3 class="mt-1 text-base font-semibold text-warning">{replacePromptTitle(planner)}</h3>
      <p class="mt-2">{replacePromptBody(planner)}</p>
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          class="rounded-md border border-warning/40 bg-bg-primary px-4 py-2 text-sm font-semibold text-warning transition hover:brightness-105"
          data-testid={missionWorkspaceTestIds.promptConfirm}
          onclick={confirmPrompt}
          type="button"
        >
          {replacePromptConfirmLabel(planner)}
        </button>
        <button
          class="rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
          data-testid={missionWorkspaceTestIds.promptDismiss}
          onclick={dismissPrompt}
          type="button"
        >
          {replacePromptDismissLabel(planner)}
        </button>
      </div>
    </section>
  {/if}

  {#if inlineCopy}
    <div
      class={`mt-4 rounded-lg border px-4 py-3 text-sm ${statusClass(inlineCopy.tone)}`}
      data-testid={missionWorkspaceTestIds.inlineStatus}
    >
      <p class="font-semibold" data-testid={missionWorkspaceTestIds.inlineStatusMessage}>{inlineCopy.title}</p>
      <p class="mt-1" data-testid={missionWorkspaceTestIds.inlineStatusDetail}>{inlineCopy.detail}</p>
    </div>
  {/if}

  {#if view.lastError}
    <div
      class="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
      data-testid={missionWorkspaceTestIds.error}
    >
      <p class="font-semibold">Planner action failed</p>
      <p class="mt-1">{view.lastError}</p>
    </div>
  {/if}

  {#if view.warnings.length > 0}
    <div class="mt-4">
      <StickyWarningStack
        warnings={view.warnings.map((warning, index) => toSharedWarning(warning, index))}
        testId={missionWorkspaceTestIds.warningRegister}
      />
    </div>
  {/if}

  {#if replayMapOverlay}
    <section
      class={`mt-4 rounded-lg border px-4 py-3 text-sm ${replayMapOverlay.phase === "failed"
        ? "border-danger/40 bg-danger/10 text-danger"
        : replayMapOverlay.phase === "loading"
          ? "border-warning/40 bg-warning/10 text-warning"
          : "border-accent/30 bg-accent/10 text-text-primary"}`}
      data-testid={missionWorkspaceTestIds.replayOverlayBanner}
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-wide" data-testid={missionWorkspaceTestIds.replayOverlayState}>
            Replay map overlay · {replayMapOverlay.phase}
          </p>
          <p class="mt-1 font-semibold">Replay map overlay</p>
          <p class="mt-1" data-testid={missionWorkspaceTestIds.replayOverlayDetail}>{replayOverlayDetail()}</p>
        </div>

        <button
          class="rounded-md border border-border bg-bg-primary px-3 py-1.5 text-xs font-semibold text-text-primary transition hover:border-accent hover:text-accent"
          data-testid={missionWorkspaceTestIds.replayOverlayDismiss}
          onclick={onDismissReplayMapOverlay}
          type="button"
        >
          Dismiss overlay
        </button>
      </div>
    </section>
  {/if}

  <div aria-hidden="true" class="hidden" data-testid={missionWorkspaceTestIds.layoutDiagnostics}>
    <span data-testid={missionWorkspaceTestIds.layoutMode}>{workspaceLayout.mode}</span>
    <span data-testid={missionWorkspaceTestIds.layoutTier}>{workspaceLayout.tier}</span>
    <span data-testid={missionWorkspaceTestIds.layoutTierMismatch}>{workspaceLayout.tierMismatch ? "mismatch" : "match"}</span>
    <span data-testid={missionWorkspaceTestIds.detailColumns}>{workspaceLayout.detailColumns}</span>
    <span data-testid={missionWorkspaceTestIds.supportPlacement}>{workspaceLayout.supportPlacement}</span>
    <span data-testid={missionWorkspaceTestIds.phoneSegmentState}>{missionSegmentState}</span>
  </div>

  {#if view.status === "bootstrapping" && !view.workspaceMounted}
    <section
      class="mt-4 rounded-lg border border-border bg-bg-secondary/60 p-5"
      data-testid={missionWorkspaceTestIds.bootstrapping}
    >
      <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Planner scope</p>
      <h3 class="mt-2 text-lg font-semibold text-text-primary">Loading the planner domain</h3>
      <p class="mt-2 text-sm text-text-secondary">
        IronWing is subscribing the planner workspace to the active session scope before live actions unlock.
      </p>
    </section>
  {:else if !view.workspaceMounted}
    <section
      class="mt-4 rounded-lg border border-border bg-bg-secondary/60 p-5"
      data-testid={view.status === "unavailable" ? missionWorkspaceTestIds.unavailable : missionWorkspaceTestIds.empty}
    >
      <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Planner entry</p>
      <h3 class="mt-2 text-lg font-semibold text-text-primary">
        {view.status === "unavailable" ? "Start planning locally or reconnect for live sync" : "Start this scope with a real planner entry action"}
      </h3>
      <p class="mt-2 text-sm text-text-secondary">
        {view.status === "unavailable"
          ? "The Mission tab stays mounted even without an active vehicle scope. Import .plan, .kml, or .kmz files now, or start a blank draft and reconnect later for live reads, validation, upload, and clear flows."
          : "Start from a vehicle download, a truthful file import, or a blank planner draft. Once you choose an entry action, Home, warnings, review state, and later domain editors stay mounted in the active workspace."}
      </p>

      <div class="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        {#each entryCards as card (card.key)}
          <button
            class={`rounded-lg border px-4 py-3 text-left transition ${card.tone === "primary"
              ? "border-accent/40 bg-accent/10 text-text-primary hover:border-accent"
              : "border-border bg-bg-primary text-text-primary hover:border-accent"} disabled:cursor-not-allowed disabled:opacity-60`}
            data-testid={card.testId}
            disabled={card.disabled}
            onclick={card.onclick}
            type="button"
          >
            <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">Entry action</p>
            <h4 class="mt-1 text-sm font-semibold">{card.title}</h4>
            <p class="mt-1 text-xs text-text-secondary">{card.description}</p>
          </button>
        {/each}
      </div>

      {#if replayOverlayHasGeometry && showMissionEditor}
        <div class="mt-5">
          <MissionMap
            blockedReason={planner.blockedReason}
            fallbackReference={resolveSurveyCreationAnchor(planner)}
            homePosition={sessionHomePosition}
            onAddWaypointAt={handleAddWaypointAt}
            onCreateSurveyRegion={handleStartSurveyDraw}
            onDeleteSurveyRegion={handleDeleteSurveyRegion}
            onMoveHome={handleMoveHomeFromMap}
            onMoveMissionItem={handleMoveMissionItemFromMap}
            onSelectHome={missionPlannerStore.selectHome}
            onSelectMissionItem={handleSelectMissionItemFromMap}
            onSelectSurveyRegion={missionPlannerStore.selectSurveyRegion}
            onSetHomeAt={handleSetHomeAt}
            onUpdateSurveyRegion={missionPlannerStore.updateAuthoredSurveyRegion}
            readOnly={!view.canEdit}
            readOnlyReason={view.attachment.detail}
            replayMapOverlay={replayMapOverlay}
            selectedSurveyRegion={selectedSurveyRegion}
            vehicleHeadingDeg={sessionVehicleHeadingDeg}
            vehiclePosition={sessionVehiclePosition}
            view={mapView}
          />
        </div>
      {/if}
    </section>
  {:else}
    <div
      class="mission-workspace__ready"
      data-testid={missionWorkspaceTestIds.ready}
    >
      {#if useHorizontalSplit}
        <SplitPane direction="horizontal" initialRatio={0.6} minRatio={0.35} maxRatio={0.75}>
          {#snippet first()}
            <div class="mission-workspace__map-column">
              {#if showMissionEditor}
                <div class="mission-workspace__map-fill">
                  <MissionMap
                    blockedReason={planner.blockedReason}
                    fallbackReference={resolveSurveyCreationAnchor(planner)}
                    fillContainer
                    homePosition={sessionHomePosition}
                    onAddWaypointAt={handleAddWaypointAt}
                    onCreateSurveyRegion={handleStartSurveyDraw}
                    onDeleteSurveyRegion={handleDeleteSurveyRegion}
                    onMoveHome={handleMoveHomeFromMap}
                    onMoveMissionItem={handleMoveMissionItemFromMap}
                    onSelectHome={missionPlannerStore.selectHome}
                    onSelectMissionItem={handleSelectMissionItemFromMap}
                    onSelectSurveyRegion={missionPlannerStore.selectSurveyRegion}
                    onSetHomeAt={handleSetHomeAt}
                    onUpdateSurveyRegion={missionPlannerStore.updateAuthoredSurveyRegion}
                    readOnly={!view.canEdit}
                    readOnlyReason={view.attachment.detail}
                    replayMapOverlay={replayMapOverlay}
                    selectedSurveyRegion={selectedSurveyRegion}
                    vehicleHeadingDeg={sessionVehicleHeadingDeg}
                    vehiclePosition={sessionVehiclePosition}
                    view={mapView}
                  />
                </div>
                <MissionTerrainProfilePanel
                  onRetry={handleRetryTerrain}
                  onSelectWarning={handleSelectTerrainWarning}
                  state={terrain}
                />
              {:else if showFenceEditor}
                <div class="mission-workspace__map-fill">
                  <MissionMap
                    blockedReason={planner.blockedReason}
                    fallbackReference={resolveSurveyCreationAnchor(planner)}
                    fillContainer
                    homePosition={sessionHomePosition}
                    onAddFenceRegion={handleAddFenceRegion}
                    onClearFenceReturnPoint={() => handleSetFenceReturnPoint(null)}
                    onCreateSurveyRegion={handleStartSurveyDraw}
                    onDeleteSurveyRegion={handleDeleteSurveyRegion}
                    onMoveFenceCircleCenter={handleMoveFenceCircleCenterFromMap}
                    onMoveFenceVertex={handleMoveFenceVertexFromMap}
                    onMoveHome={handleMoveHomeFromMap}
                    onMoveMissionItem={handleMoveMissionItemFromMap}
                    onSelectFenceRegion={handleSelectFenceRegion}
                    onSelectFenceReturnPoint={handleSelectFenceReturnPoint}
                    onSelectHome={missionPlannerStore.selectHome}
                    onSelectMissionItem={handleSelectMissionItemFromMap}
                    onSelectSurveyRegion={missionPlannerStore.selectSurveyRegion}
                    onSetFenceReturnPoint={(latitudeDeg, longitudeDeg) => handleSetFenceReturnPoint({ latitude_deg: latitudeDeg, longitude_deg: longitudeDeg })}
                    onSetHomeAt={handleSetHomeAt}
                    onUpdateFenceCircleRadius={handleUpdateFenceCircleRadiusFromMap}
                    onUpdateSurveyRegion={missionPlannerStore.updateAuthoredSurveyRegion}
                    readOnly={!view.canEdit}
                    readOnlyReason={view.attachment.detail}
                    replayMapOverlay={replayMapOverlay}
                    selectedSurveyRegion={selectedSurveyRegion}
                    vehicleHeadingDeg={sessionVehicleHeadingDeg}
                    vehiclePosition={sessionVehiclePosition}
                    view={mapView}
                  />
                </div>
              {:else if showRallyEditor}
                <div class="mission-workspace__map-fill">
                  <MissionMap
                    blockedReason={planner.blockedReason}
                    fallbackReference={resolveSurveyCreationAnchor(planner)}
                    fillContainer
                    homePosition={sessionHomePosition}
                    onCreateSurveyRegion={handleStartSurveyDraw}
                    onDeleteSurveyRegion={handleDeleteSurveyRegion}
                    onMoveHome={handleMoveHomeFromMap}
                    onMoveMissionItem={handleMoveMissionItemFromMap}
                    onMoveRallyPoint={handleMoveRallyPointFromMap}
                    onSelectHome={missionPlannerStore.selectHome}
                    onSelectMissionItem={handleSelectMissionItemFromMap}
                    onSelectRallyPoint={handleSelectRallyPoint}
                    onSelectSurveyRegion={missionPlannerStore.selectSurveyRegion}
                    onSetHomeAt={handleSetHomeAt}
                    onUpdateSurveyRegion={missionPlannerStore.updateAuthoredSurveyRegion}
                    readOnly={!view.canEdit}
                    readOnlyReason={view.attachment.detail}
                    replayMapOverlay={replayMapOverlay}
                    selectedSurveyRegion={selectedSurveyRegion}
                    vehicleHeadingDeg={sessionVehicleHeadingDeg}
                    vehiclePosition={sessionVehiclePosition}
                    view={mapView}
                  />
                </div>
              {/if}
            </div>
          {/snippet}
          {#snippet second()}
            <div class="mission-workspace__editor-column">
              <MissionHomeCard
                attachment={view.attachment}
                home={planner.home}
                mode={view.mode}
                onChange={missionPlannerStore.setHome}
                onSelect={missionPlannerStore.selectHome}
                selected={homeSelected}
              />

              {#if showMissionEditor}
                <MissionDraftList
                  cruiseSpeed={planner.cruiseSpeed}
                  items={missionItems}
                  onAddMissionItem={missionPlannerStore.addMissionItem}
                  onAddSurveyBlock={handleCreateSurveyBlock}
                  onDeleteMissionItem={missionPlannerStore.deleteMissionItem}
                  onDeleteSurveyRegion={handleDeleteSurveyRegion}
                  onGenerateSurveyRegion={missionPlannerStore.generateSurveyRegion}
                  onMoveMissionItemDown={missionPlannerStore.moveMissionItemDownByIndex}
                  onMoveMissionItemUp={missionPlannerStore.moveMissionItemUpByIndex}
                  onPromptDissolveSurveyRegion={missionPlannerStore.promptDissolveSurveyRegion}
                  onSelectMissionItem={missionPlannerStore.selectMissionItem}
                  onSelectSurveyBlock={missionPlannerStore.selectSurveyRegion}
                  onSetSurveyRegionCollapsed={missionPlannerStore.setSurveyRegionCollapsed}
                  selectedMissionUiId={selectedMissionUiId}
                  selectedSurface={planner.selection}
                  surveyBlocks={surveyBlocks}
                />

                <MissionInspector
                  cruiseSpeed={planner.cruiseSpeed}
                  home={planner.home}
                  item={selectedMissionItem}
                  onConfirmSurveyPrompt={missionPlannerStore.confirmSurveyPrompt}
                  onDeleteSurveyRegion={handleDeleteSurveyRegion}
                  onDismissSurveyPrompt={missionPlannerStore.dismissSurveyPrompt}
                  onGenerateSurveyRegion={missionPlannerStore.generateSurveyRegion}
                  onMarkSurveyRegionItemAsEdited={missionPlannerStore.markSurveyRegionItemAsEdited}
                  onPromptDissolveSurveyRegion={missionPlannerStore.promptDissolveSurveyRegion}
                  onUpdateAltitude={missionPlannerStore.updateMissionItemAltitude}
                  onUpdateCommand={missionPlannerStore.updateMissionItemCommand}
                  onUpdateLatitude={missionPlannerStore.updateMissionItemLatitude}
                  onUpdateLongitude={missionPlannerStore.updateMissionItemLongitude}
                  onUpdateSurveyRegion={missionPlannerStore.updateAuthoredSurveyRegion}
                  previousItem={previousMissionItem}
                  selectedSurveyRegion={selectedSurveyRegion}
                  selection={planner.selection}
                  surveyPrompt={view.surveyPrompt}
                />

                <MissionPlanningStatsPanel
                  confirmedCruiseSpeed={appSettings.cruiseSpeedMps}
                  confirmedHoverSpeed={appSettings.hoverSpeedMps}
                  cruiseSpeed={planner.cruiseSpeed}
                  fenceRegions={fenceRegions}
                  home={planner.home}
                  hoverSpeed={planner.hoverSpeed}
                  missionItems={missionItems}
                  mode={view.mode}
                  onPersistPlanningSpeeds={handlePersistPlanningSpeeds}
                  onSetPlanningSpeeds={missionPlannerStore.setPlanningSpeeds}
                  rallyPoints={rallyPoints}
                  readOnly={!view.canEdit}
                />
              {:else if showFenceEditor}
                <MissionFenceDraftList
                  fenceSelection={planner.fenceSelection}
                  items={fenceItems}
                  onAddRegion={handleAddFenceRegion}
                  onClearReturnPoint={() => handleSetFenceReturnPoint(null)}
                  onDeleteRegion={handleDeleteFenceRegion}
                  onSelectRegion={handleSelectFenceRegion}
                  onSelectReturnPoint={handleSelectFenceReturnPoint}
                  readOnly={!view.canEdit}
                  returnPoint={fenceReturnPoint}
                />

                <MissionFenceInspector
                  item={selectedFenceItem}
                  onSetReturnPoint={handleSetFenceReturnPoint}
                  onUpdateRegion={handleUpdateFenceRegion}
                  readOnly={!view.canEdit}
                  returnPoint={fenceReturnPoint}
                  selection={planner.fenceSelection}
                />

                <MissionPlanningStatsPanel
                  confirmedCruiseSpeed={appSettings.cruiseSpeedMps}
                  confirmedHoverSpeed={appSettings.hoverSpeedMps}
                  cruiseSpeed={planner.cruiseSpeed}
                  fenceRegions={fenceRegions}
                  home={planner.home}
                  hoverSpeed={planner.hoverSpeed}
                  missionItems={missionItems}
                  mode={view.mode}
                  onPersistPlanningSpeeds={handlePersistPlanningSpeeds}
                  onSetPlanningSpeeds={missionPlannerStore.setPlanningSpeeds}
                  rallyPoints={rallyPoints}
                  readOnly={!view.canEdit}
                />
              {:else if showRallyEditor}
                <MissionRallyDraftList
                  items={rallyItems}
                  onAddPoint={handleAddRallyPoint}
                  onDeletePoint={handleDeleteRallyPoint}
                  onMovePointDown={handleMoveRallyPointDown}
                  onMovePointUp={handleMoveRallyPointUp}
                  onSelectPoint={handleSelectRallyPoint}
                  rallySelection={planner.rallySelection}
                  readOnly={!view.canEdit}
                />

                <MissionRallyInspector
                  item={selectedRallyItem}
                  onUpdateAltitude={handleUpdateRallyAltitude}
                  onUpdateAltitudeFrame={handleUpdateRallyAltitudeFrame}
                  onUpdateLatitude={handleUpdateRallyLatitude}
                  onUpdateLongitude={handleUpdateRallyLongitude}
                  readOnly={!view.canEdit}
                  selection={planner.rallySelection}
                />

                <MissionPlanningStatsPanel
                  confirmedCruiseSpeed={appSettings.cruiseSpeedMps}
                  confirmedHoverSpeed={appSettings.hoverSpeedMps}
                  cruiseSpeed={planner.cruiseSpeed}
                  fenceRegions={fenceRegions}
                  home={planner.home}
                  hoverSpeed={planner.hoverSpeed}
                  missionItems={missionItems}
                  mode={view.mode}
                  onPersistPlanningSpeeds={handlePersistPlanningSpeeds}
                  onSetPlanningSpeeds={missionPlannerStore.setPlanningSpeeds}
                  rallyPoints={rallyPoints}
                  readOnly={!view.canEdit}
                />
              {:else}
                <section
                  class="rounded-lg border border-border bg-bg-primary p-5"
                  data-testid={missionWorkspaceTestIds.modeShell}
                >
                  <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">{view.mode} mode</p>
                  <h3 class="mt-2 text-lg font-semibold text-text-primary" data-testid={missionWorkspaceTestIds.modeShellTitle}>{modeShellTitle(view.mode)}</h3>
                  <p class="mt-2 text-sm text-text-secondary" data-testid={missionWorkspaceTestIds.modeShellBody}>{modeShellBody(view.mode, view)}</p>
                </section>
              {/if}
            </div>
          {/snippet}
        </SplitPane>
      {:else}
        <!-- Phone layout: segment tabs or vertical stack -->
        <div class="mission-workspace__phone-stack space-y-4 overflow-y-auto">
          <MissionHomeCard
            attachment={view.attachment}
            home={planner.home}
            mode={view.mode}
            onChange={missionPlannerStore.setHome}
            onSelect={missionPlannerStore.selectHome}
            selected={homeSelected}
          />

          {#if showMissionEditor}
            {#if workspaceLayout.showPhoneSegments}
              <div
                class="flex items-center gap-2 rounded-lg border border-border bg-bg-primary p-2"
                data-testid={missionWorkspaceTestIds.phoneSegmentBar}
              >
                <button
                  class={`flex-1 rounded-lg border px-4 py-3 text-sm font-semibold transition ${missionPhoneSegment === "map"
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-border bg-bg-secondary text-text-primary hover:border-accent hover:text-accent"}`}
                  data-active={missionPhoneSegment === "map" ? "true" : "false"}
                  data-testid={missionWorkspaceTestIds.phoneSegmentMap}
                  onclick={() => handleSelectMissionPhoneSegment("map")}
                  type="button"
                >
                  Map
                </button>
                <button
                  class={`flex-1 rounded-lg border px-4 py-3 text-sm font-semibold transition ${missionPhoneSegment === "plan"
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-border bg-bg-secondary text-text-primary hover:border-accent hover:text-accent"}`}
                  data-active={missionPhoneSegment === "plan" ? "true" : "false"}
                  data-testid={missionWorkspaceTestIds.phoneSegmentPlan}
                  onclick={() => handleSelectMissionPhoneSegment("plan")}
                  type="button"
                >
                  Plan
                </button>
              </div>
            {/if}

            <div
              class={[
                "space-y-4",
                !missionMapVisible && "hidden",
              ]}
              data-testid={missionWorkspaceTestIds.mapPane}
              data-visible={missionMapVisible ? "true" : "false"}
            >
              <MissionMap
                blockedReason={planner.blockedReason}
                fallbackReference={resolveSurveyCreationAnchor(planner)}
                homePosition={sessionHomePosition}
                onAddWaypointAt={handleAddWaypointAt}
                onCreateSurveyRegion={handleStartSurveyDraw}
                onDeleteSurveyRegion={handleDeleteSurveyRegion}
                onMoveHome={handleMoveHomeFromMap}
                onMoveMissionItem={handleMoveMissionItemFromMap}
                onSelectHome={missionPlannerStore.selectHome}
                onSelectMissionItem={handleSelectMissionItemFromMap}
                onSelectSurveyRegion={missionPlannerStore.selectSurveyRegion}
                onSetHomeAt={handleSetHomeAt}
                onUpdateSurveyRegion={missionPlannerStore.updateAuthoredSurveyRegion}
                readOnly={!view.canEdit}
                readOnlyReason={view.attachment.detail}
                replayMapOverlay={replayMapOverlay}
                selectedSurveyRegion={selectedSurveyRegion}
                vehicleHeadingDeg={sessionVehicleHeadingDeg}
                vehiclePosition={sessionVehiclePosition}
                view={mapView}
              />
            </div>

            <div
              class={[
                "space-y-4",
                !missionPlanVisible && "hidden",
              ]}
              data-testid={missionWorkspaceTestIds.planPane}
              data-visible={missionPlanVisible ? "true" : "false"}
            >
              <MissionDraftList
                cruiseSpeed={planner.cruiseSpeed}
                items={missionItems}
                onAddMissionItem={missionPlannerStore.addMissionItem}
                onAddSurveyBlock={handleCreateSurveyBlock}
                onDeleteMissionItem={missionPlannerStore.deleteMissionItem}
                onDeleteSurveyRegion={handleDeleteSurveyRegion}
                onGenerateSurveyRegion={missionPlannerStore.generateSurveyRegion}
                onMoveMissionItemDown={missionPlannerStore.moveMissionItemDownByIndex}
                onMoveMissionItemUp={missionPlannerStore.moveMissionItemUpByIndex}
                onPromptDissolveSurveyRegion={missionPlannerStore.promptDissolveSurveyRegion}
                onSelectMissionItem={missionPlannerStore.selectMissionItem}
                onSelectSurveyBlock={missionPlannerStore.selectSurveyRegion}
                onSetSurveyRegionCollapsed={missionPlannerStore.setSurveyRegionCollapsed}
                selectedMissionUiId={selectedMissionUiId}
                selectedSurface={planner.selection}
                surveyBlocks={surveyBlocks}
              />

              <MissionInspector
                cruiseSpeed={planner.cruiseSpeed}
                home={planner.home}
                item={selectedMissionItem}
                onConfirmSurveyPrompt={missionPlannerStore.confirmSurveyPrompt}
                onDeleteSurveyRegion={handleDeleteSurveyRegion}
                onDismissSurveyPrompt={missionPlannerStore.dismissSurveyPrompt}
                onGenerateSurveyRegion={missionPlannerStore.generateSurveyRegion}
                onMarkSurveyRegionItemAsEdited={missionPlannerStore.markSurveyRegionItemAsEdited}
                onPromptDissolveSurveyRegion={missionPlannerStore.promptDissolveSurveyRegion}
                onUpdateAltitude={missionPlannerStore.updateMissionItemAltitude}
                onUpdateCommand={missionPlannerStore.updateMissionItemCommand}
                onUpdateLatitude={missionPlannerStore.updateMissionItemLatitude}
                onUpdateLongitude={missionPlannerStore.updateMissionItemLongitude}
                onUpdateSurveyRegion={missionPlannerStore.updateAuthoredSurveyRegion}
                previousItem={previousMissionItem}
                selectedSurveyRegion={selectedSurveyRegion}
                selection={planner.selection}
                surveyPrompt={view.surveyPrompt}
              />

              <MissionPlanningStatsPanel
                confirmedCruiseSpeed={appSettings.cruiseSpeedMps}
                confirmedHoverSpeed={appSettings.hoverSpeedMps}
                cruiseSpeed={planner.cruiseSpeed}
                fenceRegions={fenceRegions}
                home={planner.home}
                hoverSpeed={planner.hoverSpeed}
                missionItems={missionItems}
                mode={view.mode}
                onPersistPlanningSpeeds={handlePersistPlanningSpeeds}
                onSetPlanningSpeeds={missionPlannerStore.setPlanningSpeeds}
                rallyPoints={rallyPoints}
                readOnly={!view.canEdit}
              />

              <MissionTerrainProfilePanel
                onRetry={handleRetryTerrain}
                onSelectWarning={handleSelectTerrainWarning}
                state={terrain}
              />
            </div>
          {:else if showFenceEditor}
            <MissionMap
              blockedReason={planner.blockedReason}
              fallbackReference={resolveSurveyCreationAnchor(planner)}
              homePosition={sessionHomePosition}
              onAddFenceRegion={handleAddFenceRegion}
              onClearFenceReturnPoint={() => handleSetFenceReturnPoint(null)}
              onCreateSurveyRegion={handleStartSurveyDraw}
              onDeleteSurveyRegion={handleDeleteSurveyRegion}
              onMoveFenceCircleCenter={handleMoveFenceCircleCenterFromMap}
              onMoveFenceVertex={handleMoveFenceVertexFromMap}
              onMoveHome={handleMoveHomeFromMap}
              onMoveMissionItem={handleMoveMissionItemFromMap}
              onSelectFenceRegion={handleSelectFenceRegion}
              onSelectFenceReturnPoint={handleSelectFenceReturnPoint}
              onSelectHome={missionPlannerStore.selectHome}
              onSelectMissionItem={handleSelectMissionItemFromMap}
              onSelectSurveyRegion={missionPlannerStore.selectSurveyRegion}
              onSetFenceReturnPoint={(latitudeDeg, longitudeDeg) => handleSetFenceReturnPoint({ latitude_deg: latitudeDeg, longitude_deg: longitudeDeg })}
              onSetHomeAt={handleSetHomeAt}
              onUpdateFenceCircleRadius={handleUpdateFenceCircleRadiusFromMap}
              onUpdateSurveyRegion={missionPlannerStore.updateAuthoredSurveyRegion}
              readOnly={!view.canEdit}
              readOnlyReason={view.attachment.detail}
              replayMapOverlay={replayMapOverlay}
              selectedSurveyRegion={selectedSurveyRegion}
              vehicleHeadingDeg={sessionVehicleHeadingDeg}
              vehiclePosition={sessionVehiclePosition}
              view={mapView}
            />

            <MissionFenceDraftList
              fenceSelection={planner.fenceSelection}
              items={fenceItems}
              onAddRegion={handleAddFenceRegion}
              onClearReturnPoint={() => handleSetFenceReturnPoint(null)}
              onDeleteRegion={handleDeleteFenceRegion}
              onSelectRegion={handleSelectFenceRegion}
              onSelectReturnPoint={handleSelectFenceReturnPoint}
              readOnly={!view.canEdit}
              returnPoint={fenceReturnPoint}
            />

            <MissionFenceInspector
              item={selectedFenceItem}
              onSetReturnPoint={handleSetFenceReturnPoint}
              onUpdateRegion={handleUpdateFenceRegion}
              readOnly={!view.canEdit}
              returnPoint={fenceReturnPoint}
              selection={planner.fenceSelection}
            />

            <MissionPlanningStatsPanel
              confirmedCruiseSpeed={appSettings.cruiseSpeedMps}
              confirmedHoverSpeed={appSettings.hoverSpeedMps}
              cruiseSpeed={planner.cruiseSpeed}
              fenceRegions={fenceRegions}
              home={planner.home}
              hoverSpeed={planner.hoverSpeed}
              missionItems={missionItems}
              onPersistPlanningSpeeds={handlePersistPlanningSpeeds}
              onSetPlanningSpeeds={missionPlannerStore.setPlanningSpeeds}
              rallyPoints={rallyPoints}
              readOnly={!view.canEdit}
            />
          {:else if showRallyEditor}
            <MissionMap
              blockedReason={planner.blockedReason}
              fallbackReference={resolveSurveyCreationAnchor(planner)}
              homePosition={sessionHomePosition}
              onCreateSurveyRegion={handleStartSurveyDraw}
              onDeleteSurveyRegion={handleDeleteSurveyRegion}
              onMoveHome={handleMoveHomeFromMap}
              onMoveMissionItem={handleMoveMissionItemFromMap}
              onMoveRallyPoint={handleMoveRallyPointFromMap}
              onSelectHome={missionPlannerStore.selectHome}
              onSelectMissionItem={handleSelectMissionItemFromMap}
              onSelectRallyPoint={handleSelectRallyPoint}
              onSelectSurveyRegion={missionPlannerStore.selectSurveyRegion}
              onSetHomeAt={handleSetHomeAt}
              onUpdateSurveyRegion={missionPlannerStore.updateAuthoredSurveyRegion}
              readOnly={!view.canEdit}
              readOnlyReason={view.attachment.detail}
              replayMapOverlay={replayMapOverlay}
              selectedSurveyRegion={selectedSurveyRegion}
              vehicleHeadingDeg={sessionVehicleHeadingDeg}
              vehiclePosition={sessionVehiclePosition}
              view={mapView}
            />

            <MissionRallyDraftList
              items={rallyItems}
              onAddPoint={handleAddRallyPoint}
              onDeletePoint={handleDeleteRallyPoint}
              onMovePointDown={handleMoveRallyPointDown}
              onMovePointUp={handleMoveRallyPointUp}
              onSelectPoint={handleSelectRallyPoint}
              rallySelection={planner.rallySelection}
              readOnly={!view.canEdit}
            />

            <MissionRallyInspector
              item={selectedRallyItem}
              onUpdateAltitude={handleUpdateRallyAltitude}
              onUpdateAltitudeFrame={handleUpdateRallyAltitudeFrame}
              onUpdateLatitude={handleUpdateRallyLatitude}
              onUpdateLongitude={handleUpdateRallyLongitude}
              readOnly={!view.canEdit}
              selection={planner.rallySelection}
            />

            <MissionPlanningStatsPanel
              confirmedCruiseSpeed={appSettings.cruiseSpeedMps}
              confirmedHoverSpeed={appSettings.hoverSpeedMps}
              cruiseSpeed={planner.cruiseSpeed}
              fenceRegions={fenceRegions}
              home={planner.home}
              hoverSpeed={planner.hoverSpeed}
              missionItems={missionItems}
              onPersistPlanningSpeeds={handlePersistPlanningSpeeds}
              onSetPlanningSpeeds={missionPlannerStore.setPlanningSpeeds}
              rallyPoints={rallyPoints}
              readOnly={!view.canEdit}
            />
          {:else}
            <section
              class="rounded-lg border border-border bg-bg-primary p-5"
              data-testid={missionWorkspaceTestIds.modeShell}
            >
              <p class="text-xs font-semibold uppercase tracking-wide text-text-muted">{view.mode} mode</p>
              <h3 class="mt-2 text-lg font-semibold text-text-primary" data-testid={missionWorkspaceTestIds.modeShellTitle}>{modeShellTitle(view.mode)}</h3>
              <p class="mt-2 text-sm text-text-secondary" data-testid={missionWorkspaceTestIds.modeShellBody}>{modeShellBody(view.mode, view)}</p>
            </section>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
</WorkspaceShell>

<style>
  .mission-workspace {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  /* WorkspaceShell mode="split" sets padding: 0, so the workspace itself owns the
     outer gutters. SplitPane children apply their own gutters via the
     map-column / editor-column padding below. The toolbar header has its
     own padding and a full-bleed border, so skip it; same for the hidden
     diagnostic stub and the ready container (its panes pad themselves). */
  .mission-workspace > section,
  .mission-workspace > div:not(.mission-workspace__ready):not(.hidden):not([data-testid="mission-workspace-header"]) {
    margin-left: var(--workspace-gutter-split);
    margin-right: var(--workspace-gutter-split);
  }

  .mission-workspace__ready {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    margin-top: var(--space-3);
  }

  .mission-workspace__map-column {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: var(--space-3);
    overflow: hidden;
    padding: var(--workspace-gutter-split);
  }

  .mission-workspace__phone-stack {
    height: 100%;
    min-height: 0;
    padding: var(--workspace-gutter-split);
  }

  .mission-workspace__map-fill {
    /* Reserve enough vertical room that adding mission items (which grow the
       sibling terrain panel) cannot shrink the map below a usable height. */
    flex: 1 1 auto;
    min-height: 240px;
  }

  /* Siblings of the map (currently the terrain profile panel) keep their
     natural size, scrolling internally when they grow with more waypoints. */
  .mission-workspace__map-column > :not(.mission-workspace__map-fill) {
    flex: 0 1 auto;
    min-height: 0;
    overflow-y: auto;
  }

  .mission-workspace__editor-column {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: var(--space-3);
    overflow-y: auto;
    padding: var(--workspace-gutter-split);
  }
</style>
