<script lang="ts">
import { Monitor, Search, SlidersHorizontal } from "lucide-svelte";

import type { ParameterItemModel } from "../../../../lib/params/parameter-item-model";
import type { ArduPilotOsdModel, OsdItemModel, OsdScreenModel } from "../../../../lib/osd/ardupilot-osd-model";
import { clampOsdCoordinate } from "../../../../lib/osd/ardupilot-osd-model";
import {
  captureOsdGrabOffset,
  osdDropToGrid,
  osdPointerToGrid,
  type OsdGrabOffset,
  type OsdGridPoint,
} from "../../../../lib/osd/osd-placement";
import { Checkbox, EmptyState, Input, InternalLink, NativeSelect } from "../../../../components/ui";
import SetupSectionCard from "../../shared/SetupSectionCard.svelte";
import SetupStatusPill from "../../shared/SetupStatusPill.svelte";
import { setupWorkspaceTestIds } from "../../setup-workspace-test-ids";
import OsdItemChip from "./OsdItemChip.svelte";

type Props = {
  model: ArduPilotOsdModel;
  selectedScreen: number | null;
  disabled?: boolean;
  itemIndex: Map<string, ParameterItemModel>;
  onSelectScreen: (screen: number) => void;
  onStageParam: (name: string, value: number) => void;
};

type OsdDragSource = "library" | "grid";
type OsdDropTarget = "grid" | "library" | null;
type PointerDragSession = {
  key: string;
  screen: number;
  pointerId: number;
  source: OsdDragSource;
  originClientX: number;
  originClientY: number;
  active: boolean;
  grab: OsdGrabOffset | null;
  preview: OsdGridPoint | null;
  dropTarget: OsdDropTarget;
  canMove: boolean;
  canRemove: boolean;
};

const DRAG_ACTIVATION_PX = 4;

let {
  model,
  selectedScreen,
  disabled = false,
  itemIndex,
  onSelectScreen,
  onStageParam,
}: Props = $props();

let pointerDrag = $state.raw<PointerDragSession | null>(null);
let librarySearch = $state("");
let gridElement = $state<HTMLElement | null>(null);
let libraryElement = $state<HTMLElement | null>(null);
let dragCaptureElement: HTMLElement | null = null;
let suppressLibraryClickKey: string | null = null;

let activeScreen = $derived.by(() => {
  if (model.screens.length === 0) {
    return null;
  }

  return model.screens.find((screen) => screen.screen === selectedScreen) ?? model.screens[0] ?? null;
});
let screenOptions = $derived(
  model.screens.map((screen) => ({
    value: String(screen.screen),
    label: `${screen.label} - ${screenStatus(screen)}`,
  })),
);
let libraryItems = $derived(activeScreen?.items.filter((item) => !item.enabled) ?? []);
let placedItems = $derived(activeScreen?.enabledItems ?? []);
let filteredLibraryItems = $derived.by(() => {
  if (!activeScreen) {
    return [];
  }

  const query = librarySearch.trim().toLocaleLowerCase();
  return [...libraryItems]
    .filter((item) => itemSearchText(item, activeScreen).includes(query))
    .sort((left, right) => itemDisplayLabel(left).localeCompare(itemDisplayLabel(right)));
});

function stageScreenEnabled(screen: OsdScreenModel, checked: boolean) {
  if (disabled || !screen.enableParamName || !isParamActionable(screen.enableParamName)) {
    return;
  }

  onStageParam(screen.enableParamName, checked ? 1 : 0);
}

function stageItemEnabled(item: OsdItemModel, checked: boolean) {
  if (disabled || !item.params.enable || !isParamActionable(item.params.enable)) {
    return;
  }

  onStageParam(item.params.enable, checked ? 1 : 0);
}

function stageItemDisabled(item: OsdItemModel) {
  stageItemEnabled(item, false);
  resetStagedCoordinates(item);
}

