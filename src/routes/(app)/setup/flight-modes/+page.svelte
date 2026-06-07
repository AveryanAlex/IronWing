<script lang="ts">
import { DragDropProvider, type DragDropEventHandlers } from "@dnd-kit/svelte";
import { createSortable, isSortable } from "@dnd-kit/svelte/sortable";
import { Compass, GripVertical, Radio, Route } from "lucide-svelte";
import { tick } from "svelte";
import { fromStore } from "svelte/store";

import { getParamsStoreContext, getSessionStoreContext } from "../../../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../../../data/ardupilot-docs";
import { buildParameterItemIndex, type ParameterItemModel } from "../../../../lib/params/parameter-item-model";
import {
  FLIGHT_MODE_CHANNEL_PARAM,
  FLIGHT_MODE_PARAM_NAMES,
  FLIGHT_MODE_PWM_DISPLAY_MAX,
  FLIGHT_MODE_PWM_DISPLAY_MIN,
  RECOMMENDED_FLIGHT_MODE_PRESETS,
  buildFlightModeModel,
  buildFlightModePresetPreviewRows,
  getFlightModePwmDisplayBounds,
  toggleFlightModeBitmaskValue,
  type FlightModeSlotModel,
} from "../../../../lib/setup/flight-mode-model";
import { getVehicleSlug } from "../../../../lib/setup/vehicle-profile";
import { selectTelemetryView } from "../../../../lib/telemetry-selectors";
import type { FlightModeEntry } from "../../../../telemetry";
import {
  Badge,
  Button,
  DragHandle,
  ExternalLink,
  Eyebrow,
  HelperText,
  NativeSelect,
  StagedBadge as SetupStagedBadge,
} from "../../../../components/ui";
import SetupSectionShell from "../../../../features/setup/components/SetupSectionShell.svelte";
import { setupWorkspaceTestIds } from "../../../../features/setup/setup-workspace-test-ids";
import SetupBitmaskTable from "../../../../features/setup/shared/SetupBitmaskTable.svelte";
import SetupGuideCard from "../../../../features/setup/shared/SetupGuideCard.svelte";
import SetupNotice from "../../../../features/setup/shared/SetupNotice.svelte";
import SetupPreviewStagePanel from "../../../../features/setup/shared/SetupPreviewStagePanel.svelte";
import SetupSectionCard from "../../../../features/setup/shared/SetupSectionCard.svelte";
import {
  getSetupWorkspaceRouteContext,
  setupRouteSection,
} from "../../../../features/setup/components/setup-workspace-route-context";

const route = getSetupWorkspaceRouteContext();
const viewStore = fromStore(route.viewStore);

let view = $derived(viewStore.current);
let section = $derived(setupRouteSection(view, "flight_modes"));

type SortableFlightModeSlot = FlightModeSlotModel & {
  dragIndex: number;
};

type FlightModePwmLayoutRow = {
  paramName: string;
  slot: number;
  active: boolean;
  low: number;
  high: number;
  top: number;
  bottom: number;
  segmentTop: number;
  segmentBottom: number;
};

type FlightModePwmLayout = {
  height: number;
  rows: FlightModePwmLayoutRow[];
};

type DragStartEvent = Parameters<NonNullable<DragDropEventHandlers["onDragStart"]>>[0];
type DragOverEvent = Parameters<NonNullable<DragDropEventHandlers["onDragOver"]>>[0];
type DragEndEvent = Parameters<NonNullable<DragDropEventHandlers["onDragEnd"]>>[0];

const FLIGHT_MODE_SORTABLE_GROUP = "setup-flight-mode-slots";

const paramsStore = getParamsStoreContext();
const sessionStore = getSessionStoreContext();
const paramsState = fromStore(paramsStore);
const sessionState = fromStore(sessionStore);

let draftValues = $state<Record<string, string>>({});
let presetPreviewOpen = $state(false);
let lastScopedModeSnapshot = $state<{ scopeKey: string; modes: FlightModeEntry[] } | null>(null);
let draggingSlotParamName = $state<string | null>(null);
let visualSlotOrder = $state<string[]>([]);
let slotListElement = $state<HTMLDivElement | null>(null);
let pwmLayout = $state<FlightModePwmLayout>({ height: 0, rows: [] });
let fallbackDraggedSlotParamName: string | null = null;

