<script lang="ts">
import { commandDisplayName, type MissionItem } from "../../lib/mavkit-types";
import type { TypedDraftItem } from "../../lib/mission-draft-typed";
import type { SurveyRegion, SurveyRegionBlock, SurveyPatternType } from "../../lib/survey-region";
import type { MissionPlannerSelection } from "../../lib/stores/mission-planner";
import MissionSurveyBlockCard from "./MissionSurveyBlockCard.svelte";
import { missionWorkspaceTestIds } from "./mission-workspace-test-ids";

type SurveyListEntry = SurveyRegionBlock & {
  region: SurveyRegion;
};

type Props = {
  items: TypedDraftItem[];
  surveyBlocks: SurveyListEntry[];
  selectedSurface: MissionPlannerSelection;
  selectedMissionUiId: number | null;
  cruiseSpeed: number;
  onAddMissionItem: () => void;
  onAddSurveyBlock: (patternType: SurveyPatternType) => void;
  onSelectMissionItem: (index: number) => void;
  onMoveMissionItemUp: (index: number) => void;
  onMoveMissionItemDown: (index: number) => void;
  onDeleteMissionItem: (index: number) => void;
  onSelectSurveyBlock: (regionId: string) => void;
  onSetSurveyRegionCollapsed: (regionId: string, collapsed: boolean) => void;
  onGenerateSurveyRegion: (regionId: string) => Promise<unknown> | unknown;
  onPromptDissolveSurveyRegion: (regionId: string) => void;
  onDeleteSurveyRegion: (regionId: string) => void;
};

type ListEntry =
  | { kind: "mission-item"; item: TypedDraftItem }
  | { kind: "survey-block"; block: SurveyListEntry };

let {
  items,
  surveyBlocks,
  selectedSurface,
  selectedMissionUiId,
  cruiseSpeed,
  onAddMissionItem,
  onAddSurveyBlock,
  onSelectMissionItem,
  onMoveMissionItemUp,
  onMoveMissionItemDown,
  onDeleteMissionItem,
  onSelectSurveyBlock,
  onSetSurveyRegionCollapsed,
  onGenerateSurveyRegion,
  onPromptDissolveSurveyRegion,
  onDeleteSurveyRegion,
}: Props = $props();

let orderedEntries = $derived.by<ListEntry[]>(() => {
  const orderedBlocks = surveyBlocks
    .map((block, index) => ({ block, index }))
    .sort((left, right) => left.block.position - right.block.position || left.index - right.index)
    .map(({ block }) => block);
  const entries: ListEntry[] = [];
  let blockIndex = 0;

  const appendBlocksAt = (position: number) => {
    while (blockIndex < orderedBlocks.length && orderedBlocks[blockIndex]?.position === position) {
      const block = orderedBlocks[blockIndex];
      if (block) {
        entries.push({ kind: "survey-block", block });
      }
      blockIndex += 1;
    }
  };

  appendBlocksAt(0);

  items.forEach((item, index) => {
    entries.push({ kind: "mission-item", item });
    appendBlocksAt(index + 1);
  });

  while (blockIndex < orderedBlocks.length) {
    const block = orderedBlocks[blockIndex];
    if (block) {
      entries.push({ kind: "survey-block", block });
    }
    blockIndex += 1;
  }

  return entries;
});

function itemSummary(item: TypedDraftItem) {
  if (item.preview.latitude_deg === null || item.preview.longitude_deg === null) {
    return "No coordinate payload";
  }

  const altitude = item.preview.altitude_m === null ? "No altitude" : `${item.preview.altitude_m.toFixed(1)} m`;
  return `${item.preview.latitude_deg.toFixed(5)}, ${item.preview.longitude_deg.toFixed(5)} · ${altitude}`;
}

function missionDocument(item: TypedDraftItem): MissionItem {
	return item.document as MissionItem;
}
</script>

