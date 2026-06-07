<script lang="ts">
import { Home, Route } from "lucide-svelte";
import { fromStore } from "svelte/store";

import { getParamsStoreContext, getSessionStoreContext } from "../../../../app/shell/runtime-context";
import { resolveDocsUrl } from "../../../../data/ardupilot-docs";
import { buildParameterItemIndex, type ParameterItemModel } from "../../../../lib/params/parameter-item-model";
import { buildRtlReturnModel, type SafetyVehicleFamily } from "../../../../lib/setup/failsafe-model";
import { Eyebrow, HelperText, Input } from "../../../../components/ui";
import SetupGuideCard from "../../../../features/setup/shared/SetupGuideCard.svelte";
import SetupNoticeList from "../../../../features/setup/shared/SetupNoticeList.svelte";
import SetupParamEditCard from "../../../../features/setup/shared/SetupParamEditCard.svelte";
import SetupParamEditGrid from "../../../../features/setup/shared/SetupParamEditGrid.svelte";
import SetupParamSection from "../../../../features/setup/shared/SetupParamSection.svelte";
import SetupSectionCard from "../../../../features/setup/shared/SetupSectionCard.svelte";
import SetupSectionShell from "../../../../features/setup/components/SetupSectionShell.svelte";
import type { SetupParamRef } from "../../../../features/setup/shared/setup-param-refs";
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
};

type RtlLegacyCardConfig = {
  id: string;
  title: string;
  summary: string;
  fields: RtlFieldConfig[];
};

type RtlParamSectionConfig = {
  id: string;
  title: string;
  summary: string;
  params: readonly SetupParamRef[];
};

const copterAltitudeParams = [
  { id: "RTL_ALT_M" },
  { id: "RTL_ALT_FINAL_M" },
  { id: "RTL_CLIMB_MIN_M" },
] satisfies readonly SetupParamRef[];

const copterSpeedParams = [{ id: "RTL_SPEED_MS" }] satisfies readonly SetupParamRef[];

const planeReturnParams = [
  { id: "RTL_ALTITUDE" },
  { id: "RTL_AUTOLAND" },
  { id: "RTL_CLIMB_MIN" },
  { id: "RTL_RADIUS" },
  { id: "Q_RTL_ALT" },
  { id: "Q_RTL_MODE" },
  { id: "Q_RTL_ALT_MIN" },
] satisfies readonly SetupParamRef[];

let paramSections = $derived.by(() => buildParamSections(model.family));
let legacyCards = $derived.by(() =>
  buildLegacyCards(model.family).filter((card) => visibleFields(card.fields).length > 0),
);

function buildParamSections(family: SafetyVehicleFamily): RtlParamSectionConfig[] {
  if (family === "plane") {
    return [
      {
        id: "plane-return",
        title: "Plane return profile",
        summary: `${currentDisplayText("RTL_ALTITUDE", 1, 1, "m")} · ${currentDisplayText("RTL_AUTOLAND", 1, 0, "mode")}`,
        params: planeReturnParams,
      },
    ];
  }

  if (family === "rover") {
    return [
      {
        id: "rover-return",
        title: "Rover return profile",
        summary: `${currentDisplayText("RTL_SPEED", roverSpeedIsDirectUnit() ? 1 : 100, 1, "m/s")} · ${currentDisplayText("WP_RADIUS", 1, 1, "m")}`,
        params: roverSpeedIsDirectUnit() ? [{ id: "RTL_SPEED" }, { id: "WP_RADIUS" }] : [{ id: "WP_RADIUS" }],
      },
    ];
  }

  return [
    {
      id: "altitude-current",
      title: "Altitude profile",
      summary: `${currentDisplayText("RTL_ALT_M", 1, 1, "m")} · ${currentDisplayText("RTL_ALT_FINAL_M", 1, 1, "m")}`,
      params: copterAltitudeParams,
    },
    {
      id: "speed-current",
      title: "Return speed",
      summary: currentDisplayText("RTL_SPEED_MS", 1, 1, "m/s"),
      params: copterSpeedParams,
    },
  ];
}

function buildLegacyCards(family: SafetyVehicleFamily): RtlLegacyCardConfig[] {
  if (family === "plane") {
    return item("RTL_ALTITUDE")
      ? []
      : [
          {
            id: "plane-altitude-legacy",
            title: "Plane return altitude",
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
            ],
          },
        ];
  }

  if (family === "rover") {
    return roverSpeedIsDirectUnit()
      ? []
      : [
          {
            id: "rover-speed-legacy",
            title: "Rover return speed",
            summary: currentDisplayText("RTL_SPEED", 100, 1, "m/s"),
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
            ],
          },
        ];
  }

  const altitudeFieldCandidates: (RtlFieldConfig | null)[] = [
    !item("RTL_ALT_M")
      ? {
          name: "RTL_ALT",
          label: "Return altitude",
          description: "Minimum altitude the copter climbs to before returning. 0 keeps the current altitude.",
          factor: 100,
          decimals: 1,
          unit: "m",
          min: 0,
          step: 1,
        }
      : null,
    !item("RTL_ALT_FINAL_M")
      ? {
          name: "RTL_ALT_FINAL",
          label: "Final altitude",
          description: "Final hover altitude after reaching home. 0 triggers an automatic landing.",
          factor: 100,
          decimals: 1,
          unit: "m",
          min: 0,
          step: 1,
        }
      : null,
    !item("RTL_CLIMB_MIN_M")
      ? {
          name: "RTL_CLIMB_MIN",
          label: "Minimum climb",
          description: "Minimum additional climb before the return leg starts.",
          factor: 1,
          decimals: 0,
          unit: "m",
          min: 0,
          step: 1,
        }
      : null,
  ];
  const altitudeFields = altitudeFieldCandidates.filter(isRtlField);

  const timingFieldCandidates: (RtlFieldConfig | null)[] = [
    !item("RTL_SPEED_MS")
      ? {
          name: "RTL_SPEED",
          label: "Return speed",
          description: "Horizontal speed during the RTL leg. 0 defers to the default waypoint speed.",
          factor: 100,
          decimals: 1,
          unit: "m/s",
          min: 0,
          step: 0.5,
        }
      : null,
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
  ];
  const timingFields = timingFieldCandidates.filter(isRtlField);

  return [
    {
      id: "altitude-legacy",
      title: "Altitude profile",
      summary: `${currentDisplayText("RTL_ALT", 100, 1, "m")} · ${currentDisplayText("RTL_ALT_FINAL", 100, 1, "m")}`,
      fields: altitudeFields,
    },
    {
      id: "timing-legacy",
      title: "Speed and loiter timing",
      summary: `${currentDisplayText("RTL_SPEED", 100, 1, "m/s")} · ${currentDisplayText("RTL_LOIT_TIME", 1000, 1, "s")}`,
      fields: timingFields,
    },
  ];
}