function stagePosition(item: OsdItemModel, screen: OsdScreenModel, x: number, y: number) {
  if (disabled) {
    return;
  }

  const nextX = clampOsdCoordinate(x, "x", screen.grid);
  const nextY = clampOsdCoordinate(y, "y", screen.grid);
  if (item.params.x && isParamActionable(item.params.x) && nextX !== item.x) {
    onStageParam(item.params.x, nextX);
  }
  if (item.params.y && isParamActionable(item.params.y) && nextY !== item.y) {
    onStageParam(item.params.y, nextY);
  }
}

function placeItem(item: OsdItemModel, screen: OsdScreenModel, x?: number, y?: number) {
  if (disabled || !canPlaceItem(item)) {
    return;
  }

  stageItemEnabled(item, true);
  const position = resolvePlacement(item, screen, x, y);
  stagePosition(item, screen, position.x, position.y);
}

function startPointerDrag(event: PointerEvent, item: OsdItemModel, screen: OsdScreenModel, source: OsdDragSource) {
  if (disabled || event.button !== 0 || pointerDrag) {
    return;
  }

  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const canMove = canMoveItem(item);
  const canRemove = isActionable(item, "enable");
  if (source === "library") {
    if (!canDragLibraryItem(item)) {
      return;
    }

    if (event.pointerType !== "mouse" && !isDragHandleTarget(event.target)) {
      return;
    }
  } else if (!canMove && !canRemove) {
    return;
  }

  const grab = source === "grid" && gridElement
    ? captureOsdGrabOffset({
        clientX: event.clientX,
        clientY: event.clientY,
        bounds: gridElement.getBoundingClientRect(),
        grid: screen.grid,
        item: { x: item.displayX, y: item.displayY },
      })
    : null;
  if (source === "grid" && !grab) {
    return;
  }

  pointerDrag = {
    key: item.key,
    screen: screen.screen,
    pointerId: event.pointerId,
    source,
    originClientX: event.clientX,
    originClientY: event.clientY,
    active: false,
    grab,
    preview: null,
    dropTarget: null,
    canMove,
    canRemove,
  };
  dragCaptureElement = target;
  target.setPointerCapture(event.pointerId);
}

function handlePointerMove(event: PointerEvent) {
  const session = pointerDrag;
  if (!session || session.pointerId !== event.pointerId) {
    return;
  }

  const distance = Math.hypot(
    event.clientX - session.originClientX,
    event.clientY - session.originClientY,
  );
  if (!session.active && distance < DRAG_ACTIVATION_PX) {
    return;
  }

  event.preventDefault();
  const location = resolveDragLocation(session, event.clientX, event.clientY);
  pointerDrag = {
    ...session,
    active: true,
    ...location,
  };
}

function handlePointerUp(event: PointerEvent) {
  const session = pointerDrag;
  if (!session || session.pointerId !== event.pointerId) {
    return;
  }

  const completed = session.active
    ? { ...session, ...resolveDragLocation(session, event.clientX, event.clientY) }
    : session;
  if (completed.active && completed.source === "library") {
    suppressLibraryClickKey = completed.key;
    setTimeout(() => {
      if (suppressLibraryClickKey === completed.key) {
        suppressLibraryClickKey = null;
      }
    }, 0);
  }
  clearPointerDrag();

  if (!completed.active || disabled) {
    return;
  }

  const screen = model.screens.find((candidate) => candidate.screen === completed.screen);
  const item = screen?.items.find((candidate) => candidate.key === completed.key);
  if (!screen || !item) {
    return;
  }

  if (completed.dropTarget === "grid" && completed.preview) {
    if (completed.source === "library") {
      placeItem(item, screen, completed.preview.x, completed.preview.y);
    } else if (completed.canMove) {
      stagePosition(item, screen, completed.preview.x, completed.preview.y);
    }
    return;
  }

  if (completed.source === "grid" && completed.dropTarget === "library" && completed.canRemove) {
    stageItemDisabled(item);
  }
}

