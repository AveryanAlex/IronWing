<script lang="ts">
import { fromStore } from "svelte/store";

import {
  getMissionPlannerStoreContext,
  getMissionPlannerViewStoreContext,
} from "../../app/shell/runtime-context";
import {
  createEmptyMissionPlannerWorkspace,
  plannerHasContent,
  type MissionPlannerStoreState,
} from "../../lib/stores/mission-planner";
import type { MissionPlannerInlineStatus, MissionPlannerView } from "../../lib/stores/mission-planner-view";
import { buildMissionMapView, type MissionMapSelection } from "../../lib/mission-map-view";
import { localXYToLatLon } from "../../lib/mission-coordinates";
import type { GeoPoint2d } from "../../lib/mavkit-types";
import type { SurveyPatternType } from "../../lib/survey-region";
import MissionDraftList from "./MissionDraftList.svelte";
import MissionHomeCard from "./MissionHomeCard.svelte";
import MissionInspector from "./MissionInspector.svelte";
import MissionMap from "./MissionMap.svelte";
import MissionWorkspaceHeader from "./MissionWorkspaceHeader.svelte";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

const missionPlannerStore = getMissionPlannerStoreContext();
const missionPlannerState = fromStore(missionPlannerStore);
const missionPlannerView = fromStore(getMissionPlannerViewStoreContext());

type LocalNoteTone = "success" | "info" | "warning";
type LocalNote = {
  scopeKey: string;
  message: string;
  tone: LocalNoteTone;
};

let localNote = $state<LocalNote | null>(null);

let planner = $derived(missionPlannerState.current);
let view = $derived(missionPlannerView.current);
let scopeKey = $derived(scopeToKey(view.activeEnvelope));
let visibleLocalNote = $derived(localNote?.scopeKey === scopeKey ? localNote : null);
let hasContent = $derived(plannerHasContent(planner));
let canUseVehicleActions = $derived(view.activeEnvelope !== null && view.readiness !== "bootstrapping");
let inlineCopy = $derived(resolveInlineStatusCopy(view, planner));
let missionItems = $derived(planner.draftState.active.mission.draftItems);
let selectedMissionUiId = $derived(planner.draftState.active.mission.primarySelectedUiId);
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
let mapSelection = $derived.by<MissionMapSelection>(() => {
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
  home: planner.home,
  missionItems,
  survey: planner.survey,
  selection: mapSelection,
  currentSeq: mapCurrentSeq,
}));

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
    return "Recover the saved draft for this scope?";
  }

  switch (prompt.action) {
    case "download":
      return "Replace the current draft with the vehicle mission?";
    case "import":
      return "Replace the current draft with the imported plan?";
    case "clear":
      return "Clear the vehicle mission and drop the current draft?";
    default:
      return "Replace the current mission draft?";
  }
}

function replacePromptBody(state: MissionPlannerStoreState): string {
  const prompt = state.replacePrompt;
  if (!prompt) {
    return "";
  }

  if (prompt.kind === "recoverable") {
    return "A recoverable draft was carried forward for this same scope. Restore it explicitly instead of silently replacing the active workspace.";
  }

  if (prompt.action === "download") {
    return "Reading from the vehicle would overwrite unsaved local mission work. Keep the current draft or explicitly replace it.";
  }

  if (prompt.action === "import") {
    const fileName = prompt.fileName ? ` from ${prompt.fileName}` : "";
    return `Importing${fileName} would overwrite unsaved local mission work. Keep the current draft or explicitly replace it.`;
  }

  return "Clearing the vehicle would also replace the current dirty mission draft with an empty workspace. Keep the current draft or explicitly replace it.";
}

function replacePromptConfirmLabel(state: MissionPlannerStoreState): string {
  return state.replacePrompt?.kind === "recoverable" ? "Restore draft" : "Replace draft";
}

function replacePromptDismissLabel(state: MissionPlannerStoreState): string {
  return state.replacePrompt?.kind === "recoverable" ? "Stay with current state" : "Keep current draft";
}

