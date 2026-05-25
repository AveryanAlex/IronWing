<script lang="ts">
import { DragDropProvider, type DragDropEventHandlers } from "@dnd-kit/svelte";
import { createSortable, isSortable } from "@dnd-kit/svelte/sortable";
import { tick } from "svelte";
import { flip, type AnimationConfig, type FlipParams } from "svelte/animate";
import { cubicOut } from "svelte/easing";
import { GripVertical, MapPin, Navigation, Trash2 } from "lucide-svelte";
import {
  commandCategory,
  commandDisplayName,
  type MissionCommand,
  type MissionItem,
} from "../../lib/mavkit-types";
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
  onReorderMissionItems: (orderedUiIds: readonly number[]) => void;
  onDeleteMissionItem: (index: number) => void;
  onSelectSurveyBlock: (regionId: string) => void;
  onSetSurveyRegionCollapsed: (regionId: string, collapsed: boolean) => void;
  onGenerateSurveyRegion: (regionId: string) => Promise<unknown> | unknown;
  onPromptDissolveSurveyRegion: (regionId: string) => void;
  onDeleteSurveyRegion: (regionId: string) => void;
};

type ListEntry =
  | { kind: "mission-item"; item: TypedDraftItem; sortableIndex: number }
  | { kind: "survey-block"; block: SurveyListEntry; ordinal: number };

type JumpArc = {
  source: number;
  target: number;
  lane: number;
};

const CATEGORY_BADGES: Record<ReturnType<typeof commandCategory>, { label: string; className: string }> = {
  nav: { label: "NAV", className: "bg-accent/15 text-accent" },
  do: { label: "DO", className: "bg-warning/15 text-warning" },
  condition: { label: "CND", className: "bg-success/15 text-success" },
  other: { label: "RAW", className: "bg-bg-tertiary text-text-muted" },
};

const LANE_WIDTH = 10;
const GUTTER_BASE = 6;
const ARROW_SIZE = 4;
const MISSION_SORTABLE_GROUP = "mission-items";
const REORDER_FLIP = {
  duration: (distance: number) => Math.min(240, Math.max(130, distance * 1.2)),
  easing: cubicOut,
} satisfies FlipParams;
const REORDER_FLIP_SETTLE_MS = 260;

type DragStartEvent = Parameters<NonNullable<DragDropEventHandlers["onDragStart"]>>[0];
type DragOverEvent = Parameters<NonNullable<DragDropEventHandlers["onDragOver"]>>[0];
type DragEndEvent = Parameters<NonNullable<DragDropEventHandlers["onDragEnd"]>>[0];

let {
  items,
  surveyBlocks,
  selectedSurface,
  selectedMissionUiId,
  cruiseSpeed,
  onAddMissionItem,
  onAddSurveyBlock,
  onSelectMissionItem,
  onReorderMissionItems,
  onDeleteMissionItem,
  onSelectSurveyBlock,
  onSetSurveyRegionCollapsed,
  onGenerateSurveyRegion,
  onPromptDissolveSurveyRegion,
  onDeleteSurveyRegion,
}: Props = $props();

let listElement: HTMLDivElement | null = $state(null);
let rowCenters = $state<number[]>([]);
let listHeight = $state(0);
let draggingMissionUiId = $state<number | null>(null);
let visualMissionOrder = $state<number[]>([]);
let fallbackDraggedMissionUiId: number | null = null;

let itemOrder = $derived(items.map((item) => item.uiId));
let visualMissionItems = $derived.by(() => draggingMissionUiId === null ? items : orderMissionItems(items, visualMissionOrder));

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
        entries.push({ kind: "survey-block", block, ordinal: blockIndex });
      }
      blockIndex += 1;
    }
  };

  appendBlocksAt(0);

  visualMissionItems.forEach((item, index) => {
    entries.push({ kind: "mission-item", item, sortableIndex: index });
    appendBlocksAt(index + 1);
  });

  while (blockIndex < orderedBlocks.length) {
    const block = orderedBlocks[blockIndex];
    if (block) {
      entries.push({ kind: "survey-block", block, ordinal: blockIndex });
    }
    blockIndex += 1;
  }

  return entries;
});

