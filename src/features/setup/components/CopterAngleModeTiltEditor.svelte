<script lang="ts">
import { CircleDot, RotateCcw } from "lucide-svelte";

import { Button, Card, EmptyState, Eyebrow, HelperText, MonoValue, NumberInput, Slider } from "../../../components/ui";
import { formatParamValue, type ParameterItemModel } from "../../../lib/params/parameter-item-model";
import {
  degreesToRadians,
  radiansToDegrees,
  rcInputToRollPitchRad,
  resolveCopterTiltCapsDeg,
} from "../../../lib/setup/copter-angle-mode";
import { resolveRcStickMarker, type RcChannelSample } from "../../../lib/setup/rc-input-normalization";
import SetupParamEditCard from "../shared/SetupParamEditCard.svelte";
import SetupParamEditGrid from "../shared/SetupParamEditGrid.svelte";
import { setupWorkspaceTestIds } from "../setup-workspace-test-ids";

type StagedEdit = { nextValue: number };

type Props = {
  itemIndex: ReadonlyMap<string, ParameterItemModel>;
  stagedEdits: Record<string, StagedEdit | undefined>;
  channels: RcChannelSample[];
  disabled?: boolean;
  onStageParameter: (item: ParameterItemModel, value: number) => void;
};

type TiltParameterSpec = {
  name: "ATC_ANGLE_MAX" | "PSC_ANGLE_MAX" | "LOIT_ANG_MAX";
  label: string;
  description: string;
  fallbackMin: number;
  fallbackMax: number;
  fallbackStep: number;
};

type TiltParameterControl = TiltParameterSpec & {
  item: ParameterItemModel;
  currentValue: number;
  draftValue: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  readOnly: boolean;
  changed: boolean;
};

const PREVIEW_CENTER = 110;
const PREVIEW_RADIUS = 86;

const ATC_SPEC: TiltParameterSpec = {
  name: "ATC_ANGLE_MAX",
  label: "Angle-mode tilt cap",
  description: "Maximum pilot-requested lean angle for Stabilize and other angle-based modes.",
  fallbackMin: 10,
  fallbackMax: 80,
  fallbackStep: 0.1,
};

const PSC_SPEC: TiltParameterSpec = {
  name: "PSC_ANGLE_MAX",
  label: "Assisted-mode tilt cap",
  description: "Maximum lean angle the position controller may request. Set 0 to use the ATC angle-mode cap.",
  fallbackMin: 0,
  fallbackMax: 45,
  fallbackStep: 1,
};

const LOIT_SPEC: TiltParameterSpec = {
  name: "LOIT_ANG_MAX",
  label: "Loiter pilot cap",
  description: "Maximum pilot-requested lean in Loiter. Set 0 for the automatic two-thirds assisted-mode cap.",
  fallbackMin: 0,
  fallbackMax: 45,
  fallbackStep: 1,
};

let {
  itemIndex,
  stagedEdits,
  channels,
  disabled = false,
  onStageParameter,
}: Props = $props();

let draftOverrides = $state<Record<string, number>>({});

