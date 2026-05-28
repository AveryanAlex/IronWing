<script lang="ts">
import { onDestroy } from "svelte";
import { fromStore, readable, type Readable } from "svelte/store";

import {
  getMissionPlannerStoreContext,
  getMissionPlannerViewStoreContext,
  getMissionWorkspaceRouteContext,
  getSessionViewStoreContext,
  getShellChromeStoreContext,
  type MissionWorkspaceRouteContext,
} from "../../../app/shell/runtime-context";
import {
  captureActiveWorkspace,
  createEmptyMissionPlannerWorkspace,
  plannerHasContent,
  type MissionPlannerMode,
  type MissionPlannerStore,
  type MissionPlannerStoreState,
  type MissionPlannerWorkspace,
} from "../../../lib/stores/mission-planner";
import type { MissionPlannerView, MissionPlannerWarningView } from "../../../lib/stores/mission-planner-view";
import { buildMissionMapView, type MissionMapSelection } from "../../../lib/mission-map-view";
import { missionPathPointsWithSurveys } from "../../../lib/mission-path";
import type { ReplayMapOverlayState } from "../../../lib/replay-map-overlay";
import { createMissionTerrainState } from "../../../lib/mission-terrain-state";
import type { FenceRegion, GeoPoint2d, GeoPoint3d } from "../../../lib/mavkit-types";
import type { FenceRegionType } from "../../../lib/mission-draft-typed";
import { settings, type Settings } from "../../../lib/stores/settings";
import { createUiStateStore } from "../../../lib/ui-state/ui-state";
import type { SurveyPatternType } from "../../../lib/survey-region";
import MissionWorkspaceDesktopReady from "../../../features/mission/components/MissionWorkspaceDesktopReady.svelte";
import MissionWorkspacePhoneReady from "../../../features/mission/components/MissionWorkspacePhoneReady.svelte";
import MissionWorkspaceStatusPanels from "../../../features/mission/components/MissionWorkspaceStatusPanels.svelte";
import MissionWorkspaceHeader from "../../../features/mission/components/MissionWorkspaceHeader.svelte";
import { WorkspaceShell } from "../../../components/ui";
import {
  buildSurveySeedGeometry,
  resolveInlineStatusCopy,
  toSharedWarning,
} from "../../../features/mission/mission-workspace-helpers";
import {
  missionWorkspaceFallbackChromeState,
  resolveMissionWorkspaceLayout,
  type MissionWorkspacePhoneSegment,
} from "../../../features/mission/mission-workspace-layout";
import type {
  MissionWorkspaceActions,
  MissionWorkspaceContext,
  MissionWorkspacePhoneState,
} from "../../../features/mission/mission-workspace-sections";
import { missionWorkspaceTestIds } from "../../../features/mission/mission-workspace-test-ids";

const defaultRouteContext = resolveMissionWorkspaceRouteContext();

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
  replayMapOverlay: replayMapOverlayProp,
  onDismissReplayMapOverlay = defaultRouteContext.dismissReplayMapOverlay,
}: Props = $props();

const missionPlannerStore: MissionPlannerStore = getMissionPlannerStoreContext();
const missionPlannerState = fromStore(missionPlannerStore);
const missionPlannerView = fromStore(getMissionPlannerViewStoreContext());
const routeReplayMapOverlay = fromStore(defaultRouteContext.replayMapOverlay);
const sessionViewStore = fromStore(resolveMissionWorkspaceSessionViewStore());
const shellChromeStore = fromStore(resolveMissionWorkspaceChromeStore());
const terrainStateStore = createMissionTerrainState();
const terrainState = fromStore(terrainStateStore);
const settingsStore = fromStore(settings);

