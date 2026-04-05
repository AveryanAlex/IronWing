<script lang="ts">
import type {
  MissionPlannerAttachmentState,
  MissionPlannerMode,
} from "../../lib/stores/mission-planner";
import type { MissionPlannerWorkspaceStatus } from "../../lib/stores/mission-planner-view";
import type { MissionPlannerView } from "../../lib/stores/mission-planner-view";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

type Props = {
  mode: MissionPlannerMode;
  status: MissionPlannerWorkspaceStatus;
  readiness: MissionPlannerView["readiness"];
  attachment: MissionPlannerAttachmentState;
  scopeText: string;
  dirty: boolean;
  missionItemCount: number;
  surveyRegionCount: number;
  fenceRegionCount: number;
  rallyPointCount: number;
  validationIssueCount: number;
  warningCount: number;
  hasContent: boolean;
  canUseVehicleActions: boolean;
  busy: boolean;
  timedOut: boolean;
  canCancel: boolean;
  onSelectMode: (mode: MissionPlannerMode) => void;
  onReadFromVehicle: () => void;
  onImportPlan: () => void;
  onImportKml: () => void;
  onNewMission: () => void;
  onExportPlan: () => void;
  onValidateMission: () => void;
  onUploadToVehicle: () => void;
  onClearVehicle: () => void;
  onCancelTransfer: () => void;
};

let {
  mode,
  status,
  readiness,
  attachment,
  scopeText,
  dirty,
  missionItemCount,
  surveyRegionCount,
  fenceRegionCount,
  rallyPointCount,
  validationIssueCount,
  warningCount,
  hasContent,
  canUseVehicleActions,
  busy,
  timedOut,
  canCancel,
  onSelectMode,
  onReadFromVehicle,
  onImportPlan,
  onImportKml,
  onNewMission,
  onExportPlan,
  onValidateMission,
  onUploadToVehicle,
  onClearVehicle,
  onCancelTransfer,
}: Props = $props();

const modeButtons = [
  { mode: "mission", label: "Mission", testId: missionWorkspaceTestIds.modeMission },
  { mode: "fence", label: "Fence", testId: missionWorkspaceTestIds.modeFence },
  { mode: "rally", label: "Rally", testId: missionWorkspaceTestIds.modeRally },
] as const;

function statusText(value: MissionPlannerWorkspaceStatus): string {
  switch (value) {
    case "bootstrapping":
      return "Loading planner";
    case "unavailable":
      return "No live session";
    case "empty":
      return "Planner ready to start";
    case "ready":
    default:
      return "Planner workspace active";
  }
}

function readinessBadge(value: MissionPlannerView["readiness"]): string {
  switch (value) {
    case "bootstrapping":
      return "Bootstrapping";
    case "unavailable":
      return "Unavailable";
    case "degraded":
      return "Degraded";
    case "ready":
    default:
      return "Ready";
  }
}

function readinessClass(value: MissionPlannerView["readiness"]): string {
  switch (value) {
    case "degraded":
      return "border-warning/40 bg-warning/10 text-warning";
    case "unavailable":
      return "border-border bg-bg-secondary text-text-secondary";
    case "bootstrapping":
      return "border-accent/30 bg-accent/10 text-accent";
    case "ready":
    default:
      return "border-success/30 bg-success/10 text-success";
  }
}

function attachmentClass(current: MissionPlannerAttachmentState): string {
  switch (current.kind) {
    case "live-attached":
      return "border-success/30 bg-success/10 text-success";
    case "local-draft":
      return "border-accent/30 bg-accent/10 text-accent";
    case "playback-readonly":
    case "detached-local":
    default:
      return "border-warning/40 bg-warning/10 text-warning";
  }
}

function workspaceSummary(currentMode: MissionPlannerMode, value: MissionPlannerWorkspaceStatus): string {
  if (currentMode === "fence") {
    return "Fence continuity lives in the active planner shell now: attachment truth, warning review, and file workflow stay visible even before dedicated fence editors expand in the next task.";
  }

  if (currentMode === "rally") {
    return "Rally continuity shares the same planner shell. Attachment truth, sticky warnings, and mixed-domain export review stay mounted while rally-specific editors land next.";
  }

  switch (value) {
    case "bootstrapping":
      return "The planner domain is wiring itself to the active session scope before live actions unlock.";
    case "unavailable":
      return "Import a file or start a local draft now, then reconnect later for live validation and transfer flows.";
    case "empty":
      return "Start from live data, a truthful file import, or a blank draft before deeper mission, fence, and rally continuity takes over.";
    case "ready":
    default:
      return "Mission, fence, rally, Home, review state, and warning truth now share one mounted planning shell instead of one-shot replace prompts.";
  }
}
</script>

<header
  class="rounded-lg border border-border bg-bg-primary p-4"
  data-readiness={readiness}
  data-workspace-state={status}
  data-testid={missionWorkspaceTestIds.header}
