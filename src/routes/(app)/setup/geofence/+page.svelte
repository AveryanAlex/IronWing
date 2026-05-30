<script lang="ts">
import { Map, Ruler, Shield } from "lucide-svelte";
import { fromStore } from "svelte/store";

import {
  getParamsStoreContext,
  getSessionStoreContext,
  getSetupWorkspaceStoreContext,
} from "../../../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../../../data/ardupilot-docs";
import { buildParameterItemIndex, type ParameterItemModel } from "../../../../lib/params/parameter-item-model";
import { buildGeofenceModel, type SafetyVehicleFamily } from "../../../../lib/setup/failsafe-model";
import type { SetupWorkspaceSection, SetupWorkspaceStoreState } from "../../../../lib/stores/setup-workspace";
import SetupBitmaskTable from "../../../../features/setup/shared/SetupBitmaskTable.svelte";
import SetupGuideCard from "../../../../features/setup/shared/SetupGuideCard.svelte";
import SetupNoticeList from "../../../../features/setup/shared/SetupNoticeList.svelte";
import SetupParamEditCard from "../../../../features/setup/shared/SetupParamEditCard.svelte";
import SetupParamEditGrid from "../../../../features/setup/shared/SetupParamEditGrid.svelte";
import SetupSectionCard from "../../../../features/setup/shared/SetupSectionCard.svelte";
import SetupSectionShell from "../../../../features/setup/components/SetupSectionShell.svelte";
import { resolveSetupDraftNumber, resolveSetupEnumOptions } from "../../../../features/setup/shared/parameter-editing";
import { Eyebrow, HelperText, Input } from "../../../../components/ui";
import { setupWorkspaceTestIds } from "../../../../features/setup/setup-workspace-test-ids";
import {
  getSetupWorkspaceRouteContext,
  setupRouteSection,
} from "../../../../features/setup/components/setup-workspace-route-context";

const route = getSetupWorkspaceRouteContext();
const viewStore = fromStore(route.viewStore);

let view = $derived(viewStore.current);
let section = $derived(setupRouteSection(view, "geofence"));

const paramsStore = getParamsStoreContext();
const sessionStore = getSessionStoreContext();
const setupWorkspaceStore = getSetupWorkspaceStoreContext();
const paramsState = fromStore(paramsStore);
const sessionState = fromStore(sessionStore);

let draftValues = $state<Record<string, string>>({});

let params = $derived(paramsState.current);
let session = $derived(sessionState.current);
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let actionsBlocked = $derived(view.checkpoint.blocksActions);
let vehicleType = $derived(session.sessionDomain.value?.vehicle_state?.vehicle_type ?? null);
let model = $derived(
  buildGeofenceModel({
    vehicleType,
    paramStore: params.paramStore,
    metadata: params.metadata,
    stagedEdits: params.stagedEdits,
  }),
);
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
    .filter(
      (entry) =>
        Number.isInteger(entry.bit) &&
        entry.bit >= 0 &&
        typeof entry.label === "string" &&
        entry.label.trim().length > 0,
    )
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
        {
          kind: "enum",
          name: "FENCE_ENABLE",
          label: "Fence enable",
          description: "Turns geofence enforcement on or off for the current vehicle.",
        },
        {
          kind: "enum",
          name: "FENCE_ACTION",
          label: "Breach action",
          description: "Action taken when the vehicle breaches the configured fence.",
        },
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
          {
            kind: "number",
            name: "FENCE_RADIUS",
            label: "Circle radius",
            description: "Radius of the circular fence around the home or configured origin.",
            unit: "m",
            min: 0,
            step: 1,
          },
          {
            kind: "number",
            name: "FENCE_MARGIN",
            label: "Margin",
            description: "Buffer distance before the rover declares a breach.",
            unit: "m",
            min: 0,
            step: 1,
          },
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
          {
            kind: "number",
            name: "FENCE_ALT_MAX",
            label: "Max altitude",
            description: "Upper altitude limit enforced by the fixed-wing fence.",
            unit: "m",
            min: 0,
            step: 1,
          },
          {
            kind: "number",
            name: "FENCE_MARGIN",
            label: "Margin",
            description: "Buffer distance before the plane fence breach action triggers.",
            unit: "m",
            min: 0,
            step: 1,
          },
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
        {
          kind: "number",
          name: "FENCE_ALT_MAX",
          label: "Max altitude",
          description: "Upper altitude fence before the copter breaches vertically.",
          unit: "m",
          min: 0,
          step: 1,
        },
        {
          kind: "number",
          name: "FENCE_ALT_MIN",
          label: "Min altitude",
          description: "Lower altitude fence for copter missions that require vertical clearance.",
          unit: "m",
          step: 1,
        },
        {
          kind: "number",
          name: "FENCE_RADIUS",
          label: "Circle radius",
          description: "Radius of the copter circle fence.",
          unit: "m",
          min: 0,
          step: 1,
        },
        {
          kind: "number",
          name: "FENCE_MARGIN",
          label: "Margin",
          description: "Buffer distance before the breach action triggers.",
          unit: "m",
          min: 0,
          step: 1,
        },
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

