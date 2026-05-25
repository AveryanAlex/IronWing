<script lang="ts">
import { fromStore } from "svelte/store";

import {
  getParamsStoreContext,
  getSessionStoreContext,
  getSetupWorkspaceStoreContext,
} from "../../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../../data/ardupilot-docs";
import {
  buildParameterItemIndex,
  type ParameterItemModel,
} from "../../../lib/params/parameter-item-model";
import {
  buildGeofenceModel,
  type SafetyVehicleFamily,
} from "../../../lib/setup/failsafe-model";
import type {
  SetupWorkspaceSection,
  SetupWorkspaceStoreState,
} from "../../../lib/stores/setup-workspace";
import SetupBitmaskChecklist from "../shared/SetupBitmaskChecklist.svelte";
import SetupParamEnumControl from "../shared/SetupParamEnumControl.svelte";
import SetupSectionShell from "../SetupSectionShell.svelte";
import SetupStagedBadge from "../../ui/StagedBadge.svelte";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";

let {
  section,
  view,
}: {
  section: SetupWorkspaceSection;
  view: SetupWorkspaceStoreState;
} = $props();

const paramsStore = getParamsStoreContext();
const sessionStore = getSessionStoreContext();
const setupWorkspaceStore = getSetupWorkspaceStoreContext();
const paramsState = fromStore(paramsStore);
const sessionState = fromStore(sessionStore);

let draftValues = $state<Record<string, string>>({});

let params = $derived(paramsState.current);
let session = $derived(sessionState.current);
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let actionsBlocked = $derived(view.checkpoint.blocksActions || section.availability === "blocked");
let vehicleType = $derived(session.sessionDomain.value?.vehicle_state?.vehicle_type ?? null);
let model = $derived(buildGeofenceModel({
  vehicleType,
  paramStore: params.paramStore,
  metadata: params.metadata,
  stagedEdits: params.stagedEdits,
}));
let docsUrl = $derived(resolveDocsUrl("geofence"));
let sectionCanConfirm = $derived(!actionsBlocked && model.canConfirm);
let fenceTypeItem = $derived(itemIndex.get("FENCE_TYPE") ?? null);
let fenceTypeEntries = $derived.by(() => {
  const bitmask = params.metadata?.get("FENCE_TYPE")?.bitmask;
  if (!Array.isArray(bitmask)) {
    return [];
  }

  const currentMask = params.stagedEdits.FENCE_TYPE?.nextValue ?? fenceTypeItem?.value ?? null;
  if (!Number.isInteger(currentMask) || currentMask < 0) {
    return [];
  }

  return bitmask
    .filter((entry) => Number.isInteger(entry.bit) && entry.bit >= 0 && typeof entry.label === "string" && entry.label.trim().length > 0)
    .map((entry) => ({
      key: String(entry.bit),
      label: entry.label,
      checked: (currentMask & (1 << entry.bit)) !== 0,
    }));
});

type FenceFieldConfig = {
  kind: "enum" | "number";
  name: string;
  label: string;
  description: string;
  unit?: string;
  min?: number;
  step?: number;
};

type FenceCardConfig = {
  id: string;
  title: string;
  summary: string;
  fields: FenceFieldConfig[];
};

let cards = $derived.by(() => buildCards(model.family));

$effect(() => {
  if (sectionCanConfirm) {
    setupWorkspaceStore.confirmSection("geofence");
  } else {
    setupWorkspaceStore.clearSectionConfirmation("geofence");
  }
});