function handlePointerCancel(event: PointerEvent) {
  if (pointerDrag?.pointerId === event.pointerId) {
    clearPointerDrag();
  }
}

function handleLostPointerCapture(event: PointerEvent) {
  if (pointerDrag?.pointerId === event.pointerId) {
    pointerDrag = null;
    dragCaptureElement = null;
  }
}

function clearPointerDrag() {
  const session = pointerDrag;
  const captureElement = dragCaptureElement;
  pointerDrag = null;
  dragCaptureElement = null;
  if (session && captureElement?.hasPointerCapture(session.pointerId)) {
    captureElement.releasePointerCapture(session.pointerId);
  }
}

function resolveDragLocation(
  session: PointerDragSession,
  clientX: number,
  clientY: number,
): Pick<PointerDragSession, "dropTarget" | "preview"> {
  const screen = model.screens.find((candidate) => candidate.screen === session.screen);
  if (!screen) {
    return { dropTarget: null, preview: null };
  }

  if (gridElement && pointInsideElement(clientX, clientY, gridElement)) {
    if (session.source === "grid" && !session.canMove) {
      return { dropTarget: null, preview: null };
    }

    const bounds = gridElement.getBoundingClientRect();
    const preview = session.source === "grid" && session.grab
      ? osdPointerToGrid({ clientX, clientY, bounds, grid: screen.grid, grab: session.grab })
      : osdDropToGrid({ clientX, clientY, bounds, grid: screen.grid });
    return preview ? { dropTarget: "grid", preview } : { dropTarget: null, preview: null };
  }

  if (
    session.source === "grid"
    && session.canRemove
    && libraryElement
    && pointInsideElement(clientX, clientY, libraryElement)
  ) {
    return { dropTarget: "library", preview: null };
  }

  return { dropTarget: null, preview: null };
}

function pointInsideElement(clientX: number, clientY: number, element: HTMLElement): boolean {
  const bounds = element.getBoundingClientRect();
  return clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom;
}

function isDragHandleTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("[data-osd-drag-handle]") !== null;
}

function handleLibraryClick(event: MouseEvent, item: OsdItemModel, screen: OsdScreenModel) {
  if (suppressLibraryClickKey === item.key) {
    suppressLibraryClickKey = null;
    event.preventDefault();
    return;
  }

  placeItem(item, screen);
}

function handleGridKeydown(event: KeyboardEvent, item: OsdItemModel, screen: OsdScreenModel) {
  if (event.key === "Delete" || event.key === "Backspace") {
    if (isActionable(item, "enable")) {
      event.preventDefault();
      stageItemDisabled(item);
    }
    return;
  }

  if (!canMoveItem(item)) {
    return;
  }

  const movement: Partial<Record<"ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown", OsdGridPoint>> = {
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
  };
  const delta = movement[event.key as keyof typeof movement];
  if (!delta) {
    return;
  }

  event.preventDefault();
  stagePosition(item, screen, item.displayX + delta.x, item.displayY + delta.y);
}

function selectScreen(screen: number) {
  clearPointerDrag();
  onSelectScreen(screen);
}

function screenStatus(screen: OsdScreenModel): string {
  const enabled = screen.enabledItems.length;
  const state = screen.enabled === false ? "screen off" : `${enabled} enabled`;
  return `${state} / ${screen.items.length} detected`;
}

function isParamActionable(name: string): boolean {
  return !disabled && itemIndex.get(name)?.readOnly !== true;
}

function isActionable(item: OsdItemModel, role: "enable" | "x" | "y"): boolean {
  const paramName = item.params[role];
  return paramName !== null && isParamActionable(paramName);
}

function canPlaceItem(item: OsdItemModel): boolean {
  return isActionable(item, "enable");
}

function canMoveItem(item: OsdItemModel): boolean {
  return isActionable(item, "x") && isActionable(item, "y");
}

function canDragLibraryItem(item: OsdItemModel): boolean {
  return canPlaceItem(item) && canMoveItem(item);
}

