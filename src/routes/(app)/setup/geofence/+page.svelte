<script lang="ts">
import { Map, Ruler, Shield } from "lucide-svelte";
import { fromStore } from "svelte/store";

import { getParamsStoreContext, getSessionStoreContext } from "../../../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../../../data/ardupilot-docs";
import { buildParameterItemIndex, type ParameterItemModel } from "../../../../lib/params/parameter-item-model";
import { buildGeofenceModel, type SafetyVehicleFamily } from "../../../../lib/setup/failsafe-model";
import SetupBitmaskTable from "../../../../features/setup/shared/SetupBitmaskTable.svelte";
import SetupGuideCard from "../../../../features/setup/shared/SetupGuideCard.svelte";
import SetupNoticeList from "../../../../features/setup/shared/SetupNoticeList.svelte";
import SetupParamSection from "../../../../features/setup/shared/SetupParamSection.svelte";
import SetupSectionCard from "../../../../features/setup/shared/SetupSectionCard.svelte";
import SetupSectionShell from "../../../../features/setup/components/SetupSectionShell.svelte";
import type { SetupParamRef } from "../../../../features/setup/shared/setup-param-refs";
import { Eyebrow, HelperText } from "../../../../components/ui";
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
const paramsState = fromStore(paramsStore);
const sessionState = fromStore(sessionStore);

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

type FenceCardConfig = {
  id: string;
  title: string;
  summary: string;
  params: readonly SetupParamRef[];
};

const enableParams = [{ id: "FENCE_ENABLE" }, { id: "FENCE_ACTION" }] as const satisfies readonly SetupParamRef[];
const roverBoundaryParams = [
  { id: "FENCE_RADIUS" },
  { id: "FENCE_MARGIN" },
] as const satisfies readonly SetupParamRef[];
const planeBoundaryParams = [
  { id: "FENCE_ALT_MAX" },
  { id: "FENCE_MARGIN" },
] as const satisfies readonly SetupParamRef[];
const copterBoundaryParams = [
  { id: "FENCE_ALT_MAX" },
  { id: "FENCE_ALT_MIN" },
  { id: "FENCE_RADIUS" },
  { id: "FENCE_MARGIN" },
] as const satisfies readonly SetupParamRef[];

let cards = $derived.by(() => buildCards(model.family));

function buildCards(family: SafetyVehicleFamily): FenceCardConfig[] {
  const base: FenceCardConfig[] = [
    {
      id: "enable",
      title: "Fence enable and breach action",
      summary: `${currentValueText(item("FENCE_ENABLE"))} · ${currentValueText(item("FENCE_ACTION"))}`,
      params: enableParams,
    },
  ];

  if (family === "rover") {
    return [
      ...base,
      {
        id: "boundary",
        title: "Rover boundary tuning",
        summary: `${currentValueText(item("FENCE_RADIUS"))} radius · ${currentValueText(item("FENCE_MARGIN"))} margin`,
        params: roverBoundaryParams,
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
        params: planeBoundaryParams,
      },
    ];
  }

  return [
    ...base,
    {
      id: "boundary",
      title: "Copter boundary tuning",
      summary: `${currentValueText(item("FENCE_ALT_MAX"))} max · ${currentValueText(item("FENCE_ALT_MIN"))} min · ${currentValueText(item("FENCE_RADIUS"))} radius`,
      params: copterBoundaryParams,
    },
  ];
}

function item(name: string): ParameterItemModel | null {
  return itemIndex.get(name) ?? null;
}

function currentValueText(item: ParameterItemModel | null): string {
  return item?.valueLabel ?? item?.valueText ?? "Unavailable";
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
      <SetupParamSection
        id={card.id}
        icon={Ruler}
        title={card.title}
        description={card.summary}
        params={card.params}
        disabled={actionsBlocked}
        surface="elevated"
        testIdPrefix="setup-workspace-geofence"
      />
    {/each}

    <SetupGuideCard title="Geofence review" description="Use the enable, type, breach action, and boundary controls together.">
      <p>When fence enforcement is enabled, verify at least one boundary type is selected and check the planned radius or altitude limits against the operating area.</p>
    </SetupGuideCard>
  </div>
  {/snippet}
</SetupSectionShell>