let params = $derived(paramsState.current);
let session = $derived(sessionState.current);
let telemetry = $derived(selectTelemetryView(session.telemetryDomain));
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let vehicleSlug = $derived(getVehicleSlug(session.sessionDomain.value?.vehicle_state?.vehicle_type ?? null));
let docsUrl = $derived(resolveDocsUrl("flight_mode_configuration"));
let simpleDocsUrl = $derived(vehicleSlug === "copter" ? resolveDocsUrl("simple_super_simple_modes", "copter") : null);
let actionsBlocked = $derived(view.checkpoint.blocksActions);
let liveConnected = $derived(session.sessionDomain.value?.connection.kind === "connected");
let previousModes = $derived(
  view.activeScopeKey && lastScopedModeSnapshot?.scopeKey === view.activeScopeKey ? lastScopedModeSnapshot.modes : [],
);
let model = $derived(
  buildFlightModeModel({
    vehicleType: session.sessionDomain.value?.vehicle_state?.vehicle_type ?? null,
    paramStore: params.paramStore,
    stagedEdits: params.stagedEdits,
    availableModes: session.availableModes,
    previousAvailableModes: previousModes,
    currentModeName: session.sessionDomain.value?.vehicle_state?.mode_name ?? null,
    rcChannels: telemetry.rc_channels ?? null,
    liveConnected,
    sameScope: previousModes.length > 0,
    telemetrySettled: session.telemetryDomain.complete !== false,
  }),
);
let presetTitle = $derived(
  model.preset ? `${model.preset.charAt(0).toUpperCase()}${model.preset.slice(1)} defaults` : "Recommended defaults",
);
let presetRows = $derived(
  model.preset
    ? buildFlightModePresetPreviewRows(model.preset, params.paramStore, params.stagedEdits, model.options)
    : [],
);
let flightModeChannelItem = $derived(itemIndex.get(FLIGHT_MODE_CHANNEL_PARAM) ?? null);
let flightModeChannelDraft = $derived.by(() =>
  draftValue(FLIGHT_MODE_CHANNEL_PARAM, flightModeChannelItem?.value ?? null),
);
let selectedChannelNumber = $derived(
  resolveDraftNumber(FLIGHT_MODE_CHANNEL_PARAM, flightModeChannelItem?.value ?? null),
);
let selectedChannelValue = $derived(selectedChannelNumber !== null ? rcChannelValue(selectedChannelNumber) : null);
let selectedChannelLabel = $derived(selectedChannelNumber !== null ? `Channel ${selectedChannelNumber}` : "Channel --");
let selectedChannelState = $derived.by<"live" | "stale" | "unavailable">(() => {
  if (selectedChannelValue === null) {
    return "unavailable";
  }

  return session.telemetryDomain.complete === false ? "stale" : "live";
});
let simpleItem = $derived(itemIndex.get("SIMPLE") ?? null);
let superSimpleItem = $derived(itemIndex.get("SUPER_SIMPLE") ?? null);
let slotSelectsDisabled = $derived(actionsBlocked || model.availabilityState !== "live" || model.options.length === 0);
let canReorderFlightModes = $derived.by(() => {
  if (slotSelectsDisabled) {
    return false;
  }

  return model.slots.every((slot) => {
    const target = item(slot.paramName);
    return target && target.readOnly !== true && slot.effectiveValue !== null;
  });
});
let baseSlotOrder = $derived(model.slots.map((slot) => slot.paramName));
let orderedSlots = $derived.by<SortableFlightModeSlot[]>(() => {
  const base = model.slots.map((slot, index) => ({ ...slot, dragIndex: index }));
  const byParamName = new Map(base.map((slot) => [slot.paramName, slot]));
  const order =
    draggingSlotParamName !== null && visualSlotOrder.length === base.length ? visualSlotOrder : baseSlotOrder;
  const normalized = order.filter((paramName) => byParamName.has(paramName));

  if (normalized.length !== base.length) {
    return base;
  }

  return normalized.map((paramName, index) => ({
    ...byParamName.get(paramName)!,
    dragIndex: index,
  }));
});
let pwmRows = $derived(
  pwmLayout.rows.length === orderedSlots.length ? pwmLayout.rows : buildFallbackPwmRows(orderedSlots),
);
let lastPwmRow = $derived(pwmRows[pwmRows.length - 1] ?? null);
let pwmLayoutHeight = $derived(Math.max(pwmLayout.height, lastPwmRow?.segmentBottom ?? 0));
let pwmTrackTop = $derived(pwmRows[0]?.segmentTop ?? 0);
let pwmTrackBottom = $derived(lastPwmRow?.segmentBottom ?? pwmLayoutHeight);
let pwmTrackHeight = $derived(Math.max(pwmTrackBottom - pwmTrackTop, 1));
let activePwmRow = $derived(pwmRows.find((row) => row.active) ?? null);
let liveMarkerTop = $derived(
  activePwmRow && selectedChannelValue !== null
    ? activePwmRow.segmentTop +
        slotMarkerFraction(activePwmRow.slot) * (activePwmRow.segmentBottom - activePwmRow.segmentTop)
    : null,
);

