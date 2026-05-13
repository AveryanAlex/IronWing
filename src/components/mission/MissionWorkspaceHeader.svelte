<script lang="ts">
import {
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
} from "../../lib/stores/mission-planner";
import { REPLAY_READONLY_COPY, REPLAY_READONLY_TITLE } from "../../lib/replay-readonly";
import { Banner, Button, IconButton, Menu, type MenuItem, Toolbar, ToolbarGroup, Tooltip } from "../ui";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

type Props = {
  mode: MissionPlannerMode;
  attachment: MissionPlannerAttachmentState;
  hasContent: boolean;
  canUseVehicleActions: boolean;
  busy: boolean;
  canCancel: boolean;
  canUndo: boolean;
  undoCount: number;
  canRedo: boolean;
  redoCount: number;
  onSelectMode: (mode: MissionPlannerMode) => void;
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
  canCancel,
  canUndo,
  undoCount,
  canRedo,
  redoCount,
  onSelectMode,
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
let undoLabel = $derived(`Undo (${normalizedUndoCount} available)`);
let redoLabel = $derived(`Redo (${normalizedRedoCount} available)`);
let replayReadonly = $derived(attachment.kind === "playback-readonly");
let uploadDisabled = $derived(
  busy || !attachment.canUseVehicleActions || !canUseVehicleActions || !hasContent,
);
let clearLabel = $derived(
  mode === "fence" ? "Clear fence" : mode === "rally" ? "Clear rally" : "Clear mission",
);
let activeModeLabel = $derived(modeButtons.find((item) => item.mode === mode)?.label ?? "Mode");
let modeItems = $derived<MenuItem[]>(
  modeButtons.map((item) => ({
    id: `mode-${item.mode}`,
    label: item.label,
    disabled: item.mode === mode,
    onSelect: () => onSelectMode(item.mode),
  })),
);
let secondaryItems = $derived<MenuItem[]>([
  {
    id: "read",
    label: "Read from vehicle",
    testId: missionWorkspaceTestIds.toolbarRead,
    disabled: busy || !attachment.canUseVehicleActions || !canUseVehicleActions,
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
    <div class="mission-mode-switcher">
      <div class="@max-[640px]:hidden">
        <ToolbarGroup>
          {#each modeButtons as item (item.mode)}
            <Button
              onclick={() => onSelectMode(item.mode)}
              size="sm"
              testId={item.testId}
              tone={item.mode === mode ? "accent" : "neutral"}
            >
              {item.label}
            </Button>
          {/each}
        </ToolbarGroup>
      </div>
      <div class="hidden @max-[640px]:block">
        <Menu
          items={modeItems}
          triggerAriaLabel="Select mission editing mode"
          triggerLabel={activeModeLabel}
        />
      </div>
    </div>

    <ToolbarGroup>
      <Tooltip label={undoLabel}>
        <IconButton
          ariaLabel={undoLabel}
          disabled={!undoAvailable}
          onclick={onUndo}
          size="sm"
          testId={missionWorkspaceTestIds.toolbarUndo}
          title={undoLabel}
        >
          <Undo2 aria-hidden="true" size={16} />
        </IconButton>
      </Tooltip>
      <Tooltip label={redoLabel}>
        <IconButton
          ariaLabel={redoLabel}
          disabled={!redoAvailable}
          onclick={onRedo}
          size="sm"
          testId={missionWorkspaceTestIds.toolbarRedo}
          title={redoLabel}
        >
          <Redo2 aria-hidden="true" size={16} />
        </IconButton>
      </Tooltip>
    </ToolbarGroup>

    <ToolbarGroup>
      <Button
        ariaLabel="Upload to vehicle"
        disabled={uploadDisabled}
        onclick={onUploadToVehicle}
        size="sm"
        testId={missionWorkspaceTestIds.toolbarUpload}
        tone="accent"
      >
        <span class="inline-flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">{@render uploadIcon()}</span>
        <span class="@max-[520px]:hidden">Upload</span>
      </Button>
      {#if canCancel}
        <Button
          ariaLabel="Cancel transfer"
          onclick={onCancelTransfer}
          size="sm"
          testId={missionWorkspaceTestIds.toolbarCancel}
          tone="warning"
        >
          <span class="inline-flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">{@render cancelIcon()}</span>
          <span class="@max-[520px]:hidden">Cancel</span>
        </Button>
      {/if}
    </ToolbarGroup>

    <div>
      <Menu
        items={secondaryItems}
        testId={missionWorkspaceTestIds.toolbarMoreButton}
        triggerClass="h-[var(--control-h-sm)] @max-[520px]:min-w-[var(--control-h-sm)] @max-[520px]:justify-center @max-[520px]:px-2"
        triggerAriaLabel="More mission actions"
        triggerIcon={moreIcon}
        triggerLabelClass="@max-[520px]:hidden"
        triggerLabel="More"
      />
    </div>
  </Toolbar>
</div>
