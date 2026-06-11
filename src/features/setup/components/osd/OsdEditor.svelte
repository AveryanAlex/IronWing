<script lang="ts">
import { Grip, Monitor, Plus, X } from "lucide-svelte";

import type { ParameterItemModel } from "../../../../lib/params/parameter-item-model";
import type { ArduPilotOsdModel, OsdItemModel, OsdScreenModel } from "../../../../lib/osd/ardupilot-osd-model";
import { clampOsdCoordinate } from "../../../../lib/osd/ardupilot-osd-model";
import { Button, Checkbox, EmptyState, NativeSelect, NumberInput, StagedBadge } from "../../../../components/ui";
import SetupSectionCard from "../../shared/SetupSectionCard.svelte";
import SetupStatusPill from "../../shared/SetupStatusPill.svelte";
import { setupWorkspaceTestIds } from "../../setup-workspace-test-ids";

type Props = {
  model: ArduPilotOsdModel;
  selectedScreen: number | null;
  disabled?: boolean;
  itemIndex: Map<string, ParameterItemModel>;
  onSelectScreen: (screen: number) => void;
  onStageParam: (name: string, value: number) => void;
};

const OSD_DRAG_ITEM_MIME = "application/x-ironwing-osd-item-key";
const OSD_DRAG_SOURCE_MIME = "application/x-ironwing-osd-source";
type OsdDragSource = "library" | "placed";

let {
  model,
  selectedScreen,
  disabled = false,
  itemIndex,
  onSelectScreen,
  onStageParam,
}: Props = $props();

let activeDragKey = $state<string | null>(null);
let draggedLibraryKey = $state<string | null>(null);

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

function stageScreenEnabled(screen: OsdScreenModel, checked: boolean) {
  if (disabled || !screen.enableParamName || !isParamActionable(screen.enableParamName)) {
    return;
  }

  onStageParam(screen.enableParamName, checked ? 1 : 0);
}

function stageItemEnabled(item: OsdItemModel, checked: boolean) {
  if (disabled || !item.params.enable) {
    return;
  }

  onStageParam(item.params.enable, checked ? 1 : 0);
}

function stageItemDisabled(item: OsdItemModel) {
  stageItemEnabled(item, false);
  resetStagedCoordinates(item);
}

function stageCoordinate(item: OsdItemModel, screen: OsdScreenModel, axis: "x" | "y", value: string) {
  if (disabled) {
    return;
  }

  const paramName = axis === "x" ? item.params.x : item.params.y;
  if (!paramName) {
    return;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return;
  }

  onStageParam(paramName, clampOsdCoordinate(parsed, axis, screen.grid));
}

function stagePosition(item: OsdItemModel, screen: OsdScreenModel, x: number, y: number) {
  if (disabled) {
    return;
  }

  const nextX = clampOsdCoordinate(x, "x", screen.grid);
  const nextY = clampOsdCoordinate(y, "y", screen.grid);
  if (item.params.x && nextX !== item.x) {
    onStageParam(item.params.x, nextX);
  }
  if (item.params.y && nextY !== item.y) {
    onStageParam(item.params.y, nextY);
  }
}

function placeItem(item: OsdItemModel, screen: OsdScreenModel, x?: number, y?: number) {
  if (disabled) {
    return;
  }

  if (item.params.enable) {
    stageItemEnabled(item, true);
  }

  const position = resolvePlacement(item, screen, x, y);
  stagePosition(item, screen, position.x, position.y);
}

function dragToPointer(event: PointerEvent, item: OsdItemModel, screen: OsdScreenModel) {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const grid = target.closest<HTMLElement>("[data-osd-grid]");
  if (!grid) {
    return;
  }

  const bounds = grid.getBoundingClientRect();
  const x = ((event.clientX - bounds.left) / bounds.width) * screen.grid.columns;
  const y = ((event.clientY - bounds.top) / bounds.height) * screen.grid.rows;
  stagePosition(item, screen, x, y);
}

function dropPointToGrid(event: DragEvent, screen: OsdScreenModel): { x: number; y: number } | null {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) {
    return null;
  }

  const bounds = target.getBoundingClientRect();
  return {
    x: ((event.clientX - bounds.left) / bounds.width) * screen.grid.columns,
    y: ((event.clientY - bounds.top) / bounds.height) * screen.grid.rows,
  };
}

function handleLibraryDragStart(event: DragEvent, item: OsdItemModel) {
  if (disabled || !canPlaceItem(item)) {
    event.preventDefault();
    return;
  }

  draggedLibraryKey = item.key;
  setDragPayload(event, item, "library");
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "copyMove";
  }
}

