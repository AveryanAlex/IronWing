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
let secondaryItems = $derived<MenuItem[]>([
  {
    id: "read",
    label: "Read from vehicle",
    testId: missionWorkspaceTestIds.toolbarRead,
    disabled: busy || !attachment.canUseVehicleActions || !canUseVehicleActions,
    onSelect: onReadFromVehicle,
  },
  {
    id: "import",
    label: "Import mission or KML/KMZ file",
    testId: missionWorkspaceTestIds.toolbarImport,
    disabled: busy || !attachment.canEdit,
    onSelect: onImport,
  },
  {
    id: "export",
    label: "Export mission file",
    testId: missionWorkspaceTestIds.toolbarExport,
    disabled: busy || !hasContent,
    onSelect: onExportPlan,
  },
  {
    id: "new",
    label: "New mission",
    testId: missionWorkspaceTestIds.toolbarNew,
    disabled: busy || !attachment.canEdit,
    onSelect: onNewMission,
  },
]);
</script>

<div class="mission-toolbar-shell" data-testid={missionWorkspaceTestIds.header}>
  {#if replayReadonly}
    <div data-testid={missionWorkspaceTestIds.headerReplayReadonly}>
      <Banner
        message={REPLAY_READONLY_COPY}
        severity="warning"
        title={REPLAY_READONLY_TITLE}
      />
    </div>
  {/if}

  <Toolbar ariaLabel="Mission actions" wrap>
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
        disabled={uploadDisabled}
        onclick={onUploadToVehicle}
        size="sm"
        testId={missionWorkspaceTestIds.toolbarUpload}
        tone="accent"
      >
        Upload
      </Button>
      {#if canCancel}
        <Button
          onclick={onCancelTransfer}
          size="sm"
          testId={missionWorkspaceTestIds.toolbarCancel}
          tone="warning"
        >
          Cancel
        </Button>
      {/if}
    </ToolbarGroup>

    <Menu
      items={secondaryItems}
      testId={missionWorkspaceTestIds.toolbarMoreButton}
      triggerLabel="More"
    />
  </Toolbar>
</div>

<style>
.mission-toolbar-shell {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  flex-shrink: 0;
}
</style>
