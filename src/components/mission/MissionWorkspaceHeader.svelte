<script lang="ts">
import type { MissionPlannerWorkspaceStatus } from "../../lib/stores/mission-planner-view";
import type { MissionPlannerView } from "../../lib/stores/mission-planner-view";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

type Props = {
  status: MissionPlannerWorkspaceStatus;
  readiness: MissionPlannerView["readiness"];
  scopeText: string;
  dirty: boolean;
  missionItemCount: number;
  surveyRegionCount: number;
  validationIssueCount: number;
  fileWarningCount: number;
  hasContent: boolean;
  canUseVehicleActions: boolean;
  busy: boolean;
  timedOut: boolean;
  canCancel: boolean;
  onReadFromVehicle: () => void;
  onImportPlan: () => void;
  onNewMission: () => void;
  onExportPlan: () => void;
  onValidateMission: () => void;
  onUploadToVehicle: () => void;
  onClearVehicle: () => void;
  onCancelTransfer: () => void;
};

let {
  status,
  readiness,
  scopeText,
  dirty,
  missionItemCount,
  surveyRegionCount,
  validationIssueCount,
  fileWarningCount,
  hasContent,
  canUseVehicleActions,
  busy,
  timedOut,
  canCancel,
  onReadFromVehicle,
  onImportPlan,
  onNewMission,
  onExportPlan,
  onValidateMission,
  onUploadToVehicle,
  onClearVehicle,
  onCancelTransfer,
}: Props = $props();

function statusText(value: MissionPlannerWorkspaceStatus): string {
  switch (value) {
    case "bootstrapping":
      return "Loading mission scope";
    case "unavailable":
      return "Local-only mode";
    case "empty":
      return "Mission ready to start";
    case "ready":
    default:
      return "Mission workspace active";
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

function workspaceSummary(value: MissionPlannerWorkspaceStatus): string {
  switch (value) {
    case "bootstrapping":
      return "The mission domain is wiring itself to the active scope before planner actions unlock.";
    case "unavailable":
      return "Import a .plan or start a local draft now, then reconnect later for vehicle reads and transfers.";
    case "empty":
      return "Start from vehicle data, a .plan import, or a blank draft before deeper list and map editors take over.";
    case "ready":
    default:
      return "The shipped Mission tab now owns the planner surface, with inline transfer state, replace prompts, and truthful scope diagnostics.";
  }
}
</script>

<header
  class="rounded-lg border border-border bg-bg-primary p-4"
  data-readiness={readiness}
  data-workspace-state={status}
  data-testid={missionWorkspaceTestIds.header}
>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Mission workspace</p>
      <h2 class="mt-1 text-base font-semibold text-text-primary">Active planner entry shell</h2>
      <p class="mt-1 text-sm text-text-secondary">{workspaceSummary(status)}</p>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <span
        class={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${readinessClass(readiness)}`}
        data-testid={missionWorkspaceTestIds.state}
      >
        {statusText(status)}
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

  <div class="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
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
      Manual items · {missionItemCount}
    </p>
    <p
      class="rounded-lg border border-border bg-bg-secondary px-3 py-2 text-xs text-text-secondary"
      data-testid={missionWorkspaceTestIds.countsSurvey}
    >
      Survey blocks · {surveyRegionCount}
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
      File warnings · {fileWarningCount}
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
      data-testid={missionWorkspaceTestIds.toolbarNew}
      disabled={busy}
      onclick={onNewMission}
      type="button"
    >
      New mission
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
      Validate
    </button>
    <button
      class="rounded-full border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
      data-testid={missionWorkspaceTestIds.toolbarUpload}
      disabled={busy || !canUseVehicleActions || !hasContent}
      onclick={onUploadToVehicle}
      type="button"
    >
      Upload
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
