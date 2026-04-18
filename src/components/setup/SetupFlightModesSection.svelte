<script lang="ts">
import { fromStore } from "svelte/store";

import {
  getParamsStoreContext,
  getSessionStoreContext,
  getSetupWorkspaceStoreContext,
} from "../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../data/ardupilot-docs";
import {
  buildParameterItemIndex,
  type ParameterItemModel,
} from "../../lib/params/parameter-item-model";
import {
  FLIGHT_MODE_CHANNEL_PARAM,
  RECOMMENDED_FLIGHT_MODE_PRESETS,
  buildFlightModeModel,
  buildFlightModePresetPreviewRows,
  toggleFlightModeBitmaskValue,
} from "../../lib/setup/flight-mode-model";
import { getVehicleSlug } from "../../lib/setup/vehicle-profile";
import type { FlightModeEntry } from "../../telemetry";
import type {
  SetupWorkspaceSection,
  SetupWorkspaceStoreState,
} from "../../lib/stores/setup-workspace";
import { selectTelemetryView } from "../../lib/telemetry-selectors";
import SetupBitmaskChecklist from "./shared/SetupBitmaskChecklist.svelte";
import SetupPreviewStagePanel from "./shared/SetupPreviewStagePanel.svelte";
import { setupWorkspaceTestIds } from "./setup-workspace-test-ids";

let {
  section,
  view,
  onSelectRecovery,
}: {
  section: SetupWorkspaceSection;
  view: SetupWorkspaceStoreState;
  onSelectRecovery: () => void;
} = $props();

const paramsStore = getParamsStoreContext();
const sessionStore = getSessionStoreContext();
const setupWorkspaceStore = getSetupWorkspaceStoreContext();
const paramsState = fromStore(paramsStore);
const sessionState = fromStore(sessionStore);

let draftValues = $state<Record<string, string>>({});
let presetPreviewOpen = $state(false);
let lastScopedModeSnapshot = $state<{ scopeKey: string; modes: FlightModeEntry[] } | null>(null);

let params = $derived(paramsState.current);
let session = $derived(sessionState.current);
let telemetry = $derived(selectTelemetryView(session.telemetryDomain));
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let vehicleSlug = $derived(getVehicleSlug(session.sessionDomain.value?.vehicle_state?.vehicle_type ?? null));
let docsUrl = $derived(resolveDocsUrl("flight_mode_configuration"));
let simpleDocsUrl = $derived(vehicleSlug === "copter" ? resolveDocsUrl("simple_super_simple_modes", "copter") : null);
let actionsBlocked = $derived(view.checkpoint.blocksActions || section.availability === "blocked");
let liveConnected = $derived(session.sessionDomain.value?.connection.kind === "connected");
let previousModes = $derived(
  view.activeScopeKey && lastScopedModeSnapshot?.scopeKey === view.activeScopeKey
    ? lastScopedModeSnapshot.modes
    : [],
);
let model = $derived(buildFlightModeModel({
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
}));
let presetTitle = $derived(
  model.preset
    ? `${model.preset.charAt(0).toUpperCase()}${model.preset.slice(1)} defaults`
    : "Recommended defaults",
);
let presetRows = $derived(
  model.preset
    ? buildFlightModePresetPreviewRows(model.preset, params.paramStore, params.stagedEdits, model.options)
    : [],
);
let flightModeChannelItem = $derived(itemIndex.get(FLIGHT_MODE_CHANNEL_PARAM) ?? null);
let flightModeChannelDraft = $derived.by(() => draftValue(FLIGHT_MODE_CHANNEL_PARAM, flightModeChannelItem?.value ?? null));
let simpleItem = $derived(itemIndex.get("SIMPLE") ?? null);
let superSimpleItem = $derived(itemIndex.get("SUPER_SIMPLE") ?? null);
let sectionCanConfirm = $derived(!actionsBlocked && model.canConfirm);

$effect(() => {
  if (view.activeScopeKey && Array.isArray(session.availableModes) && session.availableModes.length > 0) {
    lastScopedModeSnapshot = {
      scopeKey: view.activeScopeKey,
      modes: session.availableModes,
    };
  }
});

