<script lang="ts">
import { ClipboardCheck, ShieldAlert } from "lucide-svelte";
import { fromStore } from "svelte/store";

import {
  getParamsStoreContext,
  getSessionStoreContext,
  getSetupWorkspaceStoreContext,
} from "../../../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../../../data/ardupilot-docs";
import { buildParameterItemIndex, type ParameterItemModel } from "../../../../lib/params/parameter-item-model";
import { buildFailsafeSectionModel, type SafetyVehicleFamily } from "../../../../lib/setup/failsafe-model";
import type { SetupWorkspaceSection, SetupWorkspaceStoreState } from "../../../../lib/stores/setup-workspace";
import SetupGuideCard from "../../../../features/setup/shared/SetupGuideCard.svelte";
import SetupNoticeList from "../../../../features/setup/shared/SetupNoticeList.svelte";
import SetupParamEditCard from "../../../../features/setup/shared/SetupParamEditCard.svelte";
import SetupParamEditGrid from "../../../../features/setup/shared/SetupParamEditGrid.svelte";
import SetupPreviewStagePanel from "../../../../features/setup/shared/SetupPreviewStagePanel.svelte";
import SetupSectionCard from "../../../../features/setup/shared/SetupSectionCard.svelte";
import SetupSectionShell from "../../../../features/setup/components/SetupSectionShell.svelte";
import { resolveSetupDraftNumber, resolveSetupEnumOptions } from "../../../../features/setup/shared/parameter-editing";
import { Button, Eyebrow, HelperText, Input } from "../../../../components/ui";
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
const setupWorkspaceStore = getSetupWorkspaceStoreContext();
const paramsState = fromStore(paramsStore);
const sessionState = fromStore(sessionStore);

let defaultsPreviewOpen = $state(false);
let draftValues = $state<Record<string, string>>({});

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
let sectionCanConfirm = $derived(!actionsBlocked && model.canConfirm);

type FieldConfig = {
  kind: "enum" | "number";
  name: string;
  label: string;
  description: string;
  unit?: string;
  min?: number;
  step?: number;
};

type CardConfig = {
  id: string;
  title: string;
  docsUrl: string | null;
  summary: string;
  fields: FieldConfig[];
};

let cards = $derived.by(() => buildCards(model.family));

$effect(() => {
  if (sectionCanConfirm) {
    setupWorkspaceStore.confirmSection("failsafe");
  } else {
    setupWorkspaceStore.clearSectionConfirmation("failsafe");
  }
});

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
    fields: [
      {
        kind: "enum",
        name: "BATT_FS_LOW_ACT",
        label: "Low-battery action",
        description: "Action taken when the pack first crosses the low threshold.",
      },
      {
        kind: "number",
        name: "BATT_LOW_VOLT",
        label: "Low voltage",
        description: "Low-voltage threshold before the first battery failsafe action.",
        unit: "V",
        min: 0,
        step: 0.1,
      },
      {
        kind: "number",
        name: "BATT_LOW_MAH",
        label: "Low mAh remaining",
        description: "Remaining capacity threshold for the low-battery action.",
        unit: "mAh",
        min: 0,
        step: 50,
      },
      {
        kind: "enum",
        name: "BATT_FS_CRT_ACT",
        label: "Critical-battery action",
        description: "Action taken when the pack reaches the critical threshold.",
      },
      {
        kind: "number",
        name: "BATT_CRT_VOLT",
        label: "Critical voltage",
        description: "Critical-voltage threshold before the final battery action.",
        unit: "V",
        min: 0,
        step: 0.1,
      },
      {
        kind: "number",
        name: "BATT_CRT_MAH",
        label: "Critical mAh remaining",
        description: "Remaining capacity threshold for the critical battery action.",
        unit: "mAh",
        min: 0,
        step: 50,
      },
    ],
  };

  if (family === "plane") {
    return [
      {
        id: "radio",
        title: "Radio failsafe",
        docsUrl: radioDocs,
        summary: currentValueText(item("THR_FAILSAFE")),
        fields: [
          { kind: "enum", name: "THR_FAILSAFE", label: "Action", description: "Plane radio-failsafe enable state." },
          {
            kind: "number",
            name: "THR_FS_VALUE",
            label: "Throttle PWM threshold",
            description: "PWM threshold that triggers the plane throttle failsafe.",
            unit: "PWM",
            min: 910,
            step: 1,
          },
        ],
      },
      commonBattery,
      {
        id: "gcs",
        title: "GCS failsafe",
        docsUrl: gcsDocs,
        summary: `${currentValueText(item("FS_LONG_ACTN"))} long · ${currentValueText(item("FS_SHORT_ACTN"))} short`,
        fields: [
          {
            kind: "enum",
            name: "FS_LONG_ACTN",
            label: "Long failsafe action",
            description: "Plane action when the long GCS failsafe triggers.",
          },
          {
            kind: "enum",
            name: "FS_SHORT_ACTN",
            label: "Short failsafe action",
            description: "Plane action when the short GCS failsafe triggers.",
          },
        ],
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
        fields: [
          {
            kind: "enum",
            name: "FS_ACTION",
            label: "Combined action",
            description: "Rover combined radio/GCS failsafe action.",
          },
          {
            kind: "number",
            name: "FS_TIMEOUT",
            label: "Timeout",
            description: "How long the rover waits before the combined failsafe triggers.",
            unit: "s",
            min: 0,
            step: 1,
          },
        ],
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
      fields: [
        { kind: "enum", name: "FS_THR_ENABLE", label: "Action", description: "Copter action when RC input is lost." },
        {
          kind: "number",
          name: "FS_THR_VALUE",
          label: "Throttle PWM threshold",
          description: "PWM threshold that counts as lost throttle signal.",
          unit: "PWM",
          min: 910,
          step: 1,
        },
      ],
    },
    commonBattery,
    {
      id: "gcs",
      title: "GCS failsafe",
      docsUrl: gcsDocs,
      summary: currentValueText(item("FS_GCS_ENABLE")),
      fields: [
        {
          kind: "enum",
          name: "FS_GCS_ENABLE",
          label: "Action",
          description: "Copter action when the GCS link is lost.",
        },
      ],
    },
    {
      id: "ekf",
      title: "EKF failsafe",
      docsUrl: ekfDocs,
      summary: currentValueText(item("FS_EKF_ACTION")),
      fields: [
        {
          kind: "enum",
          name: "FS_EKF_ACTION",
          label: "Action",
          description: "Copter action when EKF health drops below the configured threshold.",
        },
        {
          kind: "number",
          name: "FS_EKF_THRESH",
          label: "Variance threshold",
          description: "Variance threshold that trips the EKF failsafe.",
          min: 0.1,
          step: 0.1,
        },
      ],
    },
    {
      id: "crash",
      title: "Crash detection",
      docsUrl: crashDocs,
      summary: currentValueText(item("FS_CRASH_CHECK")),
      fields: [
        {
          kind: "enum",
          name: "FS_CRASH_CHECK",
          label: "Crash check",
          description: "Automatically disarm after a detected crash event.",
        },
      ],
    },
  ];
}