function resolveInlineStatusCopy(currentView: MissionPlannerView, state: MissionPlannerStoreState) {
  if (currentView.lastError) {
    return null;
  }

  if (state.streamError) {
    return {
      tone: "warning",
      title: "Mission stream degraded",
      detail: `${state.streamError} Existing local mission data stays mounted instead of falling back to a placeholder shell.`,
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
      title: "Mission action still pending",
      detail: "The last mission action timed out, but the underlying transfer may still be active. Cancel it or wait for the vehicle to respond before retrying.",
    } as const;
  }

  const transferDetail = activeTransfer
    ? `${activeTransfer.direction} ${activeTransfer.missionType} · ${activeTransfer.phase} · ${activeTransfer.completedItems}/${activeTransfer.totalItems} items · retries ${activeTransfer.retriesUsed}`
    : null;

  switch (inlineStatus.phase) {
    case "downloading":
      return {
        tone: "info",
        title: "Reading mission from the vehicle",
        detail: transferDetail ?? "The current mission scope stays mounted while the download completes.",
      } as const;
    case "uploading":
      return {
        tone: "info",
        title: "Uploading mission to the vehicle",
        detail: transferDetail ?? "The planner keeps the draft visible while the upload completes.",
      } as const;
    case "validating":
      return {
        tone: "info",
        title: "Validating mission against the active vehicle",
        detail: "Validation runs inline here so the rest of the shell stays responsive.",
      } as const;
    case "clearing":
      return {
        tone: "info",
        title: "Clearing the vehicle mission",
        detail: transferDetail ?? "The draft remains mounted until the clear request resolves.",
      } as const;
    case "importing":
      return {
        tone: "info",
        title: "Importing .plan data",
        detail: "The current draft stays intact until the imported plan is validated and any replace prompt is resolved.",
      } as const;
    case "exporting":
      return {
        tone: "info",
        title: "Exporting the active workspace",
        detail: "The workspace stays mounted while IronWing prepares a truthful .plan export.",
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

async function handleReadFromVehicle() {
  clearLocalNote();
  await missionPlannerStore.downloadFromVehicle();
}

async function handleImportPlan() {
  clearLocalNote();
  const result = await missionPlannerStore.importFromPicker();

  if (result.status === "cancelled") {
    setLocalNote("Import cancelled. The current mission draft stayed mounted and unchanged.", "info");
    return;
  }

  if (result.status === "success") {
    const fileLabel = result.fileName ?? "the selected .plan";
    setLocalNote(
      result.warningCount > 0
        ? `Imported ${fileLabel}. ${result.warningCount} import warning${result.warningCount === 1 ? " stays" : "s stay"} listed inline.`
        : `Imported ${fileLabel} into the active workspace.`,
      result.warningCount > 0 ? "warning" : "success",
    );
  }
}

function handleNewMission() {
  clearLocalNote();
  missionPlannerStore.replaceWorkspace(createEmptyMissionPlannerWorkspace());
  setLocalNote(
    canUseVehicleActions
      ? "Blank mission draft ready. Home, manual list editing, survey authoring, and map updates stay mounted in this scope."
      : "Blank local mission draft ready. Keep editing locally now and reconnect later for vehicle reads, validation, and transfer flows.",
    "success",
  );
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
  setLocalNote("Deleted the selected survey region. The shared mission workspace stayed mounted.", "warning");
}

function handleSelectMissionItemFromMap(uiId: number) {
  clearLocalNote();
  missionPlannerStore.selectMissionItemByUiId(uiId);
}

function handleMoveHomeFromMap(latitudeDeg: number, longitudeDeg: number) {
  clearLocalNote();
  return missionPlannerStore.moveHomeOnMap(latitudeDeg, longitudeDeg);
}

function handleMoveMissionItemFromMap(uiId: number, latitudeDeg: number, longitudeDeg: number) {
  clearLocalNote();
  return missionPlannerStore.moveMissionItemOnMapByUiId(uiId, latitudeDeg, longitudeDeg);
}

async function handleExportPlan() {
  clearLocalNote();
  const result = await missionPlannerStore.exportToPicker();

  if (result.status === "cancelled") {
    setLocalNote("Export cancelled. The current mission draft stayed mounted and unchanged.", "info");
    return;
  }

  if (result.status === "success") {
    const fileLabel = result.fileName ?? "the active .plan file";
    setLocalNote(
      result.warningCount > 0
        ? `Saved ${fileLabel}. ${result.warningCount} export warning${result.warningCount === 1 ? " stays" : "s stay"} listed inline.`
        : `Saved ${fileLabel} from the active mission workspace.`,
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
    setLocalNote("Vehicle mission cleared. The active workspace reset to an empty local draft.", "success");
  }
}

async function handleCancelTransfer() {
  clearLocalNote();
  const result = await missionPlannerStore.cancelTransfer();

  if (result.status === "cancelled") {
    setLocalNote("Cancelled the pending mission transfer. The current draft stayed mounted and retryable.", "warning");
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
    setLocalNote("Recovered the saved mission draft for this scope.", "success");
    return;
  }

  if (prompt.kind !== "replace-active") {
    return;
  }

  if (prompt.action === "clear" && result.status === "cleared") {
    setLocalNote("Vehicle mission cleared. The active workspace reset to an empty local draft.", "success");
    return;
  }

  if (prompt.action === "download" && result.status === "replaced") {
    setLocalNote("Replaced the local draft with the current vehicle mission.", "success");
    return;
  }

  if (prompt.action === "import" && result.status === "replaced") {
    const fileLabel = result.fileName ?? prompt.fileName ?? "the selected .plan";
    setLocalNote(
      result.warningCount > 0
        ? `Imported ${fileLabel}. ${result.warningCount} import warning${result.warningCount === 1 ? " stays" : "s stay"} listed inline.`
        : `Imported ${fileLabel} into the active workspace.`,
      result.warningCount > 0 ? "warning" : "success",
    );
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
        ? "Pull the live mission, fence, rally, and home state into this workspace."
        : "Reconnect to enable live mission reads; local import and blank-draft entry stay available now.",
      disabled: busy || !vehicleReady,
      testId: missionWorkspaceTestIds.entryRead,
      onclick: handleReadFromVehicle,
      tone: vehicleReady ? "primary" : "secondary",
    },
    {
      key: "import",
      title: "Import .plan",
      description: "Open a QGroundControl plan file with the browser-safe picker and preserve supported survey blocks.",
      disabled: busy,
      testId: missionWorkspaceTestIds.entryImport,
      onclick: handleImportPlan,
      tone: "secondary",
    },
    {
      key: "new",
      title: "New mission",
      description: status === "unavailable"
        ? "Start a disconnected local draft now, then reconnect later for validation and transfer flows."
        : "Start a blank local draft with a Home card, list, and typed inspector mounted immediately.",
      disabled: busy,
      testId: missionWorkspaceTestIds.entryNew,
      onclick: handleNewMission,
      tone: "secondary",
    },
  ] as const;
}

let entryCards = $derived(buildEntryActionCards(view.status, canUseVehicleActions, view.inlineStatus.busy));
</script>

<section
  class="rounded-lg border border-border bg-bg-primary p-3"
  data-readiness={view.readiness}
  data-workspace-state={view.status}
  data-testid={missionWorkspaceTestIds.root}
>
  <MissionWorkspaceHeader
    busy={view.inlineStatus.busy}
    canCancel={view.inlineStatus.canCancel}
    canUseVehicleActions={canUseVehicleActions}
    dirty={view.dirty}
    fileWarningCount={view.fileWarningCount}
    hasContent={hasContent || view.workspaceMounted}
    missionItemCount={view.missionItemCount}
    onCancelTransfer={handleCancelTransfer}
    onClearVehicle={handleClearVehicle}
    onExportPlan={handleExportPlan}
    onImportPlan={handleImportPlan}
    onNewMission={handleNewMission}
    onReadFromVehicle={handleReadFromVehicle}
    onUploadToVehicle={handleUploadToVehicle}
    onValidateMission={handleValidateMission}
    readiness={view.readiness}
    scopeText={view.activeEnvelopeText}
    status={view.status}
    surveyRegionCount={view.surveyRegionCount}
    timedOut={view.inlineStatus.timedOut}
    validationIssueCount={view.validationIssueCount}
  />

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
      {#if planner.replacePrompt.kind === "replace-active" && planner.replacePrompt.fileWarnings.length > 0}
        <p class="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-warning/80">
          {planner.replacePrompt.fileWarnings.length} import warning{planner.replacePrompt.fileWarnings.length === 1 ? "" : "s"} will carry forward if you replace the current draft.
        </p>
      {/if}
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          class="rounded-full border border-warning/40 bg-bg-primary px-4 py-2 text-sm font-semibold text-warning transition hover:brightness-105"
          data-testid={missionWorkspaceTestIds.promptConfirm}
          onclick={confirmPrompt}
          type="button"
        >
          {replacePromptConfirmLabel(planner)}
        </button>
        <button
          class="rounded-full border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
          data-testid={missionWorkspaceTestIds.promptDismiss}
          onclick={dismissPrompt}
          type="button"
        >
          {replacePromptDismissLabel(planner)}
        </button>
      </div>
    </section>
  {/if}

  {#if view.lastError}
    <div
      class="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
      data-testid={missionWorkspaceTestIds.error}
    >
      <p class="font-semibold">Mission action failed</p>
      <p class="mt-1">{view.lastError}</p>
    </div>
  {:else if inlineCopy}
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

  {#if planner.fileWarnings.length > 0}
    <div
      class="mt-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning"
      data-testid={missionWorkspaceTestIds.warningFile}
    >
      <p class="font-semibold">Import and export warnings</p>
      <ul class="mt-2 list-inside list-disc space-y-1 text-xs">
        {#each planner.fileWarnings as warning, index (`${warning}-${index}`)}
          <li>{warning}</li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if planner.validationIssues.length > 0}
    <div
      class="mt-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning"
      data-testid={missionWorkspaceTestIds.warningValidation}
    >
      <p class="font-semibold">Validation issues stay inline with the mission toolbar</p>
      <ul class="mt-2 list-inside list-disc space-y-1 text-xs">
        {#each planner.validationIssues as issue, index (`${issue.code}-${index}`)}
          <li>
            [{issue.severity}] {issue.code}{typeof issue.seq === "number" ? ` @seq ${issue.seq}` : ""}: {issue.message}
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if view.status === "bootstrapping" && !view.workspaceMounted}
    <section
      class="mt-4 rounded-[24px] border border-border bg-bg-secondary/60 p-5"
      data-testid={missionWorkspaceTestIds.bootstrapping}
    >
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Mission scope</p>
      <h3 class="mt-2 text-lg font-semibold text-text-primary">Loading the planner domain</h3>
      <p class="mt-2 text-sm text-text-secondary">
        IronWing is subscribing the mission planner to the active session scope before entry actions unlock.
      </p>
    </section>
  {:else if !view.workspaceMounted}
    <section
      class="mt-4 rounded-[24px] border border-border bg-bg-secondary/60 p-5"
      data-testid={view.status === "unavailable" ? missionWorkspaceTestIds.unavailable : missionWorkspaceTestIds.empty}
    >
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Mission entry</p>
      <h3 class="mt-2 text-lg font-semibold text-text-primary">
        {view.status === "unavailable" ? "Start planning locally or reconnect for vehicle sync" : "Start this scope with a real mission entry action"}
      </h3>
      <p class="mt-2 text-sm text-text-secondary">
        {view.status === "unavailable"
          ? "The Mission tab is mounted even without an active vehicle scope. Import a .plan or start a blank draft now, then reconnect later for live reads, validation, upload, and clear flows."
          : "Start from a vehicle download, a truthful .plan import, or a blank mission. Once you choose an entry action, Home, manual items, and preserved survey blocks stay mounted in the active workspace."}
      </p>

      <div class="mt-5 grid gap-3 lg:grid-cols-3">
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
      class="mt-4 rounded-[24px] border border-border bg-bg-secondary/60 p-5"
      data-testid={missionWorkspaceTestIds.ready}
    >
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Mission workspace</p>
      <p class="mt-2 text-sm text-text-secondary" data-testid={missionWorkspaceTestIds.summary}>
        Home, manual mission items, first-class survey authoring, typed command editing, and map previews now share one mounted planning workspace instead of the old Mission placeholder shell.
      </p>

      <div class="mt-5 space-y-4">
        <MissionMap
          fallbackReference={resolveSurveyCreationAnchor(planner)}
          onCreateSurveyRegion={handleStartSurveyDraw}
          onDeleteSurveyRegion={handleDeleteSurveyRegion}
          onMoveHome={handleMoveHomeFromMap}
          onMoveMissionItem={handleMoveMissionItemFromMap}
          onSelectHome={missionPlannerStore.selectHome}
          onSelectMissionItem={handleSelectMissionItemFromMap}
          onSelectSurveyRegion={missionPlannerStore.selectSurveyRegion}
          onUpdateSurveyRegion={missionPlannerStore.updateAuthoredSurveyRegion}
          selectedSurveyRegion={selectedSurveyRegion}
          view={mapView}
        />

        <div class="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div class="space-y-4">
            <MissionHomeCard
              home={planner.home}
              onChange={missionPlannerStore.setHome}
              onSelect={missionPlannerStore.selectHome}
              selected={planner.selection.kind === "home"}
            />

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
      </div>
    </section>
  {/if}
</section>
