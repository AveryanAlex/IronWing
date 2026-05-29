<script lang="ts">
import { Home, Route } from "lucide-svelte";
import { fromStore } from "svelte/store";

import {
  getParamsStoreContext,
  getSessionStoreContext,
  getSetupWorkspaceStoreContext,
} from "../../../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../../../data/ardupilot-docs";
import { buildParameterItemIndex, type ParameterItemModel } from "../../../../lib/params/parameter-item-model";
import { buildRtlReturnModel, type SafetyVehicleFamily } from "../../../../lib/setup/failsafe-model";
import type { SetupWorkspaceSection, SetupWorkspaceStoreState } from "../../../../lib/stores/setup-workspace";
import { Eyebrow, HelperText } from "../../../../components/ui";
import SetupFieldStack from "../../../../features/setup/shared/SetupFieldStack.svelte";
import SetupGuideCard from "../../../../features/setup/shared/SetupGuideCard.svelte";
import SetupNoticeList from "../../../../features/setup/shared/SetupNoticeList.svelte";
import SetupParamEditorRow from "../../../../features/setup/shared/SetupParamEditorRow.svelte";
import SetupSectionCard from "../../../../features/setup/shared/SetupSectionCard.svelte";
import SetupSectionShell from "../../../../features/setup/components/SetupSectionShell.svelte";
import { resolveSetupEnumOptions } from "../../../../features/setup/shared/parameter-editing";
import { setupWorkspaceTestIds } from "../../../../features/setup/setup-workspace-test-ids";
import {
  getSetupWorkspaceRouteContext,
  setupRouteSection,
} from "../../../../features/setup/components/setup-workspace-route-context";

const route = getSetupWorkspaceRouteContext();
const viewStore = fromStore(route.viewStore);

let view = $derived(viewStore.current);
let section = $derived(setupRouteSection(view, "rtl_return"));

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
  buildRtlReturnModel({
    vehicleType,
    paramStore: params.paramStore,
    metadata: params.metadata,
    stagedEdits: params.stagedEdits,
  }),
);
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

function visibleFields(fields: RtlFieldConfig[]): RtlFieldConfig[] {
  return fields.filter((field) => item(field.name));
}

function enumOptions(name: string) {
  return resolveSetupEnumOptions(params.metadata?.get(name)?.values);
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

function draftValue(
  name: string,
  fallback: number | null,
  factor: number,
  decimals: number,
  sentinel?: number,
): string {
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

function resolveDraftRawValue(
  name: string,
  fallback: number | null,
  factor: number,
  decimals: number,
  sentinel?: number,
): number | null {
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

function canAutostage(
  field: RtlFieldConfig,
  target: ParameterItemModel | null,
  nextValue: number | null,
): target is ParameterItemModel {
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
  const nextValue =
    field.kind === "enum"
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
  description="Review RTL home, altitude, speed, timing, and final behavior for the active vehicle family. Values are shown in meters, meters per second, and seconds where applicable."
  testId={setupWorkspaceTestIds.rtlReturnSection}
  docs={[{ url: docsUrl, label: "ArduPilot Docs", testId: setupWorkspaceTestIds.rtlReturnDocsLink }]}
>
  {#snippet body()}
    <SetupSectionCard
      icon={Home}
      title="Return summary"
      description="Confirm the active return profile before relying on RTL."
      surface="elevated"
      testId={setupWorkspaceTestIds.rtlReturnSummary}
    >
      <div class="grid gap-3 md:grid-cols-3">
        <div>
          <Eyebrow tracking="widest">Home behavior</Eyebrow>
          <p class="mt-2 text-sm font-semibold text-text-primary">{model.summaryText}</p>
          <HelperText class="mt-1">RTL uses the vehicle home position or rally behavior configured by the firmware.</HelperText>
        </div>
        <div>
          <Eyebrow tracking="widest">Current family</Eyebrow>
          <p class="mt-2 text-sm font-semibold text-text-primary">{model.family}</p>
          <HelperText class="mt-1">Only controls supported by this vehicle family are shown.</HelperText>
        </div>
        <div>
          <Eyebrow tracking="widest">Staged state</Eyebrow>
          <p class="mt-2 text-sm font-semibold text-text-primary">{model.hasPendingChanges ? "RTL edits staged" : "No staged RTL edits"}</p>
          <HelperText class="mt-1">Apply staged return changes before using them operationally.</HelperText>
        </div>
      </div>
    </SetupSectionCard>

  <SetupNoticeList notices={model.warningTexts} tone="warning" testIdPrefix={setupWorkspaceTestIds.rtlReturnBannerPrefix} />

  <div class="space-y-3">
    {#each cards as card (card.id)}
      <SetupSectionCard
        icon={Route}
        title={card.title}
        description={card.summary}
        surface="elevated"
        testId={`${setupWorkspaceTestIds.rtlReturnCardPrefix}-${card.id}`}
      >
        {#if visibleFields(card.fields).length > 0}
          <SetupFieldStack divided>
            {#each visibleFields(card.fields) as field (field.name)}
              <SetupParamEditorRow
                item={item(field.name)}
                id={`${card.id}-${field.name}`}
                label={field.label}
                description={field.description}
                mode={field.kind ?? "number"}
                options={enumOptions(field.name)}
                value={draftValue(field.name, item(field.name)?.value ?? null, field.factor, field.decimals, field.sentinel)}
                stagedEdits={params.stagedEdits}
                stagedTestId={`${setupWorkspaceTestIds.rtlReturnStagedPrefix}-${field.name}`}
                onUnstage={unstage}
                onChange={(value) => stageDraftValue(field, value)}
                inputTestId={`${setupWorkspaceTestIds.rtlReturnInputPrefix}-${field.name}`}
                disabled={actionsBlocked}
                min={field.min}
                step={field.step}
                unit={field.kind === "enum" ? null : field.unit}
              />
            {/each}
          </SetupFieldStack>
        {:else}
          <p class="text-sm text-text-secondary">No matching settings are available for this firmware.</p>
        {/if}
      </SetupSectionCard>
    {/each}

    <SetupGuideCard title="RTL review" description="Check home, altitude, and final behavior together.">
      <p>For copters, confirm climb and final altitude. For planes, confirm return altitude and auto-land behavior. For rovers, confirm return speed and arrival radius.</p>
    </SetupGuideCard>
  </div>
  {/snippet}
</SetupSectionShell>
