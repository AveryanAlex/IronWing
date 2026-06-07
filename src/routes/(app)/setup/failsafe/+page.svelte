<script lang="ts">
import { ClipboardCheck, ShieldAlert } from "lucide-svelte";
import { fromStore } from "svelte/store";

import { getParamsStoreContext, getSessionStoreContext } from "../../../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../../../data/ardupilot-docs";
import { buildParameterItemIndex, type ParameterItemModel } from "../../../../lib/params/parameter-item-model";
import { buildFailsafeSectionModel, type SafetyVehicleFamily } from "../../../../lib/setup/failsafe-model";
import SetupGuideCard from "../../../../features/setup/shared/SetupGuideCard.svelte";
import SetupNoticeList from "../../../../features/setup/shared/SetupNoticeList.svelte";
import SetupParamSection from "../../../../features/setup/shared/SetupParamSection.svelte";
import SetupPreviewStagePanel from "../../../../features/setup/shared/SetupPreviewStagePanel.svelte";
import SetupSectionCard from "../../../../features/setup/shared/SetupSectionCard.svelte";
import SetupSectionShell from "../../../../features/setup/components/SetupSectionShell.svelte";
import type { SetupParamRef } from "../../../../features/setup/shared/setup-param-refs";
import { Button, Eyebrow, HelperText } from "../../../../components/ui";
import { setupWorkspaceTestIds } from "../../../../features/setup/setup-workspace-test-ids";
import {
  getSetupWorkspaceRouteContext,
  setupRouteSection,
} from "../../../../features/setup/components/setup-workspace-route-context";

const route = getSetupWorkspaceRouteContext();
const viewStore = fromStore(route.viewStore);

let view = $derived(viewStore.current);
let section = $derived(setupRouteSection(view, "failsafe"));

const paramsStore = getParamsStoreContext();
const sessionStore = getSessionStoreContext();
const paramsState = fromStore(paramsStore);
const sessionState = fromStore(sessionStore);

let defaultsPreviewOpen = $state(false);

let params = $derived(paramsState.current);
let session = $derived(sessionState.current);
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let actionsBlocked = $derived(view.checkpoint.blocksActions);
let vehicleType = $derived(session.sessionDomain.value?.vehicle_state?.vehicle_type ?? null);
let model = $derived(
  buildFailsafeSectionModel({
    vehicleType,
    paramStore: params.paramStore,
    metadata: params.metadata,
    stagedEdits: params.stagedEdits,
  }),
);
let docsUrl = $derived(resolveDocsUrl("failsafe_landing_page", model.vehicleSlug));
let defaultsStateText = $derived.by(() => {
  const changeCount = model.defaultsPreview.filter((entry) => entry.willChange).length;
  return changeCount === 0
    ? "Recommended defaults already staged or applied"
    : `${changeCount} recommended change${changeCount === 1 ? "" : "s"} available`;
});
let previewRows = $derived(
  model.defaultsPreview.map((entry) => ({
    key: entry.paramName,
    label: entry.label,
    paramName: entry.paramName,
    detail: entry.currentValue === null ? `→ ${entry.newValue}` : `${entry.currentValue} → ${entry.newValue}`,
    willChange: entry.willChange,
  })),
);

type CardConfig = {
  id: string;
  title: string;
  docsUrl: string | null;
  summary: string;
  params: readonly SetupParamRef[];
};

let cards = $derived.by(() => buildCards(model.family));

