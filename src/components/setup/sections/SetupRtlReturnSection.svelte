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
  buildRtlReturnModel,
  type SafetyVehicleFamily,
} from "../../../lib/setup/failsafe-model";
import type {
  SetupWorkspaceSection,
  SetupWorkspaceStoreState,
} from "../../../lib/stores/setup-workspace";
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
let model = $derived(buildRtlReturnModel({
  vehicleType,
  paramStore: params.paramStore,
  metadata: params.metadata,
  stagedEdits: params.stagedEdits,
}));
let docsUrl = $derived(resolveDocsUrl("rtl_mode", model.vehicleSlug));
let sectionCanConfirm = $derived(!actionsBlocked && model.canConfirm);

type RtlFieldConfig = {
  name: string;
  label: string;
  description: string;
  factor: number;
  decimals: number;
  unit: string;
  min?: number;
  step?: number;
  sentinel?: number;
  kind?: "number" | "enum";
};

type RtlCardConfig = {
  id: string;
  title: string;
  summary: string;
  fields: RtlFieldConfig[];
};

let cards = $derived.by(() => buildCards(model.family));

$effect(() => {
  if (sectionCanConfirm) {
    setupWorkspaceStore.confirmSection("rtl_return");
  } else {
    setupWorkspaceStore.clearSectionConfirmation("rtl_return");
  }
});