function resolveMissionWorkspaceRouteContext(): MissionWorkspaceRouteContext {
  try {
    return getMissionWorkspaceRouteContext();
  } catch {
    return {
      replayMapOverlay: readable(null),
      dismissReplayMapOverlay() {},
    };
  }
}

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
let sessionVehicleHeadingDeg = $derived(
  sessionView.telemetry.heading_deg ?? sessionVehiclePosition?.heading_deg ?? null,
);
let shellChrome = $derived(shellChromeStore.current);
let replayMapOverlay = $derived(
  replayMapOverlayProp === undefined ? routeReplayMapOverlay.current : replayMapOverlayProp,
);
let workspaceLayout = $derived(resolveMissionWorkspaceLayout(shellChrome, view.mode));
let missionMapVisible = $derived(!workspaceLayout.showPhoneSegments || missionPhoneSegment === "map");
let missionPlanVisible = $derived(!workspaceLayout.showPhoneSegments || missionPhoneSegment === "plan");
let missionSegmentState = $derived(workspaceLayout.showPhoneSegments ? missionPhoneSegment : "all-visible");
let missionDetailGridClass = $derived(
  workspaceLayout.detailColumns === "split" ? "grid gap-4 grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]" : "grid gap-4",
);
let continuityDetailGridClass = $derived(
  workspaceLayout.detailColumns === "split" ? "grid gap-4 grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]" : "grid gap-4",
);
let missionSupportSidebar = $derived(workspaceLayout.supportPlacement === "sidebar");
let missionSupportLayoutClass = $derived(
  missionSupportSidebar ? "grid items-start gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(20rem,0.9fr)]" : "space-y-4",
);
let missionSupportPanelsClass = $derived(missionSupportSidebar ? "space-y-4" : "grid gap-4 lg:grid-cols-2");
let useHorizontalSplit = $derived(workspaceLayout.mode !== "phone-segmented" && workspaceLayout.mode !== "phone-stack");
let hasContent = $derived(plannerHasContent(planner));
let canUseVehicleActions = $derived(view.canUseVehicleActions);
let inlineCopy = $derived(resolveInlineStatusCopy(view, planner));
let sharedWarnings = $derived.by(() =>
  view.warnings.map((warning, index) =>
    toSharedWarning(warning, index, {
      onAction: handleWarningAction,
      onDismiss: handleDismissWarning,
    }),
  ),
);
let missionItems = $derived(planner.draftState.active.mission.draftItems);
let terrain = $derived(terrainState.current);
let appSettings = $derived(settingsStore.current);
let terrainPathPoints = $derived(missionPathPointsWithSurveys(planner.home, missionItems, planner.survey));
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
    .filter(
      (block): block is { regionId: string; position: number; region: NonNullable<typeof block>["region"] } =>
        block !== null,
    ),
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
    ? (planner.survey.surveyRegions.get(planner.selection.regionId) ?? null)
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
let mapView = $derived(
  buildMissionMapView({
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
  }),
);
let workspaceContext = $derived<MissionWorkspaceContext>({
  planner,
  view,
  appSettings,
  missionItems,
  fenceItems,
  rallyItems,
  fenceRegions,
  rallyPoints,
  fenceReturnPoint,
  selectedMissionUiId,
  selectedMissionItem,
  previousMissionItem,
  selectedFenceItem,
  selectedRallyItem,
  selectedSurveyRegion,
  surveyPrompt: view.surveyPrompt,
  surveyBlocks,
  homeSelected,
  terrain,
  mapView,
  sessionHomePosition,
  sessionVehiclePosition,
  sessionVehicleHeadingDeg,
  replayMapOverlay,
});
const workspaceActions: MissionWorkspaceActions = {
  onSetHome: missionPlannerStore.setHome,
  onSelectHome: missionPlannerStore.selectHome,
  onDeleteMissionItem: missionPlannerStore.deleteMissionItem,
  onUpdateMissionItemAltitude: missionPlannerStore.updateMissionItemAltitude,
  onUpdateMissionItemCommand: missionPlannerStore.updateMissionItemCommand,
  onUpdateMissionItemLatitude: missionPlannerStore.updateMissionItemLatitude,
  onUpdateMissionItemLongitude: missionPlannerStore.updateMissionItemLongitude,
  onReorderMissionEntries: missionPlannerStore.reorderMissionListEntries,
  onSelectMissionItem: missionPlannerStore.selectMissionItem,
  onSelectMissionItemByUiId: handleSelectMissionItemFromMap,
  onAddWaypointAt: handleAddWaypointAt,
  onMoveMissionItemFromMap: handleMoveMissionItemFromMap,
  onSetHomeAt: handleSetHomeAt,
  onMoveHomeFromMap: handleMoveHomeFromMap,
  onDeleteSurveyRegion: handleDeleteSurveyRegion,
  onGenerateSurveyRegion: missionPlannerStore.generateSurveyRegion,
  onPromptDissolveSurveyRegion: missionPlannerStore.promptDissolveSurveyRegion,
  onSelectSurveyRegion: missionPlannerStore.selectSurveyRegion,
  onSetSurveyRegionCollapsed: missionPlannerStore.setSurveyRegionCollapsed,
  onUpdateSurveyRegion: missionPlannerStore.updateAuthoredSurveyRegion,
  onMarkSurveyRegionItemAsEdited: missionPlannerStore.markSurveyRegionItemAsEdited,
  onConfirmSurveyPrompt: missionPlannerStore.confirmSurveyPrompt,
  onDismissSurveyPrompt: missionPlannerStore.dismissSurveyPrompt,
  onPersistPlanningSpeeds: handlePersistPlanningSpeeds,
  onSetPlanningSpeeds: missionPlannerStore.setPlanningSpeeds,
  onRetryTerrain: handleRetryTerrain,
  onSelectTerrainWarning: handleSelectTerrainWarning,
  onAddFenceRegion: handleAddFenceRegion,
  onDeleteFenceRegion: handleDeleteFenceRegion,
  onSelectFenceRegion: handleSelectFenceRegion,
  onSelectFenceReturnPoint: handleSelectFenceReturnPoint,
  onUpdateFenceRegion: handleUpdateFenceRegion,
  onSetFenceReturnPoint: handleSetFenceReturnPoint,
  onMoveFenceVertexFromMap: handleMoveFenceVertexFromMap,
  onMoveFenceCircleCenterFromMap: handleMoveFenceCircleCenterFromMap,
  onUpdateFenceCircleRadiusFromMap: handleUpdateFenceCircleRadiusFromMap,
  onAddRallyPoint: handleAddRallyPoint,
  onDeleteRallyPoint: handleDeleteRallyPoint,
  onMoveRallyPointUp: handleMoveRallyPointUp,
  onMoveRallyPointDown: handleMoveRallyPointDown,
  onSelectRallyPoint: handleSelectRallyPoint,
  onUpdateRallyLatitude: handleUpdateRallyLatitude,
  onUpdateRallyLongitude: handleUpdateRallyLongitude,
  onUpdateRallyAltitude: handleUpdateRallyAltitude,
  onUpdateRallyAltitudeFrame: handleUpdateRallyAltitudeFrame,
  onMoveRallyPointFromMap: handleMoveRallyPointFromMap,
};
let phoneState = $derived<MissionWorkspacePhoneState>({
  missionMapVisible,
  missionPlanVisible,
  missionPhoneSegment,
});

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