function buildCards(family: SafetyVehicleFamily): CardConfig[] {
  const radioDocs = resolveDocsUrl("failsafe_radio", model.vehicleSlug);
  const batteryDocs = resolveDocsUrl("failsafe_battery", model.vehicleSlug);
  const gcsDocs = family === "rover" ? null : resolveDocsUrl("failsafe_gcs", model.vehicleSlug);
  const ekfDocs = family === "copter" ? resolveDocsUrl("failsafe_ekf", model.vehicleSlug) : null;
  const crashDocs = family === "copter" ? resolveDocsUrl("failsafe_crash_check", model.vehicleSlug) : null;

  const commonBattery: CardConfig = {
    id: "battery",
    title: "Battery failsafe",
    docsUrl: batteryDocs,
    summary: `${currentValueText(item("BATT_FS_LOW_ACT"))} low · ${currentValueText(item("BATT_FS_CRT_ACT"))} critical`,
    params: [
      { id: "BATT_FS_LOW_ACT" },
      { id: "BATT_LOW_VOLT" },
      { id: "BATT_LOW_MAH" },
      { id: "BATT_FS_CRT_ACT" },
      { id: "BATT_CRT_VOLT" },
      { id: "BATT_CRT_MAH" },
    ],
  };

  if (family === "plane") {
    return [
      {
        id: "radio",
        title: "Radio failsafe",
        docsUrl: radioDocs,
        summary: currentValueText(item("THR_FAILSAFE")),
        params: [{ id: "THR_FAILSAFE" }, { id: "THR_FS_VALUE" }],
      },
      commonBattery,
      {
        id: "gcs",
        title: "GCS failsafe",
        docsUrl: gcsDocs,
        summary: `${currentValueText(item("FS_LONG_ACTN"))} long · ${currentValueText(item("FS_SHORT_ACTN"))} short`,
        params: [{ id: "FS_LONG_ACTN" }, { id: "FS_SHORT_ACTN" }],
      },
    ];
  }

  if (family === "rover") {
    return [
      {
        id: "radio",
        title: "Radio / GCS failsafe",
        docsUrl: radioDocs,
        summary: `${currentValueText(item("FS_ACTION"))} · timeout ${currentValueText(item("FS_TIMEOUT"))}`,
        params: [{ id: "FS_ACTION" }, { id: "FS_TIMEOUT" }],
      },
      commonBattery,
    ];
  }

  return [
    {
      id: "radio",
      title: "Radio failsafe",
      docsUrl: radioDocs,
      summary: currentValueText(item("FS_THR_ENABLE")),
      params: [{ id: "FS_THR_ENABLE" }, { id: "FS_THR_VALUE" }],
    },
    commonBattery,
    {
      id: "gcs",
      title: "GCS failsafe",
      docsUrl: gcsDocs,
      summary: currentValueText(item("FS_GCS_ENABLE")),
      params: [{ id: "FS_GCS_ENABLE" }],
    },
    {
      id: "ekf",
      title: "EKF failsafe",
      docsUrl: ekfDocs,
      summary: currentValueText(item("FS_EKF_ACTION")),
      params: [{ id: "FS_EKF_ACTION" }, { id: "FS_EKF_THRESH" }],
    },
    {
      id: "crash",
      title: "Crash detection",
      docsUrl: crashDocs,
      summary: currentValueText(item("FS_CRASH_CHECK")),
      params: [{ id: "FS_CRASH_CHECK" }],
    },
  ];
}

function item(name: string): ParameterItemModel | null {
  return itemIndex.get(name) ?? null;
}

function currentValueText(item: ParameterItemModel | null): string {
  return item?.valueLabel ?? item?.valueText ?? "Unavailable";
}

function stageDefaults() {
  for (const entry of model.defaultsPreview) {
    if (!entry.willChange) {
      continue;
    }

    const target = item(entry.paramName);
    if (!target) {
      continue;
    }

    paramsStore.stageParameterEdit(target, entry.newValue);
  }

  defaultsPreviewOpen = false;
}
</script>

<SetupSectionShell
  sectionId={section.id}
  eyebrow={section.title}
  title="Failsafe actions by link and power source"
  description="Review radio, battery, and ground-control failsafe groups for the active vehicle family. Changes are staged for review before they are applied."
  testId={setupWorkspaceTestIds.failsafeSection}
  docs={[{ url: docsUrl, label: "ArduPilot Docs", testId: setupWorkspaceTestIds.failsafeDocsLink }]}