function resolveValue(name: string): number | null {
  const item = itemIndex.get(name);
  const value = draftOverrides[name] ?? stagedEdits[name]?.nextValue ?? item?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildControl(spec: TiltParameterSpec): TiltParameterControl | null {
  const item = itemIndex.get(spec.name);
  if (!item) {
    return null;
  }

  const min = item.range?.min ?? spec.fallbackMin;
  const max = item.range?.max ?? spec.fallbackMax;
  const step = item.increment ?? spec.fallbackStep;
  const draftValue = clampParameterDraft(resolveValue(spec.name) ?? item.value, min, max, step);

  return {
    ...spec,
    item,
    currentValue: item.value,
    draftValue,
    min,
    max,
    step,
    unit: item.units ?? "deg",
    readOnly: item.readOnly,
    changed: Math.abs(draftValue - item.value) > Math.max(1e-6, step * 0.001),
  };
}

let atcControl = $derived(buildControl(ATC_SPEC));
let pscControl = $derived(buildControl(PSC_SPEC));
let loitControl = $derived(buildControl(LOIT_SPEC));
let advancedControls = $derived([pscControl, loitControl].filter((control): control is TiltParameterControl => control != null));
let controls = $derived([atcControl, ...advancedControls].filter((control): control is TiltParameterControl => control != null));
let changedControls = $derived(controls.filter((control) => control.changed));

let currentCaps = $derived(atcControl
  ? resolveCopterTiltCapsDeg({
      atcAngleMaxDeg: atcControl.currentValue,
      pscAngleMaxDeg: pscControl?.currentValue,
      loitAngleMaxDeg: loitControl?.currentValue,
    })
  : null);
let draftCaps = $derived(atcControl
  ? resolveCopterTiltCapsDeg({
      atcAngleMaxDeg: atcControl.draftValue,
      pscAngleMaxDeg: pscControl?.draftValue,
      loitAngleMaxDeg: loitControl?.draftValue,
    })
  : null);

let liveMarker = $derived.by(() => {
  const roll = resolveRcStickMarker({ role: "roll", mode: "norm_input_dz", channels, itemIndex, resolveValue });
  const pitch = resolveRcStickMarker({ role: "pitch", mode: "norm_input_dz", channels, itemIndex, resolveValue });
  return roll && pitch ? { roll, pitch } : null;
});
let previewTarget = $derived(atcControl
  ? rcInputToRollPitchRad(
      { roll: liveMarker?.roll.stick ?? 0, pitch: liveMarker?.pitch.stick ?? 0 },
      atcControl.draftValue,
    )
  : null);
let previewScaleThrust = $derived(currentCaps && draftCaps
  ? Math.tan(degreesToRadians(Math.max(10, currentCaps.angleModeDeg, draftCaps.angleModeDeg)))
  : 1);
let previewMarker = $derived(previewTarget
  ? {
      x: PREVIEW_CENTER + (previewTarget.thrust.y / previewScaleThrust) * PREVIEW_RADIUS,
      y: PREVIEW_CENTER + (previewTarget.thrust.x / previewScaleThrust) * PREVIEW_RADIUS,
    }
  : null);

function ringRadius(angleDeg: number): number {
  return (Math.tan(degreesToRadians(angleDeg)) / previewScaleThrust) * PREVIEW_RADIUS;
}

function updateControl(control: TiltParameterControl, value: number) {
  if (disabled || control.readOnly || !Number.isFinite(value)) {
    return;
  }

  draftOverrides = {
    ...draftOverrides,
    [control.name]: clampParameterDraft(value, control.min, control.max, control.step),
  };
}

function handleNumberInput(control: TiltParameterControl, event: Event) {
  updateControl(control, Number((event.currentTarget as HTMLInputElement).value));
}

function resetDraft() {
  draftOverrides = {};
}

function stageDraft() {
  if (disabled) {
    return;
  }

  for (const control of changedControls) {
    if (!control.readOnly) {
      onStageParameter(control.item, control.draftValue);
    }
  }
}

function clampParameterDraft(value: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, value));
  const rounded = Math.round(clamped / step) * step;
  const decimals = Math.max(0, Math.min(8, Math.ceil(-Math.log10(step)) + 2));
  return Number(rounded.toFixed(decimals));
}

function formatDegrees(value: number): string {
  return `${formatParamValue(value, 0.1)}°`;
}

function formatControlValue(control: TiltParameterControl, value: number): string {
  return `${formatParamValue(value, control.step)} ${control.unit}`;
}
</script>