>
  <div class="flex flex-wrap items-start justify-between gap-4">
    <div class="max-w-3xl">
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Mission workspace</p>
      <h2 class="mt-1 text-base font-semibold text-text-primary">Planning continuity shell</h2>
      <p class="mt-1 text-sm text-text-secondary">{workspaceSummary(mode, status)}</p>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <span
        class={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${readinessClass(readiness)}`}
        data-testid={missionWorkspaceTestIds.state}
      >
        {statusText(status)}
      </span>

      <span
        class={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${attachmentClass(attachment)}`}
        data-testid={missionWorkspaceTestIds.attachment}
      >
        {attachment.label}
      </span>

      <span class="inline-flex items-center rounded-full border border-border bg-bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">
        {readinessBadge(readiness)}
      </span>

      {#if dirty}
        <span class="inline-flex items-center rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-warning">
          Modified
        </span>
      {/if}

      {#if timedOut}
        <span class="inline-flex items-center rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-warning">
          Timed out
        </span>
      {/if}
    </div>
  </div>

  <p class="mt-3 text-xs text-text-secondary" data-testid={missionWorkspaceTestIds.attachmentDetail}>
    {attachment.detail}
  </p>

  <div class="mt-4 rounded-2xl border border-border bg-bg-secondary/60 p-2" data-testid={missionWorkspaceTestIds.modeShell}>
    <div class="grid gap-2 sm:grid-cols-3">
      {#each modeButtons as item (item.mode)}
        <button
          class={`rounded-[16px] border px-4 py-3 text-left text-sm font-semibold transition ${item.mode === mode
            ? "border-accent/40 bg-accent/10 text-accent"
            : "border-border bg-bg-primary text-text-primary hover:border-accent hover:text-accent"}`}
          data-testid={item.testId}
          onclick={() => onSelectMode(item.mode)}
          type="button"
        >
          <span class="block text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Mode</span>
          <span class="mt-1 block">{item.label}</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-7">
    <p
      class="rounded-lg border border-border bg-bg-secondary px-3 py-2 text-xs text-text-secondary"
      data-testid={missionWorkspaceTestIds.scope}
    >
      Scope · {scopeText}
    </p>
    <p
      class="rounded-lg border border-border bg-bg-secondary px-3 py-2 text-xs text-text-secondary"
      data-testid={missionWorkspaceTestIds.countsMission}
    >
      Mission + Home + Survey · {missionItemCount} / {surveyRegionCount}
    </p>
    <p
      class="rounded-lg border border-border bg-bg-secondary px-3 py-2 text-xs text-text-secondary"
      data-testid={missionWorkspaceTestIds.countsFence}
    >
      Fence regions · {fenceRegionCount}
    </p>
    <p
      class="rounded-lg border border-border bg-bg-secondary px-3 py-2 text-xs text-text-secondary"
      data-testid={missionWorkspaceTestIds.countsRally}
    >
      Rally points · {rallyPointCount}
    </p>
    <p
      class="rounded-lg border border-border bg-bg-secondary px-3 py-2 text-xs text-text-secondary"
      data-testid={missionWorkspaceTestIds.countsValidation}
    >
      Validation issues · {validationIssueCount}
    </p>
    <p
      class="rounded-lg border border-border bg-bg-secondary px-3 py-2 text-xs text-text-secondary"
      data-testid={missionWorkspaceTestIds.countsWarnings}
    >
      Sticky warnings · {warningCount}
    </p>
    <p
      class="rounded-lg border border-border bg-bg-secondary px-3 py-2 text-xs text-text-secondary"
      data-testid={missionWorkspaceTestIds.countsSurvey}
    >
      Survey blocks · {surveyRegionCount}
    </p>
  </div>

  <div class="mt-4 flex flex-wrap items-center gap-2">
    <button
      class="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg-primary transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={missionWorkspaceTestIds.toolbarRead}
      disabled={busy || !canUseVehicleActions}
      onclick={onReadFromVehicle}
      type="button"
    >
      Read from Vehicle
    </button>
    <button
      class="rounded-full border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={missionWorkspaceTestIds.toolbarImport}
      disabled={busy}
      onclick={onImportPlan}
      type="button"
    >
      Import .plan
    </button>
    <button
      class="rounded-full border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={missionWorkspaceTestIds.toolbarImportKml}
      disabled={busy}
      onclick={onImportKml}
      type="button"
    >
      Import .kml / .kmz
    </button>
    <button
      class="rounded-full border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={missionWorkspaceTestIds.toolbarNew}
      disabled={busy}
      onclick={onNewMission}
      type="button"
    >
      New draft
    </button>
    <button
      class="rounded-full border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={missionWorkspaceTestIds.toolbarExport}
      disabled={busy || !hasContent}
      onclick={onExportPlan}
      type="button"
    >
      Export .plan
    </button>
    <button
      class="rounded-full border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={missionWorkspaceTestIds.toolbarValidate}
      disabled={busy || !canUseVehicleActions || !hasContent}
      onclick={onValidateMission}
      type="button"
    >
      Validate mission
    </button>
    <button
      class="rounded-full border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={missionWorkspaceTestIds.toolbarUpload}
      disabled={busy || !canUseVehicleActions || !hasContent}
      onclick={onUploadToVehicle}
      type="button"
    >
      Upload workspace
    </button>
    <button
      class="rounded-full border border-danger/40 bg-danger/10 px-4 py-2 text-sm font-semibold text-danger transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={missionWorkspaceTestIds.toolbarClear}
      disabled={busy || !canUseVehicleActions}
      onclick={onClearVehicle}
      type="button"
    >
      Clear vehicle
    </button>

    {#if canCancel}
      <button
        class="rounded-full border border-warning/40 bg-warning/10 px-4 py-2 text-sm font-semibold text-warning transition hover:brightness-105"
        data-testid={missionWorkspaceTestIds.toolbarCancel}
        onclick={onCancelTransfer}
        type="button"
      >
        Cancel pending transfer
      </button>
    {/if}
  </div>
</header>