let referenceArcs = $derived(assignLanes(extractReferenceArcs(items)));
let jumpGutterWidth = $derived.by(() => {
  if (referenceArcs.length === 0) {
    return 0;
  }

  return GUTTER_BASE + (Math.max(...referenceArcs.map((arc) => arc.lane)) + 1) * LANE_WIDTH;
});
let measurementSignature = $derived.by(() => [
  items.map((item) => `${item.uiId}:${item.index}`).join(","),
  orderedEntries.map((entry) => entry.kind === "mission-item" ? `m${entry.item.uiId}` : `s${entry.block.regionId}`).join(","),
  referenceArcs.map((arc) => `${arc.source}-${arc.target}-${arc.lane}`).join(","),
].join("|"));

$effect(() => {
  const signature = measurementSignature;
  void signature;
  let canceled = false;

  void tick().then(() => {
    if (!canceled) {
      measureReferenceRows();
    }
  });

  const settleTimeout = setTimeout(() => {
    if (!canceled) {
      measureReferenceRows();
    }
  }, REORDER_FLIP_SETTLE_MS);

  return () => {
    canceled = true;
    clearTimeout(settleTimeout);
  };
});

$effect(() => {
  const element = listElement;
  if (!element || typeof ResizeObserver === "undefined") {
    return;
  }

  const observer = new ResizeObserver(() => measureReferenceRows());
  observer.observe(element);

  for (const row of element.querySelectorAll<HTMLElement>("[data-mission-waypoint-card]")) {
    observer.observe(row);
  }

  return () => observer.disconnect();
});

function missionDocument(item: TypedDraftItem): MissionItem {
  return item.document as MissionItem;
}