function canInteractWithPlacedItem(item: OsdItemModel): boolean {
  return canMoveItem(item) || isActionable(item, "enable");
}

function resetStagedCoordinates(item: OsdItemModel) {
  resetStagedCoordinate(item, "x");
  resetStagedCoordinate(item, "y");
}

function resetStagedCoordinate(item: OsdItemModel, axis: "x" | "y") {
  if (!item.staged[axis]) {
    return;
  }

  const paramName = item.params[axis];
  const currentValue = paramName ? itemIndex.get(paramName)?.value : null;
  if (paramName && typeof currentValue === "number" && Number.isFinite(currentValue)) {
    onStageParam(paramName, currentValue);
  }
}

function itemDisplayLabel(item: OsdItemModel): string {
  const metadataLabel = item.params.enable ? itemIndex.get(item.params.enable)?.label : null;
  return normalizeMetadataLabel(metadataLabel, item) ?? item.label;
}

function itemParamSummary(item: OsdItemModel, screen: OsdScreenModel): string {
  return `OSD${screen.screen}_${item.key}`;
}

function itemSearchText(item: OsdItemModel, screen: OsdScreenModel): string {
  return [itemDisplayLabel(item), item.key, itemParamSummary(item, screen)].join(" ").toLocaleLowerCase();
}

function itemIsStaged(item: OsdItemModel): boolean {
  return item.staged.enable || item.staged.x || item.staged.y;
}

function itemDataAttributes(item: OsdItemModel) {
  return {
    "data-osd-key": item.key,
    "data-enable-param": item.params.enable ?? undefined,
    "data-x-param": item.params.x ?? undefined,
    "data-y-param": item.params.y ?? undefined,
  };
}

function gridPointForItem(item: OsdItemModel): OsdGridPoint {
  if (
    pointerDrag?.active
    && pointerDrag.source === "grid"
    && pointerDrag.key === item.key
    && pointerDrag.dropTarget === "grid"
    && pointerDrag.preview
  ) {
    return pointerDrag.preview;
  }

  return { x: item.displayX, y: item.displayY };
}

function gridChipStyle(point: OsdGridPoint, screen: OsdScreenModel): string {
  const leftPct = (point.x / screen.grid.columns) * 100;
  const topPct = (point.y / screen.grid.rows) * 100;
  const widthPct = (6 / screen.grid.columns) * 100;
  return `left: ${leftPct}%; top: ${topPct}%; width: ${widthPct}%; min-width: 2rem; max-width: 6rem;`;
}

function gridChipAriaLabel(item: OsdItemModel): string {
  const actions = [
    canMoveItem(item) ? "Use arrow keys or drag to move" : null,
    isActionable(item, "enable") ? "Delete or drag to the library to remove" : null,
  ].filter(Boolean).join(". ");
  return `${itemDisplayLabel(item)} at X ${item.displayX}, Y ${item.displayY}${actions ? `. ${actions}` : ""}`;
}

function libraryChipAriaLabel(item: OsdItemModel): string {
  return canDragLibraryItem(item)
    ? `${itemDisplayLabel(item)}. Drag onto the grid or press to place automatically`
    : `${itemDisplayLabel(item)}. Press to enable at its stored position`;
}

function resolvePlacement(item: OsdItemModel, screen: OsdScreenModel, x?: number, y?: number): OsdGridPoint {
  if (typeof x === "number" && typeof y === "number") {
    return {
      x: clampOsdCoordinate(x, "x", screen.grid),
      y: clampOsdCoordinate(y, "y", screen.grid),
    };
  }

  if (!item.xOutOfRange && !item.yOutOfRange && !isGridCellOccupied(item, screen, item.x, item.y)) {
    return { x: item.x, y: item.y };
  }

  for (let row = 0; row < screen.grid.rows; row += 1) {
    for (let column = 0; column < screen.grid.columns; column += 1) {
      if (!isGridCellOccupied(item, screen, column, row)) {
        return { x: column, y: row };
      }
    }
  }

  return {
    x: Math.floor(screen.grid.columns / 2),
    y: Math.floor(screen.grid.rows / 2),
  };
}