$effect(() => {
  const element = slotListElement;
  const slots = orderedSlots;
  if (!element) {
    pwmLayout = { height: 0, rows: [] };
    return;
  }

  let disposed = false;
  const measure = () => {
    if (!disposed) {
      measurePwmLayout(element, slots);
    }
  };

  tick().then(measure);
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
  observer?.observe(element);
  for (const row of element.querySelectorAll<HTMLElement>("[data-flight-mode-slot-row]")) {
    observer?.observe(row);
  }
  const timeout = globalThis.setTimeout(measure, 0);

  return () => {
    disposed = true;
    observer?.disconnect();
    globalThis.clearTimeout(timeout);
  };
});

$effect(() => {
  if (view.activeScopeKey && Array.isArray(session.availableModes) && session.availableModes.length > 0) {
    lastScopedModeSnapshot = {
      scopeKey: view.activeScopeKey,
      modes: session.availableModes,
    };
  }
});

function item(name: string): ParameterItemModel | null {
  return itemIndex.get(name) ?? null;
}

function formatPwmValue(value: number | null): string {
  return value === null ? "-- µs" : `${Math.round(value)} µs`;
}

function rcChannelValue(channel: number): number | null {
  const value = telemetry.rc_channels?.[channel - 1];
  return typeof value === "number" && Number.isFinite(value) && value !== 0 && value !== 65535 ? value : null;
}

function slotMarkerFraction(slot: number): number {
  if (selectedChannelValue === null) {
    return 0.5;
  }

  const { low, high } = getFlightModePwmDisplayBounds(slot);
  const clamped = Math.max(low, Math.min(high, selectedChannelValue));
  return (clamped - low) / (high - low);
}

function layoutRowFromSlot(slot: SortableFlightModeSlot, top: number, bottom: number): FlightModePwmLayoutRow {
  const { low, high } = getFlightModePwmDisplayBounds(slot.slot);
  return {
    paramName: slot.paramName,
    slot: slot.slot,
    active: slot.active,
    low,
    high,
    top,
    bottom,
    segmentTop: top,
    segmentBottom: bottom,
  };
}

function withSegmentBounds(rows: FlightModePwmLayoutRow[]): FlightModePwmLayoutRow[] {
  return rows.map((row, index) => ({
    ...row,
    segmentTop: index === 0 ? row.top : ((rows[index - 1]?.bottom ?? row.top) + row.top) / 2,
    segmentBottom: index === rows.length - 1 ? row.bottom : (row.bottom + (rows[index + 1]?.top ?? row.bottom)) / 2,
  }));
}

function buildFallbackPwmRows(slots: readonly SortableFlightModeSlot[]): FlightModePwmLayoutRow[] {
  const rowHeight = 64;
  const rowGap = 8;
  return withSegmentBounds(
    slots.map((slot, index) => {
      const top = index * (rowHeight + rowGap);
      return layoutRowFromSlot(slot, top, top + rowHeight);
    }),
  );
}

function measurePwmLayout(element: HTMLDivElement, slots: readonly SortableFlightModeSlot[]) {
  const containerRect = element.getBoundingClientRect();
  const rows = slots.flatMap((slot) => {
    const rowElement = element.querySelector<HTMLElement>(`[data-flight-mode-slot-row="${slot.paramName}"]`);
    if (!rowElement) {
      return [];
    }

    const rect = rowElement.getBoundingClientRect();
    const top = rect.top - containerRect.top;
    return [layoutRowFromSlot(slot, top, top + rect.height)];
  });

  const layoutRows = withSegmentBounds(rows);
  const lastRow = layoutRows[layoutRows.length - 1];
  pwmLayout = {
    height: Math.max(element.scrollHeight, lastRow?.segmentBottom ?? 0),
    rows: layoutRows,
  };
}