{#snippet parameterControl(control: TiltParameterControl)}
  <SetupParamEditCard
    item={control.item}
    inputId={`copter-tilt-control-${control.name}`}
    label={control.label}
    description={control.description}
    type="custom"
    min={control.min}
    max={control.max}
    step={control.step}
    unit={control.unit}
    metadata={control.name}
    {disabled}
  >
    <div class="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(9rem,12rem)] sm:items-center">
      <Slider
        value={control.draftValue}
        min={control.min}
        max={control.max}
        step={control.step}
        disabled={disabled || control.readOnly}
        ariaLabel={control.label}
        testId={`${setupWorkspaceTestIds.rcTiltInputPrefix}-${control.name}-slider`}
        onValueChange={(value) => updateControl(control, value)}
      />
      <NumberInput
        id={`copter-tilt-control-${control.name}`}
        value={control.draftValue}
        min={control.min}
        max={control.max}
        step={control.step}
        unit={control.unit}
        disabled={disabled || control.readOnly}
        testId={`${setupWorkspaceTestIds.rcTiltInputPrefix}-${control.name}`}
        oninput={(event) => handleNumberInput(control, event)}
        onchange={(event) => handleNumberInput(control, event)}
      />
    </div>
  </SetupParamEditCard>
{/snippet}

{#if !atcControl || !currentCaps || !draftCaps}
  <EmptyState
    title="Copter tilt envelope unavailable"
    description="This firmware did not expose ATC_ANGLE_MAX, so there is no Copter angle-mode tilt envelope to edit."
    testId={setupWorkspaceTestIds.rcTiltUnavailable}
  />
{:else}
  <div class="min-w-0 space-y-4" data-testid={setupWorkspaceTestIds.rcTiltCard}>
    <div class="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div class="grid min-w-0 gap-3 rounded-lg border border-border bg-bg-secondary p-3">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <CircleDot size={16} class="text-accent" aria-hidden="true" />
            <p class="text-sm font-semibold text-text-primary">Live roll / pitch target</p>
          </div>
          <HelperText class="mt-1" size="xs">
            Deadzone-normalized RC input is projected through ArduPilot's circular thrust-vector cap.
          </HelperText>
        </div>

        <div class="mx-auto w-full max-w-64">
          <svg
            class="h-auto w-full"
            viewBox="0 0 220 220"
            role="img"
            aria-label="Roll and pitch stick disk with current and draft Copter tilt envelopes"
            data-testid={setupWorkspaceTestIds.rcTiltPreview}
          >
            <circle cx={PREVIEW_CENTER} cy={PREVIEW_CENTER} r={PREVIEW_RADIUS} class="fill-bg-primary stroke-border" stroke-width="2" />
            <line x1="24" y1={PREVIEW_CENTER} x2="196" y2={PREVIEW_CENTER} class="stroke-border" stroke-width="1" />
            <line x1={PREVIEW_CENTER} y1="24" x2={PREVIEW_CENTER} y2="196" class="stroke-border" stroke-width="1" />
            <circle cx={PREVIEW_CENTER} cy={PREVIEW_CENTER} r={ringRadius(currentCaps.angleModeDeg)} class="fill-none stroke-text-muted" stroke-width="2" stroke-dasharray="5 5" />
            <circle cx={PREVIEW_CENTER} cy={PREVIEW_CENTER} r={ringRadius(draftCaps.angleModeDeg)} class="fill-accent/10 stroke-accent" stroke-width="3" />
            {#if liveMarker && previewMarker}
              <line x1={PREVIEW_CENTER} y1={PREVIEW_CENTER} x2={previewMarker.x} y2={previewMarker.y} class="stroke-accent/70" stroke-width="2" />
              <circle cx={previewMarker.x} cy={previewMarker.y} r="7" class="fill-accent stroke-bg-primary" stroke-width="3" data-testid={setupWorkspaceTestIds.rcTiltMarker} />
            {/if}
          </svg>
        </div>

        <div class="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-text-secondary">
          <span class="inline-flex items-center gap-2"><span class="size-3 rounded-full border-2 border-dashed border-text-muted"></span>Current {formatDegrees(currentCaps.angleModeDeg)}</span>
          <span class="inline-flex items-center gap-2"><span class="size-3 rounded-full border-2 border-accent bg-accent/10"></span>Draft {formatDegrees(draftCaps.angleModeDeg)}</span>
        </div>

        {#if liveMarker && previewTarget}
          <p class="text-center text-xs text-text-secondary">
            Roll CH{liveMarker.roll.channel} {Math.round(liveMarker.roll.stick * 100)}% · Pitch CH{liveMarker.pitch.channel} {Math.round(liveMarker.pitch.stick * 100)}% · target {formatDegrees(radiansToDegrees(previewTarget.rollRad))} roll / {formatDegrees(radiansToDegrees(previewTarget.pitchRad))} pitch{liveMarker.roll.stale || liveMarker.pitch.stale ? " · stale" : ""}
          </p>
        {:else}
          <p class="text-center text-xs text-text-muted">Live roll / pitch stick marker unavailable until mapped RC channels are present.</p>
        {/if}
      </div>

      <div class="grid min-w-0 content-start gap-3">
        <SetupParamEditGrid>
          {@render parameterControl(atcControl)}
        </SetupParamEditGrid>

        {#if advancedControls.length > 0}
          <details class="rounded-lg border border-border bg-bg-secondary p-3">
            <summary class="cursor-pointer text-sm font-semibold text-text-primary">Advanced assisted-mode caps</summary>
            <SetupParamEditGrid class="mt-3">
              {#each advancedControls as control (control.name)}
                {@render parameterControl(control)}
              {/each}
            </SetupParamEditGrid>
          </details>
        {/if}
      </div>
    </div>

    <div class="grid gap-3 rounded-lg border border-border bg-bg-secondary p-3 sm:grid-cols-3">
      <div>
        <Eyebrow>Angle modes</Eyebrow>
        <p class="mt-1 text-sm font-semibold text-text-primary">{formatDegrees(currentCaps.angleModeDeg)} → {formatDegrees(draftCaps.angleModeDeg)}</p>
        <p class="mt-1 text-xs text-text-secondary">Stabilize-style target tilt cap.</p>
      </div>
      <div>
        <Eyebrow>Assisted modes</Eyebrow>
        <p class="mt-1 text-sm font-semibold text-text-primary">{formatDegrees(currentCaps.assistedModeDeg)} → {formatDegrees(draftCaps.assistedModeDeg)}</p>
        <p class="mt-1 text-xs text-text-secondary">{draftCaps.pscUsesAtc ? "PSC uses the ATC cap." : "PSC applies a narrower position-control cap."}</p>
      </div>
      <div>
        <Eyebrow>Loiter pilot input</Eyebrow>
        <p class="mt-1 text-sm font-semibold text-text-primary">{formatDegrees(currentCaps.loiterPilotDeg)} → {formatDegrees(draftCaps.loiterPilotDeg)}</p>
        <p class="mt-1 text-xs text-text-secondary">{draftCaps.loiterUsesAutomatic ? "Automatic: two thirds of the assisted-mode cap." : "Explicit LOIT_ANG_MAX cap."}</p>
      </div>
    </div>

    <HelperText>
      Stabilize and other angle-based modes map roll / pitch stick position to target tilt. Loiter interprets that pilot tilt request as horizontal acceleration. This editor changes the tilt envelope, not roll / pitch expo.
    </HelperText>

    <Card.Root surface="default" density="compact" tone="info" appearance="solid">
      <div class="flex items-start justify-between gap-3 max-sm:flex-col">
        <div>
          <Eyebrow>Staged native parameters</Eyebrow>
          <p class="mt-1 text-sm text-text-secondary">
            {changedControls.length === 0
              ? "No Copter tilt envelope changes in the draft."
              : `${changedControls.length} parameter${changedControls.length === 1 ? "" : "s"} will be staged for review.`}
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <Button size="sm" tone="accent" variant="soft" disabled={disabled || changedControls.length === 0} onclick={stageDraft} testId={setupWorkspaceTestIds.rcTiltStage}>
            Stage tilt caps
          </Button>
          <Button size="sm" tone="neutral" variant="ghost" disabled={disabled} onclick={resetDraft} testId={setupWorkspaceTestIds.rcTiltReset}>
            <RotateCcw size={14} aria-hidden="true" />
            Reset draft
          </Button>
        </div>
      </div>

      <div class="mt-3 grid gap-1">
        {#each controls as control (control.name)}
          <div class="grid gap-2 rounded-lg px-2 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_minmax(7rem,auto)_auto] sm:items-center {control.changed ? 'bg-accent/10 text-text-primary' : 'text-text-muted'}">
            <span class="font-medium">{control.label}</span>
            <span class="text-text-secondary">{formatControlValue(control, control.currentValue)} → {formatControlValue(control, control.draftValue)}</span>
            <MonoValue size="xs" tone="muted" wrap>{control.name}</MonoValue>
          </div>
        {/each}
      </div>
    </Card.Root>
  </div>
{/if}