function buildCards(family: SafetyVehicleFamily): RtlCardConfig[] {
  if (family === "plane") {
    return [
      {
        id: "plane-return",
        title: "Plane return profile",
        summary: currentDisplayText("ALT_HOLD_RTL", 100, 1, "m", -1),
        fields: [
          {
            name: "ALT_HOLD_RTL",
            label: "Return altitude",
            description: "Altitude used during plane RTL. Set to -1 to hold the current altitude.",
            factor: 100,
            decimals: 1,
            unit: "m",
            min: -1,
            step: 1,
            sentinel: -1,
          },
          {
            name: "RTL_AUTOLAND",
            label: "Auto-land behavior",
            description: "How the plane should finish the RTL after reaching home.",
            factor: 1,
            decimals: 0,
            unit: "mode",
            kind: "enum",
          },
        ],
      },
    ];
  }

  if (family === "rover") {
    return [
      {
        id: "rover-return",
        title: "Rover return profile",
        summary: `${currentDisplayText("RTL_SPEED", 100, 1, "m/s")} · ${currentDisplayText("WP_RADIUS", 1, 1, "m")}`,
        fields: [
          {
            name: "RTL_SPEED",
            label: "Return speed",
            description: "Ground speed during the rover return-to-home behavior.",
            factor: 100,
            decimals: 1,
            unit: "m/s",
            min: 0,
            step: 0.5,
          },
          {
            name: "WP_RADIUS",
            label: "Approach radius",
            description: "Distance from home at which the rover considers the return complete.",
            factor: 1,
            decimals: 1,
            unit: "m",
            min: 0,
            step: 0.5,
          },
        ],
      },
    ];
  }

  return [
    {
      id: "altitude",
      title: "Altitude profile",
      summary: `${currentDisplayText("RTL_ALT", 100, 1, "m")} · ${currentDisplayText("RTL_ALT_FINAL", 100, 1, "m")}`,
      fields: [
        {
          name: "RTL_ALT",
          label: "Return altitude",
          description: "Minimum altitude the copter climbs to before returning. 0 keeps the current altitude.",
          factor: 100,
          decimals: 1,
          unit: "m",
          min: 0,
          step: 1,
        },
        {
          name: "RTL_ALT_FINAL",
          label: "Final altitude",
          description: "Final hover altitude after reaching home. 0 triggers an automatic landing.",
          factor: 100,
          decimals: 1,
          unit: "m",
          min: 0,
          step: 1,
        },
        {
          name: "RTL_CLIMB_MIN",
          label: "Minimum climb",
          description: "Minimum additional climb before the return leg starts.",
          factor: 1,
          decimals: 0,
          unit: "m",
          min: 0,
          step: 1,
        },
      ],
    },
    {
      id: "timing",
      title: "Speed and loiter timing",
      summary: `${currentDisplayText("RTL_SPEED", 100, 1, "m/s")} · ${currentDisplayText("RTL_LOIT_TIME", 1000, 1, "s")}`,
      fields: [
        {
          name: "RTL_SPEED",
          label: "Return speed",
          description: "Horizontal speed during the RTL leg. 0 defers to the default waypoint speed.",
          factor: 100,
          decimals: 1,
          unit: "m/s",
          min: 0,
          step: 0.5,
        },
        {
          name: "RTL_LOIT_TIME",
          label: "Loiter time",
          description: "Hover time above home before the final descent or landing step begins.",
          factor: 1000,
          decimals: 1,
          unit: "s",
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

function enumOptions(name: string) {
  const values = params.metadata?.get(name)?.values;
  if (!Array.isArray(values)) {
    return [];
  }

  return values.filter((entry) => Number.isFinite(entry.code) && entry.label.trim().length > 0);
}

function formatDisplayValue(rawValue: number | null, factor: number, decimals: number, sentinel?: number): string {
  if (rawValue === null || !Number.isFinite(rawValue)) {
    return "--";
  }

  if (sentinel !== undefined && rawValue === sentinel) {
    return String(sentinel);
  }

  return (rawValue / factor).toFixed(decimals);
}

function currentDisplayText(name: string, factor: number, decimals: number, unit: string, sentinel?: number): string {
  const current = item(name)?.value ?? null;
  const label = item(name)?.valueLabel;
  if (label) {
    return label;
  }

  const value = formatDisplayValue(current, factor, decimals, sentinel);
  return value === "--" ? value : `${value} ${unit}`;
}

function draftValue(name: string, fallback: number | null, factor: number, decimals: number, sentinel?: number): string {
  if (draftValues[name] !== undefined) {
    return draftValues[name];
  }

  const stagedValue = params.stagedEdits[name]?.nextValue;
  const resolved = typeof stagedValue === "number" && Number.isFinite(stagedValue) ? stagedValue : fallback;
  if (resolved === null) {
    return "";
  }

  if (sentinel !== undefined && resolved === sentinel) {
    return String(sentinel);
  }

  return (resolved / factor).toFixed(decimals);
}

function setDraft(name: string, value: string) {
  draftValues = {
    ...draftValues,
    [name]: value,
  };
}

function resolveDraftRawValue(name: string, fallback: number | null, factor: number, decimals: number, sentinel?: number): number | null {
  const raw = draftValue(name, fallback, factor, decimals, sentinel).trim();
  if (raw.length === 0) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (sentinel !== undefined && parsed === sentinel) {
    return sentinel;
  }

  return Math.round(parsed * factor);
}

function currentFallback(name: string): number | null {
  return item(name)?.value ?? null;
}

function canAutostage(field: RtlFieldConfig, target: ParameterItemModel | null, nextValue: number | null): target is ParameterItemModel {
  if (!target || target.readOnly === true || actionsBlocked || nextValue === null || !Number.isFinite(nextValue)) {
    return false;
  }

  if (field.kind === "enum" && enumOptions(field.name).length === 0) {
    return false;
  }

  return true;
}

function stageDraftValue(field: RtlFieldConfig, value: string) {
  setDraft(field.name, value);
  const target = item(field.name);
  const nextValue = field.kind === "enum"
    ? Number(value)
    : resolveDraftRawValue(field.name, target?.value ?? null, field.factor, field.decimals, field.sentinel);

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
</script>

<SetupSectionShell
  sectionId={section.id}
  eyebrow={section.title}
  title="Return-home behavior in operator-facing units"
  description="RTL / Return keeps altitude, speed, timing, and landing behavior in purpose-built cards for the active vehicle family. The UI speaks in meters, meters per second, and seconds while the shared review tray still carries the raw parameter writes underneath."
  testId={setupWorkspaceTestIds.rtlReturnSection}
>
  {#snippet actions()}
    {#if docsUrl}
      <a
        class="rounded-md border border-border bg-bg-primary/80 px-4 py-2 text-sm font-semibold text-text-primary transition hover:border-accent hover:text-accent"
        data-testid={setupWorkspaceTestIds.rtlReturnDocsLink}
        href={docsUrl}
        rel="noreferrer"
        target="_blank"
      >
        RTL docs
      </a>
    {/if}
  {/snippet}

  {#snippet body()}
      <div
        class="grid gap-3 rounded-lg border border-border bg-bg-primary/80 p-3 md:grid-cols-3"
        data-testid={setupWorkspaceTestIds.rtlReturnSummary}
      >
    <div>
      <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Return summary</p>
      <p class="mt-2 text-sm font-semibold text-text-primary">{model.summaryText}</p>
      <p class="mt-1 text-sm text-text-secondary">{model.detailText}</p>
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Current family</p>
      <p class="mt-2 text-sm font-semibold text-text-primary">{model.family}</p>
      <p class="mt-1 text-sm text-text-secondary">Only the parameters that make sense for this vehicle family remain in the purpose-built card.</p>
    </div>
    <div>
      <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">Stage state</p>
      <p class="mt-2 text-sm font-semibold text-text-primary">{model.hasPendingChanges ? "Queued changes present" : "No queued RTL edits"}</p>
      <p class="mt-1 text-sm text-text-secondary">Return changes remain unconfirmed until the shared review tray is clear and metadata is complete.</p>
    </div>
  </div>

  {#if model.recoveryReasons.length > 0}
    <div
      class="rounded-lg border border-warning/40 bg-warning/10 px-4 py-4 text-sm leading-6 text-warning"
      data-testid={setupWorkspaceTestIds.rtlReturnRecovery}
    >
      <p class="font-semibold text-text-primary">RTL / Return is staying fail-closed while required rows are partial.</p>
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
      data-testid={`${setupWorkspaceTestIds.rtlReturnBannerPrefix}-${index}`}
    >
      {text}
    </div>
  {/each}

  <div class="space-y-3">
    {#each cards as card (card.id)}
      <article class="rounded-lg border border-border bg-bg-primary/80 p-3" data-testid={`${setupWorkspaceTestIds.rtlReturnCardPrefix}-${card.id}`}>
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
                    testId={`${setupWorkspaceTestIds.rtlReturnStagedPrefix}-${field.name}`}
                  />
                {/if}
              </div>
              <p class="mt-2 text-sm text-text-secondary">{field.description}</p>
              <p class="mt-3 text-xs font-semibold uppercase tracking-widest text-text-muted" data-testid={`${setupWorkspaceTestIds.rtlReturnCurrentPrefix}-${field.name}`}>
                Current · {#if field.kind === "enum"}{item(field.name)?.valueLabel ?? item(field.name)?.valueText ?? "Unavailable"}{:else}{currentDisplayText(field.name, field.factor, field.decimals, field.unit, field.sentinel)}{/if}
              </p>

              <div class="mt-4">
                {#if field.kind === "enum"}
                  <select
                    class="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
                    data-testid={`${setupWorkspaceTestIds.rtlReturnInputPrefix}-${field.name}`}
                    disabled={actionsBlocked || enumOptions(field.name).length === 0 || !item(field.name)}
                    id={`${card.id}-${field.name}`}
                    onchange={(event) => stageDraftValue(field, (event.currentTarget as HTMLSelectElement).value)}
                    value={draftValue(field.name, item(field.name)?.value ?? null, 1, 0, field.sentinel)}
                  >
                    {#each enumOptions(field.name) as option (option.code)}
                      <option value={String(option.code)}>{option.label}</option>
                    {/each}
                  </select>
                {:else}
                  <div class="flex items-center gap-2">
                    <input
                      class="w-full rounded-lg border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary"
                      data-testid={`${setupWorkspaceTestIds.rtlReturnInputPrefix}-${field.name}`}
                      disabled={actionsBlocked || !item(field.name)}
                      id={`${card.id}-${field.name}`}
                      min={field.min}
                      onchange={(event) => stageDraftValue(field, (event.currentTarget as HTMLInputElement).value)}
                      oninput={(event) => stageDraftValue(field, (event.currentTarget as HTMLInputElement).value)}
                      step={field.step}
                      type="number"
                      value={draftValue(field.name, item(field.name)?.value ?? null, field.factor, field.decimals, field.sentinel)}
                    />
                    <span class="shrink-0 text-xs text-text-muted">{field.unit}</span>
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