function visibleFields(fields: FenceFieldConfig[]): FenceFieldConfig[] {
  return fields.filter((field) => item(field.name));
}

function enumOptions(name: string) {
  return resolveSetupEnumOptions(params.metadata?.get(name)?.values);
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
  return resolveSetupDraftNumber(draftValue(name, fallback));
}

function canAutostage(
  field: FenceFieldConfig,
  target: ParameterItemModel | null,
  nextValue: number | null,
): target is ParameterItemModel {
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

function setFenceTypes(checked: boolean) {
  if (!fenceTypeItem || actionsBlocked || fenceTypeItem.readOnly === true || fenceTypeEntries.length === 0) {
    return;
  }

  const nextMask = checked ? fenceTypeEntries.reduce((mask, entry) => mask | (1 << Number(entry.key)), 0) : 0;
  paramsStore.stageParameterEdit(fenceTypeItem, nextMask);
}
</script>

<SetupSectionShell
  sectionId={section.id}
  eyebrow={section.title}
  title="Geofence enable, type, breach, and boundary settings"
  description="Review fence enable state, selected boundary types, breach action, and vehicle-specific limits. Copter altitude/radius, plane ceiling, and rover radius controls remain separate."
  testId={setupWorkspaceTestIds.geofenceSection}
  docs={[{ url: docsUrl, label: "ArduPilot Docs", testId: setupWorkspaceTestIds.geofenceDocsLink }]}
>
  {#snippet body()}
    <SetupSectionCard
      icon={Shield}
      title="Fence summary"
      description="Confirm enforcement state and selected fence types before flight."
      surface="elevated"
      testId={setupWorkspaceTestIds.geofenceSummary}
    >
      <div class="grid gap-3 md:grid-cols-3">
        <div>
          <Eyebrow tracking="widest">Fence state</Eyebrow>
          <p class="mt-2 text-sm font-semibold text-text-primary">{model.fenceEnabled ? "Enabled" : "Disabled"}</p>
          <HelperText class="mt-1">{model.selectedTypeCount > 0 ? model.selectedTypeLabels.join(", ") : "No fence types selected yet."}</HelperText>
        </div>
        <div>
          <Eyebrow tracking="widest">Vehicle family</Eyebrow>
          <p class="mt-2 text-sm font-semibold text-text-primary">{model.family}</p>
          <HelperText class="mt-1">Only boundary controls supported by this vehicle family are shown.</HelperText>
        </div>
        <div>
          <Eyebrow tracking="widest">Staged state</Eyebrow>
          <p class="mt-2 text-sm font-semibold text-text-primary">{model.hasPendingChanges ? "Fence edits staged" : "No staged fence edits"}</p>
          <HelperText class="mt-1">When the fence is enabled, select at least one boundary type before confirming the section.</HelperText>
        </div>
      </div>
    </SetupSectionCard>

  <SetupNoticeList notices={model.warningTexts} tone="warning" testIdPrefix={setupWorkspaceTestIds.geofenceBannerPrefix} />

  <SetupSectionCard
    icon={Map}
    title="Fence boundary types"
    description="Select the enabled fence shapes and altitude checks supported by this firmware."
    surface="elevated"
    testId={setupWorkspaceTestIds.geofenceTypeChecklist}
  >
      {#if params.stagedEdits.FENCE_TYPE}
        <p class="mt-1 text-xs text-accent" data-testid={`${setupWorkspaceTestIds.geofenceStagedPrefix}-FENCE_TYPE`}>
          Queued · {params.stagedEdits.FENCE_TYPE.nextValueText}
        </p>
      {/if}

    {#if fenceTypeEntries.length > 0}
      <SetupBitmaskTable
        description="Select the fence shapes and altitude checks that should be active when the geofence is enabled."
        disabled={actionsBlocked || fenceTypeItem?.readOnly === true}
        embedded
        items={fenceTypeEntries}
        onSetAll={setFenceTypes}
        onToggle={(entry) => toggleFenceType(Number(entry.key))}
        title="Configured fence types"
      />
    {:else}
      <p class="text-sm text-text-secondary">No matching settings are available for this firmware.</p>
    {/if}
  </SetupSectionCard>

  <div class="space-y-3">
    {#each cards as card (card.id)}
      <SetupSectionCard
        icon={Ruler}
        title={card.title}
        description={card.summary}
        surface="elevated"
        testId={`${setupWorkspaceTestIds.geofenceCardPrefix}-${card.id}`}
      >
        {#if visibleFields(card.fields).length > 0}
          <SetupParamEditGrid>
            {#each visibleFields(card.fields) as field (field.name)}
              {@const fieldItem = item(field.name)}
              {#if fieldItem}
                {@const fieldValue = draftValue(field.name, fieldItem.value)}
                {#if field.kind === "enum"}
                  {@const options = enumOptions(field.name)}
                  <SetupParamEditCard
                    item={fieldItem}
                    inputId={`${card.id}-${field.name}`}
                    label={field.label}
                    description={field.description}
                    type="enum"
                    options={options}
                    value={fieldValue}
                    stagedName={params.stagedEdits[field.name] ? field.name : undefined}
                    stagedTestId={`${setupWorkspaceTestIds.geofenceStagedPrefix}-${field.name}`}
                    onUnstage={unstage}
                    onValueChange={(value) => typeof value === "string" && stageDraftValue(field, value)}
                    inputTestId={`${setupWorkspaceTestIds.geofenceInputPrefix}-${field.name}`}
                    disabled={actionsBlocked || options.length === 0}
                  />
                {:else}
                  <SetupParamEditCard
                    item={fieldItem}
                    inputId={`${card.id}-${field.name}`}
                    label={field.label}
                    description={field.description}
                    min={field.min}
                    step={field.step}
                    unit={field.unit ?? null}
                    stagedName={params.stagedEdits[field.name] ? field.name : undefined}
                    stagedTestId={`${setupWorkspaceTestIds.geofenceStagedPrefix}-${field.name}`}
                    onUnstage={unstage}
                    disabled={actionsBlocked}
                  >
                    <div class="flex items-center gap-2">
                      <Input
                        id={`${card.id}-${field.name}`}
                        inputmode="decimal"
                        min={field.min}
                        step={field.step}
                        type="number"
                        value={fieldValue}
                        disabled={actionsBlocked || fieldItem.readOnly}
                        testId={`${setupWorkspaceTestIds.geofenceInputPrefix}-${field.name}`}
                        oninput={(event) => stageDraftValue(field, (event.currentTarget as HTMLInputElement).value)}
                        onchange={(event) => stageDraftValue(field, (event.currentTarget as HTMLInputElement).value)}
                      />
                      {#if field.unit}
                        <span class="shrink-0 text-xs text-text-muted">{field.unit}</span>
                      {/if}
                    </div>
                  </SetupParamEditCard>
                {/if}
              {/if}
            {/each}
          </SetupParamEditGrid>
        {:else}
          <p class="text-sm text-text-secondary">No matching settings are available for this firmware.</p>
        {/if}
      </SetupSectionCard>
    {/each}

    <SetupGuideCard title="Geofence review" description="Use the enable, type, breach action, and boundary controls together.">
      <p>When fence enforcement is enabled, verify at least one boundary type is selected and check the planned radius or altitude limits against the operating area.</p>
    </SetupGuideCard>
  </div>
  {/snippet}
</SetupSectionShell>