>
  {#snippet body()}
    <SetupSectionCard
      icon={ShieldAlert}
      title="Failsafe summary"
      description="Confirm the recommended defaults, loss-of-link response, and battery thresholds for the current vehicle."
      surface="elevated"
      testId={setupWorkspaceTestIds.failsafeSummary}
    >
      <div class="grid gap-3 md:grid-cols-3">
        <div>
          <Eyebrow tracking="widest">Defaults preview</Eyebrow>
          <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.failsafeDefaultsState}>
            {defaultsStateText}
          </p>
          <HelperText class="mt-1">Recommended loss-of-link actions can be inspected before staging.</HelperText>
        </div>
        <div>
          <Eyebrow tracking="widest">Radio / GCS state</Eyebrow>
          <p class="mt-2 text-sm font-semibold text-text-primary">
            {#if model.family === "plane"}
              {currentValueText(item("THR_FAILSAFE"))} radio · {currentValueText(item("FS_LONG_ACTN"))} GCS
            {:else if model.family === "rover"}
              {currentValueText(item("FS_ACTION"))} · timeout {currentValueText(item("FS_TIMEOUT"))}
            {:else}
              {currentValueText(item("FS_THR_ENABLE"))} radio · {currentValueText(item("FS_GCS_ENABLE"))} GCS
            {/if}
          </p>
          <HelperText class="mt-1">Match the loss-of-link actions to the vehicle family before flight.</HelperText>
        </div>
        <div>
          <Eyebrow tracking="widest">Battery thresholds</Eyebrow>
          <p class="mt-2 text-sm font-semibold text-text-primary">
            Low {currentValueText(item("BATT_LOW_VOLT"))} · Critical {currentValueText(item("BATT_CRT_VOLT"))}
          </p>
          <HelperText class="mt-1">Keep low and critical actions separate so escalation is clear.</HelperText>
        </div>
      </div>
    </SetupSectionCard>

  <SetupNoticeList notices={model.warningTexts} tone="warning" testIdPrefix={setupWorkspaceTestIds.failsafeBannerPrefix} />

  {#snippet previewActions()}
    <Button variant="secondary" onclick={() => (defaultsPreviewOpen = !defaultsPreviewOpen)}>
        {defaultsPreviewOpen ? "Hide preview" : "Preview defaults"}
    </Button>
  {/snippet}

  <SetupSectionCard
    icon={ClipboardCheck}
    title="Recommended defaults"
    description="Preview recommended starting actions for this vehicle family before staging them. Intentional deviations remain visible as staged edits."
    surface="primary"
    testId={setupWorkspaceTestIds.failsafePreview}
    actions={previewActions}
  >

    {#if defaultsPreviewOpen}
      <SetupPreviewStagePanel
        headerLabel="Preview · recommended failsafe defaults"
        onCancel={() => (defaultsPreviewOpen = false)}
        onStage={stageDefaults}
        rows={previewRows}
        stageLabel="Stage recommended defaults"
      />
    {/if}
  </SetupSectionCard>

  <div class="space-y-3">
    {#each cards as card (card.id)}
      <SetupParamSection
        id={card.id}
        icon={ShieldAlert}
        title={card.title}
        description={card.summary}
        docsUrl={card.docsUrl}
        params={card.params}
        disabled={actionsBlocked}
        surface="elevated"
        testIdPrefix="setup-workspace-failsafe"
      />
    {/each}

    <SetupGuideCard title="Failsafe review" description="Before flight, verify the radio link, battery thresholds, and GCS loss action against the current operating plan.">
      <p>Use battery low and critical actions as separate escalation points, and keep loss-of-link behavior aligned with the vehicle family.</p>
    </SetupGuideCard>
  </div>
  {/snippet}
</SetupSectionShell>