function item(name: string): ParameterItemModel | null {
  return itemIndex.get(name) ?? null;
}

function resolveEnumOptions(name: string) {
  return resolveSetupEnumOptions(params.metadata?.get(name)?.values);
}

function currentValueText(item: ParameterItemModel | null): string {
  return item?.valueLabel ?? item?.valueText ?? "Unavailable";
}

function visibleFields(fields: FieldConfig[]): FieldConfig[] {
  return fields.filter((field) => item(field.name));
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

function canAutostage(name: string, nextValue: number | null, requireOptions = false): boolean {
  const target = item(name);
  const options = resolveEnumOptions(name);
  if (!target || nextValue === null || target.readOnly === true || actionsBlocked) {
    return false;
  }
  if (requireOptions && options.length === 0) {
    return false;
  }

  return true;
}

function stage(name: string, value: string, fallback: number | null, requireOptions = false) {
  setDraft(name, value);
  const target = item(name);
  const nextValue = resolveDraftNumber(name, fallback);

  if (!canAutostage(name, nextValue, requireOptions) || !target || nextValue === null) {
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
      <SetupSectionCard
        icon={ShieldAlert}
        title={card.title}
        description={card.summary}
        docsUrl={card.docsUrl}
        surface="elevated"
        testId={`${setupWorkspaceTestIds.failsafeCardPrefix}-${card.id}`}
      >
        {#if visibleFields(card.fields).length > 0}
          <SetupParamEditGrid>
            {#each visibleFields(card.fields) as field (field.name)}
              {@const fieldItem = item(field.name)}
              {#if fieldItem}
                {@const fieldValue = draftValue(field.name, fieldItem.value)}
                {#if field.kind === "enum"}
                  {@const options = resolveEnumOptions(field.name)}
                  <SetupParamEditCard
                    item={fieldItem}
                    inputId={`${card.id}-${field.name}`}
                    label={field.label}
                    description={field.description}
                    type="enum"
                    options={options}
                    value={fieldValue}
                    stagedName={params.stagedEdits[field.name] ? field.name : undefined}
                    stagedTestId={`${setupWorkspaceTestIds.failsafeStagedPrefix}-${field.name}`}
                    onUnstage={unstage}
                    onValueChange={(value) => typeof value === "string" && stage(field.name, value, fieldItem.value, true)}
                    inputTestId={`${setupWorkspaceTestIds.failsafeInputPrefix}-${field.name}`}
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
                    stagedTestId={`${setupWorkspaceTestIds.failsafeStagedPrefix}-${field.name}`}
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
                        testId={`${setupWorkspaceTestIds.failsafeInputPrefix}-${field.name}`}
                        oninput={(event) => stage(field.name, (event.currentTarget as HTMLInputElement).value, fieldItem.value)}
                        onchange={(event) => stage(field.name, (event.currentTarget as HTMLInputElement).value, fieldItem.value)}
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

    <SetupGuideCard title="Failsafe review" description="Before flight, verify the radio link, battery thresholds, and GCS loss action against the current operating plan.">
      <p>Use battery low and critical actions as separate escalation points, and keep loss-of-link behavior aligned with the vehicle family.</p>
    </SetupGuideCard>
  </div>
  {/snippet}
</SetupSectionShell>