function isGridCellOccupied(item: OsdItemModel, screen: OsdScreenModel, x: number, y: number): boolean {
  return screen.enabledItems.some((candidate) => candidate.key !== item.key && candidate.displayX === x && candidate.displayY === y);
}

function normalizeMetadataLabel(label: string | null | undefined, item: OsdItemModel): string | null {
  const trimmed = label?.trim();
  if (!trimmed || trimmed === item.params.enable) {
    return null;
  }

  const withoutScreenPrefix = trimmed.replace(/^OSD\d+[_\s-]*/i, "");
  const rawish = /^[A-Z0-9_\s-]+$/.test(withoutScreenPrefix);
  const hasRoleSuffix = /[_\s-]*(EN|ENABLE|X|Y)$/i.test(withoutScreenPrefix);
  const normalized = rawish
    ? withoutScreenPrefix
      .replace(/[_\s-]*(EN|ENABLE|X|Y)$/i, "")
      .replace(/[_-]+/g, " ")
      .trim()
    : withoutScreenPrefix.replace(/[_-]+/g, " ").trim();

  if (normalized.length === 0 || normalized === item.key) {
    return null;
  }

  if (rawish && hasRoleSuffix && compactLabel(normalized) === compactLabel(item.key)) {
    return null;
  }

  return normalized;
}

function compactLabel(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}
</script>

<svelte:window
  onpointercancel={handlePointerCancel}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
/>

<SetupSectionCard
  icon={Monitor}
  title="OSD Layout"
  description="Edit ArduPilot OSD item visibility and character-grid positions. Changes are staged for review before apply."
  testId={setupWorkspaceTestIds.osdSummary}
