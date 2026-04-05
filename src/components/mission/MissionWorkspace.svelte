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
import MissionDraftList from "./MissionDraftList.svelte";
import MissionHomeCard from "./MissionHomeCard.svelte";
import MissionInspector from "./MissionInspector.svelte";
import MissionWorkspaceHeader from "./MissionWorkspaceHeader.svelte";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

const missionPlannerStore = getMissionPlannerStoreContext();
const missionPlannerState = fromStore(missionPlannerStore);
const missionPlannerView = fromStore(getMissionPlannerViewStoreContext());

let localNote = $state<{ scopeKey: string; message: string } | null>(null);

let planner = $derived(missionPlannerState.current);
let view = $derived(missionPlannerView.current);
let scopeKey = $derived(scopeToKey(view.activeEnvelope));
let visibleLocalNote = $derived(localNote?.scopeKey === scopeKey ? localNote.message : null);
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

function scopeToKey(activeEnvelope: MissionPlannerView["activeEnvelope"]): string {
  if (!activeEnvelope) {
    return "no-scope";
  }

  return `${activeEnvelope.session_id}:${activeEnvelope.source_kind}:${activeEnvelope.seek_epoch}:${activeEnvelope.reset_revision}`;
}

function clearLocalNote() {
  localNote = null;
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

async function handleReadFromVehicle() {
  clearLocalNote();
  await missionPlannerStore.downloadFromVehicle();
}

async function handleImportPlan() {
  clearLocalNote();
  await missionPlannerStore.importFromPicker();
}

function handleNewMission() {
  clearLocalNote();
  missionPlannerStore.replaceWorkspace(createEmptyMissionPlannerWorkspace());
  localNote = {
    scopeKey,
    message:
      canUseVehicleActions
        ? "Blank mission draft ready. Home, manual list editing, and preserved survey blocks stay mounted in this scope."
        : "Blank local mission draft ready. Keep editing locally now and reconnect later for vehicle reads, validation, and transfer flows.",
  };
}

async function handleExportPlan() {
  clearLocalNote();
  await missionPlannerStore.exportToPicker();
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
  await missionPlannerStore.clearVehicle();
}

async function handleCancelTransfer() {
  await missionPlannerStore.cancelTransfer();
}

function confirmPrompt() {
  clearLocalNote();
  missionPlannerStore.confirmReplacePrompt();
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
      class="mt-4 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success"
      data-testid={missionWorkspaceTestIds.localNote}
    >
      {visibleLocalNote}
    </div>
  {/if}

  {#if planner.fileWarnings.length > 0}
    <div
      class="mt-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning"
      data-testid={`${missionWorkspaceTestIds.warningPrefix}-file`}
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
      data-testid={`${missionWorkspaceTestIds.warningPrefix}-validation`}
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
        Home, manual mission items, typed command editing, and preserved survey blocks now share one mounted planning workspace instead of the old Mission placeholder shell.
      </p>

      <div class="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div class="space-y-4">
          <MissionHomeCard
            home={planner.home}
            onChange={missionPlannerStore.setHome}
            onSelect={missionPlannerStore.selectHome}
            selected={planner.selection.kind === "home"}
          />

          <MissionDraftList
            items={missionItems}
            onAddMissionItem={missionPlannerStore.addMissionItem}
            onDeleteMissionItem={missionPlannerStore.deleteMissionItem}
            onMoveMissionItemDown={missionPlannerStore.moveMissionItemDownByIndex}
            onMoveMissionItemUp={missionPlannerStore.moveMissionItemUpByIndex}
            onSelectMissionItem={missionPlannerStore.selectMissionItem}
            onSelectSurveyBlock={missionPlannerStore.selectSurveyRegion}
            selectedMissionUiId={selectedMissionUiId}
            selectedSurface={planner.selection}
            surveyBlocks={surveyBlocks}
          />
        </div>

        <MissionInspector
          home={planner.home}
          item={selectedMissionItem}
          onUpdateAltitude={missionPlannerStore.updateMissionItemAltitude}
          onUpdateCommand={missionPlannerStore.updateMissionItemCommand}
          onUpdateLatitude={missionPlannerStore.updateMissionItemLatitude}
          onUpdateLongitude={missionPlannerStore.updateMissionItemLongitude}
          previousItem={previousMissionItem}
          selectedSurveyRegion={selectedSurveyRegion}
          selection={planner.selection}
        />
      </div>
    </section>
  {/if}
</section>