function handleGridDragOver(event: DragEvent) {
  if (disabled) {
    return;
  }

  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
}

function handleGridDrop(event: DragEvent, screen: OsdScreenModel) {
  if (disabled) {
    return;
  }

  event.preventDefault();
  const key = dragItemKey(event);
  const item = screen.items.find((candidate) => candidate.key === key);
  const point = dropPointToGrid(event, screen);
  draggedLibraryKey = null;
  if (!item || !point) {
    return;
  }

  placeItem(item, screen, point.x, point.y);
}

function handleLibraryDrop(event: DragEvent, screen: OsdScreenModel) {
  if (disabled) {
    return;
  }

  event.preventDefault();
  if (dragSource(event) === "library") {
    draggedLibraryKey = null;
    return;
  }

  const key = dragItemKey(event);
  const item = screen.items.find((candidate) => candidate.key === key);
  draggedLibraryKey = null;
  if (item) {
    stageItemDisabled(item);
  }
}

function handleItemPointerDown(event: PointerEvent, item: OsdItemModel, screen: OsdScreenModel) {
  if (disabled || !canMoveItem(item)) {
    return;
  }

  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  activeDragKey = item.key;
  target.setPointerCapture(event.pointerId);
  dragToPointer(event, item, screen);
}

function handleGridChipDragStart(event: DragEvent, item: OsdItemModel) {
  if (disabled || !canMoveItem(item)) {
    event.preventDefault();
    return;
  }

  setDragPayload(event, item, "placed");
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
  }
}

function handleGridItemDragStart(event: DragEvent, item: OsdItemModel) {
  if (disabled || !isActionable(item, "enable")) {
    event.preventDefault();
    return;
  }

  setDragPayload(event, item, "placed");
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
  }
}

function handleItemPointerMove(event: PointerEvent, item: OsdItemModel, screen: OsdScreenModel) {
  if (activeDragKey !== item.key) {
    return;
  }

  dragToPointer(event, item, screen);
}

