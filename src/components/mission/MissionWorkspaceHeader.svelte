<script lang="ts">
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
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m6 11 6 6 6-6"/><path d="M5 21h14"/></svg>
{/snippet}
{#snippet importIcon()}
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M3 15h6"/><path d="M6 12v6"/></svg>
{/snippet}
{#snippet exportIcon()}
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 18v-6"/><path d="m9 15 3-3 3 3"/></svg>
{/snippet}
{#snippet newIcon()}
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M12 12v6"/><path d="M9 15h6"/></svg>
{/snippet}
{#snippet uploadIcon()}
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V9"/><path d="m6 15 6-6 6 6"/><path d="M5 3h14"/></svg>
{/snippet}
{#snippet cancelIcon()}
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
{/snippet}
{#snippet moreIcon()}
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
{/snippet}

<div
  class="flex shrink-0 flex-col gap-2 border-b border-border bg-bg-secondary px-3 py-2 [&_.ui-btn]:min-w-[var(--control-h-sm)] [&_.ui-btn]:px-2 sm:[&_.ui-btn]:min-w-0 sm:[&_.ui-btn]:px-3"
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
      <div class="hidden sm:block">
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
      <div class="sm:hidden">
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
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
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
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>
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
        <span class="hidden sm:inline">Upload</span>
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
          <span class="hidden sm:inline">Cancel</span>
        </Button>
      {/if}
    </ToolbarGroup>

    <div>
      <Menu
        items={secondaryItems}
        testId={missionWorkspaceTestIds.toolbarMoreButton}
        triggerClass="h-[var(--control-h-sm)] min-w-[var(--control-h-sm)] justify-center px-2 sm:min-w-0 sm:px-3"
        triggerAriaLabel="More mission actions"
        triggerIcon={moreIcon}
        triggerLabelClass="hidden sm:inline"
        triggerLabel="More"
      />
    </div>
  </Toolbar>
</div>