function isRtlField(field: RtlFieldConfig | null): field is RtlFieldConfig {
  return field !== null;
}

function roverSpeedIsDirectUnit(): boolean {
  const speed = item("RTL_SPEED");
  return speed ? isMetersPerSecondUnit(speed.units) : false;
}

function isMetersPerSecondUnit(unit: string | null | undefined): boolean {
  const normalized = unit?.toLowerCase().replace(/\s+/g, "");
  return (
    normalized === "m/s" ||
    normalized === "meter/second" ||
    normalized === "meters/second" ||
    normalized === "meterspersecond"
  );
}

function item(name: string): ParameterItemModel | null {
  return itemIndex.get(name) ?? null;
}

function visibleFields(fields: RtlFieldConfig[]): RtlFieldConfig[] {
  return fields.filter((field) => item(field.name));
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

function displayMax(target: ParameterItemModel, factor: number): number | undefined {
  return target.range?.max === undefined ? undefined : target.range.max / factor;
}

function numericFieldMetadata(field: RtlFieldConfig, target: ParameterItemModel): string {
  const max = displayMax(target, field.factor);
  const range = field.min !== undefined && max !== undefined ? `${field.min}–${max} ${field.unit}` : undefined;
  const step = field.step === undefined ? undefined : `step ${field.step} ${field.unit}`;
  return [field.name, range, step].filter((part) => part !== undefined).join(" · ");
}

function canAutostage(target: ParameterItemModel | null, nextValue: number | null): target is ParameterItemModel {
  if (!target || target.readOnly === true || actionsBlocked || nextValue === null || !Number.isFinite(nextValue)) {
    return false;
  }

  return true;
}

function stageDraftValue(field: RtlFieldConfig, value: string) {
  setDraft(field.name, value);
  const target = item(field.name);
  const nextValue = resolveDraftRawValue(
    field.name,
    target?.value ?? null,
    field.factor,
    field.decimals,
    field.sentinel,
  );

  if (!canAutostage(target, nextValue)) {
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
    {#each paramSections as paramSection (paramSection.id)}
      <SetupParamSection
        id={paramSection.id}
        icon={Route}
        title={paramSection.title}
        description={paramSection.summary}
        params={paramSection.params}
        disabled={actionsBlocked}
        surface="elevated"
        testIdPrefix="setup-workspace-rtl-return"
      />
    {/each}

    {#each legacyCards as card (card.id)}
      <SetupSectionCard
        icon={Route}
        title={card.title}
        description={card.summary}
        surface="elevated"
        testId={`${setupWorkspaceTestIds.rtlReturnCardPrefix}-${card.id}`}
      >
        {#if visibleFields(card.fields).length > 0}
          <SetupParamEditGrid>
            {#each visibleFields(card.fields) as field (field.name)}
              {@const fieldItem = item(field.name)}
              {#if fieldItem}
                {@const fieldValue = draftValue(field.name, fieldItem.value, field.factor, field.decimals, field.sentinel)}
                <SetupParamEditCard
                  item={fieldItem}
                  inputId={`${card.id}-${field.name}`}
                  label={field.label}
                  description={field.description}
                  min={field.min}
                  max={displayMax(fieldItem, field.factor)}
                  step={field.step}
                  unit={field.unit}
                  metadata={numericFieldMetadata(field, fieldItem)}
                  stagedName={params.stagedEdits[field.name] ? field.name : undefined}
                  stagedTestId={`${setupWorkspaceTestIds.rtlReturnStagedPrefix}-${field.name}`}
                  onUnstage={unstage}
                  disabled={actionsBlocked}
                >
                  <div class="flex items-center gap-2">
                    <Input
                      id={`${card.id}-${field.name}`}
                      inputmode="decimal"
                      min={field.min}
                      max={displayMax(fieldItem, field.factor)}
                      step={field.step}
                      type="number"
                      value={fieldValue}
                      disabled={actionsBlocked || fieldItem.readOnly}
                      testId={`${setupWorkspaceTestIds.rtlReturnInputPrefix}-${field.name}`}
                      oninput={(event) => stageDraftValue(field, (event.currentTarget as HTMLInputElement).value)}
                      onchange={(event) => stageDraftValue(field, (event.currentTarget as HTMLInputElement).value)}
                    />
                    <span class="shrink-0 text-xs text-text-muted">{field.unit}</span>
                  </div>
                </SetupParamEditCard>
              {/if}
            {/each}
          </SetupParamEditGrid>
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