function fixedChannelOptions() {
  return Array.from({ length: 16 }, (_, index) => {
    const code = index + 1;
    return {
      code,
      label: `Channel ${code} (${formatPwmValue(rcChannelValue(code))})`,
    };
  });
}

function draftValue(name: string, fallback: number | null): string {
  if (draftValues[name] !== undefined) {
    return draftValues[name];
  }

  const stagedValue = params.stagedEdits[name]?.nextValue;
  if (typeof stagedValue === "number" && Number.isFinite(stagedValue)) {
    return String(stagedValue);
  }

  return fallback === null ? "" : String(fallback);
}

function setDraft(name: string, value: string) {
  draftValues = {
    ...draftValues,
    [name]: value,
  };
}

function resolveDraftNumber(name: string, fallback: number | null): number | null {
  const raw = draftValue(name, fallback).trim();
  if (raw.length === 0) {
    return null;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function canAutostage(name: string, nextValue: number | null, allowWithoutModes = false): boolean {
  const target = item(name);
  if (!target || nextValue === null || target.readOnly === true || actionsBlocked) {
    return false;
  }

  const needsLiveModes = name !== FLIGHT_MODE_CHANNEL_PARAM && !allowWithoutModes;
  if (needsLiveModes && model.availabilityState !== "live") {
    return false;
  }

  return true;
}

function stage(name: string, value: string, fallback: number | null, allowWithoutModes = false) {
  setDraft(name, value);
  const target = item(name);
  const nextValue = resolveDraftNumber(name, fallback);
  if (!canAutostage(name, nextValue, allowWithoutModes) || !target || nextValue === null) {
    return;
  }

  paramsStore.stageParameterEdit(target, nextValue);
}

function unstage(name: string) {
  const nextDrafts = { ...draftValues };
  delete nextDrafts[name];
  draftValues = nextDrafts;
  paramsStore.discardStagedEdit(name);
}

function toggleBitmask(paramName: "SIMPLE" | "SUPER_SIMPLE", slot: number) {
  if (actionsBlocked) {
    return;
  }

  const target = item(paramName);
  if (!target || target.readOnly === true) {
    return;
  }

  const currentMask = params.stagedEdits[paramName]?.nextValue ?? target.value;
  paramsStore.stageParameterEdit(target, toggleFlightModeBitmaskValue(currentMask, slot));
}

function setBitmaskSlots(paramName: "SIMPLE" | "SUPER_SIMPLE", checked: boolean) {
  if (actionsBlocked) {
    return;
  }

  const target = item(paramName);
  if (!target || target.readOnly === true) {
    return;
  }

  const nextMask = checked ? model.slots.reduce((mask, slot) => mask | (1 << (slot.slot - 1)), 0) : 0;
  paramsStore.stageParameterEdit(target, nextMask);
}

function stagePreset() {
  if (!model.preset || !model.canStagePreset) {
    return;
  }

  const recommended = RECOMMENDED_FLIGHT_MODE_PRESETS[model.preset];
  for (const [index, paramName] of model.slots.map((slot) => slot.paramName).entries()) {
    const target = item(paramName);
    const nextValue = recommended.modes[index];
    if (!target || typeof nextValue !== "number") {
      continue;
    }

    if (target.value !== nextValue || params.stagedEdits[paramName]?.nextValue !== undefined) {
      paramsStore.stageParameterEdit(target, nextValue);
    }
  }

  presetPreviewOpen = false;
}

function sameSlotOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function moveOrderItem(order: readonly string[], fromIndex: number, toIndex: number): string[] {
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

function normalizeVisualOrder(): string[] {
  const order =
    draggingSlotParamName !== null && visualSlotOrder.length === baseSlotOrder.length ? visualSlotOrder : baseSlotOrder;
  const validIds = new Set(baseSlotOrder);
  return order.filter((id) => validIds.has(id));
}

function sortableSlotId(id: string | number): string | null {
  return typeof id === "string" && /^FLTMODE[1-6]$/.test(id) ? id : null;
}

function createSlotSortable(getSlot: () => SortableFlightModeSlot) {
  return createSortable({
    get id() {
      return getSlot().paramName;
    },
    group: FLIGHT_MODE_SORTABLE_GROUP,
    type: "flight-mode-slot",
    get disabled() {
      return !canReorderFlightModes;
    },
    get index() {
      return getSlot().dragIndex;
    },
    transition: null,
  });
}

function stageReorderedSlots(finalOrder: readonly string[]) {
  if (!canReorderFlightModes || finalOrder.length !== model.slots.length) {
    return;
  }

  const sourceByParam = new Map(model.slots.map((slot) => [slot.paramName, slot]));
  const nextDrafts = { ...draftValues };

  finalOrder.forEach((sourceParamName, targetIndex) => {
    const sourceSlot = sourceByParam.get(sourceParamName);
    const targetParamName = FLIGHT_MODE_PARAM_NAMES[targetIndex];
    const target = targetParamName ? item(targetParamName) : null;
    const nextValue = sourceSlot?.effectiveValue ?? null;

    if (!targetParamName || !target || target.readOnly === true || nextValue === null) {
      return;
    }

    paramsStore.stageParameterEdit(target, nextValue);
    nextDrafts[targetParamName] = String(nextValue);
  });

  draftValues = nextDrafts;
}

function handleSortableDragStart(event: DragStartEvent) {
  const { source } = event.operation;
  if (!isSortable(source)) {
    return;
  }

  const sourceParamName = sortableSlotId(source.id);
  if (sourceParamName === null) {
    return;
  }

  visualSlotOrder = orderedSlots.map((slot) => slot.paramName);
  draggingSlotParamName = sourceParamName;
}

function handleSortableDragOver(event: DragOverEvent) {
  const { source, target } = event.operation;
  if (
    !isSortable(source) ||
    !isSortable(target) ||
    source.group !== FLIGHT_MODE_SORTABLE_GROUP ||
    target.group !== FLIGHT_MODE_SORTABLE_GROUP
  ) {
    return;
  }

  const fromIndex = source.index;
  const toIndex = target.index;
  if (fromIndex === toIndex) {
    return;
  }

  const order = normalizeVisualOrder();
  if (order.length !== baseSlotOrder.length) {
    return;
  }

  visualSlotOrder = moveOrderItem(order, fromIndex, toIndex);
}

function handleSortableDragEnd(event: DragEndEvent) {
  const finalOrder = normalizeVisualOrder();

  if (!event.canceled && finalOrder.length === baseSlotOrder.length && !sameSlotOrder(finalOrder, baseSlotOrder)) {
    stageReorderedSlots(finalOrder);
  }

  draggingSlotParamName = null;
  visualSlotOrder = [];
}

function handleFallbackDragStart(event: DragEvent, slot: SortableFlightModeSlot) {
  if (!canReorderFlightModes) {
    return;
  }

  fallbackDraggedSlotParamName = slot.paramName;
  event.dataTransfer?.setData("text/plain", slot.paramName);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
  }
}

function handleFallbackDragOver(event: DragEvent, slot: SortableFlightModeSlot) {
  if (
    !canReorderFlightModes ||
    fallbackDraggedSlotParamName === null ||
    fallbackDraggedSlotParamName === slot.paramName
  ) {
    return;
  }

  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
}

function handleFallbackDrop(event: DragEvent, target: SortableFlightModeSlot) {
  event.preventDefault();
  const sourceParamName =
    sortableSlotId(event.dataTransfer?.getData("text/plain") ?? "") ?? fallbackDraggedSlotParamName;
  const sourceIndex = baseSlotOrder.findIndex((paramName) => paramName === sourceParamName);
  const targetIndex = baseSlotOrder.findIndex((paramName) => paramName === target.paramName);

  if (sourceIndex >= 0 && targetIndex >= 0 && sourceIndex !== targetIndex) {
    stageReorderedSlots(moveOrderItem(baseSlotOrder, sourceIndex, targetIndex));
  }

  fallbackDraggedSlotParamName = null;
}

function handleFallbackDragEnd() {
  fallbackDraggedSlotParamName = null;
}
</script>

<SetupSectionShell
  sectionId={section.id}
  eyebrow={section.title}
  title="Flight mode switch, live PWM ranges, and reorderable slots"
  description="Pick the RC channel that drives ArduPilot's six flight-mode switch PWM ranges, then stage mode assignments with dropdowns or by dragging tiles into a new order."
  testId={setupWorkspaceTestIds.flightModesSection}
  docs={[{ url: docsUrl, label: "ArduPilot Docs", testId: setupWorkspaceTestIds.flightModesDocsLink }]}
>
  {#snippet body()}
    <SetupGuideCard title="How the switch works">
      <div class="mt-3 grid gap-3 text-sm leading-6 text-text-secondary lg:grid-cols-3">
        <p>
          ArduPilot reads one RC input channel and splits its PWM value into six fixed ranges. Each range selects one
          <span class="font-semibold text-text-primary"> FLTMODEx</span> slot.
        </p>
        <p>
          Move your transmitter switch while watching the channel values. Choose the channel whose live µs value changes
          across the expected positions.
        </p>
        <p>
          Reorder tiles to move mode assignments between PWM ranges, or keep the order and edit individual dropdowns.
          Nothing is applied until review is confirmed.
        </p>
      </div>
    </SetupGuideCard>

    {#if model.availabilityState === "unavailable"}
      <SetupNotice tone="warning" testId={`${setupWorkspaceTestIds.flightModesBannerPrefix}-mode-list`}>
        The vehicle has not reported its available mode list yet, so slot selectors are read-only until live mode data arrives.
      </SetupNotice>
    {/if}

    {#if model.preset}
      <SetupSectionCard icon={Route} title={presetTitle} description="Use the vehicle-family default slot order as a conservative starting point. The preview stays visible even if the live mode list is currently stale." surface="primary" compact testId={setupWorkspaceTestIds.flightModesPresetPreview}>
        {#snippet actions()}
          <Button
            variant="secondary"
            disabled={presetRows.length === 0}
            onclick={() => (presetPreviewOpen = !presetPreviewOpen)}
          >
            {presetPreviewOpen ? "Hide preview" : "Preview defaults"}
          </Button>
        {/snippet}

        {#if presetPreviewOpen}
          <div class="mt-4">
            <SetupPreviewStagePanel
              headerLabel={`Preview · ${presetTitle}`}
              onCancel={() => (presetPreviewOpen = false)}
              onStage={stagePreset}
              rows={presetRows}
              stageLabel={model.canStagePreset ? "Stage these modes" : "Live mode list required"}
            />
            {#if !model.canStagePreset}
              <HelperText class="mt-3" size="xs" tone="warning">
                Preset staging is blocked until the current scope has a live available-mode list for validation.
              </HelperText>
            {/if}
          </div>
        {/if}
      </SetupSectionCard>
    {/if}

    <SetupSectionCard icon={Radio} title="Mode switch channel" description="Select which RC channel feeds the six flight-mode switch PWM ranges. Live values in parentheses update from telemetry so you can identify the transmitter switch channel." surface="primary" compact>
      {#snippet actions()}
        <div class="text-right">
          {#if params.stagedEdits[FLIGHT_MODE_CHANNEL_PARAM]}
            <p class="mt-2">
              <SetupStagedBadge name={FLIGHT_MODE_CHANNEL_PARAM} onUnstage={unstage} testId={`${setupWorkspaceTestIds.flightModesStagedPrefix}-${FLIGHT_MODE_CHANNEL_PARAM}`} />
            </p>
          {/if}
        </div>
      {/snippet}

      <div class="mt-4">
        <NativeSelect
          disabled={actionsBlocked || !flightModeChannelItem}
          onchange={(event) => stage(FLIGHT_MODE_CHANNEL_PARAM, (event.currentTarget as HTMLSelectElement).value, flightModeChannelItem?.value ?? null, true)}
          options={fixedChannelOptions().map((option) => ({ value: String(option.code), label: option.label }))}
          testId={`${setupWorkspaceTestIds.flightModesInputPrefix}-${FLIGHT_MODE_CHANNEL_PARAM}`}
          value={flightModeChannelDraft}
        />
      </div>
    </SetupSectionCard>

    <SetupSectionCard icon={GripVertical} title="Drag tiles or edit a slot directly" description="The PWM ranges stay fixed and the range column is row-aligned with each slot. Reordering moves mode values into the target FLTMODEx slots and stages the affected parameters." surface="primary" compact>
      {#snippet actions()}
        {#if !canReorderFlightModes}
          <HelperText class="max-w-xs" size="xs" tone="warning">
            Reordering is enabled when the live mode list is available and all six slot parameters are writable.
          </HelperText>
        {:else}
          <Eyebrow class="text-right" tracking="widest">
            PWM · <span class="font-mono text-text-primary tabular-nums">{selectedChannelLabel} · {formatPwmValue(selectedChannelValue)}</span>
          </Eyebrow>
        {/if}
      {/snippet}

      <DragDropProvider
        onDragEnd={handleSortableDragEnd}
        onDragOver={handleSortableDragOver}
        onDragStart={handleSortableDragStart}
      >
        <div class="mt-4">
          <div class="grid min-w-0 grid-cols-[minmax(0,1fr)_4.75rem] gap-3 sm:grid-cols-[minmax(0,1fr)_5.25rem]">
            <div bind:this={slotListElement} class="grid gap-2">
            {#each orderedSlots as slot (slot.paramName)}
              {@const sortable = createSlotSortable(() => slot)}
              {@const attachSortable = sortable.attach}
              {@const attachSortableHandle = sortable.attachHandle}
              <div
                data-flight-mode-dragging-source={draggingSlotParamName === slot.paramName ? "true" : undefined}
                data-flight-mode-slot-row={slot.paramName}
              >
                <article
                  class={["group flex min-h-16 min-w-0 items-stretch rounded-lg border bg-bg-secondary/60 text-sm transition", slot.active ? "border-accent/60 shadow-[inset_0_0_0_1px_rgba(18,185,255,0.22)]" : "border-border hover:border-border-light", sortable.isDropTarget && "ring-1 ring-accent/50", sortable.isDragSource && "z-10 opacity-60 shadow-lg"]}
                  data-testid={`${setupWorkspaceTestIds.flightModesSlotPrefix}-${slot.slot}`}
                  ondragover={(event) => handleFallbackDragOver(event, slot)}
                  ondrop={(event) => handleFallbackDrop(event, slot)}
                  {@attach attachSortable}
                >
                  <div class="flex w-10 shrink-0 items-center justify-center border-r border-border/60 text-text-muted/60">
                    <DragHandle
                      ariaLabel={`Drag to reorder flight mode slot ${slot.slot}`}
                      attach={attachSortableHandle}
                      disabled={!canReorderFlightModes}
                      onclick={(event) => event.stopPropagation()}
                      ondragend={handleFallbackDragEnd}
                      ondragstart={(event) => handleFallbackDragStart(event, slot)}
                      onkeydown={(event) => event.stopPropagation()}
                      testId={`${setupWorkspaceTestIds.flightModesSlotDragPrefix}-${slot.paramName}`}
                      title="Drag to reorder"
                    />
                  </div>

                  <div class="flex min-w-0 flex-1 flex-col gap-2 p-2 sm:flex-row sm:items-center">
                    <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <p class="font-semibold text-text-primary">Slot {slot.slot}</p>
                      {#if slot.active}
                        <Badge variant="accent" size="sm" case="upper" shape="pill">
                          active
                        </Badge>
                      {/if}
                      {#if params.stagedEdits[slot.paramName]}
                        <SetupStagedBadge name={slot.paramName} onUnstage={unstage} testId={`${setupWorkspaceTestIds.flightModesStagedPrefix}-${slot.paramName}`} />
                      {/if}
                    </div>

                    <div class="min-w-0 sm:w-64">
                      <NativeSelect
                        disabled={slotSelectsDisabled || !item(slot.paramName)}
                        onchange={(event) => stage(slot.paramName, (event.currentTarget as HTMLSelectElement).value, slot.effectiveValue)}
                        options={model.options.map((option) => ({ value: String(option.customMode), label: option.name }))}
                        testId={`${setupWorkspaceTestIds.flightModesInputPrefix}-${slot.paramName}`}
                        value={draftValue(slot.paramName, slot.effectiveValue)}
                      />
                    </div>

                    {#if slot.unresolved}
                      <HelperText class="basis-full" size="xs" tone="warning">
                        The current slot value is not in the live available-mode list, so the section shows the numeric mode id until the vehicle reports a supported label again.
                      </HelperText>
                    {/if}
                  </div>
                </article>
              </div>
            {/each}
            </div>

            <div
              class="relative min-w-0 data-[state=unavailable]:opacity-60"
              data-state={selectedChannelState}
              data-testid={setupWorkspaceTestIds.flightModesPwmBar}
              style:height={`${pwmLayoutHeight}px`}
            >
              <span class="sr-only">PWM {selectedChannelLabel} · {formatPwmValue(selectedChannelValue)}</span>

              <div class="absolute left-0 top-0 w-8 font-mono text-[10px] text-text-muted tabular-nums">
                {#if pwmRows.length > 0}
                  <span class="absolute right-0" style:top={`${pwmTrackTop + 1}px`}>{FLIGHT_MODE_PWM_DISPLAY_MIN}</span>
                  {#each pwmRows.slice(0, -1) as row (row.paramName)}
                    <span class="absolute right-0 -translate-y-1/2" style:top={`${row.segmentBottom}px`}>{row.high}</span>
                  {/each}
                  <span class="absolute right-0 -translate-y-full" style:top={`${pwmTrackBottom - 1}px`}>{FLIGHT_MODE_PWM_DISPLAY_MAX}</span>
                {/if}
              </div>

              <div
                class="absolute left-10 w-7 overflow-hidden rounded-full border border-border bg-bg-primary/90 shadow-inner"
                style:top={`${pwmTrackTop}px`}
                style:height={`${pwmTrackHeight}px`}
              >
                {#if activePwmRow}
                  <div
                    class="absolute inset-x-0 bg-accent/20 data-[state=stale]:bg-warning/20 data-[state=unavailable]:bg-text-muted/10"
                    data-state={selectedChannelState}
                    style:top={`${activePwmRow.segmentTop - pwmTrackTop}px`}
                    style:height={`${activePwmRow.segmentBottom - activePwmRow.segmentTop}px`}
                  ></div>
                {/if}

                {#each pwmRows.slice(0, -1) as row (row.paramName)}
                  <div class="absolute left-0 right-0 border-t border-dashed border-border/90" style:top={`${row.segmentBottom - pwmTrackTop}px`}></div>
                {/each}

                {#if liveMarkerTop !== null}
                  <div
                    class="absolute left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-bg-primary bg-accent shadow data-[state=stale]:bg-warning"
                    data-state={selectedChannelState}
                    style:top={`${liveMarkerTop - pwmTrackTop}px`}
                    title={`Live ${formatPwmValue(selectedChannelValue)}`}
                  ></div>
                {/if}
              </div>
            </div>
          </div>
        </div>
      </DragDropProvider>
    </SetupSectionCard>

    {#if model.simpleModeSupported}
      <SetupSectionCard icon={Compass} title="Simple mode assignment" description="Enable Simple or Super Simple on selected switch positions from the same grouped card." compact>
        <div class="grid gap-6 xl:grid-cols-2">
          {#if simpleItem && model.simpleModeSlots.length > 0}
            <div data-testid={setupWorkspaceTestIds.flightModesSimpleChecklist}>
              <SetupBitmaskTable
                description="Choose which flight-mode switch positions use Simple pilot-relative control."
                disabled={actionsBlocked || simpleItem.readOnly === true}
                embedded
                items={model.simpleModeSlots.map((slot) => ({
                  key: slot.key,
                  label: slot.label,
                  description: `Flight mode slot ${slot.key}`,
                  checked: slot.checked,
                }))}
                onSetAll={(checked) => setBitmaskSlots("SIMPLE", checked)}
                onToggle={(entry) => toggleBitmask("SIMPLE", Number(entry.key))}
                title="Simple mode slots"
              />
            </div>
          {/if}

          {#if superSimpleItem && model.superSimpleSlots.length > 0}
            <div data-testid={setupWorkspaceTestIds.flightModesSuperChecklist}>
              <SetupBitmaskTable
                description="Choose which flight-mode switch positions use Super Simple control relative to home."
                disabled={actionsBlocked || superSimpleItem.readOnly === true}
                embedded
                items={model.superSimpleSlots.map((slot) => ({
                  key: slot.key,
                  label: slot.label,
                  description: `Flight mode slot ${slot.key}`,
                  checked: slot.checked,
                }))}
                onSetAll={(checked) => setBitmaskSlots("SUPER_SIMPLE", checked)}
                onToggle={(entry) => toggleBitmask("SUPER_SIMPLE", Number(entry.key))}
                title="Super Simple slots"
              />
            </div>
          {/if}
        </div>
      </SetupSectionCard>

      {#if simpleDocsUrl}
        <HelperText size="xs">
          Simple and Super Simple remain copter-only because they depend on compass/home orientation.
          <ExternalLink class="font-semibold" href={simpleDocsUrl}>Read the ArduPilot guidance</ExternalLink>.
        </HelperText>
      {/if}
    {/if}
  {/snippet}
</SetupSectionShell>