<section class="rounded-lg border border-border bg-bg-primary p-3" data-testid={missionWorkspaceTestIds.draftList}>
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Mission list</p>
      <h3 class="mt-1 text-sm font-semibold text-text-primary">Manual items and first-class survey blocks</h3>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        class="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg-primary transition hover:brightness-105"
        data-testid={missionWorkspaceTestIds.listAdd}
        onclick={onAddMissionItem}
        type="button"
      >
        Add waypoint
      </button>
      <button
        class="rounded-md border border-success/30 bg-success/10 px-4 py-2 text-sm font-semibold text-success transition hover:brightness-105"
        data-testid={missionWorkspaceTestIds.listAddSurveyGrid}
        onclick={() => onAddSurveyBlock("grid")}
        type="button"
      >
        Grid survey
      </button>
      <button
        class="rounded-md border border-success/30 bg-success/10 px-4 py-2 text-sm font-semibold text-success transition hover:brightness-105"
        data-testid={missionWorkspaceTestIds.listAddSurveyCorridor}
        onclick={() => onAddSurveyBlock("corridor")}
        type="button"
      >
        Corridor survey
      </button>
      <button
        class="rounded-md border border-success/30 bg-success/10 px-4 py-2 text-sm font-semibold text-success transition hover:brightness-105"
        data-testid={missionWorkspaceTestIds.listAddSurveyStructure}
        onclick={() => onAddSurveyBlock("structure")}
        type="button"
      >
        Structure survey
      </button>
    </div>
  </div>

  {#if orderedEntries.length === 0}
    <div
      class="mt-4 rounded-lg border border-dashed border-border bg-bg-secondary/60 px-4 py-6 text-sm text-text-secondary"
      data-testid={missionWorkspaceTestIds.listEmpty}
    >
      No mission items or survey regions yet. Add a waypoint, or create a grid, corridor, or structure survey directly inside this shared workspace.
    </div>
  {:else}
    <div class="mt-4 space-y-3">
      {#each orderedEntries as entry (
        entry.kind === "mission-item" ? `mission-${entry.item.uiId}` : `survey-${entry.block.regionId}`
      )}
        {#if entry.kind === "mission-item"}
          <div
            class={`w-full rounded-lg border p-3 text-left transition ${selectedSurface.kind === "mission-item" && selectedMissionUiId === entry.item.uiId
              ? "border-accent/40 bg-accent/10 text-text-primary"
              : "border-border bg-bg-primary text-text-primary hover:border-accent/40"}`}
            data-selected={selectedSurface.kind === "mission-item" && selectedMissionUiId === entry.item.uiId ? "true" : "false"}
            data-testid={`${missionWorkspaceTestIds.itemPrefix}-${entry.item.uiId}`}
            onclick={() => onSelectMissionItem(entry.item.index)}
            onkeydown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectMissionItem(entry.item.index);
              }
            }}
            role="button"
            tabindex="0"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                  Manual item {entry.item.index + 1}
                </p>
						<h4 class="mt-1 text-sm font-semibold text-text-primary">
							{commandDisplayName(missionDocument(entry.item).command)}
						</h4>
                <p class="mt-1 text-xs text-text-secondary">{itemSummary(entry.item)}</p>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                {#if entry.item.readOnly}
                  <span class="rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-warning">
                    Read-only
                  </span>
                {/if}
						{#if missionDocument(entry.item).current}
                  <span class="rounded-full border border-success/30 bg-success/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-success">
                    Current
                  </span>
                {/if}
              </div>
            </div>

            <div class="mt-3 flex flex-wrap gap-2">
              <button
                class="rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-semibold text-text-primary transition hover:border-accent hover:text-accent"
                data-testid={`${missionWorkspaceTestIds.itemMoveUpPrefix}-${entry.item.uiId}`}
                disabled={entry.item.index === 0}
                onclick={(event) => {
                  event.stopPropagation();
                  onMoveMissionItemUp(entry.item.index);
                }}
                type="button"
              >
                Move up
              </button>
              <button
                class="rounded-md border border-border bg-bg-secondary px-3 py-1.5 text-xs font-semibold text-text-primary transition hover:border-accent hover:text-accent"
                data-testid={`${missionWorkspaceTestIds.itemMoveDownPrefix}-${entry.item.uiId}`}
                disabled={entry.item.index === items.length - 1}
                onclick={(event) => {
                  event.stopPropagation();
                  onMoveMissionItemDown(entry.item.index);
                }}
                type="button"
              >
                Move down
              </button>
              <button
                class="rounded-md border border-danger/40 bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger transition hover:brightness-105"
                data-testid={`${missionWorkspaceTestIds.itemDeletePrefix}-${entry.item.uiId}`}
                onclick={(event) => {
                  event.stopPropagation();
                  onDeleteMissionItem(entry.item.index);
                }}
                type="button"
              >
                Delete
              </button>
            </div>
          </div>
        {:else}
          <MissionSurveyBlockCard
            cruiseSpeed={cruiseSpeed}
            onDelete={() => onDeleteSurveyRegion(entry.block.regionId)}
            onGenerate={() => onGenerateSurveyRegion(entry.block.regionId)}
            onPromptDissolve={() => onPromptDissolveSurveyRegion(entry.block.regionId)}
            onSelect={() => onSelectSurveyBlock(entry.block.regionId)}
            onToggleCollapsed={(collapsed) => onSetSurveyRegionCollapsed(entry.block.regionId, collapsed)}
            position={entry.block.position}
            region={entry.block.region}
            selected={selectedSurface.kind === "survey-block" && selectedSurface.regionId === entry.block.regionId}
            testId={`${missionWorkspaceTestIds.surveyPrefix}-${entry.block.regionId}`}
          />
        {/if}
      {/each}
    </div>
  {/if}
</section>