function formatCount(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function compactNumber(value: number) {
  if (Number.isInteger(value)) {
    return value.toLocaleString();
  }

  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function commandPayload(command: MissionCommand): Record<string, unknown> | null {
  if ("Nav" in command) {
    if (typeof command.Nav === "string") {
      return null;
    }
    const variant = Object.keys(command.Nav)[0];
    return variant ? (command.Nav as Record<string, Record<string, unknown>>)[variant] ?? null : null;
  }

  if ("Do" in command) {
    if (typeof command.Do === "string") {
      return null;
    }
    const variant = Object.keys(command.Do)[0];
    return variant ? (command.Do as Record<string, Record<string, unknown>>)[variant] ?? null : null;
  }

  if ("Condition" in command) {
    const variant = Object.keys(command.Condition)[0];
    return variant ? (command.Condition as Record<string, Record<string, unknown>>)[variant] ?? null : null;
  }

  return null;
}

function commandDoPayload(command: MissionCommand, variant: string): Record<string, unknown> | null {
  if (!("Do" in command) || typeof command.Do === "string") {
    return null;
  }

  const payload = (command.Do as Record<string, unknown>)[variant];
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
}

function normalizeTargetIndex(target: number, rowCount: number): number | null {
  const direct = Math.trunc(target);
  if (direct >= 0 && direct < rowCount) {
    return direct;
  }

  const oneIndexed = direct - 1;
  return oneIndexed >= 0 && oneIndexed < rowCount ? oneIndexed : null;
}

function jumpSummary(command: MissionCommand, rowCount: number): string | null {
  const jump = commandDoPayload(command, "Jump");
  if (!jump || typeof jump.target_index !== "number") {
    return null;
  }

  const target = normalizeTargetIndex(jump.target_index, rowCount);
  const targetLabel = target === null ? `#${Math.trunc(jump.target_index) + 1}` : `#${target + 1}`;
  const repeat = typeof jump.repeat_count === "number" ? jump.repeat_count : null;

  if (repeat === null) {
    return `to ${targetLabel}`;
  }

  return `to ${targetLabel} · ${repeat === -1 ? "∞ repeats" : `${compactNumber(repeat)} repeat${repeat === 1 ? "" : "s"}`}`;
}

function formatPayloadValue(value: unknown): string | null {
  if (typeof value === "number") {
    return compactNumber(value);
  }

  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }

  if (typeof value === "string") {
    return titleCase(value);
  }

  return null;
}

function parameterSummary(command: MissionCommand, rowCount: number): string {
  const jump = jumpSummary(command, rowCount);
  if (jump) {
    return jump;
  }

  const payload = commandPayload(command);
  if (!payload) {
    return "—";
  }

  const params = Object.entries(payload)
    .filter(([key]) => key !== "position")
    .flatMap(([key, value]) => {
      const formatted = formatPayloadValue(value);
      return formatted ? [`${titleCase(key)} ${formatted}`] : [];
    })
    .slice(0, 2);

  return params.length > 0 ? params.join(" · ") : "—";
}

function coordinateSummary(item: TypedDraftItem): string | null {
  if (item.preview.latitude_deg === null || item.preview.longitude_deg === null) {
    return null;
  }

  return `${item.preview.latitude_deg.toFixed(5)}, ${item.preview.longitude_deg.toFixed(5)}`;
}

function altitudeSummary(item: TypedDraftItem): string {
  return item.preview.altitude_m === null ? "—" : `${compactNumber(item.preview.altitude_m)}m`;
}

function sameNumberOrder(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function orderMissionItems(draftItems: TypedDraftItem[], orderedUiIds: readonly number[]): TypedDraftItem[] {
  if (orderedUiIds.length !== draftItems.length) {
    return draftItems;
  }

  const itemsByUiId = new Map(draftItems.map((item) => [item.uiId, item]));
  const seenUiIds = new Set<number>();
  const orderedItems = orderedUiIds.flatMap((uiId) => {
    const item = itemsByUiId.get(uiId);
    if (!item || seenUiIds.has(uiId)) {
      return [];
    }

    seenUiIds.add(uiId);
    return [item];
  });

  return orderedItems.length === draftItems.length ? orderedItems : draftItems;
}

function normalizeVisualOrder(): number[] {
  const order = draggingMissionUiId !== null && visualMissionOrder.length === items.length ? visualMissionOrder : itemOrder;
  const validUiIds = new Set(itemOrder);
  return order.filter((uiId) => validUiIds.has(uiId));
}

function moveOrderItem(order: readonly number[], fromIndex: number, toIndex: number): number[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= order.length || toIndex >= order.length) {
    return [...order];
  }

  const nextOrder = [...order];
  const [moved] = nextOrder.splice(fromIndex, 1);
  if (moved === undefined) {
    return [...order];
  }

  nextOrder.splice(toIndex, 0, moved);
  return nextOrder;
}

function sortableUiId(id: string | number): number | null {
  if (typeof id === "number") {
    return Number.isFinite(id) ? id : null;
  }

  const parsed = Number(id);
  return Number.isFinite(parsed) ? parsed : null;
}

function createMissionSortable(getItem: () => TypedDraftItem, getIndex: () => number) {
  return createSortable({
    get id() {
      return getItem().uiId;
    },
    group: MISSION_SORTABLE_GROUP,
    type: "mission-item",
    get disabled() {
      return getItem().readOnly;
    },
    get index() {
      return getIndex();
    },
    // Use Svelte's transform-based FLIP animation on the keyed row wrappers.
    // Keeping dnd-kit's sortable transition here would compose translate on the
    // inner row with the wrapper transform and make crossed rows jumpy.
    transition: null,
  });
}

function missionRowFlip(node: Element, states: { from: DOMRect; to: DOMRect }, params: FlipParams): AnimationConfig {
  if (node instanceof HTMLElement && node.dataset.missionDraggingSource === "true") {
    return { duration: 0 };
  }

  return flip(node, states, params);
}

function extractReferenceArcs(draftItems: TypedDraftItem[]): JumpArc[] {
  const tagTargets = new Map<number, number>();

  draftItems.forEach((item) => {
    const tag = commandDoPayload(missionDocument(item).command, "Tag");
    if (tag && typeof tag.tag === "number") {
      tagTargets.set(tag.tag, item.index);
    }
  });

  return draftItems.flatMap((item) => {
    const command = missionDocument(item).command;
    const jump = commandDoPayload(command, "Jump");
    if (jump && typeof jump.target_index === "number") {
      const target = normalizeTargetIndex(jump.target_index, draftItems.length);
      return target === null ? [] : [{ source: item.index, target, lane: 0 }];
    }

    const jumpTag = commandDoPayload(command, "JumpTag");
    if (jumpTag && typeof jumpTag.tag === "number") {
      const target = tagTargets.get(jumpTag.tag);
      return target === undefined ? [] : [{ source: item.index, target, lane: 0 }];
    }

    return [];
  });
}

function assignLanes(jumps: JumpArc[]): JumpArc[] {
  if (jumps.length === 0) {
    return [];
  }

  const arcs = jumps.map((jump) => ({ ...jump, lane: 0 }));
  const sorted = [...arcs].sort((left, right) => Math.abs(left.target - left.source) - Math.abs(right.target - right.source));

  sorted.forEach((arc, index) => {
    const minRow = Math.min(arc.source, arc.target);
    const maxRow = Math.max(arc.source, arc.target);
    let lane = 0;

    while (sorted.slice(0, index).some((other) => {
      if (other.lane !== lane) {
        return false;
      }

      const otherMin = Math.min(other.source, other.target);
      const otherMax = Math.max(other.source, other.target);
      return minRow <= otherMax && maxRow >= otherMin;
    })) {
      lane += 1;
    }

    arc.lane = lane;
  });

  return arcs;
}

function measureReferenceRows() {
  if (!listElement) {
    rowCenters = [];
    listHeight = 0;
    return;
  }

  const listRect = listElement.getBoundingClientRect();
  const centers = Array.from({ length: items.length }, () => Number.NaN);

  for (const row of listElement.querySelectorAll<HTMLElement>("[data-mission-waypoint-card]")) {
    const rowIndex = Number(row.dataset.missionRowIndex);
    if (!Number.isFinite(rowIndex)) {
      continue;
    }

    const rect = row.getBoundingClientRect();
    centers[rowIndex] = rect.top - listRect.top + rect.height / 2;
  }

  rowCenters = centers;
  listHeight = Math.max(listElement.scrollHeight, ...centers.filter(Number.isFinite).map((center) => center + 16), 1);
}

function selectFromKeyboard(event: KeyboardEvent, item: TypedDraftItem) {
  if (event.target !== event.currentTarget) {
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelectMissionItem(item.index);
  }
}

function handleSortableDragStart(event: DragStartEvent) {
  const { source } = event.operation;
  if (!isSortable(source)) {
    return;
  }

  const sourceUiId = sortableUiId(source.id);
  if (sourceUiId === null) {
    return;
  }

  const order = visualMissionItems.map((item) => item.uiId);
  visualMissionOrder = order;
  draggingMissionUiId = sourceUiId;
}

function handleSortableDragOver(event: DragOverEvent) {
  const { source, target } = event.operation;
  if (!isSortable(source) || !isSortable(target) || source.group !== MISSION_SORTABLE_GROUP || target.group !== MISSION_SORTABLE_GROUP) {
    return;
  }

  const fromIndex = source.index;
  const toIndex = target.index;
  if (fromIndex === toIndex) {
    return;
  }

  const order = normalizeVisualOrder();
  if (order.length !== items.length) {
    return;
  }

  visualMissionOrder = moveOrderItem(order, fromIndex, toIndex);
}

function handleSortableDragEnd(event: DragEndEvent) {
  const finalOrder = normalizeVisualOrder();

  if (!event.canceled && finalOrder.length === items.length && !sameNumberOrder(finalOrder, itemOrder)) {
    onReorderMissionItems(finalOrder);
  }

  draggingMissionUiId = null;
  visualMissionOrder = [];
}

// The real interaction path is @dnd-kit pointer/keyboard sorting. These native
// DragEvent handlers keep synthetic jsdom drag/drop tests on the same atomic
// reorder path without marking the handle as a browser-native draggable element.
function handleFallbackDragStart(event: DragEvent, item: TypedDraftItem) {
  if (item.readOnly) {
    return;
  }

  fallbackDraggedMissionUiId = item.uiId;
  event.dataTransfer?.setData("text/plain", String(item.uiId));
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
  }
}

