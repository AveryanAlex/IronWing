<script lang="ts">
import { Monitor } from "lucide-svelte";

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

let {
  model,
  selectedScreen,
  disabled = false,
  itemIndex,
  onSelectScreen,
  onStageParam,
}: Props = $props();

let activeDragKey = $state<string | null>(null);

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

function handleItemPointerDown(event: PointerEvent, item: OsdItemModel, screen: OsdScreenModel) {
  if (disabled || !item.params.x || !item.params.y) {
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
          Grid {activeScreen.grid.label}. Drag enabled items or enter X/Y values.
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

      <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div
          class="relative min-h-72 overflow-hidden rounded-lg border border-border bg-bg-primary shadow-inner touch-none"
          data-osd-grid
          data-testid={setupWorkspaceTestIds.osdGrid}
          style:--osd-columns={activeScreen.grid.columns}
          style:--osd-rows={activeScreen.grid.rows}
          style={`aspect-ratio: ${activeScreen.grid.columns} / ${activeScreen.grid.rows}`}
        >
          <div class="absolute inset-0 osd-grid-lines"></div>
          <div class="absolute left-2 top-2 rounded bg-bg-primary/85 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-text-muted">
            {activeScreen.label} · {activeScreen.grid.label}
          </div>

          {#each activeScreen.enabledItems as item (item.key)}
            <Button
              type="button"
              variant="bare"
              class={[
                "absolute min-h-7 rounded-md border px-2 py-1 font-mono text-xs font-semibold shadow-sm transition",
                disabled || !item.params.x || !item.params.y ? "cursor-not-allowed border-border bg-bg-secondary text-text-muted" : "cursor-grab border-accent/50 bg-accent/15 text-text-primary active:cursor-grabbing",
                (item.xOutOfRange || item.yOutOfRange) && "border-warning/70 bg-warning/15",
                activeDragKey === item.key && "ring-2 ring-accent",
              ].filter(Boolean).join(" ")}
              style={`left: ${(item.displayX / activeScreen.grid.columns) * 100}%; top: ${(item.displayY / activeScreen.grid.rows) * 100}%`}
              testId={`${setupWorkspaceTestIds.osdGridItemPrefix}-${activeScreen.screen}-${item.key}`}
              aria-label={`Move ${item.label}`}
              disabled={disabled || !item.params.x || !item.params.y}
              onpointerdown={(event) => handleItemPointerDown(event, item, activeScreen)}
              onpointermove={(event) => handleItemPointerMove(event, item, activeScreen)}
              onpointerup={handleItemPointerEnd}
              onpointercancel={handleItemPointerEnd}
            >
              {item.label}
            </Button>
          {/each}
        </div>

        <div class="overflow-hidden rounded-lg border border-border">
          <div class="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] gap-2 border-b border-border bg-bg-secondary px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
            <span>Item</span>
            <span>X</span>
            <span>Y</span>
          </div>

          <div class="max-h-[34rem] overflow-y-auto">
            {#each activeScreen.items as item (item.key)}
              <div class="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] gap-2 border-b border-border/60 px-3 py-2 last:border-b-0" data-testid={`${setupWorkspaceTestIds.osdRowPrefix}-${activeScreen.screen}-${item.key}`}>
                <label class="flex min-w-0 items-start gap-2 text-sm text-text-primary">
                  <Checkbox
                    checked={item.enabled}
                    disabled={!isActionable(item, "enable")}
                    testId={`${setupWorkspaceTestIds.osdInputPrefix}-${item.params.enable ?? `${activeScreen.screen}-${item.key}-enable`}`}
                    onCheckedChange={(checked) => stageItemEnabled(item, checked)}
                  />
                  <span class="min-w-0">
                    <span class="block truncate font-medium">{item.label}</span>
                    <span class="block font-mono text-[10px] text-text-muted">OSD{activeScreen.screen}_{item.key}</span>
                    {#if !item.complete}
                      <span class="block text-[10px] text-warning">Partial parameter set</span>
                    {/if}
                    {#if item.xOutOfRange || item.yOutOfRange}
                      <span class="block text-[10px] text-warning">
                        Current coordinate is outside {activeScreen.grid.label}; editing will clamp it to the visible grid.
                      </span>
                    {/if}
                    {#if item.staged.enable || item.staged.x || item.staged.y}
                      <span class="mt-1 block" data-testid={`${setupWorkspaceTestIds.osdStagedPrefix}-${activeScreen.screen}-${item.key}`}>
                        <StagedBadge name={`OSD${activeScreen.screen}_${item.key}`} />
                      </span>
                    {/if}
                  </span>
                </label>

                <NumberInput
                  class="px-2"
                  min="0"
                  max={activeScreen.grid.columns - 1}
                  value={item.x}
                  invalid={item.xOutOfRange}
                  disabled={!isActionable(item, "x")}
                  inputTestId={`${setupWorkspaceTestIds.osdInputPrefix}-${item.params.x ?? `${activeScreen.screen}-${item.key}-x`}`}
                  onchange={(event) => stageCoordinate(item, activeScreen, "x", event.currentTarget.value)}
                />

                <NumberInput
                  class="px-2"
                  min="0"
                  max={activeScreen.grid.rows - 1}
                  value={item.y}
                  invalid={item.yOutOfRange}
                  disabled={!isActionable(item, "y")}
                  inputTestId={`${setupWorkspaceTestIds.osdInputPrefix}-${item.params.y ?? `${activeScreen.screen}-${item.key}-y`}`}
                  onchange={(event) => stageCoordinate(item, activeScreen, "y", event.currentTarget.value)}
                />
              </div>
            {/each}
          </div>
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