function buildCards(family: SafetyVehicleFamily): FenceCardConfig[] {
  const base: FenceCardConfig[] = [
    {
      id: "enable",
      title: "Fence enable and breach action",
      summary: `${currentValueText(item("FENCE_ENABLE"))} · ${currentValueText(item("FENCE_ACTION"))}`,
      fields: [
        { kind: "enum", name: "FENCE_ENABLE", label: "Fence enable", description: "Turns geofence enforcement on or off for the current vehicle." },
        { kind: "enum", name: "FENCE_ACTION", label: "Breach action", description: "Action taken when the vehicle breaches the configured fence." },
      ],
    },
  ];

  if (family === "rover") {
    return [
      ...base,
      {
        id: "boundary",
        title: "Rover boundary tuning",
        summary: `${currentValueText(item("FENCE_RADIUS"))} radius · ${currentValueText(item("FENCE_MARGIN"))} margin`,
        fields: [
          { kind: "number", name: "FENCE_RADIUS", label: "Circle radius", description: "Radius of the circular fence around the home or configured origin.", unit: "m", min: 0, step: 1 },
          { kind: "number", name: "FENCE_MARGIN", label: "Margin", description: "Buffer distance before the rover declares a breach.", unit: "m", min: 0, step: 1 },
        ],
      },
    ];
  }

  if (family === "plane") {
    return [
      ...base,
      {
        id: "boundary",
        title: "Plane boundary tuning",
        summary: `${currentValueText(item("FENCE_ALT_MAX"))} max altitude · ${currentValueText(item("FENCE_MARGIN"))} margin`,
        fields: [
          { kind: "number", name: "FENCE_ALT_MAX", label: "Max altitude", description: "Upper altitude limit enforced by the fixed-wing fence.", unit: "m", min: 0, step: 1 },
          { kind: "number", name: "FENCE_MARGIN", label: "Margin", description: "Buffer distance before the plane fence breach action triggers.", unit: "m", min: 0, step: 1 },
        ],
      },
    ];
  }

  return [
    ...base,
    {
      id: "boundary",
      title: "Copter boundary tuning",
      summary: `${currentValueText(item("FENCE_ALT_MAX"))} max · ${currentValueText(item("FENCE_ALT_MIN"))} min · ${currentValueText(item("FENCE_RADIUS"))} radius`,
      fields: [
        { kind: "number", name: "FENCE_ALT_MAX", label: "Max altitude", description: "Upper altitude fence before the copter breaches vertically.", unit: "m", min: 0, step: 1 },
        { kind: "number", name: "FENCE_ALT_MIN", label: "Min altitude", description: "Lower altitude fence for copter missions that require vertical clearance.", unit: "m", step: 1 },
        { kind: "number", name: "FENCE_RADIUS", label: "Circle radius", description: "Radius of the copter circle fence.", unit: "m", min: 0, step: 1 },
        { kind: "number", name: "FENCE_MARGIN", label: "Margin", description: "Buffer distance before the breach action triggers.", unit: "m", min: 0, step: 1 },
      ],
    },
  ];
}

function item(name: string): ParameterItemModel | null {
  return itemIndex.get(name) ?? null;
}

function currentValueText(item: ParameterItemModel | null): string {
  return item?.valueLabel ?? item?.valueText ?? "Unavailable";
}