function handleFallbackDragOver(event: DragEvent, item: TypedDraftItem) {
  if (fallbackDraggedMissionUiId === null || fallbackDraggedMissionUiId === item.uiId) {
    return;
  }

  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
}

function handleFallbackDrop(event: DragEvent, target: TypedDraftItem) {
  event.preventDefault();
  const dataTransferId = Number(event.dataTransfer?.getData("text/plain"));
  const sourceUiId = Number.isFinite(dataTransferId) ? dataTransferId : fallbackDraggedMissionUiId;
  const sourceIndex = itemOrder.findIndex((uiId) => uiId === sourceUiId);
  const targetIndex = itemOrder.findIndex((uiId) => uiId === target.uiId);

  if (sourceIndex !== -1 && targetIndex !== -1 && sourceIndex !== targetIndex) {
    onReorderMissionItems(moveOrderItem(itemOrder, sourceIndex, targetIndex));
  }

  fallbackDraggedMissionUiId = null;
}

function handleFallbackDragEnd() {
  fallbackDraggedMissionUiId = null;
}
</script>

<section class="rounded-lg border border-border bg-bg-primary p-3" data-testid={missionWorkspaceTestIds.draftList}>
  <div class="flex items-center justify-between gap-3 border-b border-border/70 pb-2">
    <div class="flex min-w-0 items-center gap-2">
      <MapPin aria-hidden="true" class="shrink-0 text-accent" size={16} />
      <h3 class="truncate text-xs font-semibold uppercase tracking-wider text-text-muted">Waypoints</h3>
    </div>

    <span class="shrink-0 text-xs tabular-nums text-text-secondary">
      {formatCount(items.length, "item")}
    </span>
  </div>

  <div class="mt-3 flex flex-wrap gap-2">
    <button
      class="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-bg-primary transition hover:brightness-105"
      data-testid={missionWorkspaceTestIds.listAdd}
      onclick={onAddMissionItem}
      type="button"
    >
      Add waypoint
    </button>
    <button
      class="rounded-md border border-success/30 bg-success/10 px-3 py-1.5 text-xs font-semibold text-success transition hover:brightness-105"
      data-testid={missionWorkspaceTestIds.listAddSurveyGrid}
      onclick={() => onAddSurveyBlock("grid")}
      type="button"
    >
      Grid survey
    </button>
    <button
      class="rounded-md border border-success/30 bg-success/10 px-3 py-1.5 text-xs font-semibold text-success transition hover:brightness-105"
      data-testid={missionWorkspaceTestIds.listAddSurveyCorridor}
      onclick={() => onAddSurveyBlock("corridor")}
      type="button"
    >
      Corridor
    </button>
    <button
      class="rounded-md border border-success/30 bg-success/10 px-3 py-1.5 text-xs font-semibold text-success transition hover:brightness-105"
      data-testid={missionWorkspaceTestIds.listAddSurveyStructure}
      onclick={() => onAddSurveyBlock("structure")}
      type="button"
    >
      Structure
    </button>
  </div>

  {#if orderedEntries.length === 0}
    <div
      class="mt-3 rounded-lg border border-dashed border-border bg-bg-secondary/60 px-4 py-6 text-sm text-text-secondary"
      data-testid={missionWorkspaceTestIds.listEmpty}
    >
      No mission items or survey regions yet. Add a waypoint, or create a grid, corridor, or structure survey directly inside this shared workspace.
    </div>
  {:else}
    <DragDropProvider
      onDragEnd={handleSortableDragEnd}
      onDragOver={handleSortableDragOver}
      onDragStart={handleSortableDragStart}
    >
    <div bind:this={listElement} class="relative mt-3">
      <div class="space-y-1" style={jumpGutterWidth > 0 ? `padding-right: ${jumpGutterWidth}px;` : undefined}>
        {#each orderedEntries as entry (
          entry.kind === "mission-item" ? `mission-${entry.item.uiId}` : `survey-${entry.block.regionId}`
        )}
          <div
            animate:missionRowFlip={REORDER_FLIP}
            data-mission-dragging-source={entry.kind === "mission-item" && draggingMissionUiId === entry.item.uiId ? "true" : undefined}
          >
            {#if entry.kind === "mission-item"}
              {@const missionItem = missionDocument(entry.item)}
              {@const command = missionItem.command}
              {@const badge = CATEGORY_BADGES[commandCategory(command)]}
              {@const selected = selectedSurface.kind === "mission-item" && selectedMissionUiId === entry.item.uiId}
              {@const coordinates = coordinateSummary(entry.item)}
              {@const sortable = createMissionSortable(() => entry.item, () => entry.sortableIndex)}
              {@const attachSortable = sortable.attach}
              {@const attachSortableHandle = sortable.attachHandle}
              <div
                class={`group relative flex min-h-11 items-stretch rounded-md border text-xs transition-colors ${selected
                  ? "border-accent bg-accent/12 shadow-[inset_0_0_0_1px_rgba(18,185,255,0.22)]"
                  : missionItem.current
                    ? "border-success/40 bg-success/5 hover:bg-success/10"
                    : "border-border bg-bg-primary hover:border-border-light hover:bg-bg-tertiary/50"} ${sortable.isDropTarget ? "ring-1 ring-accent/50" : ""} ${sortable.isDragSource ? "z-10 opacity-60 shadow-lg" : ""}`}
                data-mission-row-index={entry.sortableIndex}
                data-mission-waypoint-card
                data-selected={selected ? "true" : "false"}
                data-testid={`${missionWorkspaceTestIds.itemPrefix}-${entry.item.uiId}`}
                ondragover={(event) => handleFallbackDragOver(event, entry.item)}
                ondrop={(event) => handleFallbackDrop(event, entry.item)}
                onclick={() => onSelectMissionItem(entry.item.index)}
                onkeydown={(event) => selectFromKeyboard(event, entry.item)}
                role="button"
                tabindex="0"
                {@attach attachSortable}
              >
                <div class="flex w-8 shrink-0 flex-col items-center justify-center gap-0.5 border-r border-border/50 text-text-muted/50">
                  <button
                    aria-label={`Drag to reorder item ${entry.sortableIndex + 1}`}
                    class="cursor-grab rounded p-0.5 transition hover:bg-bg-tertiary hover:text-text-muted active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
                    data-mission-drag-handle
                    data-testid={`${missionWorkspaceTestIds.itemDragPrefix}-${entry.item.uiId}`}
                    disabled={entry.item.readOnly}
                    onclick={(event) => event.stopPropagation()}
                    ondragend={handleFallbackDragEnd}
                    ondragstart={(event) => handleFallbackDragStart(event, entry.item)}
                    onkeydown={(event) => event.stopPropagation()}
                    title="Drag to reorder"
                    type="button"
                    {@attach attachSortableHandle}
                  >
                    <GripVertical aria-hidden="true" size={14} />
                  </button>
                </div>

                <div class="flex min-w-0 flex-1 items-center gap-2 px-2 py-2">
                  <span class={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold tabular-nums ${selected
                    ? "bg-accent/25 text-accent"
                    : missionItem.current
                      ? "bg-success/20 text-success"
                      : "bg-bg-tertiary text-text-muted"}`}>
                    {entry.sortableIndex + 1}
                  </span>
                  <span class={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-wide ${badge.className}`}>
                    {badge.label}
                  </span>
                  <span class="shrink-0 font-semibold text-text-primary">{commandDisplayName(command)}</span>
                  <span class="min-w-0 truncate text-text-muted">
                    {#if coordinates}
                      <span class="inline-flex min-w-0 items-center gap-1">
                        <MapPin aria-hidden="true" class="shrink-0" size={11} />
                        <span class="truncate tabular-nums">{coordinates}</span>
                      </span>
                    {:else}
                      {parameterSummary(command, items.length)}
                    {/if}
                  </span>
                  <span class="ml-auto shrink-0 tabular-nums text-text-muted">{altitudeSummary(entry.item)}</span>
                  {#if entry.item.readOnly}
                    <span class="shrink-0 rounded bg-warning/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-warning">Raw</span>
                  {/if}
                  {#if missionItem.current}
                    <Navigation aria-label="Current mission item" class="shrink-0 fill-success text-success" size={13} />
                  {/if}
                </div>

                <div class="flex shrink-0 items-center border-l border-border/50 px-1">
                  <button
                    aria-label={`Delete item ${entry.item.index + 1}`}
                    class="rounded p-1.5 text-text-muted transition hover:bg-bg-tertiary hover:text-danger"
                    data-testid={`${missionWorkspaceTestIds.itemDeletePrefix}-${entry.item.uiId}`}
                    onclick={(event) => {
                      event.stopPropagation();
                      onDeleteMissionItem(entry.item.index);
                    }}
                    title="Delete"
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={14} />
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
                ordinal={entry.ordinal}
                region={entry.block.region}
                selected={selectedSurface.kind === "survey-block" && selectedSurface.regionId === entry.block.regionId}
                testId={`${missionWorkspaceTestIds.surveyPrefix}-${entry.block.regionId}`}
              />
            {/if}
          </div>
        {/each}
      </div>

      {#if draggingMissionUiId === null && referenceArcs.length > 0 && jumpGutterWidth > 0}
        <svg
          aria-hidden="true"
          class="pointer-events-none absolute right-0 top-0"
          height={Math.max(listHeight, 1)}
          style="overflow: visible;"
          width={jumpGutterWidth}
        >
          {#each referenceArcs as arc, index (`${arc.source}-${arc.target}-${arc.lane}-${index}`)}
            {@const sourceY = rowCenters[arc.source]}
            {@const targetY = rowCenters[arc.target]}
            {#if Number.isFinite(sourceY) && Number.isFinite(targetY)}
              {@const x = jumpGutterWidth - GUTTER_BASE - arc.lane * LANE_WIDTH}
              {@const goingUp = targetY < sourceY}
              {@const dashEnd = goingUp ? targetY + ARROW_SIZE + 1 : targetY - ARROW_SIZE - 1}
              <g>
                <line
                  class="text-text-muted/25"
                  stroke="currentColor"
                  stroke-width="1"
                  x1="0"
                  x2={x}
                  y1={sourceY}
                  y2={sourceY}
                />
                <line
                  class="text-text-muted/45"
                  stroke="currentColor"
                  stroke-dasharray="3 2"
                  stroke-width="1.5"
                  x1={x}
                  x2={x}
                  y1={sourceY}
                  y2={dashEnd}
                />
                <polygon
                  class="text-text-muted/70"
                  fill="currentColor"
                  points={goingUp
                    ? `${x},${targetY} ${x - ARROW_SIZE},${targetY + ARROW_SIZE * 1.5} ${x + ARROW_SIZE},${targetY + ARROW_SIZE * 1.5}`
                    : `${x},${targetY} ${x - ARROW_SIZE},${targetY - ARROW_SIZE * 1.5} ${x + ARROW_SIZE},${targetY - ARROW_SIZE * 1.5}`}
                />
              </g>
            {/if}
          {/each}
        </svg>
      {/if}
    </div>
    </DragDropProvider>
  {/if}
</section>
