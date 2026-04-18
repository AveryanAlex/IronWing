<script lang="ts">
import { onDestroy } from "svelte";
import { fromStore, readable } from "svelte/store";

import {
  getMissionPlannerStoreContext,
  getMissionPlannerViewStoreContext,
  getShellChromeStoreContext,
} from "../../app/shell/runtime-context";
import {
  createEmptyMissionPlannerWorkspace,
  plannerHasContent,
  type MissionPlannerMode,
  type MissionPlannerStoreState,
} from "../../lib/stores/mission-planner";
import type {
  MissionPlannerInlineStatus,
  MissionPlannerView,
  MissionPlannerWarningView,
} from "../../lib/stores/mission-planner-view";
import { buildMissionMapView, type MissionMapSelection } from "../../lib/mission-map-view";
import { missionPathPoints } from "../../lib/mission-path";
import { createMissionTerrainState } from "../../lib/mission-terrain-state";
import { localXYToLatLon } from "../../lib/mission-coordinates";
import type { GeoPoint2d } from "../../lib/mavkit-types";
import type { FenceRegionType } from "../../lib/mission-draft-typed";
import { settings, type Settings } from "../../lib/stores/settings";
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
import {
  missionWorkspaceFallbackChromeState,
  resolveMissionWorkspaceLayout,
  type MissionWorkspacePhoneSegment,
} from "./mission-workspace-layout";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

const missionPlannerStore = getMissionPlannerStoreContext();
const missionPlannerState = fromStore(missionPlannerStore);
const missionPlannerView = fromStore(getMissionPlannerViewStoreContext());
const shellChromeStore = fromStore(resolveMissionWorkspaceChromeStore());
const terrainStateStore = createMissionTerrainState();
const terrainState = fromStore(terrainStateStore);
const settingsStore = fromStore(settings);

type LocalNoteTone = "success" | "info" | "warning";
type LocalNote = {
  scopeKey: string;
  message: string;
  tone: LocalNoteTone;
};

function resolveMissionWorkspaceChromeStore() {
  try {
    return getShellChromeStoreContext();
  } catch {
    return readable(missionWorkspaceFallbackChromeState);
  }
}

onDestroy(() => {
  terrainStateStore.reset();
});

let localNote = $state<LocalNote | null>(null);
let missionPhoneSegment = $state<MissionWorkspacePhoneSegment>(
  resolveMissionWorkspaceLayout(missionWorkspaceFallbackChromeState, "mission").phoneSegmentDefault ?? "plan",
);