async function handleToolbarImport() {
  await (
    missionPlannerStore as MissionPlannerStore & {
      importAnyFromPicker: () => Promise<unknown>;
    }
  ).importAnyFromPicker();
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

function handleUpdateFenceRegion(
  uiId: number,
  region: Parameters<typeof missionPlannerStore.updateFenceRegionByUiId>[1],
) {
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
    uploaded={view.uploaded}
    uploading={view.phase === "uploading"}
    canCancel={view.inlineStatus.canCancel}
    canRedo={view.canRedo}
    canUndo={view.canUndo}
    canUseVehicleActions={canUseVehicleActions}
    hasContent={hasContent || view.workspaceMounted}
    mode={view.mode}
    onAddMissionItem={missionPlannerStore.addMissionItem}
    onAddSurveyBlock={handleCreateSurveyBlock}
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

  <MissionWorkspaceStatusPanels
    {inlineCopy}
    {planner}
    {replayMapOverlay}
    {sharedWarnings}
    {view}
    onConfirmExportReview={handleConfirmExportReview}
    onConfirmImportReview={handleConfirmImportReview}
    onConfirmPrompt={confirmPrompt}
    onDismissExportReview={missionPlannerStore.dismissExportReview}
    onDismissImportReview={missionPlannerStore.dismissImportReview}
    onDismissPrompt={dismissPrompt}
    onDismissReplayMapOverlay={onDismissReplayMapOverlay}
    onSetExportReviewChoice={missionPlannerStore.setExportReviewChoice}
    onSetImportReviewChoice={missionPlannerStore.setImportReviewChoice}
  />

  <div aria-hidden="true" class="hidden" data-testid={missionWorkspaceTestIds.layoutDiagnostics}>
    <span data-testid={missionWorkspaceTestIds.layoutMode}>{workspaceLayout.mode}</span>
    <span data-testid={missionWorkspaceTestIds.layoutTier}>{workspaceLayout.tier}</span>
    <span data-testid={missionWorkspaceTestIds.layoutTierMismatch}>{workspaceLayout.tierMismatch ? "mismatch" : "match"}</span>
    <span data-testid={missionWorkspaceTestIds.detailColumns}>{workspaceLayout.detailColumns}</span>
    <span data-testid={missionWorkspaceTestIds.supportPlacement}>{workspaceLayout.supportPlacement}</span>
    <span data-testid={missionWorkspaceTestIds.phoneSegmentState}>{missionSegmentState}</span>
  </div>

  {#if useHorizontalSplit}
    <MissionWorkspaceDesktopReady actions={workspaceActions} context={workspaceContext} />
  {:else}
    <MissionWorkspacePhoneReady
      actions={workspaceActions}
      context={workspaceContext}
      {phoneState}
      showPhoneSegments={workspaceLayout.showPhoneSegments}
      onSelectMissionPhoneSegment={handleSelectMissionPhoneSegment}
    />
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

</style>