>
  {#snippet status()}
    {#if model.hasOsdParams}
      <SetupStatusPill>{model.screens.length} {model.screens.length === 1 ? "screen" : "screens"}</SetupStatusPill>
    {/if}
  {/snippet}

  {#if !model.hasOsdParams}
    {#snippet emptyIcon()}
      <Monitor aria-hidden="true" size={28} />
    {/snippet}
    <EmptyState
      icon={emptyIcon}
      title="No OSD parameters detected"
      description="Download parameters from an ArduPilot vehicle with OSD support. IronWing detects OSDn_* item parameters from the loaded parameter store."
      testId={setupWorkspaceTestIds.osdEmpty}
    />
  {:else if activeScreen}
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label class="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-text-muted">
          Screen
          <NativeSelect
            value={String(activeScreen.screen)}
            options={screenOptions}
            class="normal-case tracking-normal"
            testId={setupWorkspaceTestIds.osdScreenSelect}
            onchange={(event) => selectScreen(Number(event.currentTarget.value))}
          />
        </label>

        <p class="text-xs text-text-muted">
          Grid {activeScreen.grid.label}. Drag items from the library, move placed chips, or use the keyboard.
        </p>
      </div>

      {#if activeScreen.enableParamName}
        <div class="rounded-md border border-border bg-bg-secondary px-3 py-2">
          <Checkbox
            checked={activeScreen.enabled ?? false}
            disabled={!isParamActionable(activeScreen.enableParamName)}
            label={`Enable ${activeScreen.label}`}
            description="This stages OSDn_ENABLE. Item edits remain available so you can prepare a disabled screen before enabling it."
            testId={`${setupWorkspaceTestIds.osdInputPrefix}-${activeScreen.enableParamName}`}
            onCheckedChange={(checked) => stageScreenEnabled(activeScreen, checked)}
          />
          {#if activeScreen.enabled === false}
            <p class="mt-2 text-xs text-warning">
              {activeScreen.label} is disabled on the vehicle. Position edits can be staged, but this screen will not appear until
              {activeScreen.enableParamName} is enabled.
            </p>
          {/if}
        </div>
      {:else}
        <div class="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-text-secondary">
          No OSDn_ENABLE parameter was loaded for {activeScreen.label}. Item layout can still be edited if item parameters are writable.
        </div>
      {/if}

      <div class="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div class="min-w-0">
          <p class="mb-2 font-mono text-[10px] uppercase tracking-wide text-text-muted">
            {activeScreen.label} · {activeScreen.grid.label}
          </p>

          <div
            bind:this={gridElement}
            class={[
              "relative min-h-48 w-full min-w-0 overflow-hidden rounded-lg border border-border bg-bg-primary shadow-inner touch-none sm:min-h-72",
              pointerDrag?.active && pointerDrag.dropTarget === "grid" && "border-accent ring-2 ring-accent/35",
            ]}
            data-osd-grid
            data-testid={setupWorkspaceTestIds.osdGrid}
            role="region"
            aria-label={`${activeScreen.label} OSD placement grid`}
            style:--osd-columns={activeScreen.grid.columns}
            style:--osd-rows={activeScreen.grid.rows}
            data-grid-columns={activeScreen.grid.columns}
            data-grid-rows={activeScreen.grid.rows}
            style={`aspect-ratio: ${activeScreen.grid.columns} / ${activeScreen.grid.rows}`}
          >
            <div class="absolute inset-0 osd-grid-lines"></div>

            {#each placedItems as item (item.key)}
              {@const point = gridPointForItem(item)}
              <OsdItemChip
                mode="grid"
                label={itemDisplayLabel(item)}
                paramSummary={itemParamSummary(item, activeScreen)}
                ariaLabel={gridChipAriaLabel(item)}
                disabled={!canInteractWithPlacedItem(item)}
                canDrag={canInteractWithPlacedItem(item)}
                dragging={pointerDrag?.active && pointerDrag.source === "grid" && pointerDrag.key === item.key}
                warning={item.xOutOfRange || item.yOutOfRange}
                staged={itemIsStaged(item)}
                style={gridChipStyle(point, activeScreen)}
                testId={`${setupWorkspaceTestIds.osdGridItemPrefix}-${activeScreen.screen}-${item.key}`}
                {...itemDataAttributes(item)}
                data-grid-x={point.x}
                data-grid-y={point.y}
                onkeydown={(event) => handleGridKeydown(event, item, activeScreen)}
                onlostpointercapture={handleLostPointerCapture}
                onpointerdown={(event) => startPointerDrag(event, item, activeScreen, "grid")}
              />
            {/each}

            {#if pointerDrag?.active && pointerDrag.source === "library" && pointerDrag.dropTarget === "grid" && pointerDrag.preview}
              {@const previewItem = activeScreen.items.find((item) => item.key === pointerDrag?.key)}
              {#if previewItem}
                <OsdItemChip
                  mode="grid"
                  label={itemDisplayLabel(previewItem)}
                  paramSummary={itemParamSummary(previewItem, activeScreen)}
                  ariaLabel={`Preview ${itemDisplayLabel(previewItem)}`}
                  preview
                  style={gridChipStyle(pointerDrag.preview, activeScreen)}
                />
              {/if}
            {/if}
          </div>
        </div>

        <div class="flex min-w-0 flex-col gap-3">
          <section
            bind:this={libraryElement}
            class={[
              "min-w-0 overflow-hidden rounded-lg border border-border bg-bg-primary",
              pointerDrag?.active && pointerDrag.dropTarget === "library" && "border-accent ring-2 ring-accent/35",
            ]}
            data-testid={setupWorkspaceTestIds.osdLibrary}
            aria-label={`${activeScreen.label} OSD item library`}
          >
            <div class="border-b border-border bg-bg-secondary px-3 py-3">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <h3 class="text-xs font-semibold uppercase tracking-wide text-text-muted">Item library</h3>
                  <p class="mt-1 text-xs text-text-muted">Drag a chip onto the grid or press it to place automatically.</p>
                </div>
                <span class="shrink-0 text-xs tabular-nums text-text-muted">
                  {filteredLibraryItems.length}/{libraryItems.length}
                </span>
              </div>

              <label class="mt-3 flex items-center gap-2">
                <Search aria-hidden="true" class="shrink-0 text-text-muted" size={14} />
                <span class="sr-only">Search OSD items</span>
                <Input
                  bind:value={librarySearch}
                  class="min-w-0"
                  placeholder="Search items or parameter names..."
                  size="sm"
                  testId={setupWorkspaceTestIds.osdLibrarySearch}
                  type="search"
                />
              </label>
            </div>

            <div class="grid max-h-[32rem] min-w-0 gap-2 overflow-y-auto p-3 sm:grid-cols-2 2xl:grid-cols-1">
              {#if filteredLibraryItems.length === 0}
                <p class="rounded-md border border-dashed border-border px-3 py-4 text-sm text-text-muted sm:col-span-2 2xl:col-span-1">
                  {libraryItems.length === 0
                    ? "Every detected item is currently placed."
                    : "No available items match this search."}
                </p>
              {:else}
                {#each filteredLibraryItems as item (item.key)}
                  <div class="grid min-w-0 gap-1">
                    <OsdItemChip
                      mode="library"
                      label={itemDisplayLabel(item)}
                      paramSummary={itemParamSummary(item, activeScreen)}
                      ariaLabel={libraryChipAriaLabel(item)}
                      disabled={!canPlaceItem(item)}
                      canDrag={canDragLibraryItem(item)}
                      dragging={pointerDrag?.active && pointerDrag.source === "library" && pointerDrag.key === item.key}
                      warning={!item.complete}
                      staged={itemIsStaged(item)}
                      testId={`${setupWorkspaceTestIds.osdLibraryItemPrefix}-${activeScreen.screen}-${item.key}`}
                      {...itemDataAttributes(item)}
                      onclick={(event) => handleLibraryClick(event, item, activeScreen)}
                      onlostpointercapture={handleLostPointerCapture}
                      onpointerdown={(event) => startPointerDrag(event, item, activeScreen, "library")}
                    />
                    <p class="truncate px-1 font-mono text-[10px] text-text-muted">{itemParamSummary(item, activeScreen)}</p>
                    {#if !item.complete}
                      <p class="px-1 text-[10px] text-warning">Partial parameter set; exact drag placement is unavailable.</p>
                    {/if}
                  </div>
                {/each}
              {/if}
            </div>
          </section>

          <InternalLink
            variant="card"
            class="min-h-10 px-3 py-2"
            data-sveltekit-preload-code="hover"
            data-sveltekit-preload-data="hover"
            testId={setupWorkspaceTestIds.osdAdvancedParametersLink}
            href={`/setup/full-parameters?search=${encodeURIComponent(`OSD${activeScreen.screen}_`)}&filter=all`}
          >
            <span class="inline-flex items-center gap-2">
              <SlidersHorizontal aria-hidden="true" class="text-accent" size={16} />
              Advanced {activeScreen.label} parameters
            </span>
            <span class="font-mono text-[10px] text-text-muted">OSD{activeScreen.screen}_*</span>
          </InternalLink>
        </div>
      </div>

      {#if disabled}
        <div class="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-text-secondary">
          OSD edits are locked until the setup checkpoint is resolved.
        </div>
      {/if}
    </div>
  {/if}
</SetupSectionCard>

<style>
  .osd-grid-lines {
    background-image:
      linear-gradient(to right, color-mix(in oklab, var(--color-border) 65%, transparent) 1px, transparent 1px),
      linear-gradient(to bottom, color-mix(in oklab, var(--color-border) 65%, transparent) 1px, transparent 1px);
    background-size: calc(100% / var(--osd-columns)) calc(100% / var(--osd-rows));
  }
</style>
