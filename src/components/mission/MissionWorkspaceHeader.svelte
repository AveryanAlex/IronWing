<script lang="ts">
import type {
  MissionPlannerAttachmentState,
  MissionPlannerMode,
} from "../../lib/stores/mission-planner";
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
</script>

<header class="mission-toolbar" data-testid={missionWorkspaceTestIds.header}>
  <!-- Mode tabs -->
  <div class="mission-toolbar__modes">
    {#each modeButtons as item (item.mode)}
      <button
        class="mission-toolbar__mode-btn"
        class:is-active={item.mode === mode}
        data-testid={item.testId}
        onclick={() => onSelectMode(item.mode)}
        type="button"
      >{item.label}</button>
    {/each}
  </div>

  <span class="mission-toolbar__sep" aria-hidden="true"></span>

  <!-- Undo/Redo -->
  <button class="mission-toolbar__icon-btn" data-testid={missionWorkspaceTestIds.toolbarUndo} disabled={!undoAvailable} onclick={onUndo} aria-label={undoLabel} title={undoLabel} type="button">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
  </button>
  <button class="mission-toolbar__icon-btn" data-testid={missionWorkspaceTestIds.toolbarRedo} disabled={!redoAvailable} onclick={onRedo} aria-label={redoLabel} title={redoLabel} type="button">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>
  </button>

  <span class="mission-toolbar__sep" aria-hidden="true"></span>

  <!-- New / Import / Export -->
  <button class="mission-toolbar__icon-btn" data-testid={missionWorkspaceTestIds.toolbarNew} disabled={busy} onclick={onNewMission} aria-label="New mission" title="New mission" type="button">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
  </button>
  <button class="mission-toolbar__icon-btn" data-testid={missionWorkspaceTestIds.toolbarImport} disabled={busy} onclick={onImport} aria-label="Import mission or KML/KMZ file" title="Import mission or KML/KMZ file" type="button">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1"/><path d="M3 10h18l-2 8a2 2 0 0 1-2 1H5a2 2 0 0 1-2-1z"/></svg>
  </button>
  <button class="mission-toolbar__icon-btn" data-testid={missionWorkspaceTestIds.toolbarExport} disabled={busy || !hasContent} onclick={onExportPlan} aria-label="Export mission file" title="Export mission file" type="button">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>
  </button>

  <span class="mission-toolbar__sep" aria-hidden="true"></span>

  <!-- Vehicle actions -->
  <button class="mission-toolbar__icon-btn" data-testid={missionWorkspaceTestIds.toolbarRead} disabled={busy || !canUseVehicleActions} onclick={onReadFromVehicle} aria-label="Read from vehicle" title="Read from vehicle" type="button">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v11"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/></svg>
  </button>
  <button class="mission-toolbar__icon-btn" data-testid={missionWorkspaceTestIds.toolbarUpload} disabled={busy || !canUseVehicleActions || !hasContent} onclick={onUploadToVehicle} aria-label="Write to vehicle" title="Write to vehicle" type="button">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V10"/><path d="m7 13 5-5 5 5"/><path d="M5 3h14"/></svg>
  </button>

  {#if canCancel}
    <span class="mission-toolbar__sep" aria-hidden="true"></span>
    <button class="mission-toolbar__text-btn mission-toolbar__text-btn--warning" data-testid={missionWorkspaceTestIds.toolbarCancel} onclick={onCancelTransfer} type="button">Cancel</button>
  {/if}
</header>

<style>
  .mission-toolbar {
    display: flex; align-items: center; gap: 4px;
    padding: 4px 8px; border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-secondary); flex-shrink: 0;
  }
  .mission-toolbar__sep { width: 1px; height: 20px; background: var(--color-border); margin: 0 4px; }
  .mission-toolbar__modes { display: flex; gap: 2px; }
  .mission-toolbar__mode-btn {
    padding: 4px 10px; font-size: 0.75rem; font-weight: 600;
    border: 1px solid var(--color-border); border-radius: 6px;
    background: var(--color-bg-primary); color: var(--color-text-secondary); cursor: pointer; transition: all 0.1s;
  }
  .mission-toolbar__mode-btn.is-active { border-color: var(--color-accent); color: var(--color-accent); background: rgba(18,185,255,0.08); }
  .mission-toolbar__icon-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 32px; height: 32px; border: none; border-radius: 6px;
    background: transparent; color: var(--color-text-primary); cursor: pointer; transition: all 0.1s;
  }
  .mission-toolbar__icon-btn:hover:not(:disabled) { background: var(--color-bg-tertiary); }
  .mission-toolbar__icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .mission-toolbar__text-btn {
    padding: 4px 12px; font-size: 0.75rem; font-weight: 600;
    border: 1px solid var(--color-border); border-radius: 6px;
    background: var(--color-bg-secondary); color: var(--color-text-primary); cursor: pointer; transition: all 0.1s;
  }
  .mission-toolbar__text-btn:hover:not(:disabled) { border-color: var(--color-accent); color: var(--color-accent); }
  .mission-toolbar__text-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .mission-toolbar__text-btn--warning { border-color: var(--color-warning); color: var(--color-warning); }
</style>
