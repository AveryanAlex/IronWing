<script lang="ts">
import {
  Check,
  Download,
  FileDown,
  FilePlus,
  FileUp,
  MoreHorizontal,
  Redo2,
  Undo2,
  Upload,
  X,
} from "lucide-svelte";
import type {
  MissionPlannerAttachmentState,
  MissionPlannerMode,
} from "../../../lib/stores/mission-planner";
import type { SurveyPatternType } from "../../../lib/survey-region";
import { REPLAY_READONLY_COPY, REPLAY_READONLY_TITLE } from "../../../lib/replay-readonly";
import { Banner, Menu, type MenuItem, Toolbar, ToolbarButton, ToolbarGroup, Tooltip } from "../../../components/ui";
import { missionWorkspaceTestIds } from "../mission-workspace-test-ids";

type Props = {
  mode: MissionPlannerMode;
  attachment: MissionPlannerAttachmentState;
  hasContent: boolean;
  canUseVehicleActions: boolean;
  busy: boolean;
  uploading: boolean;
  uploaded: boolean;
  canCancel: boolean;
  canUndo: boolean;
  undoCount: number;
  canRedo: boolean;
  redoCount: number;
  onSelectMode: (mode: MissionPlannerMode) => void;
  onAddMissionItem: () => void;
  onAddSurveyBlock: (patternType: SurveyPatternType) => void;
  onUndo: () => void;
  onRedo: () => void;
  onReadFromVehicle: () => void;
  onImport: () => void;
  onExportPlan: () => void;
  onNewMission: () => void;
  onUploadToVehicle: () => void;
  onCancelTransfer: () => void;
};

let {
  mode,
  attachment,
  hasContent,
  canUseVehicleActions,
  busy,
  uploading,
  uploaded,
  canCancel,
  canUndo,
  undoCount,
  canRedo,
  redoCount,
  onSelectMode,
  onAddMissionItem,
  onAddSurveyBlock,
  onUndo,
  onRedo,
  onReadFromVehicle,
  onImport,
  onExportPlan,
  onNewMission,
  onUploadToVehicle,
  onCancelTransfer,
}: Props = $props();

const modeButtons = [
  { mode: "mission", label: "Mission", testId: missionWorkspaceTestIds.modeMission },
  { mode: "fence", label: "Fence", testId: missionWorkspaceTestIds.modeFence },
  { mode: "rally", label: "Rally", testId: missionWorkspaceTestIds.modeRally },
] as const;

function normalizeHistoryCount(count: number): number {
  return Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0;
}

let normalizedUndoCount = $derived(normalizeHistoryCount(undoCount));
let normalizedRedoCount = $derived(normalizeHistoryCount(redoCount));
let undoAvailable = $derived(attachment.canEdit && canUndo && normalizedUndoCount > 0);
let redoAvailable = $derived(attachment.canEdit && canRedo && normalizedRedoCount > 0);
let missionCreateAvailable = $derived(mode === "mission" && attachment.canEdit && !busy);
let undoLabel = $derived(`Undo (${normalizedUndoCount} available)`);
let redoLabel = $derived(`Redo (${normalizedRedoCount} available)`);
let replayReadonly = $derived(attachment.kind === "playback-readonly");
let uploadedIdle = $derived(uploaded && !busy);
let vehicleDisconnected = $derived(!canUseVehicleActions);
let uploadDisabled = $derived(
  !uploading && !uploadedIdle && (busy || vehicleDisconnected),
);
let uploadTone = $derived<"warning" | "success" | "accent">(uploading ? "warning" : uploadedIdle ? "success" : "accent");
let uploadAriaLabel = $derived(uploading ? "Cancel upload" : uploadedIdle ? "Uploaded to vehicle" : "Upload to vehicle");
let uploadLabel = $derived(uploading ? "Cancel" : uploadedIdle ? "Uploaded" : "Upload");
let uploadTooltipLabel = $derived(vehicleDisconnected ? "Connect a vehicle to upload the mission." : uploadAriaLabel);
let readVehicleTitle = $derived(vehicleDisconnected ? "Connect a vehicle to read planning state." : undefined);
let clearLabel = $derived(
  mode === "fence" ? "Clear fence" : mode === "rally" ? "Clear rally" : "Clear mission",
);
let activeModeLabel = $derived(modeButtons.find((item) => item.mode === mode)?.label ?? "Mode");
let modeItems = $derived<MenuItem[]>(
  modeButtons.map((item) => ({
    id: `mode-${item.mode}`,
    label: item.label,
    testId: item.testId,
    disabled: item.mode === mode,
    onSelect: () => onSelectMode(item.mode),
  })),
);
let secondaryItems = $derived<MenuItem[]>([
  {
    id: "read",
    label: "Read from vehicle",
    testId: missionWorkspaceTestIds.toolbarRead,
    disabled: busy || vehicleDisconnected,
    title: readVehicleTitle,
    icon: readIcon,
    onSelect: onReadFromVehicle,
  },
  {
    id: "import",
    label: "Import mission or KML/KMZ file",
    testId: missionWorkspaceTestIds.toolbarImport,
    disabled: busy || !attachment.canEdit,
    icon: importIcon,
    onSelect: onImport,
  },
  {
    id: "export",
    label: "Export mission file",
    testId: missionWorkspaceTestIds.toolbarExport,
    disabled: busy || !hasContent,
    icon: exportIcon,
    onSelect: onExportPlan,
  },
  {
    id: "new",
    label: clearLabel,
    testId: missionWorkspaceTestIds.toolbarNew,
    disabled: busy || !attachment.canEdit,
    icon: newIcon,
    onSelect: onNewMission,
  },
]);
</script>

