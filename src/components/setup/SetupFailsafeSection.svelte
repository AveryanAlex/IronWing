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
  buildFailsafeSectionModel,
  type SafetyVehicleFamily,
} from "../../lib/setup/failsafe-model";
import type {
  SetupWorkspaceSection,
  SetupWorkspaceStoreState,
} from "../../lib/stores/setup-workspace";
import SetupPreviewStagePanel from "./shared/SetupPreviewStagePanel.svelte";
import SetupSectionShell from "./SetupSectionShell.svelte";
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

let defaultsPreviewOpen = $state(false);
let draftValues = $state<Record<string, string>>({});

let params = $derived(paramsState.current);
let session = $derived(sessionState.current);
let itemIndex = $derived(buildParameterItemIndex(params.paramStore, params.metadata));
let actionsBlocked = $derived(view.checkpoint.blocksActions || section.availability === "blocked");
let vehicleType = $derived(session.sessionDomain.value?.vehicle_state?.vehicle_type ?? null);
let model = $derived(buildFailsafeSectionModel({
  vehicleType,
  paramStore: params.paramStore,
  metadata: params.metadata,
  stagedEdits: params.stagedEdits,
}));
let docsUrl = $derived(resolveDocsUrl("failsafe_landing_page", model.vehicleSlug));
let defaultsStateText = $derived.by(() => {
  const changeCount = model.defaultsPreview.filter((entry) => entry.willChange).length;
  return changeCount === 0 ? "Recommended defaults already staged or applied" : `${changeCount} recommended change${changeCount === 1 ? "" : "s"} available`;
});
let previewRows = $derived(model.defaultsPreview.map((entry) => ({
  key: entry.paramName,
  label: entry.label,
  paramName: entry.paramName,
  detail: entry.currentValue === null ? `→ ${entry.newValue}` : `${entry.currentValue} → ${entry.newValue}`,
  willChange: entry.willChange,
})));
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
      { kind: "enum", name: "BATT_FS_LOW_ACT", label: "Low-battery action", description: "Action taken when the pack first crosses the low threshold." },
      { kind: "number", name: "BATT_LOW_VOLT", label: "Low voltage", description: "Low-voltage threshold before the first battery failsafe action.", unit: "V", min: 0, step: 0.1 },
      { kind: "number", name: "BATT_LOW_MAH", label: "Low mAh remaining", description: "Remaining capacity threshold for the low-battery action.", unit: "mAh", min: 0, step: 50 },
      { kind: "enum", name: "BATT_FS_CRT_ACT", label: "Critical-battery action", description: "Action taken when the pack reaches the critical threshold." },
      { kind: "number", name: "BATT_CRT_VOLT", label: "Critical voltage", description: "Critical-voltage threshold before the final battery action.", unit: "V", min: 0, step: 0.1 },
      { kind: "number", name: "BATT_CRT_MAH", label: "Critical mAh remaining", description: "Remaining capacity threshold for the critical battery action.", unit: "mAh", min: 0, step: 50 },
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
          { kind: "number", name: "THR_FS_VALUE", label: "Throttle PWM threshold", description: "PWM threshold that triggers the plane throttle failsafe.", unit: "PWM", min: 910, step: 1 },
        ],
      },
      commonBattery,
      {
        id: "gcs",
        title: "GCS failsafe",
        docsUrl: gcsDocs,
        summary: `${currentValueText(item("FS_LONG_ACTN"))} long · ${currentValueText(item("FS_SHORT_ACTN"))} short`,
        fields: [
          { kind: "enum", name: "FS_LONG_ACTN", label: "Long failsafe action", description: "Plane action when the long GCS failsafe triggers." },
          { kind: "enum", name: "FS_SHORT_ACTN", label: "Short failsafe action", description: "Plane action when the short GCS failsafe triggers." },
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
          { kind: "enum", name: "FS_ACTION", label: "Combined action", description: "Rover combined radio/GCS failsafe action." },
          { kind: "number", name: "FS_TIMEOUT", label: "Timeout", description: "How long the rover waits before the combined failsafe triggers.", unit: "s", min: 0, step: 1 },
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
        { kind: "number", name: "FS_THR_VALUE", label: "Throttle PWM threshold", description: "PWM threshold that counts as lost throttle signal.", unit: "PWM", min: 910, step: 1 },
      ],
    },
    commonBattery,
    {
      id: "gcs",
      title: "GCS failsafe",
      docsUrl: gcsDocs,
      summary: currentValueText(item("FS_GCS_ENABLE")),
      fields: [
        { kind: "enum", name: "FS_GCS_ENABLE", label: "Action", description: "Copter action when the GCS link is lost." },
      ],
    },
    {
      id: "ekf",
      title: "EKF failsafe",
      docsUrl: ekfDocs,
      summary: currentValueText(item("FS_EKF_ACTION")),
      fields: [
        { kind: "enum", name: "FS_EKF_ACTION", label: "Action", description: "Copter action when EKF health drops below the configured threshold." },
        { kind: "number", name: "FS_EKF_THRESH", label: "Variance threshold", description: "Variance threshold that trips the EKF failsafe.", min: 0.1, step: 0.1 },
      ],
    },
    {
      id: "crash",
      title: "Crash detection",
      docsUrl: crashDocs,
      summary: currentValueText(item("FS_CRASH_CHECK")),
      fields: [
        { kind: "enum", name: "FS_CRASH_CHECK", label: "Crash check", description: "Automatically disarm after a detected crash event." },
      ],
    },
  ];
}

