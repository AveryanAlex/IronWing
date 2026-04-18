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
  onImportPlan: () => void;
  onExportPlan: () => void;
  onValidateMission: () => void;
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
  onImportPlan,
  onExportPlan,
  onValidateMission,
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
  <button class="mission-toolbar__icon-btn" data-testid={missionWorkspaceTestIds.toolbarUndo} disabled={!undoAvailable} onclick={onUndo} title={undoLabel} type="button">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
  </button>
  <button class="mission-toolbar__icon-btn" data-testid={missionWorkspaceTestIds.toolbarRedo} disabled={!redoAvailable} onclick={onRedo} title={redoLabel} type="button">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></svg>
  </button>

  <span class="mission-toolbar__sep" aria-hidden="true"></span>

  <!-- Import/Export -->
  <button class="mission-toolbar__icon-btn" data-testid={missionWorkspaceTestIds.toolbarImport} disabled={busy} onclick={onImportPlan} title="Import mission file" type="button">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22h14a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v4"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M3 15h6"/><path d="M6 12v6"/></svg>
  </button>
  <button class="mission-toolbar__icon-btn" data-testid={missionWorkspaceTestIds.toolbarExport} disabled={busy || !hasContent} onclick={onExportPlan} title="Export mission file" type="button">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M12 18v-6"/><path d="m9 15 3-3 3 3"/></svg>
  </button>

  <span class="mission-toolbar__sep" aria-hidden="true"></span>

  <!-- Validate -->
  <button class="mission-toolbar__icon-btn" data-testid={missionWorkspaceTestIds.toolbarValidate} disabled={busy || !canUseVehicleActions || !hasContent} onclick={onValidateMission} title="Validate mission" type="button">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
  </button>

  <span class="mission-toolbar__sep" aria-hidden="true"></span>

  <!-- Vehicle actions (text) -->
  <button class="mission-toolbar__text-btn mission-toolbar__text-btn--primary" data-testid={missionWorkspaceTestIds.toolbarRead} disabled={busy || !canUseVehicleActions} onclick={onReadFromVehicle} type="button">Read from vehicle</button>
  <button class="mission-toolbar__text-btn" data-testid={missionWorkspaceTestIds.toolbarUpload} disabled={busy || !canUseVehicleActions || !hasContent} onclick={onUploadToVehicle} type="button">Write to vehicle</button>

  {#if canCancel}
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
  .mission-toolbar__text-btn--primary { background: var(--color-accent); border-color: var(--color-accent); color: var(--color-bg-primary); }
  .mission-toolbar__text-btn--primary:hover:not(:disabled) { filter: brightness(1.1); color: var(--color-bg-primary); }
  .mission-toolbar__text-btn--warning { border-color: var(--color-warning); color: var(--color-warning); }
</style>