{#snippet readIcon()}
  <Download aria-hidden="true" size={16} />
{/snippet}
{#snippet importIcon()}
  <FileUp aria-hidden="true" size={16} />
{/snippet}
{#snippet exportIcon()}
  <FileDown aria-hidden="true" size={16} />
{/snippet}
{#snippet newIcon()}
  <FilePlus aria-hidden="true" size={16} />
{/snippet}
{#snippet uploadIcon()}
  <Upload aria-hidden="true" size={16} />
{/snippet}
{#snippet uploadedIcon()}
  <Check aria-hidden="true" size={16} />
{/snippet}
{#snippet cancelIcon()}
  <X aria-hidden="true" size={16} />
{/snippet}
{#snippet moreIcon()}
  <MoreHorizontal aria-hidden="true" size={16} />
{/snippet}

<div
  class="@container flex shrink-0 flex-col gap-[var(--space-2)] border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-[var(--space-3)] py-[var(--space-2)] @max-[520px]:[&_.ui-btn]:min-w-[var(--control-h-sm)] @max-[520px]:[&_.ui-btn]:px-2"
  data-testid={missionWorkspaceTestIds.header}
>
  {#if replayReadonly}
    <div data-testid={missionWorkspaceTestIds.headerReplayReadonly}>
      <Banner
        message={REPLAY_READONLY_COPY}
        severity="warning"
        title={REPLAY_READONLY_TITLE}
      />
    </div>
  {/if}

  <Toolbar ariaLabel="Mission actions" density="compact" overflow="scroll">
    <ToolbarGroup>
      <Menu
        items={modeItems}
        triggerToolbar
        triggerAriaLabel="Select mission editing mode"
        triggerClass="h-[var(--control-h-sm)] min-w-24 justify-between"
        triggerLabel={activeModeLabel}
      />
    </ToolbarGroup>

    {#if mode === "mission"}
      <ToolbarGroup>
        <ToolbarButton
          disabled={!missionCreateAvailable}
          onclick={onAddMissionItem}
          size="sm"
          testId={missionWorkspaceTestIds.listAdd}
        >
          Add waypoint
        </ToolbarButton>
        <ToolbarButton
          disabled={!missionCreateAvailable}
          onclick={() => onAddSurveyBlock("grid")}
          size="sm"
          testId={missionWorkspaceTestIds.listAddSurveyGrid}
          tone="success"
          variant="soft"
        >
          Grid survey
        </ToolbarButton>
        <ToolbarButton
          disabled={!missionCreateAvailable}
          onclick={() => onAddSurveyBlock("corridor")}
          size="sm"
          testId={missionWorkspaceTestIds.listAddSurveyCorridor}
          tone="success"
          variant="soft"
        >
          Corridor
        </ToolbarButton>
        <ToolbarButton
          disabled={!missionCreateAvailable}
          onclick={() => onAddSurveyBlock("structure")}
          size="sm"
          testId={missionWorkspaceTestIds.listAddSurveyStructure}
          tone="success"
          variant="soft"
        >
          Structure
        </ToolbarButton>
      </ToolbarGroup>
    {/if}

    <ToolbarGroup>
      <Tooltip label={undoLabel}>
        <ToolbarButton
          ariaLabel={undoLabel}
          disabled={!undoAvailable}
          onclick={onUndo}
          size="icon-sm"
          testId={missionWorkspaceTestIds.toolbarUndo}
          title={undoLabel}
          variant="secondary"
        >
          <Undo2 aria-hidden="true" size={16} />
        </ToolbarButton>
      </Tooltip>
      <Tooltip label={redoLabel}>
        <ToolbarButton
          ariaLabel={redoLabel}
          disabled={!redoAvailable}
          onclick={onRedo}
          size="icon-sm"
          testId={missionWorkspaceTestIds.toolbarRedo}
          title={redoLabel}
          variant="secondary"
        >
          <Redo2 aria-hidden="true" size={16} />
        </ToolbarButton>
      </Tooltip>
    </ToolbarGroup>

    <ToolbarGroup>
      <Tooltip label={uploadTooltipLabel}>
        <ToolbarButton
          ariaLabel={uploadAriaLabel}
          disabled={uploadDisabled}
          onclick={uploading ? onCancelTransfer : uploadedIdle ? undefined : onUploadToVehicle}
          size="sm"
          testId={missionWorkspaceTestIds.toolbarUpload}
          tone={uploadTone}
        >
          <span class="inline-flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">
            {#if uploading}
              {@render cancelIcon()}
            {:else if uploadedIdle}
              {@render uploadedIcon()}
            {:else}
              {@render uploadIcon()}
            {/if}
          </span>
          <span class="@max-[520px]:hidden">{uploadLabel}</span>
        </ToolbarButton>
      </Tooltip>
      {#if canCancel && !uploading}
        <ToolbarButton
          ariaLabel="Cancel transfer"
          onclick={onCancelTransfer}
          size="sm"
          testId={missionWorkspaceTestIds.toolbarCancel}
          tone="warning"
        >
          <span class="inline-flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">{@render cancelIcon()}</span>
          <span class="@max-[520px]:hidden">Cancel</span>
        </ToolbarButton>
      {/if}
    </ToolbarGroup>

    <ToolbarGroup>
      <Menu
        items={secondaryItems}
        testId={missionWorkspaceTestIds.toolbarMoreButton}
        triggerToolbar
        triggerClass="h-[var(--control-h-sm)] @max-[520px]:min-w-[var(--control-h-sm)] @max-[520px]:justify-center @max-[520px]:px-2"
        triggerAriaLabel="More mission actions"
        triggerIcon={moreIcon}
        triggerLabelClass="@max-[520px]:hidden"
        triggerLabel="More"
      />
    </ToolbarGroup>
  </Toolbar>
</div>