$effect(() => {
  if (sectionCanConfirm) {
    setupWorkspaceStore.confirmSection("flight_modes");
  } else {
    setupWorkspaceStore.clearSectionConfirmation("flight_modes");
  }
});

function item(name: string): ParameterItemModel | null {
  return itemIndex.get(name) ?? null;
}

function fixedChannelOptions() {
  return Array.from({ length: 16 }, (_, index) => ({
    code: index + 1,
    label: `Channel ${index + 1}`,
  }));
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

function currentValueText(item: ParameterItemModel | null): string {
  return item?.valueLabel ?? item?.valueText ?? "Unavailable";
}

function isQueued(name: string, fallback: number | null): boolean {
  const nextValue = resolveDraftNumber(name, fallback);
  return nextValue !== null && params.stagedEdits[name]?.nextValue === nextValue;
}

function canStage(name: string, fallback: number | null, allowWithoutModes = false): boolean {
  const target = item(name);
  const nextValue = resolveDraftNumber(name, fallback);
  if (!target || nextValue === null || target.readOnly === true || actionsBlocked) {
    return false;
  }

  const needsLiveModes = name !== FLIGHT_MODE_CHANNEL_PARAM && !allowWithoutModes;
  if (needsLiveModes && model.availabilityState !== "live") {
    return false;
  }

  return target.value !== nextValue && params.stagedEdits[name]?.nextValue !== nextValue;
}

function stage(name: string, fallback: number | null, allowWithoutModes = false) {
  if (!canStage(name, fallback, allowWithoutModes)) {
    return;
  }

  const target = item(name);
  const nextValue = resolveDraftNumber(name, fallback);
  if (!target || nextValue === null) {
    return;
  }

  paramsStore.stageParameterEdit(target, nextValue);
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
</script>

<section class="space-y-4" data-testid={setupWorkspaceTestIds.flightModesSection}>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">{section.title}</p>
      <h3 class="mt-2 text-lg font-semibold text-text-primary">Six-slot mode editing with truthful live availability</h3>
      <p class="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
        Flight-mode slots stay mapped to the live available-mode list for the current vehicle family. Presets, mode-switch channel changes, and Simple/Super Simple toggles all queue through the shared review tray instead of applying directly.
      </p>
    </div>

    {#if docsUrl}
      <a
        class="rounded-md border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        data-testid={setupWorkspaceTestIds.flightModesDocsLink}
        href={docsUrl}
        rel="noreferrer"
        target="_blank"
      >
        Flight-mode docs
      </a>
    {/if}
  </div>

  <div
    class="grid gap-3 rounded-lg border border-border bg-bg-primary/80 p-3 md:grid-cols-3"
    data-testid={setupWorkspaceTestIds.flightModesSummary}
  >
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Available modes</p>
      <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.flightModesAvailabilityState}>
        {model.availabilityText}
      </p>
      <p class="mt-1 text-sm text-text-secondary" data-testid={setupWorkspaceTestIds.flightModesAvailabilityDetail}>
        {model.availabilityDetail}
      </p>
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Current mode</p>
      <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.flightModesCurrentMode}>
        {model.currentModeName ?? "Unknown"}
      </p>
      <p class="mt-1 text-sm text-text-secondary" data-testid={setupWorkspaceTestIds.flightModesActiveSlot}>
        {#if model.activeSlotIndex !== null}
          Active slot · {model.activeSlotIndex + 1}
        {:else}
          Active slot unavailable until RC mode-channel telemetry settles.
        {/if}
      </p>
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Mode switch channel</p>
      <p class="mt-2 text-sm font-semibold text-text-primary">
        {#if flightModeChannelItem}
          {currentValueText(flightModeChannelItem)}
        {:else}
          {FLIGHT_MODE_CHANNEL_PARAM} unavailable
        {/if}
      </p>
      <p class="mt-1 text-sm text-text-secondary">
        Current RC channel selects which of the six slot ranges is active in flight.
      </p>
    </div>
  </div>

  {#if model.recoveryReasons.length > 0}
    <div
      class="rounded-lg border border-warning/40 bg-warning/10 px-4 py-4 text-sm leading-6 text-warning"
      data-testid={`${setupWorkspaceTestIds.flightModesBannerPrefix}-recovery`}
    >
      <p class="font-semibold text-text-primary">Flight-mode staging is staying fail-closed while live truth is partial.</p>
      <ul class="mt-2 list-disc space-y-1 pl-5">
        {#each model.recoveryReasons as reason (reason)}
          <li>{reason}</li>
        {/each}
      </ul>
      <button
        class="mt-4 rounded-md border border-warning/50 bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        onclick={onSelectRecovery}
        type="button"
      >
        Open Full Parameters recovery
      </button>
    </div>
  {/if}

  {#if model.preset}
    <article class="rounded-lg border border-border bg-bg-primary/80 p-3" data-testid={setupWorkspaceTestIds.flightModesPresetPreview}>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Recommended preset</p>
          <h4 class="mt-2 text-base font-semibold text-text-primary">{presetTitle}</h4>
          <p class="mt-2 text-sm text-text-secondary">
            Use the vehicle-family default slot order when you want a conservative audited starting point. The preview stays visible even if the live mode list is currently stale.
          </p>
        </div>
        <button
          class="rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          disabled={presetRows.length === 0}
          onclick={() => (presetPreviewOpen = !presetPreviewOpen)}
          type="button"
        >
          {presetPreviewOpen ? "Hide preview" : "Preview defaults"}
        </button>
      </div>

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
            <p class="mt-3 text-xs leading-5 text-warning">
              Preset staging is blocked until the current scope has a live available-mode list for validation.
            </p>
          {/if}
        </div>
      {/if}
    </article>
  {/if}

  <article class="rounded-lg border border-border bg-bg-primary/80 p-3">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">{FLIGHT_MODE_CHANNEL_PARAM}</p>
        <h4 class="mt-2 text-base font-semibold text-text-primary">Mode switch channel</h4>
        <p class="mt-2 text-sm text-text-secondary">
          Select which RC channel feeds the six-slot mode PWM ranges. This stays editable even if the live mode list is currently stale.
        </p>
      </div>
      <div class="text-right">
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted" data-testid={`${setupWorkspaceTestIds.flightModesCurrentPrefix}-${FLIGHT_MODE_CHANNEL_PARAM}`}>
          Current · {currentValueText(flightModeChannelItem)}
        </p>
        {#if params.stagedEdits[FLIGHT_MODE_CHANNEL_PARAM]}
          <p class="mt-1 text-xs text-accent" data-testid={`${setupWorkspaceTestIds.flightModesStagedPrefix}-${FLIGHT_MODE_CHANNEL_PARAM}`}>
            Queued · {params.stagedEdits[FLIGHT_MODE_CHANNEL_PARAM]?.nextValueText}
          </p>
        {/if}
      </div>
    </div>

    <div class="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
      <select
        class="w-full rounded-xl border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
        data-testid={`${setupWorkspaceTestIds.flightModesInputPrefix}-${FLIGHT_MODE_CHANNEL_PARAM}`}
        disabled={actionsBlocked || !flightModeChannelItem}
        onchange={(event) => setDraft(FLIGHT_MODE_CHANNEL_PARAM, (event.currentTarget as HTMLSelectElement).value)}
        value={flightModeChannelDraft}
      >
        {#each fixedChannelOptions() as option (option.code)}
          <option value={String(option.code)}>{option.label}</option>
        {/each}
      </select>
      <button
        class="self-end rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
        data-testid={`${setupWorkspaceTestIds.flightModesStageButtonPrefix}-${FLIGHT_MODE_CHANNEL_PARAM}`}
        disabled={!canStage(FLIGHT_MODE_CHANNEL_PARAM, flightModeChannelItem?.value ?? null, true)}
        onclick={() => stage(FLIGHT_MODE_CHANNEL_PARAM, flightModeChannelItem?.value ?? null, true)}
        type="button"
      >
        {isQueued(FLIGHT_MODE_CHANNEL_PARAM, flightModeChannelItem?.value ?? null) ? "Queued" : "Stage"}
      </button>
    </div>
  </article>

  <div class="grid gap-3 xl:grid-cols-2">
    {#each model.slots as slot (slot.paramName)}
      <article class="rounded-lg border border-border bg-bg-primary/80 p-3" data-testid={`${setupWorkspaceTestIds.flightModesSlotPrefix}-${slot.slot}`}>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div class="flex items-center gap-2">
              <p class="text-sm font-semibold text-text-primary">Slot {slot.slot}</p>
              {#if slot.active}
                <span class="rounded-full border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
                  active
                </span>
              {/if}
            </div>
            <p class="mt-2 text-sm text-text-secondary">PWM range {slot.pwmLabel}</p>
          </div>
          <div class="text-right">
            <p class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted" data-testid={`${setupWorkspaceTestIds.flightModesCurrentPrefix}-${slot.paramName}`}>
              Current · {slot.currentName}
            </p>
            {#if params.stagedEdits[slot.paramName]}
              <p class="mt-1 text-xs text-accent" data-testid={`${setupWorkspaceTestIds.flightModesStagedPrefix}-${slot.paramName}`}>
                Queued · {params.stagedEdits[slot.paramName]?.nextValueText}
              </p>
            {/if}
          </div>
        </div>

        <div class="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
          <select
            class="w-full rounded-xl border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
            data-testid={`${setupWorkspaceTestIds.flightModesInputPrefix}-${slot.paramName}`}
            disabled={actionsBlocked || model.availabilityState !== "live" || model.options.length === 0 || !item(slot.paramName)}
            onchange={(event) => setDraft(slot.paramName, (event.currentTarget as HTMLSelectElement).value)}
            value={draftValue(slot.paramName, slot.effectiveValue)}
          >
            {#each model.options as option (option.customMode)}
              <option value={String(option.customMode)}>{option.name}</option>
            {/each}
          </select>
          <button
            class="self-end rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
            data-testid={`${setupWorkspaceTestIds.flightModesStageButtonPrefix}-${slot.paramName}`}
            disabled={!canStage(slot.paramName, slot.effectiveValue)}
            onclick={() => stage(slot.paramName, slot.effectiveValue)}
            type="button"
          >
            {isQueued(slot.paramName, slot.effectiveValue) ? "Queued" : "Stage"}
          </button>
        </div>

        {#if slot.unresolved}
          <p class="mt-3 text-xs leading-5 text-warning">
            The current slot value is not in the live available-mode list, so the section falls back to the raw numeric mode id until the vehicle reports a supported label again.
          </p>
        {/if}
      </article>
    {/each}
  </div>

  {#if model.simpleModeSupported}
    <div class="grid gap-3 xl:grid-cols-2">
      {#if simpleItem && model.simpleModeSlots.length > 0}
        <div data-testid={setupWorkspaceTestIds.flightModesSimpleChecklist}>
          <SetupBitmaskChecklist
            disabled={actionsBlocked || simpleItem.readOnly === true}
            items={model.simpleModeSlots.map((slot) => ({
              key: slot.key,
              label: slot.label,
              checked: slot.checked,
            }))}
            onToggle={(entry) => toggleBitmask("SIMPLE", Number(entry.key))}
            title="Simple mode slots"
          />
        </div>
      {/if}

      {#if superSimpleItem && model.superSimpleSlots.length > 0}
        <div data-testid={setupWorkspaceTestIds.flightModesSuperChecklist}>
          <SetupBitmaskChecklist
            disabled={actionsBlocked || superSimpleItem.readOnly === true}
            items={model.superSimpleSlots.map((slot) => ({
              key: slot.key,
              label: slot.label,
              checked: slot.checked,
            }))}
            onToggle={(entry) => toggleBitmask("SUPER_SIMPLE", Number(entry.key))}
            title="Super Simple slots"
          />
        </div>
      {/if}
    </div>

    {#if simpleDocsUrl}
      <p class="text-xs leading-5 text-text-muted">
        Simple and Super Simple remain copter-only because they depend on compass/home orientation. 
        <a class="font-semibold text-accent hover:underline" href={simpleDocsUrl} rel="noreferrer" target="_blank">Read the ArduPilot guidance</a>.
      </p>
    {/if}
  {/if}
</section>