let planner = $derived(missionPlannerState.current);
let view = $derived(missionPlannerView.current);
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
let scopeKey = $derived(scopeToKey(view.activeEnvelope));
let visibleLocalNote = $derived(localNote?.scopeKey === scopeKey ? localNote : null);
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
  if (planner.fenceSelection.kind !== "region") {
    return null;
  }

  return fenceItems.find((item) => item.uiId === planner.fenceSelection.regionUiId) ?? null;
});
let selectedRallyItem = $derived.by(() => {
  if (planner.rallySelection.kind !== "point") {
    return null;
  }

  return rallyItems.find((item) => item.uiId === planner.rallySelection.pointUiId) ?? null;
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

const DEFAULT_SURVEY_ANCHOR: GeoPoint2d = {
  latitude_deg: 47.397742,
  longitude_deg: 8.545594,
};

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

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

function scopeToKey(activeEnvelope: MissionPlannerView["activeEnvelope"]): string {
  if (!activeEnvelope) {
    return "no-scope";
  }

  return `${activeEnvelope.session_id}:${activeEnvelope.source_kind}:${activeEnvelope.seek_epoch}:${activeEnvelope.reset_revision}`;
}

function clearLocalNote() {
  localNote = null;
}

function setLocalNote(message: string, tone: LocalNoteTone = "success") {
  localNote = {
    scopeKey,
    message,
    tone,
  };
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

function localNoteClass(tone: LocalNoteTone): string {
  switch (tone) {
    case "warning":
      return "border-warning/40 bg-warning/10 text-warning";
    case "info":
      return "border-accent/30 bg-accent/10 text-text-primary";
    case "success":
    default:
      return "border-success/30 bg-success/10 text-success";
  }
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
  clearLocalNote();
  await terrainStateStore.retry();
}

function handleSelectTerrainWarning(index: number) {
  clearLocalNote();
  const target = missionItems.find((item) => item.index === index) ?? null;
  if (!target) {
    setLocalNote(`Terrain warning target for mission item ${index + 1} is no longer active.`, "warning");
    return;
  }

  missionPlannerStore.setMode("mission");
  missionPlannerStore.selectMissionItem(index);
}

async function handleReadFromVehicle() {
  clearLocalNote();
  await missionPlannerStore.downloadFromVehicle();
}

async function handleImportPlan() {
  clearLocalNote();
  const result = await missionPlannerStore.importFromPicker();

  if (result.status === "cancelled") {
    setLocalNote("Import cancelled. The current planner draft stayed mounted and unchanged.", "info");
    return;
  }

  if (result.status === "success") {
    const fileLabel = result.fileName ?? "the selected .plan";
    setLocalNote(
      result.warningCount > 0
        ? `Imported ${fileLabel}. ${result.warningCount} warning${result.warningCount === 1 ? " stays" : "s stay"} visible in the sticky register.`
        : `Imported ${fileLabel} into the active workspace.`,
      result.warningCount > 0 ? "warning" : "success",
    );
  }
}

async function handleImportKml() {
  clearLocalNote();
  const result = await missionPlannerStore.importKmlFromPicker();

  if (result.status === "cancelled") {
    setLocalNote("KML/KMZ import cancelled. The current planner draft stayed mounted and unchanged.", "info");
    return;
  }

  if (result.status === "success") {
    const fileLabel = result.fileName ?? `the selected .${result.source}`;
    setLocalNote(
      result.warningCount > 0
        ? `Imported ${fileLabel}. ${result.warningCount} parser warning${result.warningCount === 1 ? " stays" : "s stay"} visible in the sticky register.`
        : `Imported ${fileLabel} into the planner workspace.`,
      result.warningCount > 0 ? "warning" : "success",
    );
  }
}

function handleNewMission() {
  clearLocalNote();
  missionPlannerStore.replaceWorkspace({
    ...createEmptyMissionPlannerWorkspace(),
    cruiseSpeed: appSettings.cruiseSpeedMps,
    hoverSpeed: appSettings.hoverSpeedMps,
  });
  setLocalNote(
    canUseVehicleActions
      ? "Blank mission draft ready. Mission, fence, rally, Home, and later domain editors stay inside this mounted workspace shell."
      : "Blank mission draft ready. Keep editing locally now, then reconnect later for live validation and transfer flows.",
    "success",
  );
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
  clearLocalNote();
  const regionId = missionPlannerStore.createSurveyBlock(patternType, buildSurveySeedGeometry(patternType, planner));
  setLocalNote(
    `Created a ${sentenceCase(patternType)} survey region after the current selection. Adjust geometry, camera, parameters, and generated items from this shared workspace.`,
    "success",
  );
  return regionId;
}

function handleStartSurveyDraw(patternType: SurveyPatternType) {
  clearLocalNote();
  const regionId = missionPlannerStore.createSurveyBlock(patternType, []);
  setLocalNote(
    `Started ${sentenceCase(patternType)} survey drawing on the planner map. Finish or cancel the region directly from the shared workspace surface.`,
    "info",
  );
  return regionId;
}

function handleDeleteSurveyRegion(regionId: string) {
  clearLocalNote();
  missionPlannerStore.deleteSurveyRegionById(regionId);
  setLocalNote("Deleted the selected survey region. The shared planner workspace stayed mounted.", "warning");
}

function handleSelectMissionItemFromMap(uiId: number) {
  clearLocalNote();
  missionPlannerStore.selectMissionItemByUiId(uiId);
}

function handleSelectFenceRegion(uiId: number) {
  clearLocalNote();
  return missionPlannerStore.selectFenceRegionByUiId(uiId);
}

function handleSelectFenceReturnPoint() {
  clearLocalNote();
  return missionPlannerStore.selectFenceReturnPoint();
}

function handleAddFenceRegion(type: FenceRegionType, latitudeDeg?: number, longitudeDeg?: number) {
  clearLocalNote();
  return missionPlannerStore.addFenceRegion(type, latitudeDeg, longitudeDeg);
}

function handleDeleteFenceRegion(uiId: number) {
  clearLocalNote();
  const result = missionPlannerStore.deleteFenceRegionByUiId(uiId);
  if (result.status === "applied") {
    setLocalNote("Deleted the selected fence region. Fence mode stayed mounted so you can keep editing the remaining geometry.", "warning");
  }
  return result;
}

function handleUpdateFenceRegion(uiId: number, region: Parameters<typeof missionPlannerStore.updateFenceRegionByUiId>[1]) {
  clearLocalNote();
  return missionPlannerStore.updateFenceRegionByUiId(uiId, region);
}

function handleSetFenceReturnPoint(point: GeoPoint2d | null) {
  clearLocalNote();
  return missionPlannerStore.setFenceReturnPoint(point);
}

function handleMoveHomeFromMap(latitudeDeg: number, longitudeDeg: number) {
  clearLocalNote();
  return missionPlannerStore.moveHomeOnMap(latitudeDeg, longitudeDeg);
}

function handleMoveMissionItemFromMap(uiId: number, latitudeDeg: number, longitudeDeg: number) {
  clearLocalNote();
  return missionPlannerStore.moveMissionItemOnMapByUiId(uiId, latitudeDeg, longitudeDeg);
}

function handleAddWaypointAt(latitudeDeg: number, longitudeDeg: number) {
  clearLocalNote();
  missionPlannerStore.addMissionItem();
  const items = planner.draftState.active.mission.draftItems;
  const lastItem = items[items.length - 1];
  if (lastItem) {
    missionPlannerStore.updateMissionItemLatitude(lastItem.index, latitudeDeg);
    missionPlannerStore.updateMissionItemLongitude(lastItem.index, longitudeDeg);
  }
}

function handleSetHomeAt(latitudeDeg: number, longitudeDeg: number) {
  clearLocalNote();
  missionPlannerStore.setHome({
    latitude_deg: latitudeDeg,
    longitude_deg: longitudeDeg,
    altitude_m: planner.home?.altitude_m ?? 0,
  });
}

function handleSelectRallyPoint(uiId: number) {
  clearLocalNote();
  return missionPlannerStore.selectRallyPointByUiId(uiId);
}

function handleAddRallyPoint() {
  clearLocalNote();
  return missionPlannerStore.addRallyPoint();
}

function handleDeleteRallyPoint(uiId: number) {
  clearLocalNote();
  const result = missionPlannerStore.deleteRallyPointByUiId(uiId);
  if (result.status === "applied") {
    setLocalNote("Deleted the selected rally point. Rally mode stayed mounted so you can keep refining the remaining diversion targets.", "warning");
  }
  return result;
}

function handleMoveRallyPointUp(uiId: number) {
  clearLocalNote();
  return missionPlannerStore.moveRallyPointUpByUiId(uiId);
}

function handleMoveRallyPointDown(uiId: number) {
  clearLocalNote();
  return missionPlannerStore.moveRallyPointDownByUiId(uiId);
}

function handleUpdateRallyLatitude(uiId: number, latitudeDeg: number) {
  clearLocalNote();
  return missionPlannerStore.updateRallyPointLatitudeByUiId(uiId, latitudeDeg);
}

function handleUpdateRallyLongitude(uiId: number, longitudeDeg: number) {
  clearLocalNote();
  return missionPlannerStore.updateRallyPointLongitudeByUiId(uiId, longitudeDeg);
}

function handleUpdateRallyAltitude(uiId: number, altitudeM: number) {
  clearLocalNote();
  return missionPlannerStore.updateRallyPointAltitudeByUiId(uiId, altitudeM);
}

function handleUpdateRallyAltitudeFrame(uiId: number, frame: "msl" | "rel_home" | "terrain" | string) {
  clearLocalNote();
  const result = missionPlannerStore.updateRallyPointAltitudeFrameByUiId(uiId, frame);
  if (result.status === "applied") {
    setLocalNote("Rally altitude frame updated. Latitude and longitude stayed fixed while the frame reset altitude to a safe zero baseline.", "info");
  }
  return result;
}

function handleMoveRallyPointFromMap(uiId: number, latitudeDeg: number, longitudeDeg: number) {
  clearLocalNote();
  return missionPlannerStore.moveRallyPointOnMapByUiId(uiId, latitudeDeg, longitudeDeg);
}

function handleMoveFenceVertexFromMap(uiId: number, index: number, latitudeDeg: number, longitudeDeg: number) {
  clearLocalNote();
  return missionPlannerStore.moveFenceVertexByUiId(uiId, index, latitudeDeg, longitudeDeg);
}

function handleMoveFenceCircleCenterFromMap(uiId: number, latitudeDeg: number, longitudeDeg: number) {
  clearLocalNote();
  return missionPlannerStore.moveFenceCircleCenterByUiId(uiId, latitudeDeg, longitudeDeg);
}

function handleUpdateFenceCircleRadiusFromMap(uiId: number, radiusM: number) {
  clearLocalNote();
  return missionPlannerStore.updateFenceCircleRadiusByUiId(uiId, radiusM);
}

async function handleExportPlan() {
  clearLocalNote();
  const result = await missionPlannerStore.exportToPicker();

  if (result.status === "cancelled") {
    setLocalNote("Export cancelled. The current planner draft stayed mounted and unchanged.", "info");
    return;
  }

  if (result.status === "success") {
    const fileLabel = result.fileName ?? "the active .plan file";
    setLocalNote(
      result.warningCount > 0
        ? `Saved ${fileLabel}. ${result.warningCount} export warning${result.warningCount === 1 ? " stays" : "s stay"} visible in the sticky register.`
        : `Saved ${fileLabel} from the active planner workspace.`,
      result.warningCount > 0 ? "warning" : "success",
    );
  }
}

async function handleConfirmImportReview() {
  clearLocalNote();
  const result = await missionPlannerStore.confirmImportReview();
  if (result.status === "applied") {
    const fileLabel = result.fileName ?? `the selected ${result.source === "plan" ? ".plan" : `.${result.source}`}`;
    setLocalNote(
      result.warningCount > 0
        ? `Applied ${fileLabel}. ${result.warningCount} warning${result.warningCount === 1 ? " stays" : "s stay"} visible in the sticky register.`
        : `Applied ${fileLabel} to the active workspace.`,
      result.warningCount > 0 ? "warning" : "success",
    );
  }
}

async function handleConfirmExportReview() {
  clearLocalNote();
  const result = await missionPlannerStore.confirmExportReview();

  if (result.status === "cancelled") {
    setLocalNote("Export cancelled. The domain chooser stayed open with the current selections intact.", "info");
    return;
  }

  if (result.status === "success") {
    const fileLabel = result.fileName ?? "the active .plan file";
    setLocalNote(
      result.warningCount > 0
        ? `Saved ${fileLabel}. ${result.warningCount} export warning${result.warningCount === 1 ? " stays" : "s stay"} visible in the sticky register.`
        : `Saved ${fileLabel} from the active planner workspace.`,
      result.warningCount > 0 ? "warning" : "success",
    );
  }
}

async function handleValidateMission() {
  clearLocalNote();
  await missionPlannerStore.validateCurrentMission();
}

async function handleUploadToVehicle() {
  clearLocalNote();
  await missionPlannerStore.uploadToVehicle();
}

async function handleClearVehicle() {
  clearLocalNote();
  const result = await missionPlannerStore.clearVehicle();

  if (result.status === "cleared") {
    setLocalNote("Vehicle workspace cleared. The active planner reset to an empty local draft.", "success");
  }
}

async function handleCancelTransfer() {
  clearLocalNote();
  const result = await missionPlannerStore.cancelTransfer();

  if (result.status === "cancelled") {
    setLocalNote("Cancelled the pending transfer. The current draft stayed mounted and retryable.", "warning");
  }
}

function handleDismissWarning(id: string) {
  missionPlannerStore.dismissWarning(id);
}

function handleWarningAction(action: NonNullable<MissionPlannerWarningView["action"]>) {
  clearLocalNote();
  missionPlannerStore.setMode(action.mode);

  if (!action.target) {
    return;
  }

  if (action.target.kind === "fence-return-point") {
    const result = missionPlannerStore.selectFenceReturnPoint();
    if (result.status === "rejected") {
      setLocalNote(result.message, "warning");
    }
    return;
  }

  if (action.target.kind === "rally-point") {
    if (action.target.pointUiId === null) {
      setLocalNote("Rally warning target no longer points at an active rally point.", "warning");
      return;
    }

    const result = missionPlannerStore.selectRallyPointByUiId(action.target.pointUiId);
    if (result.status === "rejected") {
      setLocalNote(result.message, "warning");
    }
    return;
  }

  if (action.target.regionUiId === null) {
    setLocalNote("Fence warning target no longer points at an active region.", "warning");
    return;
  }

  const result = missionPlannerStore.selectFenceRegionByUiId(action.target.regionUiId);
  if (result.status === "rejected") {
    setLocalNote(result.message, "warning");
  }
}

async function confirmPrompt() {
  clearLocalNote();
  const prompt = planner.replacePrompt;
  const result = await missionPlannerStore.confirmReplacePrompt();

  if (!prompt) {
    return;
  }

  if (prompt.kind === "recoverable" && result.status === "restored") {
    setLocalNote("Recovered the saved planner draft for this session family.", "success");
    return;
  }

  if (prompt.kind !== "replace-active") {
    return;
  }

  if (prompt.action === "clear" && result.status === "cleared") {
    setLocalNote("Vehicle workspace cleared. The active planner reset to an empty local draft.", "success");
    return;
  }

  if (prompt.action === "download" && result.status === "replaced") {
    setLocalNote("Replaced the local draft with the current vehicle workspace.", "success");
  }
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

<section
  class="rounded-lg border border-border bg-bg-primary p-3"
  data-readiness={view.readiness}
  data-workspace-state={view.status}
  data-testid={missionWorkspaceTestIds.root}
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
    onImportPlan={handleImportPlan}
    onReadFromVehicle={handleReadFromVehicle}
    onRedo={handleRedo}
    onSelectMode={handleSelectMode}
    onUndo={handleUndo}
    onUploadToVehicle={handleUploadToVehicle}
    onValidateMission={handleValidateMission}
    redoCount={view.redoCount}
    undoCount={view.undoCount}
  />

  {#if view.importReview}
    <section
      class="mt-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-4 text-sm text-warning"
      data-testid={missionWorkspaceTestIds.importReview}
    >
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-warning/80">Import review</p>
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
            <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{choice.label}</p>
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
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-accent/80">Export chooser</p>
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
              <span class="block text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{choice.label}</span>
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
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-warning/80" data-testid={missionWorkspaceTestIds.promptKind}>
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

  {#if visibleLocalNote}
    <div
      class={`mt-4 rounded-lg border px-4 py-3 text-sm ${localNoteClass(visibleLocalNote.tone)}`}
      data-testid={missionWorkspaceTestIds.localNote}
    >
      {visibleLocalNote.message}
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
    <section
      class="mt-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-4 text-sm text-warning"
      data-testid={missionWorkspaceTestIds.warningRegister}
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.16em] text-warning/80">Sticky warnings</p>
          <p class="mt-1 text-xs text-warning/90">Warnings and blocked-action reasons stay visible across domain switches until you dismiss them explicitly.</p>
        </div>
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-warning/80">{view.warningCount} visible</p>
      </div>

      <div class="mt-4 space-y-3">
        {#each view.warnings as warning, index (warning.id)}
          <article
            class="rounded-lg border border-warning/30 bg-bg-primary/90 px-4 py-3 text-text-primary"
            data-testid={warningTestId(warning, index)}
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="max-w-3xl">
                <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{warning.domain}</p>
                <h3 class="mt-1 text-sm font-semibold">{warning.title}</h3>
                <p class="mt-1 text-sm text-text-secondary">{warning.detail}</p>
                {#if warning.lines.length > 0}
                  <ul class="mt-2 list-inside list-disc space-y-1 text-xs text-text-secondary">
                    {#each warning.lines as line (`${warning.id}-${line}`)}
                      <li>{line}</li>
                    {/each}
                  </ul>
                {/if}
              </div>

              <div class="flex flex-wrap gap-2">
                {#if warning.action}
                  <button
                    class="rounded-md border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition hover:brightness-105"
                    data-testid={`${missionWorkspaceTestIds.warningActionPrefix}-${index}`}
                    onclick={() => handleWarningAction(warning.action!)}
                    type="button"
                  >
                    {warning.action.label}
                  </button>
                {/if}
                <button
                  class="rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-semibold text-text-primary transition hover:border-accent hover:text-accent"
                  data-testid={`${missionWorkspaceTestIds.warningDismissPrefix}-${index}`}
                  onclick={() => handleDismissWarning(warning.id)}
                  type="button"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </article>
        {/each}
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
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Planner scope</p>
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
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Planner entry</p>
      <h3 class="mt-2 text-lg font-semibold text-text-primary">
        {view.status === "unavailable" ? "Start planning locally or reconnect for live sync" : "Start this scope with a real planner entry action"}
      </h3>
      <p class="mt-2 text-sm text-text-secondary">
        {view.status === "unavailable"
          ? "The Mission tab stays mounted even without an active vehicle scope. Import .plan, .kml, or .kmz files now, or start a blank draft and reconnect later for live reads, validation, upload, and clear flows."
          : "Start from a vehicle download, a truthful file import, or a blank planner draft. Once you choose an entry action, Home, warnings, review state, and later domain editors stay mounted in the active workspace."}
      </p>

      <div class="mt-5 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        {#each entryCards as card (card.key)}
          <button
            class={`rounded-[20px] border p-4 text-left transition ${card.tone === "primary"
              ? "border-accent/40 bg-accent/10 text-text-primary hover:border-accent"
              : "border-border bg-bg-primary text-text-primary hover:border-accent"} disabled:cursor-not-allowed disabled:opacity-60`}
            data-testid={card.testId}
            disabled={card.disabled}
            onclick={card.onclick}
            type="button"
          >
            <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Entry action</p>
            <h4 class="mt-2 text-base font-semibold">{card.title}</h4>
            <p class="mt-2 text-sm text-text-secondary">{card.description}</p>
          </button>
        {/each}
      </div>
    </section>
  {:else}
    <section
      class="mt-4 rounded-lg border border-border bg-bg-secondary/60 p-5"
      data-testid={missionWorkspaceTestIds.ready}
    >
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Planner workspace</p>
      <p class="mt-2 text-sm text-text-secondary" data-testid={missionWorkspaceTestIds.summary}>
        Mission, fence, rally, Home, sticky warnings, and mixed-domain review now share one mounted planning workspace instead of one-shot replace prompts and placeholder status copy.
      </p>

      <div class="mt-5 space-y-4">
        <MissionHomeCard
          attachment={view.attachment}
          home={planner.home}
          mode={view.mode}
          onChange={missionPlannerStore.setHome}
          onSelect={missionPlannerStore.selectHome}
          selected={homeSelected}
        />

        {#if showMissionEditor}
          <div class="space-y-4">
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
                selectedSurveyRegion={selectedSurveyRegion}
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
              <div class={missionSupportLayoutClass}>
                <div class="space-y-4">
                  <div class={missionDetailGridClass}>
                    <div class="space-y-4">
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
                    </div>

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
                  </div>

                  {#if !missionSupportSidebar}
                    <div class={missionSupportPanelsClass}>
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

                      <MissionTerrainProfilePanel
                        onRetry={handleRetryTerrain}
                        onSelectWarning={handleSelectTerrainWarning}
                        state={terrain}
                      />
                    </div>
                  {/if}
                </div>

                {#if missionSupportSidebar}
                  <div class={missionSupportPanelsClass}>
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

                    <MissionTerrainProfilePanel
                      onRetry={handleRetryTerrain}
                      onSelectWarning={handleSelectTerrainWarning}
                      state={terrain}
                    />
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {:else if showFenceEditor}
          <div class="space-y-4">
            <MissionMap
              blockedReason={planner.blockedReason}
              fallbackReference={resolveSurveyCreationAnchor(planner)}
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
              selectedSurveyRegion={selectedSurveyRegion}
              view={mapView}
            />

            <div class={continuityDetailGridClass}>
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
            </div>

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
          </div>
        {:else if showRallyEditor}
          <div class="space-y-4">
            <MissionMap
              blockedReason={planner.blockedReason}
              fallbackReference={resolveSurveyCreationAnchor(planner)}
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
              selectedSurveyRegion={selectedSurveyRegion}
              view={mapView}
            />

            <div class={continuityDetailGridClass}>
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
            </div>

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
          </div>
        {:else}
          <section
            class="rounded-lg border border-border bg-bg-primary p-5"
            data-testid={missionWorkspaceTestIds.modeShell}
          >
            <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">{view.mode} mode</p>
            <h3 class="mt-2 text-lg font-semibold text-text-primary" data-testid={missionWorkspaceTestIds.modeShellTitle}>{modeShellTitle(view.mode)}</h3>
            <p class="mt-2 text-sm text-text-secondary" data-testid={missionWorkspaceTestIds.modeShellBody}>{modeShellBody(view.mode, view)}</p>
          </section>
        {/if}
      </div>
    </section>
  {/if}
</section>