function handleItemPointerEnd(event: PointerEvent) {
  const target = event.currentTarget;
  if (target instanceof HTMLElement && target.hasPointerCapture(event.pointerId)) {
    target.releasePointerCapture(event.pointerId);
  }
  activeDragKey = null;
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

function setDragPayload(event: DragEvent, item: OsdItemModel, source: OsdDragSource) {
  event.dataTransfer?.setData(OSD_DRAG_ITEM_MIME, item.key);
  event.dataTransfer?.setData(OSD_DRAG_SOURCE_MIME, source);
  event.dataTransfer?.setData("text/plain", item.key);
}

function dragItemKey(event: DragEvent): string {
  return event.dataTransfer?.getData(OSD_DRAG_ITEM_MIME) || event.dataTransfer?.getData("text/plain") || "";
}

function dragSource(event: DragEvent): string {
  return event.dataTransfer?.getData(OSD_DRAG_SOURCE_MIME) || "";
}

function itemDisplayLabel(item: OsdItemModel): string {
  const metadataLabel = item.params.enable ? itemIndex.get(item.params.enable)?.label : null;
  return normalizeMetadataLabel(metadataLabel, item) ?? item.label;
}

function itemParamSummary(item: OsdItemModel, screen: OsdScreenModel): string {
  return `OSD${screen.screen}_${item.key}`;
}

function itemDataAttributes(item: OsdItemModel) {
  return {
    "data-osd-key": item.key,
    "data-enable-param": item.params.enable ?? undefined,
    "data-x-param": item.params.x ?? undefined,
    "data-y-param": item.params.y ?? undefined,
  };
}

function defaultPlaceLabel(item: OsdItemModel): string {
  return item.params.x && item.params.y ? "Place on grid" : "Enable item";
}

function resolvePlacement(item: OsdItemModel, screen: OsdScreenModel, x?: number, y?: number): { x: number; y: number } {
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
            onchange={(event) => onSelectScreen(Number(event.currentTarget.value))}
          />
        </label>

        <p class="text-xs text-text-muted">
          Grid {activeScreen.grid.label}. Drag items from the library, move placed chips, or use card controls.
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
            class="relative min-h-48 w-full min-w-0 overflow-hidden rounded-lg border border-border bg-bg-primary shadow-inner touch-none sm:min-h-72"
            data-osd-grid
            data-testid={setupWorkspaceTestIds.osdGrid}
            role="region"
            aria-label={`${activeScreen.label} OSD placement grid`}
            style:--osd-columns={activeScreen.grid.columns}
            style:--osd-rows={activeScreen.grid.rows}
            data-grid-columns={activeScreen.grid.columns}
            data-grid-rows={activeScreen.grid.rows}
            style={`aspect-ratio: ${activeScreen.grid.columns} / ${activeScreen.grid.rows}`}
            ondragover={handleGridDragOver}
            ondrop={(event) => handleGridDrop(event, activeScreen)}
          >
            <div class="absolute inset-0 osd-grid-lines"></div>

            {#each placedItems as item (item.key)}
              <Button
                type="button"
                variant="bare"
                class={[
                  "osd-grid-chip absolute min-h-7 justify-start overflow-hidden rounded-md border px-2 py-1 font-mono text-xs font-semibold shadow-sm transition",
                  !canMoveItem(item) ? "cursor-not-allowed border-border bg-bg-secondary text-text-muted" : "cursor-grab border-accent/50 bg-accent/15 text-text-primary active:cursor-grabbing",
                  (item.xOutOfRange || item.yOutOfRange) && "border-warning/70 bg-warning/15",
                  activeDragKey === item.key && "ring-2 ring-accent",
                ].filter(Boolean).join(" ")}
                style={`--osd-chip-x: ${(item.displayX / activeScreen.grid.columns) * 100}; --osd-chip-y: ${(item.displayY / activeScreen.grid.rows) * 100}`}
                testId={`${setupWorkspaceTestIds.osdGridItemPrefix}-${activeScreen.screen}-${item.key}`}
                aria-label={`Move ${itemDisplayLabel(item)}`}
                disabled={!canMoveItem(item)}
                draggable={canMoveItem(item)}
                {...itemDataAttributes(item)}
                data-grid-x={item.displayX}
                data-grid-y={item.displayY}
                ondragstart={(event) => handleGridChipDragStart(event, item)}
                onpointerdown={(event) => handleItemPointerDown(event, item, activeScreen)}
                onpointermove={(event) => handleItemPointerMove(event, item, activeScreen)}
                onpointerup={handleItemPointerEnd}
                onpointercancel={handleItemPointerEnd}
              >
                <span class="truncate">{itemDisplayLabel(item)}</span>
              </Button>
            {/each}
          </div>
        </div>

        <div class="flex min-w-0 flex-col gap-4">
          <section class="min-w-0 rounded-lg border border-border bg-bg-primary" data-testid={setupWorkspaceTestIds.osdPlacedList}>
            <div class="border-b border-border bg-bg-secondary px-3 py-2">
              <h3 class="text-xs font-semibold uppercase tracking-wide text-text-muted">Placed items</h3>
              <p class="mt-1 text-xs text-text-muted">Enabled OSD elements shown on the preview grid.</p>
            </div>

            <div class="grid max-h-[24rem] min-w-0 gap-2 overflow-y-auto p-3 sm:grid-cols-2 2xl:grid-cols-1">
              {#if placedItems.length === 0}
                <p class="rounded-md border border-dashed border-border px-3 py-4 text-sm text-text-muted">No items are placed on this screen yet.</p>
              {:else}
                {#each placedItems as item (item.key)}
                  <article
                    class="min-w-0 rounded-lg border border-border bg-bg-secondary p-3"
                    data-testid={`${setupWorkspaceTestIds.osdPlacedCardPrefix}-${activeScreen.screen}-${item.key}`}
                    draggable={!disabled && isActionable(item, "enable")}
                    {...itemDataAttributes(item)}
                    ondragstart={(event) => handleGridItemDragStart(event, item)}
                  >
                    <div class="flex min-w-0 items-start justify-between gap-2">
                      <div class="min-w-0">
                        <h4 class="truncate text-sm font-semibold text-text-primary">{itemDisplayLabel(item)}</h4>
                        <p class="truncate font-mono text-[10px] text-text-muted">{itemParamSummary(item, activeScreen)}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        tone="danger"
                        size="icon-sm"
                        ariaLabel={`Remove ${itemDisplayLabel(item)} from ${activeScreen.label}`}
                        testId={`${setupWorkspaceTestIds.osdRemovePrefix}-${activeScreen.screen}-${item.key}`}
                        disabled={!isActionable(item, "enable")}
                        onclick={() => stageItemDisabled(item)}
                      >
                        <X aria-hidden="true" size={14} />
                      </Button>
                    </div>

                    <div class="mt-3 grid grid-cols-2 gap-2">
                      <label class="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                        X
                        <NumberInput
                          class="px-2"
                          size="sm"
                          min="0"
                          max={activeScreen.grid.columns - 1}
                          value={item.x}
                          invalid={item.xOutOfRange}
                          disabled={!isActionable(item, "x")}
                          inputTestId={`${setupWorkspaceTestIds.osdInputPrefix}-${item.params.x ?? `${activeScreen.screen}-${item.key}-x`}`}
                          onchange={(event) => stageCoordinate(item, activeScreen, "x", event.currentTarget.value)}
                        />
                      </label>

                      <label class="grid gap-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                        Y
                        <NumberInput
                          class="px-2"
                          size="sm"
                          min="0"
                          max={activeScreen.grid.rows - 1}
                          value={item.y}
                          invalid={item.yOutOfRange}
                          disabled={!isActionable(item, "y")}
                          inputTestId={`${setupWorkspaceTestIds.osdInputPrefix}-${item.params.y ?? `${activeScreen.screen}-${item.key}-y`}`}
                          onchange={(event) => stageCoordinate(item, activeScreen, "y", event.currentTarget.value)}
                        />
                      </label>
                    </div>

                    {#if !item.complete}
                      <p class="mt-2 text-[10px] text-warning">Partial parameter set</p>
                    {/if}
                    {#if item.xOutOfRange || item.yOutOfRange}
                      <p class="mt-2 text-[10px] text-warning">
                        Current coordinate is outside {activeScreen.grid.label}; editing will clamp it to the visible grid.
                      </p>
                    {/if}
                    {#if item.staged.enable || item.staged.x || item.staged.y}
                      <span class="mt-2 block" data-testid={`${setupWorkspaceTestIds.osdStagedPrefix}-${activeScreen.screen}-${item.key}`}>
                        <StagedBadge name={itemParamSummary(item, activeScreen)} />
                      </span>
                    {/if}
                  </article>
                {/each}
              {/if}
            </div>
          </section>

          <section
            class="min-w-0 rounded-lg border border-border bg-bg-primary"
            data-testid={setupWorkspaceTestIds.osdLibrary}
            aria-label={`${activeScreen.label} OSD item library`}
            ondragover={handleGridDragOver}
            ondrop={(event) => handleLibraryDrop(event, activeScreen)}
          >
            <div class="border-b border-border bg-bg-secondary px-3 py-2">
              <h3 class="text-xs font-semibold uppercase tracking-wide text-text-muted">Item library</h3>
              <p class="mt-1 text-xs text-text-muted">Drag available cards onto the grid or use Place to enable them.</p>
            </div>

            <div class="grid max-h-[24rem] min-w-0 gap-2 overflow-y-auto p-3 sm:grid-cols-2 2xl:grid-cols-1">
              {#if libraryItems.length === 0}
                <p class="rounded-md border border-dashed border-border px-3 py-4 text-sm text-text-muted">Every detected item is currently placed.</p>
              {:else}
                {#each libraryItems as item (item.key)}
                  <article
                    class={[
                      "min-w-0 rounded-lg border bg-bg-secondary p-3 transition",
                      draggedLibraryKey === item.key ? "border-accent ring-2 ring-accent/35" : "border-border",
                    ].join(" ")}
                    data-testid={`${setupWorkspaceTestIds.osdLibraryItemPrefix}-${activeScreen.screen}-${item.key}`}
                    draggable={!disabled && canPlaceItem(item)}
                    {...itemDataAttributes(item)}
                    ondragstart={(event) => handleLibraryDragStart(event, item)}
                    ondragend={() => (draggedLibraryKey = null)}
                  >
                    <div class="flex min-w-0 items-start justify-between gap-3">
                      <div class="min-w-0">
                        <h4 class="truncate text-sm font-semibold text-text-primary">{itemDisplayLabel(item)}</h4>
                        <p class="truncate font-mono text-[10px] text-text-muted">{itemParamSummary(item, activeScreen)}</p>
                      </div>
                      <Grip class="mt-0.5 shrink-0 text-text-muted" aria-hidden="true" size={14} />
                    </div>

                    {#if !item.complete}
                      <p class="mt-2 text-[10px] text-warning">Partial parameter set</p>
                    {/if}

                    <Button
                      type="button"
                      variant="soft"
                      tone="accent"
                      size="sm"
                      class="mt-3 w-full"
                      testId={`${setupWorkspaceTestIds.osdPlacePrefix}-${activeScreen.screen}-${item.key}`}
                      disabled={!canPlaceItem(item)}
                      onclick={() => placeItem(item, activeScreen)}
                    >
                      <Plus aria-hidden="true" size={14} />
                      {defaultPlaceLabel(item)}
                    </Button>
                  </article>
                {/each}
              {/if}
            </div>
          </section>
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

  .osd-grid-chip {
    --osd-chip-width: min(6rem, max(2rem, calc((100% / var(--osd-columns)) * 6)));
    width: var(--osd-chip-width);
    left: calc(var(--osd-chip-x) * 1%);
    top: calc(var(--osd-chip-y) * 1%);
  }
</style>