function item(name: string): ParameterItemModel | null {
  return itemIndex.get(name) ?? null;
}

function resolveEnumOptions(name: string) {
  const values = params.metadata?.get(name)?.values;
  if (!Array.isArray(values)) {
    return [];
  }

  return values.filter((entry) => Number.isFinite(entry.code) && entry.label.trim().length > 0);
}

function currentValueText(item: ParameterItemModel | null): string {
  return item?.valueLabel ?? item?.valueText ?? "Unavailable";
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

function isQueued(name: string, fallback: number | null): boolean {
  const nextValue = resolveDraftNumber(name, fallback);
  return nextValue !== null && params.stagedEdits[name]?.nextValue === nextValue;
}

function canStage(name: string, fallback: number | null, requireOptions = false): boolean {
  const target = item(name);
  const nextValue = resolveDraftNumber(name, fallback);
  const options = resolveEnumOptions(name);
  if (!target || nextValue === null || target.readOnly === true || actionsBlocked) {
    return false;
  }
  if (requireOptions && options.length === 0) {
    return false;
  }

  return target.value !== nextValue && params.stagedEdits[name]?.nextValue !== nextValue;
}

function stage(name: string, fallback: number | null, requireOptions = false) {
  if (!canStage(name, fallback, requireOptions)) {
    return;
  }

  const target = item(name);
  const nextValue = resolveDraftNumber(name, fallback);
  if (!target || nextValue === null) {
    return;
  }

  paramsStore.stageParameterEdit(target, nextValue);
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
  eyebrow={section.title}
  title="Vehicle-aware protective defaults and loss-of-link actions"
  description="Failsafe actions stay split by the active vehicle family so copter, plane, and rover operators can stage protective defaults without dropping straight into raw parameters. Every change still queues through the shared review tray."
  testId={setupWorkspaceTestIds.failsafeSection}
>
  {#snippet actions()}
    {#if docsUrl}
      <a
        class="rounded-md border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        data-testid={setupWorkspaceTestIds.failsafeDocsLink}
        href={docsUrl}
        rel="noreferrer"
        target="_blank"
      >
        Failsafe docs
      </a>
    {/if}
  {/snippet}

  {#snippet body()}
      <div
        class="grid gap-3 rounded-lg border border-border bg-bg-primary/80 p-3 md:grid-cols-3"
        data-testid={setupWorkspaceTestIds.failsafeSummary}
      >
    <div>
      <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Defaults preview</p>
      <p class="mt-2 text-sm font-semibold text-text-primary" data-testid={setupWorkspaceTestIds.failsafeDefaultsState}>
        {defaultsStateText}
      </p>
      <p class="mt-1 text-sm text-text-secondary">Recommended loss-of-link actions stay inspectable before you queue them.</p>
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Radio / GCS state</p>
      <p class="mt-2 text-sm font-semibold text-text-primary">
        {#if model.family === "plane"}
          {currentValueText(item("THR_FAILSAFE"))} radio · {currentValueText(item("FS_LONG_ACTN"))} GCS
        {:else if model.family === "rover"}
          {currentValueText(item("FS_ACTION"))} · {currentValueText(item("FS_TIMEOUT"))}
        {:else}
          {currentValueText(item("FS_THR_ENABLE"))} radio · {currentValueText(item("FS_GCS_ENABLE"))} GCS
        {/if}
      </p>
      <p class="mt-1 text-sm text-text-secondary">Review the loss-of-link actions for this vehicle family here instead of guessing from generic labels.</p>
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Battery thresholds</p>
      <p class="mt-2 text-sm font-semibold text-text-primary">
        Low {currentValueText(item("BATT_LOW_VOLT"))} · Critical {currentValueText(item("BATT_CRT_VOLT"))}
      </p>
      <p class="mt-1 text-sm text-text-secondary">Low and critical actions remain separate so escalation is visible before flight.</p>
    </div>
  </div>

  {#if model.recoveryReasons.length > 0}
    <div
      class="rounded-lg border border-warning/40 bg-warning/10 px-4 py-4 text-sm leading-6 text-warning"
      data-testid={setupWorkspaceTestIds.failsafeRecovery}
    >
      <p class="font-semibold text-text-primary">Failsafe editors are staying fail-closed until the required metadata and rows are complete.</p>
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

  {#each model.warningTexts as text, index (text)}
    <div
      class="rounded-lg border border-warning/40 bg-warning/10 px-4 py-4 text-sm leading-6 text-warning"
      data-testid={`${setupWorkspaceTestIds.failsafeBannerPrefix}-${index}`}
    >
      {text}
    </div>
  {/each}

  <article class="rounded-lg border border-border bg-bg-primary/80 p-3" data-testid={setupWorkspaceTestIds.failsafePreview}>
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Recommended defaults</p>
        <h4 class="mt-2 text-base font-semibold text-text-primary">Preview safe starting actions</h4>
        <p class="mt-2 text-sm text-text-secondary">
          Stage the audited defaults for the current vehicle family through the shared review tray. You can still keep intentional deviations visible afterwards.
        </p>
      </div>
      <button
        class="rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        onclick={() => (defaultsPreviewOpen = !defaultsPreviewOpen)}
        type="button"
      >
        {defaultsPreviewOpen ? "Hide preview" : "Preview defaults"}
      </button>
    </div>

    {#if defaultsPreviewOpen}
      <div class="mt-4">
        <SetupPreviewStagePanel
          headerLabel="Preview · recommended failsafe defaults"
          onCancel={() => (defaultsPreviewOpen = false)}
          onStage={stageDefaults}
          rows={previewRows}
          stageLabel="Stage recommended defaults"
        />
      </div>
    {/if}
  </article>

  <div class="space-y-3">
    {#each cards as card (card.id)}
      <article class="rounded-lg border border-border bg-bg-primary/80 p-3" data-testid={`${setupWorkspaceTestIds.failsafeCardPrefix}-${card.id}`}>
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">{card.title}</p>
            <h4 class="mt-2 text-base font-semibold text-text-primary">{card.summary}</h4>
          </div>
          {#if card.docsUrl}
            <a class="text-xs font-semibold text-accent hover:underline" href={card.docsUrl} rel="noreferrer" target="_blank">Docs</a>
          {/if}
        </div>

        <div class="mt-4 grid gap-3 xl:grid-cols-2">
          {#each card.fields as field (field.name)}
            <div class="rounded-lg border border-border bg-bg-secondary/60 p-3">
              <label class="text-xs font-semibold uppercase tracking-widest text-text-muted" for={`${card.id}-${field.name}`}>
                {field.label}
              </label>
              <p class="mt-2 text-sm text-text-secondary">{field.description}</p>
              <p class="mt-3 text-xs font-semibold uppercase tracking-widest text-text-muted" data-testid={`${setupWorkspaceTestIds.failsafeCurrentPrefix}-${field.name}`}>
                Current · {currentValueText(item(field.name))}
              </p>
              {#if params.stagedEdits[field.name]}
                <p class="mt-1 text-xs text-accent" data-testid={`${setupWorkspaceTestIds.failsafeStagedPrefix}-${field.name}`}>
                  Queued · {params.stagedEdits[field.name]?.nextValueText}
                </p>
              {/if}

              <div class="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
                {#if field.kind === "enum"}
                  <select
                    class="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
                    data-testid={`${setupWorkspaceTestIds.failsafeInputPrefix}-${field.name}`}
                    disabled={actionsBlocked || resolveEnumOptions(field.name).length === 0 || !item(field.name)}
                    id={`${card.id}-${field.name}`}
                    onchange={(event) => setDraft(field.name, (event.currentTarget as HTMLSelectElement).value)}
                    value={draftValue(field.name, item(field.name)?.value ?? null)}
                  >
                    {#each resolveEnumOptions(field.name) as option (option.code)}
                      <option value={String(option.code)}>{option.label}</option>
                    {/each}
                  </select>
                {:else}
                  <div class="flex items-center gap-2">
                    <input
                      class="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
                      data-testid={`${setupWorkspaceTestIds.failsafeInputPrefix}-${field.name}`}
                      disabled={actionsBlocked || !item(field.name)}
                      id={`${card.id}-${field.name}`}
                      min={field.min}
                      onchange={(event) => setDraft(field.name, (event.currentTarget as HTMLInputElement).value)}
                      step={field.step}
                      type="number"
                      value={draftValue(field.name, item(field.name)?.value ?? null)}
                    />
                    {#if field.unit}
                      <span class="shrink-0 text-xs text-text-muted">{field.unit}</span>
                    {/if}
                  </div>
                {/if}

                <button
                  class="self-end rounded-md border border-border bg-bg-secondary px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid={`${setupWorkspaceTestIds.failsafeStageButtonPrefix}-${field.name}`}
                  disabled={!canStage(field.name, item(field.name)?.value ?? null, field.kind === "enum")}
                  onclick={() => stage(field.name, item(field.name)?.value ?? null, field.kind === "enum")}
                  type="button"
                >
                  {isQueued(field.name, item(field.name)?.value ?? null) ? "Queued" : "Stage"}
                </button>
              </div>
            </div>
          {/each}
        </div>
      </article>
    {/each}
      </div>
  {/snippet}
</SetupSectionShell>