function enumOptions(name: string) {
  const values = params.metadata?.get(name)?.values;
  if (!Array.isArray(values)) {
    return [];
  }

  return values.filter((entry) => Number.isFinite(entry.code) && entry.label.trim().length > 0);
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

function canAutostage(field: FenceFieldConfig, target: ParameterItemModel | null, nextValue: number | null): target is ParameterItemModel {
  if (!target || target.readOnly === true || actionsBlocked || nextValue === null) {
    return false;
  }
  if (field.kind === "enum" && enumOptions(field.name).length === 0) {
    return false;
  }

  return true;
}

function stageDraftValue(field: FenceFieldConfig, value: string) {
  setDraft(field.name, value);
  const target = item(field.name);
  const nextValue = resolveDraftNumber(field.name, target?.value ?? null);

  if (!canAutostage(field, target, nextValue)) {
    return;
  }

  paramsStore.stageParameterEdit(target, nextValue as number);
}

function unstage(name: string) {
  const rest = { ...draftValues };
  delete rest[name];
  draftValues = rest;
  paramsStore.discardStagedEdit(name);
}

function toggleFenceType(bit: number) {
  if (!fenceTypeItem || actionsBlocked || fenceTypeItem.readOnly === true) {
    return;
  }

  const currentMask = params.stagedEdits.FENCE_TYPE?.nextValue ?? fenceTypeItem.value;
  if (!Number.isInteger(currentMask) || currentMask < 0) {
    return;
  }

  paramsStore.stageParameterEdit(fenceTypeItem, currentMask ^ (1 << bit));
}
</script>

<SetupSectionShell
  sectionId={section.id}
  eyebrow={section.title}
  title="Boundary enforcement that stays honest about vehicle-family limits"
  description="Geofence keeps the selected boundary types, breach action, and family-specific range controls explicit. Copter altitude limits, plane ceiling protection, and rover radius-only fences stay separate instead of collapsing into one raw-parameter bucket."
  testId={setupWorkspaceTestIds.geofenceSection}
  docs={[{ url: docsUrl, label: "ArduPilot Docs", testId: setupWorkspaceTestIds.geofenceDocsLink }]}
>
  {#snippet body()}
      <div
        class="grid gap-3 rounded-lg border border-border bg-bg-primary/80 p-3 md:grid-cols-3"
        data-testid={setupWorkspaceTestIds.geofenceSummary}
      >
    <div>
      <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Fence state</p>
      <p class="mt-2 text-sm font-semibold text-text-primary">{model.fenceEnabled ? "Enabled" : "Disabled"}</p>
      <p class="mt-1 text-sm text-text-secondary">{model.selectedTypeCount > 0 ? model.selectedTypeLabels.join(", ") : "No fence types selected yet."}</p>
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Vehicle family</p>
      <p class="mt-2 text-sm font-semibold text-text-primary">{model.family}</p>
      <p class="mt-1 text-sm text-text-secondary">The visible boundary controls stay limited to what this vehicle family actually supports.</p>
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Stage state</p>
      <p class="mt-2 text-sm font-semibold text-text-primary">{model.hasPendingChanges ? "Queued fence edits present" : "No queued fence edits"}</p>
      <p class="mt-1 text-sm text-text-secondary">Fence confirmation stays conservative until the shared review tray is clear and at least one type is configured when enabled.</p>
    </div>
  </div>

  {#if model.recoveryReasons.length > 0}
    <div
      class="rounded-lg border border-warning/40 bg-warning/10 px-4 py-4 text-sm leading-6 text-warning"
      data-testid={setupWorkspaceTestIds.geofenceRecovery}
    >
      <p class="font-semibold text-text-primary">Geofence is staying fail-closed while the required rows or fence bitmask metadata are partial.</p>
      <ul class="mt-2 list-disc space-y-1 pl-5">
        {#each model.recoveryReasons as reason (reason)}
          <li>{reason}</li>
        {/each}
      </ul>
    </div>
  {/if}

  {#each model.warningTexts as text, index (text)}
    <div
      class="rounded-lg border border-warning/40 bg-warning/10 px-4 py-4 text-sm leading-6 text-warning"
      data-testid={`${setupWorkspaceTestIds.geofenceBannerPrefix}-${index}`}
    >
      {text}
    </div>
  {/each}

  <article class="rounded-lg border border-border bg-bg-primary/80 p-3" data-testid={setupWorkspaceTestIds.geofenceTypeChecklist}>
    <div>
      <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Fence boundary types</p>
      <p class="mt-2 text-sm text-text-secondary">
        Circle, polygon, and altitude fence selections stay visible here. When the bitmask metadata is malformed, the checklist stays read-only.
      </p>
      <p class="mt-3 text-xs font-semibold uppercase tracking-widest text-text-muted" data-testid={`${setupWorkspaceTestIds.geofenceCurrentPrefix}-FENCE_TYPE`}>
        Current · {fenceTypeItem?.valueLabel ?? fenceTypeItem?.valueText ?? "Unavailable"}
      </p>
      {#if params.stagedEdits.FENCE_TYPE}
        <p class="mt-1 text-xs text-accent" data-testid={`${setupWorkspaceTestIds.geofenceStagedPrefix}-FENCE_TYPE`}>
          Queued · {params.stagedEdits.FENCE_TYPE.nextValueText}
        </p>
      {/if}
    </div>

    {#if fenceTypeEntries.length > 0}
      <div class="mt-4">
        <SetupBitmaskChecklist
          disabled={actionsBlocked || fenceTypeItem?.readOnly === true}
          items={fenceTypeEntries}
          onToggle={(entry) => toggleFenceType(Number(entry.key))}
          title="Configured fence types"
        />
      </div>
    {:else}
      <p class="mt-4 text-sm text-warning">Fence type metadata is incomplete for this scope, so the checklist stays read-only.</p>
    {/if}
  </article>

  <div class="space-y-3">
    {#each cards as card (card.id)}
      <article class="rounded-lg border border-border bg-bg-primary/80 p-3" data-testid={`${setupWorkspaceTestIds.geofenceCardPrefix}-${card.id}`}>
        <div>
          <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">{card.title}</p>
          <h4 class="mt-2 text-base font-semibold text-text-primary">{card.summary}</h4>
        </div>

        <div class="mt-4 grid gap-3 xl:grid-cols-2">
          {#each card.fields as field (field.name)}
            <div class="rounded-lg border border-border bg-bg-secondary/60 p-3">
              <div class="flex items-center gap-2">
                <label class="text-xs font-semibold uppercase tracking-widest text-text-muted" for={`${card.id}-${field.name}`}>
                  {field.label}
                </label>
                {#if params.stagedEdits[field.name]}
                  <SetupStagedBadge
                    name={field.name}
                    onUnstage={unstage}
                    testId={`${setupWorkspaceTestIds.geofenceStagedPrefix}-${field.name}`}
                  />
                {/if}
              </div>
              <p class="mt-2 text-sm text-text-secondary">{field.description}</p>
              <p class="mt-3 text-xs font-semibold uppercase tracking-widest text-text-muted" data-testid={`${setupWorkspaceTestIds.geofenceCurrentPrefix}-${field.name}`}>
                Current · {currentValueText(item(field.name))}
              </p>

              <div class="mt-4">
                {#if field.kind === "enum"}
                  <SetupParamEnumControl
                    disabled={actionsBlocked || enumOptions(field.name).length === 0 || !item(field.name)}
                    id={`${card.id}-${field.name}`}
                    onChange={(value) => stageDraftValue(field, value)}
                    options={enumOptions(field.name)}
                    testId={`${setupWorkspaceTestIds.geofenceInputPrefix}-${field.name}`}
                    value={draftValue(field.name, item(field.name)?.value ?? null)}
                  />
                {:else}
                  <div class="flex items-center gap-2">
                    <input
                      class="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
                      data-testid={`${setupWorkspaceTestIds.geofenceInputPrefix}-${field.name}`}
                      disabled={actionsBlocked || !item(field.name)}
                      id={`${card.id}-${field.name}`}
                      min={field.min}
                      onchange={(event) => stageDraftValue(field, (event.currentTarget as HTMLInputElement).value)}
                      oninput={(event) => stageDraftValue(field, (event.currentTarget as HTMLInputElement).value)}
                      step={field.step}
                      type="number"
                      value={draftValue(field.name, item(field.name)?.value ?? null)}
                    />
                    {#if field.unit}
                      <span class="shrink-0 text-xs text-text-muted">{field.unit}</span>
                    {/if}
                  </div>
                {/if}

              </div>
            </div>
          {/each}
        </div>
      </article>
    {/each}
      </div>
  {/snippet}
</SetupSectionShell>
